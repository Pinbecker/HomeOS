import { randomUUID } from 'node:crypto'
import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from '@homeos/db'
import { items, notifications, reminders, tvProgrammes, users } from '@homeos/db/schema'
import { sendPushToAll, sendPushToUser, type PushPayload } from './push'

type ChangeRecorder = (change: { entityType: string; entityId: string; operation: 'upsert' | 'delete'; payload: Record<string, unknown> | null }) => Promise<unknown>

const TASK_DUE_SENT_FOR_KEY = 'taskDueNotificationSentFor'
const TASK_DUE_SENT_AT_KEY = 'taskDueNotificationSentAt'
const BIN_SCHEDULES = [
  { id: 'black-bin', name: 'Black bin', colour: 'black', firstCollectionDate: '2026-05-27', intervalWeeks: 3 },
  { id: 'recycling-food', name: 'Recycling containers and food bin', colour: 'blue', firstCollectionDate: '2026-05-27', intervalWeeks: 1 },
  { id: 'green-bin', name: 'Green bin', colour: 'green', firstCollectionDate: '2026-06-02', intervalWeeks: 2 },
  { id: 'hygiene-nappy', name: 'Hygiene and nappy waste bag', colour: 'pink', firstCollectionDate: '2026-06-03', intervalWeeks: 2 },
]

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getNextRecurringDate(firstCollectionDate: string, intervalWeeks: number) {
  const today = startOfDay(new Date())
  const next = new Date(`${firstCollectionDate}T00:00:00`)
  const intervalDays = intervalWeeks * 7
  while (next < today) next.setDate(next.getDate() + intervalDays)
  return next
}

function daysUntil(date: Date) {
  const today = startOfDay(new Date())
  return Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000)
}

function hasExplicitTime(date: Date) {
  return date.getHours() !== 0 || date.getMinutes() !== 0
}

function sentForDueDate(metadata: Record<string, unknown> | null | undefined, dueDate: Date) {
  return metadata?.[TASK_DUE_SENT_FOR_KEY] === dueDate.getTime()
}

function withSentMetadata(metadata: Record<string, unknown> | null | undefined, dueDate: Date, now: Date) {
  return {
    ...(metadata ?? {}),
    [TASK_DUE_SENT_FOR_KEY]: dueDate.getTime(),
    [TASK_DUE_SENT_AT_KEY]: now.toISOString(),
  }
}

function channelName(feedId: string) {
  return feedId.replace(/HD\.uk$|\.uk$/g, '').replace(/And/g, '&')
}

function formatAirtime(date: Date) {
  return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12', timeZone: 'Europe/London' })
}

async function recordNotificationForAll(title: string, body: string | undefined, entityType: string, entityId: string) {
  const existing = await db.query.notifications.findFirst({ where: and(eq(notifications.entityType, entityType), eq(notifications.entityId, entityId)) })
  if (existing) return false

  const allUsers = await db.query.users.findMany({ columns: { id: true } })
  const now = new Date()
  if (allUsers.length > 0) {
    await db.insert(notifications).values(allUsers.map(user => ({
      id: `notification-${randomUUID()}`,
      userId: user.id,
      title,
      body: body ?? null,
      entityType,
      entityId,
      createdAt: now,
    })))
  }
  return true
}

async function recordNotificationForUser(userId: string, title: string, body: string | undefined, entityType: string, entityId: string) {
  const existing = await db.query.notifications.findFirst({
    where: and(eq(notifications.userId, userId), eq(notifications.entityType, entityType), eq(notifications.entityId, entityId)),
  })
  if (existing) return false

  await db.insert(notifications).values({
    id: `notification-${randomUUID()}`,
    userId,
    title,
    body: body ?? null,
    entityType,
    entityId,
    createdAt: new Date(),
  })
  return true
}

export async function dispatchReminders(recordChange: ChangeRecorder) {
  const now = new Date()
  const due = await db.query.reminders.findMany({
    where: and(isNull(reminders.dispatchedAt), isNull(reminders.dismissedAt), lte(reminders.triggerAt, now)),
  })
  if (due.length === 0) return

  const recordIds = [...new Set(due.filter(row => row.entityType === 'record').map(row => row.entityId))]
  const recordMap = new Map<string, string>()
  if (recordIds.length > 0) {
    const rows = await db.query.records.findMany({
      where: (table, { inArray }) => inArray(table.id, recordIds),
      columns: { id: true, title: true },
    })
    rows.forEach(row => recordMap.set(row.id, row.title))
  }

  for (const reminder of due) {
    const entityTitle = recordMap.get(reminder.entityId) ?? null
    const title = reminder.message || (entityTitle ? `Reminder: ${entityTitle}` : 'HomeOS Reminder')
    const body = entityTitle && reminder.message ? entityTitle : undefined
    const url = reminder.entityType === 'record' ? `/life/admin/${reminder.entityId}` : '/'

    await sendPushToUser(reminder.createdById, { title, body, url })
    await db.update(reminders).set({ dispatchedAt: now }).where(eq(reminders.id, reminder.id))
    const updated = await db.query.reminders.findFirst({ where: eq(reminders.id, reminder.id) })
    if (updated) await recordChange({ entityType: 'reminder', entityId: reminder.id, operation: 'upsert', payload: updated })
  }
}

export async function dispatchDailyTaskNotifications() {
  const now = new Date()
  const today = startOfDay(now)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const dueTasks = await db.query.items.findMany({
    where: and(
      eq(items.type, 'task'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
      gte(items.dueDate, today),
      lte(items.dueDate, tomorrow),
    ),
    columns: { id: true, title: true, assigneeId: true },
  })
  if (dueTasks.length === 0) return

  const todayKey = ymd(today)
  const assigned = dueTasks.filter(task => task.assigneeId)
  const unassigned = dueTasks.filter(task => !task.assigneeId)
  const byAssignee = new Map<string, string[]>()

  for (const task of assigned) {
    const list = byAssignee.get(task.assigneeId!) ?? []
    list.push(task.title)
    byAssignee.set(task.assigneeId!, list)
  }

  for (const [userId, titles] of byAssignee) {
    const body = titles.length === 1 ? titles[0] : `${titles.length} tasks due today`
    const shouldSend = await recordNotificationForUser(userId, 'Tasks due today', body, 'tasks_due_today', `${todayKey}:${userId}`)
    if (shouldSend) await sendPushToUser(userId, { title: 'Tasks due today', body, url: '/household/tasks/all' })
  }

  if (unassigned.length > 0) {
    const body = unassigned.length === 1 ? unassigned[0].title : `${unassigned.length} tasks due today`
    const shouldSend = await recordNotificationForAll('Tasks due today', body, 'tasks_due_today', `${todayKey}:all`)
    if (shouldSend) await sendPushToAll({ title: 'Tasks due today', body, url: '/household/tasks/all' })
  }
}

export async function dispatchTaskDueNotifications(recordChange: ChangeRecorder) {
  const now = new Date()
  const lookbackStart = new Date(now.getTime() - 10 * 60_000)
  const dueTasks = await db.query.items.findMany({
    where: and(
      eq(items.type, 'task'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
      isNotNull(items.dueDate),
      gte(items.dueDate, lookbackStart),
      lte(items.dueDate, now),
    ),
  })

  const pending = dueTasks.filter(task => task.dueDate && hasExplicitTime(task.dueDate) && !sentForDueDate(task.metadata, task.dueDate))
  for (const task of pending) {
    if (!task.dueDate) continue
    const payload: PushPayload = { title: 'Task due', body: task.title, url: `/household/tasks/${task.listId ?? 'all'}` }
    if (task.assigneeId) await sendPushToUser(task.assigneeId, payload)
    else await sendPushToAll(payload)

    await db.update(items).set({
      metadata: withSentMetadata(task.metadata, task.dueDate, now),
      updatedAt: now,
    }).where(eq(items.id, task.id))
    const updated = await db.query.items.findFirst({ where: eq(items.id, task.id) })
    if (updated) await recordChange({ entityType: 'item', entityId: task.id, operation: 'upsert', payload: updated })
  }
}

export async function dispatchBinNotifications() {
  const tomorrow = BIN_SCHEDULES
    .map(bin => ({ ...bin, next: getNextRecurringDate(bin.firstCollectionDate, bin.intervalWeeks) }))
    .filter(bin => daysUntil(bin.next) === 1)
  if (tomorrow.length === 0) return

  const names = tomorrow.map(bin => bin.name).join(' & ')
  const entityId = `${ymd(startOfDay(new Date(Date.now() + 86_400_000)))}:${tomorrow.map(bin => bin.id).join(',')}`
  const shouldSend = await recordNotificationForAll('Bin day tomorrow', names, 'bin_day', entityId)
  if (shouldSend) await sendPushToAll({ title: 'Bin day tomorrow', body: names, url: '/' })
}

export async function dispatchTvNotifications() {
  const followed = await db.query.items.findMany({
    where: and(eq(items.type, 'watchlist_tv'), eq(items.status, 'active'), isNull(items.deletedAt)),
    columns: { title: true, metadata: true },
  })
  if (followed.length === 0) return

  const now = new Date()
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  const programmes = await db.query.tvProgrammes.findMany({
    where: and(gte(tvProgrammes.startsAt, now), lte(tvProgrammes.startsAt, dayEnd)),
    orderBy: (table, { asc }) => [asc(table.startsAt)],
  })
  const wanted = new Map(followed.map(show => [show.title.toLowerCase(), typeof show.metadata?.channel === 'string' ? show.metadata.channel : null]))
  const today = ymd(now)

  for (const programme of programmes) {
    const preferredChannel = wanted.get(programme.title.toLowerCase())
    if (preferredChannel === undefined) continue
    const channel = channelName(programme.channelId)
    if (preferredChannel && preferredChannel !== channel) continue

    const entityId = `${programme.title.toLowerCase()}:${today}`
    const body = `${programme.title} - on tonight at ${formatAirtime(programme.startsAt)} on ${channel}`
    const shouldSend = await recordNotificationForAll('On tonight', body, 'tv_tonight', entityId)
    if (shouldSend) await sendPushToAll({ title: 'On tonight', body, url: '/watch' })
  }
}
