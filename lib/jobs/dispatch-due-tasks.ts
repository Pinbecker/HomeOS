import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { and, eq, isNotNull, isNull, lte, gte } from 'drizzle-orm'
import { sendPushToUser, sendPushToAll } from '@/lib/services/push'

const TASK_DUE_SENT_FOR_KEY = 'taskDueNotificationSentFor'
const TASK_DUE_SENT_AT_KEY = 'taskDueNotificationSentAt'

function hasExplicitTime(date: Date) {
  return date.getHours() !== 0 || date.getMinutes() !== 0
}

function sentForDueDate(metadata: Record<string, unknown> | null, dueDate: Date) {
  return metadata?.[TASK_DUE_SENT_FOR_KEY] === dueDate.getTime()
}

function withSentMetadata(metadata: Record<string, unknown> | null, dueDate: Date, now: Date) {
  return {
    ...(metadata ?? {}),
    [TASK_DUE_SENT_FOR_KEY]: dueDate.getTime(),
    [TASK_DUE_SENT_AT_KEY]: now.toISOString(),
  }
}

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

export async function dispatchTaskDueNotifications() {
  const now = new Date()
  const lookbackStart = new Date(now.getTime() - 10 * 60 * 1000)
  const dueTasks = await db.query.items.findMany({
    where: and(
      eq(items.type, 'task'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
      isNotNull(items.dueDate),
      gte(items.dueDate, lookbackStart),
      lte(items.dueDate, now),
    ),
    columns: { id: true, title: true, assigneeId: true, dueDate: true, metadata: true },
  })

  const pending = dueTasks.filter(task => {
    if (!task.dueDate || !hasExplicitTime(task.dueDate)) return false
    return !sentForDueDate(task.metadata, task.dueDate)
  })

  for (const task of pending) {
    if (!task.dueDate) continue

    const payload = {
      title: 'Task due',
      body: task.title,
      url: '/household/tasks/all',
    }

    if (task.assigneeId) {
      await sendPushToUser(task.assigneeId, payload)
        .catch(err => console.error(`[due-tasks] Timed push failed for task ${task.id}:`, err))
    } else {
      await sendPushToAll(payload)
        .catch(err => console.error(`[due-tasks] Timed broadcast failed for task ${task.id}:`, err))
    }

    await db.update(items)
      .set({
        metadata: withSentMetadata(task.metadata, task.dueDate, now),
        updatedAt: now,
      })
      .where(eq(items.id, task.id))
  }

  if (pending.length > 0) {
    console.log(`[due-tasks] Sent ${pending.length} timed task notification${pending.length === 1 ? '' : 's'}`)
  }
}
