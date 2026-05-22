'use server'

import { revalidatePath } from 'next/cache'
import { ulid } from 'ulid'
import path from 'path'
import fs from 'fs/promises'
import { db } from '@/lib/db'
import {
  entityLinks,
  fileAttachments,
  files,
  items,
  records,
  reminders,
  type RecordField,
} from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { and, eq, or } from 'drizzle-orm'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const RECORD_ENTITY_TYPE = 'record'
const ITEM_ENTITY_TYPE = 'item'

function cleanFieldsFromForm(formData: FormData): RecordField[] {
  const labels = formData.getAll('fieldLabel').map(value => String(value).trim())
  const values = formData.getAll('fieldValue').map(value => String(value).trim())

  return labels
    .map((label, index) => ({ label, value: values[index] ?? '' }))
    .filter(field => field.label || field.value)
}

function dateFromInput(value: FormDataEntryValue | null) {
  const date = String(value ?? '').trim()
  if (!date) return null
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

async function revalidateEntity(entityId: string, category?: string | null) {
  revalidatePath(`/life/admin/${entityId}`)
  revalidatePath('/life/admin')
  if (category) revalidatePath(`/life/${category}`)
  revalidatePath('/')
}

export async function updateEntityDetails(entityId: string, formData: FormData) {
  await requireSession()
  const existing = await db.query.records.findFirst({ where: eq(records.id, entityId) })
  if (!existing) return

  await db.update(records)
    .set({
      title: String(formData.get('title') ?? '').trim(),
      subtitle: String(formData.get('subtitle') ?? '').trim() || null,
      fields: cleanFieldsFromForm(formData),
      renewalLabel: String(formData.get('renewalLabel') ?? '').trim() || null,
      renewalDate: dateFromInput(formData.get('renewalDate')),
      notes: String(formData.get('notes') ?? '').trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(records.id, entityId))

  await revalidateEntity(entityId, existing.category)
}

export async function addLinkedTask(entityId: string, formData: FormData) {
  const session = await requireSession()
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return

  const taskId = ulid()
  const linkId = ulid()
  const now = new Date()

  await db.insert(items).values({
    id: taskId,
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    type: 'task',
    title,
    status: 'active',
    dueDate: dateFromInput(formData.get('dueDate')),
    createdAt: now,
    updatedAt: now,
  })

  await db.insert(entityLinks).values({
    id: linkId,
    fromType: RECORD_ENTITY_TYPE,
    fromId: entityId,
    toType: ITEM_ENTITY_TYPE,
    toId: taskId,
    linkType: 'related_to',
    createdById: session.user.id,
    createdAt: now,
  })

  await revalidateEntity(entityId)
  revalidatePath('/household/tasks')
  revalidatePath('/household/tasks/inbox')
  revalidatePath('/household/tasks/all')
}

export async function addEntityReminder(entityId: string, formData: FormData) {
  const session = await requireSession()
  const triggerAt = dateFromInput(formData.get('triggerAt'))
  if (!triggerAt) return

  await db.insert(reminders).values({
    id: ulid(),
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    entityType: RECORD_ENTITY_TYPE,
    entityId,
    message: String(formData.get('message') ?? '').trim() || null,
    triggerAt,
    createdAt: new Date(),
  })

  await revalidateEntity(entityId)
  revalidatePath('/life/admin/reminders')
}

export async function deleteEntityReminder(reminderId: string, entityId: string) {
  await db.delete(reminders).where(eq(reminders.id, reminderId))
  await revalidateEntity(entityId)
  revalidatePath('/life/admin/reminders')
}

export async function updateEntityReminder(reminderId: string, entityId: string, formData: FormData) {
  const triggerAt = dateFromInput(formData.get('triggerAt'))
  if (!triggerAt) return
  await db.update(reminders)
    .set({
      message: String(formData.get('message') ?? '').trim() || null,
      triggerAt,
    })
    .where(eq(reminders.id, reminderId))
  await revalidateEntity(entityId)
  revalidatePath('/life/admin/reminders')
}

export async function attachEntityDocument(entityId: string, formData: FormData) {
  const session = await requireSession()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return

  const id = ulid()
  const now = new Date()
  const originalName = file.name || 'document'
  const storageDir = path.join(process.cwd(), 'local-data', 'files')
  const storageName = `${id}-${safeFileName(originalName)}`
  const storagePath = path.join(storageDir, storageName)

  await fs.mkdir(storageDir, { recursive: true })
  await fs.writeFile(storagePath, Buffer.from(await file.arrayBuffer()))

  await db.insert(files).values({
    id,
    householdId: HOUSEHOLD_ID,
    uploadedById: session.user.id,
    originalName,
    storagePath,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    createdAt: now,
  })

  await db.insert(fileAttachments).values({
    id: ulid(),
    fileId: id,
    entityType: RECORD_ENTITY_TYPE,
    entityId,
    createdAt: now,
  })

  await revalidateEntity(entityId)
}

export async function addRelatedEntity(entityId: string, formData: FormData) {
  const session = await requireSession()
  const relatedId = String(formData.get('relatedId') ?? '').trim()
  if (!relatedId || relatedId === entityId) return

  const existing = await db.query.entityLinks.findFirst({
    where: or(
      and(
        eq(entityLinks.fromType, RECORD_ENTITY_TYPE),
        eq(entityLinks.fromId, entityId),
        eq(entityLinks.toType, RECORD_ENTITY_TYPE),
        eq(entityLinks.toId, relatedId),
      ),
      and(
        eq(entityLinks.fromType, RECORD_ENTITY_TYPE),
        eq(entityLinks.fromId, relatedId),
        eq(entityLinks.toType, RECORD_ENTITY_TYPE),
        eq(entityLinks.toId, entityId),
      ),
    ),
  })
  if (existing) return

  await db.insert(entityLinks).values({
    id: ulid(),
    fromType: RECORD_ENTITY_TYPE,
    fromId: entityId,
    toType: RECORD_ENTITY_TYPE,
    toId: relatedId,
    linkType: 'related_to',
    createdById: session.user.id,
    createdAt: new Date(),
  })

  await revalidateEntity(entityId)
  revalidatePath(`/life/admin/${relatedId}`)
}
