'use client'

import Link from 'next/link'
import { daysUntil } from '@/lib/utils/bins'
import { relativeDayLabel, eventTimeLabel } from '@/lib/utils/calendar'
import { PinnedBoard } from './pinned-board'
import { UserMenu } from './user-menu'
import type { PinColour } from '@/lib/db/schema'

type ShoppingItem = { id: string; title: string; checked: boolean }
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
  category: string
  label: string | null
  date: Date
}
type CalEvent = {
  id: string
  title: string
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  location: string | null
}
type Pin = { id: string; title: string; body: string | null; colour: PinColour }

interface Props {
  user: { name: string; email: string }
  shoppingItems: ShoppingItem[]
  dueTasks: Task[]
  inboxCount: number
  inboxPreview: InboxPreview[]
  bins: BinWithDate[]
  renewals: Renewal[]
  calendarEvents: CalEvent[]
  pins: Pin[]
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

function taskDueLabel(due: Date | null): { label: string; urgent: boolean } {
  if (!due) return { label: '', urgent: false }
  const d = daysUntil(due)
  if (d < 0)  return { label: 'Overdue', urgent: true }
  if (d === 0) return { label: 'Today',   urgent: true }
  if (d === 1) return { label: 'Tomorrow', urgent: false }
  return { label: `${d}d`, urgent: false }
}

export function DashboardClient({
  user, shoppingItems, dueTasks, inboxCount, inboxPreview, bins, renewals, calendarEvents, pins,
}: Props) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const hasAlerts = bins.length > 0 || dueTasks.length > 0 || inboxCount > 0

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

      {/* Pinned — fridge corkboard */}
      <PinnedBoard initialPins={pins} />

      {/* Today — only shown when there's something that needs attention */}
      {hasAlerts && (
        <section className="mx-4 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 mb-2">Today</p>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">

            {/* Bins going out */}
            {bins.map((bin, i) => {
              const days = daysUntil(bin.nextCollection)
              const dot = BIN_DOT[bin.colour] ?? '#6B7280'
              return (
                <div key={bin.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="w-[18px] h-[18px] rounded-full shrink-0 border-2 border-white/20" style={{ background: dot }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-text-1">{bin.name} bin</p>
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

            {/* Tasks due / overdue */}
            {dueTasks.map((task, i) => {
              const { label, urgent } = taskDueLabel(task.dueDate)
              const idx = bins.length + i
              return (
                <Link
                  key={task.id}
                  href={`/household/tasks/${task.listId ?? 'all'}`}
                  className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${idx > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-border shrink-0" />
                  <p className="flex-1 text-[13.5px] font-semibold text-text-1 truncate">{task.title}</p>
                  {label && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                      urgent ? 'bg-red-bg text-red' : 'bg-amber-bg text-amber'
                    }`}>
                      {label}
                    </span>
                  )}
                </Link>
              )
            })}

            {/* Inbox */}
            {inboxCount > 0 && (
              <Link
                href="/inbox"
                className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${(bins.length + dueTasks.length) > 0 ? 'border-t border-border' : ''}`}
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

      {/* All clear */}
      {!hasAlerts && (
        <div className="mx-4 mb-4 bg-surface border border-border rounded-2xl px-4 py-4 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-sage/15 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-sage">
              <path d="M3 8l3.5 3.5L13 4.5" />
            </svg>
          </div>
          <div>
            <p className="text-[13.5px] font-semibold text-text-1">All clear</p>
            <p className="text-[12px] text-text-2">Nothing needs attention right now</p>
          </div>
        </div>
      )}

      {/* Coming up — renewals / due dates within 30 days */}
      {renewals.length > 0 && (
        <section className="mx-4 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3 mb-2">Coming up</p>
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {renewals.map((r, i) => {
              const days = daysUntil(r.date)
              const dateStr = r.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
              const urgent = days <= 7
              return (
                <Link
                  key={r.id}
                  href={`/life/admin/${r.id}`}
                  className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-text-1 truncate">{r.title}</p>
                    <p className="text-[11.5px] text-text-2">{r.label ?? 'Due'} · {dateStr}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${
                    days < 0 ? 'bg-red-bg text-red' : urgent ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'
                  }`}>
                    {days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days}d`}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Calendar — upcoming events */}
      <section className="mx-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-3">Calendar</p>
          <Link href="/calendar" className="text-[11.5px] font-semibold text-accent">Full calendar</Link>
        </div>
        {calendarEvents.length === 0 ? (
          <Link
            href="/calendar"
            className="flex items-center gap-3 bg-surface border border-border rounded-2xl px-4 py-3 active:bg-bg"
          >
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
            {calendarEvents.map((ev, i) => {
              const dayLabel = relativeDayLabel(ev.startsAt, ev.allDay)
              const timeLabel = eventTimeLabel(ev.startsAt, ev.allDay)
              const isToday = dayLabel === 'Today'
              return (
                <Link key={ev.id} href="/calendar" className={`flex items-center gap-3 px-4 py-3 active:bg-bg ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="w-[18px] h-[18px] rounded-full bg-accent/15 flex items-center justify-center shrink-0">
                    <div className="w-[7px] h-[7px] rounded-full bg-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-text-1 truncate">{ev.title}</p>
                    {ev.location && (
                      <p className="text-[11.5px] text-text-2 truncate">{ev.location}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[11px] font-bold ${isToday ? 'text-accent' : 'text-text-2'}`}>{dayLabel}</p>
                    <p className="text-[11px] text-text-3">{timeLabel}</p>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

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
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            {shoppingItems.slice(0, 5).map((item, i) => (
              <div key={item.id} className={`flex items-center gap-3 px-4 py-[11px] ${i > 0 ? 'border-t border-border' : ''}`}>
                <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
                <span className="text-[13.5px] font-medium text-text-1">{item.title}</span>
              </div>
            ))}
            {shoppingItems.length > 5 && (
              <div className="px-4 py-[9px] border-t border-border">
                <span className="text-[12px] text-text-3">+ {shoppingItems.length - 5} more</span>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="h-4" />
    </div>
  )
}
