import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { calendarEvents } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
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

  // Serialise dates to epoch ms for the client component
  const events = rows.map(e => ({
    id: e.id,
    title: e.title,
    start: e.startsAt.getTime(),
    end: e.endsAt ? e.endsAt.getTime() : e.startsAt.getTime(),
    allDay: e.allDay,
    location: e.location,
    description: e.description,
  }))

  return <CalendarView events={events} calendarName={process.env.CALDAV_CALENDAR_NAME ?? 'Family'} />
}
