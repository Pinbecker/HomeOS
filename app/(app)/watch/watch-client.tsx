'use client'

import { useState, useTransition } from 'react'
import type { ChannelNowNext, Programme, GridChannel } from '@/lib/services/epg'
import { TvGuide } from '@/components/features/watch/tv-guide'
import { TvGrid } from '@/components/features/watch/tv-grid'
import { FollowingList } from '@/components/features/watch/following-list'
import { followShow, unfollowShow } from './actions'

type FollowedShow = {
  id: string
  title: string
  metadata: Record<string, unknown> | null
}

type Tab = 'guide' | 'following'
type GuideView = 'grid' | 'now'

interface Props {
  channels: ChannelNowNext[]
  followedShows: FollowedShow[]
  tonight: Programme[]
  initialGrid: GridChannel[]
  today: string
  focus?: { channelId: string; atMs: number } | null
}

export function WatchClient({ channels, followedShows: initialFollowed, tonight, initialGrid, today, focus }: Props) {
  const [tab, setTab] = useState<Tab>('guide')
  const [guideView, setGuideView] = useState<GuideView>('grid')
  const [followed, setFollowed] = useState(initialFollowed)
  const [, startTransition] = useTransition()

  const followedTitles = new Set(followed.map(s => s.title.toLowerCase()))

  function toggleFollow(title: string, channel: string, posterUrl: string | null) {
    const key = title.toLowerCase()
    if (followedTitles.has(key)) {
      setFollowed(prev => prev.filter(s => s.title.toLowerCase() !== key))
      startTransition(() => { unfollowShow(title) })
    } else {
      const optimistic: FollowedShow = {
        id: `optimistic-${key}`,
        title,
        metadata: { showName: title, channel, posterUrl, following: true },
      }
      setFollowed(prev => [...prev, optimistic])
      startTransition(() => { followShow(title, channel, posterUrl) })
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'guide', label: 'TV Guide' },
    { id: 'following', label: `Following${followed.length > 0 ? ` (${followed.length})` : ''}` },
  ]

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-extrabold text-text-1 tracking-tight">Watch</h1>
        <p className="text-[13px] text-text-2 mt-0.5">UK Freeview · what&apos;s on now</p>
      </header>

      <div className="flex gap-2 px-4 mb-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-colors ${
              tab === t.id ? 'bg-accent text-white' : 'bg-surface border border-border text-text-2'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'guide' && (
        <>
          {/* Grid / Now view toggle */}
          <div className="flex items-center justify-end px-4 mb-2">
            <div className="inline-flex bg-surface border border-border rounded-lg p-0.5">
              <button
                onClick={() => setGuideView('grid')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                  guideView === 'grid' ? 'bg-accent text-white' : 'text-text-2'
                }`}
                aria-label="Grid view"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                  <rect x="1.5" y="2.5" width="13" height="4" rx="1" />
                  <rect x="1.5" y="9.5" width="13" height="4" rx="1" />
                </svg>
                Grid
              </button>
              <button
                onClick={() => setGuideView('now')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                  guideView === 'now' ? 'bg-accent text-white' : 'text-text-2'
                }`}
                aria-label="Now view"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-3.5 h-3.5">
                  <path d="M3 4h10M3 8h10M3 12h10" />
                </svg>
                Now
              </button>
            </div>
          </div>

          {guideView === 'grid' ? (
            <TvGrid
              initialGrid={initialGrid}
              today={today}
              focus={focus}
              followedTitles={followedTitles}
              onToggleFollow={toggleFollow}
            />
          ) : (
            <TvGuide
              channels={channels}
              followedTitles={followedTitles}
              onToggleFollow={toggleFollow}
            />
          )}
        </>
      )}
      {tab === 'following' && (
        <FollowingList
          followedShows={followed}
          tonight={tonight}
          onUnfollow={title => toggleFollow(title, '', null)}
        />
      )}
    </div>
  )
}
