import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { calendarFeeds } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { syncIcsFeed } from '@/lib/services/ics-sync'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params
  const feed = await db.query.calendarFeeds.findFirst({
    where: and(eq(calendarFeeds.id, id), eq(calendarFeeds.householdId, HOUSEHOLD_ID)),
  })
  if (!feed) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const result = await syncIcsFeed(id)
  return NextResponse.json(result, { status: result.error ? 500 : 200 })
}
