'use client'

import { useState, useTransition } from 'react'
import type { ChannelNowNext, Programme } from '@/lib/services/epg'
import { TvGuide } from '@/components/features/watch/tv-guide'
import { FollowingList } from '@/components/features/watch/following-list'
import { followShow, unfollowShow } from './actions'

type FollowedShow = {
  id: string
  title: string
  metadata: Record<string, unknown> | null
}

type Tab = 'guide' | 'following'

interface Props {
  channels: ChannelNowNext[]
  followedShows: FollowedShow[]
  tonight: Programme[]
}

export function WatchClient({ channels, followedShows: initialFollowed, tonight }: Props) {
  const [tab, setTab] = useState<Tab>('guide')
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
        <TvGuide
          channels={channels}
          followedTitles={followedTitles}
          onToggleFollow={toggleFollow}
        />
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
