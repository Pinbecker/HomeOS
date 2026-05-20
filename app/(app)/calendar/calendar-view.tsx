'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type CalEvent = {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  location: string | null
  description: string | null
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // 0 = Monday
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(year, month, 1 - offset + i))
  }
  return cells
}

function dayKeysForEvent(ev: CalEvent): string[] {
  const start = new Date(ev.start)
  let endMs = ev.end
  // All-day events use an exclusive end (next midnight); pull back to last real day
  if (ev.allDay && ev.end > ev.start) endMs = ev.end - 1
  const end = new Date(endMs)
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const keys: string[] = []
  let guard = 0
  while (cur <= last && guard < 90) {
    keys.push(dateKey(cur))
    cur.setDate(cur.getDate() + 1)
    guard++
  }
  return keys.length ? keys : [dateKey(start)]
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatEventTime(ev: CalEvent): string {
  if (ev.allDay) return 'All day'
  const start = formatTime(ev.start)
  if (ev.end <= ev.start) return start
  return `${start} – ${formatTime(ev.end)}`
}

function formatFullDate(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function CalendarView({ events, calendarName }: { events: CalEvent[]; calendarName: string }) {
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selectedKey, setSelectedKey] = useState(dateKey(today))
  const [detail, setDetail] = useState<CalEvent | null>(null)

  // Map dayKey -> events on that day
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      for (const key of dayKeysForEvent(ev)) {
        const arr = map.get(key)
        if (arr) arr.push(ev)
        else map.set(key, [ev])
      }
    }
    // Sort each day: all-day first, then by start time
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1))
    }
    return map
  }, [events])

  const grid = useMemo(() => buildGrid(view.year, view.month), [view])
  const todayKey = dateKey(today)
  const selectedDayEvents = eventsByDay.get(selectedKey) ?? []
  const selectedDate = (() => {
    const [y, m, d] = selectedKey.split('-').map(Number)
    return new Date(y, m, d)
  })()

  function move(delta: number) {
    setView(v => {
      const m = v.month + delta
      const year = v.year + Math.floor(m / 12)
      const month = ((m % 12) + 12) % 12
      return { year, month }
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
        <button onClick={goToday} className="text-accent text-[16px] font-medium active:opacity-60 px-1">
          Today
        </button>
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
          const key = dateKey(d)
          const inMonth = d.getMonth() === view.month
          const isToday = key === todayKey
          const isSelected = key === selectedKey
          const dayEvents = eventsByDay.get(key) ?? []
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className="flex flex-col items-center pt-1 pb-0.5 active:opacity-60"
            >
              <span
                className={`w-8 h-8 flex items-center justify-center rounded-full text-[15px] ${
                  isToday
                    ? 'bg-accent text-white font-bold'
                    : isSelected
                    ? 'bg-accent-bg text-accent font-semibold'
                    : inMonth
                    ? 'text-text-1'
                    : 'text-text-3'
                }`}
              >
                {d.getDate()}
              </span>
              <div className="flex items-center gap-0.5 h-[5px] mt-0.5">
                {dayEvents.slice(0, 3).map((ev, i) => (
                  <div key={ev.id + i} className={`w-[4px] h-[4px] rounded-full ${inMonth ? 'bg-accent' : 'bg-text-3'}`} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Selected day events */}
      <section className="mt-4 mx-4">
        <p className="text-[13px] font-semibold text-text-2 mb-2 px-1">{formatFullDate(selectedDate)}</p>
        {selectedDayEvents.length === 0 ? (
          <div className="bg-surface rounded-2xl px-4 py-6 text-center">
            <p className="text-[14px] text-text-3">No events</p>
          </div>
        ) : (
          <div className="bg-surface rounded-2xl overflow-hidden">
            {selectedDayEvents.map((ev, i) => (
              <button
                key={ev.id}
                onClick={() => setDetail(ev)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="w-1 self-stretch rounded-full bg-accent shrink-0 my-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-text-1">{ev.title}</p>
                  {ev.location && <p className="text-[12.5px] text-text-2 truncate mt-0.5">{ev.location}</p>}
                </div>
                <span className="text-[12.5px] text-text-2 shrink-0 mt-0.5">{formatEventTime(ev)}</span>
              </button>
            ))}
          </div>
        )}
        <p className="px-1 pt-3 text-[12px] text-text-3 text-center">
          Showing your &ldquo;{calendarName}&rdquo; calendar · read-only
        </p>
      </section>

      <div className="h-4" />

      {/* Event detail sheet */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
            <button onClick={() => setDetail(null)} className="text-accent text-[16px] active:opacity-60">Done</button>
            <span className="text-[16px] font-semibold text-text-1">Event</span>
            <span className="w-12" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-1.5 self-stretch rounded-full bg-accent shrink-0" />
              <h2 className="text-[22px] font-bold text-text-1 leading-tight">{detail.title}</h2>
            </div>

            <div className="bg-surface rounded-2xl overflow-hidden">
              <div className="px-4 py-3">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-text-3 mb-0.5">When</p>
                <p className="text-[15px] text-text-1">{formatFullDate(new Date(detail.start))}</p>
                <p className="text-[14px] text-text-2 mt-0.5">{formatEventTime(detail)}</p>
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
