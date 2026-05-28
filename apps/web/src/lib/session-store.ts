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

let state: SessionState = loadSessionState()

let inFlight: Promise<void> | null = null

function emit() {
  listeners.forEach(listener => listener())
}

function loadSessionState(): SessionState {
  if (typeof window === 'undefined') {
    return { status: 'loading', user: null }
  }

  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return { status: 'loading', user: null }
    const parsed = JSON.parse(raw) as SessionState
    return parsed.status === 'authenticated' ? parsed : { status: 'loading', user: null }
  } catch {
    return { status: 'loading', user: null }
  }
}

function setState(next: SessionState) {
  state = next
  if (typeof window !== 'undefined') {
    if (next.status === 'authenticated') {
      localStorage.setItem(SESSION_KEY, JSON.stringify(next))
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
      setState(state.status === 'authenticated'
        ? state
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
