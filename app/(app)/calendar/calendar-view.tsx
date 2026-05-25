'use client'

import React, { useState, useMemo, useTransition, useEffect, useLayoutEffect, useRef } from 'react'
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
  calendarId: string | null
}

type CalFeed = {
  id: string
  name: string
  url: string
  color: string
  enabled: boolean
  lastSyncedAt: Date | null
  errorMessage: string | null
}
type CalTask = {
  id: string
  title: string
  due: number
  listId: string | null
  completed: boolean
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const TASK_COLOR = '#FF9500'

const DEFAULT_ROW_H = 112
const MIN_ROW_H = 40
const MAX_ROW_H = 170

// ── Calendar colour swatches ─────────────────────────────────────────────────
const CAL_COLORS = [
  '#007AFF', // Blue (default — matches iOS Calendar)
  '#34C759', // Green
  '#FF3B30', // Red
  '#FF9500', // Orange
  '#FF2D55', // Pink
  '#AF52DE', // Purple
  '#5856D6', // Indigo
  '#00C7BE', // Teal
  '#FFCC00', // Yellow
  '#8E8E93', // Grey
]
const DEFAULT_CAL_COLOR = '#007AFF'

// ── Bar layout constants ─────────────────────────────────────────────────────
const BAR_GAP         = 2    // vertical gap between stacked multi-day bars in px
const MIN_BAR_H       = 13   // minimum bar height before we hide bars and show dots
const DATE_H          = 36   // px reserved for the date-number circle per cell
const MULTI_DAY_BAR_H = 16   // compact fixed height for all-day / multi-day overlay bars
const PILL_GAP        = 3    // vertical gap between stacked single-day pills
const MIN_PILL_H      = 16   // single-line title only
const MAX_PILL_H      = 46   // roomy: 2-line title + time (iOS-style), never taller

// ── iOS-style event tints ────────────────────────────────────────────────────
// Soft fill = colour washed over the surface, so it stays pale in light mode and a
// muted dark tint in dark mode. Text = colour nudged toward the label colour so it
// keeps contrast against its own tint in either theme (the "coloured-on-pastel" look).
const pillBg   = (color: string) => `color-mix(in srgb, ${color} 18%, var(--surface))`
const pillText = (color: string) => `color-mix(in srgb, ${color} 72%, var(--text-1))`

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

// Scroll offset of `el` within `container`. Computed from bounding rects so it's
// correct regardless of nesting — day cells live inside a `position: relative` week
// row, so `el.offsetTop` is relative to that row, NOT the scroll container.
function scrollOffsetWithin(container: HTMLElement, el: HTMLElement): number {
  return container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top
}

// ── Week layout computation ─────────────────────────────────────────────────

type WeekBarItem = {
  id: string
  title: string
  color: string
  time: number | null    // null = all-day; else epoch ms
  startCol: number       // 0–6 within this week
  spanCols: number       // 1–7
  lane: number
  roundLeft: boolean     // true → event starts in this week segment (round left edge)
  roundRight: boolean    // true → event ends in this week segment (round right edge)
  event: CalEvent | null
}

type SingleDayItem = {
  id: string
  title: string
  color: string
  time: number | null
  event: CalEvent | null
  task: CalTask | null
}

/** Per-week layout: multi-day bars in a shared overlay + per-column single-day items. */
type WeekLayout = {
  multiDayBars:      WeekBarItem[]       // spanning bars for the absolute overlay
  singleDayCols:     SingleDayItem[][]   // [col 0–6] single-day events / tasks per column
  colMultiDayLanes:  number[]            // # overlay lanes occupied in each column
}

/**
 * Compute the full layout for a single 7-day week row.
 *
 * All-day and multi-day events go into `multiDayBars` (compact fixed-height overlay).
 * Single-day timed events and tasks go into `singleDayCols` so each column can
 * independently fill its remaining height.
 */
function computeWeekLayout(
  weekDays: Date[],
  month: number,
  events: CalEvent[],
  tasks: CalTask[],
  getEventColor: (ev: CalEvent) => string,
): WeekLayout {
  const weekKeys = weekDays.map(d => localDayKey(d))

  type Candidate = {
    id: string; title: string; color: string; time: number | null
    startCol: number; endCol: number
    roundLeft: boolean; roundRight: boolean
    event: CalEvent | null
    task: CalTask | null
    isMulti: boolean  // true → overlay; false → per-cell column
  }

  const candidates: Candidate[] = []

  for (const ev of events) {
    const evKeys = eventDayKeys(ev)
    const evSet  = new Set(evKeys)
    let startCol = -1, endCol = -1
    for (let c = 0; c < 7; c++) {
      if (evSet.has(weekKeys[c])) {
        if (startCol === -1) startCol = c
        endCol = c
      }
    }
    if (startCol === -1) continue
    // Skip if no part of the event is in this calendar month
    if (!weekDays.some((d, c) => d.getMonth() === month && evSet.has(weekKeys[c]))) continue

    const spanCols = endCol - startCol + 1
    candidates.push({
      id:         ev.id,
      title:      ev.title,
      color:      getEventColor(ev),
      time:       ev.allDay ? null : ev.start,
      startCol,
      endCol,
      roundLeft:  evKeys[0] === weekKeys[startCol],
      roundRight: evKeys[evKeys.length - 1] === weekKeys[endCol],
      event:      ev,
      task:       null,
      // All-day events (even single-day) and multi-day timed events → overlay
      isMulti:    ev.allDay || spanCols > 1,
    })
  }

  for (const t of tasks) {
    const key = localDayKey(new Date(t.due))
    const col = weekKeys.indexOf(key)
    if (col === -1 || weekDays[col].getMonth() !== month) continue
    candidates.push({
      id: t.id, title: t.title, color: TASK_COLOR, time: t.due,
      startCol: col, endCol: col, roundLeft: true, roundRight: true,
      event: null, task: t, isMulti: false,
    })
  }

  // ── Multi-day overlay: greedy lane assignment ───────────────────────────
  const multiCandidates = candidates.filter(c => c.isMulti)
  multiCandidates.sort((a, b) => {
    const diff = (b.endCol - b.startCol) - (a.endCol - a.startCol)
    return diff !== 0 ? diff : a.startCol - b.startCol
  })

  const laneRanges: Array<Array<{ s: number; e: number }>> = []
  const multiDayBars: WeekBarItem[] = []

  for (const c of multiCandidates) {
    let lane = 0
    for (;;) {
      if (!laneRanges[lane]) laneRanges[lane] = []
      const blocked = laneRanges[lane].some(r => !(c.endCol < r.s || c.startCol > r.e))
      if (!blocked) { laneRanges[lane].push({ s: c.startCol, e: c.endCol }); break }
      lane++
    }
    multiDayBars.push({
      id: c.id, title: c.title, color: c.color, time: c.time,
      startCol: c.startCol, spanCols: c.endCol - c.startCol + 1,
      lane, roundLeft: c.roundLeft, roundRight: c.roundRight, event: c.event,
    })
  }

  // Per-column: max overlay lane index + 1 (= number of compact rows occupying that col)
  const colMultiDayLanes = Array<number>(7).fill(0)
  for (const bar of multiDayBars) {
    for (let c = bar.startCol; c < bar.startCol + bar.spanCols; c++) {
      colMultiDayLanes[c] = Math.max(colMultiDayLanes[c], bar.lane + 1)
    }
  }

  // ── Per-column single-day items (sorted by time) ───────────────────────
  const singleDayCols: SingleDayItem[][] = Array.from({ length: 7 }, () => [])
  const singleCandidates = candidates.filter(c => !c.isMulti)
  singleCandidates.sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
  for (const c of singleCandidates) {
    singleDayCols[c.startCol].push({ id: c.id, title: c.title, color: c.color, time: c.time, event: c.event, task: c.task })
  }

  return { multiDayBars, singleDayCols, colMultiDayLanes }
}

export function CalendarView({
  events,
  tasks,
  feeds: initialFeeds,
  calendarName,
  connected,
  connectedEmail,
  notice,
  focusEventId,
  todayMs,
}: {
  events: CalEvent[]
  tasks: CalTask[]
  feeds: CalFeed[]
  calendarName: string
  connected: boolean
  connectedEmail: string | null
  notice: string | null
  focusEventId: string | null
  todayMs: number
}) {
  const router = useRouter()
  // todayMs comes from the server so server and client always agree on "today"
  const today = useMemo(() => new Date(todayMs), [todayMs])
  const todayKey = localDayKey(today)

  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_H)
  const rowHeightRef = useRef(DEFAULT_ROW_H)
  useEffect(() => { rowHeightRef.current = rowHeight }, [rowHeight])

  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [flashEventId, setFlashEventId] = useState<string | null>(null)
  const [visibleMonthKey, setVisibleMonthKey] = useState(`${today.getFullYear()}-${today.getMonth()}`)
  const [detail, setDetail] = useState<CalEvent | null>(null)
  // Bottom-sheet animation state
  const [sheetState, setSheetState] = useState<'closed' | 'open' | 'dragging'>('closed')
  const [sheetDragY, setSheetDragY] = useState(0)
  const sheetDragRef = useRef<{ startY: number; startTime: number } | null>(null)
  const latestSheetDragY = useRef(0)
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({})
  // 'detail' | 'edit' | 'create' | 'task' — which pane is visible inside the sheet
  const [sheetPane, setSheetPane] = useState<'detail' | 'edit' | 'create' | 'task'>('detail')
  const [sheetTask, setSheetTask] = useState<CalTask | null>(null)
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)
  const [calendarsOpen, setCalendarsOpen] = useState(false)
  // Google calendar colour — persisted to localStorage, hydrated on mount
  const [calColor, setCalColor] = useState(DEFAULT_CAL_COLOR)
  useEffect(() => {
    const saved = localStorage.getItem('homeos:cal-color')
    if (saved && CAL_COLORS.includes(saved)) setCalColor(saved)
  }, [])
  // ICS feeds — live state so the sheet can optimistically update
  const [feeds, setFeeds] = useState<CalFeed[]>(initialFeeds)

  // Per-event colour resolver: ICS events look up their feed; Google events use calColor.
  const getEventColor = useMemo(() => {
    const feedMap = new Map(feeds.map(f => [f.id, f.color]))
    return (ev: CalEvent): string => {
      if (ev.calendarId?.startsWith('ics:')) {
        return feedMap.get(ev.calendarId.slice(4)) ?? calColor
      }
      return calColor
    }
  }, [feeds, calColor])
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
  // Anchor captured at pinch start: which month + how many of its rows are scrolled past the top
  const zoomAnchorRef = useRef<{ key: string; offsetAboveGrid: number; rowsScrolled: number } | null>(null)

  // On mount: jump to today, or — if arriving from a schedule link — to that event's day
  // with a brief flash highlight on the event row. Runs once (guarded), so the 60s data
  // refresh doesn't re-trigger it.
  const didInitScroll = useRef(false)
  useEffect(() => {
    if (didInitScroll.current) return
    const container = scrollRef.current
    if (!container) return
    didInitScroll.current = true

    const focusEvent = focusEventId ? events.find(e => e.id === focusEventId) : null
    if (focusEvent) {
      const dayKey = eventDayKeys(focusEvent)[0]
      setSelectedKey(dayKey)
      setFlashEventId(focusEvent.id)
      const cell = container.querySelector<HTMLElement>(`[data-daykey="${dayKey}"]`)
      if (cell) {
        container.scrollTop = Math.max(0, scrollOffsetWithin(container, cell) - rowHeightRef.current)
      } else {
        const d = new Date(focusEvent.start)
        const monthEl = document.getElementById(`cal-month-${d.getFullYear()}-${d.getMonth()}`)
        if (monthEl) container.scrollTop = monthEl.offsetTop
      }
      const t = setTimeout(() => setFlashEventId(null), 1600)
      return () => clearTimeout(t)
    }

    // Land on today's row — same target as the "Today" button — not the month top.
    const todayCell = document.getElementById('cal-today')
    const monthEl   = document.getElementById(`cal-month-${today.getFullYear()}-${today.getMonth()}`)
    const target    = todayCell ?? monthEl
    if (target) container.scrollTop = Math.max(0, scrollOffsetWithin(container, target) - rowHeightRef.current)
  }, [today, focusEventId, events])

  // After rowHeight changes during a pinch, re-anchor so the same row stays under the fingers.
  // useLayoutEffect runs before paint, so the correction happens in the same frame — no flicker.
  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const container = scrollRef.current
    if (!anchor || !container) return
    const el = document.getElementById(anchor.key)
    if (!el) return
    container.scrollTop = el.offsetTop + anchor.offsetAboveGrid + anchor.rowsScrolled * rowHeight
  }, [rowHeight])

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

    // Find the month section currently at the top of the viewport and record how far
    // its rows are scrolled past the top — the fixed reference point for the whole pinch.
    function captureZoomAnchor() {
      const container = el!
      const scrollTop = container.scrollTop
      const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-monthkey]'))
      let anchor: HTMLElement | null = null
      for (const s of sections) {
        if (s.offsetTop <= scrollTop + 0.5) anchor = s
        else break
      }
      if (!anchor) anchor = sections[0] ?? null
      if (!anchor) return
      const gridEl = anchor.querySelector<HTMLElement>('[data-cal-grid]')
      const headerH = gridEl ? gridEl.offsetTop - anchor.offsetTop : 0
      const offsetIntoSection = scrollTop - anchor.offsetTop
      const offsetAboveGrid = Math.min(Math.max(offsetIntoSection, 0), headerH)
      const offsetIntoGrid = Math.max(0, offsetIntoSection - headerH)
      zoomAnchorRef.current = {
        key: anchor.id,
        offsetAboveGrid,
        rowsScrolled: offsetIntoGrid / rowHeightRef.current,
      }
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), height: rowHeightRef.current }
        captureZoomAnchor()
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
      if (newH !== rowHeightRef.current) {
        rowHeightRef.current = newH
        setRowHeight(newH)
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) pinchRef.current = null
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

  // Pre-computed week layouts for every week in the visible month range.
  // Keyed by "{year}-{month}-w{weekIndex}" so we can look them up during render.
  const weekLayoutData = useMemo(() => {
    const map = new Map<string, WeekLayout>()
    for (const { year, month, grid } of monthList) {
      for (let i = 0; i < grid.length; i += 7) {
        map.set(
          `${year}-${month}-w${Math.floor(i / 7)}`,
          computeWeekLayout(grid.slice(i, i + 7), month, events, tasks, getEventColor),
        )
      }
    }
    return map
  }, [monthList, events, tasks, calColor])

  // ── Derived state ───────────────────────────────────────────────────────

  const [vm_year, vm_month] = visibleMonthKey.split('-').map(Number)

  const selectedDate = (() => {
    const [y, m, d] = selectedKey.split('-').map(Number)
    return new Date(y, m, d)
  })()
  const selectedEvents = eventsByDay.get(selectedKey) ?? []
  const selectedTasks = tasksByDay.get(selectedKey) ?? []

  // Bar visibility metrics — uniform across the grid (depends only on row height)
  const avail                  = rowHeight - DATE_H
  const showBars               = avail >= MIN_BAR_H
  const mLaneH                 = MULTI_DAY_BAR_H + BAR_GAP   // 17 px per multi-day lane
  // Max multi-day lanes we can fit; single-day items will use the remaining space
  const maxMultiDayLanesVisible = showBars ? Math.max(1, Math.floor(avail / mLaneH)) : 0

  // ── Actions ─────────────────────────────────────────────────────────────

  function toggleCalTask(id: string, current: boolean) {
    setTaskOverrides(prev => ({ ...prev, [id]: !current }))
    startTransition(() => { toggleTask(id) })
  }

  function goToday() {
    setSelectedKey(todayKey)
    const container = scrollRef.current
    // Scroll to today's actual cell (not just the month label) so it lands near the top at any zoom
    const todayCell = document.getElementById('cal-today')
    const monthEl = document.getElementById(`cal-month-${today.getFullYear()}-${today.getMonth()}`)
    const target = todayCell ?? monthEl
    if (container && target) {
      const top = scrollOffsetWithin(container, target) - rowHeight
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    }
  }

  // ── Sheet helpers ────────────────────────────────────────────────────────

  function animateSheetIn() {
    setSheetState('closed')
    setSheetDragY(0)
    latestSheetDragY.current = 0
    requestAnimationFrame(() => requestAnimationFrame(() => setSheetState('open')))
  }

  function openDetail(ev: CalEvent) {
    setDetail(ev)
    setSheetPane('detail')
    animateSheetIn()
  }

  function closeSheet() {
    setSheetState('closed')
    setSheetDragY(0)
    latestSheetDragY.current = 0
    setTimeout(() => { setDetail(null); setSheetTask(null); setSheetPane('detail') }, 320)
  }

  function openTask(t: CalTask) {
    setSheetTask(t)
    setSheetPane('task')
    animateSheetIn()
  }

  function openCreate() {
    setDetail(null)
    setSheetPane('create')
    animateSheetIn()
  }

  // Opens edit pane — if sheet already open just swap pane, no re-animation
  function openEdit(ev?: CalEvent) {
    if (ev) setDetail(ev)
    setSheetPane('edit')
    if (sheetState !== 'open') animateSheetIn()
  }

  function onEditorSaved() { closeSheet(); router.refresh() }

  async function deleteEvent(ev: CalEvent) {
    if (!confirm(`Delete "${ev.title}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/calendar/events/${ev.id}`, { method: 'DELETE' })
      if (res.ok) { closeSheet(); router.refresh() }
      else if (res.status === 409) setBanner('Connect your Google account before editing events.')
      else setBanner('Could not delete the event. Please try again.')
    } finally { setDeleting(false) }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col max-w-lg mx-auto" style={{ height: 'calc(100dvh - calc(96px + env(safe-area-inset-bottom)))' }}>

      {/* ── Top bar ── */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0 bg-bg">
        <Link href="/" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Home</span>
        </Link>
        <span className="text-[17px] font-bold text-text-1" style={{ letterSpacing: '-0.01em' }}>
          {MONTHS[vm_month]} <span className="text-text-2 font-normal text-[15px]">{vm_year}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCalendarsOpen(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-accent active:bg-surface-2"
            aria-label="Manage calendars"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
              <circle cx="12" cy="12" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
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
      <div className="px-2 grid grid-cols-7 border-b border-border flex-shrink-0 bg-bg">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className={`text-center text-[12px] font-semibold py-1 ${i >= 5 ? 'text-text-3' : 'text-text-2'}`}>{d}</div>
        ))}
      </div>

      {/* ── Scrollable months ── */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain bg-bg" style={{ overflowAnchor: 'none' }}>
        {monthList.map(({ year, month, grid }) => (
          <section
            key={`${year}-${month}`}
            id={`cal-month-${year}-${month}`}
            data-monthkey={`${year}-${month}`}
          >
            {/* Month label */}
            <div className="px-3 pt-4 pb-1">
              <span className="text-[28px] font-bold text-text-1" style={{ letterSpacing: '-0.02em' }}>
                {MONTHS[month]}
              </span>
            </div>

            {/* 6-week grid — rendered as week rows so multi-day events span columns */}
            <div data-cal-grid className="px-2">
              {(() => {
                // Split the flat 42-cell grid into week rows of 7
                const weeks: Date[][] = []
                for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7))

                return weeks.map((weekDays, wi) => {
                  const layout = weekLayoutData.get(`${year}-${month}-w${wi}`) ?? {
                    multiDayBars: [], singleDayCols: Array.from({ length: 7 }, (): SingleDayItem[] => []), colMultiDayLanes: Array<number>(7).fill(0),
                  }

                  return (
                    <div
                      key={localDayKey(weekDays[0])}
                      className="relative overflow-hidden"
                      style={{ height: rowHeight }}
                    >
                      {/* ── Day cells — click targets + date numbers ── */}
                      <div className="grid grid-cols-7 h-full">
                        {weekDays.map((d, col) => {
                          const key = localDayKey(d)
                          const inMonth = d.getMonth() === month

                          // Adjacent-month spacer
                          if (!inMonth) {
                            return <div key={key} className="border-t border-border" />
                          }

                          const isToday    = key === todayKey
                          const isSelected = key === selectedKey

                          return (
                            <button
                              key={key}
                              id={isToday ? 'cal-today' : undefined}
                              data-daykey={key}
                              onClick={() => setSelectedKey(key)}
                              className="flex flex-col items-start px-0.5 pt-1 pb-0.5 border-t border-border active:opacity-70"
                            >
                              {/* Date number */}
                              {(() => {
                                const isWeekend = col >= 5
                                const bg = isToday ? '#FF3B30' : isSelected ? 'var(--surface-2)' : 'transparent'
                                const fg = isToday ? '#fff'
                                  : isSelected ? 'var(--text-1)'
                                  : isWeekend ? 'var(--text-3)'
                                  : 'var(--text-1)'
                                const weight = isToday || isSelected ? '700' : isWeekend ? '400' : '400'
                                return (
                                  <span
                                    className="w-7 h-7 flex items-center justify-center rounded-full text-[14px] mb-[2px] flex-shrink-0"
                                    style={{ background: bg, color: fg, fontWeight: weight }}
                                  >
                                    {d.getDate()}
                                  </span>
                                )
                              })()}

                              {/* Compact: coloured dots when the row is too short for bars */}
                              {!showBars && (() => {
                                const multiColors  = layout.multiDayBars
                                  .filter(b => b.startCol <= col && col < b.startCol + b.spanCols)
                                  .map(b => b.color)
                                const singleColors = layout.singleDayCols[col].map(i => i.color)
                                const dots = [...multiColors, ...singleColors].slice(0, 3)
                                if (!dots.length) return null
                                return (
                                  <div className="flex gap-[3px] px-0.5 flex-shrink-0">
                                    {dots.map((color, ci) => (
                                      <div key={ci} className="w-[5px] h-[5px] rounded-full" style={{ background: color }} />
                                    ))}
                                  </div>
                                )
                              })()}
                            </button>
                          )
                        })}
                      </div>

                      {/* ── Event bar overlay — absolutely positioned, starts at DATE_H ── */}
                      {showBars && (
                        <div
                          className="absolute inset-x-0 pointer-events-none z-10"
                          style={{ top: DATE_H }}
                        >
                          {/* ── Multi-day / all-day bars — compact fixed height ── */}
                          {layout.multiDayBars.filter(b => b.lane < maxMultiDayLanesVisible).map(bar => {
                            const leftPct  = (bar.startCol / 7) * 100
                            const widthPct = (bar.spanCols  / 7) * 100
                            const insetL = bar.roundLeft  ? 1 : 0
                            const insetR = bar.roundRight ? 1 : 0

                            return (
                              <button
                                key={bar.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (bar.event) openDetail(bar.event)
                                  else setSelectedKey(localDayKey(weekDays[bar.startCol]))
                                }}
                                className="absolute pointer-events-auto overflow-hidden flex items-center"
                                style={{
                                  left:         `calc(${leftPct}%  + ${insetL}px)`,
                                  width:        `calc(${widthPct}% - ${insetL + insetR}px)`,
                                  top:          bar.lane * mLaneH,
                                  height:       MULTI_DAY_BAR_H,
                                  background:   pillBg(bar.color),
                                  borderRadius: `${bar.roundLeft ? 5 : 1}px ${bar.roundRight ? 5 : 1}px ${bar.roundRight ? 5 : 1}px ${bar.roundLeft ? 5 : 1}px`,
                                  paddingLeft:  bar.roundLeft  ? 6 : 3,
                                  paddingRight: bar.roundRight ? 6 : 3,
                                }}
                              >
                                {bar.roundLeft && (
                                  <p className="font-semibold leading-tight truncate w-full" style={{ fontSize: 11, color: pillText(bar.color) }}>
                                    {bar.title}
                                    {bar.time !== null && <span className="font-normal ml-[4px]" style={{ opacity: 0.6 }}>{cellTime(bar.time)}</span>}
                                  </p>
                                )}
                              </button>
                            )
                          })}

                          {/* ── Single-day pills — content-sized, iOS-style (title + time) ── */}
                          {weekDays.map((d, col) => {
                            if (d.getMonth() !== month) return null
                            const colItems = layout.singleDayCols[col]
                            if (colItems.length === 0) return null

                            const singleOffset = layout.colMultiDayLanes[col] * mLaneH
                            const singleAvail  = avail - singleOffset

                            // How many pills fit at their compact minimum height
                            const fit = Math.floor((singleAvail + PILL_GAP) / (MIN_PILL_H + PILL_GAP))
                            if (fit < 1) return null

                            const showMore     = colItems.length > fit
                            const visibleCount = showMore ? fit - 1 : colItems.length
                            const hiddenCount  = colItems.length - visibleCount

                            // Only one slot fits but there's overflow → just show the count
                            if (visibleCount < 1) {
                              return (
                                <div
                                  key={`sd-${col}`}
                                  className="absolute pointer-events-none flex items-center"
                                  style={{ left: `calc(${(col / 7) * 100}% + 1px)`, width: `calc(${(1 / 7) * 100}% - 2px)`, top: singleOffset, height: MIN_PILL_H }}
                                >
                                  <span className="text-[10.5px] font-semibold text-text-2 leading-none pl-1.5 truncate">{colItems.length} more</span>
                                </div>
                              )
                            }

                            // Share remaining space between visible pills (reserving a compact slot
                            // for "+more"), capped so a lone event never balloons to fill the cell.
                            const moreReserve = showMore ? MIN_PILL_H + PILL_GAP : 0
                            const pillArea    = singleAvail - moreReserve
                            const pillH       = Math.min(
                              MAX_PILL_H,
                              Math.floor((pillArea - (visibleCount - 1) * PILL_GAP) / visibleCount),
                            )
                            const visible = colItems.slice(0, visibleCount)

                            return (
                              <React.Fragment key={`sd-${col}`}>
                                {visible.map((item, idx) => {
                                  const showTime  = item.time !== null && pillH >= 32
                                  const twoLine   = pillH >= (showTime ? 44 : 30)
                                  const titleFont = pillH >= 24 ? 12 : 11
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (item.event) openDetail(item.event)
                                        else if (item.task) openTask(item.task)
                                        else setSelectedKey(localDayKey(d))
                                      }}
                                      className="absolute pointer-events-auto overflow-hidden flex flex-col items-start text-left"
                                      style={{
                                        left:          `calc(${(col / 7) * 100}% + 1px)`,
                                        width:         `calc(${(1   / 7) * 100}% - 2px)`,
                                        top:           singleOffset + idx * (pillH + PILL_GAP),
                                        height:        pillH,
                                        background:    pillBg(item.color),
                                        borderRadius:  5,
                                        paddingTop:    3,
                                        paddingBottom: 2,
                                        paddingLeft:   6,
                                        paddingRight:  5,
                                      }}
                                    >
                                      <p
                                        className={`font-semibold leading-tight w-full ${twoLine ? 'line-clamp-2' : 'truncate'}`}
                                        style={{ fontSize: titleFont, color: pillText(item.color) }}
                                      >
                                        {item.title}
                                      </p>
                                      {showTime && (
                                        <p
                                          className="font-normal leading-tight truncate w-full mt-[1px]"
                                          style={{ fontSize: 10.5, color: pillText(item.color), opacity: 0.6 }}
                                        >
                                          {cellTime(item.time!)}
                                        </p>
                                      )}
                                    </button>
                                  )
                                })}
                                {hiddenCount > 0 && (
                                  <div
                                    className="absolute pointer-events-none flex items-center"
                                    style={{
                                      left:   `calc(${(col / 7) * 100}% + 1px)`,
                                      width:  `calc(${(1   / 7) * 100}% - 2px)`,
                                      top:    singleOffset + visibleCount * (pillH + PILL_GAP),
                                      height: MIN_PILL_H,
                                    }}
                                  >
                                    <span className="text-[10.5px] font-semibold text-text-2 leading-none pl-1.5 truncate">
                                      {hiddenCount} more
                                    </span>
                                  </div>
                                )}
                              </React.Fragment>
                            )
                          })}

                          {/* "+N more" per column for hidden multi-day overflow */}
                          {weekDays.map((d, col) => {
                            if (d.getMonth() !== month) return null
                            const overflow = layout.multiDayBars.filter(
                              b => b.lane >= maxMultiDayLanesVisible &&
                                   b.startCol <= col &&
                                   col < b.startCol + b.spanCols,
                            ).length
                            if (!overflow) return null
                            return (
                              <div
                                key={`ov-${col}`}
                                className="absolute pointer-events-none"
                                style={{
                                  left:  `${(col / 7) * 100}%`,
                                  width: `${(1  / 7) * 100}%`,
                                  top:   maxMultiDayLanesVisible * mLaneH + 1,
                                }}
                              >
                                <span className="text-[8px] text-text-3 px-1 leading-none">+{overflow}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </section>
        ))}
        <div className="h-3" />
      </div>

      {/* ── Selected day panel ── */}
      <div
        className="flex-shrink-0 flex flex-col bg-surface rounded-t-3xl"
        style={{
          maxHeight: '35vh',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.08)',
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-0.5 flex-shrink-0">
          <p className="text-[13px] font-semibold text-text-2">{fullDate(selectedDate)}</p>
          {connected && (
            <button onClick={openCreate} className="text-accent text-[14px] font-medium active:opacity-60">+ Add</button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
          {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
            <p className="text-[14px] text-text-3 py-3 text-center">Nothing on</p>
          ) : (
            <div className="bg-bg rounded-2xl overflow-hidden mb-2">
              {selectedEvents.map((ev, i) => (
                <button
                  key={ev.id}
                  onClick={() => openDetail(ev)}
                  className={`w-full flex items-start gap-3 px-4 py-1.5 text-left active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''} ${flashEventId === ev.id ? 'flash-highlight' : ''}`}
                >
                  <div className="w-1 self-stretch rounded-full shrink-0 my-0.5" style={{ background: calColor }} />
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
                    onClick={() => openTask(t)}
                    className={`flex items-center gap-3 px-4 py-1.5 cursor-pointer active:bg-surface-2 ${(selectedEvents.length + i) > 0 ? 'border-t border-border' : ''}`}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); toggleCalTask(t.id, completed) }}
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

      {/* ── Event / task / editor bottom sheet ── */}
      {(detail !== null || sheetTask !== null || sheetPane === 'create') && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50"
            style={{
              background: `rgba(0,0,0,${sheetState === 'closed' ? 0 : 0.4})`,
              transition: 'background 0.32s',
              pointerEvents: sheetState === 'closed' ? 'none' : 'auto',
            }}
            onClick={closeSheet}
          />

          {/* Sheet — nearly full screen, centred to max-w-lg */}
          <div className="fixed bottom-0 left-0 right-0 z-[51] flex justify-center pointer-events-none">
            <div
              className="w-full max-w-lg bg-bg rounded-t-[24px] shadow-2xl flex flex-col pointer-events-auto"
              style={{
                height: '92dvh',
                transform:
                  sheetState === 'dragging' ? `translateY(${sheetDragY}px)` :
                  sheetState === 'open'      ? 'translateY(0)'               :
                                               'translateY(100%)',
                transition: sheetState === 'dragging' ? 'none' : 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
              }}
            >
              {/* ── Drag handle — large touch target, swipe down to dismiss/cancel ── */}
              <div
                className="flex justify-center items-center shrink-0"
                style={{ touchAction: 'none', height: 44, paddingBottom: 4 }}
                onTouchStart={e => {
                  sheetDragRef.current = { startY: e.touches[0].clientY, startTime: Date.now() }
                  setSheetState('dragging')
                }}
                onTouchMove={e => {
                  if (!sheetDragRef.current) return
                  const delta = Math.max(0, e.touches[0].clientY - sheetDragRef.current.startY)
                  latestSheetDragY.current = delta
                  setSheetDragY(delta)
                }}
                onTouchEnd={() => {
                  if (!sheetDragRef.current) return
                  const { startTime } = sheetDragRef.current
                  sheetDragRef.current = null
                  const finalY = latestSheetDragY.current
                  const velocity = finalY / Math.max(Date.now() - startTime, 1)
                  latestSheetDragY.current = 0
                  if (finalY > 100 || velocity > 0.4) {
                    closeSheet()
                  } else {
                    setSheetState('open')
                    setSheetDragY(0)
                  }
                }}
              >
                <div className="w-10 h-[5px] rounded-full" style={{ background: 'color-mix(in srgb, var(--text-3) 40%, transparent)' }} />
              </div>

              {/* ── Detail pane ── */}
              {sheetPane === 'detail' && detail && (
                <>
                  {/* Title + Edit */}
                  <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3 shrink-0">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-[14px] h-[14px] rounded-full shrink-0 mt-[5px]" style={{ background: calColor }} />
                      <h2 className="text-[22px] font-bold text-text-1 leading-tight">{detail.title}</h2>
                    </div>
                    {connected && (
                      <button onClick={() => openEdit(detail)} className="text-accent text-[15px] font-semibold active:opacity-60 shrink-0">
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Scrollable cards */}
                  <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-2 flex flex-col gap-3">
                    <div className="bg-surface rounded-2xl overflow-hidden">
                      <div className="px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-1">When</p>
                        <p className="text-[15px] text-text-1">{eventDateLine(detail)}</p>
                        {detail.allDay ? (
                          <p className="text-[14px] text-text-2 mt-0.5">All day</p>
                        ) : (
                          <p className="text-[14px] text-text-2 mt-0.5">
                            {formatTime(detail.start)} – {formatTime(detail.end > detail.start ? detail.end : detail.start)}
                          </p>
                        )}
                      </div>
                      {detail.location && (
                        <div className="px-4 py-3 border-t border-border">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-1">Where</p>
                          <p className="text-[15px] text-text-1">{detail.location}</p>
                        </div>
                      )}
                    </div>

                    {detail.description && (
                      <div className="bg-surface rounded-2xl px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-1">Notes</p>
                        <p className="text-[14px] text-text-1 whitespace-pre-wrap leading-relaxed">{detail.description}</p>
                      </div>
                    )}

                    {connected && (
                      <button
                        onClick={() => deleteEvent(detail)}
                        disabled={deleting}
                        className="w-full bg-surface rounded-2xl px-4 py-3 text-[15px] font-semibold text-red active:bg-surface-2 disabled:opacity-50"
                      >
                        {deleting ? 'Deleting…' : 'Delete event'}
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ── Task detail pane ── */}
              {sheetPane === 'task' && sheetTask && (() => {
                const t = sheetTask
                const completed = taskOverrides[t.id] ?? t.completed
                return (
                  <>
                    {/* Title + orange dot */}
                    <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-3 shrink-0">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="w-[14px] h-[14px] rounded-full shrink-0 mt-[5px]" style={{ background: TASK_COLOR }} />
                        <h2 className="text-[22px] font-bold text-text-1 leading-tight">{t.title}</h2>
                      </div>
                      {t.listId && (
                        <Link
                          href={`/household/tasks/${t.listId}`}
                          onClick={closeSheet}
                          className="text-accent text-[15px] font-semibold active:opacity-60 shrink-0"
                        >
                          Open
                        </Link>
                      )}
                    </div>

                    {/* Scrollable content */}
                    <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-2 flex flex-col gap-3">
                      {/* Due date */}
                      <div className="bg-surface rounded-2xl px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-1">Due</p>
                        <p className="text-[15px] text-text-1">{fullDate(new Date(t.due))}</p>
                      </div>

                      {/* Completion toggle */}
                      <button
                        onClick={() => toggleCalTask(t.id, completed)}
                        className="w-full bg-surface rounded-2xl px-4 py-3.5 flex items-center gap-4 active:bg-surface-2 text-left"
                      >
                        <div
                          className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center transition-all"
                          style={completed ? { background: TASK_COLOR } : { border: `2px solid ${TASK_COLOR}` }}
                        >
                          {completed && (
                            <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                              <path d="M4 10.5l4 4 8-9" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-[15px] font-medium ${completed ? 'text-text-3 line-through' : 'text-text-1'}`}>
                          {completed ? 'Marked as done' : 'Mark as done'}
                        </span>
                      </button>
                    </div>
                  </>
                )
              })()}

              {/* ── Edit / Create pane ── */}
              {(sheetPane === 'edit' || sheetPane === 'create') && (
                <EventEditor
                  embedded
                  initialDate={detail ? new Date(detail.start) : selectedDate}
                  event={sheetPane === 'edit' ? detail : null}
                  onClose={() => sheetPane === 'edit' ? setSheetPane('detail') : closeSheet()}
                  onSaved={onEditorSaved}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Calendars management sheet ── */}
      {calendarsOpen && (
        <CalendarsSheet
          calColor={calColor}
          onCalColorChange={c => { setCalColor(c); localStorage.setItem('homeos:cal-color', c) }}
          feeds={feeds}
          onFeedsChange={setFeeds}
          calendarName={calendarName}
          connected={connected}
          connectedEmail={connectedEmail}
          onClose={() => setCalendarsOpen(false)}
        />
      )}

      {/* ── Surface-colour fill behind the nav-bar gap ──────────────────────
          The main element has pb-[96px+safe-area] which creates a gap between
          the calendar container's bottom edge and the actual nav bar. This fixed
          div sits at z-1 (below the nav bar at z-50) and paints the gap with the
          same surface colour as the selected-day panel so there's no bg-bg strip. */}
      <div
        className="fixed bottom-0 inset-x-0 bg-surface pointer-events-none"
        style={{ height: 'calc(96px + env(safe-area-inset-bottom))', zIndex: 1 }}
      />

    </div>
  )
}

// ── Calendars management sheet ────────────────────────────────────────────────

function ColorRow({ color, current, onPick }: { color: string; current: string; onPick: (c: string) => void }) {
  return (
    <button
      onClick={() => onPick(color)}
      className="w-9 h-9 rounded-full flex items-center justify-center active:opacity-70 transition-transform active:scale-90"
      style={{
        background: color,
        boxShadow: current === color ? `0 0 0 2.5px var(--bg), 0 0 0 4.5px ${color}` : 'none',
      }}
      aria-label={color}
    >
      {current === color && (
        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
          <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

function CalendarsSheet({
  calColor, onCalColorChange,
  feeds, onFeedsChange,
  calendarName, connected, connectedEmail,
  onClose,
}: {
  calColor: string
  onCalColorChange: (c: string) => void
  feeds: CalFeed[]
  onFeedsChange: (f: CalFeed[]) => void
  calendarName: string
  connected: boolean
  connectedEmail: string | null
  onClose: () => void
}) {
  const [addingUrl, setAddingUrl] = useState('')
  const [addingName, setAddingName] = useState('')
  const [addingColor, setAddingColor] = useState(CAL_COLORS[1]) // green default for subscriptions
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function addFeed() {
    if (!addingUrl.trim() || !addingName.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/calendar/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addingName.trim(), url: addingUrl.trim(), color: addingColor }),
      })
      if (!res.ok) { setAddError('Could not add calendar — check the URL and try again.'); return }
      const { feed } = await res.json()
      onFeedsChange([...feeds, feed])
      setAddingUrl('')
      setAddingName('')
    } catch {
      setAddError('Network error — please try again.')
    } finally {
      setAdding(false)
    }
  }

  async function patchFeed(id: string, patch: Partial<CalFeed>) {
    onFeedsChange(feeds.map(f => f.id === id ? { ...f, ...patch } : f))
    await fetch(`/api/calendar/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }

  async function deleteFeed(id: string) {
    if (!confirm('Remove this calendar and all its events?')) return
    setDeleting(id)
    try {
      await fetch(`/api/calendar/feeds/${id}`, { method: 'DELETE' })
      onFeedsChange(feeds.filter(f => f.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  async function syncFeed(id: string) {
    setSyncing(id)
    try {
      await fetch(`/api/calendar/feeds/${id}/sync`, { method: 'POST' })
      // Refresh feed metadata
      const res = await fetch('/api/calendar/feeds')
      if (res.ok) { const { feeds: updated } = await res.json(); onFeedsChange(updated) }
    } finally {
      setSyncing(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="max-w-lg mx-auto w-full bg-surface rounded-t-[22px] overflow-y-auto"
        style={{ maxHeight: '85dvh', paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-border opacity-50" />
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-4">
          <h2 className="text-[19px] font-bold text-text-1" style={{ letterSpacing: '-0.01em' }}>Calendars</h2>
          <button onClick={onClose} className="text-accent text-[16px] font-semibold active:opacity-60">Done</button>
        </div>

        {/* ── Google Calendar ── */}
        <div className="px-5 mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-3 mb-2">Google Calendar</p>
          <div className="bg-bg rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full shrink-0" style={{ background: calColor }} />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-text-1 truncate">{calendarName}</p>
                {connected
                  ? <p className="text-[12px] text-text-2 truncate">{connectedEmail ?? 'Connected'}</p>
                  : <p className="text-[12px] text-red">Not connected</p>
                }
              </div>
            </div>
            <div className="flex gap-3 flex-wrap">
              {CAL_COLORS.map(c => <ColorRow key={c} color={c} current={calColor} onPick={onCalColorChange} />)}
            </div>
          </div>
        </div>

        {/* ── ICS subscriptions ── */}
        {feeds.length > 0 && (
          <div className="px-5 mb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-3 mb-2">Subscriptions</p>
            <div className="flex flex-col gap-2">
              {feeds.map(feed => (
                <div key={feed.id} className="bg-bg rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-3 mb-2.5">
                    {/* Colour dot — tap to cycle */}
                    <button
                      className="w-9 h-9 rounded-full shrink-0 active:opacity-70"
                      style={{ background: feed.color }}
                      onClick={() => {
                        const idx = CAL_COLORS.indexOf(feed.color)
                        const next = CAL_COLORS[(idx + 1) % CAL_COLORS.length]
                        patchFeed(feed.id, { color: next })
                      }}
                      aria-label="Change colour"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-text-1 truncate">{feed.name}</p>
                      <p className="text-[11.5px] text-text-2 truncate">{feed.url}</p>
                    </div>
                    {/* Enable toggle */}
                    <button
                      onClick={() => patchFeed(feed.id, { enabled: !feed.enabled })}
                      className={`w-12 h-7 rounded-full transition-colors shrink-0 ${feed.enabled ? 'bg-sage' : 'bg-surface-2'}`}
                      aria-label={feed.enabled ? 'Disable' : 'Enable'}
                    >
                      <div className={`w-6 h-6 bg-white rounded-full shadow transition-transform mx-0.5 ${feed.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {feed.errorMessage && (
                    <p className="text-[11.5px] text-red mb-2 leading-snug">⚠ {feed.errorMessage}</p>
                  )}
                  <div className="flex items-center gap-3">
                    {feed.lastSyncedAt && (
                      <span className="text-[11px] text-text-3 flex-1">
                        Synced {new Date(feed.lastSyncedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <button
                      onClick={() => syncFeed(feed.id)}
                      disabled={syncing === feed.id}
                      className="text-[12.5px] font-semibold text-accent active:opacity-60 disabled:opacity-40"
                    >
                      {syncing === feed.id ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button
                      onClick={() => deleteFeed(feed.id)}
                      disabled={deleting === feed.id}
                      className="text-[12.5px] font-semibold text-red active:opacity-60 disabled:opacity-40"
                    >
                      {deleting === feed.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Add a calendar ── */}
        <div className="px-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-3 mb-2">Add a calendar</p>
          <div className="bg-bg rounded-2xl overflow-hidden">
            <input
              value={addingName}
              onChange={e => setAddingName(e.target.value)}
              placeholder="Name (e.g. School holidays)"
              className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none border-b border-border"
            />
            <input
              value={addingUrl}
              onChange={e => setAddingUrl(e.target.value)}
              placeholder="ICS / iCal URL"
              type="url"
              className="w-full px-4 py-3 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none"
            />
          </div>
          <div className="flex gap-3 mt-3 flex-wrap">
            {CAL_COLORS.map(c => <ColorRow key={c} color={c} current={addingColor} onPick={setAddingColor} />)}
          </div>
          {addError && <p className="text-[12.5px] text-red mt-2">{addError}</p>}
          <button
            onClick={addFeed}
            disabled={adding || !addingUrl.trim() || !addingName.trim()}
            className="mt-3 w-full bg-accent text-white rounded-2xl py-3 text-[15px] font-semibold active:opacity-80 disabled:opacity-40"
          >
            {adding ? 'Adding…' : 'Subscribe'}
          </button>
        </div>
      </div>
    </div>
  )
}
