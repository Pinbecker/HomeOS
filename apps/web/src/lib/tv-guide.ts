export const LONDON_TIME_ZONE = 'Europe/London'

export function normalizeTvFollowTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^(?:brand\s+new|new)\s*:\s*/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function displayTvTitle(value: string) {
  return value.replace(/^(?:brand\s+new|new)\s*:\s*/i, '').trim()
}

export function tvFollowKey(show: { title: string; metadata?: Record<string, unknown> | null }) {
  const metadata = show.metadata ?? {}
  const stored = typeof metadata.followKey === 'string'
    ? metadata.followKey
    : typeof metadata.canonicalTitle === 'string'
      ? metadata.canonicalTitle
      : typeof metadata.showName === 'string'
        ? metadata.showName
        : show.title
  return normalizeTvFollowTitle(stored)
}

export function stableTvFollowId(householdId: string, followKey: string) {
  let hash = 2166136261
  const value = `${householdId}:${followKey}`
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `watch-${(hash >>> 0).toString(36)}`
}

export function londonDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '00'
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function formatGuideDate(dateKey: string, todayKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number)
  const tomorrow = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + 1))
  const tomorrowKey = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`
  if (dateKey === todayKey) return { short: 'Today', long: 'Today' }
  if (dateKey === tomorrowKey) return { short: 'Tomorrow', long: 'Tomorrow' }
  return {
    short: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(date),
    long: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(date),
  }
}

export function formatAirtime(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: LONDON_TIME_ZONE,
  }).replace(':00', '').replace(' ', '')
}

export function formatDuration(startsAt: Date, endsAt: Date) {
  const minutes = Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}
