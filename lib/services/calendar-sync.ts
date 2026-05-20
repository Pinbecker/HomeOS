import { createDAVClient } from 'tsdav'
import * as nodeIcal from 'node-ical'
import { db } from '@/lib/db'
import { calendarEvents } from '@/lib/db/schema'
import { lt } from 'drizzle-orm'
import { ulid } from 'ulid'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'
const USERNAME = process.env.CALDAV_USERNAME ?? ''
const PASSWORD = process.env.CALDAV_PASSWORD ?? ''
const CALENDAR_NAME = process.env.CALDAV_CALENDAR_NAME ?? 'Family'

// node-ical returns some string fields as ParameterValue objects; extract the string safely
function toStr(v: unknown): string {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'val' in v) return String((v as { val: unknown }).val)
  return String(v ?? '')
}

function toStrOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = toStr(v)
  return s || null
}

export async function syncCalendar(): Promise<void> {
  if (!USERNAME || !PASSWORD) {
    console.log('[calendar-sync] No credentials configured, skipping')
    return
  }

  const now = new Date()

  try {
    const client = await createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username: USERNAME, password: PASSWORD },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    })

    const calendars = await client.fetchCalendars()

    const target = calendars.find(c => {
      const name = toStr(c.displayName)
      return name.trim().toLowerCase() === CALENDAR_NAME.trim().toLowerCase()
    })

    if (!target) {
      const names = calendars.map(c => toStr(c.displayName)).join(', ')
      console.error(`[calendar-sync] Calendar "${CALENDAR_NAME}" not found. Available: ${names}`)
      return
    }

    // Fetch events: from 30 days ago through 180 days ahead (gives the
    // calendar view some past context and a useful forward window)
    const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
    const rangeEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 180)

    const objects = await client.fetchCalendarObjects({
      calendar: target,
      timeRange: {
        start: rangeStart.toISOString(),
        end:   rangeEnd.toISOString(),
      },
    })

    type InsertRow = typeof calendarEvents.$inferInsert
    const rows: InsertRow[] = []

    for (const obj of objects) {
      if (!obj.data) continue

      const parsed = nodeIcal.sync.parseICS(obj.data)

      for (const component of Object.values(parsed)) {
        if (!component || component.type !== 'VEVENT') continue
        const ev = component as nodeIcal.VEvent
        if (!ev.start) continue

        const summaryStr = toStr(ev.summary)
        if (!summaryStr) continue

        // node-ical sets dateOnly on the Date object for all-day events
        const allDay = (ev.start as unknown as { dateOnly?: boolean }).dateOnly === true

        const startAt = new Date(ev.start)
        const endAt   = ev.end ? new Date(ev.end) : new Date(startAt.getTime() + 3_600_000)

        // Skip if outside our window (can happen with recurring expansions)
        if (startAt > rangeEnd) continue

        const externalId = `${ev.uid ?? ''}::${startAt.toISOString()}`

        rows.push({
          id: ulid(),
          householdId: HOUSEHOLD_ID,
          externalId,
          calendarId: CALENDAR_NAME,
          title: summaryStr,
          description: toStrOrNull(ev.description),
          location:    toStrOrNull(ev.location),
          startsAt:  startAt,
          endsAt:    endAt,
          allDay,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }
    }

    // Upsert: insert or update on externalId
    for (const row of rows) {
      await db
        .insert(calendarEvents)
        .values(row)
        .onConflictDoUpdate({
          target: calendarEvents.externalId,
          set: {
            title:        row.title,
            description:  row.description,
            location:     row.location,
            startsAt:     row.startsAt,
            endsAt:       row.endsAt,
            allDay:       row.allDay,
            lastSyncedAt: row.lastSyncedAt,
            updatedAt:    row.updatedAt,
          },
        })
    }

    // Remove stale rows (events that existed before this sync run but weren't returned —
    // they were deleted or moved out of the 90-day window)
    await db
      .delete(calendarEvents)
      .where(lt(calendarEvents.lastSyncedAt, now))

    console.log(`[calendar-sync] Synced ${rows.length} events from "${CALENDAR_NAME}"`)
  } catch (err) {
    console.error('[calendar-sync] Sync failed:', err instanceof Error ? err.message : err)
  }
}
