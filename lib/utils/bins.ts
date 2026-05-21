import type { bins } from '@/lib/db/schema'
import type { InferSelectModel } from 'drizzle-orm'

type Bin = InferSelectModel<typeof bins>

// Computes the next collection date.
// `anchorDate` is the LAST known collection (yyyy-mm-dd); collections
// then repeat every `intervalWeeks` weeks on the same weekday.
export function getNextBinCollection(bin: Bin): Date {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const interval = (bin.intervalWeeks && bin.intervalWeeks > 0 ? bin.intervalWeeks : 1) * 7

  // Fallback if no anchor: next occurrence of collectionDay from today
  if (!bin.anchorDate) {
    const daysUntilNext = (bin.collectionDay - today.getDay() + 7) % 7
    const candidate = new Date(today)
    candidate.setDate(today.getDate() + daysUntilNext)
    return candidate
  }

  const [y, m, d] = bin.anchorDate.split('-').map(Number)
  const next = new Date(y, m - 1, d)
  // Step forward from the last collection by the interval until we're >= today
  do {
    next.setDate(next.getDate() + interval)
  } while (next < today)
  return next
}

export function daysUntil(date: Date): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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
