import { randomUUID } from 'node:crypto'
import { and, eq, like, lt, notInArray } from 'drizzle-orm'
import { db } from '@homeos/db'
import { calendarEvents, calendarFeeds } from '@homeos/db/schema'
import { recordExternalChange } from './sync'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const DAY_MS = 86_400_000

type Prop = { name: string; params: string; value: string }
type RawEvent = {
  uid: string
  summary: string
  dtstart: Date
  dtend: Date
  allDay: boolean
  description: string | null
  location: string | null
}

function makeId() {
  return `calendar-${randomUUID()}`
}

function unfold(raw: string) {
  return raw.replace(/\r\n[ \t]|\r[ \t]|\n[ \t]/g, '')
}

function parseLines(text: string): Prop[] {
  return unfold(text)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const colon = line.indexOf(':')
      if (colon === -1) return null
      const namePart = line.slice(0, colon)
      const semi = namePart.indexOf(';')
      return {
        name: (semi === -1 ? namePart : namePart.slice(0, semi)).toUpperCase(),
        params: semi === -1 ? '' : namePart.slice(semi + 1).toUpperCase(),
        value: line.slice(colon + 1),
      }
    })
    .filter(Boolean) as Prop[]
}

function londonOffsetMs(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'shortOffset',
  }).formatToParts(instant)
  const value = parts.find(part => part.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /^GMT([+-])?(\d{1,2})?(?::?(\d{2}))?$/.exec(value)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  return sign * ((hours * 60) + minutes) * 60_000
}

function londonWallTimeToDate(year: number, month: number, day: number, hour: number, minute: number, second: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return new Date(guess.getTime() - londonOffsetMs(guess))
}

function parseIcsDate(value: string, params: string): { date: Date; allDay: boolean } {
  if (params.includes('VALUE=DATE') || /^\d{8}$/.test(value)) {
    return {
      date: new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)))),
      allDay: true,
    }
  }
  if (value.endsWith('Z') && value.length >= 15) {
    return {
      date: new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`),
      allDay: false,
    }
  }
  const floating = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (floating) {
    const [, year, month, day, hour, minute, second] = floating.map(Number)
    return { date: londonWallTimeToDate(year, month, day, hour, minute, second), allDay: false }
  }
  return { date: new Date(value), allDay: false }
}

function parseIcs(text: string): RawEvent[] {
  const events: RawEvent[] = []
  let inEvent = false
  let bag: Record<string, Prop> = {}

  for (const prop of parseLines(text)) {
    if (prop.name === 'BEGIN' && prop.value === 'VEVENT') {
      inEvent = true
      bag = {}
      continue
    }
    if (prop.name === 'END' && prop.value === 'VEVENT') {
      inEvent = false
      const uid = bag.UID?.value
      const summary = bag.SUMMARY?.value?.trim()
      const start = bag.DTSTART
      if (!uid || !summary || !start) continue

      const { date: dtstart, allDay } = parseIcsDate(start.value, start.params)
      let dtend: Date
      if (bag.DTEND) {
        dtend = parseIcsDate(bag.DTEND.value, bag.DTEND.params).date
      } else {
        dtend = allDay ? new Date(dtstart.getTime() + DAY_MS) : new Date(dtstart.getTime() + 3_600_000)
      }
      events.push({
        uid,
        summary,
        dtstart,
        dtend,
        allDay,
        description: bag.DESCRIPTION?.value?.trim().replace(/\\n/g, '\n') ?? null,
        location: bag.LOCATION?.value?.trim() ?? null,
      })
      continue
    }
    if (inEvent) bag[prop.name] = prop
  }
  return events
}

async function recordEventUpsert(id: string) {
  const row = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.id, id) })
  if (!row) return
  await recordExternalChange({ entityType: 'calendar_event', entityId: id, operation: 'upsert', payload: row })
}

async function recordFeedUpsert(id: string) {
  const row = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, id) })
  if (!row) return
  await recordExternalChange({ entityType: 'calendar_feed', entityId: id, operation: 'upsert', payload: row })
}

async function recordEventDelete(id: string) {
  await recordExternalChange({ entityType: 'calendar_event', entityId: id, operation: 'delete', payload: null })
}

async function sweepOrphanedIcsEvents() {
  const feeds = await db.query.calendarFeeds.findMany({ columns: { id: true } })
  const valid = feeds.map(feed => `ics:${feed.id}`)
  const orphaned = valid.length > 0
    ? await db.query.calendarEvents.findMany({ where: and(like(calendarEvents.calendarId, 'ics:%'), notInArray(calendarEvents.calendarId, valid)), columns: { id: true } })
    : await db.query.calendarEvents.findMany({ where: like(calendarEvents.calendarId, 'ics:%'), columns: { id: true } })

  for (const event of orphaned) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, event.id))
    await recordEventDelete(event.id)
  }
}

export async function syncIcsFeed(feedId: string): Promise<{ count: number; error?: string }> {
  const feed = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, feedId) })
  if (!feed) return { count: 0, error: 'Feed not found' }
  if (!feed.enabled) return { count: 0 }

  const calendarId = `ics:${feedId}`
  const now = new Date()
  const windowStart = new Date(now.getTime() - 90 * DAY_MS)
  const windowEnd = new Date(now.getTime() + 365 * DAY_MS)

  await sweepOrphanedIcsEvents()

  try {
    const response = await fetch(feed.url, {
      headers: { 'User-Agent': 'HomeOS/1.0 (calendar feed sync)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${feed.url}`)
    const parsed = parseIcs(await response.text()).filter(event => event.dtstart >= windowStart && event.dtstart <= windowEnd)

    for (const event of parsed) {
      const externalId = `${feed.url}::${event.uid}`
      const existing = await db.query.calendarEvents.findFirst({ where: eq(calendarEvents.externalId, externalId) })
      const id = existing?.id ?? makeId()
      const row = {
        id,
        householdId: feed.householdId ?? HOUSEHOLD_ID,
        externalId,
        calendarId,
        title: event.summary,
        description: event.description,
        location: event.location,
        startsAt: event.dtstart,
        endsAt: event.dtend,
        allDay: event.allDay,
        recurrenceRule: null,
        rawIcal: null,
        lastSyncedAt: now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
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
          rawIcal: row.rawIcal,
          lastSyncedAt: row.lastSyncedAt,
          updatedAt: row.updatedAt,
        },
      })
      await recordEventUpsert(id)
    }

    const stale = await db.query.calendarEvents.findMany({
      where: and(eq(calendarEvents.calendarId, calendarId), lt(calendarEvents.lastSyncedAt, now)),
      columns: { id: true },
    })
    for (const event of stale) {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, event.id))
      await recordEventDelete(event.id)
    }

    await db.update(calendarFeeds).set({ lastSyncedAt: now, errorMessage: null, updatedAt: now }).where(eq(calendarFeeds.id, feedId))
    await recordFeedUpsert(feedId)
    return { count: parsed.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(calendarFeeds).set({ errorMessage: message, updatedAt: new Date() }).where(eq(calendarFeeds.id, feedId))
    await recordFeedUpsert(feedId)
    return { count: 0, error: message }
  }
}

export async function syncAllIcsFeeds() {
  const feeds = await db.query.calendarFeeds.findMany({ where: eq(calendarFeeds.enabled, true), columns: { id: true } })
  for (const feed of feeds) {
    await syncIcsFeed(feed.id)
  }
}
