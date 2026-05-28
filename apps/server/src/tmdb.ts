import { and, asc, eq } from 'drizzle-orm'
import { db } from '@homeos/db'
import { mediaEpisodes, mediaItems, mediaSeasons } from '@homeos/db/schema'

export type MediaType = 'movie' | 'tv'

type TmdbGenre = { id: number; name: string }
type TmdbProvider = { provider_id: number; provider_name: string; logo_path?: string; display_priority?: number }
type TmdbCreditPerson = {
  id: number
  name?: string
  original_name?: string
  character?: string
  job?: string
  department?: string
  order?: number
}
type TmdbMedia = {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  runtime?: number
  episode_run_time?: number[]
  genres?: TmdbGenre[]
  genre_ids?: number[]
  origin_country?: string[]
  original_language?: string
  vote_average?: number
  vote_count?: number
  popularity?: number
  seasons?: Array<{
    id: number
    name: string
    season_number: number
    episode_count: number
    overview?: string
    poster_path?: string | null
    air_date?: string | null
  }>
}
type TmdbCredits = {
  cast?: TmdbCreditPerson[]
  crew?: TmdbCreditPerson[]
}
type TmdbSeason = {
  id: number
  name: string
  overview?: string
  poster_path?: string | null
  air_date?: string | null
  season_number: number
  episodes?: Array<{
    id: number
    name: string
    overview?: string
    still_path?: string | null
    air_date?: string | null
    episode_number: number
    season_number: number
    runtime?: number | null
  }>
}

const MOVIE_GENRES = new Map([
  [28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [99, 'Documentary'],
  [18, 'Drama'], [10751, 'Family'], [14, 'Fantasy'], [36, 'History'], [27, 'Horror'], [10402, 'Music'],
  [9648, 'Mystery'], [10749, 'Romance'], [878, 'Sci-Fi'], [10770, 'TV Movie'], [53, 'Thriller'], [10752, 'War'], [37, 'Western'],
])
const TV_GENRES = new Map([
  [10759, 'Action & Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [99, 'Documentary'],
  [18, 'Drama'], [10751, 'Family'], [10762, 'Kids'], [9648, 'Mystery'], [10763, 'News'], [10764, 'Reality'],
  [10765, 'Sci-Fi & Fantasy'], [10766, 'Soap'], [10767, 'Talk'], [10768, 'War & Politics'], [37, 'Western'],
])

export function isTmdbConfigured() {
  return Boolean(process.env.TMDB_API_KEY)
}

function baseUrl() {
  return (process.env.TMDB_API_BASE ?? 'https://api.themoviedb.org/3').replace(/\/$/, '')
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const key = process.env.TMDB_API_KEY
  if (!key) throw new Error('TMDB is not configured')

  const url = new URL(`${baseUrl()}${path}`)
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(name, String(value))
  }
  if (!key.startsWith('eyJ')) url.searchParams.set('api_key', key)

  const response = await fetch(url, {
    headers: key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : undefined,
  })
  if (!response.ok) {
    throw new Error(`TMDB request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function mediaId(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}:${tmdbId}`
}

function yearFrom(value?: string | null) {
  if (!value) return null
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : null
}

function genreNames(mediaType: MediaType, media: TmdbMedia) {
  if (media.genres?.length) return media.genres.map(genre => genre.name).filter(Boolean)
  const source = mediaType === 'movie' ? MOVIE_GENRES : TV_GENRES
  return (media.genre_ids ?? []).map(id => source.get(id)).filter(Boolean) as string[]
}

function providerGroups(raw: unknown) {
  const gb = (raw as { results?: { GB?: { link?: string; flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] } } })?.results?.GB
  if (!gb) return null
  return {
    link: gb.link ?? null,
    flatrate: (gb.flatrate ?? []).slice(0, 8),
    rent: (gb.rent ?? []).slice(0, 8),
    buy: (gb.buy ?? []).slice(0, 8),
  }
}

function creditGroups(raw: TmdbCredits | null | undefined) {
  if (!raw) return null
  const cast = (raw.cast ?? [])
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map(person => ({
      id: person.id,
      name: person.name ?? person.original_name ?? 'Unknown',
      character: person.character ?? null,
    }))
    .filter(person => person.name !== 'Unknown')
  const crew = (raw.crew ?? [])
    .filter(person => ['Director', 'Creator', 'Screenplay', 'Writer'].includes(person.job ?? ''))
    .slice(0, 8)
    .map(person => ({
      id: person.id,
      name: person.name ?? person.original_name ?? 'Unknown',
      job: person.job ?? null,
    }))
    .filter(person => person.name !== 'Unknown')
  return cast.length || crew.length ? { cast, crew } : null
}

export function normalizeMedia(media: TmdbMedia, fallbackType?: MediaType) {
  const mediaType = ((media.media_type === 'movie' || media.media_type === 'tv') ? media.media_type : fallbackType) ?? 'movie'
  const title = mediaType === 'movie' ? media.title : media.name
  const originalTitle = mediaType === 'movie' ? media.original_title : media.original_name
  const date = mediaType === 'movie' ? media.release_date : media.first_air_date
  const now = new Date()

  return {
    id: mediaId(mediaType, media.id),
    tmdbId: media.id,
    mediaType,
    title: title ?? originalTitle ?? 'Untitled',
    originalTitle: originalTitle ?? null,
    overview: media.overview ?? null,
    posterPath: media.poster_path ?? null,
    backdropPath: media.backdrop_path ?? null,
    releaseDate: mediaType === 'movie' ? media.release_date ?? null : null,
    firstAirDate: mediaType === 'tv' ? media.first_air_date ?? null : null,
    year: yearFrom(date),
    runtimeMinutes: media.runtime ?? null,
    episodeRunTime: media.episode_run_time ?? null,
    genres: genreNames(mediaType, media),
    originCountry: media.origin_country ?? null,
    originalLanguage: media.original_language ?? null,
    voteAverageX10: typeof media.vote_average === 'number' ? Math.round(media.vote_average * 10) : null,
    voteCount: media.vote_count ?? null,
    popularityX100: typeof media.popularity === 'number' ? Math.round(media.popularity * 100) : null,
    providers: null as ReturnType<typeof providerGroups>,
    seasons: media.seasons?.map(season => ({
      id: season.id,
      name: season.name,
      seasonNumber: season.season_number,
      episodeCount: season.episode_count,
      overview: season.overview ?? null,
      posterPath: season.poster_path ?? null,
      airDate: season.air_date ?? null,
    })) ?? null,
    credits: null as ReturnType<typeof creditGroups>,
    createdAt: now,
    updatedAt: now,
  }
}

export async function cacheMedia(item: ReturnType<typeof normalizeMedia>) {
  const now = new Date()
  const existing = await db.query.mediaItems.findFirst({ where: eq(mediaItems.id, item.id) })
  const values = {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    originalTitle: item.originalTitle,
    overview: item.overview,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    releaseDate: item.releaseDate,
    firstAirDate: item.firstAirDate,
    year: item.year,
    runtimeMinutes: item.runtimeMinutes,
    episodeRunTime: item.episodeRunTime,
    genres: item.genres,
    originCountry: item.originCountry,
    originalLanguage: item.originalLanguage,
    voteAverageX10: item.voteAverageX10,
    voteCount: item.voteCount,
    popularityX100: item.popularityX100,
    providers: item.providers,
    seasons: item.seasons,
    credits: item.credits,
    updatedAt: now,
  }
  if (existing) {
    await db.update(mediaItems).set(values).where(eq(mediaItems.id, item.id))
  } else {
    await db.insert(mediaItems).values({ id: item.id, ...values, createdAt: now })
  }
  return { id: item.id, ...values, createdAt: existing?.createdAt ?? now }
}

export async function getMediaDetails(mediaType: MediaType, tmdbId: number) {
  const [details, providers, credits] = await Promise.all([
    tmdbFetch<TmdbMedia>(`/${mediaType}/${tmdbId}`, { language: 'en-GB' }),
    tmdbFetch<unknown>(`/${mediaType}/${tmdbId}/watch/providers`),
    tmdbFetch<TmdbCredits>(`/${mediaType}/${tmdbId}/credits`, { language: 'en-GB' }),
  ])
  const normalized = normalizeMedia(details, mediaType)
  normalized.providers = providerGroups(providers)
  normalized.credits = creditGroups(credits)
  return cacheMedia(normalized)
}

export async function searchMedia(query: string) {
  const result = await tmdbFetch<{ results?: TmdbMedia[] }>('/search/multi', {
    query,
    language: 'en-GB',
    include_adult: false,
  })
  const normalized = (result.results ?? [])
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .filter(item => item.poster_path || item.backdrop_path)
    .map(item => normalizeMedia(item))
    .slice(0, 30)
  return normalized
}

export async function discoverFeed(excludedIds: Set<string>, page = 1) {
  const mainstreamPage = Math.max(1, page)
  const explorationPage = Math.max(1, page + 1)
  const [trending, movies, tv, classics] = await Promise.all([
    tmdbFetch<{ results?: TmdbMedia[] }>('/trending/all/week', { language: 'en-GB' }),
    tmdbFetch<{ results?: TmdbMedia[] }>('/discover/movie', {
      language: 'en-GB',
      region: 'GB',
      include_adult: false,
      include_video: false,
      sort_by: 'popularity.desc',
      'vote_count.gte': 250,
      with_original_language: 'en',
      page: mainstreamPage,
    }),
    tmdbFetch<{ results?: TmdbMedia[] }>('/discover/tv', {
      language: 'en-GB',
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 120,
      with_original_language: 'en',
      page: mainstreamPage,
    }),
    tmdbFetch<{ results?: TmdbMedia[] }>('/discover/movie', {
      language: 'en-GB',
      region: 'GB',
      include_adult: false,
      include_video: false,
      sort_by: 'vote_count.desc',
      'vote_average.gte': 7,
      'vote_count.gte': 1000,
      with_original_language: 'en',
      page: explorationPage,
    }),
  ])

  const pools = [
    ...(trending.results ?? []),
    ...(movies.results ?? []).map(item => ({ ...item, media_type: 'movie' })),
    ...(tv.results ?? []).map(item => ({ ...item, media_type: 'tv' })),
    ...(classics.results ?? []).map(item => ({ ...item, media_type: 'movie' })),
  ]
  const seen = new Set<string>()
  const normalized = pools
    .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
    .filter(item => item.poster_path)
    .map(item => normalizeMedia(item))
    .filter(item => {
      if (excludedIds.has(item.id) || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, 36)

  return normalized
}

export async function getWatchProviders() {
  const [movies, tv] = await Promise.all([
    tmdbFetch<{ results?: TmdbProvider[] }>('/watch/providers/movie', { watch_region: 'GB', language: 'en-GB' }),
    tmdbFetch<{ results?: TmdbProvider[] }>('/watch/providers/tv', { watch_region: 'GB', language: 'en-GB' }),
  ])
  const byId = new Map<number, TmdbProvider & { mediaTypes: MediaType[] }>()
  for (const provider of movies.results ?? []) byId.set(provider.provider_id, { ...provider, mediaTypes: ['movie'] })
  for (const provider of tv.results ?? []) {
    const existing = byId.get(provider.provider_id)
    if (existing) existing.mediaTypes.push('tv')
    else byId.set(provider.provider_id, { ...provider, mediaTypes: ['tv'] })
  }
  return Array.from(byId.values()).sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
}

export async function getSeason(tmdbId: number, seasonNumber: number) {
  const mediaItemId = mediaId('tv', tmdbId)
  await getMediaDetails('tv', tmdbId)
  const season = await tmdbFetch<TmdbSeason>(`/tv/${tmdbId}/season/${seasonNumber}`, { language: 'en-GB' })
  const now = new Date()
  const seasonId = `${mediaItemId}:s${seasonNumber}`
  const seasonValues = {
    mediaItemId,
    seasonNumber,
    name: season.name,
    overview: season.overview ?? null,
    posterPath: season.poster_path ?? null,
    airDate: season.air_date ?? null,
    episodeCount: season.episodes?.length ?? 0,
    updatedAt: now,
  }
  const existingSeason = await db.query.mediaSeasons.findFirst({ where: eq(mediaSeasons.id, seasonId) })
  if (existingSeason) await db.update(mediaSeasons).set(seasonValues).where(eq(mediaSeasons.id, seasonId))
  else await db.insert(mediaSeasons).values({ id: seasonId, ...seasonValues })

  for (const episode of season.episodes ?? []) {
    const episodeId = `${seasonId}:e${episode.episode_number}`
    const episodeValues = {
      mediaItemId,
      seasonId,
      seasonNumber,
      episodeNumber: episode.episode_number,
      name: episode.name,
      overview: episode.overview ?? null,
      stillPath: episode.still_path ?? null,
      airDate: episode.air_date ?? null,
      runtimeMinutes: episode.runtime ?? null,
      updatedAt: now,
    }
    const existingEpisode = await db.query.mediaEpisodes.findFirst({ where: eq(mediaEpisodes.id, episodeId) })
    if (existingEpisode) await db.update(mediaEpisodes).set(episodeValues).where(eq(mediaEpisodes.id, episodeId))
    else await db.insert(mediaEpisodes).values({ id: episodeId, ...episodeValues })
  }

  const [storedSeason, episodes] = await Promise.all([
    db.query.mediaSeasons.findFirst({ where: eq(mediaSeasons.id, seasonId) }),
    db.select().from(mediaEpisodes)
      .where(and(eq(mediaEpisodes.mediaItemId, mediaItemId), eq(mediaEpisodes.seasonNumber, seasonNumber)))
      .orderBy(asc(mediaEpisodes.episodeNumber)),
  ])
  return { season: storedSeason, episodes }
}
