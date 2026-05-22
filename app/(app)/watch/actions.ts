'use server'

import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq, and, isNull } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

async function followedTvItems() {
  return db.query.items.findMany({
    where: and(
      eq(items.type, 'watchlist_tv'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
    ),
    columns: { id: true, title: true },
  })
}

export async function followShow(title: string, channel: string, posterUrl: string | null) {
  const session = await requireSession()
  const clean = title.trim()
  if (!clean) return

  const existing = await followedTvItems()
  if (existing.some(i => i.title.toLowerCase() === clean.toLowerCase())) return

  const now = new Date()
  await db.insert(items).values({
    id: ulid(),
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    type: 'watchlist_tv',
    title: clean,
    status: 'active',
    metadata: { showName: clean, channel, posterUrl, following: true },
    createdAt: now,
    updatedAt: now,
  })

  revalidatePath('/watch')
  revalidatePath('/')
}

export async function unfollowShow(title: string) {
  await requireSession()
  const clean = title.trim().toLowerCase()

  const existing = await followedTvItems()
  const toDelete = existing.filter(i => i.title.toLowerCase() === clean)
  if (toDelete.length === 0) return

  const now = new Date()
  for (const item of toDelete) {
    await db.update(items)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(items.id, item.id))
  }

  revalidatePath('/watch')
  revalidatePath('/')
}
