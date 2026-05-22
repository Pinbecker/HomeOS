'use client'

import type { Programme } from '@/lib/services/epg'
import { formatAirtime, channelName } from '@/lib/utils/freeview-channels'
import { SwipeRow } from '@/components/ui/swipe-row'

type FollowedShow = {
  id: string
  title: string
  metadata: Record<string, unknown> | null
}

interface Props {
  followedShows: FollowedShow[]
  tonight: Programme[]
  onUnfollow: (title: string) => void
}

export function FollowingList({ followedShows, tonight, onUnfollow }: Props) {
  if (followedShows.length === 0) {
    return (
      <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
        <p className="text-[14px] font-semibold text-text-1 mb-1">Not following any shows</p>
        <p className="text-[13px] text-text-2">Open a channel in the TV Guide and tap the heart to follow a show.</p>
      </div>
    )
  }

  const tonightByTitle = new Map<string, Programme>()
  for (const p of tonight) {
    const key = p.title.toLowerCase()
    if (!tonightByTitle.has(key)) tonightByTitle.set(key, p)
  }

  return (
    <div className="px-4 pb-6">
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        {followedShows.map((show, i) => {
          const meta = show.metadata as Record<string, unknown> | null
          const posterUrl = meta?.posterUrl as string | null | undefined
          const channel = meta?.channel as string | undefined
          const onTonight = tonightByTitle.get(show.title.toLowerCase())

          return (
            <SwipeRow
              key={show.id}
              wrapClassName={i > 0 ? 'border-t border-border' : ''}
              onDelete={() => onUnfollow(show.title)}
              deleteLabel="Unfollow"
            >
              <div className="flex items-center gap-3 px-3 py-3">
                <div className="w-[28px] h-[42px] rounded-md overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center">
                  {posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={posterUrl} alt={show.title} loading="lazy" className="object-cover w-full h-full" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3">
                      <rect x="2" y="7" width="20" height="15" rx="2" />
                      <path d="M17 2l-5 5-5-5" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-text-1 truncate">{show.title}</p>
                  {channel && <p className="text-[11.5px] text-text-2">{channel}</p>}
                </div>
                {onTonight && (
                  <span className="shrink-0 text-[10.5px] font-bold text-sage bg-sage/15 px-2 py-0.5 rounded-lg">
                    {formatAirtime(onTonight.startsAt)} · {channelName(onTonight.channelId)}
                  </span>
                )}
              </div>
            </SwipeRow>
          )
        })}
      </div>
    </div>
  )
}
