export type StaticBinSchedule = {
  id: string
  name: string
  colour: string
  firstCollectionDate: string
  intervalWeeks: number
}

export const STATIC_BIN_SCHEDULES: StaticBinSchedule[] = [
  {
    id: 'black-bin',
    name: 'Black bin',
    colour: 'black',
    firstCollectionDate: '2026-05-27',
    intervalWeeks: 3,
  },
  {
    id: 'recycling-food',
    name: 'Recycling containers and food bin',
    colour: 'blue',
    firstCollectionDate: '2026-05-27',
    intervalWeeks: 1,
  },
  {
    id: 'green-bin',
    name: 'Green bin',
    colour: 'green',
    firstCollectionDate: '2026-06-02',
    intervalWeeks: 2,
  },
  {
    id: 'hygiene-nappy',
    name: 'Hygiene and nappy waste bag',
    colour: 'pink',
    firstCollectionDate: '2026-06-03',
    intervalWeeks: 2,
  },
]

function dateFromIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function todayAtMidnight(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function getNextRecurringDate(firstCollectionDate: string, intervalWeeks: number): Date {
  const today = todayAtMidnight()
  const next = dateFromIsoDate(firstCollectionDate)
  const intervalDays = intervalWeeks * 7

  while (next < today) {
    next.setDate(next.getDate() + intervalDays)
  }

  return next
}

export function getNextStaticBinCollection(bin: StaticBinSchedule): Date {
  return getNextRecurringDate(bin.firstCollectionDate, bin.intervalWeeks)
}

export function daysUntil(date: Date): number {
  const today = todayAtMidnight()
  // Compare calendar days: floor the target to its own local midnight so that a
  // time-of-day (e.g. a reminder or task due this evening) still counts as today,
  // rather than rounding up to "1d".
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function getBinReminderDate(collectionDate: Date): Date {
  const reminderDate = new Date(
    collectionDate.getFullYear(),
    collectionDate.getMonth(),
    collectionDate.getDate(),
  )
  reminderDate.setDate(reminderDate.getDate() - 1)
  return reminderDate
}

export const BIN_COLOURS: Record<string, { bg: string; text: string; label: string }> = {
  grey:  { bg: '#6B7280', text: '#fff', label: 'Grey bin'  },
  blue:  { bg: '#3B82F6', text: '#fff', label: 'Blue bin'  },
  green: { bg: '#22C55E', text: '#fff', label: 'Green bin' },
  brown: { bg: '#92400E', text: '#fff', label: 'Brown bin' },
  black: { bg: '#1F2937', text: '#fff', label: 'Black bin' },
  pink:  { bg: '#EC4899', text: '#fff', label: 'Nappy bin' },
}
