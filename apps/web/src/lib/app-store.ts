import { useRef, useSyncExternalStore } from 'react'
import { bootstrap, openSyncStream, pull, push, setSyncUserContext, type SyncMutation } from './sync-client'

type User = { id: string; name: string; email?: string | null }
type Household = {
  id: string
  name: string
  settings?: Record<string, unknown> | null
  createdAt?: string | number | Date
}
type HouseholdMember = { householdId: string; userId: string; role: string }
type List = {
  id: string
  householdId: string
  name: string
  type: string
  icon?: string | null
  color?: string | null
  archived: boolean
  sortOrder: number
  createdAt: string | number | Date
  updatedAt: string | number | Date
}
type Item = {
  id: string
  householdId: string
  createdById: string
  assigneeId?: string | null
  type: string
  title: string
  body?: string | null
  status: string
  priority?: string | null
  listId?: string | null
  dueDate?: string | number | Date | null
  completedAt?: string | number | Date | null
  metadata?: Record<string, unknown> | null
  pinned?: boolean
  pinnedAt?: string | number | Date | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
  deletedAt?: string | number | Date | null
}
type ListItem = {
  id: string
  listId: string
  itemId?: string | null
  title: string
  sortOrder: number
  checked: boolean
  checkedAt?: string | number | Date | null
  checkedById?: string | null
  createdAt: string | number | Date
  updatedAt?: string | number | Date | null
  deletedAt?: string | number | Date | null
}
type RecordField = { label: string; value: string }
type RecordRow = {
  id: string
  householdId: string
  category: string
  title: string
  subtitle?: string | null
  icon?: string | null
  fields?: RecordField[] | null
  renewalDate?: string | number | Date | null
  renewalLabel?: string | null
  notes?: string | null
  sortOrder?: number
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}
type ReminderRow = {
  id: string
  householdId: string
  createdById: string
  entityType: string
  entityId: string
  message?: string | null
  triggerAt: string | number | Date
  dispatchedAt?: string | number | Date | null
  dismissedAt?: string | number | Date | null
  createdAt: string | number | Date
}
type EntityLink = {
  id: string
  fromType: string
  fromId: string
  toType: string
  toId: string
  linkType: string
  createdById: string
  createdAt: string | number | Date
}
type CalendarEvent = {
  id: string
  householdId?: string
  externalId?: string | null
  calendarId?: string | null
  title: string
  description?: string | null
  location?: string | null
  startsAt: string | number | Date
  endsAt?: string | number | Date | null
  allDay?: boolean
  recurrenceRule?: string | null
  rawIcal?: string | null
  lastSyncedAt?: string | number | Date | null
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}
type CalendarFeed = {
  id: string
  householdId: string
  userId?: string | null
  name: string
  url: string
  color: string
  enabled: boolean
  lastSyncedAt?: string | number | Date | null
  errorMessage?: string | null
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}
export type CycleEntry = {
  id: string
  householdId: string
  startDate: string | number | Date
  endDate?: string | number | Date | null
  ovulationDate?: string | number | Date | null
  ovulationSource?: 'known' | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
}
type Bin = {
  id: string
  householdId: string
  name: string
  colour: string
  collectionDay: number
  frequency: string
  intervalWeeks: number
  anchorDate?: string | null
  notes?: string | null
  active?: boolean
  createdAt?: string | number | Date
}
export type MediaType = 'movie' | 'tv'
export type MediaUserStatus = 'wishlist' | 'watching' | 'watched' | 'not_interested'
export type MediaFamilyStatus = 'wishlist' | 'watching' | 'watched' | 'not_interested'
export type MediaRating = 'liked' | 'neutral' | 'disliked'
export type MediaInteractionAction = 'watched_liked' | 'watched_neutral' | 'watched_disliked' | 'wishlist' | 'not_interested' | 'skip'
export type MediaItem = {
  id: string
  tmdbId: number
  mediaType: MediaType
  title: string
  originalTitle?: string | null
  overview?: string | null
  posterPath?: string | null
  backdropPath?: string | null
  releaseDate?: string | null
  firstAirDate?: string | null
  year?: number | null
  runtimeMinutes?: number | null
  episodeRunTime?: number[] | null
  genres?: string[] | null
  originCountry?: string[] | null
  originalLanguage?: string | null
  voteAverageX10?: number | null
  voteCount?: number | null
  popularityX100?: number | null
  providers?: Record<string, unknown> | null
  seasons?: Array<Record<string, unknown>> | null
  credits?: Record<string, unknown> | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
}
export type MediaUserState = {
  id: string
  householdId: string
  userId: string
  mediaItemId: string
  status: MediaUserStatus
  rating?: MediaRating | null
  watchlist?: boolean
  createdAt: string | number | Date
  updatedAt: string | number | Date
}
export type MediaFamilyState = {
  id: string
  householdId: string
  mediaItemId: string
  status: MediaFamilyStatus
  rating?: MediaRating | null
  watchlist?: boolean
  addedByUserId?: string | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
}
export type MediaSeason = {
  id: string
  mediaItemId: string
  seasonNumber: number
  name: string
  overview?: string | null
  posterPath?: string | null
  airDate?: string | null
  episodeCount: number
  updatedAt: string | number | Date
}
export type MediaEpisode = {
  id: string
  mediaItemId: string
  seasonId: string
  seasonNumber: number
  episodeNumber: number
  name: string
  overview?: string | null
  stillPath?: string | null
  airDate?: string | null
  runtimeMinutes?: number | null
  updatedAt: string | number | Date
}
export type MediaEpisodeProgress = {
  id: string
  householdId: string
  scopeType: 'user' | 'family'
  scopeId: string
  mediaItemId: string
  episodeId: string
  watchedAt?: string | number | Date | null
  updatedAt: string | number | Date
}
export type MediaInteraction = {
  id: string
  householdId: string
  userId: string
  mediaItemId: string
  action: MediaInteractionAction
  source?: string | null
  createdAt: string | number | Date
}

type AppData = {
  users: User[]
  household: Household[]
  householdMembers: HouseholdMember[]
  lists: List[]
  items: Item[]
  listItems: ListItem[]
  records: RecordRow[]
  reminders: ReminderRow[]
  entityLinks: EntityLink[]
  calendarEvents: CalendarEvent[]
  calendarFeeds: CalendarFeed[]
  cycleEntries: CycleEntry[]
  bins: Bin[]
  mediaItems: MediaItem[]
  mediaUserStates: MediaUserState[]
  mediaFamilyStates: MediaFamilyState[]
  mediaSeasons: MediaSeason[]
  mediaEpisodes: MediaEpisode[]
  mediaEpisodeProgress: MediaEpisodeProgress[]
  mediaInteractions: MediaInteraction[]
}

export type AppState = {
  ready: boolean
  syncing: boolean
  error: string | null
  data: AppData
}

type BootstrapPayload = {
  data: AppData
}

type SyncChange = {
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload: Record<string, unknown> | null
}

type StoredSnapshot = {
  key: string
  savedAt: number
  state: AppState
}

const STORAGE_KEY = 'homeos:app-state'
const OFFLINE_SNAPSHOT_KEY = 'homeos:app-state-lite'
const MUTATION_QUEUE_KEY = 'homeos:mutation-queue'
const SESSION_KEY = 'homeos:session-state'
const SESSION_BACKUP_KEY = 'homeos:session-state:last-authenticated'
const OFFLINE_DB_NAME = 'homeos-offline-store'
const OFFLINE_DB_VERSION = 1
const SNAPSHOT_STORE = 'snapshots'
const listeners = new Set<() => void>()
let activeUserId: string | null = initialUserId()

const emptyData: AppData = {
  users: [],
  household: [],
  householdMembers: [],
  lists: [],
  items: [],
  listItems: [],
  records: [],
  reminders: [],
  entityLinks: [],
  calendarEvents: [],
  calendarFeeds: [],
  cycleEntries: [],
  bins: [],
  mediaItems: [],
  mediaUserStates: [],
  mediaFamilyStates: [],
  mediaSeasons: [],
  mediaEpisodes: [],
  mediaEpisodeProgress: [],
  mediaInteractions: [],
}

let mutationQueue: SyncMutation[] = loadMutationQueue()
let state: AppState = loadState()
let stream: EventSource | null = null
let bootstrapped = false
let flushPromise: Promise<void> | null = null
let refreshPromise: Promise<void> | null = null
let postPushRefreshTimer: number | null = null
let onlineListenerRegistered = false
let fallbackSyncRegistered = false
let persistenceFlushRegistered = false
let persistTimer: number | null = null
let indexedDbHydrationId = 0

const MEDIA_SKIP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const MEDIA_INTERACTION_STORAGE_LIMIT = 300

setSyncUserContext(activeUserId)
void hydrateStateFromIndexedDb()

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && /\b401\b/.test(error.message)
}

function initialUserId() {
  if (typeof window === 'undefined') return null

  const sessionUserId = userIdFromSessionKey(SESSION_KEY) ?? userIdFromSessionKey(SESSION_BACKUP_KEY)
  if (sessionUserId) return sessionUserId

  const legacyUserId = userIdFromStoredAppState(STORAGE_KEY) ?? userIdFromStoredAppState(OFFLINE_SNAPSHOT_KEY)
  if (legacyUserId) return legacyUserId

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      const userId = key ? userIdFromAppStateKey(key) : null
      if (userId) return userId
    }
  } catch {
    return null
  }

  return null
}

function userIdFromSessionKey(key: string) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { status?: string; user?: { id?: string } | null }
    return parsed.status === 'authenticated' && parsed.user?.id ? parsed.user.id : null
  } catch {
    return null
  }
}

function userIdFromAppStateKey(key: string) {
  const prefix = key.startsWith(`${STORAGE_KEY}:`)
    ? `${STORAGE_KEY}:`
    : key.startsWith(`${OFFLINE_SNAPSHOT_KEY}:`)
      ? `${OFFLINE_SNAPSHOT_KEY}:`
      : null
  if (!prefix) return null
  const userId = key.slice(prefix.length)
  return userId || null
}

function userIdFromStoredAppState(key: string) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: { users?: User[] } }
    return parsed.data?.users?.[0]?.id ?? null
  } catch {
    return null
  }
}

function hasLocalData(data: AppData) {
  return Object.values(data).some(value => Array.isArray(value) && value.length > 0)
}

function dataWeight(data: AppData) {
  return Object.values(data).reduce((total, value) => total + (Array.isArray(value) ? value.length : 0), 0)
}

function loadState(): AppState {
  if (typeof window === 'undefined') {
    return { ready: false, syncing: false, error: null, data: emptyData }
  }
  return loadStateFromKeys(stateStorageKeys())
    ?? { ready: false, syncing: false, error: null, data: emptyData }
}

function stateStorageKeys() {
  const keys = activeUserId
    ? [storageKey(), offlineSnapshotKey(), STORAGE_KEY, OFFLINE_SNAPSHOT_KEY]
    : [STORAGE_KEY, OFFLINE_SNAPSHOT_KEY]
  return [...new Set(keys)]
}

function loadStateFromKeys(keys: string[]) {
  for (const key of keys) {
    const loaded = loadStateFromKey(key)
    if (loaded) return loaded
  }
  return null
}

function loadStateFromKey(key: string): AppState | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return normalizeStoredState(JSON.parse(raw) as AppState)
  } catch {
    return null
  }
}

function normalizeStoredState(parsed: AppState): AppState {
  const data = replayQueuedMutations({
    ...emptyData,
    ...parsed.data,
  })
  return {
    ...parsed,
    ready: parsed.ready || hasLocalData(data),
    syncing: false,
    error: null,
    data,
  }
}

function loadMutationQueue(): SyncMutation[] {
  if (typeof window === 'undefined') return []

  const queues = mutationQueueKeys().flatMap(key => {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed as SyncMutation[] : []
    } catch {
      return []
    }
  })
  const seen = new Set<string>()
  return queues.filter(mutation => {
    if (!mutation.id || seen.has(mutation.id)) return false
    seen.add(mutation.id)
    return true
  })
}

function mutationQueueKeys() {
  const keys = activeUserId ? [mutationQueueKey(), MUTATION_QUEUE_KEY] : [MUTATION_QUEUE_KEY]
  return [...new Set(keys)]
}

function compactMediaItemForStorage(item: MediaItem): MediaItem {
  return {
    ...item,
    overview: item.overview ? item.overview.slice(0, 420) : item.overview,
    credits: null,
    seasons: Array.isArray(item.seasons)
      ? item.seasons.map(season => {
        const source = season as {
          id?: unknown
          name?: unknown
          season_number?: unknown
          seasonNumber?: unknown
          episode_count?: unknown
          episodeCount?: unknown
          poster_path?: unknown
          posterPath?: unknown
          air_date?: unknown
          airDate?: unknown
        }
        return {
          id: source.id,
          name: source.name,
          season_number: source.season_number,
          seasonNumber: source.seasonNumber,
          episode_count: source.episode_count,
          episodeCount: source.episodeCount,
          poster_path: source.poster_path,
          posterPath: source.posterPath,
          air_date: source.air_date,
          airDate: source.airDate,
        }
      })
      : item.seasons,
  }
}

function compactStateForStorage(value: AppState): AppState {
  const retainedMediaItemIds = new Set([
    ...value.data.mediaUserStates.map(row => row.mediaItemId),
    ...value.data.mediaFamilyStates.map(row => row.mediaItemId),
    ...value.data.mediaEpisodeProgress.map(row => row.mediaItemId),
  ])
  const retainedSeasonIds = new Set(
    value.data.mediaSeasons
      .filter(row => retainedMediaItemIds.has(row.mediaItemId))
      .map(row => row.id),
  )
  const skipCutoff = Date.now() - MEDIA_SKIP_RETENTION_MS
  const mediaInteractions = value.data.mediaInteractions
    .filter(row => row.action !== 'skip' || Number(new Date(row.createdAt)) >= skipCutoff)
    .slice(-MEDIA_INTERACTION_STORAGE_LIMIT)

  return {
    ...value,
    data: {
      ...value.data,
      mediaItems: value.data.mediaItems
        .filter(item => retainedMediaItemIds.has(item.id))
        .map(compactMediaItemForStorage),
      mediaSeasons: value.data.mediaSeasons.filter(row => retainedMediaItemIds.has(row.mediaItemId)),
      mediaEpisodes: value.data.mediaEpisodes.filter(row => retainedMediaItemIds.has(row.mediaItemId) && retainedSeasonIds.has(row.seasonId)),
      mediaEpisodeProgress: value.data.mediaEpisodeProgress.filter(row => retainedMediaItemIds.has(row.mediaItemId)),
      mediaInteractions,
    },
  }
}

function compactStateForOfflineSnapshot(value: AppState): AppState {
  const compacted = compactStateForStorage(value)
  return {
    ...compacted,
    data: {
      ...compacted.data,
      mediaInteractions: [],
      mediaSeasons: [],
      mediaEpisodes: [],
      calendarEvents: compacted.data.calendarEvents.map(event => ({
        ...event,
        description: null,
        rawIcal: null,
      })),
    },
  }
}

function openOfflineDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)

  return new Promise<IDBDatabase | null>(resolve => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
    request.onblocked = () => resolve(null)
  })
}

function readIdbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T | null>(resolve => {
    request.onsuccess = () => resolve(request.result ?? null)
    request.onerror = () => resolve(null)
  })
}

async function readStateFromIndexedDb(key: string) {
  const db = await openOfflineDb()
  if (!db) return null

  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly')
    const stored = await readIdbRequest<StoredSnapshot | undefined>(tx.objectStore(SNAPSHOT_STORE).get(key))
    db.close()
    return stored?.state ? normalizeStoredState(stored.state) : null
  } catch {
    db.close()
    return null
  }
}

async function writeStateToIndexedDb(key: string, nextState: AppState) {
  const db = await openOfflineDb()
  if (!db) return

  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite')
    tx.objectStore(SNAPSHOT_STORE).put({
      key,
      savedAt: Date.now(),
      state: nextState,
    } satisfies StoredSnapshot)
    await new Promise<void>(resolve => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } catch {
    // localStorage fallback may still have a smaller snapshot.
  } finally {
    db.close()
  }
}

async function hydrateStateFromIndexedDb() {
  if (typeof window === 'undefined') return
  const hydrationId = ++indexedDbHydrationId
  const userId = activeUserId

  for (const key of stateStorageKeys()) {
    const loaded = await readStateFromIndexedDb(key)
    if (!loaded) continue
    if (hydrationId !== indexedDbHydrationId || userId !== activeUserId) return

    if (!state.ready || dataWeight(loaded.data) > dataWeight(state.data)) {
      state = loaded
      emit()
    }
    return
  }
}

function persistNow() {
  if (typeof window === 'undefined') return
  if (!activeUserId) return
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }
  const compacted = compactStateForStorage(state)
  const offlineSnapshot = compactStateForOfflineSnapshot(state)
  try {
    localStorage.setItem(storageKey(), JSON.stringify(compacted))
  } catch {
    // Keep the last successfully persisted snapshot. Removing it would break offline cold starts.
  }
  try {
    localStorage.setItem(offlineSnapshotKey(), JSON.stringify(offlineSnapshot))
  } catch {
    // The primary snapshot may still exist. Never clear offline data because a write failed.
  }
  void writeStateToIndexedDb(storageKey(), compacted)
  void writeStateToIndexedDb(offlineSnapshotKey(), offlineSnapshot)
  persistMutationQueueNow()
}

function persistMutationQueueNow() {
  if (typeof window === 'undefined') return
  if (!activeUserId) return
  try {
    localStorage.setItem(mutationQueueKey(), JSON.stringify(mutationQueue))
  } catch {
    // Keep the previous queue snapshot so offline changes are not discarded on quota errors.
  }
}

function persist() {
  if (typeof window === 'undefined') return
  if (!activeUserId) return
  if (persistTimer !== null) return
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 150)
}

function registerPersistenceFlush() {
  if (typeof window === 'undefined' || persistenceFlushRegistered) return

  window.addEventListener('pagehide', persistNow)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persistNow()
  })
  persistenceFlushRegistered = true
}

function emit() {
  persist()
  listeners.forEach(listener => listener())
}

function setState(next: AppState | ((prev: AppState) => AppState)) {
  state = typeof next === 'function' ? next(state) : next
  emit()
}

function mergeCollection<T extends { id: string }>(existing: T[], incoming: T) {
  const index = existing.findIndex(row => row.id === incoming.id)
  if (index === -1) return [...existing, incoming]
  return existing.map((row, i) => (i === index ? { ...row, ...incoming } : row))
}

function removeCollection<T extends { id: string }>(existing: T[], id: string) {
  return existing.filter(row => row.id !== id)
}

function storageKey() {
  return activeUserId ? `${STORAGE_KEY}:${activeUserId}` : STORAGE_KEY
}

function offlineSnapshotKey() {
  return activeUserId ? `${OFFLINE_SNAPSHOT_KEY}:${activeUserId}` : OFFLINE_SNAPSHOT_KEY
}

function mutationQueueKey() {
  return activeUserId ? `${MUTATION_QUEUE_KEY}:${activeUserId}` : MUTATION_QUEUE_KEY
}

export function setAppUserContext(userId: string | null) {
  if (activeUserId === userId) return
  registerPersistenceFlush()
  if (activeUserId) persistNow()

  if (stream) {
    stream.close()
    stream = null
  }
  activeUserId = userId
  setSyncUserContext(userId)
  bootstrapped = false
  flushPromise = null
  refreshPromise = null
  postPushRefreshTimer = null
  mutationQueue = loadMutationQueue()
  state = loadState()
  emit()
  void hydrateStateFromIndexedDb()
}

function applyMutationToData(data: AppData, mutation: Pick<SyncMutation, 'entityType' | 'entityId' | 'operation' | 'payload'>) {
  const next = { ...data }

  switch (mutation.entityType) {
    case 'household':
      next.household = mutation.operation === 'delete'
        ? removeCollection(next.household, mutation.entityId)
        : mergeCollection(next.household, mutation.payload as Household)
      break
    case 'record':
      next.records = mutation.operation === 'delete'
        ? removeCollection(next.records, mutation.entityId)
        : mergeCollection(next.records, mutation.payload as RecordRow)
      break
    case 'reminder':
      next.reminders = mutation.operation === 'delete'
        ? removeCollection(next.reminders, mutation.entityId)
        : mergeCollection(next.reminders, mutation.payload as ReminderRow)
      break
    case 'entity_link':
      next.entityLinks = mutation.operation === 'delete'
        ? removeCollection(next.entityLinks, mutation.entityId)
        : mergeCollection(next.entityLinks, mutation.payload as EntityLink)
      break
    case 'item':
      next.items = mutation.operation === 'delete'
        ? removeCollection(next.items, mutation.entityId)
        : mergeCollection(next.items, mutation.payload as Item)
      break
    case 'list_item':
      next.listItems = mutation.operation === 'delete'
        ? removeCollection(next.listItems, mutation.entityId)
        : mergeCollection(next.listItems, mutation.payload as ListItem)
      break
    case 'list':
      next.lists = mutation.operation === 'delete'
        ? removeCollection(next.lists, mutation.entityId)
        : mergeCollection(next.lists, mutation.payload as List)
      break
    case 'calendar_event':
      next.calendarEvents = mutation.operation === 'delete'
        ? removeCollection(next.calendarEvents, mutation.entityId)
        : mergeCollection(next.calendarEvents, mutation.payload as CalendarEvent)
      break
    case 'calendar_feed':
      next.calendarFeeds = mutation.operation === 'delete'
        ? removeCollection(next.calendarFeeds, mutation.entityId)
        : mergeCollection(next.calendarFeeds, mutation.payload as CalendarFeed)
      break
    case 'cycle_entry':
      next.cycleEntries = mutation.operation === 'delete'
        ? removeCollection(next.cycleEntries, mutation.entityId)
        : mergeCollection(next.cycleEntries, mutation.payload as CycleEntry)
      break
    case 'media_item':
      next.mediaItems = mutation.operation === 'delete'
        ? removeCollection(next.mediaItems, mutation.entityId)
        : mergeCollection(next.mediaItems, mutation.payload as MediaItem)
      break
    case 'media_user_state':
      next.mediaUserStates = mutation.operation === 'delete'
        ? removeCollection(next.mediaUserStates, mutation.entityId)
        : mergeCollection(next.mediaUserStates, mutation.payload as MediaUserState)
      break
    case 'media_family_state':
      next.mediaFamilyStates = mutation.operation === 'delete'
        ? removeCollection(next.mediaFamilyStates, mutation.entityId)
        : mergeCollection(next.mediaFamilyStates, mutation.payload as MediaFamilyState)
      break
    case 'media_season':
      next.mediaSeasons = mutation.operation === 'delete'
        ? removeCollection(next.mediaSeasons, mutation.entityId)
        : mergeCollection(next.mediaSeasons, mutation.payload as MediaSeason)
      break
    case 'media_episode':
      next.mediaEpisodes = mutation.operation === 'delete'
        ? removeCollection(next.mediaEpisodes, mutation.entityId)
        : mergeCollection(next.mediaEpisodes, mutation.payload as MediaEpisode)
      break
    case 'media_episode_progress':
      next.mediaEpisodeProgress = mutation.operation === 'delete'
        ? removeCollection(next.mediaEpisodeProgress, mutation.entityId)
        : mergeCollection(next.mediaEpisodeProgress, mutation.payload as MediaEpisodeProgress)
      break
    case 'media_interaction':
      next.mediaInteractions = mutation.operation === 'delete'
        ? removeCollection(next.mediaInteractions, mutation.entityId)
        : mergeCollection(next.mediaInteractions, mutation.payload as MediaInteraction)
      break
    default:
      break
  }

  return next
}

function replayQueuedMutations(data: AppData) {
  return mutationQueue.reduce(
    (next, mutation) => applyMutationToData(next, mutation),
    data,
  )
}

function applyChange(change: SyncChange) {
  setState(prev => {
    const next = { ...prev, ready: true, syncing: false, error: null, data: { ...prev.data } }

    switch (change.entityType) {
      case 'household':
        next.data.household = change.operation === 'delete'
          ? removeCollection(next.data.household, change.entityId)
          : mergeCollection(next.data.household, change.payload as Household)
        break
      case 'record':
        next.data.records = change.operation === 'delete'
          ? removeCollection(next.data.records, change.entityId)
          : mergeCollection(next.data.records, change.payload as RecordRow)
        break
      case 'reminder':
        next.data.reminders = change.operation === 'delete'
          ? removeCollection(next.data.reminders, change.entityId)
          : mergeCollection(next.data.reminders, change.payload as ReminderRow)
        break
      case 'entity_link':
        next.data.entityLinks = change.operation === 'delete'
          ? removeCollection(next.data.entityLinks, change.entityId)
          : mergeCollection(next.data.entityLinks, change.payload as EntityLink)
        break
      case 'item':
        next.data.items = change.operation === 'delete'
          ? removeCollection(next.data.items, change.entityId)
          : mergeCollection(next.data.items, change.payload as Item)
        break
      case 'list_item':
        next.data.listItems = change.operation === 'delete'
          ? removeCollection(next.data.listItems, change.entityId)
          : mergeCollection(next.data.listItems, change.payload as ListItem)
        break
      case 'list':
        next.data.lists = change.operation === 'delete'
          ? removeCollection(next.data.lists, change.entityId)
          : mergeCollection(next.data.lists, change.payload as List)
        break
      case 'calendar_event':
        next.data.calendarEvents = change.operation === 'delete'
          ? removeCollection(next.data.calendarEvents, change.entityId)
          : mergeCollection(next.data.calendarEvents, change.payload as CalendarEvent)
        break
      case 'calendar_feed':
        next.data.calendarFeeds = change.operation === 'delete'
          ? removeCollection(next.data.calendarFeeds, change.entityId)
          : mergeCollection(next.data.calendarFeeds, change.payload as CalendarFeed)
        break
      case 'cycle_entry':
        next.data.cycleEntries = change.operation === 'delete'
          ? removeCollection(next.data.cycleEntries, change.entityId)
          : mergeCollection(next.data.cycleEntries, change.payload as CycleEntry)
        break
      case 'media_item':
        next.data.mediaItems = change.operation === 'delete'
          ? removeCollection(next.data.mediaItems, change.entityId)
          : mergeCollection(next.data.mediaItems, change.payload as MediaItem)
        break
      case 'media_user_state':
        next.data.mediaUserStates = change.operation === 'delete'
          ? removeCollection(next.data.mediaUserStates, change.entityId)
          : mergeCollection(next.data.mediaUserStates, change.payload as MediaUserState)
        break
      case 'media_family_state':
        next.data.mediaFamilyStates = change.operation === 'delete'
          ? removeCollection(next.data.mediaFamilyStates, change.entityId)
          : mergeCollection(next.data.mediaFamilyStates, change.payload as MediaFamilyState)
        break
      case 'media_season':
        next.data.mediaSeasons = change.operation === 'delete'
          ? removeCollection(next.data.mediaSeasons, change.entityId)
          : mergeCollection(next.data.mediaSeasons, change.payload as MediaSeason)
        break
      case 'media_episode':
        next.data.mediaEpisodes = change.operation === 'delete'
          ? removeCollection(next.data.mediaEpisodes, change.entityId)
          : mergeCollection(next.data.mediaEpisodes, change.payload as MediaEpisode)
        break
      case 'media_episode_progress':
        next.data.mediaEpisodeProgress = change.operation === 'delete'
          ? removeCollection(next.data.mediaEpisodeProgress, change.entityId)
          : mergeCollection(next.data.mediaEpisodeProgress, change.payload as MediaEpisodeProgress)
        break
      case 'media_interaction':
        next.data.mediaInteractions = change.operation === 'delete'
          ? removeCollection(next.data.mediaInteractions, change.entityId)
          : mergeCollection(next.data.mediaInteractions, change.payload as MediaInteraction)
        break
      default:
        break
    }

    return next
  })
}

function mergeBootstrap(payload: BootstrapPayload) {
  setState(prev => ({
    ...prev,
    ready: true,
    syncing: false,
    error: null,
    data: replayQueuedMutations(payload.data),
  }))
}

function schedulePostPushRefresh() {
  if (typeof window === 'undefined') return
  if (postPushRefreshTimer !== null) {
    window.clearTimeout(postPushRefreshTimer)
  }

  postPushRefreshTimer = window.setTimeout(() => {
    postPushRefreshTimer = null
    if (document.hidden || !navigator.onLine) return
    refreshFromServer({ silent: true }).catch(() => undefined)
  }, 5000)
}

async function flushMutationQueue() {
  if (!mutationQueue.length) return
  if (flushPromise) return flushPromise

  flushPromise = (async () => {
    try {
      while (mutationQueue.length) {
        const batch = mutationQueue
        const sentIds = new Set(batch.map(mutation => mutation.id))
        await push(batch)
        mutationQueue = mutationQueue.filter(mutation => !sentIds.has(mutation.id))
        persist()
      }
      schedulePostPushRefresh()
    } finally {
      flushPromise = null
    }
  })()

  return flushPromise
}

function startSyncStream() {
  if (typeof window === 'undefined' || stream) return

  stream = openSyncStream(() => {
    if (flushPromise) {
      schedulePostPushRefresh()
      return
    }
    refreshFromServer({ silent: true }).catch(() => undefined)
  })

  stream.onerror = () => {
    if (stream) {
      stream.close()
      stream = null
    }

    window.setTimeout(() => {
      if (!bootstrapped || document.hidden || !navigator.onLine) return
      startSyncStream()
      refreshFromServer({ silent: true }).catch(() => undefined)
    }, 3000)
  }
}

function registerOnlineSync() {
  if (typeof window === 'undefined' || onlineListenerRegistered) return

  window.addEventListener('online', () => {
    startSyncStream()
    if (mutationQueue.length) {
      flushMutationQueue().catch(error => {
        setState(prev => ({
          ...prev,
          syncing: false,
          error: error instanceof Error ? error.message : 'Mutation sync failed',
        }))
      })
      return
    }

    refreshFromServer({ silent: true }).catch(() => undefined)
  })

  onlineListenerRegistered = true
}

function registerFallbackSync() {
  if (typeof window === 'undefined' || fallbackSyncRegistered) return

  const refreshVisible = () => {
    if (document.hidden || !navigator.onLine) return
    startSyncStream()
    refreshFromServer({ silent: true }).catch(() => undefined)
  }

  window.addEventListener('focus', refreshVisible)
  window.addEventListener('pageshow', refreshVisible)
  document.addEventListener('visibilitychange', refreshVisible)
  window.setInterval(refreshVisible, 30000)

  fallbackSyncRegistered = true
}

async function refreshFromServer(options: { silent?: boolean } = {}) {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    if (!options.silent) {
      setState(prev => ({ ...prev, syncing: true, error: null }))
    }

    try {
      const payload = await pull()
      for (const change of payload.changes as SyncChange[]) {
        applyChange(change)
      }
      setState(prev => ({ ...prev, syncing: false, ready: true, error: null }))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        if (stream) {
          stream.close()
          stream = null
        }
        setState(prev => ({
          ...prev,
          ready: true,
          syncing: false,
          error: null,
        }))
        return
      }

      setState(prev => ({
        ...prev,
        syncing: false,
        error: options.silent ? prev.error : error instanceof Error ? error.message : 'Sync failed',
      }))
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function ensureBootstrap() {
  if (bootstrapped) return
  bootstrapped = true
  registerOnlineSync()
  registerFallbackSync()

  try {
    const payload = await bootstrap()
    mergeBootstrap(payload)
    startSyncStream()
    if (mutationQueue.length) {
      flushMutationQueue().catch(error => {
        setState(prev => ({
          ...prev,
          syncing: false,
          error: error instanceof Error ? error.message : 'Mutation sync failed',
        }))
      })
    }
  } catch (error) {
    if (isUnauthorizedError(error)) {
      setState(prev => ({
        ...prev,
        ready: true,
        syncing: false,
        error: null,
      }))
      return
    }

    setState(prev => ({
      ...prev,
      ready: prev.ready || hasLocalData(prev.data),
      syncing: false,
      error: error instanceof Error ? error.message : 'Bootstrap failed',
    }))
  }
}

export function useAppState<T>(selector: (state: AppState) => T) {
  const cacheRef = useRef<{
    selector: ((state: AppState) => T) | null
    state: AppState | null
    value: T | null
  }>({
    selector: null,
    state: null,
    value: null,
  })

  const getSnapshot = () => {
    const cache = cacheRef.current
    if (cache.selector === selector && cache.state === state) {
      return cache.value as T
    }

    const value = selector(state)
    cacheRef.current = {
      selector,
      state,
      value,
    }
    return value
  }

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
}

export function mergeMediaEpisodeProgress(rows: MediaEpisodeProgress[]) {
  if (!rows.length) return
  setState(prev => ({
    ...prev,
    data: {
      ...prev.data,
      mediaEpisodeProgress: rows.reduce(
        (next, row) => mergeCollection(next, row),
        prev.data.mediaEpisodeProgress,
      ),
    },
  }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function enqueueMutation(mutation: SyncMutation, optimistic?: (prev: AppState) => AppState) {
  return enqueueMutations([mutation], optimistic)
}

export async function enqueueMutations(mutations: SyncMutation[], optimistic?: (prev: AppState) => AppState) {
  if (!mutations.length) return
  if (optimistic) {
    setState(optimistic)
  }

  mutationQueue = [...mutationQueue, ...mutations]
  persistMutationQueueNow()

  try {
    await flushMutationQueue()
  } catch (error) {
    setState(prev => ({
      ...prev,
      syncing: false,
      error: error instanceof Error ? error.message : 'Mutation failed',
    }))
  }
}

export async function refreshAppState() {
  return refreshFromServer({ silent: true })
}

export function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getCurrentState() {
  return state
}
