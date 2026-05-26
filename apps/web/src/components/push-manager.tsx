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
  const config = await fetch('/api/push/config', { credentials: 'include', cache: 'no-store' }).then(response => response.ok ? response.json() as Promise<{ publicKey?: string }> : null)
  if (!config?.publicKey) return

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(config.publicKey),
  })

  await fetch('/api/push/subscribe', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  })
}

export function PushManager({ enabled }: { enabled: boolean }) {
  const [permission, setPermission] = useState<NotificationPermission | null>(null)

  useEffect(() => {
    if (!enabled || !('Notification' in window) || !('serviceWorker' in navigator)) return
    setPermission(Notification.permission)
    if (Notification.permission === 'granted') {
      subscribe().catch(error => console.error('[push] subscribe failed', error))
    }
  }, [enabled])

  function requestPermission() {
    Notification.requestPermission().then(result => {
      setPermission(result)
      if (result === 'granted') subscribe().catch(error => console.error('[push] subscribe failed', error))
    })
  }

  if (!enabled || permission !== 'default') return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[70] md:left-auto md:right-6 md:w-80">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
        <span className="shrink-0 text-[22px]">🔔</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-1">Enable notifications</p>
          <p className="text-[12px] text-text-2">Get reminders for bins, tasks and more</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={requestPermission} className="text-[13px] font-semibold text-accent active:opacity-60">Allow</button>
          <button onClick={() => setPermission('denied')} className="text-[13px] text-text-3 active:opacity-60">Not now</button>
        </div>
      </div>
    </div>
  )
}
