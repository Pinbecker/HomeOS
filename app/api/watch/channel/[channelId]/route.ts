import { NextResponse } from 'next/server'
import { getChannelDay } from '@/lib/services/epg'
import { requireSession } from '@/lib/auth/session'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  await requireSession()
  const { channelId } = await params
  const dateParam = new URL(req.url).searchParams.get('date')
  const date = dateParam ? new Date(dateParam) : new Date()
  const programmes = await getChannelDay(channelId, date)
  return NextResponse.json(programmes)
}
