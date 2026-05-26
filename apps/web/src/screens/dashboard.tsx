import { useEffect, useMemo, useState } from 'react'
import { changePassword, signOut } from '@homeos/auth/client'
import { AiCapture } from '../components/ai-capture'
import { ColorPickerPanel, normalizeHex } from '../components/color-control'
import { SwipeRow } from '../components/swipe-row'
import { actualThemeIsDark, applyAccent, applyThemeMode, currentAccent, currentThemeMode, type ThemeMode, watchAutoTheme } from '../lib/appearance'
import { enqueueMutation, makeId, useAppState } from '../lib/app-store'
import { resetSession, useSessionState } from '../lib/session-store'
import { ScreenShell } from './shell'

type ShoppingItem = { id: string; title: string; shopName: string; shopColor: string }
type Task = { id: string; title: string; dueDate: Date; listId: string | null; assignee: string | null; color: string; completed: boolean }
type Renewal = { id: string; title: string; label: string | null; date: Date; href: string }
type CalEvent = { id: string; title: string; startsAt: Date; allDay: boolean; location: string | null; timeLabel: string; color: string }
type BinWithDate = { id: string; name: string; colour: string; nextCollection: Date }
type TonightShow = { title: string; channel: string; airtime: string; channelId: string; atMs: number }
type TimelineEntry =
  | { kind: 'calendar'; id: string; eventId: string; title: string; sortMs: number; timeLabel: string; sub: string | null; color: string }
  | { kind: 'task'; id: string; title: string; sortMs: number; taskId: string; listId: string | null; assignee: string | null; overdue: boolean; color: string; completed: boolean }
  | { kind: 'renewal'; id: string; title: string; sortMs: number; sub: string | null; href: string; overdue: boolean; days: number }
type DayGroup = { key: string; label: string; isToday: boolean; isOverdue: boolean; entries: TimelineEntry[] }

const BIN_DOT: Record<string, string> = {
  grey: '#6B7280',
  blue: '#3B82F6',
  green: '#22C55E',
  brown: '#92400E',
  black: '#374151',
  pink: '#EC4899',
}
const RANGE_OPTIONS = [
  { days: 1, label: 'Today' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
]
const STATIC_BIN_SCHEDULES = [
  { id: 'black-bin', name: 'Black bin', colour: 'black', firstCollectionDate: '2026-05-27', intervalWeeks: 3 },
  { id: 'recycling-food', name: 'Recycling containers and food bin', colour: 'blue', firstCollectionDate: '2026-05-27', intervalWeeks: 1 },
  { id: 'green-bin', name: 'Green bin', colour: 'green', firstCollectionDate: '2026-06-02', intervalWeeks: 2 },
  { id: 'hygiene-nappy', name: 'Hygiene and nappy waste bag', colour: 'pink', firstCollectionDate: '2026-06-03', intervalWeeks: 2 },
]
const TONIGHT_CACHE_KEY = 'homeos:dashboard-tonight:v1'

function toDate(value: string | number | Date | null | undefined) {
  if (!value) return null
  return value instanceof Date ? value : new Date(value)
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function allDayAsLocal(date: Date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function dayDiffFrom(targetMs: number, now: Date) {
  const today = startOfLocalDay(now).getTime()
  const target = startOfLocalDay(new Date(targetMs)).getTime()
  return Math.round((target - today) / 86_400_000)
}

function rangeCutoffMs(now: Date, rangeDays: number) {
  return startOfLocalDay(now).getTime() + rangeDays * 86_400_000 - 1
}

function eventTimeLabel(date: Date, allDay: boolean) {
  if (allDay) return 'All day'
  return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12', timeZone: 'Europe/London' })
}

function getNextRecurringDate(firstCollectionDate: string, intervalWeeks: number) {
  const today = startOfLocalDay(new Date())
  const next = new Date(`${firstCollectionDate}T00:00:00`)
  const intervalDays = intervalWeeks * 7
  while (next < today) next.setDate(next.getDate() + intervalDays)
  return next
}

function loadTonightCache(): TonightShow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(TONIGHT_CACHE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed?.shows) ? parsed.shows : []
  } catch {
    return []
  }
}

function saveTonightCache(shows: TonightShow[]) {
  try {
    window.localStorage.setItem(TONIGHT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), shows }))
  } catch {
    // Cache is best-effort only.
  }
}

function buildTimeline(calendarEvents: CalEvent[], tasks: Task[], renewals: Renewal[], now: Date): DayGroup[] {
  const entries: TimelineEntry[] = []

  for (const event of calendarEvents) {
    entries.push({
      kind: 'calendar',
      id: `cal-${event.id}`,
      eventId: event.id,
      title: event.title,
      sortMs: event.startsAt.getTime(),
      timeLabel: event.timeLabel,
      sub: event.location,
      color: event.color,
    })
  }

  for (const task of tasks) {
    entries.push({
      kind: 'task',
      id: `task-${task.id}`,
      title: task.title,
      sortMs: task.dueDate.getTime(),
      taskId: task.id,
      listId: task.listId,
      assignee: task.assignee,
      overdue: dayDiffFrom(task.dueDate.getTime(), now) < 0,
      color: task.color,
      completed: task.completed,
    })
  }

  for (const renewal of renewals) {
    const days = dayDiffFrom(renewal.date.getTime(), now)
    entries.push({
      kind: 'renewal',
      id: `renewal-${renewal.id}`,
      title: renewal.title,
      sortMs: renewal.date.getTime(),
      sub: renewal.label,
      href: renewal.href,
      overdue: days < 0,
      days,
    })
  }

  entries.sort((a, b) => a.sortMs - b.sortMs)
  const today = startOfLocalDay(now)
  const groupMap = new Map<string, DayGroup>()

  for (const entry of entries) {
    const entryDate = new Date(entry.sortMs)
    const isAllDay = entry.kind === 'calendar' && entry.timeLabel === 'All day'
    const itemDay = isAllDay ? allDayAsLocal(entryDate) : startOfLocalDay(entryDate)
    const diff = Math.round((itemDay.getTime() - today.getTime()) / 86_400_000)
    let key: string
    let label: string
    let isToday = false
    let isOverdue = false

    if (diff < 0) {
      key = '__overdue'
      label = 'Overdue'
      isOverdue = true
    } else if (diff === 0) {
      key = '__today'
      label = 'Today'
      isToday = true
    } else if (diff === 1) {
      key = '__tomorrow'
      label = 'Tomorrow'
    } else {
      key = `${itemDay.getFullYear()}-${itemDay.getMonth()}-${itemDay.getDate()}`
      label = itemDay.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    }

    if (!groupMap.has(key)) groupMap.set(key, { key, label, isToday, isOverdue, entries: [] })
    groupMap.get(key)!.entries.push(entry)
  }

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1
    if (!a.isOverdue && b.isOverdue) return 1
    return (a.entries[0]?.sortMs ?? 0) - (b.entries[0]?.sortMs ?? 0)
  })
}

function SunIcon() {
  return (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
      <circle cx="11" cy="11" r="4" />
      <path d="M11 1.5v2M11 18.5v2M3.1 3.1l1.4 1.4M17.5 17.5l1.4 1.4M1.5 11h2M18.5 11h2M3.1 18.9l1.4-1.4M17.5 4.5l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
      <path d="M19 11.5A8.5 8.5 0 1 1 10.5 3a6.5 6.5 0 0 0 8.5 8.5z" />
    </svg>
  )
}

function AutoIcon() {
  return (
    <svg viewBox="0 0 22 22" fill="none" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
      <path d="M11 2a9 9 0 0 0 0 18V2z" fill="currentColor" stroke="none" />
      <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth={1.8} />
    </svg>
  )
}

type NotificationPreferences = {
  reminders: { enabled: boolean }
  taskDue: { enabled: boolean }
  tasksDaily: { enabled: boolean; time: string }
  bins: { enabled: boolean; time: string }
  tv: {
    enabled: boolean
    individualEnabled: boolean
    leadMinutes: number
    summaryEnabled: boolean
    summaryTime: string
  }
}

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  reminders: { enabled: true },
  taskDue: { enabled: true },
  tasksDaily: { enabled: true, time: '08:30' },
  bins: { enabled: true, time: '19:00' },
  tv: {
    enabled: true,
    individualEnabled: true,
    leadMinutes: 30,
    summaryEnabled: false,
    summaryTime: '18:00',
  },
}
const TV_LEAD_OPTIONS = [10, 15, 30, 45, 60, 90, 120]

function settingObject(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function userSettings(settings: Record<string, unknown> | null | undefined, userId: string | null | undefined) {
  const all = settingObject(settings?.userSettings)
  return settingObject(userId ? all[userId] : null)
}

function asBool(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function asTime(value: unknown, fallback: string) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback
}

function asLeadMinutes(value: unknown, fallback: number) {
  const next = typeof value === 'number' ? value : Number(value)
  return TV_LEAD_OPTIONS.includes(next) ? next : fallback
}

function notificationPreferencesFromSettings(settings: Record<string, unknown> | null | undefined): NotificationPreferences {
  const raw = settingObject(settings?.notificationPreferences ?? settings)
  const reminders = settingObject(raw.reminders)
  const taskDue = settingObject(raw.taskDue)
  const tasksDaily = settingObject(raw.tasksDaily)
  const bins = settingObject(raw.bins)
  const tv = settingObject(raw.tv)

  return {
    reminders: { enabled: asBool(reminders.enabled, DEFAULT_NOTIFICATION_PREFERENCES.reminders.enabled) },
    taskDue: { enabled: asBool(taskDue.enabled, DEFAULT_NOTIFICATION_PREFERENCES.taskDue.enabled) },
    tasksDaily: {
      enabled: asBool(tasksDaily.enabled, DEFAULT_NOTIFICATION_PREFERENCES.tasksDaily.enabled),
      time: asTime(tasksDaily.time, DEFAULT_NOTIFICATION_PREFERENCES.tasksDaily.time),
    },
    bins: {
      enabled: asBool(bins.enabled, DEFAULT_NOTIFICATION_PREFERENCES.bins.enabled),
      time: asTime(bins.time, DEFAULT_NOTIFICATION_PREFERENCES.bins.time),
    },
    tv: {
      enabled: asBool(tv.enabled, DEFAULT_NOTIFICATION_PREFERENCES.tv.enabled),
      individualEnabled: asBool(tv.individualEnabled, DEFAULT_NOTIFICATION_PREFERENCES.tv.individualEnabled),
      leadMinutes: asLeadMinutes(tv.leadMinutes, DEFAULT_NOTIFICATION_PREFERENCES.tv.leadMinutes),
      summaryEnabled: asBool(tv.summaryEnabled, DEFAULT_NOTIFICATION_PREFERENCES.tv.summaryEnabled),
      summaryTime: asTime(tv.summaryTime, DEFAULT_NOTIFICATION_PREFERENCES.tv.summaryTime),
    },
  }
}

function Switch({ checked, onChange, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? 'bg-accent' : 'bg-surface-2'}`}>
      <span className={`absolute left-0 top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

function TimeCommitInput({ value, disabled, onCommit }: { value: string; disabled?: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [value])

  function commit(next = draft) {
    if (next && next !== value) onCommit(next)
  }

  return (
    <input
      type="time"
      value={draft}
      disabled={disabled}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => commit()}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className="bg-transparent text-right text-[15px] text-text-1 outline-none disabled:opacity-40"
    />
  )
}

function UserButton({ name, email }: { name: string; email?: string | null }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'appearance' | 'notifications' | 'password'>('menu')
  const currentUser = useSessionState(state => state.user)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => currentThemeMode())
  const [isDark, setIsDark] = useState(() => actualThemeIsDark())
  const [accent, setAccent] = useState(() => currentAccent())
  const householdRow = useAppState(state => state.data.household[0] ?? null)
  const personalSettings = userSettings(householdRow?.settings, currentUser?.id)
  const notificationPreferences = notificationPreferencesFromSettings(personalSettings.notificationPreferences as Record<string, unknown> | null | undefined)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => watchAutoTheme(() => setIsDark(actualThemeIsDark())), [])

  function close() {
    setOpen(false)
    window.setTimeout(() => {
      setView('menu')
      setCurrent('')
      setNext('')
      setConfirm('')
      setError('')
      setDone(false)
      setBusy(false)
    }, 180)
  }

  function pickTheme(mode: ThemeMode) {
    setThemeMode(mode)
    applyThemeMode(mode)
    setIsDark(actualThemeIsDark())
  }

  function pickAccent(hex: string) {
    const normalized = normalizeHex(hex)
    if (!normalized) return
    setAccent(normalized)
    applyAccent(normalized)
  }

  async function saveNotificationPreferences(next: NotificationPreferences) {
    if (!currentUser) return
    const householdId = householdRow?.id ?? 'default'
    const now = new Date().toISOString()
    const payload = {
      id: householdId,
      name: householdRow?.name ?? 'Home',
      settings: {
        ...(householdRow?.settings ?? {}),
        userSettings: {
          ...settingObject(householdRow?.settings?.userSettings),
          [currentUser.id]: {
            ...personalSettings,
            notificationPreferences: next,
          },
        },
      },
      createdAt: householdRow?.createdAt ?? now,
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'household.upsert',
      entityType: 'household',
      entityId: householdId,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        household: prev.data.household.some(row => row.id === householdId)
          ? prev.data.household.map(row => row.id === householdId ? { ...row, ...payload } : row)
          : [...prev.data.household, payload],
      },
    }))
  }

  function updateNotificationPreferences(recipe: (current: NotificationPreferences) => NotificationPreferences) {
    void saveNotificationPreferences(recipe(notificationPreferences))
  }

  async function handleLogout() {
    setBusy(true)
    await signOut()
    resetSession()
    window.location.assign('/login')
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true)
    const result = await changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: false })
    setBusy(false)
    if (result.error) {
      setError(result.error.message ?? 'Could not change password.')
      return
    }
    setDone(true)
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white transition-transform active:scale-95" aria-label="Account menu">
        {name.charAt(0).toUpperCase()}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] mx-auto flex max-w-lg flex-col justify-end">
          <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={close} />
          <div className="relative flex max-h-[90dvh] flex-col rounded-t-3xl bg-bg">
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2">
              {view === 'menu' ? (
                <>
                  <div className="mb-2 flex items-center gap-3 px-2 py-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-[18px] font-bold text-white">{name.charAt(0).toUpperCase()}</div>
                    <div className="min-w-0">
                      <p className="truncate text-[17px] font-bold text-text-1">{name}</p>
                      {email ? <p className="truncate text-[13px] text-text-2">{email}</p> : null}
                    </div>
                  </div>
                  <div className="mb-3 overflow-hidden rounded-2xl bg-surface">
                    <button onClick={() => setView('appearance')} className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2">
                      <span className="text-text-2">{isDark ? <MoonIcon /> : <SunIcon />}</span>
                      <span className="flex-1 text-[15px] font-medium text-text-1">Appearance</span>
                      <span className="text-[13px] capitalize text-text-2">{themeMode}</span>
                      <span className="h-4 w-4 rounded-full border-2 border-white/70" style={{ background: accent }} />
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
                    </button>
                    <button onClick={() => setView('notifications')} className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left active:bg-surface-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px] text-text-2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                      <span className="flex-1 text-[15px] font-medium text-text-1">Notification Centre</span>
                      <span className="text-[13px] text-text-2">{notificationPreferences.tv.summaryEnabled ? 'Summary' : 'On'}</span>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
                    </button>
                    <button onClick={() => setView('password')} className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left active:bg-surface-2">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px] text-text-2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      <span className="flex-1 text-[15px] font-medium text-text-1">Change Password</span>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
                    </button>
                    <button onClick={handleLogout} disabled={busy} className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left active:bg-surface-2 disabled:opacity-50">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px] text-red"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                      <span className="flex-1 text-[15px] font-semibold text-red">{busy ? 'Logging out...' : 'Log Out'}</span>
                    </button>
                  </div>
                </>
              ) : null}

              {view === 'appearance' ? (
                <>
                  <div className="mb-1 flex items-center justify-between px-1 py-2">
                    <button onClick={() => setView('menu')} className="text-[16px] text-accent active:opacity-60">Back</button>
                    <span className="text-[16px] font-semibold text-text-1">Appearance</span>
                    <span className="w-10" />
                  </div>
                  <div className="mb-3 overflow-hidden rounded-2xl bg-surface">
                    <div className="px-4 py-3.5">
                      <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-text-2">Theme</p>
                      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
                        {[
                          { mode: 'light' as ThemeMode, label: 'Light', icon: <SunIcon /> },
                          { mode: 'auto' as ThemeMode, label: 'Auto', icon: <AutoIcon /> },
                          { mode: 'dark' as ThemeMode, label: 'Dark', icon: <MoonIcon /> },
                        ].map(option => (
                          <button key={option.mode} onClick={() => pickTheme(option.mode)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-[9px] py-2 text-[13px] font-semibold ${themeMode === option.mode ? 'bg-surface text-text-1 shadow-sm' : 'text-text-2 active:bg-surface/50'}`}>
                            {option.icon}
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mb-3 overflow-hidden rounded-2xl bg-surface">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'conic-gradient(#ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #5856d6, #af52de, #ff2d55, #ff3b30)' }}>
                        <span className="h-5 w-5 rounded-full border-2 border-white shadow-sm" style={{ background: accent }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-text-1">Accent Colour</p>
                        <p className="font-mono text-[12px] font-semibold uppercase text-text-2">{accent}</p>
                      </div>
                    </div>
                    <ColorPickerPanel value={accent} onChange={pickAccent} />
                  </div>
                </>
              ) : null}

              {view === 'notifications' ? (
                <>
                  <div className="mb-1 flex items-center justify-between px-1 py-2">
                    <button onClick={() => setView('menu')} className="text-[16px] text-accent active:opacity-60">Back</button>
                    <span className="text-[16px] font-semibold text-text-1">Notifications</span>
                    <span className="w-10" />
                  </div>
                  <div className="mb-3 overflow-hidden rounded-2xl bg-surface">
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-text-1">Vault reminders</p>
                        <p className="mt-0.5 text-[12px] text-text-2">Life admin dates and follow-ups</p>
                      </div>
                      <Switch checked={notificationPreferences.reminders.enabled} onChange={enabled => updateNotificationPreferences(current => ({ ...current, reminders: { enabled } }))} />
                    </div>
                    <div className="flex items-center gap-3 border-t border-border px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-text-1">Timed tasks</p>
                        <p className="mt-0.5 text-[12px] text-text-2">At the exact due time</p>
                      </div>
                      <Switch checked={notificationPreferences.taskDue.enabled} onChange={enabled => updateNotificationPreferences(current => ({ ...current, taskDue: { enabled } }))} />
                    </div>
                    <div className="border-t border-border px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-text-1">Tasks due today</p>
                          <p className="mt-0.5 text-[12px] text-text-2">Daily summary</p>
                        </div>
                        <Switch checked={notificationPreferences.tasksDaily.enabled} onChange={enabled => updateNotificationPreferences(current => ({ ...current, tasksDaily: { ...current.tasksDaily, enabled } }))} />
                      </div>
                      <label className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                        <span className="text-[13px] font-semibold text-text-2">Time</span>
                        <TimeCommitInput value={notificationPreferences.tasksDaily.time} disabled={!notificationPreferences.tasksDaily.enabled} onCommit={time => updateNotificationPreferences(current => ({ ...current, tasksDaily: { ...current.tasksDaily, time } }))} />
                      </label>
                    </div>
                    <div className="border-t border-border px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-text-1">Bin day</p>
                          <p className="mt-0.5 text-[12px] text-text-2">The day before collection</p>
                        </div>
                        <Switch checked={notificationPreferences.bins.enabled} onChange={enabled => updateNotificationPreferences(current => ({ ...current, bins: { ...current.bins, enabled } }))} />
                      </div>
                      <label className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                        <span className="text-[13px] font-semibold text-text-2">Time</span>
                        <TimeCommitInput value={notificationPreferences.bins.time} disabled={!notificationPreferences.bins.enabled} onCommit={time => updateNotificationPreferences(current => ({ ...current, bins: { ...current.bins, time } }))} />
                      </label>
                    </div>
                  </div>

                  <div className="mb-3 overflow-hidden rounded-2xl bg-surface">
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-text-1">TV reminders</p>
                        <p className="mt-0.5 text-[12px] text-text-2">Shows from your following list</p>
                      </div>
                      <Switch checked={notificationPreferences.tv.enabled} onChange={enabled => updateNotificationPreferences(current => ({ ...current, tv: { ...current.tv, enabled } }))} />
                    </div>
                    <div className="border-t border-border px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-text-1">Before each show</p>
                          <p className="mt-0.5 text-[12px] text-text-2">Individual reminder</p>
                        </div>
                        <Switch checked={notificationPreferences.tv.individualEnabled} disabled={!notificationPreferences.tv.enabled} onChange={individualEnabled => updateNotificationPreferences(current => ({ ...current, tv: { ...current.tv, individualEnabled } }))} />
                      </div>
                      <label className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                        <span className="text-[13px] font-semibold text-text-2">Notice</span>
                        <select value={notificationPreferences.tv.leadMinutes} disabled={!notificationPreferences.tv.enabled || !notificationPreferences.tv.individualEnabled} onChange={event => updateNotificationPreferences(current => ({ ...current, tv: { ...current.tv, leadMinutes: Number(event.target.value) } }))} className="bg-transparent text-right text-[15px] font-semibold text-text-1 outline-none disabled:opacity-40">
                          {TV_LEAD_OPTIONS.map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="border-t border-border px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-text-1">Evening summary</p>
                          <p className="mt-0.5 text-[12px] text-text-2">One notification for tonight</p>
                        </div>
                        <Switch checked={notificationPreferences.tv.summaryEnabled} disabled={!notificationPreferences.tv.enabled} onChange={summaryEnabled => updateNotificationPreferences(current => ({ ...current, tv: { ...current.tv, summaryEnabled } }))} />
                      </div>
                      <label className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                        <span className="text-[13px] font-semibold text-text-2">Time</span>
                        <TimeCommitInput value={notificationPreferences.tv.summaryTime} disabled={!notificationPreferences.tv.enabled || !notificationPreferences.tv.summaryEnabled} onCommit={summaryTime => updateNotificationPreferences(current => ({ ...current, tv: { ...current.tv, summaryTime } }))} />
                      </label>
                    </div>
                  </div>
                </>
              ) : null}

              {view === 'password' ? (
                <>
                  <div className="mb-1 flex items-center justify-between px-1 py-2">
                    <button onClick={() => { setView('menu'); setError(''); setDone(false) }} className="text-[16px] text-accent active:opacity-60">Back</button>
                    <span className="text-[16px] font-semibold text-text-1">Change Password</span>
                    <span className="w-10" />
                  </div>
                  {done ? (
                    <div className="mb-3 rounded-2xl bg-surface px-4 py-6 text-center">
                      <p className="text-[15px] font-semibold text-text-1">Password updated</p>
                      <button onClick={close} className="mt-4 text-[15px] font-semibold text-accent active:opacity-60">Done</button>
                    </div>
                  ) : (
                    <form onSubmit={handleChangePassword} className="mb-3 flex flex-col gap-3">
                      <div className="overflow-hidden rounded-2xl bg-surface">
                        <input type="password" value={current} onChange={event => setCurrent(event.target.value)} placeholder="Current password" autoComplete="current-password" required className="w-full bg-transparent px-4 py-3 text-[16px] text-text-1 outline-none placeholder:text-text-3" />
                        <input type="password" value={next} onChange={event => setNext(event.target.value)} placeholder="New password" autoComplete="new-password" required className="w-full border-t border-border bg-transparent px-4 py-3 text-[16px] text-text-1 outline-none placeholder:text-text-3" />
                        <input type="password" value={confirm} onChange={event => setConfirm(event.target.value)} placeholder="Confirm new password" autoComplete="new-password" required className="w-full border-t border-border bg-transparent px-4 py-3 text-[16px] text-text-1 outline-none placeholder:text-text-3" />
                      </div>
                      {error ? <p className="px-1 text-[13px] font-medium text-red">{error}</p> : null}
                      <button type="submit" disabled={busy || !current || !next || !confirm} className="h-12 w-full rounded-2xl bg-accent text-[16px] font-bold text-white active:opacity-80 disabled:opacity-40">{busy ? 'Updating...' : 'Update Password'}</button>
                    </form>
                  )}
                </>
              ) : null}
            </div>
            {view !== 'password' ? (
              <div className="shrink-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                <button onClick={close} className="h-12 w-full rounded-2xl bg-surface text-[16px] font-semibold text-accent active:opacity-70">{view === 'appearance' || view === 'notifications' ? 'Done' : 'Cancel'}</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

function PinnedBoardLite({ pins }: { pins: Array<{ id: string; title: string; body?: string | null }> }) {
  return (
    <section className="mx-4 mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[19px] font-bold" style={{ color: '#F5A623', letterSpacing: '-0.01em' }}>Pinned</h2>
        {pins.length > 0 ? <a href="/notes" className="text-[13px] font-semibold text-accent">Add pin</a> : null}
      </div>
      {pins.length === 0 ? (
        <a href="/notes" className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border bg-surface px-4 py-3.5 active:bg-surface-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
            <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" className="h-3.5 w-3.5"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </div>
          <span className="text-[13.5px] font-medium text-text-2">Pin a note or a key fact to Home</span>
        </a>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {pins.map(pin => (
            <a key={pin.id} href="/notes" className="relative rounded-2xl border border-border/50 p-3.5 text-left transition-transform active:scale-[0.98]" style={{ background: 'rgba(255,204,0,0.16)' }}>
              <div className="flex items-start gap-2">
                <div className="mt-0.5 w-1 shrink-0 self-stretch rounded-full" style={{ background: '#F5B800', minHeight: 18 }} />
                <div className="min-w-0 flex-1">
                  <p className="break-words pr-4 text-[14px] font-bold leading-snug text-text-1">{pin.title}</p>
                  {pin.body ? <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-[12px] leading-snug text-text-2">{pin.body}</p> : null}
                </div>
              </div>
            </a>
          ))}
          <a href="/notes" className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border active:bg-surface-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-3.5 w-3.5 text-accent"><path d="M8 3.5v9M3.5 8h9" /></svg>
            </div>
            <span className="text-[12px] font-medium text-text-3">Add pin</span>
          </a>
        </div>
      )}
    </section>
  )
}

function TimelineRow({ entry, doneIds, onToggle, onDelete, hasBorder }: { entry: TimelineEntry; doneIds: Set<string>; onToggle: (id: string) => void; onDelete: (id: string) => void; hasBorder: boolean }) {
  const border = hasBorder ? 'border-t border-border' : ''

  if (entry.kind === 'calendar') {
    return (
      <a href={`/calendar?event=${entry.eventId}`} className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${border}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]" style={{ background: `color-mix(in srgb, ${entry.color} 15%, var(--surface))` }}>
          <svg viewBox="0 0 16 16" fill="none" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]" style={{ stroke: entry.color }}>
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2 6.5h12" /><path d="M5 1v3M11 1v3" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-text-1">{entry.title}</p>
          {entry.sub ? <p className="mt-0.5 truncate text-[11.5px] text-text-2">{entry.sub}</p> : null}
        </div>
        <span className="ml-2 shrink-0 text-[11.5px] text-text-2">{entry.timeLabel}</span>
      </a>
    )
  }

  if (entry.kind === 'task') {
    const done = entry.completed || doneIds.has(entry.taskId)
    return (
      <SwipeRow onDelete={() => onDelete(entry.taskId)} wrapClassName={border} className="bg-surface">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => onToggle(entry.taskId)} className="flex h-8 w-8 shrink-0 items-center justify-center transition-transform active:scale-90" aria-label={done ? `Mark "${entry.title}" incomplete` : `Mark "${entry.title}" complete`}>
            <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full" style={done ? { background: entry.color } : { border: `2px solid ${entry.color}` }}>
              {done ? <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5"><path d="M3 8l3.5 3.5L13 4.5" /></svg> : null}
            </span>
          </button>
          <a href={`/household/tasks/${entry.listId ?? 'all'}`} className="min-w-0 flex-1 active:opacity-70">
            <p className={`truncate text-[13.5px] font-semibold ${done ? 'text-text-2 line-through' : 'text-text-1'}`}>{entry.title}</p>
            {entry.assignee && !done ? <p className="mt-0.5 text-[11.5px] text-text-2">{entry.assignee}</p> : null}
          </a>
          {entry.overdue && !done ? <span className="ml-2 shrink-0 rounded-lg bg-red-bg px-2 py-0.5 text-[11px] font-bold text-red">Overdue</span> : null}
        </div>
      </SwipeRow>
    )
  }

  return (
    <a href={entry.href} className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${border}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${entry.overdue ? 'bg-red-bg' : 'bg-amber-bg'}`}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={`h-[15px] w-[15px] ${entry.overdue ? 'text-red' : 'text-amber'}`}>
          <circle cx="8" cy="8.5" r="5.5" /><path d="M8 6v3l1.5 1.5" /><path d="M5.5 1.5l1 1.5M10.5 1.5l-1 1.5" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-text-1">{entry.title}</p>
        {entry.sub ? <p className="mt-0.5 truncate text-[11.5px] text-text-2">{entry.sub}</p> : null}
      </div>
      {entry.overdue ? <span className="ml-2 shrink-0 rounded-lg bg-red-bg px-2 py-0.5 text-[11px] font-bold text-red">Overdue</span> : entry.days > 0 ? <span className={`ml-2 shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${entry.days <= 7 ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'}`}>{entry.days}d</span> : null}
    </a>
  )
}

function GroupedTimeline({ groups, doneIds, onToggle, onDelete }: { groups: DayGroup[]; doneIds: Set<string>; onToggle: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'var(--surface)' }}>
      {groups.map((group, groupIndex) => (
        <div key={group.key}>
          <div
            className={`px-4 py-[7px] ${groupIndex > 0 ? 'border-t' : ''}`}
            style={{
              borderColor: 'color-mix(in srgb, var(--border) 55%, transparent)',
              background: group.isOverdue ? 'color-mix(in srgb, #FF3B30 8%, var(--surface))' : group.isToday ? 'color-mix(in srgb, var(--accent) 8%, var(--surface))' : 'color-mix(in srgb, var(--border) 30%, var(--surface))',
            }}
          >
            <p className={`text-[10px] font-bold uppercase tracking-[0.09em] ${group.isOverdue ? 'text-red' : group.isToday ? 'text-accent' : 'text-text-3'}`}>{group.label}</p>
          </div>
          {group.entries.map((entry, entryIndex) => <TimelineRow key={entry.id} entry={entry} doneIds={doneIds} onToggle={onToggle} onDelete={onDelete} hasBorder={entryIndex > 0} />)}
        </div>
      ))}
    </div>
  )
}

function ScheduleBlock({ calendarEvents, tasks, renewals, now }: { calendarEvents: CalEvent[]; tasks: Task[]; renewals: Renewal[]; now: Date }) {
  const [rangeDays, setRangeDaysState] = useState(7)
  const [mode, setModeState] = useState<'combined' | 'separate'>('combined')
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setDoneIds(new Set(tasks.filter(task => task.completed).map(task => task.id)))
  }, [tasks])

  useEffect(() => {
    const savedRange = Number(localStorage.getItem('homeos:schedule-range'))
    if ([1, 3, 7].includes(savedRange)) setRangeDaysState(savedRange)
    const savedMode = localStorage.getItem('homeos:schedule-mode')
    if (savedMode === 'combined' || savedMode === 'separate') setModeState(savedMode)
  }, [])

  function setRangeDays(days: number) {
    setRangeDaysState(days)
    localStorage.setItem('homeos:schedule-range', String(days))
  }

  function setMode(next: 'combined' | 'separate') {
    setModeState(next)
    localStorage.setItem('homeos:schedule-mode', next)
  }

  async function toggleTask(id: string) {
    const task = tasks.find(row => row.id === id)
    if (!task) return
    const willComplete = !doneIds.has(id)
    setDoneIds(prev => {
      const next = new Set(prev)
      if (willComplete) next.add(id)
      else next.delete(id)
      return next
    })
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: id,
      operation: 'upsert',
      payload: {
        ...task,
        dueDate: task.dueDate.toISOString(),
        status: willComplete ? 'completed' : 'active',
        completedAt: willComplete ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  async function deleteTask(id: string) {
    setDoneIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.delete',
      entityType: 'item',
      entityId: id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.filter(row => row.id !== id),
      },
    }))
  }

  const cutoff = rangeCutoffMs(now, rangeDays)
  const calendarIn = calendarEvents.filter(event => event.startsAt.getTime() <= cutoff)
  const tasksIn = tasks.filter(task => task.dueDate.getTime() <= cutoff)
  const renewalsIn = renewals.filter(renewal => renewal.date.getTime() <= cutoff)
  const combinedGroups = buildTimeline(calendarIn, tasksIn, renewalsIn, now)
  const eventGroups = buildTimeline(calendarIn, [], [], now)
  const taskGroups = buildTimeline([], tasksIn, [], now)
  const renewalGroups = buildTimeline([], [], renewalsIn, now)
  const empty = mode === 'combined' ? combinedGroups.length === 0 : eventGroups.length === 0 && taskGroups.length === 0 && renewalGroups.length === 0

  return (
    <section className="mx-4 mb-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[19px] font-bold" style={{ color: '#007AFF', letterSpacing: '-0.01em' }}>Schedule</h2>
      </div>
      <div className="mb-2.5 flex items-center gap-2">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {RANGE_OPTIONS.map(option => (
            <button key={option.days} onClick={() => setRangeDays(option.days)} className={`whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${rangeDays === option.days ? 'bg-accent text-white' : 'border border-border bg-surface text-text-2'}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 rounded-lg bg-surface-2 p-0.5">
          <button onClick={() => setMode('combined')} aria-label="Combined view" className={`rounded-[7px] px-2 py-1 transition-colors ${mode === 'combined' ? 'bg-surface text-text-1 shadow-sm' : 'text-text-3'}`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-4 w-4"><line x1="4" y1="6" x2="16" y2="6" /><line x1="4" y1="10" x2="16" y2="10" /><line x1="4" y1="14" x2="16" y2="14" /></svg>
          </button>
          <button onClick={() => setMode('separate')} aria-label="Separate view" className={`rounded-[7px] px-2 py-1 transition-colors ${mode === 'separate' ? 'bg-surface text-text-1 shadow-sm' : 'text-text-3'}`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="3" y="3.5" width="14" height="5" rx="1.5" /><rect x="3" y="11.5" width="14" height="5" rx="1.5" /></svg>
          </button>
        </div>
      </div>
      {empty ? (
        <a href="/calendar" className="flex items-center gap-3 rounded-2xl px-4 py-3 active:bg-bg" style={{ border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'var(--surface)' }}>
          <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent/15"><div className="h-[7px] w-[7px] rounded-full bg-accent" /></div>
          <span className="flex-1 text-[13.5px] text-text-2">Nothing scheduled in this range</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
        </a>
      ) : mode === 'combined' ? (
        <GroupedTimeline groups={combinedGroups} doneIds={doneIds} onToggle={toggleTask} onDelete={deleteTask} />
      ) : (
        <div className="flex flex-col gap-4">
          {eventGroups.length > 0 ? <div><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Events</p><GroupedTimeline groups={eventGroups} doneIds={doneIds} onToggle={toggleTask} onDelete={deleteTask} /></div> : null}
          {taskGroups.length > 0 ? <div><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Tasks</p><GroupedTimeline groups={taskGroups} doneIds={doneIds} onToggle={toggleTask} onDelete={deleteTask} /></div> : null}
          {renewalGroups.length > 0 ? <div><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Renewals</p><GroupedTimeline groups={renewalGroups} doneIds={doneIds} onToggle={toggleTask} onDelete={deleteTask} /></div> : null}
        </div>
      )}
    </section>
  )
}

function OnTonightCard({ shows }: { shows: Array<{ title: string; channel: string; airtime: string; channelId: string; atMs: number }> }) {
  return (
    <section className="mx-4 mb-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[19px] font-bold" style={{ color: '#AF52DE', letterSpacing: '-0.01em' }}>On Tonight</h2>
        <a href="/watch" className="text-[13px] font-semibold text-accent">TV Guide</a>
      </div>
      <div className="overflow-hidden rounded-2xl" style={{ background: 'radial-gradient(ellipse at 15% 80%, rgba(139,92,246,0.55) 0%, transparent 52%), radial-gradient(ellipse at 88% 15%, rgba(6,182,212,0.38) 0%, transparent 50%), radial-gradient(ellipse at 52% 52%, rgba(99,102,241,0.22) 0%, transparent 48%), #070c1e', boxShadow: '0 2px 32px rgba(139,92,246,0.18), 0 1px 0 rgba(255,255,255,0.04) inset' }}>
        {shows.map((show, index) => (
          <a key={show.title} href={`/watch?channel=${encodeURIComponent(show.channelId)}&at=${show.atMs}`} className={`flex items-center gap-3.5 px-4 py-4 transition-colors active:bg-white/5 ${index > 0 ? 'border-t border-white/[0.08]' : ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(8px)' }}>
              <svg viewBox="0 0 20 20" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="1.5" y="5" width="17" height="12" rx="2" /><path d="M6.5 3l3.5 2 3.5-2" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-semibold leading-snug text-white">{show.title}</p>
              <p className="mt-0.5 text-[12px]" style={{ color: 'rgba(255,255,255,0.48)' }}>{show.channel}</p>
            </div>
            <span className="ml-2 shrink-0 text-[12.5px] font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>{show.airtime}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

export function DashboardPage() {
  const sessionUser = useSessionState(state => state.user)
  const snapshot = useAppState(state => {
    const now = new Date()
    const startToday = startOfLocalDay(now)
    const scheduleWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 31, 23, 59, 59)
    const renewalWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59)
    const lists = state.data.lists
    const listColorMap = new Map(lists.map(list => [list.id, list.color ?? '#FF9500']))
    const defaultCalendarColor = normalizeHex(typeof window !== 'undefined' ? window.localStorage.getItem(`homeos:user:${sessionUser?.id}:cal-color`) ?? window.localStorage.getItem('homeos:cal-color') : null) ?? '#007AFF'
    const userFeeds = state.data.calendarFeeds.filter(feed => feed.userId === sessionUser?.id)
    const feedColorMap = new Map(userFeeds.map(feed => [feed.id, feed.color ?? defaultCalendarColor]))
    const shopMap = new Map(lists.filter(list => list.type === 'shopping' && !list.archived).map(list => [list.id, { name: list.icon === 'general-shopping' ? 'General' : list.name, color: list.color ?? '#34C759' }]))
    const shoppingAll = state.data.listItems
      .filter(item => !item.deletedAt && !item.checked && shopMap.has(item.listId))
      .sort((a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(item => ({ id: item.id, title: item.title, shopName: shopMap.get(item.listId)!.name, shopColor: shopMap.get(item.listId)!.color }))
    const completedCutoff = now.getTime() - 6 * 60 * 60 * 1000
    const tasks = state.data.items
      .filter(item => {
        if (item.type !== 'task' || item.deletedAt || !item.dueDate) return false
        if (item.status === 'active') return true
        if (item.status !== 'completed') return false
        const completedAt = toDate(item.completedAt)
        return Boolean(completedAt && completedAt.getTime() >= completedCutoff)
      })
      .map(item => {
        const dueDate = toDate(item.dueDate)!
        return {
          id: item.id,
          title: item.title,
          dueDate,
          listId: item.listId ?? null,
          assignee: item.assigneeId ? state.data.users.find(user => user.id === item.assigneeId)?.name ?? null : null,
          color: item.listId ? listColorMap.get(item.listId) ?? '#FF9500' : '#FF9500',
          completed: item.status === 'completed',
        }
      })
      .filter(task => task.dueDate <= scheduleWindow)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    const inbox = state.data.items.filter(item => item.type === 'inbox' && item.status === 'active' && !item.deletedAt).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const calendarEvents = state.data.calendarEvents
      .map(event => ({ ...event, startsAtDate: toDate(event.startsAt)! }))
      .filter(event => event.startsAtDate >= startToday && event.startsAtDate <= scheduleWindow)
      .filter(event => !event.calendarId?.startsWith('ics:') || feedColorMap.has(event.calendarId.slice(4)))
      .sort((a, b) => a.startsAtDate.getTime() - b.startsAtDate.getTime())
      .slice(0, 60)
      .map(event => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAtDate,
        allDay: event.allDay ?? false,
        location: event.location ?? null,
        timeLabel: eventTimeLabel(event.startsAtDate, event.allDay ?? false),
        color: event.calendarId?.startsWith('ics:')
          ? feedColorMap.get(event.calendarId.slice(4)) ?? defaultCalendarColor
          : defaultCalendarColor,
      }))
    const renewals = state.data.records
      .flatMap(record => {
        const renewalDate = toDate(record.renewalDate)
        if (!renewalDate || renewalDate > renewalWindow) return []
        return [{ id: record.id, title: record.title, label: record.renewalLabel ?? null, date: renewalDate, href: `/life/admin/${record.id}` }]
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    const bins = STATIC_BIN_SCHEDULES.map(bin => ({
      id: bin.id,
      name: bin.name,
      colour: bin.colour,
      nextCollection: getNextRecurringDate(bin.firstCollectionDate, bin.intervalWeeks),
    })).filter(bin => dayDiffFrom(bin.nextCollection.getTime(), now) === 1)
    const pins = state.data.items
      .filter(item => item.type === 'note' && item.pinned && item.status === 'active' && !item.deletedAt)
      .sort((a, b) => new Date(b.pinnedAt ?? b.updatedAt).getTime() - new Date(a.pinnedAt ?? a.updatedAt).getTime())
      .map(item => ({ id: item.id, title: item.title, body: item.body }))

    return {
      user: sessionUser ?? state.data.users[0],
      shoppingItems: shoppingAll.slice(0, 12) as ShoppingItem[],
      shoppingTotal: shoppingAll.length,
      tasks: tasks as Task[],
      inboxCount: inbox.length,
      inboxPreview: inbox.slice(0, 2),
      calendarEvents: calendarEvents as CalEvent[],
      renewals: renewals as Renewal[],
      bins: bins as BinWithDate[],
      pins,
    }
  })
  const [checkedShopIds, setCheckedShopIds] = useState<Set<string>>(new Set())
  const [tonightShows, setTonightShows] = useState<TonightShow[]>(() => loadTonightCache())
  const now = useMemo(() => new Date(), [])
  const firstName = snapshot.user?.name?.split(' ')[0] ?? 'Dan'
  const hour = now.getHours()
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const hasAlerts = snapshot.bins.length > 0 || snapshot.inboxCount > 0

  useEffect(() => {
    let cancelled = false

    fetch('/api/watch/tonight', { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() as Promise<TonightShow[]> : [])
      .then(shows => {
        if (cancelled || !Array.isArray(shows)) return
        setTonightShows(shows)
        saveTonightCache(shows)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  async function toggleShopItem(item: ShoppingItem) {
    const willCheck = !checkedShopIds.has(item.id)
    setCheckedShopIds(prev => {
      const next = new Set(prev)
      if (willCheck) next.add(item.id)
      else next.delete(item.id)
      return next
    })
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'shopping.upsert',
      entityType: 'list_item',
      entityId: item.id,
      operation: 'upsert',
      payload: {
        id: item.id,
        title: item.title,
        checked: willCheck,
        checkedAt: willCheck ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  return (
    <ScreenShell title="Home" showHeader={false}>
      <header className="flex items-start justify-between px-5 pt-7 pb-5">
        <div>
          <p className="mb-1 text-[12px] font-medium tracking-[0.02em] text-text-3">{dateStr}</p>
          <h1 className="text-[30px] font-bold leading-[1.1] text-text-1" style={{ letterSpacing: '-0.025em' }}>{greeting}</h1>
        </div>
        <UserButton name={snapshot.user?.name ?? 'Dan'} email={snapshot.user?.email} />
      </header>

      <AiCapture surface="home" placeholder="Speak or type anything for the house brain" />
      <PinnedBoardLite pins={snapshot.pins} />

      {hasAlerts ? (
        <section className="mx-4 mb-4">
          <div className="mb-3 flex items-center">
            <h2 className="text-[19px] font-bold" style={{ color: '#FF9500', letterSpacing: '-0.01em' }}>Heads up</h2>
          </div>
          <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'var(--surface)' }}>
            {snapshot.bins.map((bin, index) => {
              const dot = BIN_DOT[bin.colour] ?? '#6B7280'
              return (
                <div key={bin.id} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <div className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-white/20" style={{ background: dot }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-text-1">{bin.name}</p>
                    <p className="text-[11.5px] text-text-2">Put out tonight before bed</p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-amber-bg px-2 py-0.5 text-[11px] font-bold text-amber">Tomorrow</span>
                </div>
              )
            })}
            {snapshot.inboxCount > 0 ? (
              <a href="/inbox" className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${snapshot.bins.length > 0 ? 'border-t border-border' : ''}`}>
                <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent">
                  <span className="text-[9px] font-extrabold leading-none text-white">{Math.min(snapshot.inboxCount, 99)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-text-1">{snapshot.inboxCount === 1 ? '1 item to sort' : `${snapshot.inboxCount} items to sort`}</p>
                  {snapshot.inboxPreview[0] ? <p className="truncate text-[11.5px] text-text-2">&ldquo;{snapshot.inboxPreview[0].title}&rdquo;</p> : null}
                </div>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-text-3"><path d="M6 4l4 4-4 4" /></svg>
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {tonightShows.length > 0 ? <OnTonightCard shows={tonightShows} /> : null}

      <ScheduleBlock calendarEvents={snapshot.calendarEvents} tasks={snapshot.tasks} renewals={snapshot.renewals} now={now} />

      <section className="mx-4 mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[19px] font-bold" style={{ color: '#34C759', letterSpacing: '-0.01em' }}>Shopping</h2>
          <a href="/household/shopping" className="text-[13px] font-semibold text-accent">Full list</a>
        </div>
        {snapshot.shoppingItems.length === 0 ? (
          <a href="/household/shopping" className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'var(--surface)' }}>
            <div className="h-5 w-5 shrink-0 rounded-[6px] border-[1.5px] border-border opacity-40" />
            <span className="text-[13.5px] text-text-3">Add shopping items</span>
          </a>
        ) : (
          <div className="rounded-2xl px-2 py-1.5" style={{ border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)', background: 'var(--surface)' }}>
            <div className="grid grid-cols-2 gap-x-3">
              {snapshot.shoppingItems.map(item => {
                const checked = checkedShopIds.has(item.id)
                return (
                  <button key={item.id} onClick={() => toggleShopItem(item)} className="flex min-w-0 items-center gap-2.5 px-2 py-[9px] text-left active:opacity-70">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] transition-transform active:scale-90" style={checked ? { background: item.shopColor, boxShadow: `0 0 0 2px ${item.shopColor}` } : { boxShadow: `0 0 0 2px ${item.shopColor}` }} title={item.shopName}>
                      {checked ? <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M3 8l3.5 3.5L13 4.5" /></svg> : null}
                    </span>
                    <span className={`truncate text-[13.5px] font-medium ${checked ? 'text-text-2 line-through' : 'text-text-1'}`}>{item.title}</span>
                  </button>
                )
              })}
            </div>
            {snapshot.shoppingTotal > snapshot.shoppingItems.length ? <div className="px-2 pt-1 pb-0.5"><span className="text-[12px] text-text-3">+ {snapshot.shoppingTotal - snapshot.shoppingItems.length} more</span></div> : null}
          </div>
        )}
      </section>

      <div className="h-4" />
    </ScreenShell>
  )
}
