'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer as ArrayBuffer
}

async function subscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const sub = existing ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  })
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
}

export function PushManager() {
  const [permission, setPermission] = useState<NotificationPermission | null>(null)

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return

    // Register service worker
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.error('[push] SW registration failed:', err)
    )

    setPermission(Notification.permission)

    if (Notification.permission === 'granted') {
      subscribe().catch(err => console.error('[push] subscribe failed:', err))
    }
  }, [])

  function requestPermission() {
    Notification.requestPermission().then(result => {
      setPermission(result)
      if (result === 'granted') {
        subscribe().catch(err => console.error('[push] subscribe failed:', err))
      }
    })
  }

  if (permission !== 'default') return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:w-80">
      <div className="bg-surface border border-border rounded-2xl px-4 py-3 shadow-lg flex items-center gap-3">
        <span className="text-[22px] shrink-0">🔔</span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-text-1">Enable notifications</p>
          <p className="text-[12px] text-text-2">Get reminders for bins, tasks and more</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={requestPermission}
            className="text-[13px] font-semibold text-accent active:opacity-60"
          >
            Allow
          </button>
          <button
            onClick={() => setPermission('denied')}
            className="text-[13px] text-text-3 active:opacity-60"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
