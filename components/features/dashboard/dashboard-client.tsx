'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { daysUntil } from '@/lib/utils/bins'
import { eventTimeLabel, allDayAsLocal, startOfLocalDay } from '@/lib/utils/calendar'
import { PinnedBoard, type BoardPin } from './pinned-board'
import { UserMenu } from './user-menu'
import { AiCapture } from '@/components/features/ai/ai-capture'
import { toggleTask } from '@/app/(app)/household/tasks/actions'
import { toggleShoppingItem } from '@/app/(app)/household/shopping/actions'

type ShoppingItem = { id: string; title: string; checked: boolean; shopName: string; shopColor: string }
type Task = {
  id: string
  title: string
  dueDate: Date | null
  listId: string | null
  assignee: { name: string } | null
}
type InboxPreview = { id: string; title: string }
type BinWithDate = {
  id: string
  name: string
  colour: string
  nextCollection: Date
}
type Renewal = {
  id: string
  title: string
  label: string | null
  date: Date
  href: string
}
type CalEvent = {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  location: string | null
}
type Pin = BoardPin
type TonightShow = { title: string; channel: string; airtime: string; channelId: string; atMs: number }

interface Props {
  user: { name: string; email: string }
  shoppingItems: ShoppingItem[]
  tasks: Task[]
  inboxCount: number
  inboxPreview: InboxPreview[]
  bins: BinWithDate[]
  renewals: Renewal[]
  calendarEvents: CalEvent[]
  pins: Pin[]
  tonightShows: TonightShow[]
  shoppingTotal: number
}

const BIN_DOT: Record<string, string> = {
  grey:  '#6B7280',
  blue:  '#3B82F6',
  green: '#22C55E',
  brown: '#92400E',
  black: '#374151',
  pink:  '#EC4899',
}

function greeting(name: string) {
  const hour = new Date().getHours()
  const first = name.split(' ')[0]
  if (hour < 12) return `Good morning, ${first}`
  if (hour < 17) return `Good afternoon, ${first}`
  return `Good evening, ${first}`
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

type TimelineEntry =
  | { kind: 'calendar'; id: string; title: string; sortMs: number; timeLabel: string; sub: string | null }
  | { kind: 'task';     id: string; title: string; sortMs: number; taskId: string; listId: string | null; assignee: string | null; overdue: boolean }
  | { kind: 'renewal';  id: string; title: string; sortMs: number; sub: string | null; href: string; overdue: boolean }

type DayGroup = {
  key: string
  label: string
  isToday: boolean
  isOverdue: boolean
  entries: TimelineEntry[]
}

function buildTimeline(
  calendarEvents: CalEvent[],
  tasks: Task[],
  renewals: Renewal[],
  now: Date,
): DayGroup[] {
  const entries: TimelineEntry[] = []

  for (const ev of calendarEvents) {
    entries.push({
      kind: 'calendar',
      id: `cal-${ev.id}`,
      title: ev.title,
      sortMs: ev.startsAt.getTime(),
      timeLabel: ev.allDay ? 'All day' : eventTimeLabel(ev.startsAt, false),
      sub: ev.location,
    })
  }

  for (const task of tasks) {
    if (!task.dueDate) continue
    entries.push({
      kind: 'task',
      id: `task-${task.id}`,
      title: task.title,
      sortMs: task.dueDate.getTime(),
      taskId: task.id,
      listId: task.listId,
      assignee: task.assignee?.name ?? null,
      overdue: daysUntil(task.dueDate) < 0,
    })
  }

  for (const r of renewals) {
    entries.push({
      kind: 'renewal',
      id: `renewal-${r.id}`,
      title: r.title,
      sortMs: r.date.getTime(),
      sub: r.label,
      href: r.href,
      overdue: daysUntil(r.date) < 0,
    })
  }

  entries.sort((a, b) => a.sortMs - b.sortMs)

  const groupMap = new Map<string, DayGroup>()
  const today = startOfLocalDay(now)

  for (const entry of entries) {
    const entryDate = new Date(entry.sortMs)
    const isAllDay = entry.kind === 'calendar' && entry.timeLabel === 'All day'
    const itemDay = isAllDay ? allDayAsLocal(entryDate) : startOfLocalDay(entryDate)
    const diff = Math.round((itemDay.getTime() - today.getTime()) / 86_400_000)

    let key: string, label: string, isToday: boolean, isOverdue: boolean
    if (diff < 0) {
      key = '__overdue'; label = 'Overdue'; isToday = false; isOverdue = true
    } else if (diff === 0) {
      key = '__today'; label = 'Today'; isToday = true; isOverdue = false
    } else if (diff === 1) {
      key = '__tomorrow'; label = 'Tomorrow'; isToday = false; isOverdue = false
    } else {
      key = `${itemDay.getFullYear()}-${itemDay.getMonth()}-${itemDay.getDate()}`
      label = itemDay.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      isToday = false; isOverdue = false
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

function TimelineRow({
  entry,
  doneIds,
  onToggle,
  hasBorder,
}: {
  entry: TimelineEntry
  doneIds: Set<string>
  onToggle: (id: string) => void
  hasBorder: boolean
}) {
  const borderCls = hasBorder ? 'border-t border-border' : ''

  if (entry.kind === 'calendar') {
    return (
      <Link href="/calendar" className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${borderCls}`}>
        {/* Calendar icon — accent blue */}
        <div className="w-8 h-8 rounded-[9px] bg-accent-bg flex items-center justify-center shrink-0">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px] text-accent">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
            <path d="M2 6.5h12" />
            <path d="M5 1v3M11 1v3" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-text-1 truncate">{entry.title}</p>
          {entry.sub && <p className="text-[11.5px] text-text-2 truncate mt-0.5">{entry.sub}</p>}
        </div>
        <span className="text-[11.5px] text-text-2 shrink-0 ml-2">{entry.timeLabel}</span>
      </Link>
    )
  }

  if (entry.kind === 'task') {
    const done = doneIds.has(entry.taskId)
    return (
      <div className={`flex items-center gap-3 px-4 py-3 ${borderCls}`}>
        {/* Checkable circle — sage green */}
        <button
          onClick={() => onToggle(entry.taskId)}
          className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center active:scale-90 transition-transform ${
            done ? 'bg-sage' : 'border-2 border-border bg-surface'
          }`}
          aria-label={done ? `Mark "${entry.title}" incomplete` : `Mark "${entry.title}" complete`}
        >
          {done && (
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <path d="M3 8l3.5 3.5L13 4.5" />
            </svg>
          )}
        </button>
        <Link href={`/household/tasks/${entry.listId ?? 'all'}`} className="flex-1 min-w-0 active:opacity-70">
          <p className={`text-[13.5px] font-semibold truncate ${done ? 'text-text-2 line-through' : 'text-text-1'}`}>{entry.title}</p>
          {entry.assignee && !done && <p className="text-[11.5px] text-text-2 mt-0.5">{entry.assignee}</p>}
        </Link>
        {entry.overdue && !done && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-bg text-red shrink-0 ml-2">Overdue</span>
        )}
      </div>
    )
  }

  // renewal — amber clock
  const days = daysUntil(new Date(entry.sortMs))
  return (
    <Link href={entry.href} className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${borderCls}`}>
      <div className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${entry.overdue ? 'bg-red-bg' : 'bg-amber-bg'}`}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={`w-[15px] h-[15px] ${entry.overdue ? 'text-red' : 'text-amber'}`}>
          <circle cx="8" cy="8.5" r="5.5" />
          <path d="M8 6v3l1.5 1.5" />
          <path d="M5.5 1.5l1 1.5M10.5 1.5l-1 1.5" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-text-1 truncate">{entry.title}</p>
        {entry.sub && <p className="text-[11.5px] text-text-2 truncate mt-0.5">{entry.sub}</p>}
      </div>
      {entry.overdue
        ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-red-bg text-red shrink-0 ml-2">Overdue</span>
        : days > 0
          ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ml-2 ${days <= 7 ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'}`}>{days}d</span>
          : null
      }
    </Link>
  )
}

function ScheduleBlock({
  calendarEvents,
  tasks,
  renewals,
  doneIds,
  onToggle,
}: {
  calendarEvents: CalEvent[]
  tasks: Task[]
  renewals: Renewal[]
  doneIds: Set<string>
  onToggle: (id: string) => void
}) {
  const groups = buildTimeline(calendarEvents, tasks, renewals, new Date())

  return (
    <section className="mx-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Schedule</p>
        <Link href="/calendar" className="text-[11.5px] font-semibold text-accent">Calendar</Link>
      </div>

      {groups.length === 0 ? (
        <Link href="/calendar" className="flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3 active:bg-bg">
          <div className="w-[18px] h-[18px] rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <div className="w-[7px] h-[7px] rounded-full bg-accent" />
          </div>
          <span className="flex-1 text-[13.5px] text-text-2">Nothing in the next two weeks</span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </Link>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {groups.map((group, gi) => (
            <div key={group.key}>
              {/* Day header */}
              <div className={`px-4 py-[7px] bg-surface-2 ${gi > 0 ? 'border-t border-border' : ''}`}>
                <p className={`text-[10px] font-bold uppercase tracking-[0.09em] ${
                  group.isOverdue ? 'text-red'
                  : group.isToday  ? 'text-accent'
                  : 'text-text-3'
                }`}>
                  {group.label}
                </p>
              </div>
              {group.entries.map((entry, ei) => (
                <TimelineRow
                  key={entry.id}
                  entry={entry}
                  doneIds={doneIds}
                  onToggle={onToggle}
                  hasBorder={ei > 0}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── On Tonight — aurora card ─────────────────────────────────────────────────

function OnTonightCard({ shows }: { shows: TonightShow[] }) {
  return (
    <section className="mx-4 mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">On Tonight</p>
        <Link href="/watch" className="text-[11.5px] font-semibold text-accent">TV Guide</Link>
      </div>
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: [
            'radial-gradient(ellipse at 15% 80%, rgba(139,92,246,0.55) 0%, transparent 52%)',
            'radial-gradient(ellipse at 88% 15%, rgba(6,182,212,0.38) 0%, transparent 50%)',
            'radial-gradient(ellipse at 52% 52%, rgba(99,102,241,0.22) 0%, transparent 48%)',
            '#070c1e',
          ].join(', '),
          boxShadow: '0 2px 32px rgba(139,92,246,0.18), 0 1px 0 rgba(255,255,255,0.04) inset',
        }}
      >
        {shows.map((show, i) => (
          <Link
            key={show.title}
            href={`/watch?channel=${encodeURIComponent(show.channelId)}&at=${show.atMs}`}
            className={`flex items-center gap-3.5 px-4 py-4 active:bg-white/5 transition-colors ${i > 0 ? 'border-t border-white/[0.08]' : ''}`}
          >
            {/* Glass TV icon */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(255,255,255,0.10)',
                border: '1px solid rgba(255,255,255,0.14)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <rect x="1.5" y="5" width="17" height="12" rx="2" />
                <path d="M6.5 3l3.5 2 3.5-2" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-semibold text-white leading-snug">{show.title}</p>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.48)' }}>{show.channel}</p>
            </div>
            <span className="text-[12.5px] font-medium shrink-0 ml-2" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {show.airtime}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardClient({
  user, shoppingItems, tasks, inboxCount, inboxPreview, bins, renewals, calendarEvents, pins, tonightShows, shoppingTotal,
}: Props) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  function toggleDashTask(id: string) {
    setDoneTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    startTransition(() => { toggleTask(id) })
  }

  const [checkedShopIds, setCheckedShopIds] = useState<Set<string>>(new Set())

  function toggleShopItem(id: string) {
    setCheckedShopIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    startTransition(() => { toggleShoppingItem(id) })
  }

  const hasAlerts = bins.length > 0 || inboxCount > 0

  return (
    <div className="flex flex-col max-w-lg mx-auto">

      {/* Header */}
      <header className="px-5 pt-5 pb-5 flex items-start justify-between">
        <div>
          <p className="text-[11.5px] font-semibold text-text-3 mb-1 tracking-wide uppercase">{dateStr}</p>
          <h1 className="text-[22px] font-extrabold text-text-1 leading-tight tracking-tight">
            {greeting(user.name)}
          </h1>
        </div>
        <UserMenu user={user} />
      </header>

      <AiCapture surface="home" placeholder="Speak or type anything for the house brain" />

      {/* Pinned — fridge corkboard */}
      <PinnedBoard initialPins={pins} />

      {/* Alerts — bins going out + inbox (compact strip, only when needed) */}
      {hasAlerts && (
        <section className="mx-4 mb-4">
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">

            {bins.map((bin, i) => {
              const days = daysUntil(bin.nextCollection)
              const dot = BIN_DOT[bin.colour] ?? '#6B7280'
              return (
                <div key={bin.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="w-[18px] h-[18px] rounded-full shrink-0 border-2 border-white/20" style={{ background: dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-text-1">{bin.name}</p>
                    <p className="text-[11.5px] text-text-2">
                      {days === 0 ? 'Put out today' : 'Put out tonight before bed'}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-amber bg-amber-bg px-2 py-0.5 rounded-lg shrink-0">
                    {days === 0 ? 'Today' : 'Tomorrow'}
                  </span>
                </div>
              )
            })}

            {inboxCount > 0 && (
              <Link
                href="/inbox"
                className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${bins.length > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="w-[18px] h-[18px] rounded-full bg-accent flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-extrabold text-white leading-none">{Math.min(inboxCount, 99)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-text-1">
                    {inboxCount === 1 ? '1 item to sort' : `${inboxCount} items to sort`}
                  </p>
                  {inboxPreview[0] && (
                    <p className="text-[11.5px] text-text-2 truncate">&ldquo;{inboxPreview[0].title}&rdquo;</p>
                  )}
                </div>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* On Tonight — aurora feature card */}
      {tonightShows.length > 0 && <OnTonightCard shows={tonightShows} />}

      {/* Schedule — unified timeline: calendar + tasks + renewals */}
      <ScheduleBlock
        calendarEvents={calendarEvents}
        tasks={tasks}
        renewals={renewals}
        doneIds={doneTaskIds}
        onToggle={toggleDashTask}
      />

      {/* Shopping — always shown */}
      <section className="mx-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Shopping</p>
          <Link href="/household/shopping" className="text-[11.5px] font-semibold text-accent">Full list</Link>
        </div>

        {shoppingItems.length === 0 ? (
          <Link
            href="/household/shopping"
            className="flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3"
          >
            <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border shrink-0 opacity-40" />
            <span className="text-[13.5px] text-text-3">Add shopping items</span>
          </Link>
        ) : (
          <div className="bg-surface border border-border rounded-2xl px-2 py-1.5">
            <div className="grid grid-cols-2 gap-x-3">
              {shoppingItems.map(item => {
                const checked = checkedShopIds.has(item.id)
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleShopItem(item.id)}
                    className="flex items-center gap-2.5 px-2 py-[9px] min-w-0 text-left active:opacity-70"
                  >
                    <span
                      className="w-5 h-5 rounded-[6px] shrink-0 flex items-center justify-center transition-transform active:scale-90"
                      style={
                        checked
                          ? { background: item.shopColor, boxShadow: `0 0 0 2px ${item.shopColor}` }
                          : { boxShadow: `0 0 0 2px ${item.shopColor}` }
                      }
                      title={item.shopName}
                    >
                      {checked && (
                        <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                          <path d="M3 8l3.5 3.5L13 4.5" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[13.5px] font-medium truncate ${checked ? 'text-text-2 line-through' : 'text-text-1'}`}>{item.title}</span>
                  </button>
                )
              })}
            </div>
            {shoppingTotal > shoppingItems.length && (
              <div className="px-2 pt-1 pb-0.5">
                <span className="text-[12px] text-text-3">+ {shoppingTotal - shoppingItems.length} more</span>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="h-4" />
    </div>
  )
}
