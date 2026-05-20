'use server'

import { db } from '@/lib/db'
import { records, type RecordCategory, type RecordField } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export type RecordInput = {
  category: RecordCategory
  title: string
  subtitle?: string | null
  fields: RecordField[]
  renewalDate?: number | null
  renewalLabel?: string | null
  notes?: string | null
}

function cleanFields(fields: RecordField[]): RecordField[] {
  return fields
    .map(f => ({ label: f.label.trim(), value: f.value.trim() }))
    .filter(f => f.label || f.value)
}

export async function createRecord(input: RecordInput) {
  await requireSession()
  const id = ulid()
  const now = new Date()
  await db.insert(records).values({
    id,
    householdId: HOUSEHOLD_ID,
    category: input.category,
    title: input.title.trim(),
    subtitle: input.subtitle?.trim() || null,
    fields: cleanFields(input.fields),
    renewalDate: input.renewalDate ? new Date(input.renewalDate) : null,
    renewalLabel: input.renewalLabel?.trim() || null,
    notes: input.notes?.trim() || null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath(`/life/${input.category}`)
  revalidatePath('/life')
  revalidatePath('/')
  return { id }
}

export async function updateRecord(id: string, input: RecordInput) {
  await requireSession()
  await db.update(records)
    .set({
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() || null,
      fields: cleanFields(input.fields),
      renewalDate: input.renewalDate ? new Date(input.renewalDate) : null,
      renewalLabel: input.renewalLabel?.trim() || null,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(records.id, id))
  revalidatePath(`/life/${input.category}`)
  revalidatePath('/life')
  revalidatePath('/')
}

export async function deleteRecord(id: string, category: string) {
  await requireSession()
  await db.delete(records).where(eq(records.id, id))
  revalidatePath(`/life/${category}`)
  revalidatePath('/life')
  revalidatePath('/')
}
