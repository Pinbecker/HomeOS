import { google, calendar_v3 } from 'googleapis'
import { db } from '@/lib/db'
import { calendarEvents } from '@/lib/db/schema'
import { and, eq, lt } from 'drizzle-orm'
import { ulid } from 'ulid'
import {
  anyAuthorizedClient,
  authorizedContextForUser,
  setConnectionCalendarId,
  type GoogleOAuthClient,
} from './oauth'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const TIME_ZONE = 'Europe/London'

type Conn = { id: string; calendarId: string | null }

export type EventInput = {
  title: string
  allDay: boolean
  // For all-day events these are UTC-midnight ms (timezone-independent calendar dates).
  // For timed events they are real instants in ms.
  start: number
  end: number
  location?: string | null
  description?: string | null
}

function api(client: GoogleOAuthClient): calendar_v3.Calendar {
  return google.calendar({ version: 'v3', auth: client })
}

// Find the shared calendar's id: explicit env override → cached on the
// connection → resolve by display name and cache it.
async function resolveCalendarId(client: GoogleOAuthClient, conn?: Conn): Promise<string> {
  const envId = process.env.GOOGLE_CALENDAR_ID
  if (envId) return envId
  if (conn?.calendarId) return conn.calendarId

  const name = (process.env.GOOGLE_CALENDAR_NAME ?? 'Family').trim().toLowerCase()
  const list = await api(client).calendarList.list({ maxResults: 250 })
  const match = list.data.items?.find(c => (c.summary ?? '').trim().toLowerCase() === name)
  if (!match?.id) {
    const available = (list.data.items ?? []).map(c => c.summary).filter(Boolean).join(', ')
    throw new Error(`Google calendar "${process.env.GOOGLE_CALENDAR_NAME}" not found. Available: ${available}`)
  }
  if (conn) await setConnectionCalendarId(conn.id, match.id)
  return match.id
}

// ---------- date mapping ----------

function parseGoogleStart(d?: calendar_v3.Schema$EventDateTime | null): { date: Date; allDay: boolean } | null {
  if (!d) return null
  if (d.date) {
    // All-day: "YYYY-MM-DD" → UTC midnight so it's the same day for every viewer.
    const [y, m, day] = d.date.split('-').map(Number)
    return { date: new Date(Date.UTC(y, m - 1, day)), allDay: true }
  }
  if (d.dateTime) return { date: new Date(d.dateTime), allDay: false }
  return null
}

function parseGoogleEnd(d: calendar_v3.Schema$EventDateTime | null | undefined, allDay: boolean): Date | null {
  if (!d) return null
  if (allDay && d.date) {
    const [y, m, day] = d.date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, day))
  }
  if (d.dateTime) return new Date(d.dateTime)
  return null
}

// Build the Google event resource for a write.
function toGoogleEvent(input: EventInput): calendar_v3.Schema$Event {
  const ev: calendar_v3.Schema$Event = {
    summary: input.title,
    location: input.location ?? undefined,
    description: input.description ?? undefined,
  }
  if (input.allDay) {
    const startDate = new Date(input.start)
    let endDate = new Date(input.end)
    // Google all-day end date is exclusive; ensure at least one day.
    if (endDate.getTime() <= startDate.getTime()) endDate = new Date(startDate.getTime() + 86_400_000)
    ev.start = { date: ymd(startDate) }
    ev.end = { date: ymd(endDate) }
  } else {
    ev.start = { dateTime: new Date(input.start).toISOString(), timeZone: TIME_ZONE }
    ev.end = { dateTime: new Date(input.end).toISOString(), timeZone: TIME_ZONE }
  }
  return ev
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Map a Google event to a calendar_events mirror row (returns null if unusable).
function toMirrorRow(ev: calendar_v3.Schema$Event, calendarId: string, now: Date) {
  if (!ev.id) return null
  const start = parseGoogleStart(ev.start)
  if (!start) return null
  const title = ev.summary?.trim()
  if (!title) return null

  let endsAt = parseGoogleEnd(ev.end, start.allDay)
  if (!endsAt) endsAt = start.allDay ? new Date(start.date.getTime() + 86_400_000) : new Date(start.date.getTime() + 3_600_000)

  return {
    id: ulid(),
    householdId: HOUSEHOLD_ID,
    externalId: ev.id,
    calendarId,
    title,
    description: ev.description ?? null,
    location: ev.location ?? null,
    startsAt: start.date,
    endsAt,
    allDay: start.allDay,
    recurrenceRule: ev.recurrence?.join('\n') ?? null,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof calendarEvents.$inferInsert
}

async function upsertMirror(row: typeof calendarEvents.$inferInsert) {
  await db.insert(calendarEvents).values(row).onConflictDoUpdate({
    target: calendarEvents.externalId,
    set: {
      calendarId: row.calendarId,
      title: row.title,
      description: row.description,
      location: row.location,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      allDay: row.allDay,
      recurrenceRule: row.recurrenceRule,
      lastSyncedAt: row.lastSyncedAt,
      updatedAt: row.updatedAt,
    },
  })
}

// ---------- sync (read) ----------

// Pull the shared calendar into the local mirror. Windowed full sync:
// 30 days back → 180 days ahead, recurrences expanded. Reads via any
// connected account (it's a shared calendar).
export async function syncCalendar(): Promise<void> {
  const ctx = await anyAuthorizedClient()
  if (!ctx) {
    console.log('[calendar-sync] No Google account connected, skipping')
    return
  }

  const now = new Date()
  try {
    const calendarId = await resolveCalendarId(ctx.client, ctx.conn)
    const cal = api(ctx.client)

    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
    const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180)

    let pageToken: string | undefined
    let count = 0
    do {
      const res = await cal.events.list({
        calendarId,
        singleEvents: true,
        orderBy: 'startTime',
        showDeleted: false,
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        maxResults: 2500,
        pageToken,
      })

      for (const ev of res.data.items ?? []) {
        const row = toMirrorRow(ev, calendarId, now)
        if (row) {
          await upsertMirror(row)
          count++
        }
      }
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken)

    // Prune only Google-calendar rows not seen this run (deleted or moved out of window).
    // Scoped to this calendarId so ICS feed events are never touched.
    await db.delete(calendarEvents).where(
      and(eq(calendarEvents.calendarId, calendarId), lt(calendarEvents.lastSyncedAt, now))
    )

    console.log(`[calendar-sync] Synced ${count} events from Google calendar ${calendarId}`)
  } catch (err) {
    console.error('[calendar-sync] Sync failed:', err instanceof Error ? err.message : err)
  }
}

// ---------- writes (write-through to Google, then mirror) ----------

class NotConnectedError extends Error {
  constructor() { super('NOT_CONNECTED') }
}
export { NotConnectedError }

export async function createEvent(userId: string, input: EventInput): Promise<string> {
  const ctx = await authorizedContextForUser(userId)
  if (!ctx) throw new NotConnectedError()
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)

  const res = await api(ctx.client).events.insert({ calendarId, requestBody: toGoogleEvent(input) })
  const row = toMirrorRow(res.data, calendarId, new Date())
  if (row) await upsertMirror(row)
  return res.data.id ?? ''
}

export async function updateEvent(userId: string, rowId: string, input: EventInput): Promise<void> {
  const ctx = await authorizedContextForUser(userId)
  if (!ctx) throw new NotConnectedError()

  const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, rowId) })
  if (!existing?.externalId) throw new Error('Event not found')
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)

  const res = await api(ctx.client).events.patch({
    calendarId,
    eventId: existing.externalId,
    requestBody: toGoogleEvent(input),
  })

  const row = toMirrorRow(res.data, calendarId, new Date())
  if (row) await upsertMirror(row)
}

export async function deleteEvent(userId: string, rowId: string): Promise<void> {
  const ctx = await authorizedContextForUser(userId)
  if (!ctx) throw new NotConnectedError()

  const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, rowId) })
  if (!existing?.externalId) throw new Error('Event not found')
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)

  try {
    await api(ctx.client).events.delete({ calendarId, eventId: existing.externalId })
  } catch (err: unknown) {
    // 404/410 means it's already gone on Google — fine, just clear the mirror.
    const code = (err as { code?: number })?.code
    if (code !== 404 && code !== 410) throw err
  }
  await db.delete(calendarEvents).where(eq(calendarEvents.id, rowId))
}
