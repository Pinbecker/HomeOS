import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { items, lists, listItems, bins, records } from '@/lib/db/schema'
import { eq, and, isNull, isNotNull, lte, gte, asc, desc } from 'drizzle-orm'
import { DashboardClient } from '@/components/features/dashboard/dashboard-client'
import { getNextBinCollection } from '@/lib/utils/bins'

export default async function DashboardPage() {
  const session = await requireSession()

  // Fetch active shopping items (first list of type 'shopping')
  const shoppingList = await db.query.lists.findFirst({
    where: and(eq(lists.type, 'shopping'), isNull(lists.archived)),
    with: {
      items: {
        where: eq(listItems.checked, false),
        orderBy: [asc(listItems.sortOrder), asc(listItems.createdAt)],
        limit: 6,
      },
    },
  })

  // Fetch tasks due today or overdue
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

  const dueTasks = await db.query.items.findMany({
    where: and(
      eq(items.type, 'task'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
      lte(items.dueDate, endOfToday)
    ),
    orderBy: [asc(items.dueDate), asc(items.createdAt)],
    limit: 5,
    with: {
      assignee: true,
      createdBy: true,
    },
  })

  // Fetch inbox items (uncategorised captures)
  const inboxCount = await db.$count(
    items,
    and(eq(items.type, 'inbox'), eq(items.status, 'active'), isNull(items.deletedAt))
  )

  // Fetch inbox preview (first 2 titles)
  const inboxPreview = await db.query.items.findMany({
    where: and(eq(items.type, 'inbox'), eq(items.status, 'active'), isNull(items.deletedAt)),
    orderBy: [desc(items.createdAt)],
    limit: 2,
    columns: { title: true, id: true },
  })

  // Fetch bin collection schedule
  const binsList = await db.query.bins.findMany({
    where: eq(bins.active, true),
  })

  const nextBins = binsList.map(bin => ({
    ...bin,
    nextCollection: getNextBinCollection(bin),
  })).sort((a, b) => a.nextCollection.getTime() - b.nextCollection.getTime())

  const relevantBins = nextBins.filter(b => {
    const daysUntil = Math.ceil((b.nextCollection.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntil <= 1
  })

  // Upcoming renewals / due dates within the next 30 days (or overdue)
  const renewalWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59)
  const renewalRows = await db.query.records.findMany({
    where: and(isNotNull(records.renewalDate), lte(records.renewalDate, renewalWindow)),
    orderBy: [asc(records.renewalDate)],
    columns: { id: true, title: true, category: true, renewalLabel: true, renewalDate: true },
  })
  const renewals = renewalRows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    label: r.renewalLabel,
    date: r.renewalDate!,
  }))

  return (
    <DashboardClient
      user={session.user}
      shoppingItems={shoppingList?.items ?? []}
      shoppingListId={shoppingList?.id}
      dueTasks={dueTasks}
      inboxCount={inboxCount}
      inboxPreview={inboxPreview}
      bins={relevantBins}
      renewals={renewals}
    />
  )
}
