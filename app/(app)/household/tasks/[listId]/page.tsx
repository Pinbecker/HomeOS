import { db } from '@/lib/db'
import { items, lists, users } from '@/lib/db/schema'
import { and, eq, isNull, asc, desc, ne } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { TaskListView } from './task-list-view'

export default async function TaskListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params

  const isAll = listId === 'all'

  let title = 'All'
  let color = '#8E8E93'

  if (!isAll) {
    const list = await db.query.lists.findFirst({ where: eq(lists.id, listId) })
    if (!list) notFound()
    title = list.name
    color = list.color ?? '#007AFF'
  }

  const baseFilter = and(
    eq(items.type, 'task'),
    isNull(items.deletedAt),
    isAll ? undefined : eq(items.listId, listId),
  )

  const cols = { id: true, title: true, dueDate: true, status: true, listId: true, assigneeId: true } as const

  // activeTasks, completedTasks, and householdUsers are independent — run in parallel
  const [activeTasks, completedTasks, householdUsers] = await Promise.all([
    db.query.items.findMany({
      where: and(baseFilter, eq(items.status, 'active')),
      orderBy: [asc(items.dueDate), asc(items.createdAt)],
      columns: cols,
    }),
    db.query.items.findMany({
      where: and(baseFilter, ne(items.status, 'active')),
      orderBy: [desc(items.completedAt)],
      columns: cols,
    }),
    db.query.users.findMany({
      columns: { id: true, name: true },
      orderBy: [asc(users.createdAt)],
    }),
  ])

  return (
    <TaskListView
      listId={listId}
      isAll={isAll}
      title={title}
      color={color}
      users={householdUsers}
      initialActive={activeTasks}
      initialCompleted={completedTasks}
    />
  )
}
