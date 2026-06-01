import type { MediaType } from './tmdb'

type WatchmodeSource = {
  source_id?: number
  name?: string
  type?: 'sub' | 'rent' | 'buy' | 'free' | 'tve' | string
  region?: string
  ios_url?: string | null
  android_url?: string | null
  web_url?: string | null
  seasons?: number | null
  episodes?: number | null
}

type Provider = {
  provider_id: number
  provider_name: string
  logo_path?: string
  display_priority?: number
  links?: ProviderLinks
}

export type ProviderLinks = {
  source: 'watchmode'
  sourceId: number | null
  sourceName: string
  type: string
  region: string
  webUrl: string | null
  iosUrl: string | null
  androidUrl: string | null
  fetchedAt: string
}

type ProviderGroups = {
  link: string | null
  flatrate: Provider[]
  free: Provider[]
  ads: Provider[]
  rent: Provider[]
  buy: Provider[]
  watchmodeFetchedAt?: string
} | null

const WATCHMODE_CACHE_MS = 7 * 24 * 60 * 60 * 1000
const SOURCE_TYPE_PRIORITY = ['sub', 'free', 'tve', 'ads', 'rent', 'buy']

export function isWatchmodeConfigured() {
  return Boolean(process.env.WATCHMODE_API_KEY)
}

function watchmodeBaseUrl() {
  return (process.env.WATCHMODE_API_BASE ?? 'https://api.watchmode.com/v1').replace(/\/$/, '')
}

function configuredRegion() {
  return (process.env.WATCHMODE_REGION ?? 'GB').trim().toUpperCase() || 'GB'
}

function watchmodeTitleId(mediaType: MediaType, tmdbId: number) {
  return `${mediaType}-${tmdbId}`
}

function canonicalProviderName(value: string | undefined) {
  const name = (value ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()
  if (!name) return ''
  if (name.includes('netflix')) return 'netflix'
  if (name.includes('amazon') || name.includes('prime video')) return 'prime-video'
  if (name.includes('disney')) return 'disney-plus'
  if (name.includes('paramount')) return 'paramount-plus'
  if (name.includes('sky go') || name === 'sky') return 'sky-go'
  if (name.includes('bbc') || name.includes('iplayer')) return 'bbc-iplayer'
  if (name.includes('channel 4') || name.includes('all 4')) return 'channel-4'
  if (name.includes('itv') || name.includes('itvx')) return 'itvx'
  return name
}

function sourceRank(source: WatchmodeSource) {
  const index = SOURCE_TYPE_PRIORITY.indexOf(source.type ?? '')
  return index === -1 ? SOURCE_TYPE_PRIORITY.length : index
}

function bestSource(existing: WatchmodeSource | undefined, next: WatchmodeSource) {
  if (!existing) return next
  const existingRank = sourceRank(existing)
  const nextRank = sourceRank(next)
  if (nextRank !== existingRank) return nextRank < existingRank ? next : existing
  if (next.web_url && !existing.web_url) return next
  return existing
}

function cachedRecently(providers: ProviderGroups) {
  const fetchedAt = providers?.watchmodeFetchedAt
  if (!fetchedAt) return false
  const age = Date.now() - Date.parse(fetchedAt)
  return Number.isFinite(age) && age >= 0 && age < WATCHMODE_CACHE_MS
}

async function watchmodeFetchSources(mediaType: MediaType, tmdbId: number) {
  const key = process.env.WATCHMODE_API_KEY
  if (!key) return []

  const url = new URL(`${watchmodeBaseUrl()}/title/${watchmodeTitleId(mediaType, tmdbId)}/sources/`)
  url.searchParams.set('apiKey', key)
  url.searchParams.set('regions', configuredRegion())

  const response = await fetch(url)
  if (response.status === 404) return []
  if (!response.ok) {
    throw new Error(`Watchmode request failed with ${response.status}`)
  }
  return response.json() as Promise<WatchmodeSource[]>
}

function linksForSource(source: WatchmodeSource, fetchedAt: string): ProviderLinks {
  return {
    source: 'watchmode',
    sourceId: typeof source.source_id === 'number' ? source.source_id : null,
    sourceName: source.name ?? 'Unknown',
    type: source.type ?? 'unknown',
    region: source.region ?? configuredRegion(),
    webUrl: source.web_url ?? null,
    iosUrl: usefulDeepLink(source.ios_url),
    androidUrl: usefulDeepLink(source.android_url),
    fetchedAt,
  }
}

function usefulDeepLink(value: string | null | undefined) {
  if (!value || value.includes('paid plans only')) return null
  return value
}

function enrichBucket(providers: Provider[], sourceByName: Map<string, WatchmodeSource>, fetchedAt: string) {
  return providers.map(provider => {
    const source = sourceByName.get(canonicalProviderName(provider.provider_name))
    if (!source) return provider
    return { ...provider, links: linksForSource(source, fetchedAt) }
  })
}

function linkByProvider(previousProviders: NonNullable<ProviderGroups>) {
  const links = new Map<string, ProviderLinks>()
  const buckets = [
    ...(previousProviders.flatrate ?? []),
    ...(previousProviders.free ?? []),
    ...(previousProviders.ads ?? []),
    ...(previousProviders.rent ?? []),
    ...(previousProviders.buy ?? []),
  ]
  for (const provider of buckets) {
    if (!provider.links) continue
    links.set(String(provider.provider_id), provider.links)
    links.set(canonicalProviderName(provider.provider_name), provider.links)
  }
  return links
}

function mergeCachedLinks(providers: NonNullable<ProviderGroups>, previousProviders: NonNullable<ProviderGroups>) {
  const links = linkByProvider(previousProviders)
  const applyLinks = (bucket: Provider[] = []) => bucket.map(provider => {
    const cached = links.get(String(provider.provider_id)) ?? links.get(canonicalProviderName(provider.provider_name))
    return cached ? { ...provider, links: cached } : provider
  })
  return {
    ...providers,
    watchmodeFetchedAt: previousProviders.watchmodeFetchedAt,
    flatrate: applyLinks(providers.flatrate),
    free: applyLinks(providers.free),
    ads: applyLinks(providers.ads),
    rent: applyLinks(providers.rent),
    buy: applyLinks(providers.buy),
  }
}

export async function enrichProviderGroupsWithWatchmode(mediaType: MediaType, tmdbId: number, providers: ProviderGroups, previousProviders?: ProviderGroups): Promise<ProviderGroups> {
  if (!providers || !isWatchmodeConfigured()) return providers
  if (previousProviders && cachedRecently(previousProviders)) return mergeCachedLinks(providers, previousProviders)

  try {
    const sources = await watchmodeFetchSources(mediaType, tmdbId)
    const sourceByName = new Map<string, WatchmodeSource>()
    for (const source of sources) {
      const key = canonicalProviderName(source.name)
      if (!key) continue
      sourceByName.set(key, bestSource(sourceByName.get(key), source))
    }

    const fetchedAt = new Date().toISOString()
    return {
      ...providers,
      watchmodeFetchedAt: fetchedAt,
      flatrate: enrichBucket(providers.flatrate, sourceByName, fetchedAt),
      free: enrichBucket(providers.free ?? [], sourceByName, fetchedAt),
      ads: enrichBucket(providers.ads ?? [], sourceByName, fetchedAt),
      rent: enrichBucket(providers.rent, sourceByName, fetchedAt),
      buy: enrichBucket(providers.buy, sourceByName, fetchedAt),
    }
  } catch (error) {
    console.warn('Watchmode provider enrichment failed', error instanceof Error ? error.message : error)
    return previousProviders ?? providers
  }
}
