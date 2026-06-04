import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { inArray, lt, max } from 'drizzle-orm'
import { db } from '@homeos/db'
import { tvChannels, tvProgrammes } from '@homeos/db/schema'

type XmltvChannel = {
  sourceId: string
  canonicalId: string
  name: string
  logo: string | null
  priority: number
}

type XmltvProgramme = {
  id: string
  channelId: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  iconUrl: string | null
  episodeNum: string | null
}

export type EpgRefreshResult = {
  sourceUrl: string
  channels: number
  programmes: number
  startsAt: Date | null
  endsAt: Date | null
}

const DEFAULT_EPG_URL = 'https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz'
const EPG_REFRESH_INTERVAL_MS = Number(process.env.TV_EPG_REFRESH_INTERVAL_MS ?? 12 * 60 * 60 * 1000)
const EPG_MIN_LOOKAHEAD_MS = Number(process.env.TV_EPG_MIN_LOOKAHEAD_MS ?? 12 * 60 * 60 * 1000)
const EPG_HTTP_TIMEOUT_MS = Number(process.env.TV_EPG_HTTP_TIMEOUT_MS ?? 30_000)
const BATCH_SIZE = 500

let refreshInFlight: Promise<EpgRefreshResult> | null = null
let lastRefreshAttempt = 0

const REGION = process.env.TV_REGION ?? 'south_west'
const BBC_ONE_BY_REGION: Record<string, string> = {
  london: 'BBCOneLondonHD.uk',
  south: 'BBCOneSouth.uk',
  south_west: 'BBCOneSouthWest.uk',
  north_west: 'BBCOneNorthWest.uk',
  midlands: 'BBCOneWestMidlands.uk',
  wales: 'BBCOneWalesHD.uk',
  scotland: 'BBCOneScotHD.uk',
}
const ITV1_BY_REGION: Record<string, string> = {
  london: 'ITV1London.uk',
  south: 'ITV1MeridianS.uk',
  south_west: 'ITV1WestCountry.uk',
  north_west: 'ITV1Granada.uk',
  midlands: 'ITV1CentralW.uk',
  wales: 'ITV1Wales.uk',
  scotland: 'STVCentral.uk',
}
const CHANNEL4_BY_REGION: Record<string, string> = {
  london: 'Channel4London.uk',
  south: 'Channel4South.uk',
  south_west: 'Channel4South.uk',
  north_west: 'Channel4North.uk',
  midlands: 'Channel4Midlands.uk',
  wales: 'Channel4London.uk',
  scotland: 'Channel4Scotland.uk',
}

const CHANNEL_ALIASES: Record<string, string> = {
  'BBC.One.Lon.HD.uk': BBC_ONE_BY_REGION.london,
  'BBC.One.Sth.HD.uk': BBC_ONE_BY_REGION.south,
  'BBC.One.S.West.HD.uk': BBC_ONE_BY_REGION.south_west,
  'BBC.One.N.West.HD.uk': BBC_ONE_BY_REGION.north_west,
  'BBC.One.WM.HD.uk': BBC_ONE_BY_REGION.midlands,
  'BBC.One.Wal.HD.uk': BBC_ONE_BY_REGION.wales,
  'BBC.One.ScotHD.uk': BBC_ONE_BY_REGION.scotland,
  'BBC.Two.HD.uk': 'BBCTwoHD.uk',
  'ITV1.HD.uk': regional(ITV1_BY_REGION),
  'STV.Central.uk': ITV1_BY_REGION.scotland,
  'Channel.4.HD.uk': regional(CHANNEL4_BY_REGION),
  'Channel.5.HD.uk': '5.uk',
  'Channel.5.uk': '5.uk',
  'ITV2.HD.uk': 'ITV2.uk',
  'BBC.Three.HD.uk': 'BBCThreeHD.uk',
  'BBC.Four.HD.uk': 'BBCFourHD.uk',
  'ITV3.HD.uk': 'ITV3.uk',
  'ITV4.HD.uk': 'ITV4.uk',
  'E4.HD.uk': 'E4.uk',
  'E4.Extra.uk': 'E4Extra.uk',
  'More4.HD.uk': 'More4.uk',
  '4seven.uk': '4seven.uk',
  'Film4.HD.uk': 'Film4.uk',
  'Sky.Mix.HD.uk': 'SkyMix.uk',
  'Sky.Arts.HD.uk': 'SkyArts.uk',
  'U.and.Dave.HD.uk': 'UAndDave.uk',
  'U.and.Drama.HD.uk': 'UAndDrama.uk',
  'U.and.Yesterday.HD.uk': 'UAndYesterday.uk',
  'U.and.W.HD.uk': 'UAndW.uk',
  'U.and.Eden.HD.uk': 'UAndEden.uk',
  '5.USA.uk': '5USA.uk',
  '5Star.uk': '5Star.uk',
  '5.Action.uk': '5Action.uk',
  '5.Select.uk': '5Select.uk',
  'Really.uk': 'Really.uk',
}

export async function ensureTvGuideFresh(force = false) {
  if (refreshInFlight) return refreshInFlight

  if (!force) {
    const latest = await db.select({ value: max(tvProgrammes.endsAt) }).from(tvProgrammes)
    const latestEnd = dateFromDb(latest[0]?.value ?? null)
    const hasLookahead = Boolean(latestEnd && latestEnd.getTime() >= Date.now() + EPG_MIN_LOOKAHEAD_MS)
    const attemptedRecently = Date.now() - lastRefreshAttempt < EPG_REFRESH_INTERVAL_MS
    if (hasLookahead || attemptedRecently) return null
  }

  lastRefreshAttempt = Date.now()
  refreshInFlight = refreshTvGuide().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

export async function refreshTvGuide(): Promise<EpgRefreshResult> {
  const sourceUrl = process.env.TV_EPG_URL ?? DEFAULT_EPG_URL
  const xml = await fetchXmltv(sourceUrl)
  const { channels, programmes, startsAt, endsAt } = parseXmltv(xml)

  if (channels.length === 0 || programmes.length === 0) {
    throw new Error(`TV guide import produced no usable listings from ${sourceUrl}`)
  }

  db.transaction(tx => {
    const canonicalIds = channels.map(channel => channel.canonicalId)
    tx.delete(tvProgrammes).where(inArray(tvProgrammes.channelId, canonicalIds)).run()
    tx.delete(tvChannels).where(inArray(tvChannels.id, canonicalIds)).run()

    tx.insert(tvChannels).values(channels.map(channel => ({
      id: channel.canonicalId,
      name: channel.name,
      logo: channel.logo,
      updatedAt: new Date(),
    }))).run()

    for (let index = 0; index < programmes.length; index += BATCH_SIZE) {
      tx.insert(tvProgrammes).values(programmes.slice(index, index + BATCH_SIZE)).run()
    }
  })

  return { sourceUrl, channels: channels.length, programmes: programmes.length, startsAt, endsAt }
}

export async function pruneOldTvGuide(cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  await db.delete(tvProgrammes).where(lt(tvProgrammes.endsAt, cutoff))
}

async function fetchXmltv(sourceUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EPG_HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal })
    if (!response.ok) throw new Error(`TV guide feed failed with ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    const body = isGzip(sourceUrl, bytes) ? gunzipSync(bytes) : bytes
    const text = body.toString('utf8')
    if (!text.includes('<tv') || !text.includes('<programme')) {
      throw new Error('TV guide feed did not contain XMLTV data')
    }
    return text
  } finally {
    clearTimeout(timeout)
  }
}

function parseXmltv(xml: string) {
  const channelCandidates: XmltvChannel[] = []
  for (const match of xml.matchAll(/<channel\s+([^>]*)>([\s\S]*?)<\/channel>/g)) {
    const sourceId = readAttr(match[1], 'id')
    if (!sourceId) continue
    const names = readElements(match[2], 'display-name')
    const name = cleanText(names[0] ?? sourceId)
    const canonicalId = canonicalChannelId(sourceId, names)
    if (!canonicalId) continue
    channelCandidates.push({
      sourceId,
      canonicalId,
      name: displayChannelName(canonicalId, name),
      logo: readIcon(match[2]),
      priority: channelPriority(sourceId, names),
    })
  }

  const channels = dedupeChannels(channelCandidates)
  const sourceToCanonical = new Map(channels.map(channel => [channel.sourceId, channel.canonicalId]))
  const programmes: XmltvProgramme[] = []
  let startsAt: Date | null = null
  let endsAt: Date | null = null

  for (const match of xml.matchAll(/<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const attrs = match[1]
    const channelId = sourceToCanonical.get(readAttr(attrs, 'channel') ?? '')
    if (!channelId) continue

    const start = parseXmltvDate(readAttr(attrs, 'start'))
    const stop = parseXmltvDate(readAttr(attrs, 'stop'))
    if (!start || !stop || stop <= start) continue

    const title = cleanText(readElement(match[2], 'title') ?? '')
    if (!title) continue

    startsAt = minDate(startsAt, start)
    endsAt = maxDate(endsAt, stop)
    programmes.push({
      id: programmeId(channelId, start, stop, title),
      channelId,
      title,
      description: cleanNullable(readElement(match[2], 'desc')),
      startsAt: start,
      endsAt: stop,
      iconUrl: readIcon(match[2]),
      episodeNum: cleanNullable(readElement(match[2], 'episode-num')),
    })
  }

  return { channels, programmes, startsAt, endsAt }
}

function dedupeChannels(candidates: XmltvChannel[]) {
  const chosen = new Map<string, XmltvChannel>()
  for (const channel of candidates.sort((a, b) => b.priority - a.priority)) {
    if (!chosen.has(channel.canonicalId)) chosen.set(channel.canonicalId, channel)
  }
  return [...chosen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function canonicalChannelId(sourceId: string, names: string[]) {
  const exact = CHANNEL_ALIASES[sourceId]
  if (exact) return exact

  const normalizedNames = names.map(normalizeName)
  if (normalizedNames.includes('bbc two hd')) return 'BBCTwoHD.uk'
  if (normalizedNames.includes('itv1 hd')) return regional(ITV1_BY_REGION)
  if (normalizedNames.includes('channel 4 hd')) return regional(CHANNEL4_BY_REGION)
  if (normalizedNames.includes('channel 5 hd') || normalizedNames.includes('channel 5')) return '5.uk'
  return null
}

function channelPriority(sourceId: string, names: string[]) {
  const value = [sourceId, ...names].join(' ').toLowerCase()
  let score = value.includes(' hd') || value.includes('.hd.') ? 20 : 0
  if (value.includes('+1') || value.includes('ja vu')) score -= 100
  if (value.includes(' south west') || value.includes(' s west')) score += REGION === 'south_west' ? 10 : 0
  if (value.includes(' london') || value.includes(' lon ')) score += REGION === 'london' ? 10 : 0
  return score
}

function displayChannelName(canonicalId: string, fallback: string) {
  const names: Record<string, string> = {
    'BBCOneSouthWest.uk': 'BBC One',
    'BBCOneSouth.uk': 'BBC One',
    'BBCOneLondonHD.uk': 'BBC One',
    'BBCTwoHD.uk': 'BBC Two',
    'ITV1WestCountry.uk': 'ITV1',
    'ITV1MeridianS.uk': 'ITV1',
    'ITV1London.uk': 'ITV1',
    'STVCentral.uk': 'STV',
    'Channel4South.uk': 'Channel 4',
    'Channel4London.uk': 'Channel 4',
    '5.uk': 'Channel 5',
    'UAndDave.uk': 'U&Dave',
  }
  return names[canonicalId] ?? fallback.replace(/\s+HD$/i, '')
}

function readAttr(source: string | undefined, name: string) {
  if (!source) return null
  const match = new RegExp(`${name}="([^"]*)"`).exec(source)
  return match ? decodeXml(match[1]) : null
}

function readElement(source: string, tag: string) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`).exec(source)
  return match ? decodeXml(match[1]) : null
}

function readElements(source: string, tag: string) {
  return [...source.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g'))]
    .map(match => cleanText(decodeXml(match[1] ?? '')))
    .filter(Boolean)
}

function readIcon(source: string) {
  const match = /<icon\s+([^>]*)\/?>/.exec(source)
  return cleanNullable(readAttr(match?.[1], 'src'))
}

function parseXmltvDate(value: string | null) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/.exec(value ?? '')
  if (!match) return null
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]))
  const offset = match[7] ? (Number(match[8]) * 60 + Number(match[9])) * 60 * 1000 * (match[7] === '+' ? 1 : -1) : 0
  return new Date(utc - offset)
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function cleanNullable(value: string | null) {
  const cleaned = value ? cleanText(value) : ''
  return cleaned || null
}

function minDate(current: Date | null, next: Date) {
  return !current || next.getTime() < current.getTime() ? next : current
}

function maxDate(current: Date | null, next: Date) {
  return !current || next.getTime() > current.getTime() ? next : current
}

function normalizeName(value: string) {
  return cleanText(value).toLowerCase().replace(/&/g, 'and')
}

function programmeId(channelId: string, start: Date, stop: Date, title: string) {
  const digest = createHash('sha1').update(`${channelId}:${start.toISOString()}:${stop.toISOString()}:${title}`).digest('hex').slice(0, 12)
  return `tv:${channelId}:${Math.floor(start.getTime() / 1000)}:${digest}`
}

function isGzip(sourceUrl: string, bytes: Buffer) {
  return sourceUrl.endsWith('.gz') || (bytes[0] === 0x1f && bytes[1] === 0x8b)
}

function dateFromDb(value: unknown) {
  if (value instanceof Date) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value)
  }
  return null
}

function regional(map: Record<string, string>) {
  return map[REGION] ?? map.london
}
