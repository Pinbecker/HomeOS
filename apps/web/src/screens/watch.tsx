import { useEffect, useMemo, useRef, useState } from 'react'
import { SwipeRow } from '../components/swipe-row'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import { displayTvTitle, formatAirtime, formatDuration, formatGuideDate, normalizeTvFollowTitle, stableTvFollowId, tvFollowKey } from '../lib/tv-guide'
import { ScreenShell } from './shell'

const WATCH_CACHE_KEY = 'homeos:watch-cache:v4'
const LEGACY_WATCH_CACHE_KEYS = ['homeos:watch-cache:v2', 'homeos:watch-cache:v3']
const PX_PER_MIN = 1.5
const CHANNEL_COL = 72
const ROW_H = 64
const HEADER_H = 34

type FollowedShow = {
  id: string
  title: string
  metadata?: Record<string, unknown> | null
  updatedAt?: string | number | Date
}
type Programme = {
  id: string
  channelId: string
  title: string
  description: string | null
  startsAt: string | number | Date
  endsAt: string | number | Date
  iconUrl: string | null
  episodeNum: string | null
}
type ProgrammeView = Omit<Programme, 'startsAt' | 'endsAt'> & {
  startsAt: Date
  endsAt: Date
}
type ChannelNowNext = {
  feedId: string
  name: string
  logo: string | null
  now: Programme | null
  next: Programme | null
}
type ChannelView = {
  feedId: string
  name: string
  logo: string | null
  now: ProgrammeView | null
  next: ProgrammeView | null
}
type GridChannel = {
  feedId: string
  name: string
  logo: string | null
  programmes: Programme[]
}
type GridChannelView = {
  feedId: string
  name: string
  logo: string | null
  programmes: ProgrammeView[]
}
type WatchPayload = {
  channels: ChannelNowNext[]
  followedShows?: FollowedShow[]
  tonight: Programme[]
  initialGrid: GridChannel[]
  today: string
  coverage: GuideCoverage
}
type GuideDayCoverage = {
  date: string
  dayStartMs: number
  dayEndMs: number
  programmeCount: number
  channelCount: number
  channelTotal: number
  available: boolean
  complete: boolean
}
type GuideCoverage = {
  requiredDays: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  sourceUrl: string | null
  refreshing: boolean
  availableThrough: string | null
  days: GuideDayCoverage[]
}
type WatchCache = Omit<WatchPayload, 'initialGrid'> & {
  grids: Record<string, GridChannel[]>
  channelDays: Record<string, Programme[]>
  fetchedAt: number
}
type Tab = 'guide' | 'following'
type GuideView = 'grid' | 'now'

function toProgramme(programme: Programme | null): ProgrammeView | null {
  if (!programme) return null
  return {
    ...programme,
    startsAt: new Date(programme.startsAt),
    endsAt: new Date(programme.endsAt),
  }
}

function normalizeChannels(channels: ChannelNowNext[]): ChannelView[] {
  return channels.map(channel => ({
    ...channel,
    now: toProgramme(channel.now),
    next: toProgramme(channel.next),
  }))
}

function normalizeGrid(grid: GridChannel[]): GridChannelView[] {
  return grid.map(channel => ({
    ...channel,
    programmes: channel.programmes.map(programme => toProgramme(programme)).filter(Boolean) as ProgrammeView[],
  }))
}

function channelName(feedId: string) {
  const found = CHANNEL_NAMES.get(feedId)
  return found ?? feedId
}

function loadWatchCache(): WatchCache | null {
  if (typeof window === 'undefined') return null
  try {
    for (const key of LEGACY_WATCH_CACHE_KEYS) localStorage.removeItem(key)
    const raw = localStorage.getItem(WATCH_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as WatchCache
  } catch {
    return null
  }
}

function saveWatchCache(cache: WatchCache) {
  // Keep only today's grid on disk. Other days stay in memory for the current
  // session; persisting seven full grids exceeds mobile localStorage quotas.
  const todayGrid = cache.grids[cache.today]
  const persistentCache: WatchCache = {
    ...cache,
    grids: todayGrid ? { [cache.today]: todayGrid } : {},
    channelDays: {},
  }
  try {
    localStorage.setItem(WATCH_CACHE_KEY, JSON.stringify(persistentCache))
  } catch {
    // Cache writes must never turn a successful network refresh into a UI error.
    localStorage.removeItem(WATCH_CACHE_KEY)
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  return response.json() as Promise<T>
}

async function resolveWatchShow(title: string) {
  try {
    const payload = await fetchJson<{ show: { id: number; name: string } | null }>(`/api/watch/resolve?q=${encodeURIComponent(title)}`)
    return payload.show
  } catch {
    return null
  }
}

function TelevisionIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="M17 2l-5 5-5-5" />
    </svg>
  )
}

const CHANNEL_BRAND_COLOURS: Record<string, string> = {
  'BBC One': '#d41446',
  'BBC Two': '#087f78',
  ITV1: '#0067a7',
  'Channel 4': '#1d2228',
  'Channel 5': '#e51b3e',
  ITV2: '#d5007f',
  'BBC Three': '#de1684',
  'BBC Four': '#65408f',
  ITV3: '#8a6a3f',
  ITV4: '#00748d',
  E4: '#6c247a',
  More4: '#23864b',
  Film4: '#d71920',
  'Sky Mix': '#0756a5',
  '5USA': '#c51f5d',
  'U&Dave': '#007ea8',
}

function ChannelLogo({ logo, name, compact = false }: { logo: string | null; name: string; compact?: boolean }) {
  if (!logo) {
    return (
      <div className={`${compact ? 'h-7 w-10 rounded' : 'h-9 w-11 rounded-lg'} flex shrink-0 items-center justify-center bg-surface-2`}>
        <span className="text-[9px] font-extrabold uppercase tracking-tight text-text-2">{name.slice(0, 4)}</span>
      </div>
    )
  }

  return (
    <div
      className={`${compact ? 'h-7 w-10 rounded' : 'h-9 w-11 rounded-lg'} flex shrink-0 items-center justify-center overflow-hidden`}
      style={{ backgroundColor: CHANNEL_BRAND_COLOURS[name] ?? '#26313d' }}
    >
      <img src={logo} alt={name} loading="lazy" className="h-full w-full object-contain p-0.5" />
    </div>
  )
}

export function WatchPage() {
  const currentUser = useSessionState(state => state.user)
  const followedRows = useAppState(state => state.data.items
    .filter(item => item.type === 'watchlist_tv' && item.status === 'active' && !item.deletedAt)
    .sort((a, b) => a.title.localeCompare(b.title)) as FollowedShow[])
  const stateFollowed = useMemo(() => {
    const chosen = new Map<string, FollowedShow>()
    for (const show of followedRows) {
      const key = tvFollowKey(show)
      const existing = chosen.get(key)
      if (!existing || new Date(show.updatedAt ?? 0).getTime() > new Date(existing.updatedAt ?? 0).getTime()) chosen.set(key, show)
    }
    return [...chosen.values()].sort((a, b) => a.title.localeCompare(b.title))
  }, [followedRows])
  const householdId = useAppState(state => state.data.household[0]?.id ?? 'default')
  const [tab, setTab] = useState<Tab>('guide')
  const [guideView, setGuideView] = useState<GuideView>('now')
  const [cache, setCache] = useState<WatchCache | null>(() => loadWatchCache())
  const [loading, setLoading] = useState(!cache)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [followError, setFollowError] = useState<string | null>(null)
  const pendingFollowKeys = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    setLoading(!cache)
    setLoadError(null)
    fetchJson<WatchPayload>('/api/watch/initial')
      .then(payload => {
        if (cancelled) return
        const { initialGrid, ...payloadWithoutInitialGrid } = payload
        const next: WatchCache = {
          ...payloadWithoutInitialGrid,
          grids: {
            [payload.today]: initialGrid,
          },
          channelDays: cache?.channelDays ?? {},
          fetchedAt: Date.now(),
        }
        setCache(next)
        saveWatchCache(next)
      })
      .catch(error => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'The TV guide could not be refreshed')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const followedTitles = useMemo(() => new Set(stateFollowed.map(show => tvFollowKey(show))), [stateFollowed])
  const tabs = [
    { id: 'guide' as const, label: 'TV Guide' },
    { id: 'following' as const, label: `Following${stateFollowed.length > 0 ? ` (${stateFollowed.length})` : ''}` },
  ]

  async function toggleFollow(title: string, channel: string, posterUrl: string | null) {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    const followKey = normalizeTvFollowTitle(cleanTitle)
    if (!followKey || pendingFollowKeys.current.has(followKey)) return
    pendingFollowKeys.current.add(followKey)
    setFollowError(null)

    try {
      const matching = getCurrentState().data.items.filter(item => item.type === 'watchlist_tv' && tvFollowKey(item) === followKey)
      const active = matching.filter(item => !item.deletedAt)

      if (active.length > 0) {
        const now = new Date().toISOString()
        for (const item of active) {
          const payload = { ...item, deletedAt: now, updatedAt: now }
          await enqueueMutation({
            id: makeId('mutation'),
            name: 'watch.delete',
            entityType: 'item',
            entityId: item.id,
            operation: 'delete',
            payload: null,
          }, prev => ({
            ...prev,
            data: { ...prev.data, items: prev.data.items.map(row => row.id === item.id ? { ...row, ...payload } : row) },
          }))
        }
        return
      }

      const reusable = matching
        .filter(item => item.deletedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
      const id = reusable?.id ?? stableTvFollowId(householdId, followKey)
      const now = new Date().toISOString()
      const canonicalTitle = displayTvTitle(cleanTitle)
      const payload = {
        ...(reusable ?? {}),
        id,
        householdId,
        createdById: reusable?.createdById ?? currentUser?.id ?? 'system',
        type: 'watchlist_tv',
        title: canonicalTitle,
        status: 'active',
        metadata: {
          ...(reusable?.metadata ?? {}),
          metadataVersion: 2,
          followKey,
          canonicalTitle,
          showName: canonicalTitle,
          channel,
          channelMode: 'any_channel',
          posterUrl,
          following: true,
          matchMode: 'all_airings',
          tvmazeId: typeof reusable?.metadata?.tvmazeId === 'number' ? reusable.metadata.tvmazeId : null,
        },
        deletedAt: null,
        createdAt: reusable?.createdAt ?? now,
        updatedAt: now,
      }
      await enqueueMutation({
        id: makeId('mutation'),
        name: 'watch.upsert',
        entityType: 'item',
        entityId: id,
        operation: 'upsert',
        payload,
      }, prev => ({
        ...prev,
        data: {
          ...prev.data,
          items: prev.data.items.some(row => row.id === id)
            ? prev.data.items.map(row => row.id === id ? { ...row, ...payload } : row)
            : [...prev.data.items, payload],
        },
      }))

      const tvmazeShow = await resolveWatchShow(canonicalTitle)
      const current = getCurrentState().data.items.find(item => item.id === id && !item.deletedAt)
      if (!tvmazeShow || !current) return
      const enriched = {
        ...current,
        metadata: {
          ...(current.metadata ?? {}),
          canonicalTitle: tvmazeShow.name,
          showName: tvmazeShow.name,
          tvmazeId: tvmazeShow.id,
        },
        updatedAt: new Date().toISOString(),
      }
      await enqueueMutation({
        id: makeId('mutation'),
        name: 'watch.upsert',
        entityType: 'item',
        entityId: id,
        operation: 'upsert',
        payload: enriched,
      }, prev => ({
        ...prev,
        data: { ...prev.data, items: prev.data.items.map(row => row.id === id ? { ...row, ...enriched } : row) },
      }))
    } catch (error) {
      setFollowError(error instanceof Error ? error.message : 'Following did not save')
    } finally {
      pendingFollowKeys.current.delete(followKey)
    }
  }

  async function updateFollowSettings(show: FollowedShow, changes: Record<string, unknown>) {
    const current = getCurrentState().data.items.find(item => item.id === show.id && !item.deletedAt)
    if (!current) return
    const payload = {
      ...current,
      metadata: { ...(current.metadata ?? {}), ...changes, metadataVersion: 2, followKey: tvFollowKey(current) },
      updatedAt: new Date().toISOString(),
    }
    try {
      await enqueueMutation({
        id: makeId('mutation'),
        name: 'watch.upsert',
        entityType: 'item',
        entityId: current.id,
        operation: 'upsert',
        payload,
      }, prev => ({
        ...prev,
        data: { ...prev.data, items: prev.data.items.map(item => item.id === current.id ? { ...item, ...payload } : item) },
      }))
    } catch (error) {
      setFollowError(error instanceof Error ? error.message : 'Follow settings did not save')
    }
  }

  return (
    <ScreenShell title="Watch" showHeader={false}>
      <div className="mx-auto flex max-w-lg flex-col pb-4">
        <header className="family-specialty-header px-5 pt-3 pb-3">
          <h1 className="text-[22px] font-extrabold tracking-tight text-text-1">Watch</h1>
          <p className="mt-0.5 text-[13px] text-text-2">UK Freeview · now, tonight and next</p>
          {cache?.coverage.availableThrough ? <p className="mt-1 text-[10.5px] text-text-3">Listings through {new Date(cache.coverage.availableThrough).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: 'numeric', minute: '2-digit' })}</p> : null}
        </header>

        {followError ? <div className="mx-4 mb-3 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2 text-[12px] text-red-600">{followError}</div> : null}
        {loadError ? <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-[12px] text-amber-700"><span>{cache ? 'Showing saved listings; refresh failed.' : 'The TV guide could not be loaded.'}</span><button onClick={() => window.location.reload()} className="font-bold">Retry</button></div> : null}

        <div className="mb-4 flex gap-2 px-4">
          {tabs.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-xl py-2 text-[13px] font-semibold transition-colors ${tab === item.id ? 'bg-accent text-white' : 'border border-border bg-surface text-text-2'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'guide' ? (
          <>
            <div className="mb-2 flex items-center justify-end px-4">
              <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
                <button onClick={() => setGuideView('grid')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${guideView === 'grid' ? 'bg-accent text-white' : 'text-text-2'}`}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5"><rect x="1.5" y="2.5" width="13" height="4" rx="1" /><rect x="1.5" y="9.5" width="13" height="4" rx="1" /></svg>
                  Timeline
                </button>
                <button onClick={() => setGuideView('now')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${guideView === 'now' ? 'bg-accent text-white' : 'text-text-2'}`}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5"><path d="M3 4h10M3 8h10M3 12h10" /></svg>
                  On now
                </button>
              </div>
            </div>

            {guideView === 'grid' ? (
              <TvGrid cache={cache} setCache={setCache} followedTitles={followedTitles} onToggleFollow={toggleFollow} loading={loading} />
            ) : (
              <TvGuide channels={normalizeChannels(cache?.channels ?? [])} todayGrid={normalizeGrid(cache?.grids?.[cache?.today ?? ''] ?? [])} followedTitles={followedTitles} onToggleFollow={toggleFollow} loading={loading} />
            )}
          </>
        ) : (
          <FollowingList followedShows={stateFollowed} onUnfollow={title => toggleFollow(title, '', null)} onUpdateSettings={updateFollowSettings} />
        )}
      </div>
    </ScreenShell>
  )
}

function TvGrid({ cache, setCache, followedTitles, onToggleFollow, loading }: { cache: WatchCache | null; setCache: (value: WatchCache) => void; followedTitles: Set<string>; onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void; loading: boolean }) {
  const today = cache?.today ?? ''
  const days = cache?.coverage.days ?? []
  const [selected, setSelected] = useState(today)
  const [sheet, setSheet] = useState<{ programme: ProgrammeView; channel: string } | null>(null)
  const [loadingDay, setLoadingDay] = useState(false)
  const [dayError, setDayError] = useState<string | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelected(today) }, [today])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!cache || cache.grids[selected]) return
    let cancelled = false
    setLoadingDay(true)
    setDayError(null)
    fetchJson<GridChannel[]>(`/api/watch/grid/${selected}`)
      .then(grid => {
        if (cancelled) return
        const next = {
          ...cache,
          fetchedAt: Date.now(),
          grids: {
            ...(cache.grids[cache.today] ? { [cache.today]: cache.grids[cache.today] } : {}),
            [selected]: grid,
          },
        }
        setCache(next)
        saveWatchCache(next)
      })
      .catch(error => { if (!cancelled) setDayError(error instanceof Error ? error.message : 'Listings could not be loaded') })
      .finally(() => { if (!cancelled) setLoadingDay(false) })
    return () => { cancelled = true }
  }, [selected, cache, setCache])

  const channels = normalizeGrid(cache?.grids?.[selected] ?? [])
  const day = days.find(value => value.date === selected)
  const dayStartMs = day?.dayStartMs ?? 0
  const dayEndMs = day?.dayEndMs ?? dayStartMs + 24 * 60 * 60 * 1000
  const dayMinutes = Math.max(1, (dayEndMs - dayStartMs) / 60_000)
  const trackWidth = dayMinutes * PX_PER_MIN
  const isToday = selected === today
  const nowMin = (clock - dayStartMs) / 60_000
  const nowOffset = nowMin * PX_PER_MIN
  const rowsH = channels.length * ROW_H
  const hourCount = Math.ceil(dayMinutes / 60)

  function jumpToMinute(minute: number) {
    const element = scrollRef.current
    if (!element) return
    element.scrollTo({ left: Math.max(0, minute * PX_PER_MIN - 120), behavior: 'smooth' })
  }

  useEffect(() => {
    if (!scrollRef.current || !channels.length) return
    const initialMinute = isToday ? nowMin : 18 * 60
    scrollRef.current.scrollLeft = Math.max(0, initialMinute * PX_PER_MIN - 120)
  }, [channels.length, isToday, selected])

  return (
    <div className="px-4 pb-6">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3">
        {days.map(value => {
          const active = value.date === selected
          const label = formatGuideDate(value.date, today)
          return (
            <button
              key={value.date}
              onClick={() => setSelected(value.date)}
              disabled={!value.available}
              className={`relative shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors ${active ? 'bg-accent text-white' : 'border border-border bg-surface text-text-2'} disabled:opacity-35`}
            >
              {label.short}
              {value.available && !value.complete ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" /> : null}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-bold text-text-1">{selected ? formatGuideDate(selected, today).long : 'Guide'}</p>
          <p className="text-[10.5px] text-text-3">{day?.complete ? `${day.channelCount} channels` : day?.available ? `Partial listings · ${day.channelCount} channels` : 'Listings unavailable'}</p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => jumpToMinute(isToday ? nowMin : 18 * 60)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-2">{isToday ? 'Now' : '6pm'}</button>
          <button onClick={() => jumpToMinute(20 * 60)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-2">8pm</button>
        </div>
      </div>

      {cache?.coverage.lastError ? <div className="mb-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-[11px] leading-4 text-amber-700">Using the last valid guide. The latest source refresh was incomplete.</div> : null}
      {dayError ? <div className="mb-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-[11px] text-red-600">{dayError}</div> : null}

      <div ref={scrollRef} className="relative h-[64vh] overflow-auto overscroll-contain rounded-2xl border border-border bg-bg">
        <div className="relative" style={{ width: CHANNEL_COL + trackWidth }}>
          <div className="sticky top-0 z-30 flex" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-40 border-r border-b border-border bg-surface" style={{ width: CHANNEL_COL }} />
            <div className="relative border-b border-border bg-surface" style={{ width: trackWidth, height: HEADER_H }}>
              {Array.from({ length: hourCount }, (_, hour) => (
                <span key={hour} className="absolute top-0 border-l border-border/60 pl-1.5 text-[10.5px] font-bold leading-[34px] text-text-3" style={{ left: hour * 60 * PX_PER_MIN }}>
                  {formatAirtime(new Date(dayStartMs + hour * 60 * 60 * 1000))}
                </span>
              ))}
            </div>
          </div>

          {isToday && nowMin >= 0 && nowMin <= dayMinutes ? (
            <div className="pointer-events-none absolute z-[15] bg-accent" style={{ left: CHANNEL_COL + nowOffset, top: HEADER_H, height: rowsH, width: 2 }}>
              <span className="absolute -left-[14px] -top-4 rounded bg-accent px-1 py-0.5 text-[8px] font-bold text-white">NOW</span>
            </div>
          ) : null}

          {channels.map(channel => (
            <div
              key={channel.feedId}
              className="flex border-b border-border bg-surface"
              style={{ height: ROW_H }}
            >
              <div className="sticky left-0 z-20 flex flex-col items-center justify-center gap-1 border-r border-border bg-surface px-1" style={{ width: CHANNEL_COL }}>
                <ChannelLogo logo={channel.logo} name={channel.name} compact />
                <span className="line-clamp-1 text-center text-[8px] font-bold leading-none text-text-2">{channel.name}</span>
              </div>
              <div className="relative overflow-hidden bg-transparent" style={{ width: trackWidth, height: ROW_H }}>
                {channel.programmes.map(programme => {
                  const startMin = (programme.startsAt.getTime() - dayStartMs) / 60000
                  const endMin = (programme.endsAt.getTime() - dayStartMs) / 60000
                  const clippedStart = Math.max(0, startMin)
                  const clippedEnd = Math.min(dayMinutes, endMin)
                  const left = clippedStart * PX_PER_MIN
                  const width = Math.max(0, (clippedEnd - clippedStart) * PX_PER_MIN)
                  if (width <= 0) return null
                  const following = followedTitles.has(normalizeTvFollowTitle(programme.title))
                  const isPast = isToday && endMin <= nowMin
                  const isNow = isToday && startMin <= nowMin && endMin > nowMin
                  return (
                    <button
                      key={programme.id}
                      onClick={() => setSheet({ programme, channel: channel.name })}
                      className={`absolute inset-y-0 min-w-[1px] overflow-hidden border-r border-border px-1.5 py-1.5 text-left active:bg-bg ${following ? 'bg-sage/18' : isNow ? 'bg-accent/12' : 'bg-surface'} ${isPast ? 'opacity-45' : ''}`}
                      style={{ left, width }}
                      aria-label={`${programme.title}, ${formatAirtime(programme.startsAt)} to ${formatAirtime(programme.endsAt)}`}
                    >
                      {following ? <span className="absolute inset-y-0 left-0 w-[2px] bg-sage" /> : null}
                      {width >= 48 ? <p className="mb-1 text-[9px] leading-none text-text-3">{formatAirtime(programme.startsAt)}</p> : null}
                      {width >= 24 ? <p className="line-clamp-2 text-[11px] font-semibold leading-[1.15] text-text-1">{displayTvTitle(programme.title)}</p> : null}
                    </button>
                  )
                })}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px bg-border" />
              </div>
            </div>
          ))}

          {channels.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-text-3">
              {loading || loadingDay ? 'Loading listings…' : 'No listings are available for this day'}
            </div>
          ) : null}
        </div>
      </div>

      {loadingDay && channels.length > 0 ? <p className="mt-2 text-center text-[11px] text-text-3">Updating listings…</p> : null}

      {sheet ? (
        <ProgrammeSheet
          programme={sheet.programme}
          channelName={sheet.channel}
          isFollowing={followedTitles.has(normalizeTvFollowTitle(sheet.programme.title))}
          onToggleFollow={() => {
            onToggleFollow(sheet.programme.title, sheet.channel, sheet.programme.iconUrl)
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  )
}

function TvGuide({ channels, todayGrid, followedTitles, onToggleFollow, loading }: { channels: ChannelView[]; todayGrid: GridChannelView[]; followedTitles: Set<string>; onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void; loading: boolean }) {
  const [openChannel, setOpenChannel] = useState<ChannelView | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const liveChannels = todayGrid.length
    ? todayGrid.map(channel => ({
      feedId: channel.feedId,
      name: channel.name,
      logo: channel.logo,
      now: channel.programmes.find(programme => programme.startsAt.getTime() <= clock && programme.endsAt.getTime() > clock) ?? null,
      next: channel.programmes.find(programme => programme.startsAt.getTime() > clock) ?? null,
    }))
    : channels
  return (
    <>
      <div className="px-4 pb-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {liveChannels.map((channel, index) => {
            const followingNow = channel.now ? followedTitles.has(normalizeTvFollowTitle(channel.now.title)) : false
            const progress = channel.now
              ? Math.max(0, Math.min(100, ((clock - channel.now.startsAt.getTime()) / (channel.now.endsAt.getTime() - channel.now.startsAt.getTime())) * 100))
              : 0
            return (
              <button key={channel.feedId} onClick={() => setOpenChannel(channel)} className={`flex w-full items-center gap-3 px-3 py-3 text-left active:bg-bg ${index > 0 ? 'border-t border-border' : ''}`}>
                <ChannelLogo logo={channel.logo} name={channel.name} />
                <div className="w-[58px] shrink-0"><p className="text-[12px] font-bold leading-tight text-text-1">{channel.name}</p></div>
                <div className="min-w-0 flex-1">
                  {channel.now ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-accent/10 px-1 py-0.5 text-[8.5px] font-bold uppercase text-accent">Now</span>
                        <p className="truncate text-[13px] font-semibold text-text-1">{displayTvTitle(channel.now.title)}{followingNow ? <span className="ml-1.5 text-sage">●</span> : null}</p>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-accent/60" style={{ width: `${progress}%` }} /></div>
                      <p className="mt-1 truncate text-[10.5px] text-text-2">{channel.next ? `${formatAirtime(channel.next.startsAt)} · ${displayTvTitle(channel.next.title)}` : `Until ${formatAirtime(channel.now.endsAt)}`}</p>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-text-3">No listings</p>
                  )}
                </div>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
              </button>
            )
          })}
          {liveChannels.length === 0 ? <div className="px-4 py-10 text-center text-[13px] text-text-3">{loading ? 'Loading listings...' : 'No listings available'}</div> : null}
        </div>
      </div>
      {openChannel ? <ChannelDaySheet channel={openChannel} followedTitles={followedTitles} onToggleFollow={onToggleFollow} onClose={() => setOpenChannel(null)} /> : null}
    </>
  )
}

function FollowingList({ followedShows, onUnfollow, onUpdateSettings }: { followedShows: FollowedShow[]; onUnfollow: (title: string) => void; onUpdateSettings: (show: FollowedShow, changes: Record<string, unknown>) => void }) {
  const [upcoming, setUpcoming] = useState<ProgrammeView[]>([])
  const [loadingUpcoming, setLoadingUpcoming] = useState(false)
  const [upcomingError, setUpcomingError] = useState<string | null>(null)
  const followSignature = followedShows.map(show => `${show.id}:${String(show.metadata?.tvmazeId ?? '')}:${String(show.updatedAt ?? '')}`).join('|')

  useEffect(() => {
    if (!followedShows.length) {
      setUpcoming([])
      return
    }
    let cancelled = false
    setLoadingUpcoming(true)
    setUpcomingError(null)
    postJson<Programme[]>('/api/watch/upcoming', {
      follows: followedShows.map(show => ({
        title: show.title,
        followKey: tvFollowKey(show),
        channel: show.metadata?.channel,
        channelMode: show.metadata?.channelMode,
        tvmazeId: show.metadata?.tvmazeId,
      })),
    })
      .then(rows => {
        if (!cancelled) setUpcoming(rows.map(programme => toProgramme(programme)).filter(Boolean) as ProgrammeView[])
      })
      .catch(error => {
        if (!cancelled) setUpcomingError(error instanceof Error ? error.message : 'Upcoming listings could not be loaded')
      })
      .finally(() => { if (!cancelled) setLoadingUpcoming(false) })
    return () => { cancelled = true }
  }, [followSignature])

  if (followedShows.length === 0) {
    return (
      <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
        <p className="mb-1 text-[14px] font-semibold text-text-1">Not following any shows</p>
        <p className="text-[13px] text-text-2">Open a channel in the TV Guide and tap the heart to follow a show.</p>
      </div>
    )
  }
  const upcomingByTitle = new Map<string, ProgrammeView>()
  for (const programme of upcoming) {
    const key = normalizeTvFollowTitle(programme.title)
    if (!upcomingByTitle.has(key)) upcomingByTitle.set(key, programme)
  }
  return (
    <div className="px-4 pb-6">
      <div className="mb-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <p className="text-[12px] font-bold text-text-1">Next airings</p>
        <p className="mt-0.5 text-[11px] text-text-2">
          {loadingUpcoming ? 'Checking the guide…' : upcomingError ? 'Could not update next airings' : upcoming.length ? `${upcoming.length} matching airing${upcoming.length === 1 ? '' : 's'} in the available guide` : 'Nothing scheduled in the available guide'}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {followedShows.map((show, index) => {
          const meta = show.metadata ?? null
          const posterUrl = typeof meta?.posterUrl === 'string' ? meta.posterUrl : null
          const title = typeof meta?.canonicalTitle === 'string' ? meta.canonicalTitle : show.title
          const nextAiring = upcomingByTitle.get(tvFollowKey(show))
          return (
            <SwipeRow key={show.id} wrapClassName={index > 0 ? 'border-t border-border' : ''} onDelete={() => onUnfollow(show.title)} deleteLabel="Unfollow">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="flex h-[42px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                  {posterUrl ? <img src={posterUrl} alt={title} loading="lazy" className="h-full w-full object-cover" /> : <TelevisionIcon className="h-4 w-4 text-text-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-text-1">{title}</p>
                  <div className="mt-1 flex gap-1.5">
                    <button
                      onClick={() => onUpdateSettings(show, { matchMode: meta?.matchMode === 'all_airings' ? 'new_only' : 'all_airings' })}
                      className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-semibold text-text-2"
                    >
                      {meta?.matchMode === 'all_airings' ? 'All airings' : 'New episodes'}
                    </button>
                    <button
                      onClick={() => onUpdateSettings(show, { channelMode: meta?.channelMode === 'selected_channel' ? 'any_channel' : 'selected_channel' })}
                      className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[9.5px] font-semibold text-text-2"
                    >
                      {meta?.channelMode === 'selected_channel' ? String(meta.channel ?? 'This channel') : 'Any channel'}
                    </button>
                  </div>
                </div>
                {nextAiring ? (
                  <div className="shrink-0 text-right">
                    <p className="text-[10.5px] font-bold text-sage">{formatAirtime(nextAiring.startsAt)}</p>
                    <p className="max-w-[90px] truncate text-[9.5px] text-text-3">{nextAiring.startsAt.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short' })} · {channelName(nextAiring.channelId)}</p>
                  </div>
                ) : null}
              </div>
            </SwipeRow>
          )
        })}
      </div>
    </div>
  )
}

function ProgrammeSheet({ programme, channelName: name, isFollowing, onToggleFollow, onClose }: { programme: ProgrammeView; channelName: string; isFollowing: boolean; onToggleFollow: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-lg flex-col justify-end">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative overflow-hidden rounded-t-3xl bg-bg pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="relative h-40 bg-surface-2">
          {programme.iconUrl ? <img src={programme.iconUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><TelevisionIcon className="h-12 w-12 text-text-3" /></div>}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <button onClick={onClose} className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40">
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="px-5 pt-1 pb-2">
          <h2 className="mb-1 text-[20px] font-extrabold leading-tight text-text-1">{displayTvTitle(programme.title)}</h2>
          <p className="mb-1 text-[13px] text-text-2">{name} · {formatAirtime(programme.startsAt)}–{formatAirtime(programme.endsAt)} · {formatDuration(programme.startsAt, programme.endsAt)}</p>
          <p className="mb-3 text-[11px] text-text-3">{programme.startsAt.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' })}{programme.episodeNum ? ` · ${programme.episodeNum}` : ''}</p>
          {programme.description ? <p className="mb-5 line-clamp-5 text-[13.5px] leading-relaxed text-text-2">{programme.description}</p> : <div className="mb-5" />}
        </div>
        <div className="px-5">
          <button onClick={onToggleFollow} className={`w-full rounded-2xl py-3.5 text-[15px] font-bold transition-colors ${isFollowing ? 'border border-border bg-surface text-text-1 active:bg-surface-2' : 'bg-accent text-white active:opacity-90'}`}>
            {isFollowing ? 'Following ✓' : 'Follow this show'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ChannelDaySheet({ channel, followedTitles, onToggleFollow, onClose }: { channel: ChannelView; followedTitles: Set<string>; onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void; onClose: () => void }) {
  const [programmes, setProgrammes] = useState<ProgrammeView[] | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const nowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetchJson<Programme[]>(`/api/watch/channel/${encodeURIComponent(channel.feedId)}`)
      .then(data => { if (!cancelled) setProgrammes(data.map(programme => toProgramme(programme)).filter(Boolean) as ProgrammeView[]) })
      .catch(() => { if (!cancelled) setProgrammes([]) })
    return () => { cancelled = true }
  }, [channel.feedId])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (programmes && nowRef.current) nowRef.current.scrollIntoView({ block: 'center' })
  }, [programmes])

  return (
    <div className="fixed inset-0 z-[60] mx-auto flex max-w-lg flex-col justify-end">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[85vh] flex-col rounded-t-3xl bg-bg pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className="flex items-center gap-3 border-b border-border px-5 pt-4 pb-3">
          <ChannelLogo logo={channel.logo} name={channel.name} />
          <h2 className="flex-1 text-[18px] font-extrabold text-text-1">{channel.name}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-surface">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4 text-text-2"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-3 py-2">
          {programmes === null ? <div className="py-10 text-center text-[13px] text-text-3">Loading listings...</div> : null}
          {programmes?.length === 0 ? <div className="py-10 text-center text-[13px] text-text-3">No listings for today</div> : null}
          {programmes?.map(programme => {
            const isNow = programme.startsAt.getTime() <= now && programme.endsAt.getTime() > now
            const isPast = programme.endsAt.getTime() <= now
            const following = followedTitles.has(normalizeTvFollowTitle(programme.title))
            return (
              <div key={programme.id} ref={isNow ? nowRef : undefined} className={`flex items-start gap-3 rounded-xl px-2 py-2.5 ${isNow ? 'bg-accent/8' : ''}`}>
                <div className="w-[44px] shrink-0 pt-0.5">
                  <p className={`text-[12px] font-bold ${isNow ? 'text-accent' : isPast ? 'text-text-3' : 'text-text-1'}`}>{formatAirtime(programme.startsAt)}</p>
                  {isNow ? <p className="text-[9px] font-bold uppercase tracking-wide text-accent">Now</p> : null}
                </div>
                {programme.iconUrl ? <div className="mt-0.5 h-[26px] w-[40px] shrink-0 overflow-hidden rounded bg-surface-2"><img src={programme.iconUrl} alt="" loading="lazy" className="h-full w-full object-cover" /></div> : null}
                <div className={`min-w-0 flex-1 ${isPast ? 'opacity-55' : ''}`}>
                  <p className="text-[13.5px] font-semibold leading-snug text-text-1">{programme.title}{programme.episodeNum ? <span className="ml-1.5 text-[11px] font-normal text-text-3">{programme.episodeNum}</span> : null}</p>
                  {programme.description ? <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-text-2">{programme.description}</p> : null}
                </div>
                <button onClick={() => onToggleFollow(programme.title, channel.name, programme.iconUrl)} className="flex h-8 w-8 shrink-0 items-center justify-center" aria-label={following ? 'Unfollow' : 'Follow'}>
                  <svg viewBox="0 0 24 24" fill={following ? '#7C9C7C' : 'none'} stroke={following ? '#7C9C7C' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-[18px] w-[18px] ${following ? '' : 'text-text-3'}`}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const CHANNEL_NAMES = new Map([
  ['BBCOneSouthWest.uk', 'BBC One'],
  ['BBCOneSouth.uk', 'BBC One'],
  ['BBCOneLondonHD.uk', 'BBC One'],
  ['BBCTwoHD.uk', 'BBC Two'],
  ['ITV1WestCountry.uk', 'ITV1'],
  ['ITV1MeridianS.uk', 'ITV1'],
  ['ITV1London.uk', 'ITV1'],
  ['Channel4South.uk', 'Channel 4'],
  ['Channel4London.uk', 'Channel 4'],
  ['5.uk', 'Channel 5'],
  ['ITV2.uk', 'ITV2'],
  ['BBCThreeHD.uk', 'BBC Three'],
  ['BBCFourHD.uk', 'BBC Four'],
  ['ITV3.uk', 'ITV3'],
  ['ITV4.uk', 'ITV4'],
  ['E4.uk', 'E4'],
  ['More4.uk', 'More4'],
  ['Film4.uk', 'Film4'],
  ['SkyMix.uk', 'Sky Mix'],
  ['5USA.uk', '5USA'],
  ['UAndDave.uk', 'U&Dave'],
])
