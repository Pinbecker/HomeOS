'use server'

import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq, and, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export async function createNote(title: string, body: string) {
  const session = await requireSession()
  const id = ulid()
  const now = new Date()

  await db.insert(items).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    type: 'note',
    title: title.trim(),
    body: body.trim() || null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  revalidatePath('/notes')

  return {
    note: {
      id,
      title: title.trim(),
      body: body.trim() || null,
      createdAt: now,
      updatedAt: now,
      createdBy: { name: session.user.name },
    },
  }
}

export async function updateNote(id: string, title: string, body: string) {
  await requireSession()
  const now = new Date()

  await db.update(items)
    .set({ title: title.trim(), body: body.trim() || null, updatedAt: now })
    .where(and(eq(items.id, id), isNull(items.deletedAt)))

  revalidatePath('/notes')
}

export async function deleteNote(id: string) {
  await requireSession()
  const now = new Date()

  await db.update(items)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(items.id, id))

  revalidatePath('/notes')
}
