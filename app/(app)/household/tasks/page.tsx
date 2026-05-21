import { db } from '@/lib/db'
import { items, lists } from '@/lib/db/schema'
import { and, eq, isNull, asc } from 'drizzle-orm'
import { TasksOverview } from './tasks-overview'

export default async function TasksPage() {
  const [taskLists, activeTasks] = await Promise.all([
    db.query.lists.findMany({
      where: and(eq(lists.type, 'tasks'), eq(lists.archived, false)),
      orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
    }),
    db.query.items.findMany({
      where: and(eq(items.type, 'task'), eq(items.status, 'active'), isNull(items.deletedAt)),
      columns: { id: true, listId: true },
    }),
  ])

  const counts: Record<string, number> = {}
  let inboxCount = 0
  for (const t of activeTasks) {
    if (t.listId) counts[t.listId] = (counts[t.listId] ?? 0) + 1
    else inboxCount += 1
  }

  const taskListIds = new Set(taskLists.map(l => l.id))
  const listsWithCounts = taskLists.map(l => ({
    id: l.id,
    name: l.name,
    color: l.color ?? '#007AFF',
    count: counts[l.id] ?? 0,
  }))

  const totalActive = activeTasks.filter(t => !t.listId || taskListIds.has(t.listId)).length

  return <TasksOverview lists={listsWithCounts} totalActive={totalActive} inboxCount={inboxCount} />
}
