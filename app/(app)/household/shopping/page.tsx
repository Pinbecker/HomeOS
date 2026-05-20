import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { lists, listItems } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { ShoppingClient } from './shopping-client'
import { ulid } from 'ulid'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

async function getOrCreateShoppingList() {
  const existing = await db.query.lists.findFirst({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping')),
    with: {
      items: {
        orderBy: [asc(listItems.checked), asc(listItems.sortOrder), asc(listItems.createdAt)],
      },
    },
  })

  if (existing) return existing

  const id = ulid()
  const now = new Date()
  await db.insert(lists).values({
    id,
    householdId: HOUSEHOLD_ID,
    name: 'Shopping',
    type: 'shopping',
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })

  return { id, name: 'Shopping', type: 'shopping' as const, items: [] }
}

export default async function ShoppingPage() {
  await requireSession()
  const list = await getOrCreateShoppingList()
  return <ShoppingClient list={list} />
}
