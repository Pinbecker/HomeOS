import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { items, lists } from '@/lib/db/schema'
import { and, eq, isNull, asc } from 'drizzle-orm'
import { TasksOverview } from './tasks-overview'

export default async function TasksPage() {
  await requireSession()

  const taskLists = await db.query.lists.findMany({
    where: and(eq(lists.type, 'tasks'), eq(lists.archived, false)),
    orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
  })

  const activeTasks = await db.query.items.findMany({
    where: and(eq(items.type, 'task'), eq(items.status, 'active'), isNull(items.deletedAt)),
    columns: { id: true, listId: true },
  })

  const counts: Record<string, number> = {}
  for (const t of activeTasks) {
    if (t.listId) counts[t.listId] = (counts[t.listId] ?? 0) + 1
  }

  const listsWithCounts = taskLists.map(l => ({
    id: l.id,
    name: l.name,
    color: l.color ?? '#007AFF',
    count: counts[l.id] ?? 0,
  }))

  return <TasksOverview lists={listsWithCounts} totalActive={activeTasks.length} />
}
