import { NextResponse } from 'next/server'
import { getDayGrid } from '@/lib/services/epg'
import { getMainChannelDefs } from '@/lib/utils/freeview-channels'
import { requireSession } from '@/lib/auth/session'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ date: string }> }
) {
  await requireSession()
  const { date } = await params

  // Expect YYYY-MM-DD; build a local-midnight Date
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const target = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date()

  const feedIds = getMainChannelDefs().map(c => c.feedId)
  const grid = await getDayGrid(feedIds, target)
  return NextResponse.json(grid)
}
