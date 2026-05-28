import { enqueueMutation, getCurrentState, makeId, type AppState, type MediaEpisode, type MediaFamilyState, type MediaItem, type MediaRating, type MediaSeason, type MediaUserState, type MediaUserStatus } from './app-store'
import { getSessionState } from './session-store'

export type MediaProvider = {
  provider_id: number
  provider_name: string
  logo_path?: string | null
  mediaTypes?: Array<'movie' | 'tv'>
}

export function posterUrl(path?: string | null, size = 'w500') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : ''
}

export function mediaLabel(item: MediaItem) {
  return item.mediaType === 'movie' ? 'Film' : 'TV'
}

export function yearLabel(item: MediaItem) {
  return item.year ? String(item.year) : 'Unknown'
}

export function providerNames(item: MediaItem, enabledIds: number[] = []) {
  const providers = item.providers as { flatrate?: MediaProvider[] } | null | undefined
  const flatrate = providers?.flatrate ?? []
  const chosen = enabledIds.length ? flatrate.filter(provider => enabledIds.includes(provider.provider_id)) : flatrate
  return chosen.map(provider => provider.provider_name).slice(0, 3)
}

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(payload?.error ?? `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function fetchMediaFeed(page = 1) {
  return api<{ items: MediaItem[]; page: number }>(`/api/media/feed?page=${page}`)
}

export async function searchMedia(query: string) {
  return api<{ items: MediaItem[] }>(`/api/media/search?q=${encodeURIComponent(query)}`)
}

export async function fetchMediaDetails(item: MediaItem) {
  return api<{ item: MediaItem }>(`/api/media/item/${item.mediaType}/${item.tmdbId}`)
}

export async function fetchSeason(tmdbId: number, seasonNumber: number) {
  return api<{ season: MediaSeason; episodes: MediaEpisode[] }>(`/api/media/tv/${tmdbId}/season/${seasonNumber}`)
}

export async function fetchProviders() {
  return api<{ providers: MediaProvider[] }>('/api/media/providers')
}

function householdId() {
  return getCurrentState().data.household[0]?.id ?? 'default'
}

function currentUserId() {
  return getSessionState().user?.id ?? getCurrentState().data.users[0]?.id ?? ''
}

function optimisticMerge<T extends { id: string }>(rows: T[], row: T) {
  const index = rows.findIndex(existing => existing.id === row.id)
  if (index === -1) return [...rows, row]
  return rows.map(existing => existing.id === row.id ? { ...existing, ...row } : existing)
}

export async function syncMediaItem(item: MediaItem) {
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'media.item.upsert',
    entityType: 'media_item',
    entityId: item.id,
    operation: 'upsert',
    payload: item as unknown as Record<string, unknown>,
  }, optimisticMediaItem(item))
}

function optimisticMediaItem(item: MediaItem) {
  return (prev: AppState): AppState => ({
    ...prev,
    data: {
      ...prev.data,
      mediaItems: optimisticMerge(prev.data.mediaItems, item),
    },
  })
}

export async function setUserMediaState(item: MediaItem, status: MediaUserStatus, rating: MediaRating | null = null) {
  const userId = currentUserId()
  const now = new Date().toISOString()
  const row: MediaUserState = {
    id: `media-user:${userId}:${item.id}`,
    householdId: householdId(),
    userId,
    mediaItemId: item.id,
    status,
    rating,
    createdAt: now,
    updatedAt: now,
  }
  await syncMediaItem(item)
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'media.user_state.upsert',
    entityType: 'media_user_state',
    entityId: row.id,
    operation: 'upsert',
    payload: row as unknown as Record<string, unknown>,
  }, prev => ({
    ...prev,
    data: { ...prev.data, mediaUserStates: optimisticMerge(prev.data.mediaUserStates, row) },
  }))
}

export async function setFamilyMediaState(item: MediaItem, status: MediaFamilyState['status']) {
  const now = new Date().toISOString()
  const row: MediaFamilyState = {
    id: `media-family:${householdId()}:${item.id}`,
    householdId: householdId(),
    mediaItemId: item.id,
    status,
    addedByUserId: currentUserId(),
    createdAt: now,
    updatedAt: now,
  }
  await syncMediaItem(item)
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'media.family_state.upsert',
    entityType: 'media_family_state',
    entityId: row.id,
    operation: 'upsert',
    payload: row as unknown as Record<string, unknown>,
  }, prev => ({
    ...prev,
    data: { ...prev.data, mediaFamilyStates: optimisticMerge(prev.data.mediaFamilyStates, row) },
  }))
}

export async function recordMediaInteraction(item: MediaItem, action: 'watched_liked' | 'watched_neutral' | 'watched_disliked' | 'wishlist' | 'not_interested' | 'skip', source = 'swipe') {
  const now = new Date().toISOString()
  const row = {
    id: makeId('media-interaction'),
    householdId: householdId(),
    userId: currentUserId(),
    mediaItemId: item.id,
    action,
    source,
    createdAt: now,
  }
  await syncMediaItem(item)
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'media.interaction.create',
    entityType: 'media_interaction',
    entityId: row.id,
    operation: 'upsert',
    payload: row,
  }, prev => ({
    ...prev,
    data: { ...prev.data, mediaInteractions: [...prev.data.mediaInteractions, row] },
  }))
}

export async function setEpisodeWatched(item: MediaItem, episode: MediaEpisode, watched: boolean, scope: 'user' | 'family' = 'user') {
  const scopeId = scope === 'user' ? currentUserId() : householdId()
  const now = new Date().toISOString()
  const row = {
    id: `media-progress:${scope}:${scopeId}:${episode.id}`,
    householdId: householdId(),
    scopeType: scope,
    scopeId,
    mediaItemId: item.id,
    episodeId: episode.id,
    watchedAt: watched ? now : null,
    updatedAt: now,
  }
  await enqueueMutation({
    id: makeId('mutation'),
    name: 'media.episode_progress.upsert',
    entityType: 'media_episode_progress',
    entityId: row.id,
    operation: 'upsert',
    payload: row,
  }, prev => ({
    ...prev,
    data: { ...prev.data, mediaEpisodeProgress: optimisticMerge(prev.data.mediaEpisodeProgress, row) },
  }))
}
