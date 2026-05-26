import { useEffect, useMemo, useState } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

type ShoppingItem = { id: string; title: string; shopName: string; shopColor: string }
type Task = { id: string; title: string; dueDate: Date; listId: string | null; assignee: string | null; color: string }
type Renewal = { id: string; title: string; label: string | null; date: Date; href: string }
type CalEvent = { id: string; title: string; startsAt: Date; allDay: boolean; location: string | null; timeLabel: string; color: string }
type BinWithDate = { id: string; name: string; colour: string; nextCollection: Date }
type TimelineEntry =
  | { kind: 'calendar'; id: string; eventId: string; title: string; sortMs: number; timeLabel: string; sub: string | null; color: string }
  | { kind: 'task'; id: string; title: string; sortMs: number; taskId: string; listId: string | null; assignee: string | null; overdue: boolean; color: string }
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
  return date.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })
}

function getNextRecurringDate(firstCollectionDate: string, intervalWeeks: number) {
  const today = startOfLocalDay(new Date())
  const next = new Date(`${firstCollectionDate}T00:00:00`)
  const intervalDays = intervalWeeks * 7
  while (next < today) next.setDate(next.getDate() + intervalDays)
  return next
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

function UserButton({ name, email }: { name: string; email?: string | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-white transition-transform active:scale-95" aria-label="Account menu">
        {name.charAt(0).toUpperCase()}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] mx-auto flex max-w-lg flex-col justify-end">
          <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative rounded-t-3xl bg-bg px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="mb-2 flex items-center gap-3 px-2 py-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-[18px] font-bold text-white">{name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0">
                <p className="truncate text-[17px] font-bold text-text-1">{name}</p>
                {email ? <p className="truncate text-[13px] text-text-2">{email}</p> : null}
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="h-11 w-full rounded-xl bg-surface text-[15px] font-semibold text-accent active:bg-surface-2">Done</button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function AiCaptureLite() {
  const [text, setText] = useState('')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    const id = makeId('inbox')
    const now = new Date().toISOString()
    const current = getCurrentState()
    const payload = {
      id,
      householdId: current.data.household[0]?.id ?? 'default',
      createdById: current.data.users[0]?.id ?? 'system',
      type: 'inbox',
      title: value,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    }
    setText('')
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'inbox.upsert',
      entityType: 'item',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({ ...prev, data: { ...prev.data, items: [...prev.data.items, payload] } }))
  }

  return (
    <section className="mx-4 mb-4">
      <div className="rounded-2xl border border-border bg-surface px-3 py-3">
        <form onSubmit={submit}>
          <div className="flex items-center gap-2">
            <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white" aria-label="Record voice note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
            <input
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Speak or type anything for the house brain"
              className="h-11 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[14px] font-medium text-text-1 outline-none placeholder:text-text-3"
            />
            <button type="submit" disabled={!text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white disabled:opacity-40" aria-label="Capture">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </section>
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

function TimelineRow({ entry, doneIds, onToggle, hasBorder }: { entry: TimelineEntry; doneIds: Set<string>; onToggle: (id: string) => void; hasBorder: boolean }) {
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
    const done = doneIds.has(entry.taskId)
    return (
      <div className={`flex items-center gap-3 px-4 py-3 ${border}`}>
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

function GroupedTimeline({ groups, doneIds, onToggle }: { groups: DayGroup[]; doneIds: Set<string>; onToggle: (id: string) => void }) {
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
          {group.entries.map((entry, entryIndex) => <TimelineRow key={entry.id} entry={entry} doneIds={doneIds} onToggle={onToggle} hasBorder={entryIndex > 0} />)}
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
    const willComplete = !doneIds.has(id)
    setDoneIds(prev => {
      const next = new Set(prev)
      if (willComplete) next.add(id)
      else next.delete(id)
      return next
    })
    const task = tasks.find(row => row.id === id)
    if (!task) return
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
        <GroupedTimeline groups={combinedGroups} doneIds={doneIds} onToggle={toggleTask} />
      ) : (
        <div className="flex flex-col gap-4">
          {eventGroups.length > 0 ? <div><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Events</p><GroupedTimeline groups={eventGroups} doneIds={doneIds} onToggle={toggleTask} /></div> : null}
          {taskGroups.length > 0 ? <div><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Tasks</p><GroupedTimeline groups={taskGroups} doneIds={doneIds} onToggle={toggleTask} /></div> : null}
          {renewalGroups.length > 0 ? <div><p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Renewals</p><GroupedTimeline groups={renewalGroups} doneIds={doneIds} onToggle={toggleTask} /></div> : null}
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
  const snapshot = useAppState(state => {
    const now = new Date()
    const startToday = startOfLocalDay(now)
    const scheduleWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 31, 23, 59, 59)
    const renewalWindow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30, 23, 59, 59)
    const lists = state.data.lists
    const listColorMap = new Map(lists.map(list => [list.id, list.color ?? '#FF9500']))
    const shopMap = new Map(lists.filter(list => list.type === 'shopping' && !list.archived).map(list => [list.id, { name: list.icon === 'general-shopping' ? 'General' : list.name, color: list.color ?? '#34C759' }]))
    const shoppingAll = state.data.listItems
      .filter(item => !item.deletedAt && !item.checked && shopMap.has(item.listId))
      .sort((a, b) => a.sortOrder - b.sortOrder || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(item => ({ id: item.id, title: item.title, shopName: shopMap.get(item.listId)!.name, shopColor: shopMap.get(item.listId)!.color }))
    const tasks = state.data.items
      .filter(item => item.type === 'task' && item.status === 'active' && !item.deletedAt && item.dueDate)
      .map(item => {
        const dueDate = toDate(item.dueDate)!
        return {
          id: item.id,
          title: item.title,
          dueDate,
          listId: item.listId ?? null,
          assignee: item.assigneeId ? state.data.users.find(user => user.id === item.assigneeId)?.name ?? null : null,
          color: item.listId ? listColorMap.get(item.listId) ?? '#FF9500' : '#FF9500',
        }
      })
      .filter(task => task.dueDate <= scheduleWindow)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    const inbox = state.data.items.filter(item => item.type === 'inbox' && item.status === 'active' && !item.deletedAt).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const calendarEvents = state.data.calendarEvents
      .map(event => ({ ...event, startsAtDate: toDate(event.startsAt)! }))
      .filter(event => event.startsAtDate >= startToday && event.startsAtDate <= scheduleWindow)
      .sort((a, b) => a.startsAtDate.getTime() - b.startsAtDate.getTime())
      .slice(0, 60)
      .map(event => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAtDate,
        allDay: event.allDay ?? false,
        location: event.location ?? null,
        timeLabel: eventTimeLabel(event.startsAtDate, event.allDay ?? false),
        color: '#007AFF',
      }))
    const renewals = state.data.records
      .flatMap(record => {
        const renewalDate = toDate(record.renewalDate)
        if (!renewalDate || renewalDate > renewalWindow) return []
        return [{ id: record.id, title: record.title, label: record.renewalLabel ?? null, date: renewalDate, href: `/life/admin/${record.id}` }]
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    const binsSource = state.data.bins.filter(bin => bin.active !== false && bin.anchorDate)
    const bins = (binsSource.length > 0 ? binsSource.map(bin => ({
      id: bin.id,
      name: bin.name,
      colour: bin.colour,
      nextCollection: getNextRecurringDate(bin.anchorDate as string, Math.max(1, bin.intervalWeeks)),
    })) : STATIC_BIN_SCHEDULES.map(bin => ({
      id: bin.id,
      name: bin.name,
      colour: bin.colour,
      nextCollection: getNextRecurringDate(bin.firstCollectionDate, bin.intervalWeeks),
    }))).filter(bin => dayDiffFrom(bin.nextCollection.getTime(), now) === 1)
    const pins = state.data.items
      .filter(item => item.type === 'note' && item.pinned && item.status === 'active' && !item.deletedAt)
      .sort((a, b) => new Date(b.pinnedAt ?? b.updatedAt).getTime() - new Date(a.pinnedAt ?? a.updatedAt).getTime())
      .map(item => ({ id: item.id, title: item.title, body: item.body }))
    const watch = state.data.items
      .filter(item => item.type === 'watchlist_tv' && item.status === 'active' && !item.deletedAt)
      .slice(0, 0)
      .map(item => ({ title: item.title, channel: 'TV', airtime: 'Tonight', channelId: String(item.metadata?.channel ?? ''), atMs: now.getTime() }))

    return {
      user: state.data.users[0],
      shoppingItems: shoppingAll.slice(0, 12) as ShoppingItem[],
      shoppingTotal: shoppingAll.length,
      tasks: tasks as Task[],
      inboxCount: inbox.length,
      inboxPreview: inbox.slice(0, 2),
      calendarEvents: calendarEvents as CalEvent[],
      renewals: renewals as Renewal[],
      bins: bins as BinWithDate[],
      pins,
      tonightShows: watch,
    }
  })
  const [checkedShopIds, setCheckedShopIds] = useState<Set<string>>(new Set())
  const now = useMemo(() => new Date(), [])
  const firstName = snapshot.user?.name?.split(' ')[0] ?? 'Dan'
  const hour = now.getHours()
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const hasAlerts = snapshot.bins.length > 0 || snapshot.inboxCount > 0

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

      <AiCaptureLite />
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

      {snapshot.tonightShows.length > 0 ? <OnTonightCard shows={snapshot.tonightShows} /> : null}

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
