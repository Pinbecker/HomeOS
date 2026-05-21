import { and, asc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { ulid } from 'ulid'
import { db } from '@/lib/db'
import {
  aiConversations,
  aiJobs,
  entityLinks,
  items,
  listItems,
  lists,
  records,
  reminders,
  users,
  type AiConversationMessage,
  type AiJobStatus,
  type AiSourceType,
  type ItemType,
  type RecordCategory,
  type RecordField,
} from '@/lib/db/schema'
import { loadAiPlanningContext } from './context'
import { planAiCapture } from './planner'
import { aiPlanSchema } from './schemas'
import type { AiAction, AiPlan } from './schemas'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

type SessionUser = {
  id: string
  name: string
  email: string
}

export type AiCaptureRequest = {
  rawInput: string
  inputType: 'text' | 'voice'
  sourceType: AiSourceType
  sourceContext?: Record<string, unknown>
  transcriptConfidence?: number | null
  originItemId?: string | null
  conversationId?: string | null
  previousMessages?: AiConversationMessage[]
}

export type AiCaptureResult = {
  jobId: string
  conversationId: string | null
  plan: AiPlan
  appliedActions: Array<Record<string, unknown>>
  inboxItem: { id: string; title: string } | null
}

function statusForPlan(plan: AiPlan, appliedCount: number): AiJobStatus {
  if (plan.result === 'needs_clarification') return 'needs_clarification'
  if (appliedCount > 0) return 'applied'
  if (plan.result === 'capture_to_inbox' || plan.result === 'unknown') return 'planned'
  return 'planned'
}

function toAiMetadata(jobId: string, plan: AiPlan) {
  return {
    ai: {
      jobId,
      result: plan.result,
      response: plan.response,
      originalWording: plan.originalWording,
      planningConfidence: plan.planningConfidence,
      entityResolutionConfidence: plan.entityResolutionConfidence,
      inferredTags: plan.inferredTags,
      relatedEntityIds: plan.relatedEntityIds,
      clarificationQuestion: plan.clarificationQuestion,
      clarificationOptions: plan.clarificationOptions,
      confirmationSummary: plan.confirmationSummary,
      updatedAt: new Date().toISOString(),
    },
  }
}

function firstMeaningfulLine(value: string) {
  const line = value.split(/\r?\n/).map(part => part.trim()).find(Boolean) ?? value.trim()
  return line.length > 90 ? `${line.slice(0, 87)}...` : line
}

function parseDate(value: string | null) {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return null
  return new Date(timestamp)
}

async function findList(action: AiAction, type: 'tasks' | 'shopping') {
  const rows = await db.query.lists.findMany({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, type), eq(lists.archived, false)),
    orderBy: [asc(lists.sortOrder), asc(lists.name)],
  })

  if (action.listName) {
    const named = rows.find(row => row.name.toLowerCase() === action.listName!.toLowerCase())
    if (named) return named

    if (type === 'shopping') {
      const id = ulid()
      const now = new Date()
      await db.insert(lists).values({
        id,
        householdId: HOUSEHOLD_ID,
        name: action.listName.trim(),
        type: 'shopping',
        color: '#34C759',
        archived: false,
        sortOrder: Date.now(),
        createdAt: now,
        updatedAt: now,
      })
      return await db.query.lists.findFirst({ where: eq(lists.id, id) }) ?? null
    }
  }

  return rows[0] ?? null
}

async function findAssigneeId(action: AiAction, currentUser: SessionUser) {
  if (!action.assigneeName) return null
  const name = action.assigneeName.trim().toLowerCase()
  if (!name) return null
  if (name === 'me' || currentUser.name.toLowerCase().startsWith(name)) return currentUser.id

  const userRows = await db.query.users.findMany({
    columns: { id: true, name: true },
    orderBy: [asc(users.name)],
  })

  const exact = userRows.find(user => user.name.toLowerCase() === name)
  if (exact) return exact.id

  const firstName = userRows.find(user => user.name.split(' ')[0]?.toLowerCase() === name)
  return firstName?.id ?? null
}

function cleanFields(fields: RecordField[]) {
  return fields
    .map(field => ({ label: field.label.trim(), value: field.value.trim() }))
    .filter(field => field.label || field.value)
}

function mergeFields(existing: RecordField[], incoming: RecordField[]) {
  const merged = [...existing]
  for (const field of cleanFields(incoming)) {
    const index = merged.findIndex(item => item.label.toLowerCase() === field.label.toLowerCase())
    if (index >= 0) merged[index] = field
    else merged.push(field)
  }
  return merged
}

async function applyAction(action: AiAction, user: SessionUser, jobId: string) {
  const now = new Date()
  const id = ulid()

  if (action.type === 'create_task' && action.title) {
    const list = await findList(action, 'tasks')
    const assigneeId = await findAssigneeId(action, user)
    await db.insert(items).values({
      id,
      householdId: HOUSEHOLD_ID,
      createdById: user.id,
      assigneeId,
      type: 'task',
      title: action.title.trim(),
      body: action.body?.trim() || null,
      status: 'active',
      listId: list?.id ?? null,
      dueDate: parseDate(action.dueDate),
      metadata: { ai: { jobId, originalWording: action.body ?? action.title } },
      createdAt: now,
      updatedAt: now,
    })
    return { type: action.type, entityType: 'item', entityId: id, title: action.title }
  }

  if (action.type === 'create_note' && action.title) {
    await db.insert(items).values({
      id,
      householdId: HOUSEHOLD_ID,
      createdById: user.id,
      type: 'note',
      title: action.title.trim(),
      body: action.body?.trim() || null,
      status: 'active',
      metadata: { ai: { jobId, originalWording: action.body ?? action.title } },
      createdAt: now,
      updatedAt: now,
    })
    return { type: action.type, entityType: 'item', entityId: id, title: action.title }
  }

  if (action.type === 'create_shopping_item' && action.title) {
    const list = await findList(action, 'shopping')
    if (!list) return null
    await db.insert(listItems).values({
      id,
      listId: list.id,
      title: action.title.trim(),
      sortOrder: Date.now(),
      checked: false,
      createdAt: now,
    })
    return { type: action.type, entityType: 'list_item', entityId: id, title: action.title, listId: list.id }
  }

  if (action.type === 'create_record' && action.recordCategory && action.recordTitle) {
    await db.insert(records).values({
      id,
      householdId: HOUSEHOLD_ID,
      category: action.recordCategory as RecordCategory,
      title: action.recordTitle.trim(),
      subtitle: null,
      fields: cleanFields(action.fields),
      notes: action.body?.trim() || null,
      sortOrder: Date.now(),
      createdAt: now,
      updatedAt: now,
    })
    return { type: action.type, entityType: 'record', entityId: id, title: action.recordTitle }
  }

  if (action.type === 'update_record' && action.recordId) {
    const existing = await db.query.records.findFirst({ where: eq(records.id, action.recordId) })
    if (!existing) return null
    await db.update(records)
      .set({
        fields: mergeFields(existing.fields ?? [], action.fields),
        notes: action.body ? [existing.notes, action.body.trim()].filter(Boolean).join('\n\n') : existing.notes,
        updatedAt: now,
      })
      .where(eq(records.id, action.recordId))
    return { type: action.type, entityType: 'record', entityId: action.recordId, title: existing.title }
  }

  if (action.type === 'create_reminder' && action.reminderDate) {
    const entityId = action.recordId ?? action.toEntityId ?? action.fromEntityId
    if (!entityId) return null
    await db.insert(reminders).values({
      id,
      householdId: HOUSEHOLD_ID,
      createdById: user.id,
      entityType: 'record',
      entityId,
      message: action.reminderMessage ?? action.title,
      triggerAt: parseDate(action.reminderDate) ?? now,
      createdAt: now,
    })
    return { type: action.type, entityType: 'reminder', entityId: id, title: action.reminderMessage ?? action.title }
  }

  if (action.type === 'link_entities' && action.fromEntityId && action.toEntityId) {
    await db.insert(entityLinks).values({
      id,
      fromType: 'item',
      fromId: action.fromEntityId,
      toType: 'record',
      toId: action.toEntityId,
      linkType: 'related_to',
      createdById: user.id,
      createdAt: now,
    })
    return { type: action.type, entityType: 'entity_link', entityId: id }
  }

  return null
}

async function applySafeActions(plan: AiPlan, user: SessionUser, jobId: string) {
  if (plan.result !== 'apply_actions') return []
  if (plan.planningConfidence === 'low') return []

  const applied = []
  for (const action of plan.actions) {
    if (action.confidence === 'low') continue
    const result = await applyAction(action, user, jobId)
    if (result) applied.push(result)
  }
  return applied
}

async function createInboxItemForPlan(plan: AiPlan, user: SessionUser, jobId: string, originItemId?: string | null) {
  if (originItemId) {
    await db.update(items)
      .set({
        metadata: toAiMetadata(jobId, plan),
        updatedAt: new Date(),
      })
      .where(eq(items.id, originItemId))
    return null
  }

  const action = plan.actions.find(item => item.type === 'create_inbox_item')
  const title = action?.title?.trim() || firstMeaningfulLine(plan.originalWording)
  const body = action?.body?.trim() || plan.originalWording
  const now = new Date()
  const id = ulid()

  await db.insert(items).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: user.id,
    type: 'inbox',
    title,
    body,
    status: 'active',
    metadata: toAiMetadata(jobId, plan),
    createdAt: now,
    updatedAt: now,
  })

  return { id, title }
}

async function createConversationIfNeeded(
  plan: AiPlan,
  user: SessionUser,
  jobId: string,
  originItemId?: string | null,
  existingConversationId?: string | null,
) {
  const needsConversation = plan.result === 'needs_clarification'
  if (!needsConversation && !existingConversationId) return null

  const now = new Date()
  if (existingConversationId) {
    const existing = await db.query.aiConversations.findFirst({ where: eq(aiConversations.id, existingConversationId) })
    const messages = existing?.messages ?? []
    await db.update(aiConversations)
      .set({
        originJobId: jobId,
        status: needsConversation ? 'open' : 'applied',
        messages: [
          ...messages,
          { role: 'assistant', content: plan.clarificationQuestion || plan.response, createdAt: now.toISOString() },
        ],
        updatedAt: now,
      })
      .where(eq(aiConversations.id, existingConversationId))
    return existingConversationId
  }

  const id = ulid()
  const messages: AiConversationMessage[] = [
    { role: 'user', content: plan.originalWording, createdAt: now.toISOString() },
    { role: 'assistant', content: plan.clarificationQuestion || plan.response, createdAt: now.toISOString() },
  ]

  await db.insert(aiConversations).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: user.id,
    originJobId: jobId,
    originItemId: originItemId ?? null,
    status: 'open',
    messages,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

function revalidateAiSurfaces() {
  revalidatePath('/')
  revalidatePath('/inbox')
  revalidatePath('/household/tasks')
  revalidatePath('/household/shopping')
  revalidatePath('/notes')
  revalidatePath('/life')
}

export async function runAiCapture(request: AiCaptureRequest, user: SessionUser): Promise<AiCaptureResult> {
  const now = new Date()
  const jobId = ulid()

  await db.insert(aiJobs).values({
    id: jobId,
    householdId: HOUSEHOLD_ID,
    createdById: user.id,
    inputType: request.inputType,
    sourceType: request.sourceType,
    sourceContext: request.sourceContext ?? null,
    relatedEntityIds: [],
    transcriptConfidence: request.transcriptConfidence ?? null,
    rawInput: request.rawInput,
    status: 'captured',
    createdAt: now,
    updatedAt: now,
  })

  try {
    const context = await loadAiPlanningContext(user)
    const plan = await planAiCapture({
      rawInput: request.rawInput,
      context,
      previousMessages: request.previousMessages,
      sourceHint: request.sourceType,
    })
    const appliedActions = await applySafeActions(plan, user, jobId)
    const shouldCaptureInbox =
      plan.result === 'capture_to_inbox' ||
      plan.result === 'unknown' ||
      plan.result === 'needs_clarification' ||
      appliedActions.length === 0

    const inboxItem = shouldCaptureInbox
      ? await createInboxItemForPlan(plan, user, jobId, request.originItemId)
      : null

    const conversationId = await createConversationIfNeeded(
      plan,
      user,
      jobId,
      request.originItemId ?? inboxItem?.id ?? null,
      request.conversationId,
    )
    const status = statusForPlan(plan, appliedActions.length)

    await db.update(aiJobs)
      .set({
        status,
        conversationId,
        relatedEntityIds: plan.relatedEntityIds,
        classification: plan as unknown as Record<string, unknown>,
        actionsTaken: appliedActions,
        updatedAt: new Date(),
      })
      .where(eq(aiJobs.id, jobId))

    if (request.originItemId && plan.result === 'apply_actions' && appliedActions.length > 0) {
      await db.update(items)
        .set({
          status: 'archived',
          metadata: toAiMetadata(jobId, plan),
          updatedAt: new Date(),
        })
        .where(eq(items.id, request.originItemId))
    }

    if (conversationId && (request.originItemId || inboxItem?.id)) {
      await db.update(items)
        .set({
          metadata: {
            ...toAiMetadata(jobId, plan),
            ai: { ...toAiMetadata(jobId, plan).ai, conversationId },
          },
          updatedAt: new Date(),
        })
        .where(eq(items.id, request.originItemId ?? inboxItem!.id))
    }

    revalidateAiSurfaces()
    return { jobId, conversationId, plan, appliedActions, inboxItem }
  } catch (error) {
    await db.update(aiJobs)
      .set({
        status: 'error',
        classification: {
          error: error instanceof Error ? error.message : 'AI planning failed',
        },
        updatedAt: new Date(),
      })
      .where(eq(aiJobs.id, jobId))
    throw error
  }
}

export async function getActiveInboxItem(itemId: string) {
  return db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.type, 'inbox' as ItemType), eq(items.status, 'active'), isNull(items.deletedAt)),
  })
}

export async function confirmAiJob(jobId: string, user: SessionUser) {
  const job = await db.query.aiJobs.findFirst({ where: eq(aiJobs.id, jobId) })
  if (!job?.classification) throw new Error('AI suggestion not found')

  const plan = aiPlanSchema.parse(job.classification)
  const applied = []
  for (const action of plan.actions) {
    const result = await applyAction(action, user, jobId)
    if (result) applied.push(result)
  }

  await db.update(aiJobs)
    .set({
      status: applied.length ? 'applied' : 'rejected',
      actionsTaken: applied,
      reviewedById: user.id,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(aiJobs.id, jobId))

  if (job.conversationId) {
    const conversation = await db.query.aiConversations.findFirst({ where: eq(aiConversations.id, job.conversationId) })
    await db.update(aiConversations)
      .set({
        status: applied.length ? 'applied' : 'dismissed',
        messages: [
          ...(conversation?.messages ?? []),
          {
            role: 'assistant',
            content: applied.length ? 'Done. I’ve saved that now.' : 'No worries, I’ve left it in Inbox for later.',
            createdAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, job.conversationId))
  }

  revalidateAiSurfaces()
  return { appliedActions: applied }
}
