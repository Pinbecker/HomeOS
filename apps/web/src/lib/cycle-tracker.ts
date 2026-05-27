import type { CycleEntry } from './app-store'

const DAY_MS = 86_400_000
const MIN_VALID_INTERVAL = 15
const MAX_VALID_INTERVAL = 60
const DEFAULT_PERIOD_DAYS = 5
const CYCLE_COLOR = '#C04A7A'
const CYCLE_PREDICTED_COLOR = '#B45A84'
const PREDICTION_LOOKBACK_MONTHS = 12

export type CycleConfidence = 'none' | 'low' | 'medium' | 'high'

export type NormalizedCycleEntry = {
  id: string
  householdId?: string
  start: Date
  end: Date | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
}

export type CycleInterval = {
  fromId: string
  toId: string
  fromStart: Date
  toStart: Date
  days: number
  valid: boolean
}

export type CycleInsights = {
  entries: NormalizedCycleEntry[]
  intervals: CycleInterval[]
  validIntervals: CycleInterval[]
  recentIntervals: CycleInterval[]
  latestStart: Date | null
  averageCycleLength: number | null
  averagePeriodLength: number | null
  estimatedPeriodLength: number
  predictedStart: Date | null
  windowStart: Date | null
  windowEnd: Date | null
  confidence: CycleConfidence
}

export type CycleCalendarItem = {
  id: string
  title: string
  start: Date
  endExclusive: Date
  color: string
  kind: 'logged' | 'predicted'
  estimated: boolean
}

export function parseCycleDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function cycleDateInput(value: string | number | Date) {
  const date = cycleDate(value)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function cycleDate(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function formatCycleDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return cycleDate(value).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options })
}

export function addCycleDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS)
}

export function cycleDayKey(date: Date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
}

export function cycleCalendarDayKey(date: Date) {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
}

export function calculateCycleInsights(entries: CycleEntry[]): CycleInsights {
  const normalized = normalizeCycleEntries(entries)
  const intervals = normalized.slice(1).map((entry, index) => {
    const previous = normalized[index]
    const days = daysBetween(previous.start, entry.start)
    return {
      fromId: previous.id,
      toId: entry.id,
      fromStart: previous.start,
      toStart: entry.start,
      days,
      valid: days >= MIN_VALID_INTERVAL && days <= MAX_VALID_INTERVAL,
    }
  })
  const validIntervals = intervals.filter(interval => interval.valid)
  const latestStart = normalized.at(-1)?.start ?? null
  const lookbackStart = latestStart ? addCycleMonths(latestStart, -PREDICTION_LOOKBACK_MONTHS) : null
  const recentIntervals = lookbackStart
    ? validIntervals.filter(interval => interval.toStart.getTime() >= lookbackStart.getTime())
    : []
  const averageCycleLength = recentIntervals.length
    ? Math.round(recentIntervals.reduce((sum, interval) => sum + interval.days, 0) / recentIntervals.length)
    : null
  const periodLengths = normalized
    .flatMap(entry => entry.end && entry.end.getTime() >= entry.start.getTime() ? [daysBetween(entry.start, entry.end) + 1] : [])
    .filter(days => days > 0 && days <= 14)
  const averagePeriodLength = periodLengths.length
    ? Math.round(periodLengths.reduce((sum, days) => sum + days, 0) / periodLengths.length)
    : null
  const estimatedPeriodLength = averagePeriodLength ?? DEFAULT_PERIOD_DAYS
  const predictedStart = latestStart && averageCycleLength ? addCycleDays(latestStart, averageCycleLength) : null
  const confidence = confidenceFor(recentIntervals)
  const windowPadding = confidence === 'high' ? 2 : confidence === 'medium' ? 3 : 5

  return {
    entries: normalized,
    intervals,
    validIntervals,
    recentIntervals,
    latestStart,
    averageCycleLength,
    averagePeriodLength,
    estimatedPeriodLength,
    predictedStart,
    windowStart: predictedStart ? addCycleDays(predictedStart, -windowPadding) : null,
    windowEnd: predictedStart ? addCycleDays(predictedStart, windowPadding) : null,
    confidence,
  }
}

export function cycleCalendarItems(entries: CycleEntry[], options: { includePrediction?: boolean } = {}) {
  const insights = calculateCycleInsights(entries)
  const items: CycleCalendarItem[] = insights.entries.flatMap(entry => {
    if (entry.end) {
      return [{
        id: `cycle-${entry.id}`,
        title: 'Period',
        start: entry.start,
        endExclusive: addCycleDays(entry.start, Math.max(1, daysBetween(entry.start, entry.end) + 1)),
        color: CYCLE_COLOR,
        kind: 'logged' as const,
        estimated: false,
      }]
    }

    const estimatedDuration = Math.max(1, insights.estimatedPeriodLength)
    const loggedStart: CycleCalendarItem = {
      id: `cycle-${entry.id}`,
      title: 'Period',
      start: entry.start,
      endExclusive: addCycleDays(entry.start, 1),
      color: CYCLE_COLOR,
      kind: 'logged',
      estimated: false,
    }

    if (estimatedDuration <= 1) return [loggedStart]

    return [
      loggedStart,
      {
        id: `cycle-${entry.id}-estimate`,
        title: 'Period - estimated',
        start: addCycleDays(entry.start, 1),
        endExclusive: addCycleDays(entry.start, estimatedDuration),
        color: CYCLE_COLOR,
        kind: 'logged',
        estimated: true,
      },
    ]
  })

  if (options.includePrediction && insights.predictedStart) {
    items.push({
      id: 'cycle-predicted-next',
      title: 'Likely period',
      start: insights.predictedStart,
      endExclusive: addCycleDays(insights.predictedStart, insights.estimatedPeriodLength),
      color: CYCLE_PREDICTED_COLOR,
      kind: 'predicted',
      estimated: true,
    })
  }

  return { items, insights }
}

function normalizeCycleEntries(entries: CycleEntry[]) {
  return entries
    .flatMap((entry): NormalizedCycleEntry[] => {
      const start = entry.startDate ? cycleDate(entry.startDate) : null
      const end = entry.endDate ? cycleDate(entry.endDate) : null
      if (!start || Number.isNaN(start.getTime())) return []
      return [{
        id: entry.id,
        householdId: entry.householdId,
        start,
        end: end && !Number.isNaN(end.getTime()) ? end : null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }]
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

function confidenceFor(intervals: CycleInterval[]): CycleConfidence {
  if (intervals.length === 0) return 'none'
  if (intervals.length < 3) return 'low'
  if (intervals.length < 6) return 'medium'
  const average = intervals.reduce((sum, interval) => sum + interval.days, 0) / intervals.length
  const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval.days - average, 2), 0) / intervals.length
  return Math.sqrt(variance) <= 3 ? 'high' : 'medium'
}

function daysBetween(a: Date, b: Date) {
  return Math.round((cycleDate(b).getTime() - cycleDate(a).getTime()) / DAY_MS)
}

function addCycleMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}
