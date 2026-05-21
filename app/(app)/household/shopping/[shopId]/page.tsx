import { db } from '@/lib/db'
import { lists, listItems } from '@/lib/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { ShopView } from './shop-view'

export default async function ShopPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params

  const shop = await db.query.lists.findFirst({
    where: and(eq(lists.id, shopId), eq(lists.type, 'shopping')),
    with: {
      items: {
        orderBy: [asc(listItems.checked), asc(listItems.sortOrder), asc(listItems.createdAt)],
      },
    },
  })

  if (!shop) notFound()

  return (
    <ShopView
      shop={{
        id: shop.id,
        name: shop.name,
        color: shop.color ?? '#34C759',
        items: shop.items.map(i => ({ id: i.id, title: i.title, checked: i.checked, checkedAt: i.checkedAt })),
      }}
    />
  )
}
