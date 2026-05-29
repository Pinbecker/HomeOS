import { useSyncExternalStore } from 'react'

type SessionUser = {
  id: string
  name: string
  email?: string | null
}

type SessionState = {
  status: 'loading' | 'authenticated' | 'anonymous'
  user: SessionUser | null
}

const listeners = new Set<() => void>()
const SESSION_KEY = 'homeos:session-state'
const SESSION_BACKUP_KEY = 'homeos:session-state:last-authenticated'
const APP_STATE_KEY = 'homeos:app-state'
const APP_STATE_LITE_KEY = 'homeos:app-state-lite'
const APP_STATE_PREFIX = 'homeos:app-state:'
const APP_STATE_LITE_PREFIX = 'homeos:app-state-lite:'

let state: SessionState = loadSessionState()

let inFlight: Promise<void> | null = null

function emit() {
  listeners.forEach(listener => listener())
}

function loadSessionState(): SessionState {
  if (typeof window === 'undefined') {
    return { status: 'loading', user: null }
  }

  const current = loadStoredSession(SESSION_KEY)
  if (current) return current

  const offline = loadOfflineSessionState()
  return offline.status === 'authenticated' ? offline : { status: 'loading', user: null }
}

function loadOfflineSessionState(): SessionState {
  if (typeof window === 'undefined') return { status: 'loading', user: null }

  const backup = loadStoredSession(SESSION_BACKUP_KEY)
  if (backup) return backup

  const primary = loadSessionFromAppStateKey(APP_STATE_KEY)
  if (primary) return primary

  const lite = loadSessionFromAppStateKey(APP_STATE_LITE_KEY)
  if (lite) return lite

  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      const session = key ? loadSessionFromAppStateKey(key) : null
      if (session) return session
    }
  } catch {
    return { status: 'loading', user: null }
  }

  return { status: 'loading', user: null }
}

function loadStoredSession(key: string): SessionState | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionState
    return parsed.status === 'authenticated' && parsed.user?.id ? parsed : null
  } catch {
    return null
  }
}

function loadSessionFromAppStateKey(key: string): SessionState | null {
  const prefix = key.startsWith(APP_STATE_PREFIX)
    ? APP_STATE_PREFIX
    : key.startsWith(APP_STATE_LITE_PREFIX)
      ? APP_STATE_LITE_PREFIX
      : null
  const userId = prefix ? key.slice(prefix.length) : null
  if (prefix && !userId) return null

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { data?: { users?: SessionUser[] } }
    const cachedUser = userId
      ? parsed.data?.users?.find(user => user.id === userId) ?? parsed.data?.users?.[0]
      : parsed.data?.users?.[0]
    const fallbackUserId = cachedUser?.id ?? userId
    if (!fallbackUserId) return null
    return {
      status: 'authenticated',
      user: cachedUser?.id ? cachedUser : { id: fallbackUserId, name: 'Offline user', email: null },
    }
  } catch {
    return null
  }
}

function setState(next: SessionState) {
  state = next
  if (typeof window !== 'undefined') {
    if (next.status === 'authenticated') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
      localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(next))
    } else if (next.status === 'anonymous') {
      localStorage.removeItem(SESSION_KEY)
    }
  }
  emit()
}

export async function ensureSession() {
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const response = await fetch('/api/me', {
        credentials: 'include',
        cache: 'no-store',
      })

      if (response.status === 401) {
        setState({
          status: 'anonymous',
          user: null,
        })
        return
      }

      if (!response.ok) {
        throw new Error(`Session failed with ${response.status}`)
      }

      const payload = await response.json() as {
        user?: SessionUser
      }

      setState({
        status: 'authenticated',
        user: payload.user ?? null,
      })
    } catch {
      const offlineState = state.status === 'authenticated' ? state : loadOfflineSessionState()
      setState(offlineState.status === 'authenticated'
        ? offlineState
        : { status: 'anonymous', user: null })
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export function resetSession() {
  setState({
    status: 'loading',
    user: null,
  })
}

export function useSessionState<T>(selector: (value: SessionState) => T) {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

export function getSessionState() {
  return state
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
