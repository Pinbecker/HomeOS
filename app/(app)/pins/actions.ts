'use server'

import { db } from '@/lib/db'
import { pins, type PinColour } from '@/lib/db/schema'
import { requireSession } from '@/lib/auth/session'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { revalidatePath } from 'next/cache'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export type PinInput = {
  title: string
  body?: string | null
  colour?: PinColour
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
