'use server'

import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export async function createTripIdea(title: string) {
  const session = await requireSession()
  const id = ulid()
  const now = new Date()
  await db.insert(items).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    type: 'trip_idea',
    title: title.trim(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath('/life/plans')
  return { id }
}

export async function updateTripIdea(id: string, data: { title?: string; body?: string }) {
  await requireSession()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.title !== undefined) patch.title = data.title.trim()
  if (data.body !== undefined) patch.body = data.body
  await db.update(items).set(patch).where(eq(items.id, id))
  revalidatePath('/life/plans')
}

export async function toggleTripIdea(id: string) {
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
  revalidatePath('/life/plans')
}

export async function deleteTripIdea(id: string) {
  await requireSession()
  await db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, id))
  revalidatePath('/life/plans')
}
