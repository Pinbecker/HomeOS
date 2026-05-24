'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ulid } from 'ulid'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SyncOp {
  opId: string                       // unique per op — used for deduplication
  url: string                        // /api/sync/shopping or /api/sync/tasks
  body: Record<string, unknown>      // JSON payload
  queuedAt: number                   // epoch ms — for debugging / ordering
}

// ── Persistence ───────────────────────────────────────────────────────────────
const QUEUE_KEY = 'homeos:sync-queue'

function loadQueue(): SyncOp[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}

function saveQueue(q: SyncOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useSyncQueue() {
  const [queue, setQueue] = useState<SyncOp[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const flushing = useRef(false)

  // Hydrate state from localStorage on mount
  useEffect(() => { setQueue(loadQueue()) }, [])

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return
    const ops = loadQueue()
    if (!ops.length) return

    flushing.current = true
    setIsSyncing(true)

    const remaining: SyncOp[] = []
    let networkError = false

    for (const op of ops) {
      if (networkError) { remaining.push(op); continue }
      try {
        const res = await fetch(op.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op.body),
        })
        // 5xx = server error → keep and retry later
        // 4xx = bad data or item already gone → discard (don't retry)
        // 2xx = success → discard
        if (res.status >= 500) remaining.push(op)
      } catch {
        // True network failure → stop here, keep everything from this op onward
        networkError = true
        remaining.push(op)
      }
    }

    saveQueue(remaining)
    setQueue(remaining)
    setIsSyncing(false)
    flushing.current = false

    // Notify views to refresh their server data after a successful full flush
    if (remaining.length === 0 && !networkError) {
      window.dispatchEvent(new CustomEvent('homeos:sync-complete'))
    }
  }, [])

  /** Add an op to the queue and immediately try to flush if online */
  const enqueue = useCallback((url: string, body: Record<string, unknown>) => {
    const op: SyncOp = { opId: ulid(), url, body, queuedAt: Date.now() }
    const next = [...loadQueue(), op]
    saveQueue(next)
    setQueue(next)
    if (navigator.onLine) flush()
  }, [flush])

  // Flush whenever connectivity is restored
  useEffect(() => {
    const onOnline = () => flush()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flush])

  // Flush on mount — replays any ops left over from a previous offline session
  useEffect(() => {
    if (navigator.onLine) flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { pending: queue.length, isSyncing, enqueue }
}
