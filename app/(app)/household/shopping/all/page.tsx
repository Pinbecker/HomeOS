import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { lists, listItems } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { AllShopsView } from './all-shops-view'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export default async function AllShoppingPage() {
  await requireSession()

  const shops = await db.query.lists.findMany({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping'), eq(lists.archived, false)),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
    with: {
      items: { orderBy: [asc(listItems.sortOrder), asc(listItems.createdAt)] },
    },
  })

  const data = shops.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color ?? '#34C759',
    items: s.items.map(i => ({ id: i.id, title: i.title, checked: i.checked, shopId: s.id })),
  }))

  return <AllShopsView shops={data} />
}
