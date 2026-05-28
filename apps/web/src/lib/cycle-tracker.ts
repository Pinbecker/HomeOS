import type { CycleEntry } from './app-store'

const DAY_MS = 86_400_000
const MIN_VALID_INTERVAL = 15
const MAX_VALID_INTERVAL = 60
const DEFAULT_PERIOD_DAYS = 5
const CYCLE_COLOR = '#C04A7A'
const CYCLE_PREDICTED_COLOR = '#B45A84'
const FERTILE_COLOR = '#7C6CE4'
const OVULATION_COLOR = '#E58A2A'
const PREDICTION_LOOKBACK_MONTHS = 12
const DEFAULT_LUTEAL_DAYS = 14

export type CycleConfidence = 'none' | 'low' | 'medium' | 'high'

export type CycleTrackerSettings = {
  showOvulationWindows: boolean
}

export type NormalizedCycleEntry = {
  id: string
  householdId?: string
  start: Date
  end: Date | null
  ovulationDate: Date | null
  ovulationSource: 'known' | null
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
  predictedOvulation: Date | null
  fertileWindowStart: Date | null
  fertileWindowEnd: Date | null
  averageLutealLength: number | null
  ovulationConfidence: CycleConfidence
  knownOvulationCount: number
}

export type CycleCalendarItem = {
  id: string
  title: string
  start: Date
  endExclusive: Date
  color: string
  kind: 'logged' | 'predicted' | 'fertile' | 'ovulation'
  estimated: boolean
  confidence?: CycleConfidence
}

export function readCycleTrackerSettings(settings: Record<string, unknown> | null | undefined): CycleTrackerSettings {
  const raw = settings?.cycleTracker
  const cycleTracker = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return {
    showOvulationWindows: cycleTracker.showOvulationWindows === true,
  }
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
  const windowPadding = 1
  const knownOvulations = normalized.filter(entry => entry.ovulationDate)
  const lutealLengths = knownOvulations.flatMap(entry => {
    const nextStart = normalized.find(next => next.start.getTime() > entry.start.getTime())?.start ?? null
    if (!nextStart || !entry.ovulationDate) return []
    const days = daysBetween(entry.ovulationDate, nextStart)
    return days >= 8 && days <= 18 ? [days] : []
  })
  const averageLutealLength = lutealLengths.length
    ? Math.round(lutealLengths.reduce((sum, days) => sum + days, 0) / lutealLengths.length)
    : null
  const ovulationOffset = averageLutealLength ?? DEFAULT_LUTEAL_DAYS
  const predictedOvulation = predictedStart ? addCycleDays(predictedStart, -ovulationOffset) : null
  const ovulationConfidence = ovulationConfidenceFor(confidence, recentIntervals, lutealLengths.length, knownOvulations.length)

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
    predictedOvulation,
    fertileWindowStart: predictedOvulation ? addCycleDays(predictedOvulation, -5) : null,
    fertileWindowEnd: predictedOvulation ? addCycleDays(predictedOvulation, 1) : null,
    averageLutealLength,
    ovulationConfidence,
    knownOvulationCount: knownOvulations.length,
  }
}

export function cycleCalendarItems(entries: CycleEntry[], options: { includePrediction?: boolean; includeOvulation?: boolean; includeKnownOvulation?: boolean } = {}) {
  const insights = calculateCycleInsights(entries)
  const today = cycleDate(new Date())
  const latestEntryId = insights.entries.at(-1)?.id ?? null
  const items: CycleCalendarItem[] = insights.entries.flatMap(entry => {
    if (entry.end) {
      return eachPeriodDay(entry.start, entry.end).map(day => ({
        id: `cycle-${entry.id}-day-${day.day}`,
        title: `Period Day ${day.day}`,
        start: day.date,
        endExclusive: addCycleDays(day.date, 1),
        color: CYCLE_COLOR,
        kind: 'logged' as const,
        estimated: false,
      }))
    }

    const openEnd = entry.id === latestEntryId && entry.start.getTime() <= today.getTime() ? today : entry.start
    return eachPeriodDay(entry.start, openEnd).map(day => ({
      id: `cycle-${entry.id}-day-${day.day}`,
      title: `Period Day ${day.day}`,
      start: day.date,
      endExclusive: addCycleDays(day.date, 1),
      color: CYCLE_COLOR,
      kind: 'logged' as const,
      estimated: false,
    }))
  })

  if (options.includePrediction && insights.predictedStart) {
    items.push({
      id: 'cycle-predicted-next',
      title: 'Period Est.',
      start: insights.windowStart ?? insights.predictedStart,
      endExclusive: addCycleDays(insights.windowEnd ?? insights.predictedStart, 1),
      color: CYCLE_PREDICTED_COLOR,
      kind: 'predicted',
      estimated: true,
    })
  }

  if (options.includeKnownOvulation) {
    for (const entry of insights.entries) {
      if (!entry.ovulationDate) continue
      items.push({
        id: `cycle-${entry.id}-known-ovulation`,
        title: 'Known ovulation',
        start: entry.ovulationDate,
        endExclusive: addCycleDays(entry.ovulationDate, 1),
        color: OVULATION_COLOR,
        kind: 'ovulation',
        estimated: false,
        confidence: 'high',
      })
    }
  }

  if (options.includeOvulation) {
    if (insights.predictedOvulation && insights.fertileWindowStart && insights.fertileWindowEnd) {
      items.push({
        id: 'cycle-estimated-fertile-window',
        title: 'Estimated fertile window',
        start: insights.fertileWindowStart,
        endExclusive: addCycleDays(insights.fertileWindowEnd, 1),
        color: FERTILE_COLOR,
        kind: 'fertile',
        estimated: true,
        confidence: insights.ovulationConfidence,
      })
      items.push({
        id: 'cycle-predicted-ovulation',
        title: 'Ovulation (prediction)',
        start: insights.predictedOvulation,
        endExclusive: addCycleDays(insights.predictedOvulation, 1),
        color: OVULATION_COLOR,
        kind: 'ovulation',
        estimated: true,
        confidence: insights.ovulationConfidence,
      })
    }
  }

  return { items, insights }
}

function normalizeCycleEntries(entries: CycleEntry[]) {
  return entries
    .flatMap((entry): NormalizedCycleEntry[] => {
      const start = entry.startDate ? cycleDate(entry.startDate) : null
      const end = entry.endDate ? cycleDate(entry.endDate) : null
      const ovulationDate = entry.ovulationDate ? cycleDate(entry.ovulationDate) : null
      if (!start || Number.isNaN(start.getTime())) return []
      return [{
        id: entry.id,
        householdId: entry.householdId,
        start,
        end: end && !Number.isNaN(end.getTime()) ? end : null,
        ovulationDate: ovulationDate && !Number.isNaN(ovulationDate.getTime()) ? ovulationDate : null,
        ovulationSource: entry.ovulationSource === 'known' ? 'known' : null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }]
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

function ovulationConfidenceFor(cycleConfidence: CycleConfidence, intervals: CycleInterval[], lutealSamples: number, knownOvulations: number): CycleConfidence {
  if (!intervals.length) return knownOvulations > 0 ? 'medium' : 'none'
  if (knownOvulations > 0 && (lutealSamples > 0 || cycleConfidence === 'high')) return 'high'
  if (knownOvulations > 0 || cycleConfidence === 'high' || cycleConfidence === 'medium') return 'medium'
  return 'low'
}

function eachPeriodDay(start: Date, end: Date) {
  const days = Math.max(1, daysBetween(start, end) + 1)
  return Array.from({ length: days }, (_, index) => ({
    date: addCycleDays(start, index),
    day: index + 1,
  }))
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
