// Quick test — run with: node scripts/test-calendar.mjs
import { readFileSync } from 'fs'
import { createDAVClient } from 'tsdav'

// Load .env
const env = readFileSync('.env', 'utf-8')
env.split('\n').forEach(line => {
  const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
})

const username = process.env.CALDAV_USERNAME
const password = process.env.CALDAV_PASSWORD
const calName  = process.env.CALDAV_CALENDAR_NAME ?? 'Family'

console.log(`Connecting as ${username}…`)

const client = await createDAVClient({
  serverUrl: 'https://caldav.icloud.com',
  credentials: { username, password },
  authMethod: 'Basic',
  defaultAccountType: 'caldav',
})

const calendars = await client.fetchCalendars()
console.log('Calendars found:')
calendars.forEach(c => console.log(' -', c.displayName, c.url))

const target = calendars.find(c =>
  String(c.displayName).trim().toLowerCase() === calName.trim().toLowerCase()
)

if (!target) {
  console.error(`\nCalendar "${calName}" not found`)
  process.exit(1)
}

console.log(`\nFetching events from "${calName}"…`)
const now = new Date()
const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)

const objects = await client.fetchCalendarObjects({
  calendar: target,
  timeRange: { start: now.toISOString(), end: end.toISOString() },
})

console.log(`Got ${objects.length} calendar objects`)
process.exit(0)
