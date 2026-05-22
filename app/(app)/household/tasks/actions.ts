'use server'

import { db } from '@/lib/db'
import { items, lists } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { and, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const TASK_DUE_SENT_FOR_KEY = 'taskDueNotificationSentFor'
const TASK_DUE_SENT_AT_KEY = 'taskDueNotificationSentAt'

function clearTaskDueNotificationMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return metadata
  const next = { ...metadata }
  delete next[TASK_DUE_SENT_FOR_KEY]
  delete next[TASK_DUE_SENT_AT_KEY]
  return next
}

export async function createTaskList(name: string, color: string) {
  await requireSession()
  const id = ulid()
  const now = new Date()
  await db.insert(lists).values({
    id,
    householdId: HOUSEHOLD_ID,
    name: name.trim(),
    type: 'tasks',
    color,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath('/household/tasks')
  return { id }
}

export async function renameTaskList(listId: string, name: string, color: string) {
  await requireSession()
  await db.update(lists)
    .set({ name: name.trim(), color, updatedAt: new Date() })
    .where(and(eq(lists.id, listId), eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'tasks')))
  revalidatePath('/household/tasks')
  revalidatePath(`/household/tasks/${listId}`)
  revalidatePath('/')
}

export async function deleteTaskList(listId: string) {
  await requireSession()
  const taskList = await db.query.lists.findFirst({
    where: and(eq(lists.id, listId), eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'tasks')),
    columns: { id: true },
  })
  if (!taskList) return

  // soft-delete the tasks, then remove the list
  await db.update(items)
    .set({ deletedAt: new Date() })
    .where(and(eq(items.householdId, HOUSEHOLD_ID), eq(items.type, 'task'), eq(items.listId, listId)))
  await db.delete(lists)
    .where(eq(lists.id, taskList.id))
  revalidatePath('/household/tasks')
  revalidatePath(`/household/tasks/${listId}`)
  revalidatePath('/')
}

export async function createTask(listId: string | null, title: string) {
  const session = await requireSession()
  const id = ulid()
  const now = new Date()
  await db.insert(items).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    type: 'task',
    title: title.trim(),
    status: 'active',
    listId: listId === 'inbox' ? null : listId,
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath(`/household/tasks/${listId ?? 'inbox'}`)
  revalidatePath('/household/tasks')
  revalidatePath('/')
  return { id, title: title.trim() }
}

export async function updateTask(
  id: string,
  data: { title?: string; dueDate?: number | null; assigneeId?: string | null; listId?: string | null },
) {
  await requireSession()
  const task = await db.query.items.findFirst({ where: eq(items.id, id) })
  if (!task) return
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if ('title' in data && data.title?.trim()) patch.title = data.title.trim()
  if ('dueDate' in data) {
    patch.dueDate = data.dueDate == null ? null : new Date(data.dueDate)
    patch.metadata = clearTaskDueNotificationMetadata(task.metadata)
  }
  if ('assigneeId' in data) patch.assigneeId = data.assigneeId
  if ('listId' in data) patch.listId = data.listId
  await db.update(items).set(patch).where(eq(items.id, id))
  if (task.listId) revalidatePath(`/household/tasks/${task.listId}`)
  else revalidatePath('/household/tasks/inbox')
  if ('listId' in data && data.listId) revalidatePath(`/household/tasks/${data.listId}`)
  if ('listId' in data && !data.listId) revalidatePath('/household/tasks/inbox')
  revalidatePath('/household/tasks/all')
  revalidatePath('/household/tasks')
  revalidatePath('/')
}

export async function toggleTask(id: string) {
  await requireSession()
  const task = await db.query.items.findFirst({ where: eq(items.id, id) })
  if (!task) return
  const completing = task.status !== 'completed'
  const now = new Date()
  await db.update(items)
    .set({
      status: completing ? 'completed' : 'active',
      completedAt: completing ? now : null,
      updatedAt: now,
    })
    .where(eq(items.id, id))
  revalidatePath(`/household/tasks/${task.listId}`)
  revalidatePath('/household/tasks')
  revalidatePath('/')
}

export async function deleteTask(id: string) {
  await requireSession()
  const task = await db.query.items.findFirst({ where: eq(items.id, id) })
  await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, id))
  if (task?.listId) revalidatePath(`/household/tasks/${task.listId}`)
  else revalidatePath('/household/tasks/inbox')
  revalidatePath('/household/tasks')
  revalidatePath('/')
}
