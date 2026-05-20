import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { calendarEvents, items } from '@/lib/db/schema'
import { and, asc, eq, isNull, isNotNull } from 'drizzle-orm'
import { CalendarView } from './calendar-view'

export default async function CalendarPage() {
  await requireSession()

  const rows = await db.query.calendarEvents.findMany({
    orderBy: [asc(calendarEvents.startsAt)],
    columns: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      location: true,
      description: true,
    },
  })

  const events = rows.map(e => ({
    id: e.id,
    title: e.title,
    start: e.startsAt.getTime(),
    end: e.endsAt ? e.endsAt.getTime() : e.startsAt.getTime(),
    allDay: e.allDay,
    location: e.location,
    description: e.description,
  }))

  // Tasks with a due date — shown on the calendar (distinct from events)
  const taskRows = await db.query.items.findMany({
    where: and(eq(items.type, 'task'), isNull(items.deletedAt), isNotNull(items.dueDate)),
    orderBy: [asc(items.dueDate)],
    columns: { id: true, title: true, dueDate: true, listId: true, status: true },
  })

  const tasks = taskRows.map(t => ({
    id: t.id,
    title: t.title,
    due: t.dueDate!.getTime(),
    listId: t.listId,
    completed: t.status === 'completed',
  }))

  return <CalendarView events={events} tasks={tasks} calendarName={process.env.CALDAV_CALENDAR_NAME ?? 'Family'} />
}
