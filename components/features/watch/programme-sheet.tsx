'use client'

import { formatAirtime } from '@/lib/utils/freeview-channels'

export type SheetProgramme = {
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date
  iconUrl: string | null
  episodeNum: string | null
}

interface Props {
  programme: SheetProgramme
  channelName: string
  isFollowing: boolean
  onToggleFollow: () => void
  onClose: () => void
}

export function ProgrammeSheet({ programme, channelName, isFollowing, onToggleFollow, onClose }: Props) {
  const { title, description, startsAt, endsAt, iconUrl, episodeNum } = programme

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end max-w-lg mx-auto">
      <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />

      <div className="relative bg-bg rounded-t-3xl overflow-hidden pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {/* Poster header */}
        <div className="relative h-40 bg-surface-2">
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12 text-text-3">
                <rect x="2" y="7" width="20" height="15" rx="2" />
                <path d="M17 2l-5 5-5-5" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 flex items-center justify-center"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" className="w-4 h-4">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="px-5 pt-1 pb-2">
          <h2 className="text-[20px] font-extrabold text-text-1 leading-tight mb-1">{title}</h2>
          <p className="text-[13px] text-text-2 mb-3">
            {channelName} · {formatAirtime(startsAt)}–{formatAirtime(endsAt)}
            {episodeNum ? ` · ${episodeNum}` : ''}
          </p>
          {description ? (
            <p className="text-[13.5px] text-text-2 leading-relaxed mb-5 line-clamp-5">{description}</p>
          ) : (
            <div className="mb-5" />
          )}
        </div>

        <div className="px-5">
          <button
            onClick={onToggleFollow}
            className={`w-full py-3.5 rounded-2xl text-[15px] font-bold transition-colors ${
              isFollowing
                ? 'bg-surface border border-border text-text-1 active:bg-surface-2'
                : 'bg-accent text-white active:opacity-90'
            }`}
          >
            {isFollowing ? 'Following ✓' : 'Follow this show'}
          </button>
        </div>
      </div>
    </div>
  )
}
