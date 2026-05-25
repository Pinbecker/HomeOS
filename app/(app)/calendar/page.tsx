import { db } from '@/lib/db'
import { calendarEvents, calendarFeeds, items, lists } from '@/lib/db/schema'
import { and, asc, eq, isNull, isNotNull } from 'drizzle-orm'
import { CalendarView } from './calendar-view'
import { getSession } from '@/lib/auth/session'
import { getConnection } from '@/lib/google/oauth'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; event?: string }>
}) {
  const session = await getSession()
  const [{ google, event }, connection, rows, taskRows, feedRows, listRows] = await Promise.all([
    searchParams,
    session ? getConnection(session.user.id) : Promise.resolve(undefined),
    db.query.calendarEvents.findMany({
      orderBy: [asc(calendarEvents.startsAt)],
      columns: { id: true, title: true, startsAt: true, endsAt: true, allDay: true, location: true, description: true, calendarId: true },
    }),
    db.query.items.findMany({
      where: and(eq(items.type, 'task'), isNull(items.deletedAt), isNotNull(items.dueDate)),
      orderBy: [asc(items.dueDate)],
      columns: { id: true, title: true, dueDate: true, listId: true, status: true },
    }),
    session ? db.query.calendarFeeds.findMany({
      where: and(eq(calendarFeeds.householdId, HOUSEHOLD_ID), eq(calendarFeeds.userId, session.user.id)),
      columns: { id: true, name: true, url: true, color: true, enabled: true, lastSyncedAt: true, errorMessage: true },
    }) : Promise.resolve([]),
    db.query.lists.findMany({
      columns: { id: true, color: true },
    }),
  ])

  const listColorMap = new Map(listRows.map(l => [l.id, l.color ?? '#FF9500']))
  // Only show ICS events from this user's own feeds (not other user's subscriptions)
  const myFeedIds = new Set(feedRows.map(f => `ics:${f.id}`))

  const events = rows
    .filter(e => !e.calendarId?.startsWith('ics:') || myFeedIds.has(e.calendarId))
    .map(e => ({
      id: e.id,
      title: e.title,
      start: e.startsAt.getTime(),
      end: e.endsAt ? e.endsAt.getTime() : e.startsAt.getTime(),
      allDay: e.allDay,
      location: e.location,
      description: e.description,
      calendarId: e.calendarId ?? null,
    }))

  const tasks = taskRows.map(t => ({
    id: t.id,
    title: t.title,
    due: t.dueDate!.getTime(),
    listId: t.listId,
    completed: t.status === 'completed',
    color: t.listId ? (listColorMap.get(t.listId) ?? '#FF9500') : '#FF9500',
  }))

  return (
    <CalendarView
      events={events}
      tasks={tasks}
      feeds={feedRows}
      calendarName={process.env.GOOGLE_CALENDAR_NAME ?? 'Family'}
      connected={Boolean(connection)}
      connectedEmail={connection?.googleEmail ?? null}
      notice={google ?? null}
      focusEventId={event ?? null}
      todayMs={Date.now()}
    />
  )
}
