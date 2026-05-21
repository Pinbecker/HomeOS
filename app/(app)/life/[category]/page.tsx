import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { records, type RecordCategory } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getCategoryMap } from '@/lib/entities/category-settings'
import { CategoryView } from './category-view'

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  await requireSession()
  const { category } = await params
  const categoryMap = await getCategoryMap()
  const meta = categoryMap[category]
  if (!meta) notFound()

  const rows = await db.query.records.findMany({
    where: and(eq(records.category, meta.key as RecordCategory)),
    orderBy: [asc(records.sortOrder), asc(records.createdAt)],
  })

  const items = rows.map(r => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    fields: r.fields ?? [],
    renewalDate: r.renewalDate ? r.renewalDate.getTime() : null,
    renewalLabel: r.renewalLabel,
    notes: r.notes,
  }))

  return <CategoryView meta={meta} initialRecords={items} />
}
