import { db } from '@/lib/db'
import { entityLinks, items, lists, records, users } from '@/lib/db/schema'
import { and, eq, inArray, isNull, asc, desc, ne, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { TaskListView } from './task-list-view'

const RECORD_ENTITY_TYPE = 'record'
const ITEM_ENTITY_TYPE = 'item'

export default async function TaskListPage({ params }: { params: Promise<{ listId: string }> }) {
  const { listId } = await params

  const isAll = listId === 'all'
  const isInbox = listId === 'inbox'

  let title = 'All'
  let color = '#8E8E93'

  if (isInbox) {
    title = 'Inbox'
    color = '#007AFF'
  } else if (!isAll) {
    const list = await db.query.lists.findFirst({ where: eq(lists.id, listId) })
    if (!list) notFound()
    title = list.name
    color = list.color ?? '#007AFF'
  }

  const baseFilter = and(
    eq(items.type, 'task'),
    isNull(items.deletedAt),
    isAll ? undefined : isInbox ? isNull(items.listId) : eq(items.listId, listId),
  )

  const cols = { id: true, title: true, dueDate: true, status: true, listId: true, assigneeId: true } as const

  // activeTasks, completedTasks, and householdUsers are independent — run in parallel
  const [activeTasks, completedTasks, householdUsers, taskLists] = await Promise.all([
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
    db.query.lists.findMany({
      where: and(eq(lists.type, 'tasks'), eq(lists.archived, false)),
      columns: { id: true, name: true },
      orderBy: [asc(lists.sortOrder), asc(lists.createdAt)],
    }),
  ])

  const taskIds = [...activeTasks, ...completedTasks].map(task => task.id)
  const links = taskIds.length
    ? await db.query.entityLinks.findMany({
        where: or(
          and(eq(entityLinks.fromType, ITEM_ENTITY_TYPE), inArray(entityLinks.fromId, taskIds), eq(entityLinks.toType, RECORD_ENTITY_TYPE)),
          and(eq(entityLinks.toType, ITEM_ENTITY_TYPE), inArray(entityLinks.toId, taskIds), eq(entityLinks.fromType, RECORD_ENTITY_TYPE)),
        ),
      })
    : []

  const linkedRecordIds = Array.from(new Set(links.flatMap(link => {
    if (link.fromType === RECORD_ENTITY_TYPE) return [link.fromId]
    if (link.toType === RECORD_ENTITY_TYPE) return [link.toId]
    return []
  })))
  const linkedRecords = linkedRecordIds.length
    ? await db.query.records.findMany({
        where: inArray(records.id, linkedRecordIds),
        columns: { id: true, title: true, icon: true, category: true },
      })
    : []
  const recordById = new Map(linkedRecords.map(record => [record.id, record]))
  const taskSources = Object.fromEntries(links.flatMap(link => {
    const taskId = link.fromType === ITEM_ENTITY_TYPE ? link.fromId : link.toId
    const recordId = link.fromType === RECORD_ENTITY_TYPE ? link.fromId : link.toId
    const record = recordById.get(recordId)
    if (!record) return []
    return [[taskId, {
      id: record.id,
      title: record.title,
      icon: record.icon,
      href: `/life/admin/${record.id}`,
    }]]
  }))

  return (
    <TaskListView
      listId={listId}
      isAll={isAll}
      isInbox={isInbox}
      title={title}
      color={color}
      users={householdUsers}
      lists={taskLists}
      taskSources={taskSources}
      initialActive={activeTasks}
      initialCompleted={completedTasks}
    />
  )
}
