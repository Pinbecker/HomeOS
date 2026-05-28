import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEventHandler, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronRight, Circle, Clapperboard, Eye, Heart, ListPlus, Play, Search, Settings2, SlidersHorizontal, Star, ThumbsDown, ThumbsUp, Tv, Users } from 'lucide-react'
import { BottomNav } from './bottom-nav'
import { SwipeRow } from '../components/swipe-row'
import { enqueueMutation, makeId, useAppState, type AppState, type MediaEpisode, type MediaFamilyState, type MediaItem, type MediaSeason, type MediaUserState, type MediaUserStatus } from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import { fetchMediaDetails, fetchMediaFeed, fetchProviders, fetchSeason, mediaLabel, posterUrl, recordMediaInteraction, searchMedia, setEpisodeWatched, setFamilyMediaState, setUserMediaState, syncMediaItem, type MediaProvider, yearLabel } from '../lib/media'

type Tab = 'swipe' | 'search' | 'mine' | 'family' | 'progress' | 'services'
type MyListTab = 'watchlist' | 'seen' | 'liked'
type MediaFilter = 'all' | 'movie' | 'tv'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'swipe', label: 'Discover' },
  { id: 'mine', label: 'Lists' },
  { id: 'family', label: 'Family' },
  { id: 'progress', label: 'TV' },
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
  const chosen = enabledIds.length ? flatrate.filter(provider => enabledIds.includes(provider.provider_id)) : flatrate
  return (chosen.length ? chosen : flatrate).slice(0, 4)
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
  const [myListTab, setMyListTab] = useState<MyListTab>('watchlist')
  const [myListFilter, setMyListFilter] = useState<MediaFilter>('all')
  const [expandedTrackerId, setExpandedTrackerId] = useState<string | null>(null)
  const [seasonCache, setSeasonCache] = useState<Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>>({})
  const [openSeasonKey, setOpenSeasonKey] = useState<string | null>(null)
  const household = useAppState(state => state.data.household[0] ?? null)
  const items = useAppState(state => state.data.mediaItems)
  const userStates = useAppState(state => state.data.mediaUserStates)
  const familyStates = useAppState(state => state.data.mediaFamilyStates)
  const progress = useAppState(state => state.data.mediaEpisodeProgress)
  const userId = useSessionState(state => state.user?.id ?? '')
  const selectedProviderIds = readProviderIds(household?.settings)
  const current = feed[feedIndex] ?? null
  const next = feed[feedIndex + 1] ?? null

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
  const trackerRows = myRows.filter(row => row.item.mediaType === 'tv' && ['watching', 'watched'].includes(row.state.status))

  useEffect(() => {
    loadFeed(1, true).catch(() => undefined)
    fetchProviders().then(payload => setProviders(payload.providers)).catch(() => undefined)
    return undefined
  }, [])

  useEffect(() => {
    if (feed.length - feedIndex > 8 || loadingFeed) return
    loadFeed(page + 1, false).catch(() => undefined)
  }, [feed.length, feedIndex, loadingFeed, page])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      return undefined
    }
    const timer = window.setTimeout(() => {
      setSearching(true)
      searchMedia(trimmed)
        .then(payload => setResults(payload.items))
        .catch(error => setError(error instanceof Error ? error.message : 'Search failed'))
        .finally(() => setSearching(false))
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
      setFeed(prev => replace ? payload.items : [...prev, ...payload.items])
      setPage(payload.page)
      if (replace) setFeedIndex(0)
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

  async function handleAction(item: MediaItem, action: keyof typeof actionMeta | 'skip', options: { advance?: boolean } = {}) {
    const shouldAdvance = options.advance ?? true
    const detailed = await refreshDetails(item)
    if (action === 'skip') {
      await recordMediaInteraction(detailed, 'skip')
      if (shouldAdvance) advance()
      return
    }
    if (detailed.mediaType === 'tv' && action.startsWith('watched')) {
      setTvSheetItem(detailed)
      setTvSheetAction(action)
      setTvSheetAdvanceOnChoose(shouldAdvance)
      return
    }
    await applyMediaAction(detailed, action)
    if (shouldAdvance) advance()
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
    const payload = await fetchSeason(item.tmdbId, seasonNumber)
    setSeasonCache(prev => ({ ...prev, [key]: payload }))
  }

  async function deleteUserState(row: MediaUserState) {
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
  }

  async function deleteFamilyState(row: MediaFamilyState) {
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
  }

  async function setSeasonWatched(item: MediaItem, episodes: MediaEpisode[], watched: boolean) {
    for (const episode of episodes) {
      await setEpisodeWatched(item, episode, watched)
    }
  }

  return (
    <div className="media-page min-h-dvh bg-[var(--media-bg)] text-[var(--media-ink)]">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="safe-top sticky top-0 z-20 border-b border-[var(--media-line)] bg-[color-mix(in_srgb,var(--media-bg)_88%,transparent)] px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--media-muted)]">HomeOS</p>
              <h1 className="mt-0.5 text-[28px] font-black text-[var(--media-ink)]">Media</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTab('search')}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${tab === 'search' ? 'border-[var(--media-yellow)] bg-[var(--media-yellow)] text-black' : 'border-[var(--media-line)] bg-[var(--media-panel)] text-[var(--media-muted)]'}`}
                aria-label="Search media"
              >
                <Search className="h-5 w-5" strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={() => setTab('services')}
                className={`flex h-10 w-10 items-center justify-center rounded-full border transition ${tab === 'services' ? 'border-[var(--media-yellow)] bg-[var(--media-yellow)] text-black' : 'border-[var(--media-line)] bg-[var(--media-panel)] text-[var(--media-muted)]'}`}
                aria-label="Media settings"
              >
                <Settings2 className="h-5 w-5" strokeWidth={1.9} />
              </button>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto rounded-full bg-[var(--media-panel-2)] p-1 no-scrollbar">
            {tabs.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTab(option.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-black transition ${
                  tab === option.id ? 'bg-[var(--media-yellow)] text-black shadow-sm' : 'text-[var(--media-muted)]'
                }`}
              >
                {option.label}
              </button>
            ))}
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
              onAction={(item, action) => {
                advance()
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
              selectedProviderIds={selectedProviderIds}
              onAction={async (item, action) => {
                await handleAction(item, action)
                setResults(prev => prev.filter(row => row.id !== item.id))
              }}
              onFamily={item => setFamilyMediaState(item, 'wishlist')}
            />
          ) : null}
          {tab === 'mine' ? (
            <MyListsView
              rows={myRows}
              activeTab={myListTab}
              activeFilter={myListFilter}
              setActiveTab={setMyListTab}
              setActiveFilter={setMyListFilter}
              selectedProviderIds={selectedProviderIds}
              onFamily={item => setFamilyMediaState(item, 'wishlist')}
              onStatus={(item, status, rating) => setUserMediaState(item, status, rating)}
              onDelete={deleteUserState}
              progress={progress}
              seasonCache={seasonCache}
              openSeasonKey={openSeasonKey}
              onLoadSeason={loadSeason}
              onEpisode={(item, episode, watched) => setEpisodeWatched(item, episode, watched)}
              onSeason={(item, episodes, watched) => setSeasonWatched(item, episodes, watched)}
            />
          ) : null}
          {tab === 'family' ? (
            <FamilyView rows={familyRows} selectedProviderIds={selectedProviderIds} onStatus={(item, status) => setFamilyMediaState(item, status)} onDelete={deleteFamilyState} />
          ) : null}
          {tab === 'progress' ? (
            <TrackerView
              rows={trackerRows}
              progress={progress}
              seasonCache={seasonCache}
              openSeasonKey={openSeasonKey}
              expandedId={expandedTrackerId}
              onExpand={setExpandedTrackerId}
              onLoadSeason={loadSeason}
              onEpisode={(item, episode, watched) => setEpisodeWatched(item, episode, watched)}
              onSeason={(item, episodes, watched) => setSeasonWatched(item, episodes, watched)}
              onDelete={deleteUserState}
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
          setTvSheetItem(null)
          setTvSheetAction(null)
          setTvSheetAdvanceOnChoose(true)
        }}
        onChoose={async mode => {
          if (!tvSheetItem || !tvSheetAction) return
          if (mode === 'all') await applyMediaAction(tvSheetItem, tvSheetAction, 'watched')
          if (mode === 'watching') await applyMediaAction(tvSheetItem, tvSheetAction, 'watching')
          if (mode === 'track') {
            await setUserMediaState(tvSheetItem, 'watching', actionMeta[tvSheetAction].rating)
            setTab('progress')
            setExpandedTrackerId(tvSheetItem.id)
          }
          setTvSheetItem(null)
          setTvSheetAction(null)
          if (tvSheetAdvanceOnChoose) advance()
          setTvSheetAdvanceOnChoose(true)
        }}
      />
    </div>
  )
}

function SwipeView({ item, nextItem, loading, selectedProviderIds, onAction, onRefresh }: {
  item: MediaItem | null
  nextItem: MediaItem | null
  loading: boolean
  selectedProviderIds: number[]
  onAction: (item: MediaItem, action: keyof typeof actionMeta | 'skip') => void
  onRefresh: () => void
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false, exiting: false, intent: null as SwipeIntent | null })
  const [incoming, setIncoming] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastTapRef = useRef(0)
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
        <button type="button" onClick={onRefresh} className="mt-4 rounded-full bg-[var(--media-yellow)] px-5 py-2.5 text-[14px] font-black text-black">Refresh feed</button>
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
      commitSwipe('watchlist')
      return
    }
    if (isTap) {
      lastTapRef.current = now
      resetSwipe()
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

  return (
    <section className="overflow-visible">
      <div
        className="relative mx-auto touch-none select-none overflow-visible px-9 py-8"
        style={{
          width: 'min(384px, 100vw)',
          height: 'min(506px, calc(100dvh - 218px - env(safe-area-inset-top) - env(safe-area-inset-bottom)))',
          minHeight: 372,
        }}
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
              inset: '32px 36px',
              zIndex: 1,
              transform: previewTransform,
              opacity: 0.58 + previewLift * 0.22,
              transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div
            className="pointer-events-none absolute inset-y-8 inset-x-9 rounded-[22px] border border-[var(--media-line)] bg-[var(--media-panel)] shadow-sm"
            style={{ transform: 'scale(0.965) translateY(10px)', opacity: 0.45 }}
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
            inset: '32px 36px',
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
            <span className="rounded-full bg-[var(--media-yellow)] px-2.5 py-1 text-black">{mediaLabel(item)}</span>
            <span className="rounded-full bg-white/18 px-2.5 py-1">{yearLabel(item)}</span>
            {item.voteAverageX10 ? <span className="rounded-full bg-white/18 px-2.5 py-1">{(item.voteAverageX10 / 10).toFixed(1)}</span> : null}
          </div>
          <h2 className="mt-2 line-clamp-2 text-[24px] font-black leading-[1.03]">{item.title}</h2>
        </div>
      </div>
      <div className="shrink-0 px-4 py-3">
        <MediaProviderPills providers={providers} emptyText="No streaming data" />
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
    <div className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      <div className="absolute left-1/2 top-1" style={{ transform: `translateX(-50%) scale(${pillScale('liked')})`, opacity: pillOpacity('liked') }}>
        <span className="block rounded-full bg-sage px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm">Like</span>
      </div>
      <div className="absolute bottom-1 left-1/2" style={{ transform: `translateX(-50%) scale(${pillScale('disliked')})`, opacity: pillOpacity('disliked') }}>
        <span className="block rounded-full bg-red px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-sm">Dislike</span>
      </div>
      <div className="absolute right-1 top-1/2" style={{ transform: `translateY(-50%) scale(${pillScale('watched')})`, opacity: pillOpacity('watched') }}>
        <span className="block rounded-full bg-accent px-2 py-1 text-[10px] font-black uppercase text-white shadow-sm [writing-mode:vertical-rl]">Watched</span>
      </div>
      <div className="absolute left-1 top-1/2" style={{ transform: `translateY(-50%) scale(${pillScale('not_watched')})`, opacity: pillOpacity('not_watched') }}>
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

function SearchView({ query, setQuery, searching, results, selectedProviderIds, onAction, onFamily }: {
  query: string
  setQuery: (value: string) => void
  searching: boolean
  results: MediaItem[]
  selectedProviderIds: number[]
  onAction: (item: MediaItem, action: keyof typeof actionMeta | 'skip') => void
  onFamily: (item: MediaItem) => void
}) {
  return (
    <section>
      <label className="flex items-center gap-2 rounded-full border border-[var(--media-line)] bg-[var(--media-panel)] px-4 py-3 shadow-sm">
        <Search className="h-5 w-5 text-[var(--media-faint)]" strokeWidth={1.9} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search films and TV" className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-[var(--media-ink)] outline-none placeholder:text-[var(--media-faint)]" />
      </label>
      <div className="mt-4 space-y-3">
        {searching ? <p className="px-1 text-[13px] font-semibold text-[var(--media-muted)]">Searching...</p> : null}
        {results.map(item => <CompactMediaRow key={item.id} item={item} selectedProviderIds={selectedProviderIds} onAction={onAction} onFamily={onFamily} />)}
      </div>
    </section>
  )
}

function CompactMediaRow({ item, selectedProviderIds, onAction, onFamily, trailing }: {
  item: MediaItem
  selectedProviderIds: number[]
  onAction?: (item: MediaItem, action: keyof typeof actionMeta | 'skip') => void
  onFamily?: (item: MediaItem) => void
  trailing?: ReactNode
}) {
  const providers = serviceProviders(item, selectedProviderIds)
  return (
    <article className="flex gap-3 rounded-[16px] border border-[var(--media-line)] bg-[var(--media-panel)] p-2.5 shadow-sm">
      <div className="relative h-[118px] w-[80px] shrink-0 overflow-hidden rounded-[10px] bg-[var(--media-panel-2)]">
        {item.posterPath ? <img src={posterUrl(item.posterPath, 'w185')} alt="" className="h-full w-full object-cover" loading="lazy" /> : (
          <div className="flex h-full w-full items-center justify-center text-[var(--media-faint)]"><Clapperboard className="h-9 w-9" strokeWidth={1.5} /></div>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--media-yellow)] px-1.5 py-0.5 text-[9px] font-black uppercase text-black">{item.mediaType === 'movie' ? 'Film' : 'TV'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-[16px] font-black leading-tight text-[var(--media-ink)]">{item.title}</h3>
            <p className="mt-1 text-[12px] font-bold text-[var(--media-muted)]">{yearLabel(item)}{item.voteAverageX10 ? `  ${String.fromCharCode(9733)} ${(item.voteAverageX10 / 10).toFixed(1)}` : ''}</p>
          </div>
          {trailing ?? (item.mediaType === 'tv' ? <Tv className="h-4 w-4 shrink-0 text-[var(--media-faint)]" strokeWidth={1.8} /> : <Clapperboard className="h-4 w-4 shrink-0 text-[var(--media-faint)]" strokeWidth={1.8} />)}
        </div>
        <div className="mt-2">
          <MediaProviderPills providers={providers} compact emptyText="No streaming data" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {onAction ? <button type="button" onClick={() => onAction(item, 'wishlist')} className="inline-flex items-center gap-1 rounded-full bg-[var(--media-yellow)] px-2.5 py-1.5 text-[11px] font-black text-black"><ListPlus className="h-3.5 w-3.5" strokeWidth={2.3} />List</button> : null}
          {onAction ? <button type="button" onClick={() => onAction(item, 'watched_liked')} className="inline-flex items-center gap-1 rounded-full bg-sage-bg px-2.5 py-1.5 text-[11px] font-black text-sage"><Heart className="h-3.5 w-3.5" strokeWidth={2.3} />Liked</button> : null}
          {onFamily ? <button type="button" onClick={() => onFamily(item)} className="inline-flex items-center gap-1 rounded-full border border-[var(--media-line)] bg-[var(--media-panel-2)] px-2.5 py-1.5 text-[11px] font-black text-[var(--media-muted)]"><Users className="h-3.5 w-3.5" strokeWidth={2.3} />Family</button> : null}
        </div>
      </div>
    </article>
  )
}

function SegmentedTabs({ value, options, onChange, compact = false }: {
  value: string
  options: Array<{ id: string; label: string }>
  onChange: (value: string) => void
  compact?: boolean
}) {
  return (
    <div className={`grid gap-1 rounded-full border border-[var(--media-line)] bg-[var(--media-panel-2)] p-1 ${compact ? 'grid-cols-3' : 'grid-cols-3'}`}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`rounded-full px-3 ${compact ? 'py-1.5 text-[12px]' : 'py-2 text-[13px]'} font-black transition ${
            value === option.id ? 'bg-[var(--media-yellow)] text-black shadow-sm' : 'text-[var(--media-muted)]'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function MyListsView({ rows, activeTab, activeFilter, setActiveTab, setActiveFilter, selectedProviderIds, onFamily, onStatus, onDelete, progress, seasonCache, openSeasonKey, onLoadSeason, onEpisode, onSeason }: {
  rows: Array<{ state: MediaUserState; item: MediaItem }>
  activeTab: MyListTab
  activeFilter: MediaFilter
  setActiveTab: (tab: MyListTab) => void
  setActiveFilter: (filter: MediaFilter) => void
  selectedProviderIds: number[]
  onFamily: (item: MediaItem) => void
  onStatus: (item: MediaItem, status: MediaUserStatus, rating?: 'liked' | 'neutral' | 'disliked' | null) => void
  onDelete: (row: MediaUserState) => void
  progress: Array<{ episodeId: string; watchedAt?: string | number | Date | null }>
  seasonCache: Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>
  openSeasonKey: string | null
  onLoadSeason: (item: MediaItem, seasonNumber: number) => void
  onEpisode: (item: MediaItem, episode: MediaEpisode, watched: boolean) => void
  onSeason: (item: MediaItem, episodes: MediaEpisode[], watched: boolean) => void
}) {
  const filtered = rows.filter(row => {
    if (activeFilter !== 'all' && row.item.mediaType !== activeFilter) return false
    if (activeTab === 'watchlist') return row.state.status === 'wishlist'
    if (activeTab === 'seen') return row.state.status === 'watched' || row.state.status === 'watching'
    return row.state.rating === 'liked'
  })

  return (
    <section className="space-y-4">
      <SegmentedTabs
        value={activeTab}
        options={[
          { id: 'watchlist', label: 'Watchlist' },
          { id: 'seen', label: 'Seen' },
          { id: 'liked', label: 'Liked' },
        ]}
        onChange={value => setActiveTab(value as MyListTab)}
      />
      <SegmentedTabs
        value={activeFilter}
        compact
        options={[
          { id: 'all', label: 'All' },
          { id: 'movie', label: 'Movies' },
          { id: 'tv', label: 'TV' },
        ]}
        onChange={value => setActiveFilter(value as MediaFilter)}
      />
      {!filtered.length ? <EmptyCard text="Nothing here yet." /> : (
        <div className="space-y-3">
          {filtered.map(row => (
            <SwipeRow key={row.state.id} onDelete={() => onDelete(row.state)} wrapClassName="rounded-[16px]">
              <div className="rounded-[16px] bg-[var(--media-bg)]">
                <CompactMediaRow
                  item={row.item}
                  selectedProviderIds={selectedProviderIds}
                  onFamily={onFamily}
                  trailing={activeTab === 'watchlist' ? (
                    <button type="button" onClick={() => onStatus(row.item, 'watched', 'neutral')} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]" aria-label="Mark watched">
                      <Check className="h-4.5 w-4.5" strokeWidth={2.2} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onStatus(row.item, row.state.status as MediaUserStatus, 'liked')} className={`flex h-9 w-9 items-center justify-center rounded-full border ${row.state.rating === 'liked' ? 'border-sage bg-sage-bg text-sage' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label="Like">
                        <ThumbsUp className="h-4 w-4" strokeWidth={2} />
                      </button>
                      <button type="button" onClick={() => onStatus(row.item, row.state.status as MediaUserStatus, 'disliked')} className={`flex h-9 w-9 items-center justify-center rounded-full border ${row.state.rating === 'disliked' ? 'border-red/30 bg-red/10 text-red' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-muted)]'}`} aria-label="Dislike">
                        <ThumbsDown className="h-4 w-4" strokeWidth={2} />
                      </button>
                    </div>
                  )}
                />
                {row.item.mediaType === 'tv' && (row.state.status === 'watched' || row.state.status === 'watching') ? (
                  <SeasonPanel
                    item={row.item}
                    progress={progress}
                    seasonCache={seasonCache}
                    openSeasonKey={openSeasonKey}
                    onLoadSeason={onLoadSeason}
                    onEpisode={onEpisode}
                    onSeason={onSeason}
                  />
                ) : null}
              </div>
            </SwipeRow>
          ))}
        </div>
      )}
    </section>
  )
}

function FamilyView({ rows, selectedProviderIds, onStatus, onDelete }: {
  rows: Array<{ state: MediaFamilyState; item: MediaItem }>
  selectedProviderIds: number[]
  onStatus: (item: MediaItem, status: 'wishlist' | 'watching' | 'watched' | 'not_interested') => void
  onDelete: (row: MediaFamilyState) => void
}) {
  if (!rows.length) return <EmptyCard text="Shared family picks will appear here." />
  return <div className="space-y-3">{rows.map(row => (
    <SwipeRow key={row.state.id} onDelete={() => onDelete(row.state)} wrapClassName="rounded-[16px]">
      <div className="rounded-[16px] bg-[var(--media-bg)]">
      <CompactMediaRow
        item={row.item}
        selectedProviderIds={selectedProviderIds}
        trailing={
          <button type="button" onClick={() => onStatus(row.item, row.state.status === 'watched' ? 'wishlist' : 'watched')} className="rounded-full border border-[var(--media-line)] bg-[var(--media-panel-2)] px-3 py-1.5 text-[12px] font-black text-[var(--media-ink)]">
            {row.state.status === 'watched' ? 'Watchlist' : 'Watched'}
          </button>
        }
      />
      <div className="mt-1 flex items-center justify-between px-2 text-[12px] font-bold text-[var(--media-muted)]">
        <span>{labelStatus(row.state.status)}</span>
      </div>
      </div>
    </SwipeRow>
  ))}</div>
}

function TrackerView({ rows, progress, seasonCache, openSeasonKey, expandedId, onExpand, onLoadSeason, onEpisode, onSeason, onDelete }: {
  rows: Array<{ state: MediaUserState; item: MediaItem }>
  progress: Array<{ episodeId: string; watchedAt?: string | number | Date | null }>
  seasonCache: Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>
  openSeasonKey: string | null
  expandedId: string | null
  onExpand: (id: string | null) => void
  onLoadSeason: (item: MediaItem, seasonNumber: number) => void
  onEpisode: (item: MediaItem, episode: MediaEpisode, watched: boolean) => void
  onSeason: (item: MediaItem, episodes: MediaEpisode[], watched: boolean) => void
  onDelete: (row: MediaUserState) => void
}) {
  if (!rows.length) return <EmptyCard text="TV tracking appears once a show is marked watched or watching." />
  return (
    <section className="space-y-3">
      {rows.map(row => (
        <SwipeRow key={row.state.id} onDelete={() => onDelete(row.state)} wrapClassName="rounded-[16px]">
          <div className="rounded-[16px] bg-[var(--media-bg)]">
            <button type="button" onClick={() => onExpand(expandedId === row.item.id ? null : row.item.id)} className="w-full text-left">
              <CompactMediaRow
                item={row.item}
                selectedProviderIds={[]}
                trailing={expandedId === row.item.id ? <ChevronDown className="h-5 w-5 text-[var(--media-muted)]" /> : <ChevronRight className="h-5 w-5 text-[var(--media-muted)]" />}
              />
            </button>
            {expandedId === row.item.id ? (
              <SeasonPanel
                item={row.item}
                progress={progress}
                seasonCache={seasonCache}
                openSeasonKey={openSeasonKey}
                onLoadSeason={onLoadSeason}
                onEpisode={onEpisode}
                onSeason={onSeason}
              />
            ) : null}
          </div>
        </SwipeRow>
      ))}
    </section>
  )
}

function SeasonPanel({ item, progress, seasonCache, openSeasonKey, onLoadSeason, onEpisode, onSeason }: {
  item: MediaItem
  progress: Array<{ episodeId: string; watchedAt?: string | number | Date | null }>
  seasonCache: Record<string, { season: MediaSeason; episodes: MediaEpisode[] }>
  openSeasonKey: string | null
  onLoadSeason: (item: MediaItem, seasonNumber: number) => void
  onEpisode: (item: MediaItem, episode: MediaEpisode, watched: boolean) => void
  onSeason: (item: MediaItem, episodes: MediaEpisode[], watched: boolean) => void
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
            const episodes = cached?.episodes ?? []
            const watchedCount = episodes.filter(episode => watched.has(episode.id)).length
            const allWatched = episodes.length > 0 && episodes.every(episode => watched.has(episode.id))
            return (
              <div key={key} className="overflow-hidden rounded-[14px] border border-[var(--media-line)] bg-[var(--media-panel)]">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => cached ? onSeason(item, episodes, !allWatched) : onLoadSeason(item, seasonNumber)} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${allWatched ? 'border-[var(--media-yellow)] bg-[var(--media-yellow)] text-black' : 'border-[var(--media-line)] bg-[var(--media-panel-2)] text-[var(--media-faint)]'}`} aria-label="Toggle season watched">
                    {allWatched ? <Check className="h-4 w-4" strokeWidth={3} /> : <Circle className="h-4 w-4" strokeWidth={1.8} />}
                  </button>
                  <button type="button" onClick={() => onLoadSeason(item, seasonNumber)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                    <span className="truncate text-[14px] font-black text-[var(--media-ink)]">{String(raw.name ?? `Season ${seasonNumber}`)}</span>
                    <span className="shrink-0 rounded-full bg-[var(--media-panel-2)] px-2 py-1 text-[11px] font-black text-[var(--media-muted)]">
                      {cached ? `${watchedCount}/${episodes.length}` : `${Number(raw.episodeCount ?? 0)} eps`}
                    </span>
                  </button>
                  {openSeasonKey === key ? <ChevronDown className="h-4 w-4 text-[var(--media-muted)]" /> : <ChevronRight className="h-4 w-4 text-[var(--media-muted)]" />}
                </div>
                {openSeasonKey === key ? (
                  <div className="border-t border-[var(--media-line)] px-2 py-2">
                    {!cached ? <p className="px-1 py-2 text-[13px] font-semibold text-[var(--media-muted)]">Loading episodes...</p> : cached.episodes.map(episode => (
                      <button key={episode.id} type="button" onClick={() => onEpisode(item, episode, !watched.has(episode.id))} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left active:bg-[var(--media-panel-2)]">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${watched.has(episode.id) ? 'border-[var(--media-yellow)] bg-[var(--media-yellow)] text-black' : 'border-[var(--media-line)] text-transparent'}`}><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
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
  const common = providers.filter(provider => ['Netflix', 'Disney Plus', 'Amazon Prime Video', 'Apple TV Plus', 'NOW', 'BBC iPlayer', 'ITVX', 'Channel 4', 'Paramount Plus'].includes(provider.provider_name))
  const list = common.length ? common : providers.slice(0, 30)
  return (
    <section>
      <div className="rounded-[16px] border border-[var(--media-line)] bg-[var(--media-panel)] p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--media-yellow)] text-black"><SlidersHorizontal className="h-4.5 w-4.5" strokeWidth={2.2} /></span>
          <h2 className="text-[18px] font-black text-[var(--media-ink)]">Streaming services</h2>
        </div>
        <p className="mt-2 text-[13px] leading-5 text-[var(--media-muted)]">Pick what the household has. Cards and lists prioritise matching availability when TMDB has UK data.</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {list.map(provider => {
          const selected = selectedIds.includes(provider.provider_id)
          return (
            <button key={provider.provider_id} type="button" onClick={() => onChange(selected ? selectedIds.filter(id => id !== provider.provider_id) : [...selectedIds, provider.provider_id])} className={`flex min-h-[62px] items-center gap-3 rounded-[14px] border px-3 text-left transition ${selected ? 'border-[var(--media-yellow)] bg-[var(--media-yellow-soft)] text-[var(--media-ink)]' : 'border-[var(--media-line)] bg-[var(--media-panel)] text-[var(--media-muted)]'}`}>
              {provider.logo_path ? <img src={posterUrl(provider.logo_path, 'w92')} alt="" className="h-8 w-8 rounded-[8px] object-cover" loading="lazy" /> : <Star className="h-5 w-5" />}
              <span className="text-[13px] font-bold leading-4">{provider.provider_name}</span>
              {selected ? <Check className="ml-auto h-4 w-4 shrink-0 text-[var(--media-ink)]" strokeWidth={2.5} /> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TvActionSheet({ item, action, onClose, onChoose }: { item: MediaItem | null; action: TvSheetAction; onClose: () => void; onChoose: (mode: 'all' | 'watching' | 'track') => void }) {
  if (!item || !action) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-black/45" onClick={onClose}>
      <div className="media-page mx-auto w-full max-w-lg rounded-t-[24px] border-t border-[var(--media-line)] bg-[var(--media-panel)] px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4" onClick={event => event.stopPropagation()}>
        <div className="mx-auto h-1.5 w-10 rounded-full bg-[var(--media-faint)]" />
        <h2 className="mt-5 text-[22px] font-black text-[var(--media-ink)]">{item.title}</h2>
        <p className="mt-1 text-[14px] text-[var(--media-muted)]">How much have you watched?</p>
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={() => onChoose('all')} className="flex items-center gap-3 rounded-[16px] bg-[var(--media-yellow)] px-4 py-4 text-left text-[15px] font-black text-black"><Eye className="h-5 w-5" strokeWidth={2.2} />Watched all episodes</button>
          <button type="button" onClick={() => onChoose('watching')} className="flex items-center gap-3 rounded-[16px] border border-[var(--media-line)] bg-[var(--media-bg)] px-4 py-4 text-left text-[15px] font-black text-[var(--media-ink)]"><Play className="h-5 w-5" strokeWidth={2.2} />Watching</button>
          <button type="button" onClick={() => onChoose('track')} className="flex items-center gap-3 rounded-[16px] border border-[var(--media-line)] bg-[var(--media-bg)] px-4 py-4 text-left text-[15px] font-black text-[var(--media-ink)]"><Tv className="h-5 w-5" strokeWidth={2.2} />Choose seasons and episodes</button>
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

function labelStatus(status: string) {
  return status === 'wishlist' ? 'Watchlist' : status === 'watching' ? 'Watching' : status === 'watched' ? 'Watched' : 'Not interested'
}
