/**
 * ICS/iCal feed sync service.
 *
 * Fetches an external ICS URL, parses VEVENT blocks, and upserts them into
 * calendar_events with calendarId = "ics:{feedId}". Events outside the sync
 * window (90 days back → 365 ahead) are deleted from the mirror.
 *
 * No third-party deps — parses the subset of RFC 5545 we care about:
 * DATE, DATE-TIME (UTC Z suffix, TZID param, floating), SUMMARY, DESCRIPTION,
 * LOCATION, UID. Recurrence rules are stored but not expanded (future work).
 */

import { db } from '@/lib/db'
import { calendarFeeds, calendarEvents } from '@/lib/db/schema'
import { eq, and, lt } from 'drizzle-orm'
import { ulid } from 'ulid'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

// ── ICS text helpers ──────────────────────────────────────────────────────────

/** Unfold RFC-5545 line continuations (CRLF + WSP → nothing). */
function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]|\r[ \t]|\n[ \t]/g, '')
}

type Prop = { name: string; params: string; value: string }

function parseLines(text: string): Prop[] {
  return unfold(text)
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const ci = line.indexOf(':')
      if (ci === -1) return null
      const namePart = line.slice(0, ci)
      const value = line.slice(ci + 1)
      const si = namePart.indexOf(';')
      return {
        name: (si === -1 ? namePart : namePart.slice(0, si)).toUpperCase(),
        params: si === -1 ? '' : namePart.slice(si + 1).toUpperCase(),
        value,
      }
    })
    .filter(Boolean) as Prop[]
}

function parseIcsDate(value: string, params: string): { date: Date; allDay: boolean } {
  // All-day: VALUE=DATE or plain 8-digit
  if (params.includes('VALUE=DATE') || /^\d{8}$/.test(value)) {
    const y = parseInt(value.slice(0, 4), 10)
    const m = parseInt(value.slice(4, 6), 10) - 1
    const d = parseInt(value.slice(6, 8), 10)
    return { date: new Date(Date.UTC(y, m, d)), allDay: true }
  }
  // UTC: 15-char with trailing Z
  if (value.endsWith('Z') && value.length >= 15) {
    const s = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`
    return { date: new Date(s), allDay: false }
  }
  // Floating / TZID — parse as local. Best-effort; correct for UK usage.
  const m2 = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (m2) {
    const [, yr, mo, dy, hh, mm, ss] = m2.map(Number)
    return { date: new Date(yr, mo - 1, dy, hh, mm, ss), allDay: false }
  }
  return { date: new Date(value), allDay: false }
}

type RawEvent = {
  uid: string
  summary: string
  dtstart: Date
  dtend: Date
  allDay: boolean
  description: string | null
  location: string | null
}

function parseIcs(icsText: string): RawEvent[] {
  const props = parseLines(icsText)
  const events: RawEvent[] = []

  let inEvent = false
  let bag: Record<string, Prop> = {}

  for (const p of props) {
    if (p.name === 'BEGIN' && p.value === 'VEVENT') { inEvent = true; bag = {}; continue }
    if (p.name === 'END'   && p.value === 'VEVENT') {
      inEvent = false
      const uid  = bag['UID']?.value
      const sum  = bag['SUMMARY']?.value?.trim()
      const dts  = bag['DTSTART']
      if (!uid || !sum || !dts) continue

      const { date: dtstart, allDay } = parseIcsDate(dts.value, dts.params)

      let dtend: Date
      if (bag['DTEND']) {
        dtend = parseIcsDate(bag['DTEND'].value, bag['DTEND'].params).date
      } else if (bag['DURATION']) {
        // Very basic DURATION: PT1H, P1D, etc. Expand just days/hours/minutes.
        const dur = bag['DURATION'].value
        let secs = 0
        for (const [, n, u] of dur.matchAll(/(\d+)([WDHMS])/g)) {
          const v = parseInt(n, 10)
          if (u === 'W') secs += v * 7 * 86400
          else if (u === 'D') secs += v * 86400
          else if (u === 'H') secs += v * 3600
          else if (u === 'M') secs += v * 60
          else if (u === 'S') secs += v
        }
        dtend = new Date(dtstart.getTime() + secs * 1000)
      } else {
        dtend = allDay
          ? new Date(dtstart.getTime() + 86_400_000)
          : new Date(dtstart.getTime() + 3_600_000)
      }

      events.push({
        uid, summary: sum, dtstart, dtend, allDay,
        description: bag['DESCRIPTION']?.value?.trim().replace(/\\n/g, '\n') ?? null,
        location:    bag['LOCATION']?.value?.trim() ?? null,
      })
      continue
    }
    if (inEvent) bag[p.name] = p
  }

  return events
}

// ── Public sync function ──────────────────────────────────────────────────────

export async function syncIcsFeed(feedId: string): Promise<{ count: number; error?: string }> {
  const feed = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, feedId) })
  if (!feed) return { count: 0, error: 'Feed not found' }

  const calendarId = `ics:${feedId}`
  const now = new Date()
  const windowStart = new Date(now.getTime() - 90  * 86_400_000)
  const windowEnd   = new Date(now.getTime() + 365 * 86_400_000)

  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'HomeOS/1.0 (calendar feed sync)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${feed.url}`)
    const text = await res.text()
    const parsed = parseIcs(text)

    const inWindow = parsed.filter(e => e.dtstart >= windowStart && e.dtstart <= windowEnd)

    for (const ev of inWindow) {
      const row = {
        id:           ulid(),
        householdId:  HOUSEHOLD_ID,
        externalId:   `${feedId}:${ev.uid}`,
        calendarId,
        title:        ev.summary,
        description:  ev.description,
        location:     ev.location,
        startsAt:     ev.dtstart,
        endsAt:       ev.dtend,
        allDay:       ev.allDay,
        recurrenceRule: null,
        rawIcal:      null,
        lastSyncedAt: now,
        createdAt:    now,
        updatedAt:    now,
      }
      await db.insert(calendarEvents).values(row).onConflictDoUpdate({
        target: calendarEvents.externalId,
        set: {
          title: row.title, description: row.description, location: row.location,
          startsAt: row.startsAt, endsAt: row.endsAt, allDay: row.allDay,
          lastSyncedAt: now, updatedAt: now,
        },
      })
    }

    // Prune events from this feed not seen in this sync run
    await db.delete(calendarEvents).where(
      and(eq(calendarEvents.calendarId, calendarId), lt(calendarEvents.lastSyncedAt, now))
    )

    await db.update(calendarFeeds)
      .set({ lastSyncedAt: now, errorMessage: null, updatedAt: now })
      .where(eq(calendarFeeds.id, feedId))

    return { count: inWindow.length }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[ics-sync] Feed ${feedId} failed:`, msg)
    await db.update(calendarFeeds)
      .set({ errorMessage: msg, updatedAt: new Date() })
      .where(eq(calendarFeeds.id, feedId))
    return { count: 0, error: msg }
  }
}

/** Sync all enabled ICS feeds. Called from the background cron job. */
export async function syncAllIcsFeeds(): Promise<void> {
  const feeds = await db.query.calendarFeeds.findMany({
    where: eq(calendarFeeds.enabled, true),
  })
  for (const feed of feeds) {
    await syncIcsFeed(feed.id)
  }
}
