import { useRef, useSyncExternalStore } from 'react'
import { bootstrap, openSyncStream, pull, push, type SyncMutation } from './sync-client'

type User = { id: string; name: string; email?: string | null }
type Household = {
  id: string
  name: string
  settings?: Record<string, unknown> | null
}
type HouseholdMember = { householdId: string; userId: string; role: string }
type List = {
  id: string
  householdId: string
  name: string
  type: string
  icon?: string | null
  color?: string | null
  archived: boolean
  sortOrder: number
  createdAt: string | number | Date
  updatedAt: string | number | Date
}
type Item = {
  id: string
  householdId: string
  createdById: string
  assigneeId?: string | null
  type: string
  title: string
  body?: string | null
  status: string
  priority?: string | null
  listId?: string | null
  dueDate?: string | number | Date | null
  completedAt?: string | number | Date | null
  metadata?: Record<string, unknown> | null
  pinned?: boolean
  pinnedAt?: string | number | Date | null
  createdAt: string | number | Date
  updatedAt: string | number | Date
  deletedAt?: string | number | Date | null
}
type ListItem = {
  id: string
  listId: string
  itemId?: string | null
  title: string
  sortOrder: number
  checked: boolean
  checkedAt?: string | number | Date | null
  checkedById?: string | null
  createdAt: string | number | Date
  updatedAt?: string | number | Date | null
  deletedAt?: string | number | Date | null
}
type RecordField = { label: string; value: string }
type RecordRow = {
  id: string
  householdId: string
  category: string
  title: string
  subtitle?: string | null
  icon?: string | null
  fields?: RecordField[] | null
  renewalDate?: string | number | Date | null
  renewalLabel?: string | null
  notes?: string | null
  sortOrder?: number
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}
type ReminderRow = {
  id: string
  householdId: string
  createdById: string
  entityType: string
  entityId: string
  message?: string | null
  triggerAt: string | number | Date
  dispatchedAt?: string | number | Date | null
  dismissedAt?: string | number | Date | null
  createdAt: string | number | Date
}
type CalendarEvent = {
  id: string
  householdId?: string
  externalId?: string | null
  calendarId?: string | null
  title: string
  description?: string | null
  location?: string | null
  startsAt: string | number | Date
  endsAt?: string | number | Date | null
  allDay?: boolean
  recurrenceRule?: string | null
  rawIcal?: string | null
  lastSyncedAt?: string | number | Date | null
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}
type Bin = {
  id: string
  householdId: string
  name: string
  colour: string
  collectionDay: number
  frequency: string
  intervalWeeks: number
  anchorDate?: string | null
  notes?: string | null
  active?: boolean
  createdAt?: string | number | Date
}

type AppData = {
  users: User[]
  household: Household[]
  householdMembers: HouseholdMember[]
  lists: List[]
  items: Item[]
  listItems: ListItem[]
  records: RecordRow[]
  reminders: ReminderRow[]
  calendarEvents: CalendarEvent[]
  bins: Bin[]
}

export type AppState = {
  ready: boolean
  syncing: boolean
  error: string | null
  data: AppData
}

type BootstrapPayload = {
  data: AppData
}

type SyncChange = {
  entityType: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload: Record<string, unknown> | null
}

const STORAGE_KEY = 'homeos:app-state'
const MUTATION_QUEUE_KEY = 'homeos:mutation-queue'
const listeners = new Set<() => void>()

const emptyData: AppData = {
  users: [],
  household: [],
  householdMembers: [],
  lists: [],
  items: [],
  listItems: [],
  records: [],
  reminders: [],
  calendarEvents: [],
  bins: [],
}

let state: AppState = loadState()
let stream: EventSource | null = null
let bootstrapped = false
let mutationQueue: SyncMutation[] = loadMutationQueue()
let flushPromise: Promise<void> | null = null
let refreshPromise: Promise<void> | null = null
let postPushRefreshTimer: number | null = null
let onlineListenerRegistered = false
let fallbackSyncRegistered = false

function isUnauthorizedError(error: unknown) {
  return error instanceof Error && /\b401\b/.test(error.message)
}

function loadState(): AppState {
  if (typeof window === 'undefined') {
    return { ready: false, syncing: false, error: null, data: emptyData }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ready: false, syncing: false, error: null, data: emptyData }
    return JSON.parse(raw) as AppState
  } catch {
    return { ready: false, syncing: false, error: null, data: emptyData }
  }
}

function loadMutationQueue(): SyncMutation[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(MUTATION_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as SyncMutation[] : []
  } catch {
    return []
  }
}

function persist() {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(mutationQueue))
}

function emit() {
  persist()
  listeners.forEach(listener => listener())
}

function setState(next: AppState | ((prev: AppState) => AppState)) {
  state = typeof next === 'function' ? next(state) : next
  emit()
}

function mergeCollection<T extends { id: string }>(existing: T[], incoming: T) {
  const index = existing.findIndex(row => row.id === incoming.id)
  if (index === -1) return [...existing, incoming]
  return existing.map((row, i) => (i === index ? { ...row, ...incoming } : row))
}

function removeCollection<T extends { id: string }>(existing: T[], id: string) {
  return existing.filter(row => row.id !== id)
}

function applyMutationToData(data: AppData, mutation: Pick<SyncMutation, 'entityType' | 'entityId' | 'operation' | 'payload'>) {
  const next = { ...data }

  switch (mutation.entityType) {
    case 'record':
      next.records = mutation.operation === 'delete'
        ? removeCollection(next.records, mutation.entityId)
        : mergeCollection(next.records, mutation.payload as RecordRow)
      break
    case 'reminder':
      next.reminders = mutation.operation === 'delete'
        ? removeCollection(next.reminders, mutation.entityId)
        : mergeCollection(next.reminders, mutation.payload as ReminderRow)
      break
    case 'item':
      next.items = mutation.operation === 'delete'
        ? removeCollection(next.items, mutation.entityId)
        : mergeCollection(next.items, mutation.payload as Item)
      break
    case 'list_item':
      next.listItems = mutation.operation === 'delete'
        ? removeCollection(next.listItems, mutation.entityId)
        : mergeCollection(next.listItems, mutation.payload as ListItem)
      break
    case 'list':
      next.lists = mutation.operation === 'delete'
        ? removeCollection(next.lists, mutation.entityId)
        : mergeCollection(next.lists, mutation.payload as List)
      break
    default:
      break
  }

  return next
}

function replayQueuedMutations(data: AppData) {
  return mutationQueue.reduce(
    (next, mutation) => applyMutationToData(next, mutation),
    data,
  )
}

function applyChange(change: SyncChange) {
  setState(prev => {
    const next = { ...prev, ready: true, syncing: false, error: null, data: { ...prev.data } }

    switch (change.entityType) {
      case 'record':
        next.data.records = change.operation === 'delete'
          ? removeCollection(next.data.records, change.entityId)
          : mergeCollection(next.data.records, change.payload as RecordRow)
        break
      case 'reminder':
        next.data.reminders = change.operation === 'delete'
          ? removeCollection(next.data.reminders, change.entityId)
          : mergeCollection(next.data.reminders, change.payload as ReminderRow)
        break
      case 'item':
        next.data.items = change.operation === 'delete'
          ? removeCollection(next.data.items, change.entityId)
          : mergeCollection(next.data.items, change.payload as Item)
        break
      case 'list_item':
        next.data.listItems = change.operation === 'delete'
          ? removeCollection(next.data.listItems, change.entityId)
          : mergeCollection(next.data.listItems, change.payload as ListItem)
        break
      case 'list':
        next.data.lists = change.operation === 'delete'
          ? removeCollection(next.data.lists, change.entityId)
          : mergeCollection(next.data.lists, change.payload as List)
        break
      default:
        break
    }

    return next
  })
}

function mergeBootstrap(payload: BootstrapPayload) {
  setState(prev => ({
    ...prev,
    ready: true,
    syncing: false,
    error: null,
    data: replayQueuedMutations(payload.data),
  }))
}

function schedulePostPushRefresh() {
  if (typeof window === 'undefined') return
  if (postPushRefreshTimer !== null) {
    window.clearTimeout(postPushRefreshTimer)
  }

  postPushRefreshTimer = window.setTimeout(() => {
    postPushRefreshTimer = null
    if (document.hidden || !navigator.onLine) return
    refreshFromServer({ silent: true }).catch(() => undefined)
  }, 5000)
}

async function flushMutationQueue() {
  if (!mutationQueue.length) return
  if (flushPromise) return flushPromise

  flushPromise = (async () => {
    try {
      await push(mutationQueue)
      mutationQueue = []
      persist()
      schedulePostPushRefresh()
    } finally {
      flushPromise = null
    }
  })()

  return flushPromise
}

function startSyncStream() {
  if (typeof window === 'undefined' || stream) return

  stream = openSyncStream(() => {
    if (flushPromise) {
      schedulePostPushRefresh()
      return
    }
    refreshFromServer({ silent: true }).catch(() => undefined)
  })

  stream.onerror = () => {
    if (stream) {
      stream.close()
      stream = null
    }

    window.setTimeout(() => {
      if (!bootstrapped || document.hidden || !navigator.onLine) return
      startSyncStream()
      refreshFromServer({ silent: true }).catch(() => undefined)
    }, 3000)
  }
}

function registerOnlineSync() {
  if (typeof window === 'undefined' || onlineListenerRegistered) return

  window.addEventListener('online', () => {
    startSyncStream()
    if (mutationQueue.length) {
      flushMutationQueue().catch(error => {
        setState(prev => ({
          ...prev,
          syncing: false,
          error: error instanceof Error ? error.message : 'Mutation sync failed',
        }))
      })
      return
    }

    refreshFromServer({ silent: true }).catch(() => undefined)
  })

  onlineListenerRegistered = true
}

function registerFallbackSync() {
  if (typeof window === 'undefined' || fallbackSyncRegistered) return

  const refreshVisible = () => {
    if (document.hidden || !navigator.onLine) return
    startSyncStream()
    refreshFromServer({ silent: true }).catch(() => undefined)
  }

  window.addEventListener('focus', refreshVisible)
  window.addEventListener('pageshow', refreshVisible)
  document.addEventListener('visibilitychange', refreshVisible)
  window.setInterval(refreshVisible, 30000)

  fallbackSyncRegistered = true
}

async function refreshFromServer(options: { silent?: boolean } = {}) {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    if (!options.silent) {
      setState(prev => ({ ...prev, syncing: true, error: null }))
    }

    try {
      const payload = await pull()
      for (const change of payload.changes as SyncChange[]) {
        applyChange(change)
      }
      setState(prev => ({ ...prev, syncing: false, ready: true, error: null }))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        if (stream) {
          stream.close()
          stream = null
        }
        setState(prev => ({
          ...prev,
          ready: true,
          syncing: false,
          error: null,
        }))
        return
      }

      setState(prev => ({
        ...prev,
        syncing: false,
        error: options.silent ? prev.error : error instanceof Error ? error.message : 'Sync failed',
      }))
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export async function ensureBootstrap() {
  if (bootstrapped) return
  bootstrapped = true
  registerOnlineSync()
  registerFallbackSync()

  try {
    const payload = await bootstrap()
    mergeBootstrap(payload)
    startSyncStream()
    if (mutationQueue.length) {
      flushMutationQueue().catch(error => {
        setState(prev => ({
          ...prev,
          syncing: false,
          error: error instanceof Error ? error.message : 'Mutation sync failed',
        }))
      })
    }
  } catch (error) {
    if (isUnauthorizedError(error)) {
      setState(prev => ({
        ...prev,
        ready: true,
        syncing: false,
        error: null,
      }))
      return
    }

    setState(prev => ({
      ...prev,
      ready: prev.ready,
      syncing: false,
      error: error instanceof Error ? error.message : 'Bootstrap failed',
    }))
  }
}

export function useAppState<T>(selector: (state: AppState) => T) {
  const cacheRef = useRef<{
    selector: ((state: AppState) => T) | null
    state: AppState | null
    value: T | null
  }>({
    selector: null,
    state: null,
    value: null,
  })

  const getSnapshot = () => {
    const cache = cacheRef.current
    if (cache.selector === selector && cache.state === state) {
      return cache.value as T
    }

    const value = selector(state)
    cacheRef.current = {
      selector,
      state,
      value,
    }
    return value
  }

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function enqueueMutation(mutation: SyncMutation, optimistic?: (prev: AppState) => AppState) {
  if (optimistic) {
    setState(optimistic)
  }

  mutationQueue = [...mutationQueue, mutation]
  persist()

  try {
    await flushMutationQueue()
  } catch (error) {
    setState(prev => ({
      ...prev,
      syncing: false,
      error: error instanceof Error ? error.message : 'Mutation failed',
    }))
  }
}

export function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getCurrentState() {
  return state
}
