import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEventHandler, type ReactNode } from 'react'
import { Calendar, Check, ChevronDown, ChevronRight, Circle, Clapperboard, Clock, Eye, Film, ListPlus, Search, SlidersHorizontal, Star, ThumbsDown, ThumbsUp, Tv, Users, X } from 'lucide-react'
import { BottomNav } from './bottom-nav'
import { SwipeRow } from '../components/swipe-row'
import { enqueueMutation, getCurrentState, makeId, useAppState, type AppState, type MediaEpisode, type MediaFamilyState, type MediaItem, type MediaSeason, type MediaUserState, type MediaUserStatus } from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import { fetchMediaDetails, fetchMediaFeed, fetchProviders, fetchSeason, mediaLabel, posterUrl, recordMediaInteraction, searchMedia, setEpisodeWatched, setFamilyMediaSeen, setFamilyMediaState, setFamilyMediaWatchlist, setUserMediaSeen, setUserMediaState, setUserMediaWatchlist, syncMediaItem, type MediaProvider, yearLabel } from '../lib/media'

type Tab = 'swipe' | 'search' | 'mine' | 'family' | 'services'
type MyListTab = 'watchlist' | 'seen' | 'liked'
type FamilyListTab = 'watchlist' | 'seen' | 'liked'
type MediaFilter = 'all' | 'movie' | 'tv'
type MediaCredits = {
  cast?: Array<{ id?: number; name?: string; character?: string | null }>
  crew?: Array<{ id?: number; name?: string; job?: string | null }>
}

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'swipe', label: 'Discover' },
  { id: 'search', label: 'Search' },
  { id: 'mine', label: 'Lists' },
  { id: 'family', label: 'Family' },
  { id: 'services', label: 'Services' },
]

const actionMeta = {
  watched_liked: { status: 'watched' as const, rating: 'liked' as const },
  watched_neutral: { status: 'watched' as const, rating: 'neutral' as const },
  watched_disliked: { status: 'watched' as const, rating: 'disliked' as const },
  wishlist: { status: 'wishlist' as const, rating: null },
  not_interested: { status: 'not_interested' as const, rating: null },
}
type MediaAction = keyof typeof actionMeta
type TvSheetAction = MediaAction | null
type SwipeIntent = 'watched' | 'not_watched' | 'liked' | 'disliked' | 'watchlist'
type ActionResult = 'applied' | 'pending_tv'

const SWIPE_PREVIEW_THRESHOLD = 34
const SWIPE_COMMIT_THRESHOLD = 185

const swipeIntents: Record<SwipeIntent, {
  label: string
  action: MediaAction | 'skip'
  tone: string
  ring: string
}> = {
  watched: {
    label: 'Watched',
    action: 'watched_neutral',
    tone: 'bg-accent text-white',
    ring: 'border-accent',
  },
  not_watched: {
    label: 'Not watched',
    action: 'skip',
    tone: 'bg-text-1 text-bg',
    ring: 'border-text-1',
  },
  liked: {
    label: 'Liked',
    action: 'watched_liked',
    tone: 'bg-sage text-white',
    ring: 'border-sage',
  },
  disliked: {
    label: 'Not liked',
    action: 'watched_disliked',
    tone: 'bg-red text-white',
    ring: 'border-red',
  },
  watchlist: {
    label: 'Watchlist',
    action: 'wishlist',
    tone: 'bg-amber text-white',
    ring: 'border-amber',
  },
}

function serviceProviders(item: MediaItem, enabledIds: number[] = []) {
  const providers = item.providers as { flatrate?: MediaProvider[] } | null | undefined
  const flatrate = providers?.flatrate ?? []
  return (enabledIds.length ? flatrate.filter(provider => enabledIds.includes(provider.provider_id)) : flatrate).slice(0, 4)
}

function providerEmptyText(item: MediaItem, selectedProviderIds: number[]) {
  if (!item.providers) return 'Availability loads in details'
  return selectedProviderIds.length ? 'Not on selected services' : 'No streaming data'
}

function mediaCredits(item: MediaItem): MediaCredits {
  return (item.credits ?? {}) as MediaCredits
}

function castNames(item: MediaItem, limit = 4) {
  return (mediaCredits(item).cast ?? [])
    .map(person => person.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, limit)
}

function crewNames(item: MediaItem, limit = 3) {
  return (mediaCredits(item).crew ?? [])
    .map(person => person.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, limit)
}

function runtimeLabel(item: MediaItem) {
  if (item.mediaType === 'movie' && item.runtimeMinutes) return `${item.runtimeMinutes} min`
  const runtime = item.episodeRunTime?.find(value => value > 0)
  return runtime ? `${runtime} min episodes` : null
}

function providerSearchText(item: MediaItem) {
  const providers = item.providers as { flatrate?: MediaProvider[]; rent?: MediaProvider[]; buy?: MediaProvider[] } | null | undefined
  return [...(providers?.flatrate ?? []), ...(providers?.rent ?? []), ...(providers?.buy ?? [])]
    .map(provider => provider.provider_name)
    .join(' ')
}

function mediaHaystack(item: MediaItem) {
  return [
    item.title,
    item.originalTitle,
    item.overview,
    item.year,
    item.mediaType,
    mediaLabel(item),
    ...(item.genres ?? []),
    providerSearchText(item),
    ...castNames(item, 20),
    ...crewNames(item, 12),
  ].filter(Boolean).join(' ').toLowerCase()
}

function matchesMediaSearch(item: MediaItem, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = mediaHaystack(item)
  return terms.every(term => haystack.includes(term))
}

export function MediaPage() {
  const [tab, setTab] = useState<Tab>('swipe')
  const [feed, setFeed] = useState<MediaItem[]>([])
  const [page, setPage] = useState(1)
  const [feedIndex, setFeedIndex] = useState(0)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MediaItem[]>([])
  const [searching, setSearching] = useState(false)
  const [providers, setProviders] = useState<MediaProvider[]>([])
  const [tvSheetItem, setTvSheetItem] = useState<MediaItem | null>(null)
  const [tvSheetAction, setTvSheetAction] = useState<TvSheetAction>(null)
  const [tvSheetAdvanceOnChoose, setTvSheetAdvanceOnChoose] = useState(true)
  const [progressSheetItem, setProgressSheetItem] = useState<MediaItem | null>(null)
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [myListTab, setMyListTab] = useState<MyListTab>('watchlist')
  const [myListFilter, setMyListFilter] = useState<MediaFilter>('all')
  const [myListSearch, setMyListSearch] = useState('')
  const [myListGenre, setMyListGenre] = useState('all')
  const [familyListTab, setFamilyListTab] = useState<FamilyListTab>('watchlist')
  const [familyListFilter, setFamilyListFilter] = useState<MediaFilter>('all')
  const [familyListSearch, setFamilyListSearch] = useState('')
  const [familyListGenre, setFamilyListGenre] = useState('all')
  const [expandedShowId, setExpandedShowId] = useState<string | null>(null)
  const [dismissedDiscoverIds, setDismissedDiscoverIds] = useState<Set<string>>(() => new Set())
  const [seasonCache, setSeasonCache] = useState<Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>>({})
  const [seasonErrors, setSeasonErrors] = useState<Record<string, string>>({})
  const [openSeasonKey, setOpenSeasonKey] = useState<string | null>(null)
  const household = useAppState(state => state.data.household[0] ?? null)
  const items = useAppState(state => state.data.mediaItems)
  const userStates = useAppState(state => state.data.mediaUserStates)
  const familyStates = useAppState(state => state.data.mediaFamilyStates)
  const progress = useAppState(state => state.data.mediaEpisodeProgress)
  const interactions = useAppState(state => state.data.mediaInteractions)
  const userId = useSessionState(state => state.user?.id ?? '')
  const selectedProviderIds = readProviderIds(household?.settings)
  const feedbackTimerRef = useRef<number | null>(null)
  const searchSeqRef = useRef(0)

  const itemById = useMemo(() => new Map(items.map(item => [item.id, item])), [items])
  const myRows = useMemo(() => userStates
    .filter(row => row.userId === userId && row.status !== 'not_interested')
    .map(row => ({ state: row, item: itemById.get(row.mediaItemId) }))
    .filter((row): row is { state: typeof userStates[number]; item: MediaItem } => Boolean(row.item))
    .sort((a, b) => Number(new Date(b.state.updatedAt)) - Number(new Date(a.state.updatedAt))), [itemById, userId, userStates])
  const familyRows = useMemo(() => familyStates
    .filter(row => row.status !== 'not_interested')
    .map(row => ({ state: row, item: itemById.get(row.mediaItemId) }))
    .filter((row): row is { state: typeof familyStates[number]; item: MediaItem } => Boolean(row.item))
    .sort((a, b) => Number(new Date(b.state.updatedAt)) - Number(new Date(a.state.updatedAt))), [familyStates, itemById])
  const excludedDiscoverIds = useMemo(() => {
    const skipCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    return new Set([
      ...userStates.filter(row => row.userId === userId).map(row => row.mediaItemId),
      ...familyStates.map(row => row.mediaItemId),
      ...interactions
        .filter(row => row.userId === userId)
        .filter(row => row.action !== 'skip' || Number(new Date(row.createdAt)) >= skipCutoff)
        .map(row => row.mediaItemId),
    ])
  }, [familyStates, interactions, userId, userStates])
  const visibleFeed = useMemo(() => feed.filter(item => !excludedDiscoverIds.has(item.id) && !dismissedDiscoverIds.has(item.id)), [dismissedDiscoverIds, excludedDiscoverIds, feed])
  const current = visibleFeed[feedIndex] ?? null
  const next = visibleFeed[feedIndex + 1] ?? null
  const detailUserState = detailItem ? userStates.find(row => row.userId === userId && row.mediaItemId === detailItem.id) ?? null : null
  const detailFamilyState = detailItem ? familyStates.find(row => row.mediaItemId === detailItem.id && row.status !== 'not_interested') ?? null : null
  const userProgress = useMemo(() => progress.filter(row => row.scopeType === 'user' && row.scopeId === userId), [progress, userId])

  useEffect(() => {
    loadFeed(1, true).catch(() => undefined)
    fetchProviders().then(payload => setProviders(payload.providers)).catch(() => undefined)
    return undefined
  }, [])

  useEffect(() => {
    if (visibleFeed.length - feedIndex > 8 || loadingFeed) return
    loadFeed(page + 1, false).catch(() => undefined)
  }, [feedIndex, loadingFeed, page, visibleFeed.length])

  useEffect(() => {
    if (feedIndex <= visibleFeed.length) return
    setFeedIndex(Math.max(0, visibleFeed.length - 1))
  }, [feedIndex, visibleFeed.length])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      searchSeqRef.current += 1
      setResults([])
      setSearching(false)
      return undefined
    }
    const timer = window.setTimeout(() => {
      const seq = ++searchSeqRef.current
      setSearching(true)
      searchMedia(trimmed)
        .then(payload => {
          if (seq === searchSeqRef.current) setResults(payload.items)
        })
        .catch(error => {
          if (seq === searchSeqRef.current) setError(error instanceof Error ? error.message : 'Search failed')
        })
        .finally(() => {
          if (seq === searchSeqRef.current) setSearching(false)
        })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (tab !== 'swipe') return undefined
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    const previousTouchAction = document.body.style.touchAction
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior
    const previousHtmlTouchAction = document.documentElement.style.touchAction
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.touchAction = 'none'
    document.documentElement.style.overflow = 'hidden'
    document.documentElement.style.overscrollBehavior = 'none'
    document.documentElement.style.touchAction = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
      document.body.style.touchAction = previousTouchAction
      document.documentElement.style.overflow = previousHtmlOverflow
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      document.documentElement.style.touchAction = previousHtmlTouchAction
    }
  }, [tab])

  async function loadFeed(targetPage: number, replace: boolean) {
    setLoadingFeed(true)
    setError(null)
    try {
      const payload = await fetchMediaFeed(targetPage)
      setFeed(prev => replace ? payload.items : mergeMediaItems(prev, payload.items))
      setPage(payload.page)
      if (replace) setFeedIndex(0)
      if (replace) setDismissedDiscoverIds(new Set())
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Media feed failed')
    } finally {
      setLoadingFeed(false)
    }
  }

  async function refreshDetails(item: MediaItem) {
    try {
      const payload = await fetchMediaDetails(item)
      await syncMediaItem(payload.item)
      return payload.item
    } catch {
      return item
    }
  }

  async function openDetails(item: MediaItem) {
    setDetailItem(item)
    setDetailLoading(true)
    try {
      const detailed = await refreshDetails(item)
      setDetailItem(detailed)
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleAction(item: MediaItem, action: keyof typeof actionMeta | 'skip', options: { advance?: boolean } = {}): Promise<ActionResult> {
    const shouldAdvance = options.advance ?? true
    const detailed = await refreshDetails(item)
    if (action === 'skip') {
      await recordMediaInteraction(detailed, 'skip')
      notify('Hidden for 30 days')
      if (shouldAdvance) advance()
      return 'applied'
    }
    if (detailed.mediaType === 'tv' && action.startsWith('watched')) {
      setTvSheetItem(detailed)
      setTvSheetAction(action)
      setTvSheetAdvanceOnChoose(shouldAdvance)
      return 'pending_tv'
    }
    await applyMediaAction(detailed, action)
    notify(action === 'wishlist' ? 'Added to watchlist' : action === 'watched_liked' ? 'Marked seen and liked' : action === 'watched_disliked' ? 'Marked seen and disliked' : 'Marked seen')
    if (shouldAdvance) advance()
    return 'applied'
  }

  function notify(message: string) {
    setFeedback(message)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 1800)
  }

  async function applyMediaAction(item: MediaItem, action: keyof typeof actionMeta, extraStatus?: MediaUserStatus) {
    const meta = actionMeta[action]
    await setUserMediaState(item, extraStatus ?? meta.status, meta.rating)
    await recordMediaInteraction(item, action)
  }

  function advance() {
    setFeedIndex(index => Math.min(index + 1, feed.length))
  }

  async function saveProviderIds(nextIds: number[]) {
    if (!household) return
    const settings = {
      ...(household.settings ?? {}),
      media: {
        ...((household.settings?.media as Record<string, unknown> | undefined) ?? {}),
        streamingProviderIds: nextIds,
      },
    }
    const nextHousehold = { ...household, settings }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'household.upsert',
      entityType: 'household',
      entityId: household.id,
      operation: 'upsert',
      payload: nextHousehold,
    }, (prev: AppState) => ({
      ...prev,
      data: {
        ...prev.data,
        household: prev.data.household.map(row => row.id === household.id ? nextHousehold : row),
      },
    }))
  }

  async function loadSeason(item: MediaItem, seasonNumber: number) {
    const key = `${item.id}:s${seasonNumber}`
    setOpenSeasonKey(openSeasonKey === key ? null : key)
    if (seasonCache[key]) return
    setSeasonErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    try {
      const payload = await fetchSeason(item.tmdbId, seasonNumber)
      setSeasonCache(prev => ({ ...prev, [key]: payload }))
    } catch (error) {
      setSeasonErrors(prev => ({ ...prev, [key]: error instanceof Error ? error.message : 'Episodes failed to load' }))
    }
  }

  async function ensureSeason(item: MediaItem, seasonNumber: number) {
    const key = `${item.id}:s${seasonNumber}`
    const cached = seasonCache[key]
    if (cached) return cached.episodes
    setSeasonErrors(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    try {
      const payload = await fetchSeason(item.tmdbId, seasonNumber)
      setSeasonCache(prev => ({ ...prev, [key]: payload }))
      return payload.episodes
    } catch (error) {
      setSeasonErrors(prev => ({ ...prev, [key]: error instanceof Error ? error.message : 'Episodes failed to load' }))
      return []
    }
  }

  async function deleteUserState(row: MediaUserState) {
    const relatedProgress = getCurrentState().data.mediaEpisodeProgress
      .filter(progressRow => progressRow.scopeType === 'user' && progressRow.scopeId === row.userId && progressRow.mediaItemId === row.mediaItemId)
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'media.user_state.delete',
      entityType: 'media_user_state',
      entityId: row.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        mediaUserStates: prev.data.mediaUserStates.filter(state => state.id !== row.id),
      },
    }))
    await Promise.all(relatedProgress.map(progressRow => enqueueMutation({
      id: makeId('mutation'),
      name: 'media.episode_progress.delete',
      entityType: 'media_episode_progress',
      entityId: progressRow.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        mediaEpisodeProgress: prev.data.mediaEpisodeProgress.filter(state => state.id !== progressRow.id),
      },
    }))))
  }

  async function deleteFamilyState(row: MediaFamilyState) {
    const relatedProgress = getCurrentState().data.mediaEpisodeProgress
      .filter(progressRow => progressRow.scopeType === 'family' && progressRow.scopeId === row.householdId && progressRow.mediaItemId === row.mediaItemId)
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'media.family_state.delete',
      entityType: 'media_family_state',
      entityId: row.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        mediaFamilyStates: prev.data.mediaFamilyStates.filter(state => state.id !== row.id),
      },
    }))
    await Promise.all(relatedProgress.map(progressRow => enqueueMutation({
      id: makeId('mutation'),
      name: 'media.episode_progress.delete',
      entityType: 'media_episode_progress',
      entityId: progressRow.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        mediaEpisodeProgress: prev.data.mediaEpisodeProgress.filter(state => state.id !== progressRow.id),
      },
    }))))
  }

  async function setSeasonWatched(item: MediaItem, seasonNumber: number, episodes: MediaEpisode[], watched: boolean) {
    const targetEpisodes = episodes.length ? episodes : await ensureSeason(item, seasonNumber)
    if (!targetEpisodes.length) {
      notify('Episodes failed to load')
      return
    }
    await Promise.all(targetEpisodes.map(episode => setEpisodeWatched(item, episode, watched)))
    notify(watched ? 'Season marked watched' : 'Season marked unwatched')
  }

  return (
    <div className="media-page min-h-dvh bg-[var(--media-bg)] text-[var(--media-ink)]">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="safe-top sticky top-0 z-20 border-b border-[var(--media-line)] bg-[color-mix(in_srgb,var(--media-bg)_90%,transparent)] px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--media-faint)]">HomeOS</p>
              <h1 className="mt-0.5 text-[24px] font-black text-[var(--media-ink)]">Media</h1>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-[13px] border border-[var(--media-line)] bg-[var(--media-panel)] p-1 no-scrollbar">
            {tabs.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTab(option.id)}
                className={`shrink-0 rounded-[10px] px-3 py-2 text-[12px] font-black transition ${
                  tab === option.id ? 'bg-[var(--media-yellow-soft)] text-[var(--media-ink)]' : 'text-[var(--media-muted)]'
                }`}
              >
                {option.label}
              </button>
            ))}
            </div>
          </div>
        </header>

        <main className={`flex-1 px-4 pt-3 ${tab === 'swipe' ? 'overflow-hidden pb-20' : 'pb-28'}`}>
          {error ? <div className="mb-3 rounded-[16px] border border-red/20 bg-red/10 px-4 py-3 text-[13px] font-semibold text-red">{error}</div> : null}
          {tab === 'swipe' ? (
            <SwipeView
              item={current}
              nextItem={next}
              loading={loadingFeed && !current}
              selectedProviderIds={selectedProviderIds}
              onOpen={openDetails}
              onAction={(item, action) => {
                setDismissedDiscoverIds(prev => new Set(prev).add(item.id))
                void handleAction(item, action, { advance: false })
              }}
              onRefresh={() => loadFeed(1, true)}
            />
          ) : null}
          {tab === 'search' ? (
            <SearchView
              query={query}
              setQuery={setQuery}
              searching={searching}
              results={results}
              userStates={userStates}
              userId={userId}
              familyStates={familyStates}
              selectedProviderIds={selectedProviderIds}
              onAction={async (item, action) => {
                const result = await handleAction(item, action, { advance: false })
                if (result === 'applied') setResults(prev => prev.filter(row => row.id !== item.id))
              }}
              onFamily={async (item, enabled) => {
                await setFamilyMediaWatchlist(item, enabled)
                notify(enabled ? 'Added to family list' : 'Removed from family list')
              }}
              onOpen={openDetails}
            />
          ) : null}
          {tab === 'mine' ? (
            <MyListsView
              rows={myRows}
              activeTab={myListTab}
              activeFilter={myListFilter}
              search={myListSearch}
              activeGenre={myListGenre}
              setActiveTab={setMyListTab}
              setActiveFilter={setMyListFilter}
              setSearch={setMyListSearch}
              setActiveGenre={setMyListGenre}
              selectedProviderIds={selectedProviderIds}
              familyStates={familyStates}
              onFamily={async (item, enabled) => {
                await setFamilyMediaWatchlist(item, enabled)
                notify(enabled ? 'Added to family list' : 'Removed from family list')
              }}
              onStatus={async (item, status, rating) => {
                if (item.mediaType === 'tv' && status === 'watched') {
                  setTvSheetItem(item)
                  setTvSheetAction(rating === 'liked' ? 'watched_liked' : rating === 'disliked' ? 'watched_disliked' : 'watched_neutral')
                  setTvSheetAdvanceOnChoose(false)
                  return
                }
                await setUserMediaState(item, status, rating)
                notify(status === 'wishlist' ? 'Added to watchlist' : rating === 'liked' ? 'Marked liked' : rating === 'disliked' ? 'Marked disliked' : 'Updated')
              }}
              onDelete={deleteUserState}
              onOpen={openDetails}
              expandedShowId={expandedShowId}
              onExpandShow={setExpandedShowId}
              progress={userProgress}
              seasonCache={seasonCache}
              seasonErrors={seasonErrors}
              openSeasonKey={openSeasonKey}
              onLoadSeason={loadSeason}
              onEpisode={(item, episode, watched) => setEpisodeWatched(item, episode, watched)}
              onSeason={(item, seasonNumber, episodes, watched) => setSeasonWatched(item, seasonNumber, episodes, watched)}
            />
          ) : null}
          {tab === 'family' ? (
            <FamilyView
              rows={familyRows}
              activeTab={familyListTab}
              activeFilter={familyListFilter}
              search={familyListSearch}
              activeGenre={familyListGenre}
              setActiveTab={setFamilyListTab}
              setActiveFilter={setFamilyListFilter}
              setSearch={setFamilyListSearch}
              setActiveGenre={setFamilyListGenre}
              selectedProviderIds={selectedProviderIds}
              onWatchlist={async (item, enabled) => {
                await setFamilyMediaWatchlist(item, enabled)
                notify(enabled ? 'Added to family watchlist' : 'Removed from family watchlist')
              }}
              onSeen={async (item, enabled) => {
                await setFamilyMediaSeen(item, enabled)
                notify(enabled ? 'Marked seen by family' : 'Removed from family seen')
              }}
              onRating={async (item, rating) => {
                const existing = familyStates.find(row => row.mediaItemId === item.id)
                await setFamilyMediaState(item, 'watched', existing?.rating === rating ? null : rating)
                notify(existing?.rating === rating ? 'Family rating cleared' : rating === 'liked' ? 'Family liked' : 'Family disliked')
              }}
              onDelete={deleteFamilyState}
              onOpen={openDetails}
            />
          ) : null}
          {tab === 'services' ? (
            <ServicesView providers={providers} selectedIds={selectedProviderIds} onChange={saveProviderIds} />
          ) : null}
        </main>
        <BottomNav />
      </div>

      <TvActionSheet
        item={tvSheetItem}
        action={tvSheetAction}
        onClose={() => {
          if (tvSheetItem && !tvSheetAdvanceOnChoose) {
            const id = tvSheetItem.id
            setDismissedDiscoverIds(prev => {
              if (!prev.has(id)) return prev
              const next = new Set(prev)
              next.delete(id)
              return next
            })
          }
          setTvSheetItem(null)
          setTvSheetAction(null)
          setTvSheetAdvanceOnChoose(true)
        }}
        onChoose={async mode => {
          if (!tvSheetItem || !tvSheetAction) return
          const item = tvSheetItem
          const action = tvSheetAction
          const shouldAdvance = tvSheetAdvanceOnChoose
          if (mode === 'all') {
            await applyMediaAction(item, action, 'watched')
            notify('Marked all episodes watched')
          }
          if (mode === 'track') {
            await setUserMediaState(item, 'watching', actionMeta[action].rating)
            await recordMediaInteraction(item, action)
            setProgressSheetItem(item)
            notify('Added to watching')
          }
          setTvSheetItem(null)
          setTvSheetAction(null)
          if (mode === 'all' && shouldAdvance) advance()
          setTvSheetAdvanceOnChoose(true)
        }}
      />
      <TvProgressSheet
        item={progressSheetItem}
        progress={userProgress}
        seasonCache={seasonCache}
        seasonErrors={seasonErrors}
        openSeasonKey={openSeasonKey}
        onClose={() => setProgressSheetItem(null)}
        onLoadSeason={loadSeason}
        onEpisode={(item, episode, watched) => setEpisodeWatched(item, episode, watched)}
        onSeason={(item, seasonNumber, episodes, watched) => setSeasonWatched(item, seasonNumber, episodes, watched)}
      />
      <MediaDetailSheet
        item={detailItem}
        loading={detailLoading}
        userState={detailUserState}
        familyState={detailFamilyState}
        selectedProviderIds={selectedProviderIds}
        onClose={() => setDetailItem(null)}
        onWatchlist={async (item, enabled) => {
          await setUserMediaWatchlist(item, enabled)
          notify(enabled ? 'Added to watchlist' : 'Removed from watchlist')
        }}
        onSeen={async (item, enabled) => {
          if (item.mediaType === 'tv' && enabled) {
            setTvSheetItem(item)
            setTvSheetAction('watched_neutral')
            setTvSheetAdvanceOnChoose(false)
            return
          }
          await setUserMediaSeen(item, enabled)
          notify(enabled ? 'Marked seen' : 'Removed from seen')
        }}
        onRating={async (item, rating) => {
          const nextRating = detailUserState?.rating === rating ? null : rating
          if (item.mediaType === 'tv' && detailUserState?.status !== 'watched' && detailUserState?.status !== 'watching') {
            setTvSheetItem(item)
            setTvSheetAction(rating === 'liked' ? 'watched_liked' : 'watched_disliked')
            setTvSheetAdvanceOnChoose(false)
            return
          }
          await setUserMediaState(item, item.mediaType === 'tv' ? detailUserState?.status ?? 'watching' : 'watched', nextRating)
          notify(detailUserState?.rating === rating ? 'Rating cleared' : rating === 'liked' ? 'Marked liked' : 'Marked disliked')
        }}
        onFamily={async (item, enabled) => {
          await setFamilyMediaWatchlist(item, enabled)
          notify(enabled ? 'Added to family watchlist' : 'Removed from family watchlist')
        }}
      />
      {feedback ? <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+82px)] z-[90] mx-auto max-w-sm rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] px-4 py-3 text-center text-[13px] font-black text-[var(--media-ink)] shadow-2xl">{feedback}</div> : null}
    </div>
  )
}

function SwipeView({ item, nextItem, loading, selectedProviderIds, onOpen, onAction, onRefresh }: {
  item: MediaItem | null
  nextItem: MediaItem | null
  loading: boolean
  selectedProviderIds: number[]
  onOpen: (item: MediaItem) => void
  onAction: (item: MediaItem, action: keyof typeof actionMeta | 'skip') => void
  onRefresh: () => void
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false, exiting: false, intent: null as SwipeIntent | null })
  const [incoming, setIncoming] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastTapRef = useRef(0)
  const singleTapTimerRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingDragRef = useRef<typeof drag | null>(null)
  const previousItemIdRef = useRef<string | null>(null)
  const incomingRafRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const previousId = previousItemIdRef.current
    const nextId = item?.id ?? null
    setDrag({ x: 0, y: 0, active: false, exiting: false, intent: null })
    dragStartRef.current = null
    pendingDragRef.current = null
    activePointerIdRef.current = null
    if (singleTapTimerRef.current) {
      window.clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = null
    }
    if (incomingRafRef.current) window.cancelAnimationFrame(incomingRafRef.current)
    if (previousId && nextId && previousId !== nextId) {
      setIncoming(true)
      incomingRafRef.current = window.requestAnimationFrame(() => {
        incomingRafRef.current = null
        setIncoming(false)
      })
    } else {
      setIncoming(false)
    }
    previousItemIdRef.current = nextId
  }, [item?.id])

  useEffect(() => () => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    if (incomingRafRef.current) window.cancelAnimationFrame(incomingRafRef.current)
    if (singleTapTimerRef.current) window.clearTimeout(singleTapTimerRef.current)
  }, [])

  function setDragFrame(next: typeof drag) {
    pendingDragRef.current = next
    if (rafRef.current) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      if (pendingDragRef.current) {
        setDrag(pendingDragRef.current)
        pendingDragRef.current = null
      }
    })
  }

  if (loading) return <div className="rounded-[18px] border border-[var(--media-line)] bg-[var(--media-panel)] px-5 py-10 text-center text-[var(--media-muted)]">Loading media...</div>
  if (!item) {
    return (
      <div className="rounded-[18px] border border-[var(--media-line)] bg-[var(--media-panel)] px-5 py-8 text-center">
        <p className="text-[16px] font-bold text-[var(--media-ink)]">No more cards loaded</p>
        <button type="button" onClick={onRefresh} className="mt-4 rounded-full bg-accent px-5 py-2.5 text-[14px] font-black text-white">Refresh feed</button>
      </div>
    )
  }
  const activeItem = item

  const intent = drag.intent
  const dominantMovement = Math.max(Math.abs(drag.x), Math.abs(drag.y))
  const strength = Math.min(1, Math.max(0, (dominantMovement - SWIPE_PREVIEW_THRESHOLD) / (SWIPE_COMMIT_THRESHOLD - SWIPE_PREVIEW_THRESHOLD)))
  const rotation = Math.max(-12, Math.min(12, drag.x / 18))
  const exitTransform = intent
    ? intent === 'watched'
      ? 'translate3d(125vw, 0, 0) rotate(22deg)'
      : intent === 'not_watched'
        ? 'translate3d(-125vw, 0, 0) rotate(-22deg)'
        : intent === 'liked'
          ? 'translate3d(0, -125vh, 0) rotate(-8deg)'
          : intent === 'disliked'
            ? 'translate3d(0, 125vh, 0) rotate(8deg)'
            : 'scale(0.92)'
    : undefined
  const cardTransform = drag.exiting
    ? exitTransform
    : incoming
      ? 'translate3d(0, 10px, 0) scale(0.965)'
      : `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${rotation}deg)`
  const previewLift = drag.exiting ? 1 : Math.min(1, strength * 0.8)
  const previewTransform = `translate3d(0, ${10 - previewLift * 10}px, 0) scale(${0.965 + previewLift * 0.035})`

  function currentIntent(x: number, y: number, threshold = SWIPE_PREVIEW_THRESHOLD, ratio = 1.12): SwipeIntent | null {
    const absX = Math.abs(x)
    const absY = Math.abs(y)
    if (Math.max(absX, absY) < threshold) return null
    if (absX > 0 && absY > 0 && Math.max(absX, absY) / Math.min(absX, absY) < ratio) return null
    if (absX >= absY) return x > 0 ? 'watched' : 'not_watched'
    return y < 0 ? 'liked' : 'disliked'
  }

  const onPointerDown: PointerEventHandler<HTMLElement> = event => {
    if (drag.exiting || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    activePointerIdRef.current = event.pointerId
    dragStartRef.current = { x: event.clientX, y: event.clientY, time: Date.now() }
    setDrag({ x: 0, y: 0, active: true, exiting: false, intent: null })
  }

  const onPointerMove: PointerEventHandler<HTMLElement> = event => {
    if (!dragStartRef.current || drag.exiting || activePointerIdRef.current !== event.pointerId) return
    const x = event.clientX - dragStartRef.current.x
    const y = event.clientY - dragStartRef.current.y
    setDragFrame({ x, y, active: true, exiting: false, intent: currentIntent(x, y) })
  }

  const finishDrag: PointerEventHandler<HTMLElement> = event => {
    const start = dragStartRef.current
    if (!start) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStartRef.current = null
    activePointerIdRef.current = null

    const x = event.clientX - start.x
    const y = event.clientY - start.y
    const finalIntent = currentIntent(x, y, SWIPE_COMMIT_THRESHOLD, 1.25)
    const isTap = Math.hypot(x, y) < 10 && Date.now() - start.time < 260
    const now = Date.now()
    if (isTap && now - lastTapRef.current < 320) {
      lastTapRef.current = 0
      if (singleTapTimerRef.current) {
        window.clearTimeout(singleTapTimerRef.current)
        singleTapTimerRef.current = null
      }
      commitSwipe('watchlist')
      return
    }
    if (isTap) {
      lastTapRef.current = now
      resetSwipe()
      singleTapTimerRef.current = window.setTimeout(() => {
        singleTapTimerRef.current = null
        lastTapRef.current = 0
        onOpen(activeItem)
      }, 280)
      return
    }
    lastTapRef.current = 0

    if (!finalIntent) {
      resetSwipe()
      return
    }
    commitSwipe(finalIntent)
  }

  function resetSwipe() {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingDragRef.current = null
    setDrag({ x: 0, y: 0, active: false, exiting: false, intent: null })
  }

  function commitSwipe(nextIntent: SwipeIntent) {
    setDrag(previous => ({
      ...previous,
      active: false,
      exiting: true,
      intent: nextIntent,
      x: previous.x || (nextIntent === 'watched' ? SWIPE_COMMIT_THRESHOLD : nextIntent === 'not_watched' ? -SWIPE_COMMIT_THRESHOLD : 0),
      y: previous.y || (nextIntent === 'liked' ? -SWIPE_COMMIT_THRESHOLD : nextIntent === 'disliked' ? SWIPE_COMMIT_THRESHOLD : 0),
    }))
    window.setTimeout(() => {
      onAction(activeItem, swipeIntents[nextIntent].action)
    }, 120)
  }

  const swipeStackStyle = {
    '--media-swipe-gutter-x': 'clamp(42px, 11vw, 54px)',
    '--media-swipe-gutter-y': '36px',
    width: 'min(430px, 100vw)',
    height: 'min(524px, calc(100dvh - 214px - env(safe-area-inset-top) - env(safe-area-inset-bottom)))',
    minHeight: 372,
  } as CSSProperties
  const cardInset = 'var(--media-swipe-gutter-y) var(--media-swipe-gutter-x)'

  return (
    <section className="flex justify-center overflow-visible" style={{ width: '100vw', marginInline: 'calc(50% - 50vw)' }}>
      <div
        className="relative touch-none select-none overflow-visible"
        style={swipeStackStyle}
      >
        <SwipeDirectionIndicators intent={intent} strength={strength} />
        {nextItem ? (
          <MediaCard
            key={`next-${nextItem.id}`}
            item={nextItem}
            selectedProviderIds={selectedProviderIds}
            isPreview
            style={{
              position: 'absolute',
              inset: cardInset,
              zIndex: 1,
              transform: previewTransform,
              opacity: 0.58 + previewLift * 0.22,
              transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div
            className="pointer-events-none absolute rounded-[22px] border border-[var(--media-line)] bg-[var(--media-panel)] shadow-sm"
            style={{ inset: cardInset, transform: 'scale(0.965) translateY(10px)', opacity: 0.45 }}
          />
        )}
        <MediaCard
          key={`active-${activeItem.id}`}
          item={activeItem}
          selectedProviderIds={selectedProviderIds}
          intent={intent}
          intentStrength={strength}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={() => {
            dragStartRef.current = null
            activePointerIdRef.current = null
            resetSwipe()
          }}
          style={{
            position: 'absolute',
            inset: cardInset,
            zIndex: 2,
            transform: cardTransform,
            transition: drag.active ? 'none' : 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
            touchAction: 'none',
            cursor: drag.active ? 'grabbing' : 'grab',
          }}
        />
      </div>
    </section>
  )
}

function MediaCard({ item, selectedProviderIds, intent, intentStrength = 0, isPreview = false, style, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  item: MediaItem
  selectedProviderIds: number[]
  intent?: SwipeIntent | null
  intentStrength?: number
  isPreview?: boolean
  style?: CSSProperties
  onPointerDown?: PointerEventHandler
  onPointerMove?: PointerEventHandler
  onPointerUp?: PointerEventHandler
  onPointerCancel?: PointerEventHandler
}) {
  const providers = serviceProviders(item, selectedProviderIds)
  const meta = intent ? swipeIntents[intent] : null
  return (
    <article
      className={`media-swipe-card relative flex flex-col overflow-hidden rounded-[22px] border bg-[var(--media-panel)] shadow-[var(--media-shadow)] ${meta ? meta.ring : 'border-[var(--media-line)]'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={style}
    >
      <div className="relative min-h-0 flex-[1_1_auto] bg-black">
        {item.posterPath ? (
          <img src={posterUrl(item.posterPath)} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/35"><Clapperboard className="h-16 w-16" strokeWidth={1.4} /></div>
        )}
        <div
          className="absolute inset-0"
          style={{
            background: meta ? `color-mix(in srgb, currentColor ${Math.round((intentStrength ?? 0) * 16)}%, transparent)` : 'transparent',
            color: meta?.tone.includes('red') ? 'var(--red)' : meta?.tone.includes('sage') ? 'var(--sage)' : meta?.tone.includes('amber') ? 'var(--amber)' : 'var(--accent)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/88 via-black/42 to-transparent px-4 pb-4 pt-16 text-white">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold">
            <span className="rounded-full bg-white/18 px-2.5 py-1">{mediaLabel(item)}</span>
            <span className="rounded-full bg-white/18 px-2.5 py-1">{yearLabel(item)}</span>
            {item.voteAverageX10 ? <span className="rounded-full bg-white/18 px-2.5 py-1">{(item.voteAverageX10 / 10).toFixed(1)}</span> : null}
          </div>
          <h2 className="mt-2 line-clamp-2 text-[24px] font-black leading-[1.03]">{item.title}</h2>
        </div>
      </div>
      <div className="shrink-0 px-4 py-3">
        <MediaProviderPills providers={providers} emptyText={providerEmptyText(item, selectedProviderIds)} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(item.genres ?? []).slice(0, 3).map(genre => <span key={genre} className="rounded-full bg-[var(--media-panel-2)] px-2.5 py-1 text-[11px] font-bold text-[var(--media-muted)]">{genre}</span>)}
        </div>
        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--media-muted)]">{item.overview || 'No synopsis available.'}</p>
      </div>
    </article>
  )
}

function SwipeDirectionIndicators({ intent, strength }: { intent: SwipeIntent | null; strength: number }) {
  const active = Math.max(0, Math.min(1, strength))
  const pillOpacity = (edge: SwipeIntent) => intent === edge ? 0.96 : 0.58
  const pillScale = (edge: SwipeIntent) => intent === edge ? 1 + active * 0.08 : 1
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div className="absolute left-1/2" style={{ top: 'calc(var(--media-swipe-gutter-y) / 2)', transform: `translate(-50%, -50%) scale(${pillScale('liked')})`, opacity: pillOpacity('liked') }}>
        <span className="block rounded-full bg-sage px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm">Like</span>
      </div>
      <div className="absolute left-1/2" style={{ bottom: 'calc(var(--media-swipe-gutter-y) / 2)', transform: `translate(-50%, 50%) scale(${pillScale('disliked')})`, opacity: pillOpacity('disliked') }}>
        <span className="block rounded-full bg-red px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm">Dislike</span>
      </div>
      <div className="absolute top-1/2" style={{ right: 'calc(var(--media-swipe-gutter-x) / 2)', transform: `translate(50%, -50%) scale(${pillScale('watched')})`, opacity: pillOpacity('watched') }}>
        <span className="block rounded-full bg-accent px-2 py-1 text-[10px] font-black uppercase text-white shadow-sm [writing-mode:vertical-rl]">Watched</span>
      </div>
      <div className="absolute top-1/2" style={{ left: 'calc(var(--media-swipe-gutter-x) / 2)', transform: `translate(-50%, -50%) scale(${pillScale('not_watched')})`, opacity: pillOpacity('not_watched') }}>
        <span className="block rounded-full bg-text-1 px-2 py-1 text-[10px] font-black uppercase text-bg shadow-sm [writing-mode:vertical-rl]">Skip</span>
      </div>
    </div>
  )
}

function MediaProviderPills({ providers, emptyText, compact = false }: { providers: MediaProvider[]; emptyText?: string; compact?: boolean }) {
  if (!providers.length) {
    return emptyText ? <p className={`${compact ? 'text-[11px]' : 'text-[12px]'} font-bold text-[var(--media-faint)]`}>{emptyText}</p> : null
  }
  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {providers.map(provider => (
        <span key={provider.provider_id} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--media-line)] bg-[var(--media-panel-2)] ${compact ? 'px-1.5 py-1 text-[10.5px]' : 'px-2 py-1 text-[11px]'} font-black text-[var(--media-ink)]`}>
          {provider.logo_path ? <img src={posterUrl(provider.logo_path, 'w92')} alt="" className={`${compact ? 'h-4 w-4 rounded-[4px]' : 'h-5 w-5 rounded-[5px]'} shrink-0 object-cover`} /> : null}
          <span className="max-w-[118px] truncate">{provider.provider_name}</span>
        </span>
      ))}
    </div>
  )
}

function SearchView({ query, setQuery, searching, results, userStates, userId, familyStates, selectedProviderIds, onAction, onFamily, onOpen }: {
  query: string
  setQuery: (value: string) => void
  searching: boolean
  results: MediaItem[]
  userStates: MediaUserState[]
  userId: string
  familyStates: MediaFamilyState[]
  selectedProviderIds: number[]
  onAction: (item: MediaItem, action: keyof typeof actionMeta | 'skip') => void
  onFamily: (item: MediaItem, enabled: boolean) => void
  onOpen: (item: MediaItem) => void
}) {
  return (
    <section>
      <label className="flex items-center gap-2 rounded-full border border-[var(--media-line)] bg-[var(--media-panel)] px-4 py-3 shadow-sm">
        <Search className="h-5 w-5 text-[var(--media-faint)]" strokeWidth={1.9} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search films and TV" className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-[var(--media-ink)] outline-none placeholder:text-[var(--media-faint)]" />
      </label>
      <div className="mt-4 space-y-3">
        {searching ? <p className="px-1 text-[13px] font-semibold text-[var(--media-muted)]">Searching...</p> : null}
        {results.map(item => {
          const familyActive = familyStates.some(row => row.mediaItemId === item.id && row.status === 'wishlist' && Boolean(row.watchlist))
          return <CompactMediaRow key={item.id} item={item} watchlistActive={userStates.some(row => row.userId === userId && row.mediaItemId === item.id && row.status === 'wishlist' && Boolean(row.watchlist))} familyActive={familyActive} selectedProviderIds={selectedProviderIds} onAction={onAction} onFamily={onFamily} onOpen={onOpen} />
        })}
        {!searching && query.trim().length >= 2 && !results.length ? <EmptyCard text="No matches found." /> : null}
      </div>
    </section>
  )
}

function CompactMediaRow({ item, selectedProviderIds, watchlistActive = false, familyActive = false, statusLabel, rating, onAction, onFamily, onOpen, trailing }: {
  item: MediaItem
  selectedProviderIds: number[]
  watchlistActive?: boolean
  familyActive?: boolean
  statusLabel?: string
  rating?: 'liked' | 'neutral' | 'disliked' | null
  onAction?: (item: MediaItem, action: keyof typeof actionMeta | 'skip') => void
  onFamily?: (item: MediaItem, enabled: boolean) => void
  onOpen?: (item: MediaItem) => void
  trailing?: ReactNode
}) {
  const providers = serviceProviders(item, selectedProviderIds)
  const people = castNames(item, 2)
  const stop = (event: ReactMouseEvent) => event.stopPropagation()
  return (
    <article
      className="group flex gap-3 rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] p-2 transition active:scale-[0.995]"
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(item)}
      onKeyDown={event => {
        if (!onOpen || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onOpen(item)
      }}
    >
      <div className="relative h-[116px] w-[78px] shrink-0 overflow-hidden rounded-[8px] bg-[var(--media-panel-2)]">
        {item.posterPath ? <img src={posterUrl(item.posterPath, 'w185')} alt="" className="h-full w-full object-cover" loading="lazy" /> : (
          <div className="flex h-full w-full items-center justify-center text-[var(--media-faint)]"><Clapperboard className="h-9 w-9" strokeWidth={1.5} /></div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/72 px-1.5 py-0.5 text-[9px] font-black uppercase text-white backdrop-blur">{item.mediaType === 'movie' ? 'Film' : 'TV'}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[15px] font-black leading-tight text-[var(--media-ink)]">{item.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <p className="text-[11.5px] font-bold text-[var(--media-muted)]">{yearLabel(item)}{item.voteAverageX10 ? ` · ${(item.voteAverageX10 / 10).toFixed(1)}` : ''}{runtimeLabel(item) ? ` · ${runtimeLabel(item)}` : ''}</p>
              {statusLabel ? <MediaStatusPill label={statusLabel} rating={rating} /> : null}
            </div>
          </div>
          <div onClick={stop} className="shrink-0">
            {trailing ?? (item.mediaType === 'tv' ? <Tv className="h-4 w-4 text-[var(--media-faint)]" strokeWidth={1.8} /> : <Film className="h-4 w-4 text-[var(--media-faint)]" strokeWidth={1.8} />)}
          </div>
        </div>
        {people.length ? <p className="mt-1 truncate text-[11.5px] font-semibold text-[var(--media-muted)]">{people.join(', ')}</p> : null}
        <div className="mt-2 min-h-[24px]">
          <MediaProviderPills providers={providers} compact emptyText={providerEmptyText(item, selectedProviderIds)} />
        </div>
        <div className="mt-auto flex items-center gap-1.5 pt-2" onClick={stop}>
          {onAction ? <IconAction label={watchlistActive ? 'In watchlist' : 'Add to watchlist'} onClick={() => onAction(item, 'wishlist')} active={watchlistActive}><ListPlus className="h-4 w-4" strokeWidth={2.3} /></IconAction> : null}
          {onAction ? <IconAction label="Mark seen and liked" onClick={() => onAction(item, 'watched_liked')}><ThumbsUp className="h-4 w-4" strokeWidth={2.3} /></IconAction> : null}
          {onFamily ? <IconAction label={familyActive ? 'Remove from family' : 'Add to family'} onClick={() => onFamily(item, !familyActive)} active={familyActive}><Users className="h-4 w-4" strokeWidth={2.3} /></IconAction> : null}
        </div>
      </div>
    </article>
  )
}

function MediaStatusPill({ label, rating }: { label: string; rating?: 'liked' | 'neutral' | 'disliked' | null }) {
  const tone = rating === 'liked'
    ? 'bg-sage-bg text-sage'
    : rating === 'disliked'
      ? 'bg-red-bg text-red'
      : label === 'Watching'
        ? 'bg-accent-bg text-accent'
        : 'bg-[var(--media-panel-2)] text-[var(--media-muted)]'
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${tone}`}>{label}</span>
}

function IconAction({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-[9px] border transition ${active ? 'border-accent-border bg-accent-bg text-accent' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function MyListsView({ rows, activeTab, activeFilter, search, activeGenre, setActiveTab, setActiveFilter, setSearch, setActiveGenre, selectedProviderIds, familyStates, onFamily, onStatus, onDelete, onOpen, expandedShowId, onExpandShow, progress, seasonCache, seasonErrors, openSeasonKey, onLoadSeason, onEpisode, onSeason }: {
  rows: Array<{ state: MediaUserState; item: MediaItem }>
  activeTab: MyListTab
  activeFilter: MediaFilter
  search: string
  activeGenre: string
  setActiveTab: (tab: MyListTab) => void
  setActiveFilter: (filter: MediaFilter) => void
  setSearch: (value: string) => void
  setActiveGenre: (value: string) => void
  selectedProviderIds: number[]
  familyStates: MediaFamilyState[]
  onFamily: (item: MediaItem, enabled: boolean) => void
  onStatus: (item: MediaItem, status: MediaUserStatus, rating?: 'liked' | 'neutral' | 'disliked' | null) => void
  onDelete: (row: MediaUserState) => void
  onOpen: (item: MediaItem) => void
  expandedShowId: string | null
  onExpandShow: (id: string | null) => void
  progress: Array<{ episodeId: string; watchedAt?: string | number | Date | null }>
  seasonCache: Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>
  seasonErrors: Record<string, string>
  openSeasonKey: string | null
  onLoadSeason: (item: MediaItem, seasonNumber: number) => void
  onEpisode: (item: MediaItem, episode: MediaEpisode, watched: boolean) => void
  onSeason: (item: MediaItem, seasonNumber: number, episodes: MediaEpisode[], watched: boolean) => void
}) {
  const countFor = (target: MyListTab) => rows.filter(row => {
    if (target === 'watchlist') return Boolean(row.state.watchlist) && row.state.status === 'wishlist'
    if (target === 'seen') return row.state.status === 'watched' || row.state.status === 'watching'
    return row.state.rating === 'liked'
  }).length
  const baseRows = rows.filter(row => {
    if (activeTab === 'watchlist') return Boolean(row.state.watchlist) && row.state.status === 'wishlist'
    if (activeTab === 'seen') return row.state.status === 'watched' || row.state.status === 'watching'
    return row.state.rating === 'liked'
  })
  const genres = Array.from(new Set(baseRows.flatMap(row => row.item.genres ?? []))).sort((a, b) => a.localeCompare(b)).slice(0, 16)
  const filtered = baseRows.filter(row => {
    if (activeFilter !== 'all' && row.item.mediaType !== activeFilter) return false
    if (activeGenre !== 'all' && !(row.item.genres ?? []).includes(activeGenre)) return false
    return matchesMediaSearch(row.item, search)
  })

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] p-1">
        {([
          ['watchlist', 'Watchlist', countFor('watchlist')],
          ['seen', 'Seen', countFor('seen')],
          ['liked', 'Liked', countFor('liked')],
        ] as Array<[MyListTab, string, number]>).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setActiveTab(id)
              setActiveGenre('all')
            }}
            className={`rounded-[9px] px-1.5 py-2 text-center transition ${activeTab === id ? 'bg-accent-bg text-[var(--media-ink)]' : 'text-[var(--media-muted)]'}`}
          >
            <span className="block text-[12px] font-black leading-none">{label}</span>
            <span className="mt-1 block text-[10px] font-black leading-none text-[var(--media-faint)]">{count}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-[14px] border border-[var(--media-line)] bg-[var(--media-panel)] px-3 py-2.5 shadow-sm">
        <Search className="h-4.5 w-4.5 text-[var(--media-faint)]" strokeWidth={2} />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search title, actor, category, provider"
          className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[var(--media-ink)] outline-none placeholder:text-[var(--media-faint)]"
        />
        {search ? <button type="button" onClick={() => setSearch('')} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--media-panel-2)] text-[var(--media-muted)]" aria-label="Clear list search"><X className="h-4 w-4" /></button> : null}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] px-2.5 py-2">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--media-faint)]">Type</span>
          <select value={activeFilter} onChange={event => setActiveFilter(event.target.value as MediaFilter)} className="mt-1 w-full bg-transparent text-[13px] font-black text-[var(--media-ink)] outline-none">
            <option value="all">All</option>
            <option value="movie">Films</option>
            <option value="tv">TV</option>
          </select>
        </label>
        <label className="rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] px-2.5 py-2">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--media-faint)]">Category</span>
          <select value={activeGenre} onChange={event => setActiveGenre(event.target.value)} className="mt-1 w-full bg-transparent text-[13px] font-black text-[var(--media-ink)] outline-none">
            <option value="all">All categories</option>
            {genres.map(genre => <option key={genre} value={genre}>{genre}</option>)}
          </select>
        </label>
      </div>
      {!filtered.length ? <EmptyCard text="Nothing here yet." /> : (
        <div className="space-y-3">
          {filtered.map(row => (
            <SwipeRow key={row.state.id} onDelete={() => onDelete(row.state)} wrapClassName="rounded-[16px]">
              <div className="rounded-[16px] bg-[var(--media-bg)]">
                <CompactMediaRow
                  item={row.item}
                  selectedProviderIds={selectedProviderIds}
                  statusLabel={labelStatus(row.state.status)}
                  rating={row.state.rating}
                  familyActive={familyStates.some(state => state.mediaItemId === row.item.id && state.status === 'wishlist' && Boolean(state.watchlist))}
                  onFamily={onFamily}
                  onOpen={onOpen}
                  trailing={row.item.mediaType === 'tv' && (row.state.status === 'watched' || row.state.status === 'watching') ? (
                    <button type="button" onClick={() => onExpandShow(expandedShowId === row.item.id ? null : row.item.id)} className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]" aria-label={expandedShowId === row.item.id ? 'Hide seasons' : 'Show seasons'}>
                      {expandedShowId === row.item.id ? <ChevronDown className="h-4.5 w-4.5" /> : <ChevronRight className="h-4.5 w-4.5" />}
                    </button>
                  ) : activeTab === 'watchlist' ? (
                    <button type="button" onClick={() => onStatus(row.item, 'watched', 'neutral')} className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]" aria-label="Add to seen">
                      <Check className="h-4.5 w-4.5" strokeWidth={2.2} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onStatus(row.item, 'watched', row.state.rating === 'liked' ? null : 'liked')} className={`flex h-9 w-9 items-center justify-center rounded-[9px] border ${row.state.rating === 'liked' ? 'border-sage bg-sage-bg text-sage' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label={row.state.rating === 'liked' ? 'Remove like' : 'Mark liked'}>
                        <ThumbsUp className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <button type="button" onClick={() => onStatus(row.item, 'watched', row.state.rating === 'disliked' ? null : 'disliked')} className={`flex h-9 w-9 items-center justify-center rounded-[9px] border ${row.state.rating === 'disliked' ? 'border-red/30 bg-red/10 text-red' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label={row.state.rating === 'disliked' ? 'Remove dislike' : 'Mark disliked'}>
                        <ThumbsDown className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  )}
                />
                <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expandedShowId === row.item.id ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    {row.item.mediaType === 'tv' ? (
                      <SeasonPanel
                        item={row.item}
                        progress={progress}
                        seasonCache={seasonCache}
                        seasonErrors={seasonErrors}
                        openSeasonKey={openSeasonKey}
                        onLoadSeason={onLoadSeason}
                        onEpisode={onEpisode}
                        onSeason={onSeason}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </section>
  )
}

function FamilyView({ rows, activeTab, activeFilter, search, activeGenre, setActiveTab, setActiveFilter, setSearch, setActiveGenre, selectedProviderIds, onWatchlist, onSeen, onRating, onDelete, onOpen }: {
  rows: Array<{ state: MediaFamilyState; item: MediaItem }>
  activeTab: FamilyListTab
  activeFilter: MediaFilter
  search: string
  activeGenre: string
  setActiveTab: (tab: FamilyListTab) => void
  setActiveFilter: (filter: MediaFilter) => void
  setSearch: (value: string) => void
  setActiveGenre: (value: string) => void
  selectedProviderIds: number[]
  onWatchlist: (item: MediaItem, enabled: boolean) => void
  onSeen: (item: MediaItem, enabled: boolean) => void
  onRating: (item: MediaItem, rating: 'liked' | 'disliked') => void
  onDelete: (row: MediaFamilyState) => void
  onOpen: (item: MediaItem) => void
}) {
  const countFor = (target: FamilyListTab) => rows.filter(row => {
    if (target === 'watchlist') return Boolean(row.state.watchlist) && row.state.status === 'wishlist'
    if (target === 'seen') return row.state.status === 'watched' || row.state.status === 'watching'
    return row.state.rating === 'liked'
  }).length
  const baseRows = rows.filter(row => {
    if (activeTab === 'watchlist') return Boolean(row.state.watchlist) && row.state.status === 'wishlist'
    if (activeTab === 'seen') return row.state.status === 'watched' || row.state.status === 'watching'
    return row.state.rating === 'liked'
  })
  const genres = Array.from(new Set(baseRows.flatMap(row => row.item.genres ?? []))).sort((a, b) => a.localeCompare(b)).slice(0, 16)
  const filtered = baseRows.filter(row => {
    if (activeFilter !== 'all' && row.item.mediaType !== activeFilter) return false
    if (activeGenre !== 'all' && !(row.item.genres ?? []).includes(activeGenre)) return false
    return matchesMediaSearch(row.item, search)
  })

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] p-1">
        {([
          ['watchlist', 'Watchlist', countFor('watchlist')],
          ['seen', 'Seen', countFor('seen')],
          ['liked', 'Liked', countFor('liked')],
        ] as Array<[FamilyListTab, string, number]>).map(([id, label, count]) => (
          <button key={id} type="button" onClick={() => { setActiveTab(id); setActiveGenre('all') }} className={`rounded-[9px] px-1.5 py-2 text-center transition ${activeTab === id ? 'bg-accent-bg text-[var(--media-ink)]' : 'text-[var(--media-muted)]'}`}>
            <span className="block text-[12px] font-black leading-none">{label}</span>
            <span className="mt-1 block text-[10px] font-black leading-none text-[var(--media-faint)]">{count}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-[14px] border border-[var(--media-line)] bg-[var(--media-panel)] px-3 py-2.5 shadow-sm">
        <Search className="h-4.5 w-4.5 text-[var(--media-faint)]" strokeWidth={2} />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search family list" className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[var(--media-ink)] outline-none placeholder:text-[var(--media-faint)]" />
        {search ? <button type="button" onClick={() => setSearch('')} className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--media-panel-2)] text-[var(--media-muted)]" aria-label="Clear family search"><X className="h-4 w-4" /></button> : null}
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] px-2.5 py-2">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--media-faint)]">Type</span>
          <select value={activeFilter} onChange={event => setActiveFilter(event.target.value as MediaFilter)} className="mt-1 w-full bg-transparent text-[13px] font-black text-[var(--media-ink)] outline-none">
            <option value="all">All</option>
            <option value="movie">Films</option>
            <option value="tv">TV</option>
          </select>
        </label>
        <label className="rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)] px-2.5 py-2">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[var(--media-faint)]">Category</span>
          <select value={activeGenre} onChange={event => setActiveGenre(event.target.value)} className="mt-1 w-full bg-transparent text-[13px] font-black text-[var(--media-ink)] outline-none">
            <option value="all">All categories</option>
            {genres.map(genre => <option key={genre} value={genre}>{genre}</option>)}
          </select>
        </label>
      </div>
      {!filtered.length ? <EmptyCard text="Nothing here yet." /> : (
        <div className="space-y-3">
          {filtered.map(row => (
            <SwipeRow key={row.state.id} onDelete={() => onDelete(row.state)} wrapClassName="rounded-[16px]">
              <CompactMediaRow
                item={row.item}
                selectedProviderIds={selectedProviderIds}
                statusLabel={labelStatus(row.state.status)}
                rating={row.state.rating}
                familyActive={row.state.status === 'wishlist' && Boolean(row.state.watchlist)}
                onOpen={onOpen}
                trailing={
                  activeTab === 'watchlist' ? (
                    <button type="button" onClick={() => onSeen(row.item, row.state.status !== 'watched')} className={`flex h-9 w-9 items-center justify-center rounded-[9px] border ${row.state.status === 'watched' ? 'border-accent-border bg-accent-bg text-accent' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label={row.state.status === 'watched' ? 'Remove family seen' : 'Mark seen by family'}>
                      <Eye className="h-4 w-4" strokeWidth={2} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onRating(row.item, 'liked')} className={`flex h-9 w-9 items-center justify-center rounded-[9px] border ${row.state.rating === 'liked' ? 'border-sage bg-sage-bg text-sage' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label={row.state.rating === 'liked' ? 'Remove family like' : 'Family liked'}>
                        <ThumbsUp className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <button type="button" onClick={() => onRating(row.item, 'disliked')} className={`flex h-9 w-9 items-center justify-center rounded-[9px] border ${row.state.rating === 'disliked' ? 'border-red/30 bg-red/10 text-red' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label={row.state.rating === 'disliked' ? 'Remove family dislike' : 'Family disliked'}>
                        <ThumbsDown className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  )
                }
              />
            </SwipeRow>
          ))}
        </div>
      )}
    </section>
  )
}

function SeasonPanel({ item, progress, seasonCache, seasonErrors, openSeasonKey, onLoadSeason, onEpisode, onSeason }: {
  item: MediaItem
  progress: Array<{ episodeId: string; watchedAt?: string | number | Date | null }>
  seasonCache: Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>
  seasonErrors: Record<string, string>
  openSeasonKey: string | null
  onLoadSeason: (item: MediaItem, seasonNumber: number) => void
  onEpisode: (item: MediaItem, episode: MediaEpisode, watched: boolean) => void
  onSeason: (item: MediaItem, seasonNumber: number, episodes: MediaEpisode[], watched: boolean) => void
}) {
  const watched = new Set(progress.filter(row => row.watchedAt).map(row => row.episodeId))
  const seasons = (item.seasons ?? []).filter(season => Number(season.seasonNumber) > 0)
  return (
      <div className="border-t border-[var(--media-line)] px-2.5 pb-3 pt-2.5">
        <div className="space-y-2">
          {seasons.map(raw => {
            const seasonNumber = Number(raw.seasonNumber)
            const key = `${item.id}:s${seasonNumber}`
            const cached = seasonCache[key]
            const error = seasonErrors[key]
            const episodes = cached?.episodes ?? []
            const watchedCount = episodes.filter(episode => watched.has(episode.id)).length
            const allWatched = episodes.length > 0 && episodes.every(episode => watched.has(episode.id))
            return (
              <div key={key} className="overflow-hidden rounded-[12px] border border-[var(--media-line)] bg-[var(--media-panel)]">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => onSeason(item, seasonNumber, episodes, !allWatched)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${allWatched ? 'border-accent-border bg-accent-bg text-accent' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-faint)]'}`} aria-label={allWatched ? 'Mark season unwatched' : 'Mark season watched'}>
                    {allWatched ? <Check className="h-4 w-4" strokeWidth={3} /> : <Circle className="h-4 w-4" strokeWidth={1.8} />}
                  </button>
                  <button type="button" onClick={() => onLoadSeason(item, seasonNumber)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-black text-[var(--media-ink)]">{String(raw.name ?? `Season ${seasonNumber}`)}</span>
                      <span className="block truncate text-[11.5px] font-bold text-[var(--media-muted)]">{cached ? `${watchedCount} of ${episodes.length} watched` : `${Number(raw.episodeCount ?? 0)} episodes`}</span>
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--media-panel-2)] text-[var(--media-muted)]">
                      {openSeasonKey === key ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  </button>
                </div>
                {openSeasonKey === key ? (
                  <div className="border-t border-[var(--media-line)] px-2 py-2">
                    {error ? <p className="px-1 py-2 text-[13px] font-semibold text-red">{error}</p> : !cached ? <p className="px-1 py-2 text-[13px] font-semibold text-[var(--media-muted)]">Loading episodes...</p> : cached.episodes.map(episode => (
                      <button key={episode.id} type="button" onClick={() => onEpisode(item, episode, !watched.has(episode.id))} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left active:bg-[var(--media-panel-2)]">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${watched.has(episode.id) ? 'border-accent-border bg-accent-bg text-accent' : 'border-[var(--media-line)] text-transparent'}`}><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-[var(--media-ink)]">S{seasonNumber} E{episode.episodeNumber}: {episode.name}</span>
                          {episode.airDate ? <span className="block truncate text-[11px] font-semibold text-[var(--media-muted)]">{String(episode.airDate)}</span> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
  )
}

function ServicesView({ providers, selectedIds, onChange }: { providers: MediaProvider[]; selectedIds: number[]; onChange: (ids: number[]) => void }) {
  const commonNames = [
    'Netflix',
    'Netflix basic with Ads',
    'Disney Plus',
    'Amazon Prime Video',
    'Apple TV Plus',
    'NOW',
    'Sky Go',
    'BBC iPlayer',
    'ITVX',
    'Channel 4',
    'My5',
    'Paramount Plus',
    'Discovery+',
    'MUBI',
    'BFI Player',
    'Curzon Home Cinema',
    'Crunchyroll',
    'Hayu',
    'BritBox',
    'Rakuten TV',
    'Google Play Movies',
    'YouTube',
    'Microsoft Store',
  ]
  const common = providers.filter(provider => commonNames.includes(provider.provider_name))
  const list = common.length ? common : providers.slice(0, 30)
  return (
    <section>
      <div className="rounded-[16px] border border-[var(--media-line)] bg-[var(--media-panel)] p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-bg text-accent"><SlidersHorizontal className="h-4.5 w-4.5" strokeWidth={2.2} /></span>
          <h2 className="text-[18px] font-black text-[var(--media-ink)]">Streaming services</h2>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-[var(--media-muted)]">Pick what the household has. Availability badges only show matching services once TMDB has provider data for a title.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {list.map(provider => {
          const selected = selectedIds.includes(provider.provider_id)
          return (
            <button key={provider.provider_id} type="button" onClick={() => onChange(selected ? selectedIds.filter(id => id !== provider.provider_id) : [...selectedIds, provider.provider_id])} className={`flex min-h-[62px] items-center gap-3 rounded-[14px] border px-3 text-left transition ${selected ? 'border-accent-border bg-accent-bg text-[var(--media-ink)]' : 'border-[var(--media-line)] bg-[var(--media-panel)] text-[var(--media-muted)]'}`}>
              {provider.logo_path ? <img src={posterUrl(provider.logo_path, 'w92')} alt="" className="h-8 w-8 rounded-[8px] object-cover" loading="lazy" /> : <Star className="h-5 w-5" />}
              <span className="text-[13px] font-bold leading-4">{provider.provider_name}</span>
              {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} /> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MediaDetailSheet({ item, loading, userState, familyState, selectedProviderIds, onClose, onWatchlist, onSeen, onRating, onFamily }: {
  item: MediaItem | null
  loading: boolean
  userState: MediaUserState | null
  familyState: MediaFamilyState | null
  selectedProviderIds: number[]
  onClose: () => void
  onWatchlist: (item: MediaItem, enabled: boolean) => void
  onSeen: (item: MediaItem, enabled: boolean) => void
  onRating: (item: MediaItem, rating: 'liked' | 'disliked') => void
  onFamily: (item: MediaItem, enabled: boolean) => void
}) {
  if (!item) return null
  const providers = serviceProviders(item, selectedProviderIds)
  const cast = castNames(item, 6)
  const crew = crewNames(item, 3)
  const runtime = runtimeLabel(item)
  const inWatchlist = userState?.status === 'wishlist'
  const seen = userState?.status === 'watched' || userState?.status === 'watching'
  const family = familyState?.status === 'wishlist' && Boolean(familyState?.watchlist)
  return (
    <div className="fixed inset-0 z-[65] flex items-end bg-black/55" onClick={onClose}>
      <div className="media-page max-h-[88dvh] w-full overflow-hidden rounded-t-[22px] border-t border-[var(--media-line)] bg-[var(--media-panel)] shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="relative h-[178px] bg-black">
          {item.backdropPath || item.posterPath ? (
            <img src={posterUrl(item.backdropPath || item.posterPath, item.backdropPath ? 'w780' : 'w500')} alt="" className="h-full w-full object-cover opacity-80" />
          ) : (
            <div className="flex h-full items-center justify-center text-white/35"><Clapperboard className="h-14 w-14" strokeWidth={1.4} /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/28 to-black/10" />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/58 text-white backdrop-blur" aria-label="Close details">
            <X className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4 text-white">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
              <span className="rounded-full bg-white/18 px-2.5 py-1">{mediaLabel(item)}</span>
              <span className="rounded-full bg-white/18 px-2.5 py-1">{yearLabel(item)}</span>
              {item.voteAverageX10 ? <span className="rounded-full bg-white/18 px-2.5 py-1">{(item.voteAverageX10 / 10).toFixed(1)}</span> : null}
            </div>
            <h2 className="mt-2 line-clamp-2 text-[25px] font-black leading-[1.04]">{item.title}</h2>
          </div>
        </div>
        <div className="max-h-[calc(88dvh-178px)] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+22px)] pt-4">
          {loading ? <p className="mb-3 rounded-[12px] bg-[var(--media-panel-2)] px-3 py-2 text-[12px] font-bold text-[var(--media-muted)]">Refreshing details...</p> : null}
          <div className="grid grid-cols-3 gap-2">
            {runtime ? <DetailStat icon={<Clock className="h-4 w-4" />} label={runtime} /> : null}
            <DetailStat icon={<Calendar className="h-4 w-4" />} label={item.releaseDate || item.firstAirDate || 'No date'} />
            <DetailStat icon={item.mediaType === 'tv' ? <Tv className="h-4 w-4" /> : <Film className="h-4 w-4" />} label={item.mediaType === 'tv' ? 'TV show' : 'Film'} />
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(item.genres ?? []).slice(0, 6).map(genre => <span key={genre} className="rounded-full bg-[var(--media-panel-2)] px-2.5 py-1 text-[11px] font-black text-[var(--media-muted)]">{genre}</span>)}
          </div>
          <p className="mt-4 text-[14px] font-medium leading-6 text-[var(--media-ink)]">{item.overview || 'No synopsis available.'}</p>
          {cast.length || crew.length ? (
            <div className="mt-4 space-y-2 rounded-[14px] border border-[var(--media-line)] bg-[var(--media-bg)] p-3">
              {cast.length ? <p className="text-[12px] font-bold leading-5 text-[var(--media-muted)]"><span className="text-[var(--media-ink)]">Cast:</span> {cast.join(', ')}</p> : null}
              {crew.length ? <p className="text-[12px] font-bold leading-5 text-[var(--media-muted)]"><span className="text-[var(--media-ink)]">Crew:</span> {crew.join(', ')}</p> : null}
            </div>
          ) : null}
          <div className="mt-4">
            <MediaProviderPills providers={providers} emptyText={providerEmptyText(item, selectedProviderIds)} />
          </div>
          <div className="mt-5 grid grid-cols-5 gap-2">
            <DetailAction label="Watchlist" active={inWatchlist} onClick={() => void onWatchlist(item, !inWatchlist)}><ListPlus className="h-4.5 w-4.5" /></DetailAction>
            <DetailAction label={item.mediaType === 'tv' ? 'Progress' : 'Seen'} active={seen} onClick={() => void onSeen(item, !seen)}><Eye className="h-4.5 w-4.5" /></DetailAction>
            <DetailAction label="Like" active={userState?.rating === 'liked'} onClick={() => void onRating(item, 'liked')}><ThumbsUp className="h-4.5 w-4.5" /></DetailAction>
            <DetailAction label="Dislike" active={userState?.rating === 'disliked'} onClick={() => void onRating(item, 'disliked')}><ThumbsDown className="h-4.5 w-4.5" /></DetailAction>
            <DetailAction label="Family" active={family} onClick={() => void onFamily(item, !family)}><Users className="h-4.5 w-4.5" /></DetailAction>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailAction({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] border text-[11px] font-black transition ${active ? 'border-accent-border bg-accent-bg text-accent' : 'border-[var(--media-line)] bg-[var(--media-bg)] text-[var(--media-ink)]'}`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

function DetailStat({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[12px] border border-[var(--media-line)] bg-[var(--media-bg)] px-2 text-center text-[var(--media-muted)]">
      {icon}
      <span className="line-clamp-2 text-[11px] font-black leading-tight">{label}</span>
    </div>
  )
}

function TvActionSheet({ item, action, onClose, onChoose }: { item: MediaItem | null; action: TvSheetAction; onClose: () => void; onChoose: (mode: 'all' | 'track') => void }) {
  if (!item || !action) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/45" onClick={onClose}>
      <div className="media-page mx-auto w-full max-w-lg rounded-t-[24px] border-t border-[var(--media-line)] bg-[var(--media-panel)] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4" onClick={event => event.stopPropagation()}>
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[var(--media-faint)]" />
        <h2 className="mt-5 text-[22px] font-black text-[var(--media-ink)]">{item.title}</h2>
        <p className="mt-1 text-[14px] text-[var(--media-muted)]">How much have you watched?</p>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={() => onChoose('all')} className="flex items-center gap-3 rounded-[16px] bg-accent px-4 py-4 text-left text-[15px] font-black text-white"><Eye className="h-5 w-5" strokeWidth={2.2} />Watched all episodes</button>
          <button type="button" onClick={() => onChoose('track')} className="flex items-center gap-3 rounded-[16px] border border-[var(--media-line)] bg-[var(--media-bg)] px-4 py-4 text-left text-[15px] font-black text-[var(--media-ink)]"><Tv className="h-5 w-5" strokeWidth={2.2} />Choose seasons and episodes</button>
        </div>
      </div>
    </div>
  )
}

function TvProgressSheet({ item, progress, seasonCache, seasonErrors, openSeasonKey, onClose, onLoadSeason, onEpisode, onSeason }: {
  item: MediaItem | null
  progress: Array<{ episodeId: string; watchedAt?: string | number | Date | null }>
  seasonCache: Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>
  seasonErrors: Record<string, string>
  openSeasonKey: string | null
  onClose: () => void
  onLoadSeason: (item: MediaItem, seasonNumber: number) => void
  onEpisode: (item: MediaItem, episode: MediaEpisode, watched: boolean) => void
  onSeason: (item: MediaItem, seasonNumber: number, episodes: MediaEpisode[], watched: boolean) => void
}) {
  if (!item) return null
  return (
    <div className="fixed inset-0 z-[68] flex items-end bg-black/45" onClick={onClose}>
      <div className="media-page mx-auto max-h-[82dvh] w-full max-w-lg overflow-hidden rounded-t-[24px] border-t border-[var(--media-line)] bg-[var(--media-panel)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-[var(--media-line)] px-4 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--media-faint)]">Episode progress</p>
            <h2 className="mt-1 line-clamp-2 text-[20px] font-black leading-tight text-[var(--media-ink)]">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--media-panel-2)] text-[var(--media-muted)]" aria-label="Close episode progress">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="max-h-[calc(82dvh-84px)] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <SeasonPanel
            item={item}
            progress={progress}
            seasonCache={seasonCache}
            seasonErrors={seasonErrors}
            openSeasonKey={openSeasonKey}
            onLoadSeason={onLoadSeason}
            onEpisode={onEpisode}
            onSeason={onSeason}
          />
        </div>
      </div>
    </div>
  )
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-[16px] border border-[var(--media-line)] bg-[var(--media-panel)] px-5 py-8 text-center text-[14px] font-semibold text-[var(--media-muted)] shadow-sm">{text}</div>
}

function readProviderIds(settings?: Record<string, unknown> | null) {
  const media = settings?.media as Record<string, unknown> | undefined
  return Array.isArray(media?.streamingProviderIds) ? media.streamingProviderIds.filter((id): id is number => typeof id === 'number') : []
}

function mergeMediaItems(existing: MediaItem[], incoming: MediaItem[]) {
  const seen = new Set(existing.map(item => item.id))
  return [...existing, ...incoming.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })]
}

function labelStatus(status: string) {
  return status === 'wishlist' ? 'Watchlist' : status === 'watching' ? 'Watching' : status === 'watched' ? 'Watched' : 'Not interested'
}
