'use client'

import { useEffect, useState } from 'react'

interface Props {
  pending: number
  isSyncing: boolean
}

export function SyncBanner({ pending, isSyncing }: Props) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online',  on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Nothing to show
  if (online && !isSyncing && pending === 0) return null

  const offline    = !online
  const waitingMsg = `${pending} change${pending !== 1 ? 's' : ''} waiting to sync`

  return (
    <div className={`mx-4 mb-3 px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 transition-all ${
      offline ? 'bg-amber-bg' : 'bg-accent-bg'
    }`}>
      <div className={`w-2 h-2 rounded-full shrink-0 ${
        offline ? 'bg-amber' : isSyncing ? 'bg-accent animate-pulse' : 'bg-accent'
      }`} />
      <span className={`text-[13px] font-medium leading-snug ${offline ? 'text-amber' : 'text-accent'}`}>
        {offline && pending > 0
          ? `Offline — ${pending} change${pending !== 1 ? 's' : ''} will sync when connected`
          : offline
          ? 'Offline'
          : isSyncing
          ? 'Syncing changes…'
          : waitingMsg}
      </span>
    </div>
  )
}
