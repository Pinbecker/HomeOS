'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GridChannel } from '@/lib/services/epg'
import { formatAirtime } from '@/lib/utils/freeview-channels'
import { ProgrammeSheet, type SheetProgramme } from './programme-sheet'

const PX_PER_MIN = 3
const CHANNEL_COL = 56
const ROW_H = 56
const HEADER_H = 28
const DAY_MIN = 1440
const TRACK_W = DAY_MIN * PX_PER_MIN
const MIN_BLOCK_W = 14

type GP = {
  id: string
  channelId: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  iconUrl: string | null
  episodeNum: string | null
}
type GC = { feedId: string; name: string; logo: string | null; programmes: GP[] }

interface Props {
  initialGrid: GridChannel[]
  today: string // YYYY-MM-DD
  followedTitles: Set<string>
  onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void
}

function normalize(raw: GridChannel[]): GC[] {
  return raw.map(c => ({
    feedId: c.feedId,
    name: c.name,
    logo: c.logo,
    programmes: c.programmes.map(p => ({
      ...p,
      startsAt: new Date(p.startsAt),
      endsAt: new Date(p.endsAt),
    })),
  }))
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayLabel(d: Date, idx: number): string {
  if (idx === 0) return 'Today'
  if (idx === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
}

function hourLabel(h: number): string {
  const period = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${period}`
}

export function TvGrid({ initialGrid, today, followedTitles, onToggleFollow }: Props) {
  const days = useMemo(() => {
    const base = new Date()
    base.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      return d
    })
  }, [])

  const [selected, setSelected] = useState(today)
  const [cache, setCache] = useState<Record<string, GC[]>>({ [today]: normalize(initialGrid) })
  const [loading, setLoading] = useState(false)
  const [sheet, setSheet] = useState<{ p: GP; channel: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const channels = cache[selected]
  const isToday = selected === today
  const dayStart = useMemo(() => {
    const [y, m, d] = selected.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selected])

  // Lazy-load a day on selection
  useEffect(() => {
    if (cache[selected]) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/watch/grid/${selected}`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: GridChannel[]) => {
        if (!cancelled) setCache(prev => ({ ...prev, [selected]: normalize(data) }))
      })
      .catch(() => { if (!cancelled) setCache(prev => ({ ...prev, [selected]: [] })) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selected, cache])

  // Auto-scroll so "now" is near the left when viewing today
  useEffect(() => {
    if (!isToday || !scrollRef.current) return
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    scrollRef.current.scrollLeft = Math.max(0, nowMin * PX_PER_MIN - 60)
  }, [isToday, channels])

  const nowMin = (() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })()
  const nowOffset = nowMin * PX_PER_MIN
  const rowsH = (channels?.length ?? 0) * ROW_H

  const selectedIsFollowing = sheet ? followedTitles.has(sheet.p.title.toLowerCase()) : false

  return (
    <div className="px-4 pb-6">
      {/* Date selector */}
      <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none">
        {days.map((d, i) => {
          const key = ymd(d)
          const active = key === selected
          return (
            <button
              key={key}
              onClick={() => setSelected(key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
                active ? 'bg-accent text-white' : 'bg-surface border border-border text-text-2'
              }`}
            >
              {dayLabel(d, i)}
            </button>
          )
        })}
      </div>

      <div
        ref={scrollRef}
        className="relative overflow-auto border border-border rounded-2xl bg-bg h-[68vh]"
      >
        <div className="relative" style={{ width: CHANNEL_COL + TRACK_W }}>
          {/* Header row */}
          <div className="flex sticky top-0 z-30" style={{ height: HEADER_H }}>
            <div className="sticky left-0 z-40 bg-surface border-b border-r border-border" style={{ width: CHANNEL_COL }} />
            <div className="relative bg-surface border-b border-border" style={{ width: TRACK_W, height: HEADER_H }}>
              {Array.from({ length: 24 }, (_, h) => (
                <span
                  key={h}
                  className="absolute top-0 text-[10.5px] font-bold text-text-3 leading-[28px] pl-1"
                  style={{ left: h * 60 * PX_PER_MIN }}
                >
                  {hourLabel(h)}
                </span>
              ))}
            </div>
          </div>

          {/* Now line */}
          {isToday && (
            <div
              className="absolute z-[15] bg-accent"
              style={{ left: CHANNEL_COL + nowOffset, top: HEADER_H, height: rowsH, width: 2 }}
            />
          )}

          {/* Channel rows */}
          {channels?.map(ch => (
            <div key={ch.feedId} className="flex border-b border-border" style={{ height: ROW_H }}>
              {/* Sticky channel cell */}
              <div
                className="sticky left-0 z-20 bg-surface border-r border-border flex flex-col items-center justify-center gap-0.5 px-1"
                style={{ width: CHANNEL_COL }}
              >
                {ch.logo ? (
                  <div className="w-7 h-7 rounded bg-white overflow-hidden flex items-center justify-center border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ch.logo} alt={ch.name} loading="lazy" className="object-contain w-6 h-6" />
                  </div>
                ) : null}
                <span className="text-[8.5px] font-bold text-text-2 leading-none text-center line-clamp-1">{ch.name}</span>
              </div>

              {/* Programme track */}
              <div className="relative bg-surface" style={{ width: TRACK_W, height: ROW_H }}>
                {ch.programmes.map(p => {
                  const startMin = (p.startsAt.getTime() - dayStart.getTime()) / 60000
                  const endMin = (p.endsAt.getTime() - dayStart.getTime()) / 60000
                  const left = Math.max(0, startMin) * PX_PER_MIN
                  const right = Math.min(DAY_MIN, endMin) * PX_PER_MIN
                  const width = Math.max(right - left, MIN_BLOCK_W)
                  const following = followedTitles.has(p.title.toLowerCase())
                  const isPast = isToday && endMin <= nowMin
                  const isNow = isToday && startMin <= nowMin && endMin > nowMin
                  const showTime = width >= 50
                  const showTitle = width >= 26
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSheet({ p, channel: ch.name })}
                      className={`absolute inset-y-0 border-r border-b border-border text-left overflow-hidden px-1.5 py-1 active:bg-bg ${
                        following ? 'bg-sage/12' : isNow ? 'bg-accent/8' : 'bg-surface'
                      } ${isPast ? 'opacity-45' : ''}`}
                      style={{ left, width }}
                    >
                      {following && <span className="absolute left-0 inset-y-0 w-[2px] bg-sage" />}
                      {showTime && <p className="text-[9px] text-text-3 leading-none mb-0.5">{formatAirtime(p.startsAt)}</p>}
                      {showTitle && <p className="text-[11px] font-semibold text-text-1 leading-[1.15] line-clamp-2">{p.title}</p>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {(!channels || channels.length === 0) && (
            <div className="px-4 py-10 text-center text-[13px] text-text-3">
              {loading ? 'Loading listings…' : 'No listings for this day'}
            </div>
          )}
        </div>
      </div>

      {loading && channels && channels.length > 0 && (
        <p className="text-[11px] text-text-3 mt-2 text-center">Loading {selected}…</p>
      )}

      {sheet && (
        <ProgrammeSheet
          programme={sheet.p as SheetProgramme}
          channelName={sheet.channel}
          isFollowing={selectedIsFollowing}
          onToggleFollow={() => {
            onToggleFollow(sheet.p.title, sheet.channel, sheet.p.iconUrl)
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
