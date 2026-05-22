'use client'

import { useState } from 'react'
import type { ChannelNowNext } from '@/lib/services/epg'
import { formatAirtime } from '@/lib/utils/freeview-channels'
import { ChannelDaySheet } from './channel-day-sheet'

interface Props {
  channels: ChannelNowNext[]
  followedTitles: Set<string>
  onToggleFollow: (title: string, channel: string, posterUrl: string | null) => void
}

function ChannelLogo({ logo, name }: { logo: string | null; name: string }) {
  if (logo) {
    return (
      <div className="w-9 h-9 rounded-lg bg-white overflow-hidden shrink-0 flex items-center justify-center border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={name} loading="lazy" className="object-contain w-8 h-8" />
      </div>
    )
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-surface-2 shrink-0 flex items-center justify-center">
      <span className="text-[11px] font-bold text-text-2">{name.slice(0, 3)}</span>
    </div>
  )
}

export function TvGuide({ channels, followedTitles, onToggleFollow }: Props) {
  const [openChannel, setOpenChannel] = useState<ChannelNowNext | null>(null)

  return (
    <>
      <div className="px-4 pb-6">
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {channels.map((ch, i) => {
            const isFollowingNow = ch.now ? followedTitles.has(ch.now.title.toLowerCase()) : false
            return (
              <button
                key={ch.feedId}
                onClick={() => setOpenChannel(ch)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 active:bg-bg text-left ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <ChannelLogo logo={ch.logo} name={ch.name} />
                <div className="w-[58px] shrink-0">
                  <p className="text-[12px] font-bold text-text-1 leading-tight">{ch.name}</p>
                </div>
                <div className="flex-1 min-w-0">
                  {ch.now ? (
                    <>
                      <p className="text-[13px] font-semibold text-text-1 truncate">
                        {ch.now.title}
                        {isFollowingNow && <span className="ml-1.5 text-sage">●</span>}
                      </p>
                      <p className="text-[11px] text-text-2 truncate">
                        Now · {ch.next ? `then ${ch.next.title}` : `until ${formatAirtime(ch.now.endsAt)}`}
                      </p>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-text-3">No listings</p>
                  )}
                </div>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
            )
          })}
        </div>
      </div>

      {openChannel && (
        <ChannelDaySheet
          channel={openChannel}
          followedTitles={followedTitles}
          onToggleFollow={onToggleFollow}
          onClose={() => setOpenChannel(null)}
        />
      )}
    </>
  )
}
