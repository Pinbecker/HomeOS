'use server'

import { db } from '@/lib/db'
import { items, lists } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

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
    .where(eq(lists.id, listId))
  revalidatePath('/household/tasks')
  revalidatePath(`/household/tasks/${listId}`)
}

export async function deleteTaskList(listId: string) {
  await requireSession()
  // soft-delete the tasks, then remove the list
  await db.update(items).set({ deletedAt: new Date() }).where(eq(items.listId, listId))
  await db.delete(lists).where(eq(lists.id, listId))
  revalidatePath('/household/tasks')
}

export async function createTask(listId: string, title: string) {
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
    listId,
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath(`/household/tasks/${listId}`)
  revalidatePath('/household/tasks')
  revalidatePath('/')
  return { id, title: title.trim() }
}

export async function updateTask(
  id: string,
  data: { dueDate?: number | null; assigneeId?: string | null },
) {
  await requireSession()
  const task = await db.query.items.findFirst({ where: eq(items.id, id) })
  if (!task) return
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if ('dueDate' in data) patch.dueDate = data.dueDate == null ? null : new Date(data.dueDate)
  if ('assigneeId' in data) patch.assigneeId = data.assigneeId
  await db.update(items).set(patch).where(eq(items.id, id))
  if (task.listId) revalidatePath(`/household/tasks/${task.listId}`)
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
  revalidatePath('/household/tasks')
  revalidatePath('/')
}
