'use client'

import { useEffect, useRef, useState } from 'react'
import type { ChannelNowNext } from '@/lib/services/epg'
import { formatAirtime } from '@/lib/utils/freeview-channels'

type RawProgramme = {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  iconUrl: string | null
  episodeNum: string | null
}

interface Props {
  channel: ChannelNowNext
  followedTitles: Set<string>
  onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void
  onClose: () => void
}

export function ChannelDaySheet({ channel, followedTitles, onToggleFollow, onClose }: Props) {
  const [programmes, setProgrammes] = useState<RawProgramme[] | null>(null)
  const nowRef = useRef<HTMLDivElement>(null)
  const now = Date.now()

  useEffect(() => {
    fetch(`/api/watch/channel/${encodeURIComponent(channel.feedId)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: RawProgramme[]) => setProgrammes(data))
      .catch(() => setProgrammes([]))
  }, [channel.feedId])

  // Scroll the "now" programme into view once loaded
  useEffect(() => {
    if (programmes && nowRef.current) {
      nowRef.current.scrollIntoView({ block: 'center' })
    }
  }, [programmes])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end max-w-lg mx-auto">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />

      <div className="relative bg-bg rounded-t-3xl flex flex-col max-h-[85vh] pb-[calc(env(safe-area-inset-bottom)+8px)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-border">
          {channel.logo && (
            <div className="w-9 h-9 rounded-lg bg-white overflow-hidden shrink-0 flex items-center justify-center border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={channel.logo} alt={channel.name} loading="lazy" className="object-contain w-8 h-8" />
            </div>
          )}
          <h2 className="flex-1 text-[18px] font-extrabold text-text-1">{channel.name}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4 text-text-2">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto px-3 py-2">
          {programmes === null && (
            <div className="py-10 text-center text-[13px] text-text-3">Loading listings…</div>
          )}
          {programmes && programmes.length === 0 && (
            <div className="py-10 text-center text-[13px] text-text-3">No listings for today</div>
          )}
          {programmes?.map(p => {
            const start = new Date(p.startsAt)
            const end = new Date(p.endsAt)
            const isNow = start.getTime() <= now && end.getTime() > now
            const isPast = end.getTime() <= now
            const following = followedTitles.has(p.title.toLowerCase())
            return (
              <div
                key={p.id}
                ref={isNow ? nowRef : undefined}
                className={`flex items-start gap-3 px-2 py-2.5 rounded-xl ${isNow ? 'bg-accent/8' : ''}`}
              >
                {/* Time */}
                <div className="w-[44px] shrink-0 pt-0.5">
                  <p className={`text-[12px] font-bold ${isNow ? 'text-accent' : isPast ? 'text-text-3' : 'text-text-1'}`}>
                    {formatAirtime(start)}
                  </p>
                  {isNow && <p className="text-[9px] font-bold text-accent uppercase tracking-wide">Now</p>}
                </div>

                {/* Poster */}
                {p.iconUrl ? (
                  <div className="w-[40px] h-[26px] rounded overflow-hidden bg-surface-2 shrink-0 mt-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.iconUrl} alt="" loading="lazy" className="object-cover w-full h-full" />
                  </div>
                ) : null}

                {/* Info */}
                <div className={`flex-1 min-w-0 ${isPast ? 'opacity-55' : ''}`}>
                  <p className="text-[13.5px] font-semibold text-text-1 leading-snug">
                    {p.title}
                    {p.episodeNum && <span className="ml-1.5 text-[11px] font-normal text-text-3">{p.episodeNum}</span>}
                  </p>
                  {p.description && (
                    <p className="text-[11.5px] text-text-2 leading-snug line-clamp-2 mt-0.5">{p.description}</p>
                  )}
                </div>

                {/* Follow heart */}
                <button
                  onClick={() => onToggleFollow(p.title, channel.name, p.iconUrl)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center"
                  aria-label={following ? 'Unfollow' : 'Follow'}
                >
                  <svg viewBox="0 0 24 24" fill={following ? '#7C9C7C' : 'none'} stroke={following ? '#7C9C7C' : 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`w-[18px] h-[18px] ${following ? '' : 'text-text-3'}`}>
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
