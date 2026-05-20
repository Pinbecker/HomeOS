'use server'

import { db } from '@/lib/db'
import { items, lists } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq, and } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

async function getOrCreateList() {
  const existing = await db.query.lists.findFirst({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'house_plans')),
  })
  if (existing) return existing.id
  const id = ulid()
  const now = new Date()
  await db.insert(lists).values({
    id,
    householdId: HOUSEHOLD_ID,
    name: 'House Plans',
    type: 'house_plans',
    color: '#34C759',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function createHousePlan(title: string) {
  const session = await requireSession()
  const listId = await getOrCreateList()
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
  revalidatePath('/household/plans')
  return { id }
}

export async function toggleHousePlan(id: string) {
  await requireSession()
  const item = await db.query.items.findFirst({ where: eq(items.id, id) })
  if (!item) return
  const completing = item.status !== 'completed'
  const now = new Date()
  await db.update(items).set({
    status: completing ? 'completed' : 'active',
    completedAt: completing ? now : null,
    updatedAt: now,
  }).where(eq(items.id, id))
  revalidatePath('/household/plans')
}

export async function deleteHousePlan(id: string) {
  await requireSession()
  await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, id))
  revalidatePath('/household/plans')
}
