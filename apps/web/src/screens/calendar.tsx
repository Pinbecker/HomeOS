import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

type CalEvent = {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  location: string | null
  description: string | null
  calendarId: string | null
  householdId?: string
}
type CalTask = {
  id: string
  title: string
  due: number
  listId: string | null
  completed: boolean
  color: string
}
type CalFeed = {
  id: string
  householdId: string
  userId?: string | null
  name: string
  url: string
  color: string
  enabled: boolean
  lastSyncedAt?: string | number | Date | null
  errorMessage?: string | null
  createdAt?: string | number | Date
  updatedAt?: string | number | Date
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const CAL_COLORS = ['#007AFF', '#34C759', '#FF3B30', '#FF9500', '#FF2D55', '#AF52DE', '#5856D6', '#00C7BE', '#FFCC00', '#8E8E93']
const DEFAULT_CAL_COLOR = '#007AFF'
const DEFAULT_ROW_H = 112
const MIN_ROW_H = 40
const MAX_ROW_H = 170

function localDayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function allDayAsLocal(date: Date) {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) cells.push(new Date(year, month, 1 - offset + i))
  return cells.filter((_, index) => {
    const weekStart = Math.floor(index / 7) * 7
    return cells.slice(weekStart, weekStart + 7).some(date => date.getMonth() === month)
  })
}

function eventDayKeys(event: CalEvent) {
  if (event.allDay) {
    const start = new Date(event.start)
    const endExclusiveMs = event.end > event.start ? event.end : event.start + 86_400_000
    const lastInclusive = new Date(endExclusiveMs - 1)
    const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
    const last = new Date(Date.UTC(lastInclusive.getUTCFullYear(), lastInclusive.getUTCMonth(), lastInclusive.getUTCDate()))
    const keys: string[] = []
    let guard = 0
    while (current <= last && guard < 366) {
      keys.push(`${current.getUTCFullYear()}-${current.getUTCMonth()}-${current.getUTCDate()}`)
      current.setUTCDate(current.getUTCDate() + 1)
      guard++
    }
    return keys
  }

  const start = new Date(event.start)
  const end = new Date(event.end > event.start ? event.end : event.start)
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const keys: string[] = []
  let guard = 0
  while (current <= last && guard < 90) {
    keys.push(localDayKey(current))
    current.setDate(current.getDate() + 1)
    guard++
  }
  return keys
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function cellTime(ms: number) {
  const date = new Date(ms)
  const hours = date.getHours()
  const mins = date.getMinutes()
  return mins === 0 ? `${hours}:00` : `${hours}:${String(mins).padStart(2, '0')}`
}

function fullDate(date: Date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function eventDateLine(event: CalEvent) {
  if (event.allDay) {
    const startLocal = allDayAsLocal(new Date(event.start))
    const endExclusiveMs = event.end > event.start ? event.end : event.start + 86_400_000
    const lastLocal = allDayAsLocal(new Date(endExclusiveMs - 1))
    if (startLocal.getTime() === lastLocal.getTime()) return fullDate(startLocal)
    const a = startLocal.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    const b = lastLocal.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return `${a} - ${b}`
  }
  return fullDate(new Date(event.start))
}

function isMultiDay(event: CalEvent) {
  return eventDayKeys(event).length > 1
}

function pillBg(color: string) {
  return `color-mix(in srgb, ${color} 18%, var(--surface))`
}

function pillText(color: string) {
  return `color-mix(in srgb, ${color} 72%, var(--text-1))`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function dateInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function timeInput(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseDateTime(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute).getTime()
}

function scrollOffsetWithin(container: HTMLElement, element: HTMLElement) {
  return container.scrollTop + element.getBoundingClientRect().top - container.getBoundingClientRect().top
}

function syncTimeLabel(value: string | number | Date | null | undefined) {
  if (!value) return 'Not yet synced'
  const date = value instanceof Date ? value : new Date(value)
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins < 2) return 'Synced just now'
  if (mins < 60) return `Synced ${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Synced ${hours}h ago`
  return `Synced ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-accent' : 'bg-surface-2'}`}>
      <span className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-transform duration-200 ${checked ? 'translate-x-[21px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

function ColorSwatch({ color, current, onPick }: { color: string; current: string; onPick: (color: string) => void }) {
  return (
    <button
      onClick={() => onPick(color)}
      className="flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-90 active:opacity-70"
      style={{ background: color, boxShadow: current === color ? `0 0 0 2px var(--bg), 0 0 0 4px ${color}` : 'none' }}
      aria-label={color}
    >
      {current === color ? <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3"><path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
    </button>
  )
}

function ColorPicker({ current, onPick }: { current: string; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5 border-t border-border px-4 pt-3 pb-3.5">
      {CAL_COLORS.map(color => <ColorSwatch key={color} color={color} current={current} onPick={onPick} />)}
    </div>
  )
}

function CalendarPageInner() {
  const today = useMemo(() => new Date(), [])
  const todayKey = localDayKey(today)
  const snapshot = useAppState(state => {
    const listColors = new Map(state.data.lists.map(list => [list.id, list.color ?? '#FF9500']))
    const events: CalEvent[] = state.data.calendarEvents.map(event => ({
      id: event.id,
      householdId: event.householdId,
      title: event.title,
      start: new Date(event.startsAt).getTime(),
      end: new Date(event.endsAt ?? event.startsAt).getTime(),
      allDay: Boolean(event.allDay),
      location: event.location ?? null,
      description: event.description ?? null,
      calendarId: event.calendarId ?? null,
    }))
    const tasks: CalTask[] = state.data.items
      .filter(item => item.type === 'task' && item.dueDate && !item.deletedAt)
      .map(item => ({
        id: item.id,
        title: item.title,
        due: new Date(item.dueDate as string | number | Date).getTime(),
        listId: item.listId ?? null,
        completed: item.status === 'completed',
        color: item.listId ? listColors.get(item.listId) ?? '#FF9500' : '#FF9500',
      }))
    return {
      householdId: state.data.household[0]?.id ?? 'default',
      userId: state.data.users[0]?.id ?? 'system',
      events,
      tasks,
      feeds: state.data.calendarFeeds as CalFeed[],
    }
  })
  const [rowHeight, setRowHeight] = useState(DEFAULT_ROW_H)
  const rowHeightRef = useRef(DEFAULT_ROW_H)
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [visibleMonthKey, setVisibleMonthKey] = useState(`${today.getFullYear()}-${today.getMonth()}`)
  const [detail, setDetail] = useState<CalEvent | null>(null)
  const [sheetTask, setSheetTask] = useState<CalTask | null>(null)
  const [sheetPane, setSheetPane] = useState<'detail' | 'edit' | 'create' | 'task'>('detail')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [calendarsOpen, setCalendarsOpen] = useState(false)
  const [taskOverrides, setTaskOverrides] = useState<Record<string, boolean>>({})
  const [flashEventId, setFlashEventId] = useState<string | null>(null)
  const [calColor, setCalColor] = useState(DEFAULT_CAL_COLOR)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinchRef = useRef<{ dist: number; height: number } | null>(null)
  const zoomAnchorRef = useRef<{ key: string; rowsScrolled: number; offsetAboveGrid: number } | null>(null)

  useEffect(() => { rowHeightRef.current = rowHeight }, [rowHeight])
  useEffect(() => {
    const saved = localStorage.getItem('homeos:cal-color')
    if (saved && CAL_COLORS.includes(saved)) setCalColor(saved)
  }, [])

  const feedMap = useMemo(() => new Map(snapshot.feeds.map(feed => [feed.id, feed])), [snapshot.feeds])
  const getEventColor = (event: CalEvent) => {
    if (event.calendarId?.startsWith('ics:')) return feedMap.get(event.calendarId.slice(4))?.color ?? calColor
    return calColor
  }

  const monthList = useMemo(() => {
    const months: Array<{ year: number; month: number; grid: Date[] }> = []
    for (let i = -6; i <= 24; i++) {
      const date = new Date(today.getFullYear(), today.getMonth() + i, 1)
      months.push({ year: date.getFullYear(), month: date.getMonth(), grid: buildGrid(date.getFullYear(), date.getMonth()) })
    }
    return months
  }, [today])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const event of snapshot.events) {
      if (event.calendarId?.startsWith('ics:')) {
        const feed = feedMap.get(event.calendarId.slice(4))
        if (feed && !feed.enabled) continue
      }
      for (const key of eventDayKeys(event)) {
        const existing = map.get(key)
        if (existing) existing.push(event)
        else map.set(key, [event])
      }
    }
    for (const events of map.values()) {
      events.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : a.allDay ? -1 : 1))
    }
    return map
  }, [snapshot.events, feedMap])

  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalTask[]>()
    for (const task of snapshot.tasks) {
      const key = localDayKey(new Date(task.due))
      const existing = map.get(key)
      if (existing) existing.push(task)
      else map.set(key, [task])
    }
    return map
  }, [snapshot.tasks])

  const [vmYear, vmMonth] = visibleMonthKey.split('-').map(Number)
  const [selectedYear, selectedMonth, selectedDay] = selectedKey.split('-').map(Number)
  const selectedDate = new Date(selectedYear, selectedMonth, selectedDay)
  const selectedEvents = eventsByDay.get(selectedKey) ?? []
  const selectedTasks = tasksByDay.get(selectedKey) ?? []

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const target = document.getElementById('cal-today') ?? document.getElementById(`cal-month-${today.getFullYear()}-${today.getMonth()}`)
    if (target) container.scrollTop = Math.max(0, scrollOffsetWithin(container, target) - rowHeightRef.current)
  }, [today])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const observer = new IntersectionObserver(entries => {
      const topmost = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      const key = topmost?.target.getAttribute('data-monthkey')
      if (key) setVisibleMonthKey(key)
    }, { root: container, threshold: 0, rootMargin: '0px 0px -85% 0px' })
    monthList.forEach(({ year, month }) => {
      const element = document.getElementById(`cal-month-${year}-${month}`)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [monthList])

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const container = scrollRef.current
    if (!anchor || !container) return
    const element = document.getElementById(anchor.key)
    if (!element) return
    container.scrollTop = element.offsetTop + anchor.offsetAboveGrid + anchor.rowsScrolled * rowHeight
  }, [rowHeight])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    function captureZoomAnchor() {
      const sections = Array.from(element!.querySelectorAll<HTMLElement>('[data-monthkey]'))
      let anchor: HTMLElement | null = null
      for (const section of sections) {
        if (section.offsetTop <= element!.scrollTop + 0.5) anchor = section
        else break
      }
      if (!anchor) anchor = sections[0] ?? null
      if (!anchor) return
      const grid = anchor.querySelector<HTMLElement>('[data-cal-grid]')
      const headerHeight = grid ? grid.offsetTop - anchor.offsetTop : 0
      const offsetIntoSection = element!.scrollTop - anchor.offsetTop
      const offsetAboveGrid = Math.min(Math.max(offsetIntoSection, 0), headerHeight)
      const offsetIntoGrid = Math.max(0, offsetIntoSection - headerHeight)
      zoomAnchorRef.current = { key: anchor.id, offsetAboveGrid, rowsScrolled: offsetIntoGrid / rowHeightRef.current }
    }
    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2) return
      const dx = event.touches[0].clientX - event.touches[1].clientX
      const dy = event.touches[0].clientY - event.touches[1].clientY
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), height: rowHeightRef.current }
      captureZoomAnchor()
    }
    function onTouchMove(event: TouchEvent) {
      if (event.touches.length !== 2 || !pinchRef.current) return
      event.preventDefault()
      const dx = event.touches[0].clientX - event.touches[1].clientX
      const dy = event.touches[0].clientY - event.touches[1].clientY
      const next = Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, Math.round(pinchRef.current.height * (Math.sqrt(dx * dx + dy * dy) / pinchRef.current.dist))))
      if (next !== rowHeightRef.current) {
        rowHeightRef.current = next
        setRowHeight(next)
      }
    }
    function onTouchEnd(event: TouchEvent) {
      if (event.touches.length < 2) pinchRef.current = null
    }
    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  function goToday() {
    setSelectedKey(todayKey)
    const container = scrollRef.current
    const target = document.getElementById('cal-today') ?? document.getElementById(`cal-month-${today.getFullYear()}-${today.getMonth()}`)
    if (container && target) {
      container.scrollTo({ top: Math.max(0, scrollOffsetWithin(container, target) - rowHeight), behavior: 'smooth' })
    }
  }

  function openDetail(event: CalEvent) {
    setDetail(event)
    setSheetTask(null)
    setSheetPane('detail')
    setSheetOpen(true)
  }

  function openTask(task: CalTask) {
    setSheetTask(task)
    setDetail(null)
    setSheetPane('task')
    setSheetOpen(true)
  }

  function openCreate() {
    setDetail(null)
    setSheetTask(null)
    setSheetPane('create')
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
    window.setTimeout(() => {
      setDetail(null)
      setSheetTask(null)
      setSheetPane('detail')
    }, 260)
  }

  async function toggleCalTask(id: string, current: boolean) {
    const nextCompleted = !current
    setTaskOverrides(prev => ({ ...prev, [id]: nextCompleted }))
    const source = getCurrentState().data.items.find(item => item.id === id)
    if (!source) return
    const payload = {
      ...source,
      status: nextCompleted ? 'completed' : 'active',
      completedAt: nextCompleted ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({ ...prev, data: { ...prev.data, items: prev.data.items.map(item => item.id === id ? { ...item, ...payload } : item) } }))
  }

  async function deleteEvent(event: CalEvent) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'calendar.event.delete',
      entityType: 'calendar_event',
      entityId: event.id,
      operation: 'delete',
      payload: null,
    }, prev => ({ ...prev, data: { ...prev.data, calendarEvents: prev.data.calendarEvents.filter(row => row.id !== event.id) } }))
    closeSheet()
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col" style={{ height: 'calc(100dvh - calc(96px + env(safe-area-inset-bottom)))' }}>
      <div className="flex shrink-0 items-center justify-between bg-bg px-3 pt-3 pb-2">
        <a href="/" className="-ml-1 flex items-center gap-1 text-accent active:opacity-60">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M10 3L5 8l5 5" /></svg>
          <span className="text-[16px]">Home</span>
        </a>
        <span className="text-[17px] font-bold text-text-1" style={{ letterSpacing: '-0.01em' }}>
          {MONTHS[vmMonth]} <span className="text-[15px] font-normal text-text-2">{vmYear}</span>
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setCalendarsOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-full text-accent active:bg-surface-2" aria-label="Manage calendars">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]"><circle cx="12" cy="12" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
          <button onClick={goToday} className="px-1 text-[16px] font-medium text-accent active:opacity-60">Today</button>
          <button onClick={openCreate} aria-label="Add event" className="flex h-9 w-9 items-center justify-center rounded-full text-accent active:bg-surface-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-7 border-b border-border bg-bg px-2">
        {WEEKDAYS.map((day, index) => <div key={`${day}-${index}`} className={`py-1 text-center text-[12px] font-semibold ${index >= 5 ? 'text-text-3' : 'text-text-2'}`}>{day}</div>)}
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain bg-bg" style={{ overflowAnchor: 'none' }}>
        {monthList.map(({ year, month, grid }) => (
          <section key={`${year}-${month}`} id={`cal-month-${year}-${month}`} data-monthkey={`${year}-${month}`}>
            <div className="px-3 pt-4 pb-1">
              <span className="text-[28px] font-bold text-text-1" style={{ letterSpacing: '-0.02em' }}>{MONTHS[month]}</span>
            </div>
            <div data-cal-grid className="px-2">
              {Array.from({ length: Math.ceil(grid.length / 7) }, (_, weekIndex) => grid.slice(weekIndex * 7, weekIndex * 7 + 7)).map(weekDays => (
                <div key={localDayKey(weekDays[0])} className="grid grid-cols-7 overflow-hidden border-t border-border" style={{ height: rowHeight }}>
                  {weekDays.map((date, col) => {
                    const key = localDayKey(date)
                    const inMonth = date.getMonth() === month
                    const dayEvents = inMonth ? eventsByDay.get(key) ?? [] : []
                    const dayTasks = inMonth ? tasksByDay.get(key) ?? [] : []
                    const showBars = rowHeight >= 64
                    const visible = [...dayEvents.map(event => ({ type: 'event' as const, id: event.id, title: event.title, color: getEventColor(event), time: event.allDay ? null : event.start, event })), ...dayTasks.map(task => ({ type: 'task' as const, id: task.id, title: task.title, color: task.color, time: task.due, task }))].slice(0, showBars ? 4 : 0)
                    const hidden = dayEvents.length + dayTasks.length - visible.length
                    const isToday = key === todayKey
                    const isSelected = key === selectedKey
                    return (
                      <button key={key} id={isToday ? 'cal-today' : undefined} data-daykey={key} onClick={() => setSelectedKey(key)} className="min-w-0 border-r border-border px-0.5 pt-1 pb-0.5 text-left active:opacity-70">
                        {inMonth ? (
                          <>
                            <span className="mb-[2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px]" style={{ background: isToday ? '#FF3B30' : isSelected ? 'var(--surface-2)' : 'transparent', color: isToday ? '#fff' : isSelected ? 'var(--text-1)' : col >= 5 ? 'var(--text-3)' : 'var(--text-1)', fontWeight: isToday || isSelected ? 700 : 400 }}>
                              {date.getDate()}
                            </span>
                            {showBars ? (
                              <div className="flex flex-col gap-[3px]">
                                {visible.map(item => (
                                  <span key={`${item.type}-${item.id}`} onClick={event => { event.stopPropagation(); item.type === 'event' ? openDetail(item.event) : openTask(item.task) }} className="block truncate rounded-[5px] px-1.5 py-[2px] text-[11px] font-semibold leading-tight" style={{ background: pillBg(item.color), color: pillText(item.color) }}>
                                    {item.type === 'task' ? '○ ' : ''}{item.title}{item.time && rowHeight > 120 ? <span className="ml-1 font-normal opacity-60">{cellTime(item.time)}</span> : null}
                                  </span>
                                ))}
                                {hidden > 0 ? <span className="px-1.5 text-[10.5px] font-semibold text-text-2">{hidden} more</span> : null}
                              </div>
                            ) : (
                              <div className="flex gap-[3px] px-0.5">
                                {[...dayEvents.map(event => getEventColor(event)), ...dayTasks.map(task => task.color)].slice(0, 3).map((color, index) => <div key={index} className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />)}
                              </div>
                            )}
                          </>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
        <div className="h-3" />
      </div>

      <div className="flex max-h-[35vh] shrink-0 flex-col rounded-t-3xl bg-surface" style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}>
        <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-0.5">
          <p className="text-[13px] font-semibold text-text-2">{fullDate(selectedDate)}</p>
          <button onClick={openCreate} className="text-[14px] font-medium text-accent active:opacity-60">+ Add</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
            <p className="py-3 text-center text-[14px] text-text-3">Nothing on</p>
          ) : (
            <div className="mb-2 overflow-hidden rounded-2xl bg-bg">
              {selectedEvents.map((event, index) => (
                <button key={event.id} onClick={() => openDetail(event)} className={`w-full items-start gap-3 px-4 py-1.5 text-left active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''} ${flashEventId === event.id ? 'flash-highlight' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="my-0.5 w-1 self-stretch rounded-full" style={{ background: getEventColor(event) }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-text-1">{event.title}</p>
                      {event.location ? <p className="mt-0.5 truncate text-[12.5px] text-text-2">{event.location}</p> : null}
                      {isMultiDay(event) ? <p className="mt-0.5 text-[12px] text-text-3">{eventDateLine(event)}</p> : null}
                    </div>
                    <div className="mt-0.5 shrink-0 text-right">
                      {event.allDay ? <p className="text-[12.5px] text-text-2">All day</p> : <><p className="text-[12.5px] text-text-2">{formatTime(event.start)}</p><p className="text-[12.5px] text-text-2">{formatTime(event.end > event.start ? event.end : event.start)}</p></>}
                    </div>
                  </div>
                </button>
              ))}
              {selectedTasks.map((task, index) => {
                const completed = taskOverrides[task.id] ?? task.completed
                return (
                  <div key={task.id} onClick={() => openTask(task)} className={`flex cursor-pointer items-center gap-3 px-4 py-1.5 active:bg-surface-2 ${(selectedEvents.length + index) > 0 ? 'border-t border-border' : ''}`}>
                    <button onClick={event => { event.stopPropagation(); void toggleCalTask(task.id, completed) }} className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-90" style={completed ? { background: task.color } : { border: `2px solid ${task.color}` }}>
                      {completed ? <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M4 10.5l4 4 8-9" /></svg> : null}
                    </button>
                    <p className={`flex-1 truncate text-[15px] font-medium ${completed ? 'text-text-3 line-through' : 'text-text-1'}`}>{task.title}</p>
                    <span className="shrink-0 text-[11px] font-bold" style={{ color: task.color }}>Task</span>
                  </div>
                )
              })}
            </div>
          )}
          <p className="text-center text-[11px] text-text-3">Synced family calendar available offline</p>
        </div>
      </div>

      {(sheetOpen || detail || sheetTask || sheetPane === 'create') ? (
        <CalendarSheet
          open={sheetOpen}
          pane={sheetPane}
          event={detail}
          task={sheetTask}
          selectedDate={selectedDate}
          eventColor={detail ? getEventColor(detail) : calColor}
          onClose={closeSheet}
          onEdit={() => setSheetPane('edit')}
          onDelete={deleteEvent}
          onTaskToggle={toggleCalTask}
          taskCompleted={sheetTask ? taskOverrides[sheetTask.id] ?? sheetTask.completed : false}
          householdId={snapshot.householdId}
          onSaved={closeSheet}
        />
      ) : null}

      {calendarsOpen ? (
        <CalendarsSheet
          calColor={calColor}
          onCalColorChange={color => { setCalColor(color); localStorage.setItem('homeos:cal-color', color) }}
          feeds={snapshot.feeds}
          householdId={snapshot.householdId}
          userId={snapshot.userId}
          onClose={() => setCalendarsOpen(false)}
        />
      ) : null}
    </div>
  )
}

function CalendarSheet({
  open,
  pane,
  event,
  task,
  selectedDate,
  eventColor,
  onClose,
  onEdit,
  onDelete,
  onTaskToggle,
  taskCompleted,
  householdId,
  onSaved,
}: {
  open: boolean
  pane: 'detail' | 'edit' | 'create' | 'task'
  event: CalEvent | null
  task: CalTask | null
  selectedDate: Date
  eventColor: string
  onClose: () => void
  onEdit: () => void
  onDelete: (event: CalEvent) => void
  onTaskToggle: (id: string, current: boolean) => void
  taskCompleted: boolean
  householdId: string
  onSaved: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: `rgba(0,0,0,${open ? 0.4 : 0})`, transition: 'background 0.32s', pointerEvents: open ? 'auto' : 'none' }} onClick={onClose} />
      <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-[51] flex justify-center">
        <div className="pointer-events-auto flex w-full max-w-lg flex-col rounded-t-[24px] bg-bg shadow-2xl" style={{ height: '92dvh', transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
          <div className="flex h-11 shrink-0 items-center justify-center"><button onClick={onClose} className="h-5 w-16" aria-label="Close"><div className="mx-auto h-[5px] w-10 rounded-full" style={{ background: 'color-mix(in srgb, var(--text-3) 40%, transparent)' }} /></button></div>
          {pane === 'detail' && event ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-2 pb-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-[5px] h-[14px] w-[14px] shrink-0 rounded-full" style={{ background: eventColor }} />
                  <h2 className="text-[22px] font-bold leading-tight text-text-1">{event.title}</h2>
                </div>
                <button onClick={onEdit} className="shrink-0 text-[15px] font-semibold text-accent active:opacity-60">Edit</button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-2">
                <div className="overflow-hidden rounded-2xl bg-surface">
                  <div className="px-4 py-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">When</p>
                    <p className="text-[15px] text-text-1">{eventDateLine(event)}</p>
                    {event.allDay ? <p className="mt-0.5 text-[14px] text-text-2">All day</p> : <p className="mt-0.5 text-[14px] text-text-2">{formatTime(event.start)} - {formatTime(event.end > event.start ? event.end : event.start)}</p>}
                  </div>
                  {event.location ? <div className="border-t border-border px-4 py-3"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">Where</p><p className="text-[15px] text-text-1">{event.location}</p></div> : null}
                </div>
                {event.description ? <div className="rounded-2xl bg-surface px-4 py-3"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">Notes</p><p className="whitespace-pre-wrap text-[14px] leading-relaxed text-text-1">{event.description}</p></div> : null}
                <button onClick={() => onDelete(event)} className="w-full rounded-2xl bg-surface px-4 py-3 text-[15px] font-semibold text-red active:bg-surface-2">Delete event</button>
              </div>
            </>
          ) : pane === 'task' && task ? (
            <>
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-2 pb-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-[5px] h-[14px] w-[14px] shrink-0 rounded-full" style={{ background: task.color }} />
                  <h2 className="text-[22px] font-bold leading-tight text-text-1">{task.title}</h2>
                </div>
                {task.listId ? <a href={`/household/tasks/${task.listId}`} onClick={onClose} className="shrink-0 text-[15px] font-semibold text-accent active:opacity-60">Open</a> : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-2">
                <div className="rounded-2xl bg-surface px-4 py-3"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-3">Due</p><p className="text-[15px] text-text-1">{fullDate(new Date(task.due))}</p></div>
                <button onClick={() => onTaskToggle(task.id, taskCompleted)} className="flex w-full items-center gap-4 rounded-2xl bg-surface px-4 py-3.5 text-left active:bg-surface-2">
                  <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={taskCompleted ? { background: task.color } : { border: `2px solid ${task.color}` }}>{taskCompleted ? <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><path d="M4 10.5l4 4 8-9" /></svg> : null}</div>
                  <span className={`text-[15px] font-medium ${taskCompleted ? 'text-text-3 line-through' : 'text-text-1'}`}>{taskCompleted ? 'Marked as done' : 'Mark as done'}</span>
                </button>
              </div>
            </>
          ) : (
            <EventEditor event={pane === 'edit' ? event : null} initialDate={event ? new Date(event.start) : selectedDate} householdId={householdId} onClose={pane === 'edit' && event ? () => undefined : onClose} onBack={pane === 'edit' && event ? () => undefined : undefined} onSaved={onSaved} />
          )}
        </div>
      </div>
    </>
  )
}

function EventEditor({ event, initialDate, householdId, onClose, onSaved }: { event: CalEvent | null; initialDate: Date; householdId: string; onClose: () => void; onBack?: () => void; onSaved: () => void }) {
  const editing = Boolean(event)
  const initial = (() => {
    if (!event) return { title: '', allDay: false, startDate: dateInput(initialDate), endDate: dateInput(initialDate), startTime: '09:00', endTime: '10:00', location: '', notes: '' }
    if (event.allDay) {
      const startLocal = allDayAsLocal(new Date(event.start))
      const endLocal = allDayAsLocal(new Date((event.end > event.start ? event.end : event.start + 86_400_000) - 86_400_000))
      return { title: event.title, allDay: true, startDate: dateInput(startLocal), endDate: dateInput(endLocal), startTime: '09:00', endTime: '10:00', location: event.location ?? '', notes: event.description ?? '' }
    }
    const start = new Date(event.start)
    const end = new Date(event.end > event.start ? event.end : event.start + 3_600_000)
    return { title: event.title, allDay: false, startDate: dateInput(start), endDate: dateInput(end), startTime: timeInput(start), endTime: timeInput(end), location: event.location ?? '', notes: event.description ?? '' }
  })()
  const [title, setTitle] = useState(initial.title)
  const [allDay, setAllDay] = useState(initial.allDay)
  const [startDate, setStartDate] = useState(initial.startDate)
  const [endDate, setEndDate] = useState(initial.endDate)
  const [startTime, setStartTime] = useState(initial.startTime)
  const [endTime, setEndTime] = useState(initial.endTime)
  const [location, setLocation] = useState(initial.location)
  const [notes, setNotes] = useState(initial.notes)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) {
      setError('Add a title for the event')
      return
    }
    const id = event?.id ?? makeId('calendar')
    const now = new Date().toISOString()
    const startsAt = allDay
      ? new Date(Date.UTC(...startDate.split('-').map(Number).map((value, index) => index === 1 ? value - 1 : value) as [number, number, number])).toISOString()
      : new Date(parseDateTime(startDate, startTime)).toISOString()
    const endsAt = allDay
      ? new Date(Date.UTC(...endDate.split('-').map(Number).map((value, index) => index === 1 ? value - 1 : value) as [number, number, number]) + 86_400_000).toISOString()
      : new Date(parseDateTime(endDate, endTime)).toISOString()
    const payload = {
      id,
      householdId,
      externalId: event?.calendarId?.startsWith('local:') ? event.calendarId.slice(6) : null,
      calendarId: event?.calendarId ?? 'local:homeos',
      title: title.trim(),
      description: notes.trim() || null,
      location: location.trim() || null,
      startsAt,
      endsAt,
      allDay,
      createdAt: event ? undefined : now,
      updatedAt: now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'calendar.event.upsert',
      entityType: 'calendar_event',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        calendarEvents: event
          ? prev.data.calendarEvents.map(row => row.id === id ? { ...row, ...payload } : row)
          : [...prev.data.calendarEvents, payload],
      },
    }))
    onSaved()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 pt-3 pb-2.5">
        <button onClick={onClose} className="min-w-[56px] text-[16px] text-accent active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold tracking-tight text-text-1">{editing ? 'Edit Event' : 'New Event'}</span>
        <button onClick={save} disabled={!title.trim()} className="min-w-[56px] text-right text-[16px] font-semibold text-accent active:opacity-60 disabled:opacity-40">{editing ? 'Done' : 'Add'}</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-4 pt-5 pb-10">
          <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
            <input value={title} onChange={event => setTitle(event.target.value)} placeholder="Title" className="w-full bg-transparent px-4 pt-4 pb-3 text-[20px] font-semibold text-text-1 outline-none placeholder:text-text-3" />
            <div className="flex items-center gap-3 border-t border-border px-4 py-3.5">
              <input value={location} onChange={event => setLocation(event.target.value)} placeholder="Location or address" className="flex-1 bg-transparent text-[15px] text-text-1 outline-none placeholder:text-text-3" />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
            <div className="flex items-center gap-3 px-4 py-3.5"><span className="flex-1 text-[15px] text-text-1">All-day</span><Toggle checked={allDay} onChange={setAllDay} /></div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3.5">
              <span className="shrink-0 text-[15px] text-text-2">Starts</span>
              <div className="flex items-center gap-2.5">
                <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="min-w-0 cursor-pointer border-0 bg-transparent text-[15px] font-medium text-accent outline-none" />
                {!allDay ? <><span className="text-[13px] text-text-3">·</span><input type="time" value={startTime} onChange={event => setStartTime(event.target.value)} className="min-w-0 cursor-pointer border-0 bg-transparent text-[15px] font-medium text-accent outline-none" /></> : null}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3.5">
              <span className="shrink-0 text-[15px] text-text-2">Ends</span>
              <div className="flex items-center gap-2.5">
                <input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value < startDate ? startDate : event.target.value)} className="min-w-0 cursor-pointer border-0 bg-transparent text-[15px] font-medium text-accent outline-none" />
                {!allDay ? <><span className="text-[13px] text-text-3">·</span><input type="time" value={endTime} onChange={event => setEndTime(event.target.value)} className="min-w-0 cursor-pointer border-0 bg-transparent text-[15px] font-medium text-accent outline-none" /></> : null}
              </div>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-surface shadow-sm">
            <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Notes" rows={3} className="w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-relaxed text-text-1 outline-none placeholder:text-text-3" />
          </div>
          {error ? <div className="rounded-xl bg-red-bg px-4 py-3"><p className="text-[13.5px] leading-snug text-red">{error}</p></div> : null}
        </div>
      </div>
    </div>
  )
}

function CalendarsSheet({ calColor, onCalColorChange, feeds, householdId, userId, onClose }: { calColor: string; onCalColorChange: (color: string) => void; feeds: CalFeed[]; householdId: string; userId: string; onClose: () => void }) {
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addingName, setAddingName] = useState('')
  const [addingUrl, setAddingUrl] = useState('')
  const [addingColor, setAddingColor] = useState(CAL_COLORS[1])

  function togglePicker(id: string) {
    setPickerFor(prev => prev === id ? null : id)
  }

  async function patchFeed(feed: CalFeed, patch: Partial<CalFeed>) {
    const payload = { ...feed, ...patch, updatedAt: new Date().toISOString() }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'calendar.feed.upsert',
      entityType: 'calendar_feed',
      entityId: feed.id,
      operation: 'upsert',
      payload,
    }, prev => ({ ...prev, data: { ...prev.data, calendarFeeds: prev.data.calendarFeeds.map(row => row.id === feed.id ? { ...row, ...payload } : row) } }))
  }

  async function addFeed() {
    if (!addingName.trim() || !addingUrl.trim()) return
    const id = makeId('feed')
    const now = new Date().toISOString()
    const payload = {
      id,
      householdId,
      userId,
      name: addingName.trim(),
      url: addingUrl.trim(),
      color: addingColor,
      enabled: true,
      lastSyncedAt: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'calendar.feed.upsert',
      entityType: 'calendar_feed',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({ ...prev, data: { ...prev.data, calendarFeeds: [...prev.data.calendarFeeds, payload] } }))
    setAddingName('')
    setAddingUrl('')
    setAddOpen(false)
    setPickerFor(null)
  }

  async function deleteFeed(feed: CalFeed) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'calendar.feed.delete',
      entityType: 'calendar_feed',
      entityId: feed.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        calendarFeeds: prev.data.calendarFeeds.filter(row => row.id !== feed.id),
        calendarEvents: prev.data.calendarEvents.filter(row => row.calendarId !== `ics:${feed.id}`),
      },
    }))
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="mx-auto max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[22px] bg-surface" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }} onClick={event => event.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="h-1 w-9 rounded-full bg-border opacity-50" /></div>
        <div className="flex items-center justify-between px-5 pt-2 pb-4">
          <h2 className="text-[19px] font-bold text-text-1" style={{ letterSpacing: '-0.01em' }}>Calendars</h2>
          <button onClick={onClose} className="text-[16px] font-semibold text-accent active:opacity-60">Done</button>
        </div>
        <div className="mb-4 px-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-3">Google Calendar</p>
          <div className="overflow-hidden rounded-2xl bg-bg">
            <div className="flex items-center gap-3 px-4 py-3">
              <button className="h-9 w-9 shrink-0 rounded-full transition-opacity active:opacity-70" style={{ background: calColor }} onClick={() => togglePicker('google')} aria-label="Change colour" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-text-1">Family Calendar</p>
                <p className="truncate text-[12px] text-text-2">Connected</p>
              </div>
            </div>
            {pickerFor === 'google' ? <ColorPicker current={calColor} onPick={color => { onCalColorChange(color); setPickerFor(null) }} /> : null}
          </div>
        </div>
        {(feeds.length > 0 || addOpen) ? (
          <div className="mb-4 px-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-3">Subscriptions</p>
            <div className="overflow-hidden rounded-2xl bg-bg">
              {feeds.map((feed, index) => (
                <div key={feed.id} className={index > 0 ? 'border-t border-border' : ''}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button className="h-9 w-9 shrink-0 rounded-full transition-opacity active:opacity-70" style={{ background: feed.color }} onClick={() => togglePicker(feed.id)} aria-label="Change colour" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-text-1">{feed.name}</p>
                      {feed.errorMessage ? <p className="truncate text-[11.5px] leading-snug text-red">! {feed.errorMessage}</p> : <p className="text-[11.5px] text-text-3">{syncTimeLabel(feed.lastSyncedAt)}</p>}
                    </div>
                    <button onClick={() => patchFeed(feed, { enabled: !feed.enabled })} className={`h-7 w-12 shrink-0 rounded-full transition-colors ${feed.enabled ? 'bg-sage' : 'bg-surface-2'}`} aria-label={feed.enabled ? 'Disable' : 'Enable'}>
                      <div className={`mx-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${feed.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {pickerFor === feed.id ? <ColorPicker current={feed.color} onPick={color => { patchFeed(feed, { color }); setPickerFor(null) }} /> : null}
                  <div className="flex items-center gap-4 px-4 pb-3">
                    <button className="text-[12px] font-semibold text-accent active:opacity-60">Sync now</button>
                    <button onClick={() => deleteFeed(feed)} className="text-[12px] font-semibold text-red active:opacity-60">Remove</button>
                  </div>
                </div>
              ))}
              {addOpen ? (
                <div className={feeds.length > 0 ? 'border-t border-border' : ''}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button className="h-9 w-9 shrink-0 rounded-full transition-opacity active:opacity-70" style={{ background: addingColor }} onClick={() => togglePicker('new')} aria-label="Choose colour" />
                    <input value={addingName} onChange={event => setAddingName(event.target.value)} placeholder="Name (e.g. School holidays)" className="flex-1 bg-transparent text-[15px] text-text-1 outline-none placeholder:text-text-3" autoFocus />
                  </div>
                  {pickerFor === 'new' ? <ColorPicker current={addingColor} onPick={color => { setAddingColor(color); setPickerFor(null) }} /> : null}
                  <div className="border-t border-border"><input value={addingUrl} onChange={event => setAddingUrl(event.target.value)} placeholder="ICS / iCal URL" type="url" className="w-full bg-transparent px-4 py-3 text-[15px] text-text-1 outline-none placeholder:text-text-3" /></div>
                  <div className="flex border-t border-border">
                    <button onClick={() => { setAddOpen(false); setAddingName(''); setAddingUrl(''); setPickerFor(null) }} className="flex-1 border-r border-border py-3 text-[15px] font-semibold text-text-2 active:bg-surface-2">Cancel</button>
                    <button onClick={addFeed} disabled={!addingName.trim() || !addingUrl.trim()} className="flex-1 py-3 text-[15px] font-semibold text-accent active:bg-surface-2 disabled:opacity-40">Subscribe</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {!addOpen ? (
          <div className="px-5">
            <button onClick={() => { setAddOpen(true); setPickerFor(null) }} className="flex w-full items-center gap-3 rounded-2xl bg-bg px-4 py-3 text-left active:bg-surface-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, var(--accent) 12%, var(--bg))' }}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4 text-accent"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>
              </span>
              <span className="text-[15px] font-semibold text-accent">Add calendar</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function CalendarPage() {
  return (
    <ScreenShell title="Calendar" showHeader={false}>
      <CalendarPageInner />
    </ScreenShell>
  )
}
