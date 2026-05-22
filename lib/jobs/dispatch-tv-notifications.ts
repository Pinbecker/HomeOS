import { db } from '@/lib/db'
import { items, notifications } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { getTodayMatches } from '@/lib/services/epg'
import { formatAirtime, channelName } from '@/lib/utils/freeview-channels'
import { sendPushToAll } from '@/lib/services/push'
import { ulid } from 'ulid'

function todayYMD(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function dispatchTvNotifications(): Promise<void> {
  const followed = await db.query.items.findMany({
    where: and(
      eq(items.type, 'watchlist_tv'),
      eq(items.status, 'active'),
      isNull(items.deletedAt),
    ),
    columns: { id: true, title: true, metadata: true },
  })

  if (followed.length === 0) return

  const matches = await getTodayMatches(followed.map(f => ({
    title: f.title,
    channel: (f.metadata as Record<string, unknown> | null)?.channel as string ?? null,
  })))
  if (matches.length === 0) return

  const today = todayYMD()
  const allUsers = await db.query.users.findMany({ columns: { id: true } })

  for (const prog of matches) {
    // Dedup by title + date so a show airing on multiple channels notifies once
    const entityId = `${prog.title.toLowerCase()}:${today}`

    const existing = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.entityType, 'tv_tonight'),
        eq(notifications.entityId, entityId),
      ),
      columns: { id: true },
    })
    if (existing) continue

    const channel = channelName(prog.channelId)
    const body = `${prog.title} – on tonight at ${formatAirtime(prog.startsAt)} on ${channel}`

    await sendPushToAll({ title: 'On tonight', body, url: '/watch' })

    const now = new Date()
    await db.insert(notifications).values(
      allUsers.map(u => ({
        id: ulid(),
        userId: u.id,
        title: 'On tonight',
        body,
        entityType: 'tv_tonight',
        entityId,
        createdAt: now,
      }))
    )

    console.log(`[tv-notifications] Sent: ${body}`)
  }
}
