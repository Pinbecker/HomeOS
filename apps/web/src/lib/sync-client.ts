const CHECKPOINT_KEY = 'homeos:checkpoint'
const DEVICE_ID_KEY = 'homeos:device-id'
let activeUserId: string | null = null

export type SyncMutation = {
  id: string
  name: string
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload?: Record<string, unknown> | null
}

export function getCheckpoint() {
  const raw = localStorage.getItem(checkpointKey())
  return raw ? Number(raw) : 0
}

export function setCheckpoint(checkpoint: number) {
  localStorage.setItem(checkpointKey(), String(checkpoint))
}

export function setSyncUserContext(userId: string | null) {
  activeUserId = userId
}

function checkpointKey() {
  return activeUserId ? `${CHECKPOINT_KEY}:${activeUserId}` : CHECKPOINT_KEY
}

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing

  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `device-${Date.now()}`

  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

export async function bootstrap() {
  const response = await fetch('/api/bootstrap', {
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Bootstrap failed with ${response.status}`)
  }

  const payload = await response.json()
  setCheckpoint(payload.checkpoint ?? 0)
  return payload
}

export async function pull() {
  const response = await fetch(`/api/sync/pull?since=${getCheckpoint()}`, {
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Pull failed with ${response.status}`)
  }

  const payload = await response.json()
  setCheckpoint(payload.checkpoint ?? getCheckpoint())
  return payload
}

export async function push(mutations: SyncMutation[]) {
  const response = await fetch('/api/sync/push', {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mutations: mutations.map(mutation => ({
        ...mutation,
        deviceId: getDeviceId(),
      })),
    }),
  })

  if (!response.ok) {
    throw new Error(`Push failed with ${response.status}`)
  }

  return response.json()
}

export function openSyncStream(onChange: (version: number) => void) {
  const source = new EventSource('/api/sync/stream', { withCredentials: true })
  source.addEventListener('change', event => {
    const payload = JSON.parse((event as MessageEvent).data) as { version?: number }
    if (typeof payload.version === 'number') {
      onChange(payload.version)
    }
  })
  return source
}
