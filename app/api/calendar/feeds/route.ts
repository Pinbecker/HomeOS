import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { calendarFeeds } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { syncIcsFeed } from '@/lib/services/ics-sync'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

const createSchema = z.object({
  name:  z.string().trim().min(1).max(200),
  url:   z.string().url().max(2000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const feeds = await db.query.calendarFeeds.findMany({
    where: eq(calendarFeeds.householdId, HOUSEHOLD_ID),
    columns: { id: true, name: true, url: true, color: true, enabled: true, lastSyncedAt: true, errorMessage: true },
  })
  return NextResponse.json({ feeds })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 })

  const now = new Date()
  const id = ulid()
  await db.insert(calendarFeeds).values({
    id, householdId: HOUSEHOLD_ID,
    name: parsed.data.name,
    url: parsed.data.url,
    color: parsed.data.color ?? '#007AFF',
    enabled: true,
    createdAt: now, updatedAt: now,
  })

  // Kick off first sync (non-blocking — errors are recorded on the feed row)
  syncIcsFeed(id).catch(() => {})

  const feed = await db.query.calendarFeeds.findFirst({ where: eq(calendarFeeds.id, id) })
  return NextResponse.json({ feed }, { status: 201 })
}
