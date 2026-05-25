import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { calendarFeeds, calendarEvents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

const patchSchema = z.object({
  name:    z.string().trim().min(1).max(200).optional(),
  color:   z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  enabled: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const feed = await db.query.calendarFeeds.findFirst({
    where: and(eq(calendarFeeds.id, id), eq(calendarFeeds.householdId, HOUSEHOLD_ID)),
  })
  if (!feed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  const update: Partial<typeof feed> = { updatedAt: new Date() }
  if (parsed.data.name    !== undefined) update.name    = parsed.data.name
  if (parsed.data.color   !== undefined) update.color   = parsed.data.color
  if (parsed.data.enabled !== undefined) update.enabled = parsed.data.enabled

  await db.update(calendarFeeds).set(update).where(eq(calendarFeeds.id, id))
  const updated = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, id) })
  return NextResponse.json({ feed: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const feed = await db.query.calendarFeeds.findFirst({
    where: and(eq(calendarFeeds.id, id), eq(calendarFeeds.householdId, HOUSEHOLD_ID)),
  })
  if (!feed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // Remove all synced events from this feed then the feed itself
  await db.delete(calendarEvents).where(eq(calendarEvents.calendarId, `ics:${id}`))
  await db.delete(calendarFeeds).where(eq(calendarFeeds.id, id))

  return NextResponse.json({ ok: true })
}
