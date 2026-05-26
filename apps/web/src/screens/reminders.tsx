import { useMemo } from 'react'
import { ScreenShell } from './shell'
import { useAppState } from '../lib/app-store'

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

function daysUntil(timestamp: number) {
  return Math.round((timestamp - startOfToday()) / 86_400_000)
}

function formatShortDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function DueBadge({ timestamp }: { timestamp: number }) {
  const days = daysUntil(timestamp)
  const label = days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`
  return (
    <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
      days <= 0 ? 'bg-red-bg text-red' : days <= 7 ? 'bg-amber-bg text-amber' : 'bg-accent-bg text-accent'
    }`}>
      {label}
    </span>
  )
}

export function RemindersPage() {
  const snapshot = useAppState(state => {
    const entityById = new Map(state.data.records.map(record => [record.id, record]))

    const reminders = state.data.reminders
      .filter(reminder => !reminder.dismissedAt)
      .map(reminder => {
        const entity = entityById.get(reminder.entityId)
        if (!entity) return null
        return {
          id: reminder.id,
          href: `/life/admin/${entity.id}`,
          entityTitle: entity.title,
          message: reminder.message ?? null,
          triggerAt: new Date(reminder.triggerAt).getTime(),
        }
      })
      .filter((reminder): reminder is {
        id: string
        href: string
        entityTitle: string
        message: string | null
        triggerAt: number
      } => reminder !== null)
      .sort((a, b) => a.triggerAt - b.triggerAt)

    const renewals = state.data.records
      .filter(record => record.renewalDate)
      .map(record => ({
        id: record.id,
        href: `/life/admin/${record.id}`,
        title: record.title,
        renewalLabel: record.renewalLabel ?? 'Due',
        renewalDate: new Date(record.renewalDate as string | number | Date).getTime(),
        color: record.icon ?? '',
        category: record.category,
      }))
      .sort((a, b) => a.renewalDate - b.renewalDate)

    const categoryMeta = new Map([
      ['identity', { icon: '🪪', color: '#5856D6' }],
      ['home', { icon: '🏠', color: '#FF9500' }],
      ['utility', { icon: '💡', color: '#FFCC00' }],
      ['insurance', { icon: '🛡️', color: '#34C759' }],
      ['vehicle', { icon: '🚗', color: '#007AFF' }],
      ['contact', { icon: '📇', color: '#00C7BE' }],
      ['subscription', { icon: '💳', color: '#AF52DE' }],
      ['pet', { icon: '🐾', color: '#FF2D55' }],
      ['reference', { icon: '📋', color: '#8E8E93' }],
    ])

    return {
      reminders,
      renewals: renewals.map(item => ({
        ...item,
        icon: categoryMeta.get(item.category)?.icon ?? '📌',
        color: categoryMeta.get(item.category)?.color ?? '#8E8E93',
      })),
    }
  })

  const upcoming = useMemo(() => snapshot.reminders, [snapshot.reminders])

  return (
    <ScreenShell title="Reminders">
      <section className="mx-4 mb-5">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-3">Coming up</p>
        <div className="overflow-hidden rounded-2xl bg-surface">
          {upcoming.length > 0 ? (
            upcoming.map((reminder, index) => (
              <a
                key={reminder.id}
                href={reminder.href}
                className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-amber-bg text-[17px] text-amber">⏱</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-text-1">{reminder.message || reminder.entityTitle}</p>
                  <p className="mt-0.5 truncate text-[12px] text-text-2">{reminder.entityTitle} · {formatShortDate(reminder.triggerAt)}</p>
                </div>
                <DueBadge timestamp={reminder.triggerAt} />
              </a>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-1">No reminders coming up</p>
              <p className="mt-1 text-[12px] text-text-2">Add reminders from any record profile.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-4 mb-5">
        <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-3">Renewals & due dates</p>
        <div className="overflow-hidden rounded-2xl bg-surface">
          {snapshot.renewals.length > 0 ? (
            snapshot.renewals.map((entity, index) => (
              <a
                key={entity.id}
                href={entity.href}
                className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[18px]" style={{ background: `${entity.color}1F` }}>
                  {entity.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold text-text-1">{entity.title}</p>
                  <p className="mt-0.5 truncate text-[12px] text-text-2">{entity.renewalLabel} · {formatShortDate(entity.renewalDate)}</p>
                </div>
                <DueBadge timestamp={entity.renewalDate} />
              </a>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-1">No dates saved yet</p>
              <p className="mt-1 text-[12px] text-text-2">Add due dates from a record profile.</p>
            </div>
          )}
        </div>
      </section>
    </ScreenShell>
  )
}
