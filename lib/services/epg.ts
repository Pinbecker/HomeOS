import { db } from '@/lib/db'
import { tvProgrammes, tvChannels } from '@/lib/db/schema'
import { and, gt, gte, lte, lt, eq, asc, inArray } from 'drizzle-orm'
import { CHANNELS, channelName } from '@/lib/utils/freeview-channels'

export type Programme = {
  id: string
  channelId: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  iconUrl: string | null
  episodeNum: string | null
}

export type ChannelNowNext = {
  feedId: string
  name: string
  logo: string | null
  now: Programme | null
  next: Programme | null
}

async function channelLogoMap(): Promise<Map<string, string | null>> {
  const rows = await db.select({ id: tvChannels.id, logo: tvChannels.logo }).from(tvChannels)
  return new Map(rows.map(r => [r.id, r.logo]))
}

// What's on now (and next) for every channel, in registry order.
export async function getOnNow(at: Date = new Date()): Promise<ChannelNowNext[]> {
  const horizon = new Date(at.getTime() + 12 * 60 * 60 * 1000)
  const rows = await db.select().from(tvProgrammes)
    .where(and(gt(tvProgrammes.endsAt, at), lte(tvProgrammes.startsAt, horizon)))
    .orderBy(asc(tvProgrammes.startsAt))

  const byChannel = new Map<string, Programme[]>()
  for (const r of rows) {
    if (!byChannel.has(r.channelId)) byChannel.set(r.channelId, [])
    byChannel.get(r.channelId)!.push(r)
  }

  const logos = await channelLogoMap()

  return CHANNELS.map(ch => {
    const list = byChannel.get(ch.feedId) ?? []
    const current = list.find(p => p.startsAt <= at && p.endsAt > at) ?? null
    const next = list.find(p => p.startsAt > at) ?? null
    return {
      feedId: ch.feedId,
      name: ch.name,
      logo: logos.get(ch.feedId) ?? null,
      now: current,
      next,
    }
  })
}

// Full day's listings for a single channel (local day of `date`).
export async function getChannelDay(channelId: string, date: Date = new Date()): Promise<Programme[]> {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return db.select().from(tvProgrammes)
    .where(and(
      eq(tvProgrammes.channelId, channelId),
      lt(tvProgrammes.startsAt, dayEnd),
      gte(tvProgrammes.endsAt, dayStart),
    ))
    .orderBy(asc(tvProgrammes.startsAt))
}

export type GridChannel = {
  feedId: string
  name: string
  logo: string | null
  programmes: Programme[]
}

// Full day's listings for a set of channels, grouped in registry order — powers the grid.
export async function getDayGrid(feedIds: string[], date: Date = new Date()): Promise<GridChannel[]> {
  if (feedIds.length === 0) return []
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)

  const rows = await db.select().from(tvProgrammes)
    .where(and(
      inArray(tvProgrammes.channelId, feedIds),
      lt(tvProgrammes.startsAt, dayEnd),
      gte(tvProgrammes.endsAt, dayStart),
    ))
    .orderBy(asc(tvProgrammes.startsAt))

  const byChannel = new Map<string, Programme[]>()
  for (const r of rows) {
    if (!byChannel.has(r.channelId)) byChannel.set(r.channelId, [])
    byChannel.get(r.channelId)!.push(r)
  }

  const logos = await channelLogoMap()

  // feedIds arrive already in registry order (see getMainChannelDefs).
  return feedIds.map(feedId => ({
    feedId,
    name: channelName(feedId),
    logo: logos.get(feedId) ?? null,
    programmes: byChannel.get(feedId) ?? [],
  }))
}

export type FollowMatch = { title: string; channel: string | null }

// Programmes matching followed shows, airing later today (for "on tonight").
// A follow matches by title AND, if a channel was recorded, only on that same
// channel — so following Gogglebox on Channel 4 won't trigger on reruns
// elsewhere. Follows with no stored channel fall back to title-only matching.
export async function getTodayMatches(
  follows: FollowMatch[],
  from: Date = new Date(),
): Promise<Programme[]> {
  if (follows.length === 0) return []
  const dayEnd = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 23, 59, 59)
  const rows = await db.select().from(tvProgrammes)
    .where(and(gt(tvProgrammes.endsAt, from), lte(tvProgrammes.startsAt, dayEnd)))
    .orderBy(asc(tvProgrammes.startsAt))

  // title (lowercased) → allowed channels. anyChannel=true means match any channel.
  const wanted = new Map<string, { anyChannel: boolean; channels: Set<string> }>()
  for (const f of follows) {
    const key = f.title.toLowerCase()
    const entry = wanted.get(key) ?? { anyChannel: false, channels: new Set<string>() }
    if (f.channel && f.channel.trim()) entry.channels.add(f.channel.trim())
    else entry.anyChannel = true
    wanted.set(key, entry)
  }

  return rows.filter(r => {
    const entry = wanted.get(r.title.toLowerCase())
    if (!entry) return false
    if (entry.anyChannel) return true
    return entry.channels.has(channelName(r.channelId))
  })
}

export function channelDisplayName(feedId: string): string {
  return channelName(feedId)
}
