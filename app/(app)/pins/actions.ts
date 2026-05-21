'use server'

import { db } from '@/lib/db'
import { pins, records, type PinColour } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { asc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'
import { getCategories, getCategoryMap } from '@/lib/entities/category-settings'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export type PinnableFact = { label: string; value: string }
export type PinnableRecord = { id: string; title: string; href: string; facts: PinnableFact[] }
export type PinnableCategory = { key: string; label: string; icon: string; color: string; records: PinnableRecord[] }

export async function getPinnableRecords(): Promise<PinnableCategory[]> {
  await requireSession()
  const [rows, categoryMap, categoryList] = await Promise.all([
    db.query.records.findMany({
      orderBy: [asc(records.sortOrder), asc(records.createdAt)],
      columns: { id: true, title: true, category: true, fields: true },
    }),
    getCategoryMap(),
    getCategories(),
  ])

  const byCategory = new Map<string, PinnableRecord[]>()
  for (const row of rows) {
    const facts = (row.fields ?? []).filter(field => field.value?.trim())
    if (facts.length === 0) continue
    const list = byCategory.get(row.category) ?? []
    list.push({
      id: row.id,
      title: row.title,
      href: `/life/admin/${row.id}`,
      facts: facts.map(field => ({ label: field.label, value: field.value })),
    })
    byCategory.set(row.category, list)
  }

  return categoryList
    .map(category => ({
      key: category.key,
      label: category.label,
      icon: category.icon,
      color: category.color,
      records: byCategory.get(category.key) ?? [],
    }))
    .filter(category => category.records.length > 0)
    .concat(
      // any records whose category no longer exists, grouped under a fallback
      Array.from(byCategory.entries())
        .filter(([key]) => !categoryMap[key])
        .map(([key, recs]) => ({ key, label: 'Other', icon: '📌', color: '#8E8E93', records: recs })),
    )
}

export type PinInput = {
  title: string
  body?: string | null
  colour?: PinColour
  linkHref?: string | null
}

export async function createPin(input: PinInput) {
  const session = await requireSession()
  const id = ulid()
  const now = new Date()
  await db.insert(pins).values({
    id,
    householdId: HOUSEHOLD_ID,
    createdById: session.user.id,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    colour: input.colour ?? 'yellow',
    linkHref: input.linkHref?.trim() || null,
    sortOrder: Date.now(),
    createdAt: now,
    updatedAt: now,
  })
  revalidatePath('/')
  return { id }
}

export async function updatePin(id: string, input: PinInput) {
  await requireSession()
  await db.update(pins).set({
    title: input.title.trim(),
    body: input.body?.trim() || null,
    colour: input.colour ?? 'yellow',
    updatedAt: new Date(),
  }).where(eq(pins.id, id))
  revalidatePath('/')
}

export async function deletePin(id: string) {
  await requireSession()
  await db.delete(pins).where(eq(pins.id, id))
  revalidatePath('/')
}
