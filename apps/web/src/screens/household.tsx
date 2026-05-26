import { useMemo, useRef, useState } from 'react'
import { enqueueMutation, getCurrentState, makeId, useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

type StaticBinSchedule = {
  id: string
  name: string
  colour: string
  firstCollectionDate: string
  intervalWeeks: number
}

const STATIC_BIN_SCHEDULES: StaticBinSchedule[] = [
  { id: 'black-bin', name: 'Black bin', colour: 'black', firstCollectionDate: '2026-05-27', intervalWeeks: 3 },
  { id: 'recycling-food', name: 'Recycling containers and food bin', colour: 'blue', firstCollectionDate: '2026-05-27', intervalWeeks: 1 },
  { id: 'green-bin', name: 'Green bin', colour: 'green', firstCollectionDate: '2026-06-02', intervalWeeks: 2 },
  { id: 'hygiene-nappy', name: 'Hygiene and nappy waste bag', colour: 'pink', firstCollectionDate: '2026-06-03', intervalWeeks: 2 },
]

const BIN_COLOURS: Record<string, { bg: string; text: string; label: string }> = {
  grey: { bg: '#6B7280', text: '#fff', label: 'Grey bin' },
  blue: { bg: '#3B82F6', text: '#fff', label: 'Blue bin' },
  green: { bg: '#22C55E', text: '#fff', label: 'Green bin' },
  brown: { bg: '#92400E', text: '#fff', label: 'Brown bin' },
  black: { bg: '#1F2937', text: '#fff', label: 'Black bin' },
  pink: { bg: '#EC4899', text: '#fff', label: 'Nappy bin' },
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-text-3 shrink-0">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

function BackChevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M10 3L5 8l5 5" />
    </svg>
  )
}

function dateFromIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function todayAtMidnight() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function daysUntil(date: Date) {
  const today = todayAtMidnight()
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function getNextRecurringDate(firstCollectionDate: string, intervalWeeks: number) {
  const today = todayAtMidnight()
  const next = dateFromIsoDate(firstCollectionDate)
  const intervalDays = intervalWeeks * 7

  while (next < today) {
    next.setDate(next.getDate() + intervalDays)
  }

  return next
}

function getBinReminderDate(collectionDate: Date) {
  const reminder = new Date(collectionDate)
  reminder.setDate(reminder.getDate() - 1)
  return reminder
}

function describeSchedule(intervalWeeks: number, date: Date) {
  const weekday = WEEKDAYS[date.getDay()]
  if (intervalWeeks === 1) return `Weekly · ${weekday}`
  if (intervalWeeks === 2) return `Every 2 weeks · ${weekday}`
  if (intervalWeeks === 3) return `Every 3 weeks · ${weekday}`
  return `Every ${intervalWeeks} weeks · ${weekday}`
}

function whenLabel(days: number) {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export function HouseholdPage() {
  const sections = [
    {
      href: '/household/bins',
      label: 'Bins',
      desc: 'Collection schedule',
      color: '#34C759',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[16px] w-[16px]">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      ),
    },
    {
      href: '/household/shopping',
      label: 'Shopping',
      desc: 'Lists and shop runs',
      color: '#34C759',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-[16px] w-[16px]">
          <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
          <path d="M2.5 3h2l2.2 11.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 6H6" />
        </svg>
      ),
    },
    {
      href: '/household/plans',
      label: 'House Plans',
      desc: 'Projects & improvements',
      color: '#5856D6',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[16px] w-[16px]">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
  ]

  return (
    <ScreenShell title="Household">
      <div className="mx-4 overflow-hidden rounded-2xl bg-surface">
        {sections.map((section, index) => (
          <a
            key={section.href}
            href={section.href}
            className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: section.color }}>
              {section.icon}
            </div>
            <div className="flex-1">
              <p className="text-[16px] font-medium text-text-1">{section.label}</p>
              <p className="text-[12px] text-text-2">{section.desc}</p>
            </div>
            <Chevron />
          </a>
        ))}
      </div>
    </ScreenShell>
  )
}

export function BinsPage() {
  const bins = STATIC_BIN_SCHEDULES
    .map(bin => ({ ...bin, next: getNextRecurringDate(bin.firstCollectionDate, bin.intervalWeeks) }))
    .sort((a, b) => a.next.getTime() - b.next.getTime())

  return (
    <ScreenShell title="Bins" showHeader={false}>
      <div className="flex flex-col">
        <div className="px-3 pt-3 pb-1">
          <a href="/household" className="-ml-1 flex w-fit items-center gap-1 text-accent active:opacity-60">
            <BackChevron />
            <span className="text-[16px]">Household</span>
          </a>
        </div>

        <header className="px-5 pt-1 pb-3">
          <h1 className="text-[28px] font-bold tracking-tight text-text-1">Bins</h1>
          <p className="text-[13px] text-text-2">Fixed collection schedule. Home reminders show the day before.</p>
        </header>

        <div className="mx-4 flex flex-col gap-3">
          {bins.map(bin => {
            const days = daysUntil(bin.next)
            const colour = BIN_COLOURS[bin.colour]?.bg ?? '#6B7280'
            const nextStr = formatLongDate(bin.next)
            const reminderStr = formatLongDate(getBinReminderDate(bin.next))
            const putOut = days <= 1

            return (
              <div key={bin.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]" style={{ background: colour }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-text-1">{bin.name}</p>
                    <p className="text-[12.5px] text-text-2">{describeSchedule(bin.intervalWeeks, bin.next)}</p>
                    <p className="mt-0.5 text-[12.5px] text-text-2">Next: {nextStr}</p>
                    <p className="mt-0.5 text-[12.5px] text-text-2">Reminder: {reminderStr}</p>
                  </div>
                  <span className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold ${putOut ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'}`}>
                    {whenLabel(days)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="h-4" />
      </div>
    </ScreenShell>
  )
}

type Plan = { id: string; title: string; status: string; listId?: string | null; createdAt?: string | number | Date; updatedAt?: string | number | Date }

export function HousePlansPage() {
  const snapshot = useAppState(state => {
    const planList = state.data.lists.find(list => list.type === 'house_plans' && !list.archived) ?? null
    const plans = state.data.items
      .filter(item => item.type === 'task' && !item.deletedAt && item.listId === planList?.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    return {
      planList,
      active: plans.filter(plan => plan.status !== 'completed'),
      done: plans.filter(plan => plan.status === 'completed'),
      householdId: state.data.household[0]?.id ?? 'default',
      userId: state.data.users[0]?.id ?? 'system',
    }
  })

  const [newTitle, setNewTitle] = useState('')
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function ensurePlanListId() {
    if (snapshot.planList) return snapshot.planList.id
    const id = makeId('list')
    const payload = {
      id,
      householdId: snapshot.householdId,
      name: 'House Plans',
      type: 'house_plans',
      color: '#34C759',
      archived: false,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'list.upsert',
      entityType: 'list',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        lists: [...prev.data.lists, payload],
      },
    }))

    return id
  }

  async function addPlan() {
    const title = newTitle.trim()
    if (!title) return
    const listId = await ensurePlanListId()
    const id = makeId('task')
    const now = new Date().toISOString()
    const payload = {
      id,
      householdId: snapshot.householdId,
      createdById: snapshot.userId,
      type: 'task',
      title,
      status: 'active',
      listId,
      createdAt: now,
      updatedAt: now,
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: [...prev.data.items, payload],
      },
    }))

    setNewTitle('')
    inputRef.current?.focus()
  }

  async function setCompleted(plan: Plan, completed: boolean) {
    const payload = {
      ...plan,
      status: completed ? 'completed' : 'active',
      completedAt: completed ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    }
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.upsert',
      entityType: 'item',
      entityId: plan.id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.map(item => item.id === plan.id ? { ...item, ...payload } : item),
      },
    }))
  }

  async function removePlan(plan: Plan) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'task.delete',
      entityType: 'item',
      entityId: plan.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        items: prev.data.items.filter(item => item.id !== plan.id),
      },
    }))
  }

  function renderRow(plan: Plan, index: number, section: 'active' | 'done') {
    const color = '#34C759'
    return (
      <div key={plan.id} className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
        {section === 'active' ? (
          <button
            onClick={() => { void setCompleted(plan, true) }}
            className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-border transition-transform active:scale-90"
            aria-label="Mark done"
          />
        ) : (
          <button
            onClick={() => { void setCompleted(plan, false) }}
            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-transform active:scale-90"
            style={{ background: color }}
            aria-label="Mark undone"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
          </button>
        )}
        <p className={`flex-1 truncate text-[16px] ${section === 'done' ? 'text-text-2 line-through' : 'text-text-1'}`}>{plan.title}</p>
        <button onClick={() => { void removePlan(plan) }} className="text-[12px] font-semibold text-red active:opacity-60">Delete</button>
      </div>
    )
  }

  return (
    <ScreenShell title="House Plans">
      <div className="px-4">
        <div className="mb-3 px-1">
          <a href="/household" className="flex w-fit items-center gap-1 text-accent active:opacity-60">
            <BackChevron />
            <span className="text-[16px]">Household</span>
          </a>
        </div>

        <div className="mb-3 px-1">
          <p className="text-[13px] text-text-2">Projects & improvements</p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-surface">
          {snapshot.active.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-text-2">No plans yet</p>
            </div>
          ) : snapshot.active.map((plan, index) => renderRow(plan, index, 'active'))}
        </div>

        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-surface px-4 py-2.5">
          <div className="h-[22px] w-[22px] shrink-0 rounded-full border-2 border-border opacity-40" />
          <input
            ref={inputRef}
            value={newTitle}
            onChange={event => setNewTitle(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') void addPlan() }}
            placeholder="Add a plan"
            className="flex-1 bg-transparent text-[16px] text-text-1 placeholder:text-text-3 outline-none"
          />
        </div>

        {snapshot.done.length > 0 ? (
          <div className="mt-6">
            <button onClick={() => setShowDone(value => !value)} className="mb-2 flex items-center gap-1.5 px-1 text-text-2 active:opacity-60">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className={`h-3.5 w-3.5 transition-transform ${showDone ? 'rotate-90' : ''}`}>
                <path d="M6 4l4 4-4 4" />
              </svg>
              <span className="text-[14px] font-medium">{snapshot.done.length} Done</span>
            </button>
            {showDone ? (
              <div className="overflow-hidden rounded-2xl bg-surface">
                {snapshot.done.map((plan, index) => renderRow(plan, index, 'done'))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </ScreenShell>
  )
}
