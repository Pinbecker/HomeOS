type TvmazeShow = {
  id: number
  name: string
  network?: { name?: string; country?: { code?: string } } | null
  webChannel?: { name?: string; country?: { code?: string } } | null
}

type TvmazeSearchResult = {
  score?: number
  show: TvmazeShow
}

type TvmazeEpisode = {
  id: number
  name?: string | null
  season?: number | null
  number?: number | null
  airdate?: string | null
  airtime?: string | null
  airstamp?: string | null
}

export type FollowedTvShow = {
  title: string
  channel: string | null
  tvmazeId?: number | null
  matchMode?: string | null
}

export type ProgrammeLike = {
  title: string
  channelId: string
  startsAt: Date
  episodeNum: string | null
  description: string | null
}

type CacheEntry<T> = {
  expiresAt: number
  value: Promise<T>
}

type ResolvedShow = {
  id: number
  name: string
}

const SEARCH_CACHE_MS = 30 * 24 * 60 * 60 * 1000
const EPISODE_CACHE_MS = 6 * 60 * 60 * 1000
const AIRTIME_TOLERANCE_MS = 4 * 60 * 60 * 1000
const RECENT_ORIGINAL_AIRDATE_MS = 48 * 60 * 60 * 1000
const searchCache = new Map<string, CacheEntry<ResolvedShow | null>>()
const episodeCache = new Map<number, CacheEntry<TvmazeEpisode[]>>()

function tvmazeBaseUrl() {
  return (process.env.TVMAZE_API_BASE ?? 'https://api.tvmaze.com').replace(/\/$/, '')
}

function cacheGet<T>(cache: Map<string, CacheEntry<T>>, key: string, loader: () => Promise<T>, ttlMs: number) {
  const existing = cache.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch(error => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { expiresAt: Date.now() + ttlMs, value })
  return value
}

function cacheGetNumber<T>(cache: Map<number, CacheEntry<T>>, key: number, loader: () => Promise<T>, ttlMs: number) {
  const existing = cache.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing.value
  const value = loader().catch(error => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { expiresAt: Date.now() + ttlMs, value })
  return value
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()
}

function countryCode(show: TvmazeShow) {
  return show.network?.country?.code ?? show.webChannel?.country?.code ?? null
}

async function tvmazeFetch<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`${tvmazeBaseUrl()}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const response = await fetch(url)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`TVMaze request failed with ${response.status}`)
  return response.json() as Promise<T>
}

export async function resolveTvmazeShow(title: string) {
  const key = normalizeTitle(title)
  if (!key) return null
  return cacheGet(searchCache, key, async () => {
    const results = await tvmazeFetch<TvmazeSearchResult[]>('/search/shows', { q: title })
    if (!results?.length) return null

    const exact = results.filter(result => normalizeTitle(result.show.name) === key)
    const candidates = exact.length ? exact : results
    const gb = candidates.find(result => countryCode(result.show) === 'GB')
    const chosen = gb ?? candidates[0]
    return { id: chosen.show.id, name: chosen.show.name }
  }, SEARCH_CACHE_MS)
}

async function getTvmazeEpisodes(showId: number) {
  return cacheGetNumber(episodeCache, showId, async () => {
    const episodes = await tvmazeFetch<TvmazeEpisode[]>(`/shows/${showId}/episodes`)
    return episodes ?? []
  }, EPISODE_CACHE_MS)
}

function londonDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '00'
  return `${value('year')}-${value('month')}-${value('day')}`
}

function londonDayStart(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) return null
  return Date.UTC(year, month - 1, day)
}

function isCurrentEpisodeDate(programmeDate: string, episodeDate: string | null | undefined) {
  if (!episodeDate) return false
  if (episodeDate === programmeDate) return true

  const programmeStart = londonDayStart(programmeDate)
  const episodeStart = londonDayStart(episodeDate)
  if (programmeStart === null || episodeStart === null) return false
  const age = programmeStart - episodeStart
  return age >= 0 && age <= RECENT_ORIGINAL_AIRDATE_MS
}

function parseEpisodeNumber(programme: ProgrammeLike) {
  const text = [programme.episodeNum, programme.description].filter(Boolean).join(' ')
  const compact = text.match(/\bS(\d{1,3})\s*E(\d{1,3})\b/i)
  if (compact) return { season: Number(compact[1]), number: Number(compact[2]) }
  const verbose = text.match(/\bS(?:eries|eason)?\s*(\d{1,3})[, ]+\s*Ep(?:isode)?\s*(\d{1,3})\b/i)
  if (verbose) return { season: Number(verbose[1]), number: Number(verbose[2]) }
  return null
}

function episodeNameMatches(programme: ProgrammeLike, episode: TvmazeEpisode) {
  if (!episode.name) return false
  const name = normalizeTitle(episode.name)
  const description = normalizeTitle(programme.description ?? '')
  return Boolean(name && description.includes(name))
}

function episodeTimeMatches(programme: ProgrammeLike, episode: TvmazeEpisode) {
  if (!episode.airstamp) return false
  const airstamp = Date.parse(episode.airstamp)
  return Number.isFinite(airstamp) && Math.abs(airstamp - programme.startsAt.getTime()) <= AIRTIME_TOLERANCE_MS
}

async function programmeMatchesTvmazeEpisode(programme: ProgrammeLike, tvmazeId: number) {
  const episodes = await getTvmazeEpisodes(tvmazeId)
  const programmeEpisode = parseEpisodeNumber(programme)
  const programmeDate = londonDateKey(programme.startsAt)

  if (programmeEpisode) {
    const episode = episodes.find(row => row.season === programmeEpisode.season && row.number === programmeEpisode.number)
    return isCurrentEpisodeDate(programmeDate, episode?.airdate)
  }

  return episodes
    .filter(row => isCurrentEpisodeDate(programmeDate, row.airdate))
    .some(row => episodeNameMatches(programme, row) || episodeTimeMatches(programme, row))
}

function followTvmazeId(follow: FollowedTvShow) {
  const id = Number(follow.tvmazeId)
  return Number.isFinite(id) && id > 0 ? id : null
}

async function resolvedFollowId(follow: FollowedTvShow) {
  const stored = followTvmazeId(follow)
  if (stored) return stored
  const resolved = await resolveTvmazeShow(follow.title)
  return resolved?.id ?? null
}

function followAllowsProgramme(follow: FollowedTvShow, programme: ProgrammeLike, channelName: (channelId: string) => string) {
  if (normalizeTitle(follow.title) !== normalizeTitle(programme.title)) return false
  const preferred = follow.channel?.trim()
  return !preferred || preferred === channelName(programme.channelId)
}

function matchKey(programme: ProgrammeLike) {
  const episode = parseEpisodeNumber(programme)
  return episode
    ? `${normalizeTitle(programme.title)}:s${episode.season}:e${episode.number}`
    : normalizeTitle(programme.title)
}

export async function filterFollowedProgrammesWithTvmaze<T extends ProgrammeLike>(
  follows: FollowedTvShow[],
  programmes: T[],
  channelName: (channelId: string) => string,
) {
  if (!follows.length || !programmes.length) return []

  const accepted: T[] = []
  const seen = new Set<string>()
  const followIds = new Map<FollowedTvShow, number | null>()
  await Promise.all(follows.map(async follow => {
    try {
      followIds.set(follow, await resolvedFollowId(follow))
    } catch (error) {
      console.warn('TVMaze show resolution failed', follow.title, error instanceof Error ? error.message : error)
      followIds.set(follow, null)
    }
  }))

  for (const programme of programmes) {
    const matchingFollows = follows.filter(follow => followAllowsProgramme(follow, programme, channelName))
    if (!matchingFollows.length) continue

    let keep = false
    for (const follow of matchingFollows) {
      if (follow.matchMode === 'all_airings') {
        keep = true
        break
      }

      const tvmazeId = followIds.get(follow)
      if (!tvmazeId) {
        keep = true
        break
      }

      try {
        if (await programmeMatchesTvmazeEpisode(programme, tvmazeId)) {
          keep = true
          break
        }
      } catch (error) {
        console.warn('TVMaze episode match failed', programme.title, error instanceof Error ? error.message : error)
      }
    }

    if (!keep) continue
    const key = matchKey(programme)
    if (seen.has(key)) continue
    seen.add(key)
    accepted.push(programme)
  }

  return accepted
}
