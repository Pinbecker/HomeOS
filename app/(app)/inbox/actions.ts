'use server'

import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export async function createInboxItem(title: string) {
  const session = await requireSession()

  const id = ulid()
  const now = new Date()

  await db.insert(items).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    type: 'inbox',
    title: title.trim(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  })

  revalidatePath('/')
  revalidatePath('/inbox')

  return {
    item: {
      id,
      title: title.trim(),
      body: null,
      createdAt: now,
      createdBy: { name: session.user.name },
    },
  }
}

export async function archiveItem(id: string) {
  await requireSession()
  const now = new Date()
  await db.update(items).set({ status: 'archived', updatedAt: now }).where(eq(items.id, id))
  revalidatePath('/')
  revalidatePath('/inbox')
}
