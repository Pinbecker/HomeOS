'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { allDayAsLocal, localDayKey } from '@/lib/utils/calendar'
import { toggleTask } from '@/app/(app)/household/tasks/actions'

type CalEvent = {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  location: string | null
  description: string | null
}
type CalTask = {
  id: string
  title: string
  due: number
  listId: string | null
  completed: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const TASK_COLOR = '#FF9500'
const EVENT_COLOR = '#007AFF'

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // 0 = Monday
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, 1 - offset + i))
  return cells
}

// Day keys an event touches. All-day events are read in UTC (stored at UTC
// midnight, exclusive end); timed events in the viewer's local time.
function eventDayKeys(ev: CalEvent): string[] {
  if (ev.allDay) {
    const start = new Date(ev.start)
    const endExclusiveMs = ev.end > ev.start ? ev.end : ev.start + 86_400_000
    const lastInclusive = new Date(endExclusiveMs - 1)
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    const lastDay = new Date(Date.UTC(lastInclusive.getUTCFullYear(), lastInclusive.getUTCMonth(), lastInclusive.getUTCDate()))
    const keys: string[] = []
    let guard = 0
    while (cur <= lastDay && guard < 366) {
      keys.push(`${cur.getUTCFullYear()}-${cur.getUTCMonth()}-${cur.getUTCDate()}`)
      cur.setUTCDate(cur.getUTCDate() + 1)
      guard++
    }
    return keys
  }
  const start = new Date(ev.start)
  const end = new Date(ev.end > ev.start ? ev.end : ev.start)
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const keys: string[] = []
  let guard = 0
  while (cur <= last && guard < 90) {
    keys.push(localDayKey(cur))
    cur.setDate(cur.getDate() + 1)
    guard++
  }
  return keys
}

function isMultiDay(ev: CalEvent): boolean {
  return eventDayKeys(ev).length > 1
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function eventTimeLabel(ev: CalEvent): string {
  if (ev.allDay) return 'All day'
  const start = formatTime(ev.start)
  if (ev.end <= ev.start) return start
  return `${start} – ${formatTime(ev.end)}`
}

// Date / range line for an event's detail + day list.
function eventDateLine(ev: CalEvent): string {
  if (ev.allDay) {
    const startLocal = allDayAsLocal(new Date(ev.start))
    const endExclusiveMs = ev.end > ev.start ? ev.end : ev.start + 86_400_000
    const lastLocal = allDayAsLocal(new Date(endExclusiveMs - 1))
    if (startLocal.getTime() === lastLocal.getTime()) {
      return startLocal.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    }
    const a = startLocal.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    const b = lastLocal.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return `${a} – ${b}`
  }
  return new Date(ev.start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function fullDate(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function CalendarView({ events, tasks, calendarName }: { events: CalEvent[]; tasks: CalTask[]; calendarName: string }) {
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selectedKey, setSelectedKey] = useState(localDayKey(today))
  const [detail, setDetail] = useState<CalEvent | null>(null)
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()

  function toggleCalTask(id: string, current: boolean) {
    setTaskOverrides(prev => ({ ...prev, [id]: !current }))
    startTransition(() => { toggleTask(id) })
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      for (const key of eventDayKeys(ev)) {
        const arr = map.get(key)
        if (arr) arr.push(ev)
        else map.set(key, [ev])
      }
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1))
    }
    return map
  }, [events])

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalTask[]>()
    for (const t of tasks) {
      const d = new Date(t.due)
      const key = localDayKey(d)
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
  }, [tasks])

  const grid = useMemo(() => buildGrid(view.year, view.month), [view])
  const todayKey = localDayKey(today)
  const selectedEvents = eventsByDay.get(selectedKey) ?? []
  const selectedTasks = tasksByDay.get(selectedKey) ?? []
  const selectedDate = (() => {
    const [y, m, d] = selectedKey.split('-').map(Number)
    return new Date(y, m, d)
  })()

  function move(delta: number) {
    setView(v => {
      const m = v.month + delta
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
    })
  }
  function goToday() {
    setView({ year: today.getFullYear(), month: today.getMonth() })
    setSelectedKey(todayKey)
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      {/* Nav bar */}
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Home</span>
        </Link>
        <button onClick={goToday} className="text-accent text-[16px] font-medium active:opacity-60 px-1">Today</button>
      </div>

      {/* Month header */}
      <header className="px-5 pt-1 pb-2 flex items-center justify-between">
        <h1 className="text-[26px] font-bold text-text-1 tracking-tight">
          {MONTHS[view.month]} <span className="text-text-2 font-semibold">{view.year}</span>
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="w-9 h-9 rounded-full flex items-center justify-center text-accent active:bg-surface-2" aria-label="Previous month">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button onClick={() => move(1)} className="w-9 h-9 rounded-full flex items-center justify-center text-accent active:bg-surface-2" aria-label="Next month">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Weekday labels */}
      <div className="px-3 grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-text-3 py-1">{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="px-3 grid grid-cols-7 gap-y-1">
        {grid.map(d => {
          const key = localDayKey(d)
          const inMonth = d.getMonth() === view.month
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const dayEvents = eventsByDay.get(key) ?? []
          const dayTasks = tasksByDay.get(key) ?? []
          const dots: string[] = [
            ...dayEvents.map(() => EVENT_COLOR),
            ...dayTasks.map(() => TASK_COLOR),
          ].slice(0, 3)
          return (
            <button key={key} onClick={() => setSelectedKey(key)} className="flex flex-col items-center pt-1 pb-0.5 active:opacity-60">
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full text-[15px] ${
                  isToday ? 'bg-accent text-white font-bold'
                  : isSelected ? 'bg-accent-bg text-accent font-semibold'
                  : inMonth ? 'text-text-1' : 'text-text-3'
                }`}
              >
                {d.getDate()}
              </span>
              <div className="flex items-center gap-0.5 h-[5px] mt-0.5">
                {dots.map((c, i) => (
                  <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ background: inMonth ? c : 'var(--color-text-3)' }} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected day */}
      <section className="mt-4 mx-4">
        <p className="text-[13px] font-semibold text-text-2 mb-2 px-1">{fullDate(selectedDate)}</p>
        {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
          <div className="bg-surface rounded-2xl px-4 py-6 text-center">
            <p className="text-[14px] text-text-3">Nothing on</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl overflow-hidden">
            {selectedEvents.map((ev, i) => (
              <button
                key={ev.id}
                onClick={() => setDetail(ev)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="w-1 self-stretch rounded-full shrink-0 my-0.5" style={{ background: EVENT_COLOR }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-text-1">{ev.title}</p>
                  {ev.location && <p className="text-[12.5px] text-text-2 truncate mt-0.5">{ev.location}</p>}
                  {isMultiDay(ev) && <p className="text-[12px] text-text-3 mt-0.5">{eventDateLine(ev)}</p>}
                </div>
                <span className="text-[12.5px] text-text-2 shrink-0 mt-0.5">{eventTimeLabel(ev)}</span>
              </button>
            ))}

            {selectedTasks.map((t, i) => {
              const completed = taskOverrides[t.id] ?? t.completed
              return (
                <div
                  key={t.id}
                  className={`w-full flex items-center gap-3 px-4 py-3 ${(selectedEvents.length + i) > 0 ? 'border-t border-border' : ''}`}
                >
                  <button
                    onClick={() => toggleCalTask(t.id, completed)}
                    className="w-[18px] h-[18px] rounded-full shrink-0 flex items-center justify-center active:scale-90 transition-transform"
                    style={completed ? { background: TASK_COLOR } : { border: `2px solid ${TASK_COLOR}` }}
                    aria-label={completed ? `Mark "${t.title}" incomplete` : `Mark "${t.title}" complete`}
                  >
                    {completed && (
                      <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <path d="M4 10.5l4 4 8-9" />
                      </svg>
                    )}
                  </button>
                  <Link
                    href={`/household/tasks/${t.listId ?? 'all'}`}
                    className="flex-1 min-w-0 flex items-center gap-3 active:opacity-70"
                  >
                    <p className={`flex-1 text-[15px] font-medium truncate ${completed ? 'text-text-3 line-through' : 'text-text-1'}`}>{t.title}</p>
                    <span className="text-[11px] font-bold shrink-0" style={{ color: TASK_COLOR }}>Task</span>
                  </Link>
                </div>
              )
            })}
          </div>
        )}
        <p className="px-1 pt-3 text-[12px] text-text-3 text-center">
          Events from &ldquo;{calendarName}&rdquo; (read-only) · tasks shown in orange
        </p>
      </section>

      <div className="h-4" />

      {/* Event detail */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
            <button onClick={() => setDetail(null)} className="text-accent text-[16px] active:opacity-60">Done</button>
            <span className="text-[16px] font-semibold text-text-1">Event</span>
            <span className="w-12" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: EVENT_COLOR }} />
              <h2 className="text-[22px] font-bold text-text-1 leading-tight">{detail.title}</h2>
            </div>

            <div className="bg-surface rounded-2xl overflow-hidden">
              <div className="px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-text-3 mb-0.5">When</p>
                <p className="text-[15px] text-text-1">{eventDateLine(detail)}</p>
                <p className="text-[14px] text-text-2 mt-0.5">{eventTimeLabel(detail)}</p>
              </div>
              {detail.location && (
                <div className="px-4 py-3 border-t border-border">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-text-3 mb-0.5">Location</p>
                  <p className="text-[15px] text-text-1">{detail.location}</p>
                </div>
              )}
            </div>

            {detail.description && (
              <div className="bg-surface rounded-2xl px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-text-3 mb-1">Notes</p>
                <p className="text-[14px] text-text-1 whitespace-pre-wrap leading-relaxed">{detail.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
