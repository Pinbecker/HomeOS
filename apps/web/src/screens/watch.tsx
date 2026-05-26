import { useEffect, useMemo, useRef, useState } from 'react'
import { SwipeRow } from '../components/swipe-row'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

const WATCH_CACHE_KEY = 'homeos:watch-cache:v1'
const PX_PER_MIN = 3
const CHANNEL_COL = 56
const ROW_H = 56
const HEADER_H = 28
const DAY_MIN = 1440
const TRACK_W = DAY_MIN * PX_PER_MIN
const MIN_BLOCK_W = 14

type FollowedShow = {
  id: string
  title: string
  metadata?: Record<string, unknown> | null
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
}
type WatchCache = WatchPayload & {
  grids: Record<string, GridChannel[]>
  channelDays: Record<string, Programme[]>
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

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dayLabel(date: Date, index: number) {
  if (index === 0) return 'Today'
  if (index === 1) return 'Tomorrow'
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
}

function hourLabel(hour: number) {
  const period = hour < 12 ? 'am' : 'pm'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}${period}`
}

function formatAirtime(value: string | number | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h12',
    timeZone: 'Europe/London',
  }).replace(':00', '').replace(' ', '')
}

function channelName(feedId: string) {
  const found = CHANNEL_NAMES.get(feedId)
  return found ?? feedId
}

function loadWatchCache(): WatchCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(WATCH_CACHE_KEY)
    return raw ? JSON.parse(raw) as WatchCache : null
  } catch {
    return null
  }
}

function saveWatchCache(cache: WatchCache) {
  localStorage.setItem(WATCH_CACHE_KEY, JSON.stringify(cache))
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error(`Request failed with ${response.status}`)
  return response.json() as Promise<T>
}

function TelevisionIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="M17 2l-5 5-5-5" />
    </svg>
  )
}

function ChannelLogo({ logo, name, compact = false }: { logo: string | null; name: string; compact?: boolean }) {
  if (logo) {
    return (
      <div className={`${compact ? 'h-7 w-7 rounded' : 'h-9 w-9 rounded-lg'} flex shrink-0 items-center justify-center overflow-hidden border border-border bg-white`}>
        <img src={logo} alt={name} loading="lazy" className={compact ? 'h-6 w-6 object-contain' : 'h-8 w-8 object-contain'} />
      </div>
    )
  }
  return (
    <div className={`${compact ? 'h-7 w-7 rounded' : 'h-9 w-9 rounded-lg'} flex shrink-0 items-center justify-center bg-surface-2`}>
      <span className="text-[10px] font-bold text-text-2">{name.slice(0, 3)}</span>
    </div>
  )
}

export function WatchPage() {
  const stateFollowed = useAppState(state => state.data.items
    .filter(item => item.type === 'watchlist_tv' && item.status === 'active' && !item.deletedAt)
    .sort((a, b) => a.title.localeCompare(b.title)) as FollowedShow[])
  const users = useAppState(state => state.data.users)
  const householdId = useAppState(state => state.data.household[0]?.id ?? 'default')
  const [tab, setTab] = useState<Tab>('guide')
  const [guideView, setGuideView] = useState<GuideView>('grid')
  const [cache, setCache] = useState<WatchCache | null>(() => loadWatchCache())
  const [loading, setLoading] = useState(!cache)

  useEffect(() => {
    let cancelled = false
    setLoading(!cache)
    fetchJson<WatchPayload>('/api/watch/initial')
      .then(payload => {
        if (cancelled) return
        const next: WatchCache = {
          ...payload,
          grids: {
            ...(cache?.grids ?? {}),
            [payload.today]: payload.initialGrid,
          },
          channelDays: cache?.channelDays ?? {},
        }
        setCache(next)
        saveWatchCache(next)
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const followedTitles = useMemo(() => new Set(stateFollowed.map(show => show.title.toLowerCase())), [stateFollowed])
  const tabs = [
    { id: 'guide' as const, label: 'TV Guide' },
    { id: 'following' as const, label: `Following${stateFollowed.length > 0 ? ` (${stateFollowed.length})` : ''}` },
  ]

  async function toggleFollow(title: string, channel: string, posterUrl: string | null) {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    const existing = getCurrentState().data.items.filter(item => item.type === 'watchlist_tv' && item.title.toLowerCase() === cleanTitle.toLowerCase() && !item.deletedAt)

    if (existing.length > 0) {
      const now = new Date().toISOString()
      for (const item of existing) {
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

    const id = makeId('watch')
    const now = new Date().toISOString()
    const payload = {
      id,
      householdId,
      createdById: users[0]?.id ?? 'system',
      type: 'watchlist_tv',
      title: cleanTitle,
      status: 'active',
      metadata: { showName: cleanTitle, channel, posterUrl, following: true },
      createdAt: now,
      updatedAt: now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'watch.upsert',
      entityType: 'item',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({ ...prev, data: { ...prev.data, items: [...prev.data.items, payload] } }))
  }

  return (
    <ScreenShell title="Watch" showHeader={false}>
      <div className="mx-auto flex max-w-lg flex-col pb-4">
        <header className="px-5 pt-5 pb-4">
          <h1 className="text-[22px] font-extrabold tracking-tight text-text-1">Watch</h1>
          <p className="mt-0.5 text-[13px] text-text-2">UK Freeview · what's on now</p>
        </header>

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
                  Grid
                </button>
                <button onClick={() => setGuideView('now')} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${guideView === 'now' ? 'bg-accent text-white' : 'text-text-2'}`}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5"><path d="M3 4h10M3 8h10M3 12h10" /></svg>
                  Now
                </button>
              </div>
            </div>

            {guideView === 'grid' ? (
              <TvGrid cache={cache} setCache={setCache} followedTitles={followedTitles} onToggleFollow={toggleFollow} loading={loading} />
            ) : (
              <TvGuide channels={normalizeChannels(cache?.channels ?? [])} followedTitles={followedTitles} onToggleFollow={toggleFollow} loading={loading} />
            )}
          </>
        ) : (
          <FollowingList followedShows={stateFollowed} tonight={(cache?.tonight ?? []).map(programme => toProgramme(programme)).filter(Boolean) as ProgrammeView[]} onUnfollow={title => toggleFollow(title, '', null)} />
        )}
      </div>
    </ScreenShell>
  )
}

function TvGrid({ cache, setCache, followedTitles, onToggleFollow, loading }: { cache: WatchCache | null; setCache: (value: WatchCache) => void; followedTitles: Set<string>; onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void; loading: boolean }) {
  const today = cache?.today ?? ymd(new Date())
  const days = useMemo(() => {
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base)
      date.setDate(base.getDate() + index)
      return date
    })
  }, [])
  const [selected, setSelected] = useState(today)
  const [sheet, setSheet] = useState<{ programme: ProgrammeView; channel: string } | null>(null)
  const [loadingDay, setLoadingDay] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setSelected(today) }, [today])

  useEffect(() => {
    if (!cache || cache.grids[selected]) return
    let cancelled = false
    setLoadingDay(true)
    fetchJson<GridChannel[]>(`/api/watch/grid/${selected}`)
      .then(grid => {
        if (cancelled) return
        const next = { ...cache, grids: { ...cache.grids, [selected]: grid } }
        setCache(next)
        saveWatchCache(next)
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoadingDay(false) })
    return () => { cancelled = true }
  }, [selected, cache, setCache])

  const channels = normalizeGrid(cache?.grids?.[selected] ?? [])
  const dayStart = useMemo(() => {
    const [year, month, day] = selected.split('-').map(Number)
    return new Date(year, month - 1, day)
  }, [selected])
  const isToday = selected === today
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowOffset = nowMin * PX_PER_MIN
  const rowsH = channels.length * ROW_H

  useEffect(() => {
    const element = scrollRef.current
    if (!element || !channels.length || !isToday) return
    element.scrollLeft = Math.max(0, nowMin * PX_PER_MIN - 60)
  }, [channels.length, isToday, nowMin])

  return (
    <div className="px-4 pb-6">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-3">
        {days.map((date, index) => {
          const key = ymd(date)
          const active = key === selected
          return (
            <button key={key} onClick={() => setSelected(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${active ? 'bg-accent text-white' : 'border border-border bg-surface text-text-2'}`}>
              {dayLabel(date, index)}
            </button>
          )
        })}
      </div>

      <div ref={scrollRef} className="relative h-[68vh] overflow-auto rounded-2xl border border-border bg-bg">
        <div className="relative" style={{ width: CHANNEL_COL + TRACK_W }}>
          <div className="sticky top-0 z-30 flex" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-40 border-r border-b border-border bg-surface" style={{ width: CHANNEL_COL }} />
            <div className="relative border-b border-border bg-surface" style={{ width: TRACK_W, height: HEADER_H }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="absolute top-0 pl-1 text-[10.5px] font-bold leading-[28px] text-text-3" style={{ left: hour * 60 * PX_PER_MIN }}>{hourLabel(hour)}</span>
              ))}
            </div>
          </div>

          {isToday ? <div className="absolute z-[15] bg-accent" style={{ left: CHANNEL_COL + nowOffset, top: HEADER_H, height: rowsH, width: 2 }} /> : null}

          {channels.map(channel => (
            <div key={channel.feedId} className="flex border-b border-border" style={{ height: ROW_H }}>
              <div className="sticky left-0 z-20 flex flex-col items-center justify-center gap-0.5 border-r border-border bg-surface px-1" style={{ width: CHANNEL_COL }}>
                <ChannelLogo logo={channel.logo} name={channel.name} compact />
                <span className="line-clamp-1 text-center text-[8.5px] font-bold leading-none text-text-2">{channel.name}</span>
              </div>
              <div className="relative bg-surface" style={{ width: TRACK_W, height: ROW_H }}>
                {channel.programmes.map(programme => {
                  const startMin = (programme.startsAt.getTime() - dayStart.getTime()) / 60000
                  const endMin = (programme.endsAt.getTime() - dayStart.getTime()) / 60000
                  const left = Math.max(0, startMin) * PX_PER_MIN
                  const right = Math.min(DAY_MIN, endMin) * PX_PER_MIN
                  const width = Math.max(right - left, MIN_BLOCK_W)
                  const following = followedTitles.has(programme.title.toLowerCase())
                  const isPast = isToday && endMin <= nowMin
                  const isNow = isToday && startMin <= nowMin && endMin > nowMin
                  return (
                    <button
                      key={programme.id}
                      onClick={() => setSheet({ programme, channel: channel.name })}
                      className={`absolute inset-y-0 overflow-hidden border-r border-b border-border px-1.5 py-1 text-left active:bg-bg ${following ? 'bg-sage/12' : isNow ? 'bg-accent/8' : 'bg-surface'} ${isPast ? 'opacity-45' : ''}`}
                      style={{ left, width }}
                    >
                      {following ? <span className="absolute inset-y-0 left-0 w-[2px] bg-sage" /> : null}
                      {width >= 50 ? <p className="mb-0.5 text-[9px] leading-none text-text-3">{formatAirtime(programme.startsAt)}</p> : null}
                      {width >= 26 ? <p className="line-clamp-2 text-[11px] font-semibold leading-[1.15] text-text-1">{programme.title}</p> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {channels.length === 0 ? (
            <div className="px-4 py-10 text-center text-[13px] text-text-3">
              {loading || loadingDay ? 'Loading listings...' : 'No listings for this day'}
            </div>
          ) : null}
        </div>
      </div>

      {loadingDay && channels.length > 0 ? <p className="mt-2 text-center text-[11px] text-text-3">Loading {selected}...</p> : null}

      {sheet ? (
        <ProgrammeSheet
          programme={sheet.programme}
          channelName={sheet.channel}
          isFollowing={followedTitles.has(sheet.programme.title.toLowerCase())}
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

function TvGuide({ channels, followedTitles, onToggleFollow, loading }: { channels: ChannelView[]; followedTitles: Set<string>; onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void; loading: boolean }) {
  const [openChannel, setOpenChannel] = useState<ChannelView | null>(null)
  return (
    <>
      <div className="px-4 pb-6">
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {channels.map((channel, index) => {
            const followingNow = channel.now ? followedTitles.has(channel.now.title.toLowerCase()) : false
            return (
              <button key={channel.feedId} onClick={() => setOpenChannel(channel)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-bg ${index > 0 ? 'border-t border-border' : ''}`}>
                <ChannelLogo logo={channel.logo} name={channel.name} />
                <div className="w-[58px] shrink-0"><p className="text-[12px] font-bold leading-tight text-text-1">{channel.name}</p></div>
                <div className="min-w-0 flex-1">
                  {channel.now ? (
                    <>
                      <p className="truncate text-[13px] font-semibold text-text-1">{channel.now.title}{followingNow ? <span className="ml-1.5 text-sage">●</span> : null}</p>
                      <p className="truncate text-[11px] text-text-2">Now · {channel.next ? `then ${channel.next.title}` : `until ${formatAirtime(channel.now.endsAt)}`}</p>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-text-3">No listings</p>
                  )}
                </div>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
              </button>
            )
          })}
          {channels.length === 0 ? <div className="px-4 py-10 text-center text-[13px] text-text-3">{loading ? 'Loading listings...' : 'No listings available'}</div> : null}
        </div>
      </div>
      {openChannel ? <ChannelDaySheet channel={openChannel} followedTitles={followedTitles} onToggleFollow={onToggleFollow} onClose={() => setOpenChannel(null)} /> : null}
    </>
  )
}

function FollowingList({ followedShows, tonight, onUnfollow }: { followedShows: FollowedShow[]; tonight: ProgrammeView[]; onUnfollow: (title: string) => void }) {
  if (followedShows.length === 0) {
    return (
      <div className="mx-4 rounded-2xl border border-border bg-surface px-5 py-8 text-center">
        <p className="mb-1 text-[14px] font-semibold text-text-1">Not following any shows</p>
        <p className="text-[13px] text-text-2">Open a channel in the TV Guide and tap the heart to follow a show.</p>
      </div>
    )
  }
  const tonightByTitle = new Map<string, ProgrammeView>()
  for (const programme of tonight) {
    const key = programme.title.toLowerCase()
    if (!tonightByTitle.has(key)) tonightByTitle.set(key, programme)
  }
  return (
    <div className="px-4 pb-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {followedShows.map((show, index) => {
          const meta = show.metadata ?? null
          const posterUrl = typeof meta?.posterUrl === 'string' ? meta.posterUrl : null
          const channel = typeof meta?.channel === 'string' ? meta.channel : null
          const onTonight = tonightByTitle.get(show.title.toLowerCase())
          return (
            <SwipeRow key={show.id} wrapClassName={index > 0 ? 'border-t border-border' : ''} onDelete={() => onUnfollow(show.title)} deleteLabel="Unfollow">
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="flex h-[42px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                  {posterUrl ? <img src={posterUrl} alt={show.title} loading="lazy" className="h-full w-full object-cover" /> : <TelevisionIcon className="h-4 w-4 text-text-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-text-1">{show.title}</p>
                  {channel ? <p className="text-[11.5px] text-text-2">{channel}</p> : null}
                </div>
                {onTonight ? <span className="shrink-0 rounded-lg bg-sage/15 px-2 py-0.5 text-[10.5px] font-bold text-sage">{formatAirtime(onTonight.startsAt)} · {channelName(onTonight.channelId)}</span> : null}
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
          <h2 className="mb-1 text-[20px] font-extrabold leading-tight text-text-1">{programme.title}</h2>
          <p className="mb-3 text-[13px] text-text-2">{name} · {formatAirtime(programme.startsAt)}-{formatAirtime(programme.endsAt)}{programme.episodeNum ? ` · ${programme.episodeNum}` : ''}</p>
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
  const nowRef = useRef<HTMLDivElement>(null)
  const now = Date.now()

  useEffect(() => {
    let cancelled = false
    fetchJson<Programme[]>(`/api/watch/channel/${encodeURIComponent(channel.feedId)}`)
      .then(data => { if (!cancelled) setProgrammes(data.map(programme => toProgramme(programme)).filter(Boolean) as ProgrammeView[]) })
      .catch(() => { if (!cancelled) setProgrammes([]) })
    return () => { cancelled = true }
  }, [channel.feedId])

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
            const following = followedTitles.has(programme.title.toLowerCase())
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
