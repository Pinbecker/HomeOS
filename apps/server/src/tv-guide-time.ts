const LONDON_TIME_ZONE = 'Europe/London'
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

type LondonParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const londonFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: LONDON_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function londonParts(date: Date): LondonParts {
  const parts = londonFormatter.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? 0)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

function utcForLondonWallTime(year: number, month: number, day: number, hour = 0) {
  const target = Date.UTC(year, month - 1, day, hour)
  let guess = target

  // Two passes are normally sufficient; a third keeps this stable around DST.
  for (let pass = 0; pass < 3; pass += 1) {
    const actual = londonParts(new Date(guess))
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second)
    const correction = target - actualAsUtc
    if (correction === 0) break
    guess += correction
  }

  return new Date(guess)
}

export function isLondonDateKey(value: string) {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
}

export function londonDateKey(date = new Date()) {
  const parts = londonParts(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function addLondonDays(dateKey: string, amount: number) {
  if (!isLondonDateKey(dateKey)) throw new Error(`Invalid London date key: ${dateKey}`)
  const [year, month, day] = dateKey.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + amount))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export function londonDayBounds(dateKey: string) {
  if (!isLondonDateKey(dateKey)) throw new Error(`Invalid London date key: ${dateKey}`)
  const [year, month, day] = dateKey.split('-').map(Number)
  const start = utcForLondonWallTime(year, month, day)
  const nextKey = addLondonDays(dateKey, 1)
  const [nextYear, nextMonth, nextDay] = nextKey.split('-').map(Number)
  const end = utcForLondonWallTime(nextYear, nextMonth, nextDay)
  return { start, end }
}

export function londonDateKeys(fromDateKey: string, count: number) {
  return Array.from({ length: count }, (_, index) => addLondonDays(fromDateKey, index))
}

export function londonDayLabel(dateKey: string) {
  const { start } = londonDayBounds(dateKey)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: LONDON_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(start)
}

export function normalizeTvChannelName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim()
}

export { LONDON_TIME_ZONE }
