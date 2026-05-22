import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOnNow, getTodayMatches, getDayGrid } from '@/lib/services/epg'
import { getMainChannelDefs } from '@/lib/utils/freeview-channels'
import { WatchClient } from './watch-client'

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function WatchPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; at?: string }>
}) {
  await requireSession()
  const sp = await searchParams
  const focusAt = sp.at ? Number(sp.at) : NaN
  const focus = sp.channel && Number.isFinite(focusAt)
    ? { channelId: sp.channel, atMs: focusAt }
    : null

  const followedShows = await db.query.items.findMany({
    where: and(
      eq(items.type, 'watchlist_tv'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
    ),
    columns: { id: true, title: true, metadata: true },
  })

  const now = new Date()
  const mainFeedIds = getMainChannelDefs().map(c => c.feedId)

  const [channels, tonight, initialGrid] = await Promise.all([
    getOnNow(),
    getTodayMatches(followedShows.map(s => ({
      title: s.title,
      channel: (s.metadata as Record<string, unknown> | null)?.channel as string ?? null,
    }))),
    getDayGrid(mainFeedIds, now),
  ])

  return (
    <WatchClient
      channels={channels}
      followedShows={followedShows}
      tonight={tonight}
      initialGrid={initialGrid}
      today={ymd(now)}
      focus={focus}
    />
  )
}
