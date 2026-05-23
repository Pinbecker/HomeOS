'use client'

import { useState, useMemo, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { allDayAsLocal, localDayKey } from '@/lib/utils/calendar'
import { toggleTask } from '@/app/(app)/household/tasks/actions'
import { EventEditor } from './event-editor'

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
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const TASK_COLOR = '#FF9500'
const EVENT_COLOR = '#007AFF'

const DEFAULT_ROW_H = 86
const MIN_ROW_H = 40
const MAX_ROW_H = 140

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, 1 - offset + i))
  // Drop any week row where no day belongs to this month (removes blank leading/trailing rows)
  return cells.filter((_, i) => {
    const weekStart = Math.floor(i / 7) * 7
    return cells.slice(weekStart, weekStart + 7).some(d => d.getMonth() === month)
  })
}

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
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function cellTime(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, '0')}`
}


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

export function CalendarView({
  events,
  tasks,
  calendarName,
  connected,
  connectedEmail,
  notice,
}: {
  events: CalEvent[]
  tasks: CalTask[]
  calendarName: string
  connected: boolean
  connectedEmail: string | null
  notice: string | null
}) {
  const router = useRouter()
  const [today] = useState(() => new Date())
  const todayKey = localDayKey(today)

  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_H)
  const rowHeightRef = useRef(DEFAULT_ROW_H)
  useEffect(() => { rowHeightRef.current = rowHeight }, [rowHeight])

  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [visibleMonthKey, setVisibleMonthKey] = useState(`${today.getFullYear()}-${today.getMonth()}`)
  const [detail, setDetail] = useState<CalEvent | null>(null)
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalEvent | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [banner, setBanner] = useState<string | null>(
    notice === 'connected' ? 'Google Calendar connected.'
    : notice === 'denied' ? 'Google connection cancelled.'
    : notice === 'error' ? 'Could not connect to Google. Please try again.'
    : null,
  )

  // Months to render: 6 back → 24 ahead
  const monthList = useMemo(() => {
    const list: Array<{ year: number; month: number; grid: Date[] }> = []
    for (let i = -6; i <= 24; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      list.push({ year: d.getFullYear(), month: d.getMonth(), grid: buildGrid(d.getFullYear(), d.getMonth()) })
    }
    return list
  }, [today])

  const scrollRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef<{ dist: number; height: number } | null>(null)

  // Scroll to today's month on mount
  useEffect(() => {
    const el = document.getElementById(`cal-month-${today.getFullYear()}-${today.getMonth()}`)
    el?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [today])

  // Lock page-level scroll — the calendar manages its own internal scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Auto-refresh data every 60s
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000)
    return () => clearInterval(id)
  }, [router])

  // IntersectionObserver: track which month is at the top of the scroll
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      (entries) => {
        const topmost = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (topmost) {
          const key = topmost.target.getAttribute('data-monthkey')
          if (key) setVisibleMonthKey(key)
        }
      },
      { root: container, threshold: 0, rootMargin: '0px 0px -85% 0px' },
    )
    monthList.forEach(({ year, month }) => {
      const el = document.getElementById(`cal-month-${year}-${month}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [monthList])

  // Pinch-to-zoom: must use native listeners with passive:false to preventDefault
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), height: rowHeightRef.current }
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length !== 2 || !pinchRef.current) return
      e.preventDefault() // blocks browser zoom / scroll during pinch
      const dx = e.touches[0].clientX - e.touches[1].clientX
      const dy = e.touches[0].clientY - e.touches[1].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / pinchRef.current.dist
      const newH = Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, Math.round(pinchRef.current.height * ratio)))
      rowHeightRef.current = newH
      setRowHeight(newH)
    }

    function onTouchEnd() {
      pinchRef.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // ── Event / task maps ──────────────────────────────────────────────────

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
      const key = localDayKey(new Date(t.due))
      const arr = map.get(key)
      if (arr) arr.push(t)
      else map.set(key, [t])
    }
    return map
  }, [tasks])

  // ── Derived state ───────────────────────────────────────────────────────

  const [vm_year, vm_month] = visibleMonthKey.split('-').map(Number)

  const selectedDate = (() => {
    const [y, m, d] = selectedKey.split('-').map(Number)
    return new Date(y, m, d)
  })()
  const selectedEvents = eventsByDay.get(selectedKey) ?? []
  const selectedTasks = tasksByDay.get(selectedKey) ?? []

  // How many event pills fit in a cell at current row height
  const maxPills = rowHeight >= 100 ? 3 : rowHeight >= 68 ? 2 : rowHeight >= 50 ? 1 : 0

  // ── Actions ─────────────────────────────────────────────────────────────

  function toggleCalTask(id: string, current: boolean) {
    setTaskOverrides(prev => ({ ...prev, [id]: !current }))
    startTransition(() => { toggleTask(id) })
  }

  function goToday() {
    setSelectedKey(todayKey)
    document.getElementById(`cal-month-${today.getFullYear()}-${today.getMonth()}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function openCreate() { setEditingEvent(null); setEditorOpen(true) }
  function openEdit(ev: CalEvent) { setEditingEvent(ev); setEditorOpen(true) }
  function onEditorSaved() { setEditorOpen(false); setEditingEvent(null); setDetail(null); router.refresh() }

  async function deleteEvent(ev: CalEvent) {
    if (!confirm(`Delete "${ev.title}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events/${ev.id}`, { method: 'DELETE' })
      if (res.ok) { setDetail(null); router.refresh() }
      else if (res.status === 409) setBanner('Connect your Google account before editing events.')
      else setBanner('Could not delete the event. Please try again.')
    } finally { setDeleting(false) }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col max-w-lg mx-auto" style={{ height: 'calc(100dvh - calc(96px + env(safe-area-inset-bottom)))' }}>

      {/* ── Top bar ── */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
        <Link href="/" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Home</span>
        </Link>
        <span className="text-[17px] font-bold text-text-1">
          {MONTHS[vm_month]} <span className="text-text-2 font-semibold text-[15px]">{vm_year}</span>
        </span>
        <div className="flex items-center gap-1">
          <button onClick={goToday} className="text-accent text-[16px] font-medium active:opacity-60 px-1">Today</button>
          {connected && (
            <button onClick={openCreate} aria-label="Add event" className="w-9 h-9 rounded-full flex items-center justify-center text-accent active:bg-surface-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div className="mx-4 mb-1 rounded-xl bg-accent-bg px-3.5 py-2 flex items-center justify-between gap-3 flex-shrink-0">
          <p className="text-[13px] text-accent font-medium">{banner}</p>
          <button onClick={() => setBanner(null)} className="text-accent text-[13px] font-semibold active:opacity-60">Dismiss</button>
        </div>
      )}

      {/* ── Sticky weekday labels ── */}
      <div className="px-2 grid grid-cols-7 border-b border-border flex-shrink-0">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-text-3 py-1">{d}</div>
        ))}
      </div>

      {/* ── Scrollable months ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain">
        {monthList.map(({ year, month, grid }) => (
          <section
            key={`${year}-${month}`}
            id={`cal-month-${year}-${month}`}
            data-monthkey={`${year}-${month}`}
          >
            {/* Month label */}
            <div className="px-3 pt-3 pb-1">
              <span className="text-[12px] font-bold text-text-3 uppercase tracking-wider">
                {MONTHS_SHORT[month]} {year}
              </span>
            </div>

            {/* 6-week grid */}
            <div className="px-2 grid grid-cols-7">
              {grid.map(d => {
                const key = localDayKey(d)
                const inMonth = d.getMonth() === month

                // Cells outside this month are blank spacers — no date, no events
                if (!inMonth) {
                  return <div key={key} className="border-t border-border" style={{ height: rowHeight }} />
                }

                const isToday = key === todayKey
                const isSelected = key === selectedKey
                const dayEvents = eventsByDay.get(key) ?? []
                const dayTasks = tasksByDay.get(key) ?? []
                const allItems = [
                  ...dayEvents.map(e => ({ id: e.id, title: e.title, color: EVENT_COLOR, time: e.allDay ? null : e.start })),
                  ...dayTasks.map(t => ({ id: t.id, title: t.title, color: TASK_COLOR, time: null })),
                ]
                const displayItems = allItems.slice(0, maxPills)
                const overflow = allItems.length - displayItems.length

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedKey(key)}
                    className="flex flex-col items-start px-0.5 pt-1 pb-0.5 overflow-hidden border-t border-border active:opacity-70"
                    style={{ height: rowHeight }}
                  >
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] mb-[2px] flex-shrink-0 ${
                      isToday ? 'bg-accent text-white font-bold'
                      : isSelected ? 'bg-accent-bg text-accent font-semibold'
                      : 'text-text-1'
                    }`}>
                      {d.getDate()}
                    </span>

                    {maxPills > 0 && displayItems.map(item => (
                      <div
                        key={item.id}
                        className="w-full rounded text-[9px] font-medium px-1 py-[1.5px] mb-[1.5px] truncate leading-tight flex-shrink-0"
                        style={{ background: item.color, color: 'white' }}
                      >
                        {item.time !== null ? `${cellTime(item.time)} ${item.title}` : item.title}
                      </div>
                    ))}

                    {maxPills > 0 && overflow > 0 && (
                      <span className="text-[8px] text-text-3 px-0.5 flex-shrink-0">+{overflow}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
        <div className="h-3" />
      </div>

      {/* ── Selected day panel ── */}
      <div className="flex-shrink-0 border-t border-border bg-bg">
        <div className="flex items-center justify-between px-4 pt-2 pb-0.5">
          <p className="text-[13px] font-semibold text-text-2">{fullDate(selectedDate)}</p>
          {connected && (
            <button onClick={openCreate} className="text-accent text-[14px] font-medium active:opacity-60">+ Add</button>
          )}
        </div>

        <div className="overflow-y-auto px-4 pb-2" style={{ maxHeight: 'min(38vh, 260px)' }}>
          {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
            <p className="text-[14px] text-text-3 py-3 text-center">Nothing on</p>
          ) : (
            <div className="bg-surface rounded-2xl overflow-hidden mb-2">
              {selectedEvents.map((ev, i) => (
                <button
                  key={ev.id}
                  onClick={() => setDetail(ev)}
                  className={`w-full flex items-start gap-3 px-4 py-1.5 text-left active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="w-1 self-stretch rounded-full shrink-0 my-0.5" style={{ background: EVENT_COLOR }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-text-1">{ev.title}</p>
                    {ev.location && <p className="text-[12.5px] text-text-2 truncate mt-0.5">{ev.location}</p>}
                    {isMultiDay(ev) && <p className="text-[12px] text-text-3 mt-0.5">{eventDateLine(ev)}</p>}
                  </div>
                  <div className="shrink-0 mt-0.5 text-right">
                    {ev.allDay ? (
                      <p className="text-[12.5px] text-text-2">All day</p>
                    ) : (
                      <>
                        <p className="text-[12.5px] text-text-2">{formatTime(ev.start)}</p>
                        <p className="text-[12.5px] text-text-2">{formatTime(ev.end > ev.start ? ev.end : ev.start)}</p>
                      </>
                    )}
                  </div>
                </button>
              ))}

              {selectedTasks.map((t, i) => {
                const completed = taskOverrides[t.id] ?? t.completed
                return (
                  <div
                    key={t.id}
                    className={`w-full flex items-center gap-3 px-4 py-1.5 ${(selectedEvents.length + i) > 0 ? 'border-t border-border' : ''}`}
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
                    <p className={`flex-1 text-[15px] font-medium truncate ${completed ? 'text-text-3 line-through' : 'text-text-1'}`}>{t.title}</p>
                    <span className="text-[11px] font-bold shrink-0" style={{ color: TASK_COLOR }}>Task</span>
                  </div>
                )
              })}
            </div>
          )}

          {connected ? (
            <p className="text-[11px] text-text-3 text-center">
              Synced with &ldquo;{calendarName}&rdquo;{connectedEmail ? ` · ${connectedEmail}` : ''}
            </p>
          ) : (
            <div className="bg-surface rounded-2xl px-4 py-4 text-center">
              <p className="text-[14px] font-semibold text-text-1">Connect Google Calendar</p>
              <p className="text-[12px] text-text-3 mt-1 mb-3">Link your Google account to see and add events on &ldquo;{calendarName}&rdquo;.</p>
              <a href="/api/google/connect" className="inline-flex items-center justify-center rounded-full bg-accent text-white text-[14px] font-semibold px-4 py-2 active:opacity-80">
                Connect Google
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── Event detail modal ── */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-bg flex flex-col max-w-lg mx-auto">
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
            <button onClick={() => setDetail(null)} className="text-accent text-[16px] active:opacity-60">Done</button>
            <span className="text-[16px] font-semibold text-text-1">Event</span>
            {connected ? (
              <button onClick={() => openEdit(detail)} className="text-accent text-[16px] font-semibold active:opacity-60">Edit</button>
            ) : (
              <span className="w-12" />
            )}
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
                {detail.allDay ? (
                  <p className="text-[14px] text-text-2 mt-0.5">All day</p>
                ) : (
                  <div className="mt-0.5">
                    <p className="text-[14px] text-text-2">{formatTime(detail.start)}</p>
                    <p className="text-[14px] text-text-2">{formatTime(detail.end > detail.start ? detail.end : detail.start)}</p>
                  </div>
                )}
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

            {connected && (
              <button
                onClick={() => deleteEvent(detail)}
                disabled={deleting}
                className="mt-2 w-full bg-surface rounded-2xl px-4 py-3 text-[15px] font-semibold text-red active:bg-surface-2 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete event'}
              </button>
            )}
          </div>
        </div>
      )}

      {editorOpen && (
        <EventEditor
          initialDate={selectedDate}
          event={editingEvent}
          onClose={() => { setEditorOpen(false); setEditingEvent(null) }}
          onSaved={onEditorSaved}
        />
      )}
    </div>
  )
}
