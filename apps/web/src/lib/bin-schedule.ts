export type BinSchedule = {
  id: string
  name: string
  colour: string
  firstCollectionDate: string
  intervalWeeks: number
}

export type BinCollectionItem = {
  id: string
  binId: string
  binName: string
  colour: string
  collectionDate: Date
  reminderAt: Date
  title: string
}

export const BIN_SCHEDULES: BinSchedule[] = [
  { id: 'black-bin', name: 'Black bin', colour: 'black', firstCollectionDate: '2026-05-27', intervalWeeks: 3 },
  { id: 'recycling-food', name: 'Recycling containers and food bin', colour: 'blue', firstCollectionDate: '2026-05-27', intervalWeeks: 1 },
  { id: 'green-bin', name: 'Green bin', colour: 'green', firstCollectionDate: '2026-06-02', intervalWeeks: 2 },
  { id: 'hygiene-nappy', name: 'Hygiene and nappy waste bag', colour: 'pink', firstCollectionDate: '2026-06-03', intervalWeeks: 2 },
]

const BIN_COLOURS: Record<string, string> = {
  grey: '#6B7280',
  blue: '#3B82F6',
  green: '#22C55E',
  brown: '#92400E',
  black: '#374151',
  pink: '#EC4899',
}

export function binScheduleColor(colour: string) {
  return BIN_COLOURS[colour] ?? BIN_COLOURS.grey
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function dateFromIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function dateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function binCollectionTitle(bin: Pick<BinSchedule, 'id' | 'name'>) {
  if (bin.id === 'recycling-food') return 'Put recycling out'
  if (bin.id === 'black-bin') return 'Put the black bin out'
  if (bin.id === 'green-bin') return 'Put the green bin out'
  return `Put ${bin.name.toLowerCase()} out`
}

export function nextBinCollectionDate(bin: BinSchedule, now = new Date()) {
  const today = startOfLocalDay(now)
  const next = dateFromIsoDate(bin.firstCollectionDate)
  const intervalDays = bin.intervalWeeks * 7
  while (next < today) next.setDate(next.getDate() + intervalDays)
  return next
}

// Bin collections are calendar/timeline items only shortly before collection.
// They are deliberately derived rather than saved as tasks or calendar events.
export function upcomingBinCollectionItems(now = new Date()): BinCollectionItem[] {
  const today = startOfLocalDay(now)
  return BIN_SCHEDULES.flatMap(bin => {
    const collectionDate = nextBinCollectionDate(bin, now)
    const daysUntil = Math.round((startOfLocalDay(collectionDate).getTime() - today.getTime()) / 86_400_000)
    if (daysUntil < 1 || daysUntil > 2) return []

    const reminderAt = new Date(collectionDate)
    reminderAt.setDate(reminderAt.getDate() - 1)
    reminderAt.setHours(20, 0, 0, 0)
    return [{
      id: `bin-collection-${bin.id}-${dateId(collectionDate)}`,
      binId: bin.id,
      binName: bin.name,
      colour: bin.colour,
      collectionDate,
      reminderAt,
      title: binCollectionTitle(bin),
    }]
  }).sort((a, b) => a.reminderAt.getTime() - b.reminderAt.getTime())
}
