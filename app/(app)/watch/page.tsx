import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getOnNow, getTodayMatches } from '@/lib/services/epg'
import { WatchClient } from './watch-client'

export default async function WatchPage() {
  await requireSession()

  const followedShows = await db.query.items.findMany({
    where: and(
      eq(items.type, 'watchlist_tv'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
    ),
    columns: { id: true, title: true, metadata: true },
  })

  const [channels, tonight] = await Promise.all([
    getOnNow(),
    getTodayMatches(followedShows.map(s => ({
      title: s.title,
      channel: (s.metadata as Record<string, unknown> | null)?.channel as string ?? null,
    }))),
  ])

  return (
    <WatchClient
      channels={channels}
      followedShows={followedShows}
      tonight={tonight}
    />
  )
}
