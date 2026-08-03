import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { inArray, lt, max } from 'drizzle-orm'
import { db } from '@homeos/db'
import { tvChannels, tvProgrammes } from '@homeos/db/schema'
import { addLondonDays, londonDayBounds, londonDateKey, normalizeTvChannelName } from './tv-guide-time'

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
const EPG_REQUIRED_DAYS = Math.max(2, Number(process.env.TV_EPG_REQUIRED_DAYS ?? 7))
const EPG_MIN_LOOKAHEAD_MS = Number(process.env.TV_EPG_MIN_LOOKAHEAD_MS ?? EPG_REQUIRED_DAYS * 24 * 60 * 60 * 1000)
const EPG_IMPORT_MIN_LOOKAHEAD_MS = Number(process.env.TV_EPG_IMPORT_MIN_LOOKAHEAD_MS ?? 24 * 60 * 60 * 1000)
const EPG_HTTP_TIMEOUT_MS = Number(process.env.TV_EPG_HTTP_TIMEOUT_MS ?? 30_000)
const BATCH_SIZE = 500

let refreshInFlight: Promise<EpgRefreshResult> | null = null
let lastRefreshAttempt = 0
let lastRefreshSuccess: Date | null = null
let lastRefreshError: string | null = null
let lastRefreshSource: string | null = null

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
    const coreIds = coreChannelIds()
    const latest = await db.select({ channelId: tvProgrammes.channelId, value: max(tvProgrammes.endsAt) })
      .from(tvProgrammes)
      .where(inArray(tvProgrammes.channelId, coreIds))
      .groupBy(tvProgrammes.channelId)
    const requiredEnd = Date.now() + EPG_MIN_LOOKAHEAD_MS
    const coveredChannels = latest.filter(row => {
      const latestEnd = dateFromDb(row.value)
      return latestEnd && latestEnd.getTime() >= requiredEnd
    }).length
    const hasLookahead = coveredChannels / coreIds.length >= 0.9
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
  const configuredSources = process.env.TV_EPG_URLS?.trim() || process.env.TV_EPG_URL?.trim() || DEFAULT_EPG_URL
  const sourceUrls = configuredSources
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const failures: string[] = []
  let selected: (ReturnType<typeof parseXmltv> & { sourceUrl: string; coverageEnd: number }) | null = null
  const requiredLastDay = addLondonDays(londonDateKey(), EPG_REQUIRED_DAYS - 1)
  const requiredCoverageEnd = londonDayBounds(requiredLastDay).end.getTime()

  for (const sourceUrl of sourceUrls) {
    try {
      const xml = await fetchXmltv(sourceUrl)
      const parsed = parseXmltv(xml)
      const coverageEnd = validateImport(sourceUrl, parsed)
      if (!selected || coverageEnd > selected.coverageEnd) {
        selected = { ...parsed, sourceUrl, coverageEnd }
      }
      // Sources are ordered by preference. A complete local seven-day source
      // makes fallback requests unnecessary and avoids consuming their quotas.
      if (coverageEnd >= requiredCoverageEnd) break
    } catch (error) {
      failures.push(`${sourceUrl}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!selected) {
    lastRefreshError = failures.join('; ') || 'No TV guide sources were configured'
    throw new Error(lastRefreshError)
  }

  const { sourceUrl, channels, programmes, startsAt, endsAt } = selected
  db.transaction(tx => {
    // A validated import is a complete snapshot. Replacing both tables prevents
    // programmes from removed or renamed source channels lingering indefinitely.
    tx.delete(tvProgrammes).run()
    tx.delete(tvChannels).run()

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

  lastRefreshSuccess = new Date()
  lastRefreshError = null
  lastRefreshSource = sourceUrl
  return { sourceUrl, channels: channels.length, programmes: programmes.length, startsAt, endsAt }
}

export function tvGuideRefreshState() {
  return {
    requiredDays: EPG_REQUIRED_DAYS,
    lastAttemptAt: lastRefreshAttempt ? new Date(lastRefreshAttempt) : null,
    lastSuccessAt: lastRefreshSuccess,
    lastError: lastRefreshError,
    sourceUrl: lastRefreshSource,
    refreshing: Boolean(refreshInFlight),
  }
}

export async function pruneOldTvGuide(cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
  await db.delete(tvProgrammes).where(lt(tvProgrammes.endsAt, cutoff))
}

async function fetchXmltv(sourceUrl: string) {
  if (sourceUrl.startsWith('file://')) {
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(new URL(sourceUrl))
    const body = isGzip(sourceUrl, bytes) ? gunzipSync(bytes) : bytes
    return body.toString('utf8')
  }

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

function validateImport(sourceUrl: string, parsed: ReturnType<typeof parseXmltv>) {
  if (parsed.channels.length === 0 || parsed.programmes.length === 0) {
    throw new Error(`TV guide import produced no usable listings from ${sourceUrl}`)
  }
  const today = londonDateKey()
  const { end: tomorrowEnd } = londonDayBounds(today)
  const minimumEnd = new Date(Math.max(Date.now() + EPG_IMPORT_MIN_LOOKAHEAD_MS, tomorrowEnd.getTime()))
  if (!parsed.endsAt || parsed.endsAt < minimumEnd) {
    throw new Error(`TV guide ends too soon (${parsed.endsAt?.toISOString() ?? 'unknown'})`)
  }
  const coreChannels = coreChannelIds()
  const latestByChannel = new Map<string, Date>()
  for (const programme of parsed.programmes) {
    const latest = latestByChannel.get(programme.channelId)
    if (!latest || programme.endsAt > latest) latestByChannel.set(programme.channelId, programme.endsAt)
  }
  const coreEnds = coreChannels
    .map(channelId => latestByChannel.get(channelId)?.getTime() ?? 0)
    .sort((a, b) => b - a)
  const minimumCoveredChannels = Math.ceil(coreChannels.length * 0.75)
  const coverageEnd = coreEnds[minimumCoveredChannels - 1] ?? 0
  const coreCoverage = coreEnds.filter(value => value >= minimumEnd.getTime()).length
  if (coreCoverage / coreChannels.length < 0.75) {
    throw new Error(`TV guide contains only ${coreCoverage}/${coreChannels.length} core channels`)
  }
  return coverageEnd
}

function coreChannelIds() {
  return [
    regional(BBC_ONE_BY_REGION),
    'BBCTwoHD.uk',
    regional(ITV1_BY_REGION),
    regional(CHANNEL4_BY_REGION),
    '5.uk',
    'ITV2.uk',
    'BBCThreeHD.uk',
    'BBCFourHD.uk',
    'ITV3.uk',
    'ITV4.uk',
    'E4.uk',
    'More4.uk',
    'Film4.uk',
    'SkyMix.uk',
    '5USA.uk',
    'UAndDave.uk',
  ]
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

  const normalizedNames = names.map(normalizeTvChannelName)
  if (normalizedNames.some(name => name === 'bbc one' || name === 'bbc one hd' || name.startsWith('bbc one '))) return regional(BBC_ONE_BY_REGION)
  if (normalizedNames.includes('bbc two hd')) return 'BBCTwoHD.uk'
  if (normalizedNames.some(name => name === 'itv1 hd' || name.startsWith('itv1 '))) return regional(ITV1_BY_REGION)
  if (normalizedNames.some(name => name === 'channel 4 hd' || name.startsWith('channel 4 '))) return regional(CHANNEL4_BY_REGION)
  if (normalizedNames.includes('channel 5 hd') || normalizedNames.includes('channel 5')) return '5.uk'
  const nameAliases: Record<string, string> = {
    'bbc two': 'BBCTwoHD.uk',
    'bbc three': 'BBCThreeHD.uk',
    'bbc three hd': 'BBCThreeHD.uk',
    'bbc four': 'BBCFourHD.uk',
    'bbc four hd': 'BBCFourHD.uk',
    itv1: regional(ITV1_BY_REGION),
    itv2: 'ITV2.uk',
    'itv2 hd': 'ITV2.uk',
    itv3: 'ITV3.uk',
    'itv3 hd': 'ITV3.uk',
    itv4: 'ITV4.uk',
    'itv4 hd': 'ITV4.uk',
    'channel 4': regional(CHANNEL4_BY_REGION),
    '5': '5.uk',
    e4: 'E4.uk',
    'e4 hd': 'E4.uk',
    more4: 'More4.uk',
    'more 4': 'More4.uk',
    'more4 hd': 'More4.uk',
    film4: 'Film4.uk',
    'film4 hd': 'Film4.uk',
    'sky mix': 'SkyMix.uk',
    'sky mix hd': 'SkyMix.uk',
    '5usa': '5USA.uk',
    '5 usa': '5USA.uk',
    'u and dave': 'UAndDave.uk',
    uanddave: 'UAndDave.uk',
    'u&dave': 'UAndDave.uk',
    dave: 'UAndDave.uk',
  }
  for (const name of normalizedNames) {
    if (nameAliases[name]) return nameAliases[name]
  }
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
