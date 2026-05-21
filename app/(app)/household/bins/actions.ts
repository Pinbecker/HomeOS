'use server'

import { revalidatePath } from 'next/cache'
import { ulid } from 'ulid'
import { and, eq } from 'drizzle-orm'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { bins, type BinColour, type BinFrequency } from '@/lib/db/schema'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

const BIN_COLOURS: BinColour[] = ['grey', 'blue', 'green', 'brown', 'black', 'pink']
const INTERVALS = [1, 2, 3, 4]

function revalidateBins() {
  revalidatePath('/household/bins')
  revalidatePath('/household')
  revalidatePath('/')
}

function textValue(value: FormDataEntryValue | null) {
  return String(value ?? '').trim()
}

function isoDateFromInput(value: FormDataEntryValue | null) {
  const date = textValue(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null

  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null
  }

  return date
}

function numberFromInput(value: FormDataEntryValue | null, allowed: number[]) {
  const number = Number(textValue(value))
  return allowed.includes(number) ? number : null
}

function colourFromInput(value: FormDataEntryValue | null) {
  const colour = textValue(value)
  return BIN_COLOURS.includes(colour as BinColour) ? colour as BinColour : null
}

function legacyFrequency(intervalWeeks: number): BinFrequency {
  return intervalWeeks === 1 ? 'weekly' : 'fortnightly_even'
}

export async function updateBinSchedule(formData: FormData) {
  await requireSession()

  const binId = textValue(formData.get('binId'))
  const anchorDate = isoDateFromInput(formData.get('anchorDate'))
  const collectionDay = numberFromInput(formData.get('collectionDay'), [0, 1, 2, 3, 4, 5, 6])
  const intervalWeeks = numberFromInput(formData.get('intervalWeeks'), INTERVALS)

  if (!binId || !anchorDate || collectionDay == null || intervalWeeks == null) return

  await db.update(bins)
    .set({
      collectionDay,
      intervalWeeks,
      frequency: legacyFrequency(intervalWeeks),
      anchorDate,
    })
    .where(and(eq(bins.id, binId), eq(bins.householdId, HOUSEHOLD_ID)))

  revalidateBins()
}

export async function createBin(formData: FormData) {
  await requireSession()

  const name = textValue(formData.get('name'))
  const colour = colourFromInput(formData.get('colour'))
  const anchorDate = isoDateFromInput(formData.get('anchorDate'))
  const collectionDay = numberFromInput(formData.get('collectionDay'), [0, 1, 2, 3, 4, 5, 6])
  const intervalWeeks = numberFromInput(formData.get('intervalWeeks'), INTERVALS)

  if (!name || !colour || !anchorDate || collectionDay == null || intervalWeeks == null) return

  await db.insert(bins).values({
    id: ulid(),
    householdId: HOUSEHOLD_ID,
    name,
    colour,
    collectionDay,
    frequency: legacyFrequency(intervalWeeks),
    intervalWeeks,
    anchorDate,
    active: true,
    createdAt: new Date(),
  })

  revalidateBins()
}
