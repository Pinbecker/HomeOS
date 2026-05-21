import { and, asc, count, eq, isNull } from 'drizzle-orm'
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
  finalResponse: string
  appliedActions: AppliedAction[]
  executionResults: AiExecutionResult[]
  inboxItem: { id: string; title: string } | null
}

type AppliedAction = Record<string, unknown>

export type AiExecutionResult = {
  index: number
  type: AiAction['type']
  attempted: boolean
  status: 'applied' | 'skipped' | 'failed'
  reason: string | null
  entityType?: string
  entityId?: string
  title?: string | null
  appliedActions: AppliedAction[]
}

type ActionApplyResult = {
  appliedActions: AppliedAction[]
  reason?: string | null
}

const RECORD_ENTITY_TYPE = 'record'
const ITEM_ENTITY_TYPE = 'item'

function statusForPlan(plan: AiPlan, appliedCount: number, executionResults: AiExecutionResult[]): AiJobStatus {
  if (plan.result === 'needs_clarification') return 'needs_clarification'
  if (appliedCount > 0) return 'applied'
  if (executionResults.some(result => result.reason?.toLowerCase().includes('missing reminder date'))) return 'needs_clarification'
  if (plan.result === 'capture_to_inbox' || plan.result === 'unknown') return 'planned'
  return 'planned'
}

function toAiMetadata(jobId: string, plan: AiPlan, finalResponse?: string) {
  return {
    ai: {
      jobId,
      result: plan.result,
      response: finalResponse ?? plan.response,
      plannedResponse: plan.response,
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

async function findRecordById(id: string | null) {
  if (!id) return null
  return db.query.records.findFirst({ where: eq(records.id, id), columns: { id: true, title: true, category: true } })
}

async function findEntityType(id: string | null): Promise<'record' | 'item' | null> {
  if (!id || id === 'TASK_PLACEHOLDER') return null
  const record = await db.query.records.findFirst({ where: eq(records.id, id), columns: { id: true } })
  if (record) return 'record'
  const item = await db.query.items.findFirst({ where: eq(items.id, id), columns: { id: true } })
  if (item) return 'item'
  return null
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

async function linkRecordToItem(recordId: string, itemId: string, userId: string) {
  const record = await findRecordById(recordId)
  if (!record) return null
  const id = ulid()
  await db.insert(entityLinks).values({
    id,
    fromType: RECORD_ENTITY_TYPE,
    fromId: recordId,
    toType: ITEM_ENTITY_TYPE,
    toId: itemId,
    linkType: 'related_to',
    createdById: userId,
    createdAt: new Date(),
  })
  return { type: 'link_entities', entityType: 'entity_link', entityId: id, title: record.title }
}

async function clearShoppingList(action: AiAction) {
  const rows = await db.query.lists.findMany({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping'), eq(lists.archived, false)),
    orderBy: [asc(lists.sortOrder), asc(lists.name)],
  })
  const name = action.listName?.trim().toLowerCase() || action.title?.trim().toLowerCase()
  if (!name) return { list: null, deleted: 0, reason: 'Missing shopping list name.' }

  const list = rows.find(row => row.name.toLowerCase() === name || row.name.toLowerCase().includes(name))
  if (!list) return { list: null, deleted: 0, reason: `Shopping list "${action.listName ?? action.title}" was not found.` }

  const [{ value: deleted }] = await db
    .select({ value: count() })
    .from(listItems)
    .where(eq(listItems.listId, list.id))

  await db.delete(listItems).where(eq(listItems.listId, list.id))
  return { list, deleted, reason: null }
}

async function applyAction(action: AiAction, user: SessionUser, jobId: string): Promise<ActionApplyResult> {
  const now = new Date()
  const id = ulid()

  if (action.type === 'create_task' && action.title) {
    const list = await findList(action, 'tasks')
    const assigneeId = await findAssigneeId(action, user)
    const appliedActions: AppliedAction[] = []
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
    appliedActions.push({ type: action.type, entityType: 'item', entityId: id, title: action.title })

    if (action.recordId) {
      const link = await linkRecordToItem(action.recordId, id, user.id)
      if (link) appliedActions.push(link)
      else return { appliedActions, reason: 'Task was created, but the linked record was not found.' }
    }

    return { appliedActions }
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
    return { appliedActions: [{ type: action.type, entityType: 'item', entityId: id, title: action.title }] }
  }

  if (action.type === 'create_shopping_item' && action.title) {
    const list = await findList(action, 'shopping')
    if (!list) return { appliedActions: [], reason: 'No shopping list was found.' }
    await db.insert(listItems).values({
      id,
      listId: list.id,
      title: action.title.trim(),
      sortOrder: Date.now(),
      checked: false,
      createdAt: now,
    })
    return { appliedActions: [{ type: action.type, entityType: 'list_item', entityId: id, title: action.title, listId: list.id }] }
  }

  if (action.type === 'clear_shopping_list') {
    const result = await clearShoppingList(action)
    if (!result.list) return { appliedActions: [], reason: result.reason }
    return {
      appliedActions: [{
        type: action.type,
        entityType: 'list',
        entityId: result.list.id,
        title: result.list.name,
        deletedCount: result.deleted,
      }],
    }
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
    return { appliedActions: [{ type: action.type, entityType: 'record', entityId: id, title: action.recordTitle }] }
  }

  if (action.type === 'update_record' && action.recordId) {
    const existing = await db.query.records.findFirst({ where: eq(records.id, action.recordId) })
    if (!existing) return { appliedActions: [], reason: 'Record was not found.' }
    const dueDate = parseDate(action.dueDate)
    await db.update(records)
      .set({
        fields: mergeFields(existing.fields ?? [], action.fields),
        renewalDate: dueDate ?? existing.renewalDate,
        renewalLabel: dueDate ? (existing.renewalLabel ?? 'Renews') : existing.renewalLabel,
        notes: action.body ? [existing.notes, action.body.trim()].filter(Boolean).join('\n\n') : existing.notes,
        updatedAt: now,
      })
      .where(eq(records.id, action.recordId))
    return { appliedActions: [{ type: action.type, entityType: 'record', entityId: action.recordId, title: existing.title }] }
  }

  if (action.type === 'create_reminder') {
    if (!action.reminderDate) return { appliedActions: [], reason: 'Missing reminder date.' }
    const entityId = action.recordId ?? action.toEntityId ?? action.fromEntityId
    if (!entityId) return { appliedActions: [], reason: 'Missing reminder target record.' }
    const record = await findRecordById(entityId)
    if (!record) return { appliedActions: [], reason: 'Reminder target record was not found.' }
    const triggerAt = parseDate(action.reminderDate)
    if (!triggerAt) return { appliedActions: [], reason: 'Reminder date could not be understood.' }
    await db.insert(reminders).values({
      id,
      householdId: HOUSEHOLD_ID,
      createdById: user.id,
      entityType: RECORD_ENTITY_TYPE,
      entityId,
      message: action.reminderMessage ?? action.title,
      triggerAt,
      createdAt: now,
    })
    return { appliedActions: [{ type: action.type, entityType: 'reminder', entityId: id, title: action.reminderMessage ?? action.title }] }
  }

  if (action.type === 'link_entities' && action.fromEntityId && action.toEntityId) {
    const fromType = await findEntityType(action.fromEntityId)
    const toType = await findEntityType(action.toEntityId)
    if (!fromType || !toType) return { appliedActions: [], reason: 'One of the linked entities was not found.' }
    if (fromType === toType) return { appliedActions: [], reason: 'Linked entities must be different types.' }
    await db.insert(entityLinks).values({
      id,
      fromType,
      fromId: action.fromEntityId,
      toType,
      toId: action.toEntityId,
      linkType: 'related_to',
      createdById: user.id,
      createdAt: now,
    })
    return { appliedActions: [{ type: action.type, entityType: 'entity_link', entityId: id }] }
  }

  return { appliedActions: [], reason: `Action ${action.type} was missing required details.` }
}

async function applySafeActions(plan: AiPlan, user: SessionUser, jobId: string) {
  if (plan.result !== 'apply_actions') return { appliedActions: [], executionResults: [] }
  if (plan.planningConfidence === 'low') {
    return {
      appliedActions: [],
      executionResults: plan.actions.map((action, index) => ({
        index,
        type: action.type,
        attempted: false,
        status: 'skipped' as const,
        reason: 'Planning confidence was low.',
        appliedActions: [],
      })),
    }
  }

  const appliedActions: AppliedAction[] = []
  const executionResults: AiExecutionResult[] = []
  for (const [index, action] of plan.actions.entries()) {
    if (action.confidence === 'low') {
      executionResults.push({
        index,
        type: action.type,
        attempted: false,
        status: 'skipped',
        reason: 'Action confidence was low.',
        appliedActions: [],
      })
      continue
    }
    try {
      const result = await applyAction(action, user, jobId)
      appliedActions.push(...result.appliedActions)
      executionResults.push({
        index,
        type: action.type,
        attempted: true,
        status: result.appliedActions.length > 0 ? 'applied' : 'skipped',
        reason: result.reason ?? null,
        entityType: result.appliedActions[0]?.entityType as string | undefined,
        entityId: result.appliedActions[0]?.entityId as string | undefined,
        title: (result.appliedActions[0]?.title as string | undefined) ?? action.title,
        appliedActions: result.appliedActions,
      })
    } catch (error) {
      executionResults.push({
        index,
        type: action.type,
        attempted: true,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Action failed.',
        appliedActions: [],
      })
    }
  }
  return { appliedActions, executionResults }
}

async function createInboxItemForPlan(plan: AiPlan, user: SessionUser, jobId: string, finalResponse: string, originItemId?: string | null) {
  if (originItemId) {
    await db.update(items)
      .set({
        metadata: toAiMetadata(jobId, plan, finalResponse),
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
    metadata: toAiMetadata(jobId, plan, finalResponse),
    createdAt: now,
    updatedAt: now,
  })

  return { id, title }
}

async function createConversationIfNeeded(
  plan: AiPlan,
  user: SessionUser,
  jobId: string,
  finalResponse: string,
  originItemId?: string | null,
  existingConversationId?: string | null,
  forceConversation = false,
) {
  const needsConversation = forceConversation || plan.result === 'needs_clarification'
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
          { role: 'assistant', content: plan.clarificationQuestion || finalResponse, createdAt: now.toISOString() },
        ],
        updatedAt: now,
      })
      .where(eq(aiConversations.id, existingConversationId))
    return existingConversationId
  }

  const id = ulid()
  const messages: AiConversationMessage[] = [
    { role: 'user', content: plan.originalWording, createdAt: now.toISOString() },
    { role: 'assistant', content: plan.clarificationQuestion || finalResponse, createdAt: now.toISOString() },
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

function actionVerb(action: AppliedAction) {
  const type = action.type
  if (type === 'create_task') return `made the task "${action.title}"`
  if (type === 'create_note') return `saved the note "${action.title}"`
  if (type === 'create_shopping_item') return `added "${action.title}" to shopping`
  if (type === 'clear_shopping_list') {
    const countValue = typeof action.deletedCount === 'number' ? ` (${action.deletedCount} item${action.deletedCount === 1 ? '' : 's'})` : ''
    return `cleared ${action.title}${countValue}`
  }
  if (type === 'create_record') return `created the record "${action.title}"`
  if (type === 'update_record') return `updated "${action.title}"`
  if (type === 'create_reminder') return `added the reminder "${action.title ?? 'Reminder'}"`
  if (type === 'link_entities') return 'linked it to the record'
  return `applied ${String(type)}`
}

function buildFinalResponse(plan: AiPlan, appliedActions: AppliedAction[], executionResults: AiExecutionResult[]) {
  const missingReminderDate = executionResults.find(result => result.reason === 'Missing reminder date.')
  if (missingReminderDate && appliedActions.length === 0) {
    const action = plan.actions[missingReminderDate.index]
    const subject = action?.reminderMessage ?? action?.title ?? 'that'
    return `When should I remind you about ${subject}?`
  }

  if (plan.result === 'needs_clarification') {
    return plan.clarificationQuestion || plan.response
  }

  if (plan.result !== 'apply_actions') {
    return plan.response
  }

  const userVisibleActions = appliedActions.filter(action => action.type !== 'link_entities')
  const summaries = (userVisibleActions.length ? userVisibleActions : appliedActions).map(actionVerb)
  const skipped = executionResults.filter(result => result.status !== 'applied')

  if (summaries.length === 0) {
    const reason = skipped.map(result => result.reason).find(Boolean)
    return reason ? `I couldn't do that yet: ${reason}` : "I couldn't make that change yet."
  }

  const done = summaries.length === 1
    ? `I ${summaries[0]}.`
    : `I ${summaries.slice(0, -1).join(', ')} and ${summaries[summaries.length - 1]}.`
  const linkApplied = appliedActions.some(action => action.type === 'link_entities')
  const linkText = linkApplied && !done.includes('linked') ? ' I linked it as well.' : ''
  const skippedText = skipped.length > 0
    ? ` I couldn't complete ${skipped.length === 1 ? 'one part' : `${skipped.length} parts`}: ${skipped.map(result => result.reason).filter(Boolean).join('; ')}`
    : ''

  return `${done}${linkText}${skippedText}`.trim()
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
    const planning = await planAiCapture({
      rawInput: request.rawInput,
      context,
      previousMessages: request.previousMessages,
      sourceHint: request.sourceType,
    })
    const plan = planning.plan
    const { appliedActions, executionResults } = await applySafeActions(plan, user, jobId)
    const finalResponse = buildFinalResponse(plan, appliedActions, executionResults)
    const needsExecutionClarification = executionResults.some(result => result.reason === 'Missing reminder date.')
    const shouldCaptureInbox =
      plan.result === 'capture_to_inbox' ||
      plan.result === 'unknown' ||
      plan.result === 'needs_clarification' ||
      appliedActions.length === 0

    const inboxItem = shouldCaptureInbox
      ? await createInboxItemForPlan(plan, user, jobId, finalResponse, request.originItemId)
      : null

    const conversationId = await createConversationIfNeeded(
      plan,
      user,
      jobId,
      finalResponse,
      request.originItemId ?? inboxItem?.id ?? null,
      request.conversationId,
      needsExecutionClarification,
    )
    const status = statusForPlan(plan, appliedActions.length, executionResults)

    await db.update(aiJobs)
      .set({
        status,
        conversationId,
        relatedEntityIds: plan.relatedEntityIds,
        classification: plan as unknown as Record<string, unknown>,
        actionsTaken: appliedActions,
        executionResults,
        finalResponse,
        model: planning.model,
        rawModelOutput: planning.rawModelOutput,
        updatedAt: new Date(),
      })
      .where(eq(aiJobs.id, jobId))

    if (request.originItemId && plan.result === 'apply_actions' && appliedActions.length > 0) {
      await db.update(items)
        .set({
          status: 'archived',
          metadata: toAiMetadata(jobId, plan, finalResponse),
          updatedAt: new Date(),
        })
        .where(eq(items.id, request.originItemId))
    }

    if (conversationId && (request.originItemId || inboxItem?.id)) {
      await db.update(items)
        .set({
          metadata: {
            ...toAiMetadata(jobId, plan),
            ai: { ...toAiMetadata(jobId, plan, finalResponse).ai, conversationId },
          },
          updatedAt: new Date(),
        })
        .where(eq(items.id, request.originItemId ?? inboxItem!.id))
    }

    revalidateAiSurfaces()
    return { jobId, conversationId, plan, finalResponse, appliedActions, executionResults, inboxItem }
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
  const { appliedActions: applied, executionResults } = await applySafeActions(
    { ...plan, result: 'apply_actions' } as AiPlan,
    user,
    jobId,
  )
  const finalResponse = buildFinalResponse(plan, applied, executionResults)

  await db.update(aiJobs)
    .set({
      status: applied.length ? 'applied' : 'rejected',
      actionsTaken: applied,
      executionResults,
      finalResponse,
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
            content: finalResponse,
            createdAt: new Date().toISOString(),
          },
        ],
        updatedAt: new Date(),
      })
      .where(eq(aiConversations.id, job.conversationId))
  }

  revalidateAiSurfaces()
  return { appliedActions: applied, executionResults, finalResponse }
}
