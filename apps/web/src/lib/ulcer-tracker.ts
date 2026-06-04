import type { CycleEntry, MouthRegion, UlcerCheckin, UlcerEpisode, UlcerEventStage, UlcerEventType } from './app-store'
import { cycleDate } from './cycle-tracker'

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

export const MOUTH_REGIONS: Array<{ id: MouthRegion; label: string; shortLabel: string }> = [
  { id: 'upper_inner_lip', label: 'Upper inner lip', shortLabel: 'Upper lip' },
  { id: 'lower_inner_lip', label: 'Lower inner lip', shortLabel: 'Lower lip' },
  { id: 'left_cheek', label: 'Left cheek', shortLabel: 'L cheek' },
  { id: 'right_cheek', label: 'Right cheek', shortLabel: 'R cheek' },
  { id: 'tongue_top', label: 'Tongue top', shortLabel: 'Tongue' },
  { id: 'tongue_left', label: 'Left tongue edge', shortLabel: 'L tongue' },
  { id: 'tongue_right', label: 'Right tongue edge', shortLabel: 'R tongue' },
  { id: 'upper_gum', label: 'Upper gum', shortLabel: 'Upper gum' },
  { id: 'lower_gum', label: 'Lower gum', shortLabel: 'Lower gum' },
  { id: 'roof', label: 'Roof of mouth', shortLabel: 'Roof' },
  { id: 'other', label: 'Other area', shortLabel: 'Other' },
]

export const TRIGGER_OPTIONS = [
  'stress',
  'poor sleep',
  'illness',
  'spicy food',
  'acidic food',
  'alcohol',
  'bitten cheek',
  'new toothpaste',
  'medication',
  'period',
]

export const TREATMENT_OPTIONS = [
  'bonjela',
  'salt rinse',
  'mouthwash',
  'pain relief',
  'hydration',
  'avoid spicy food',
]

export const ULCER_EVENT_LABELS: Record<UlcerEventType, string> = {
  noticed: 'Noticed',
  observation: 'Observation',
  treatment_started: 'Treatment started',
  treatment_stopped: 'Treatment stopped',
  worsened: 'Worsened',
  improved: 'Improved',
  healed: 'Healed',
  reopened: 'Reopened',
}

export const ULCER_STAGE_LABELS: Record<UlcerEventStage, string> = {
  new: 'New',
  worse: 'Worse',
  same: 'Same',
  better: 'Better',
  nearly_healed: 'Nearly healed',
  healed: 'Healed',
}

export type NormalizedUlcerEpisode = Omit<UlcerEpisode, 'startedAt' | 'healedAt' | 'firstNoticedAt' | 'estimatedStartedAt' | 'resolvedAt' | 'createdAt' | 'updatedAt'> & {
  startedAt: Date
  healedAt: Date | null
  firstNoticedAt: Date
  estimatedStartedAt: Date | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type NormalizedUlcerCheckin = Omit<UlcerCheckin, 'loggedAt' | 'createdAt' | 'updatedAt'> & {
  loggedAt: Date
  eventType: UlcerEventType
  stage: UlcerEventStage | null
  createdAt: Date
  updatedAt: Date
  triggers: string[]
  treatments: string[]
}

export type UlcerEpisodeReport = {
  episode: NormalizedUlcerEpisode
  events: NormalizedUlcerCheckin[]
  observations: NormalizedUlcerCheckin[]
  latestEvent: NormalizedUlcerCheckin | null
  latestObservation: NormalizedUlcerCheckin | null
  peakSeverity: number | null
  peakPain: number | null
  maxSizeMm: number | null
  durationDays: number | null
  daysOpen: number
  timeToPeakDays: number | null
  peakToHealedDays: number | null
  severitySeries: Array<{ label: string; value: number }>
  sizeSeries: Array<{ label: string; value: number }>
  triggerSet: string[]
  treatmentSet: string[]
}

export type UlcerInsights = {
  episodes: NormalizedUlcerEpisode[]
  checkins: NormalizedUlcerCheckin[]
  events: NormalizedUlcerCheckin[]
  activeEpisodes: NormalizedUlcerEpisode[]
  healedEpisodes: NormalizedUlcerEpisode[]
  reports: UlcerEpisodeReport[]
  reportByEpisode: Map<string, UlcerEpisodeReport>
  latestByEpisode: Map<string, NormalizedUlcerCheckin>
  latestObservationByEpisode: Map<string, NormalizedUlcerCheckin>
  averageDurationDays: number | null
  medianDurationDays: number | null
  averagePeakSeverity: number | null
  maxSeverity: number | null
  averageSizeMm: number | null
  flareBuckets: Array<{ label: string; count: number }>
  activeDayBuckets: Array<{ label: string; count: number }>
  severitySeries: Array<{ label: string; value: number }>
  sizeSeries: Array<{ label: string; value: number }>
  regionStats: Array<{ region: MouthRegion; label: string; count: number; active: number; averageDurationDays: number | null }>
  triggerStats: Array<{ trigger: string; count: number }>
  treatmentStats: Array<{ treatment: string; count: number }>
  wellbeing: {
    averageStress: number | null
    averageSleep: number | null
    illnessCount: number
    medicationCount: number
    cycleRelatedCount: number
    startedDuringLoggedPeriod: number
  }
}

export function mouthRegionLabel(region: MouthRegion) {
  return MOUTH_REGIONS.find(item => item.id === region)?.label ?? 'Other area'
}

export function nearestMouthRegion(x: number, y: number): MouthRegion {
  if (y < 25) return 'upper_inner_lip'
  if (y < 39) return x < 34 ? 'left_cheek' : x > 66 ? 'right_cheek' : 'upper_gum'
  if (y < 52) return x < 28 ? 'left_cheek' : x > 72 ? 'right_cheek' : 'roof'
  if (y < 68) return x < 35 ? 'tongue_left' : x > 65 ? 'tongue_right' : 'tongue_top'
  if (y < 82) return x < 32 ? 'left_cheek' : x > 68 ? 'right_cheek' : 'lower_gum'
  return 'lower_inner_lip'
}

export function calculateUlcerInsights(episodes: UlcerEpisode[], checkins: UlcerCheckin[], userId?: string | null, cycleEntries: CycleEntry[] = []): UlcerInsights {
  const normalizedEpisodes = episodes
    .filter(episode => !userId || episode.userId === userId)
    .map(normalizeEpisode)
    .sort((a, b) => b.firstNoticedAt.getTime() - a.firstNoticedAt.getTime())
  const episodeIds = new Set(normalizedEpisodes.map(episode => episode.id))
  const normalizedEvents = checkins
    .filter(checkin => episodeIds.has(checkin.episodeId) && (!userId || checkin.userId === userId))
    .map(normalizeCheckin)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
  const latestByEpisode = new Map<string, NormalizedUlcerCheckin>()
  const latestObservationByEpisode = new Map<string, NormalizedUlcerCheckin>()
  for (const event of normalizedEvents) {
    latestByEpisode.set(event.episodeId, event)
    if (isObservationLike(event)) latestObservationByEpisode.set(event.episodeId, event)
  }

  const reports = normalizedEpisodes.map(episode => buildEpisodeReport(episode, normalizedEvents.filter(event => event.episodeId === episode.id)))
  const reportByEpisode = new Map(reports.map(report => [report.episode.id, report]))
  const activeEpisodes = normalizedEpisodes.filter(isActiveEpisode)
  const healedEpisodes = normalizedEpisodes.filter(episode => !isActiveEpisode(episode))
  const healedDurations = reports.flatMap(report => report.durationDays === null ? [] : [report.durationDays])
  const peakSeverities = reports.flatMap(report => report.peakSeverity === null ? [] : [report.peakSeverity])
  const maxSizes = reports.flatMap(report => report.maxSizeMm === null || report.maxSizeMm <= 0 ? [] : [report.maxSizeMm])
  const cyclePeriods = cycleEntries.flatMap(entry => {
    if (!entry.endDate) return []
    return [{ start: cycleDate(entry.startDate), end: cycleDate(entry.endDate) }]
  })

  return {
    episodes: normalizedEpisodes,
    checkins: normalizedEvents,
    events: normalizedEvents,
    activeEpisodes,
    healedEpisodes,
    reports,
    reportByEpisode,
    latestByEpisode,
    latestObservationByEpisode,
    averageDurationDays: average(healedDurations),
    medianDurationDays: median(healedDurations),
    averagePeakSeverity: average(peakSeverities),
    maxSeverity: peakSeverities.length ? Math.max(...peakSeverities) : null,
    averageSizeMm: average(maxSizes),
    flareBuckets: buildFlareBuckets(normalizedEpisodes),
    activeDayBuckets: buildActiveDayBuckets(reports),
    severitySeries: reports.slice().reverse().map(report => ({ label: formatShortDate(report.episode.firstNoticedAt), value: report.peakSeverity ?? 0 })),
    sizeSeries: reports.slice().reverse().map(report => ({ label: formatShortDate(report.episode.firstNoticedAt), value: report.maxSizeMm ?? 0 })),
    regionStats: buildRegionStats(reports),
    triggerStats: buildEpisodeTagStats(reports, 'triggerSet', 'trigger'),
    treatmentStats: buildEpisodeTagStats(reports, 'treatmentSet', 'treatment'),
    wellbeing: buildWellbeing(normalizedEvents, normalizedEpisodes, cyclePeriods),
  }
}

export function formatUlcerDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(value).toLocaleDateString('en-GB', { timeZone: 'Europe/London', ...options })
}

export function ulcerStatusLabel(status: NormalizedUlcerEpisode['status']) {
  if (status === 'healing') return 'Healing'
  if (status === 'reopened') return 'Reopened'
  if (status === 'healed') return 'Healed'
  return 'Active'
}

export function isActiveEpisode(episode: NormalizedUlcerEpisode) {
  return (episode.status === 'active' || episode.status === 'healing' || episode.status === 'reopened') && !episode.resolvedAt && !episode.healedAt
}

function buildEpisodeReport(episode: NormalizedUlcerEpisode, events: NormalizedUlcerCheckin[]): UlcerEpisodeReport {
  const observations = events.filter(isObservationLike)
  const latestEvent = events.at(-1) ?? null
  const latestObservation = observations.at(-1) ?? null
  const peakSeverityEvent = maxBy(observations, event => event.severity)
  const peakPainEvent = maxBy(observations, event => event.pain)
  const maxSizeEvent = maxBy(observations.filter(event => event.sizeMm > 0), event => event.sizeMm)
  const resolvedAt = episode.resolvedAt ?? episode.healedAt
  return {
    episode,
    events,
    observations,
    latestEvent,
    latestObservation,
    peakSeverity: peakSeverityEvent?.severity ?? null,
    peakPain: peakPainEvent?.pain ?? null,
    maxSizeMm: maxSizeEvent?.sizeMm ?? null,
    durationDays: resolvedAt ? daysInclusive(episode.firstNoticedAt, resolvedAt) : null,
    daysOpen: daysInclusive(episode.firstNoticedAt, resolvedAt ?? new Date()),
    timeToPeakDays: peakSeverityEvent ? daysInclusive(episode.firstNoticedAt, peakSeverityEvent.loggedAt) : null,
    peakToHealedDays: peakSeverityEvent && resolvedAt ? daysInclusive(peakSeverityEvent.loggedAt, resolvedAt) : null,
    severitySeries: observations.map(event => ({ label: formatShortDate(event.loggedAt), value: event.severity })),
    sizeSeries: observations.map(event => ({ label: formatShortDate(event.loggedAt), value: event.sizeMm })),
    triggerSet: sortedUnique(events.flatMap(event => event.triggers)),
    treatmentSet: sortedUnique(events.flatMap(event => event.treatments)),
  }
}

function normalizeEpisode(episode: UlcerEpisode): NormalizedUlcerEpisode {
  const startedAt = new Date(episode.startedAt)
  const healedAt = episode.healedAt ? new Date(episode.healedAt) : null
  const firstNoticedAt = episode.firstNoticedAt ? new Date(episode.firstNoticedAt) : startedAt
  const resolvedAt = episode.resolvedAt ? new Date(episode.resolvedAt) : healedAt
  return {
    ...episode,
    status: resolvedAt && episode.status !== 'reopened' ? 'healed' : episode.status,
    startedAt,
    healedAt,
    firstNoticedAt,
    estimatedStartedAt: episode.estimatedStartedAt ? new Date(episode.estimatedStartedAt) : startedAt,
    resolvedAt,
    createdAt: new Date(episode.createdAt),
    updatedAt: new Date(episode.updatedAt),
  }
}

function normalizeCheckin(checkin: UlcerCheckin): NormalizedUlcerCheckin {
  return {
    ...checkin,
    eventType: checkin.eventType ?? 'observation',
    stage: checkin.stage ?? null,
    loggedAt: new Date(checkin.loggedAt),
    createdAt: new Date(checkin.createdAt),
    updatedAt: new Date(checkin.updatedAt),
    triggers: Array.isArray(checkin.triggers) ? checkin.triggers : [],
    treatments: Array.isArray(checkin.treatments) ? checkin.treatments : [],
  }
}

function isObservationLike(event: NormalizedUlcerCheckin) {
  return event.eventType === 'noticed' || event.eventType === 'observation' || event.eventType === 'worsened' || event.eventType === 'improved' || event.eventType === 'reopened'
}

function buildFlareBuckets(episodes: NormalizedUlcerEpisode[]) {
  const now = startOfWeek(new Date())
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(now.getTime() - (7 - index) * WEEK_MS)
    return {
      start,
      label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }),
      count: 0,
    }
  })
  for (const episode of episodes) {
    const week = startOfWeek(episode.firstNoticedAt).getTime()
    const bucket = buckets.find(item => item.start.getTime() === week)
    if (bucket) bucket.count += 1
  }
  return buckets.map(({ label, count }) => ({ label, count }))
}

function buildActiveDayBuckets(reports: UlcerEpisodeReport[]) {
  const now = startOfWeek(new Date())
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(now.getTime() - (7 - index) * WEEK_MS)
    return {
      start,
      label: start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }),
      count: 0,
    }
  })
  for (const report of reports) {
    const end = report.episode.resolvedAt ?? report.episode.healedAt ?? new Date()
    for (const bucket of buckets) {
      const bucketEnd = new Date(bucket.start.getTime() + WEEK_MS - DAY_MS)
      const overlapStart = Math.max(cycleDate(report.episode.firstNoticedAt).getTime(), bucket.start.getTime())
      const overlapEnd = Math.min(cycleDate(end).getTime(), bucketEnd.getTime())
      if (overlapEnd >= overlapStart) bucket.count += Math.round((overlapEnd - overlapStart) / DAY_MS) + 1
    }
  }
  return buckets.map(({ label, count }) => ({ label, count }))
}

function buildRegionStats(reports: UlcerEpisodeReport[]) {
  return MOUTH_REGIONS.map(region => {
    const rows = reports.filter(report => report.episode.mouthRegion === region.id)
    const durations = rows.flatMap(report => report.durationDays === null ? [] : [report.durationDays])
    return {
      region: region.id,
      label: region.shortLabel,
      count: rows.length,
      active: rows.filter(report => isActiveEpisode(report.episode)).length,
      averageDurationDays: average(durations),
    }
  }).filter(row => row.count > 0 || row.active > 0)
}

function buildEpisodeTagStats<K extends 'triggerSet' | 'treatmentSet', N extends string>(reports: UlcerEpisodeReport[], key: K, name: N) {
  const counts = new Map<string, number>()
  for (const report of reports) {
    for (const tag of report[key]) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ [name]: tag, count }) as Record<N, string> & { count: number })
    .sort((a, b) => b.count - a.count || a[name].localeCompare(b[name]))
    .slice(0, 8)
}

function buildWellbeing(events: NormalizedUlcerCheckin[], episodes: NormalizedUlcerEpisode[], cyclePeriods: Array<{ start: Date; end: Date }>) {
  const stress = events.flatMap(event => typeof event.wellbeing?.stress === 'number' ? [event.wellbeing.stress] : [])
  const sleep = events.flatMap(event => typeof event.wellbeing?.sleep === 'number' ? [event.wellbeing.sleep] : [])
  return {
    averageStress: average(stress),
    averageSleep: average(sleep),
    illnessCount: events.filter(event => event.wellbeing?.illness).length,
    medicationCount: events.filter(event => event.wellbeing?.medication).length,
    cycleRelatedCount: events.filter(event => event.wellbeing?.cycleRelated || event.triggers.includes('period')).length,
    startedDuringLoggedPeriod: episodes.filter(episode => cyclePeriods.some(period => {
      const started = cycleDate(episode.firstNoticedAt).getTime()
      return started >= period.start.getTime() && started <= period.end.getTime()
    })).length,
  }
}

function startOfWeek(value: Date) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  const day = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - day)
  return date
}

function daysInclusive(start: Date, end: Date) {
  return Math.max(1, Math.round((cycleDate(end).getTime() - cycleDate(start).getTime()) / DAY_MS) + 1)
}

function average(values: number[]) {
  if (!values.length) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = values.slice().sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? average([sorted[middle - 1], sorted[middle]]) : sorted[middle]
}

function maxBy<T>(values: T[], score: (value: T) => number) {
  return values.reduce<T | null>((best, value) => best === null || score(value) > score(best) ? value : best, null)
}

function sortedUnique(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
}
