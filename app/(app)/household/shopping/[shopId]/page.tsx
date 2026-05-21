import { db } from '@/lib/db'
import { lists, listItems } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ShopView } from './shop-view'
import { GENERAL_SHOPPING_ICON } from '../general'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export default async function ShopPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params

  const [shop, allLists] = await Promise.all([
    db.query.lists.findFirst({
      where: and(eq(lists.id, shopId), eq(lists.type, 'shopping')),
      with: {
        items: {
          orderBy: [asc(listItems.checked), asc(listItems.sortOrder), asc(listItems.createdAt)],
        },
      },
    }),
    db.query.lists.findMany({
      where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'shopping'), eq(lists.archived, false)),
      columns: { id: true, name: true, color: true },
      orderBy: [asc(lists.sortOrder), asc(lists.name)],
    }),
  ])

  if (!shop) notFound()

  const otherShops = allLists
    .filter(l => l.id !== shopId)
    .map(l => ({ id: l.id, name: l.name, color: l.color ?? '#34C759' }))

  return (
    <ShopView
      shop={{
        id: shop.id,
        name: shop.name,
        color: shop.color ?? '#34C759',
        isGeneral: shop.icon === GENERAL_SHOPPING_ICON,
        items: shop.items.map(i => ({ id: i.id, title: i.title, checked: i.checked, checkedAt: i.checkedAt })),
      }}
      otherShops={otherShops}
    />
  )
}
