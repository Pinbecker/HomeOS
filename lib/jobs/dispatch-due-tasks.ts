import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { and, eq, isNull, lte, gte } from 'drizzle-orm'
import { sendPushToUser, sendPushToAll } from '@/lib/services/push'

export async function dispatchDueTasks() {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const dueTasks = await db.query.items.findMany({
    where: and(
      eq(items.type, 'task'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
      gte(items.dueDate, startOfDay),
      lte(items.dueDate, endOfDay),
    ),
    columns: { id: true, title: true, assigneeId: true, listId: true },
  })

  if (dueTasks.length === 0) return

  // Group by assignee: notify assignee specifically, unassigned tasks go to everyone
  const assigned = dueTasks.filter(t => t.assigneeId)
  const unassigned = dueTasks.filter(t => !t.assigneeId)

  // Group assigned tasks by assignee
  const byAssignee = new Map<string, string[]>()
  for (const task of assigned) {
    const list = byAssignee.get(task.assigneeId!) ?? []
    list.push(task.title)
    byAssignee.set(task.assigneeId!, list)
  }

  for (const [userId, titles] of byAssignee) {
    const body = titles.length === 1 ? titles[0] : `${titles.length} tasks due today`
    await sendPushToUser(userId, {
      title: '📋 Tasks due today',
      body,
      url: '/household/tasks/all',
    }).catch(err => console.error(`[due-tasks] Push failed for user ${userId}:`, err))
  }

  if (unassigned.length > 0) {
    const body = unassigned.length === 1 ? unassigned[0].title : `${unassigned.length} tasks due today`
    await sendPushToAll({
      title: '📋 Tasks due today',
      body,
      url: '/household/tasks/all',
    }).catch(err => console.error('[due-tasks] sendPushToAll failed:', err))
  }

  console.log(`[due-tasks] Notified for ${dueTasks.length} due tasks`)
}
