import { XMLParser } from 'fast-xml-parser'
import { db } from '@/lib/db'
import { tvChannels, tvProgrammes } from '@/lib/db/schema'
import { CHANNEL_FEED_IDS, isKnownChannel } from '@/lib/utils/freeview-channels'
import { ulid } from 'ulid'
import { sql } from 'drizzle-orm'

const FEED_URL = process.env.EPG_FEED_URL
  ?? 'https://raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml'

const wantedChannels = new Set(CHANNEL_FEED_IDS)

// XMLTV time format: "20260521210000 +0100" → Date
function parseXmltvDate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s, off] = m
  const tz = off ? `${off.slice(0, 3)}:${off.slice(3)}` : 'Z'
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`)
  return isNaN(date.getTime()) ? null : date
}

// A node may be a string, or { '#text': string, '@_...': ... }
function text(node: unknown): string | null {
  if (node == null) return null
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    const t = (node as Record<string, unknown>)['#text']
    return t == null ? null : String(t)
  }
  return null
}

function pickEpisodeNum(node: unknown): string | null {
  const arr = Array.isArray(node) ? node : node == null ? [] : [node]
  for (const e of arr) {
    if (e && typeof e === 'object' && (e as Record<string, unknown>)['@_system'] === 'onscreen') {
      return text(e)
    }
  }
  return null
}

type RawProgramme = {
  '@_channel'?: string
  '@_start'?: string
  '@_stop'?: string
  title?: unknown
  desc?: unknown
  icon?: { '@_src'?: string } | { '@_src'?: string }[]
  'episode-num'?: unknown
}

type RawChannel = {
  '@_id'?: string
  'display-name'?: unknown
  icon?: { '@_src'?: string } | { '@_src'?: string }[]
}

function firstIconSrc(icon: RawProgramme['icon'] | RawChannel['icon']): string | null {
  if (!icon) return null
  const one = Array.isArray(icon) ? icon[0] : icon
  return one?.['@_src'] ?? null
}

export async function ingestEpg(): Promise<{ channels: number; programmes: number }> {
  const res = await fetch(FEED_URL, {
    headers: { 'Accept-Encoding': 'gzip' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`EPG feed fetch failed: ${res.status}`)
  const xml = await res.text()

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'programme' || name === 'channel' || name === 'episode-num',
  })
  const parsed = parser.parse(xml)
  const tv = parsed?.tv ?? {}
  const rawChannels: RawChannel[] = tv.channel ?? []
  const rawProgrammes: RawProgramme[] = tv.programme ?? []

  const now = new Date()

  // Channels we care about
  const channelRows = rawChannels
    .filter(c => c['@_id'] && isKnownChannel(c['@_id']))
    .map(c => ({
      id: c['@_id'] as string,
      name: text(c['display-name']) ?? (c['@_id'] as string),
      logo: firstIconSrc(c.icon),
      updatedAt: now,
    }))

  // Programmes for our channels
  const programmeRows = rawProgrammes
    .filter(p => p['@_channel'] && wantedChannels.has(p['@_channel']))
    .map(p => {
      const startsAt = parseXmltvDate(p['@_start'] ?? '')
      const endsAt = parseXmltvDate(p['@_stop'] ?? '')
      const title = text(p.title)
      if (!startsAt || !endsAt || !title) return null
      return {
        id: ulid(),
        channelId: p['@_channel'] as string,
        title,
        description: text(p.desc),
        startsAt,
        endsAt,
        iconUrl: firstIconSrc(p.icon),
        episodeNum: pickEpisodeNum(p['episode-num']),
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  // Replace all listings transactionally (full 7-day feed, idempotent).
  db.transaction(tx => {
    tx.run(sql`DELETE FROM tv_programmes`)
    tx.run(sql`DELETE FROM tv_channels`)

    for (const c of channelRows) {
      tx.insert(tvChannels).values(c).run()
    }

    const CHUNK = 400
    for (let i = 0; i < programmeRows.length; i += CHUNK) {
      tx.insert(tvProgrammes).values(programmeRows.slice(i, i + CHUNK)).run()
    }
  })

  console.log(`[epg] Ingested ${channelRows.length} channels, ${programmeRows.length} programmes`)
  return { channels: channelRows.length, programmes: programmeRows.length }
}
