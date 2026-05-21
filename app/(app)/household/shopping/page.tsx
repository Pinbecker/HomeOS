import { db } from '@/lib/db'
import { lists } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { ulid } from 'ulid'
import { ShoppingOverview } from './shopping-overview'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export default async function ShoppingPage() {
  let shops = await db.query.lists.findMany({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping'), eq(lists.archived, false)),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
    with: { items: { columns: { id: true, checked: true } } },
  })

  // Ensure a default shop exists — construct the row in-memory to avoid a second DB round-trip
  if (shops.length === 0) {
    const id = ulid()
    const now = new Date()
    await db.insert(lists).values({
      id, householdId: HOUSEHOLD_ID, name: 'Shopping', type: 'shopping',
      color: '#34C759', sortOrder: 0, createdAt: now, updatedAt: now,
    })
    shops = [{ id, householdId: HOUSEHOLD_ID, name: 'Shopping', type: 'shopping' as const, color: '#34C759', sortOrder: 0, archived: false, icon: null, createdAt: now, updatedAt: now, items: [] }]
  }

  const shopCards = shops.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color ?? '#34C759',
    count: s.items.filter(i => !i.checked).length,
  }))

  const totalActive = shopCards.reduce((sum, s) => sum + s.count, 0)

  return <ShoppingOverview shops={shopCards} totalActive={totalActive} />
}
