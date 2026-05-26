import { useMemo, useRef, useState } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

type FollowedShow = {
  id: string
  title: string
  metadata?: Record<string, unknown> | null
}

function TelevisionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <path d="M17 2l-5 5-5-5" />
    </svg>
  )
}

export function WatchPage() {
  const followed = useAppState(state => state.data.items
    .filter(item => item.type === 'watchlist_tv' && item.status === 'active' && !item.deletedAt)
    .sort((a, b) => a.title.localeCompare(b.title)) as FollowedShow[])
  const users = useAppState(state => state.data.users)
  const [title, setTitle] = useState('')
  const [channel, setChannel] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const followedTitles = useMemo(() => new Set(followed.map(show => show.title.toLowerCase())), [followed])

  async function addShow() {
    const cleanTitle = title.trim()
    if (!cleanTitle) return
    if (followedTitles.has(cleanTitle.toLowerCase())) {
      setTitle('')
      setChannel('')
      return
    }

    const id = makeId('watch')
    const now = new Date().toISOString()
    const payload = {
      id,
      householdId: getCurrentState().data.household[0]?.id ?? 'default',
      createdById: users[0]?.id ?? 'system',
      type: 'watchlist_tv',
      title: cleanTitle,
      status: 'active',
      metadata: {
        showName: cleanTitle,
        channel: channel.trim() || null,
        posterUrl: null,
        following: true,
      },
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
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: [...prev.data.items, payload],
      },
    }))

    setTitle('')
    setChannel('')
    inputRef.current?.focus()
  }

  async function unfollow(show: FollowedShow) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'watch.delete',
      entityType: 'item',
      entityId: show.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.filter(item => item.id !== show.id),
      },
    }))
  }

  return (
    <ScreenShell title="Watch">
      <div className="px-4">
        <div className="mb-4 rounded-3xl bg-surface px-5 py-5">
          <p className="text-[24px] font-bold text-text-1">Following</p>
          <p className="mt-1 text-[14px] text-text-2">Shows you want to keep an eye on stay available offline on this device.</p>
        </div>

        <div className="mb-4 rounded-2xl bg-surface px-4 py-4">
          <div className="flex flex-col gap-3">
            <input
              ref={inputRef}
              value={title}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') void addShow() }}
              placeholder="Show title"
              className="h-11 rounded-xl border border-border bg-bg px-3 text-[15px] text-text-1 outline-none"
            />
            <div className="flex gap-2">
              <input
                value={channel}
                onChange={event => setChannel(event.target.value)}
                placeholder="Channel (optional)"
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 text-[15px] text-text-1 outline-none"
              />
              <button
                onClick={() => { void addShow() }}
                disabled={!title.trim()}
                className="rounded-xl bg-accent px-4 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                Follow
              </button>
            </div>
          </div>
        </div>

        {followed.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface px-5 py-8 text-center">
            <p className="mb-1 text-[14px] font-semibold text-text-1">Not following any shows</p>
            <p className="text-[13px] text-text-2">Add a show above to keep it on your list.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {followed.map((show, index) => {
              const meta = show.metadata ?? null
              const channelName = typeof meta?.channel === 'string' ? meta.channel : null
              const posterUrl = typeof meta?.posterUrl === 'string' ? meta.posterUrl : null
              return (
                <div key={show.id} className={`flex items-center gap-3 px-3 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <div className="flex h-[42px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2">
                    {posterUrl ? (
                      <img src={posterUrl} alt={show.title} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-text-3"><TelevisionIcon /></span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-text-1">{show.title}</p>
                    {channelName ? <p className="text-[11.5px] text-text-2">{channelName}</p> : null}
                  </div>
                  <button onClick={() => { void unfollow(show) }} className="text-[12px] font-semibold text-red active:opacity-60">
                    Unfollow
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </ScreenShell>
  )
}
