import { db } from '@/lib/db'
import { lists } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { ShoppingOverview } from './shopping-overview'
import { ensureGeneralShoppingList, GENERAL_SHOPPING_ICON } from './general'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export default async function ShoppingPage() {
  await ensureGeneralShoppingList()

  let shops = await db.query.lists.findMany({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping'), eq(lists.archived, false)),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
    with: { items: { columns: { id: true, checked: true } } },
  })

  const shopCards = shops.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color ?? '#34C759',
    count: s.items.filter(i => !i.checked).length,
    isGeneral: s.icon === GENERAL_SHOPPING_ICON,
  }))

  const totalActive = shopCards.reduce((sum, s) => sum + s.count, 0)

  return <ShoppingOverview shops={shopCards} totalActive={totalActive} />
}
