import { randomUUID } from 'node:crypto'
import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm'
import { db } from '@homeos/db'
import { household, items, notifications, reminders, tvProgrammes, users } from '@homeos/db/schema'
import { sendPushToAll, sendPushToUser, type PushPayload } from './push'

type ChangeRecorder = (change: { entityType: string; entityId: string; operation: 'upsert' | 'delete'; payload: Record<string, unknown> | null }) => Promise<unknown>
type NotificationPreferences = {
  reminders: { enabled: boolean }
  taskDue: { enabled: boolean }
  tasksDaily: { enabled: boolean; time: string }
  bins: { enabled: boolean; time: string }
  tv: {
    enabled: boolean
    individualEnabled: boolean
    leadMinutes: number
    summaryEnabled: boolean
    summaryTime: string
  }
}

const TASK_DUE_SENT_FOR_KEY = 'taskDueNotificationSentFor'
const TASK_DUE_SENT_AT_KEY = 'taskDueNotificationSentAt'
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const LONDON_TIME_ZONE = 'Europe/London'
const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  reminders: { enabled: true },
  taskDue: { enabled: true },
  tasksDaily: { enabled: true, time: '08:30' },
  bins: { enabled: true, time: '19:00' },
  tv: {
    enabled: true,
    individualEnabled: true,
    leadMinutes: 30,
    summaryEnabled: false,
    summaryTime: '18:00',
  },
}
const BIN_SCHEDULES = [
  { id: 'black-bin', name: 'Black bin', colour: 'black', firstCollectionDate: '2026-05-27', intervalWeeks: 3 },
  { id: 'recycling-food', name: 'Recycling containers and food bin', colour: 'blue', firstCollectionDate: '2026-05-27', intervalWeeks: 1 },
  { id: 'green-bin', name: 'Green bin', colour: 'green', firstCollectionDate: '2026-06-02', intervalWeeks: 2 },
  { id: 'hygiene-nappy', name: 'Hygiene and nappy waste bag', colour: 'pink', firstCollectionDate: '2026-06-03', intervalWeeks: 2 },
]

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function londonParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '00'
  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  }
}

function isAtOrAfterLocalTime(target: string, now = new Date()) {
  return londonParts(now).time >= target
}

function toTime(value: unknown, fallback: string) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback
}

function toBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function toLeadMinutes(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value)
  if (![10, 15, 30, 45, 60, 90, 120].includes(number)) return fallback
  return number
}

function mergeNotificationPreferences(raw: unknown): NotificationPreferences {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const reminders = source.reminders && typeof source.reminders === 'object' ? source.reminders as Record<string, unknown> : {}
  const taskDue = source.taskDue && typeof source.taskDue === 'object' ? source.taskDue as Record<string, unknown> : {}
  const tasksDaily = source.tasksDaily && typeof source.tasksDaily === 'object' ? source.tasksDaily as Record<string, unknown> : {}
  const bins = source.bins && typeof source.bins === 'object' ? source.bins as Record<string, unknown> : {}
  const tv = source.tv && typeof source.tv === 'object' ? source.tv as Record<string, unknown> : {}

  return {
    reminders: { enabled: toBool(reminders.enabled, DEFAULT_NOTIFICATION_PREFERENCES.reminders.enabled) },
    taskDue: { enabled: toBool(taskDue.enabled, DEFAULT_NOTIFICATION_PREFERENCES.taskDue.enabled) },
    tasksDaily: {
      enabled: toBool(tasksDaily.enabled, DEFAULT_NOTIFICATION_PREFERENCES.tasksDaily.enabled),
      time: toTime(tasksDaily.time, DEFAULT_NOTIFICATION_PREFERENCES.tasksDaily.time),
    },
    bins: {
      enabled: toBool(bins.enabled, DEFAULT_NOTIFICATION_PREFERENCES.bins.enabled),
      time: toTime(bins.time, DEFAULT_NOTIFICATION_PREFERENCES.bins.time),
    },
    tv: {
      enabled: toBool(tv.enabled, DEFAULT_NOTIFICATION_PREFERENCES.tv.enabled),
      individualEnabled: toBool(tv.individualEnabled, DEFAULT_NOTIFICATION_PREFERENCES.tv.individualEnabled),
      leadMinutes: toLeadMinutes(tv.leadMinutes, DEFAULT_NOTIFICATION_PREFERENCES.tv.leadMinutes),
      summaryEnabled: toBool(tv.summaryEnabled, DEFAULT_NOTIFICATION_PREFERENCES.tv.summaryEnabled),
      summaryTime: toTime(tv.summaryTime, DEFAULT_NOTIFICATION_PREFERENCES.tv.summaryTime),
    },
  }
}

async function notificationPreferences() {
  const row = await db.query.household.findFirst({ where: eq(household.id, HOUSEHOLD_ID), columns: { settings: true } })
  const raw = row?.settings && typeof row.settings === 'object'
    ? (row.settings as { notificationPreferences?: unknown }).notificationPreferences
    : null
  return mergeNotificationPreferences(raw)
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
  const prefs = await notificationPreferences()
  if (!prefs.reminders.enabled) return

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
  const prefs = await notificationPreferences()
  if (!prefs.tasksDaily.enabled || !isAtOrAfterLocalTime(prefs.tasksDaily.time)) return

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

  const todayKey = londonParts(now).dateKey
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
  const prefs = await notificationPreferences()
  if (!prefs.taskDue.enabled) return

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
  const prefs = await notificationPreferences()
  if (!prefs.bins.enabled || !isAtOrAfterLocalTime(prefs.bins.time)) return

  const tomorrow = BIN_SCHEDULES
    .map(bin => ({ ...bin, next: getNextRecurringDate(bin.firstCollectionDate, bin.intervalWeeks) }))
    .filter(bin => daysUntil(bin.next) === 1)
  if (tomorrow.length === 0) return

  const names = tomorrow.map(bin => bin.name).join(' & ')
  const entityId = `${londonParts(new Date(Date.now() + 86_400_000)).dateKey}:${tomorrow.map(bin => bin.id).join(',')}`
  const shouldSend = await recordNotificationForAll('Bin day tomorrow', names, 'bin_day', entityId)
  if (shouldSend) await sendPushToAll({ title: 'Bin day tomorrow', body: names, url: '/' })
}

export async function dispatchTvNotifications() {
  const prefs = await notificationPreferences()
  if (!prefs.tv.enabled || (!prefs.tv.individualEnabled && !prefs.tv.summaryEnabled)) return

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
  const matches = programmes.filter(programme => {
    const preferredChannel = wanted.get(programme.title.toLowerCase())
    if (preferredChannel === undefined) return false
    const channel = channelName(programme.channelId)
    return !preferredChannel || preferredChannel === channel
  })
  const today = londonParts(now).dateKey

  if (prefs.tv.summaryEnabled && isAtOrAfterLocalTime(prefs.tv.summaryTime) && matches.length > 0) {
    const lines = matches.slice(0, 4).map(programme => `${programme.title} ${formatAirtime(programme.startsAt)}`)
    const extra = matches.length > 4 ? ` +${matches.length - 4} more` : ''
    const body = `${lines.join(', ')}${extra}`
    const shouldSend = await recordNotificationForAll('On tonight', body, 'tv_tonight_summary', today)
    if (shouldSend) await sendPushToAll({ title: 'On tonight', body, url: '/watch' })
  }

  if (!prefs.tv.individualEnabled) return

  const leadStart = new Date(now.getTime() + prefs.tv.leadMinutes * 60_000 - 60_000)
  const leadEnd = new Date(now.getTime() + prefs.tv.leadMinutes * 60_000 + 60_000)
  for (const programme of matches) {
    if (programme.startsAt < leadStart || programme.startsAt > leadEnd) continue
    const channel = channelName(programme.channelId)
    const entityId = `${programme.title.toLowerCase()}:${today}:${programme.startsAt.getTime()}`
    const body = `${programme.title} - starts at ${formatAirtime(programme.startsAt)} on ${channel}`
    const shouldSend = await recordNotificationForAll(programme.title, body, 'tv_tonight', entityId)
    if (shouldSend) await sendPushToAll({ title: programme.title, body, url: '/watch' })
  }
}
