import { google } from 'googleapis'
import { and, eq, lt } from 'drizzle-orm'
import { db } from '@homeos/db'
import { calendarEvents } from '@homeos/db/schema'
import {
  anyAuthorizedClient,
  authorizedContextForUser,
  setConnectionCalendarId,
  type GoogleOAuthClient,
} from './google-oauth'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const TIME_ZONE = 'Europe/London'

type Conn = { id: string; calendarId: string | null }
export type CalendarMirrorChange = {
  entityType: 'calendar_event'
  entityId: string
  operation: 'upsert' | 'delete'
  payload: Record<string, unknown> | null
}
export type EventInput = {
  title: string
  allDay: boolean
  start: number
  end: number
  location?: string | null
  description?: string | null
}

export class NotConnectedError extends Error {
  constructor() {
    super('NOT_CONNECTED')
  }
}

function api(client: GoogleOAuthClient) {
  return google.calendar({ version: 'v3', auth: client })
}

async function resolveCalendarId(client: GoogleOAuthClient, conn?: Conn) {
  const envId = process.env.GOOGLE_CALENDAR_ID
  if (envId) return envId
  if (conn?.calendarId) return conn.calendarId

  const name = (process.env.GOOGLE_CALENDAR_NAME ?? 'Family').trim().toLowerCase()
  const list = await api(client).calendarList.list({ maxResults: 250 })
  const match = list.data.items?.find(calendar => (calendar.summary ?? '').trim().toLowerCase() === name)
  if (!match?.id) {
    const available = (list.data.items ?? []).map(calendar => calendar.summary).filter(Boolean).join(', ')
    throw new Error(`Google calendar "${process.env.GOOGLE_CALENDAR_NAME}" not found. Available: ${available}`)
  }
  if (conn) await setConnectionCalendarId(conn.id, match.id)
  return match.id
}

function parseGoogleStart(value?: { date?: string | null; dateTime?: string | null } | null) {
  if (!value) return null
  if (value.date) {
    const [year, month, day] = value.date.split('-').map(Number)
    return { date: new Date(Date.UTC(year, month - 1, day)), allDay: true }
  }
  if (value.dateTime) return { date: new Date(value.dateTime), allDay: false }
  return null
}

function parseGoogleEnd(value: { date?: string | null; dateTime?: string | null } | null | undefined, allDay: boolean) {
  if (!value) return null
  if (allDay && value.date) {
    const [year, month, day] = value.date.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day))
  }
  if (value.dateTime) return new Date(value.dateTime)
  return null
}

function ymd(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function normalizeInput(input: EventInput) {
  const minimumDurationMs = input.allDay ? 86_400_000 : 3_600_000
  return {
    ...input,
    end: input.end > input.start ? input.end : input.start + minimumDurationMs,
  }
}

function toGoogleEvent(rawInput: EventInput) {
  const input = normalizeInput(rawInput)
  const event: {
    summary: string
    location?: string
    description?: string
    start?: { date?: string; dateTime?: string; timeZone?: string }
    end?: { date?: string; dateTime?: string; timeZone?: string }
  } = {
    summary: input.title,
    location: input.location ?? undefined,
    description: input.description ?? undefined,
  }

  if (input.allDay) {
    event.start = { date: ymd(new Date(input.start)) }
    event.end = { date: ymd(new Date(input.end)) }
  } else {
    event.start = { dateTime: new Date(input.start).toISOString(), timeZone: TIME_ZONE }
    event.end = { dateTime: new Date(input.end).toISOString(), timeZone: TIME_ZONE }
  }

  return event
}

async function toMirrorRow(event: {
  id?: string | null
  start?: { date?: string | null; dateTime?: string | null } | null
  end?: { date?: string | null; dateTime?: string | null } | null
  summary?: string | null
  description?: string | null
  location?: string | null
  recurrence?: string[] | null
}, calendarId: string, now: Date, preferredId?: string) {
  if (!event.id) return null
  const start = parseGoogleStart(event.start)
  if (!start) return null
  const title = event.summary?.trim()
  if (!title) return null

  let endsAt = parseGoogleEnd(event.end, start.allDay)
  if (!endsAt || endsAt.getTime() <= start.date.getTime()) {
    endsAt = new Date(start.date.getTime() + (start.allDay ? 86_400_000 : 3_600_000))
  }

  const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.externalId, event.id) })
  return {
    id: existing?.id ?? preferredId ?? crypto.randomUUID(),
    householdId: HOUSEHOLD_ID,
    externalId: event.id,
    calendarId,
    title,
    description: event.description ?? null,
    location: event.location ?? null,
    startsAt: start.date,
    endsAt,
    allDay: start.allDay,
    recurrenceRule: event.recurrence?.join('\n') ?? null,
    rawIcal: existing?.rawIcal ?? null,
    lastSyncedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
}

function sameGoogleMirror(existing: typeof calendarEvents.$inferSelect, row: typeof calendarEvents.$inferInsert) {
  return existing.calendarId === row.calendarId
    && existing.title === row.title
    && existing.description === row.description
    && existing.location === row.location
    && existing.startsAt.getTime() === row.startsAt.getTime()
    && (existing.endsAt?.getTime() ?? null) === (row.endsAt?.getTime() ?? null)
    && existing.allDay === row.allDay
    && existing.recurrenceRule === row.recurrenceRule
}

async function upsertMirror(row: typeof calendarEvents.$inferInsert): Promise<CalendarMirrorChange | null> {
  const existing = row.externalId
    ? await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.externalId, row.externalId) })
    : null

  if (existing && sameGoogleMirror(existing, row)) {
    await db.update(calendarEvents)
      .set({ lastSyncedAt: row.lastSyncedAt })
      .where(eq(calendarEvents.id, existing.id))
    return null
  }

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

  const saved = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, row.id) })
  return { entityType: 'calendar_event', entityId: row.id, operation: 'upsert', payload: saved as Record<string, unknown> | null }
}

export async function syncGoogleCalendar(): Promise<CalendarMirrorChange[]> {
  const ctx = await anyAuthorizedClient()
  if (!ctx) {
    console.log('[calendar-sync] No Google account connected, skipping')
    return []
  }

  const changes: CalendarMirrorChange[] = []
  const now = new Date()
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)
  const calendar = api(ctx.client)
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180)

  let pageToken: string | undefined
  let count = 0
  do {
    const response = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: 'startTime',
      showDeleted: false,
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      maxResults: 2500,
      pageToken,
    })

    for (const event of response.data.items ?? []) {
      const row = await toMirrorRow(event, calendarId, now)
      if (row) {
        const change = await upsertMirror(row)
        if (change) changes.push(change)
        count++
      }
    }
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  const stale = await db.query.calendarEvents.findMany({
    where: and(eq(calendarEvents.calendarId, calendarId), lt(calendarEvents.lastSyncedAt, now)),
    columns: { id: true },
  })
  if (stale.length > 0) {
    await db.delete(calendarEvents).where(and(eq(calendarEvents.calendarId, calendarId), lt(calendarEvents.lastSyncedAt, now)))
    changes.push(...stale.map(row => ({ entityType: 'calendar_event' as const, entityId: row.id, operation: 'delete' as const, payload: null })))
  }

  console.log(`[calendar-sync] Synced ${count} events from Google calendar ${calendarId}`)
  return changes
}

export async function createGoogleEvent(userId: string, input: EventInput, preferredId?: string) {
  const ctx = await authorizedContextForUser(userId)
  if (!ctx) throw new NotConnectedError()
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)
  const response = await api(ctx.client).events.insert({ calendarId, requestBody: toGoogleEvent(input) })
  const row = await toMirrorRow(response.data, calendarId, new Date(), preferredId)
  if (!row) throw new Error('Google returned an unusable event')
  await upsertMirror(row)
  return row
}

export async function updateGoogleEvent(userId: string, rowId: string, input: EventInput) {
  const ctx = await authorizedContextForUser(userId)
  if (!ctx) throw new NotConnectedError()
  const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, rowId) })
  if (!existing?.externalId) return createGoogleEvent(userId, input, rowId)
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)
  const response = await api(ctx.client).events.patch({
    calendarId,
    eventId: existing.externalId,
    requestBody: toGoogleEvent(input),
  })
  const row = await toMirrorRow(response.data, calendarId, new Date())
  if (!row) throw new Error('Google returned an unusable event')
  await upsertMirror(row)
  return row
}

export async function deleteGoogleEvent(userId: string, rowId: string) {
  const ctx = await authorizedContextForUser(userId)
  if (!ctx) throw new NotConnectedError()
  const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, rowId) })
  if (!existing?.externalId) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, rowId))
    return
  }
  const calendarId = await resolveCalendarId(ctx.client, ctx.conn)
  try {
    await api(ctx.client).events.delete({ calendarId, eventId: existing.externalId })
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code
    if (code !== 404 && code !== 410) throw error
  }
  await db.delete(calendarEvents).where(eq(calendarEvents.id, rowId))
}
