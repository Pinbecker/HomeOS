import { useMemo } from 'react'
import { Bell, CalendarClock, CircleDollarSign, Clock3, ShieldAlert, Wrench, type LucideIcon } from 'lucide-react'
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

type ReminderKind = 'general' | 'renewal' | 'expiry' | 'maintenance' | 'payment' | 'follow_up' | 'mot' | 'service'

function kindMeta(kind: ReminderKind | null | undefined): { label: string; icon: LucideIcon } {
  if (kind === 'renewal') return { label: 'Renewal', icon: CalendarClock }
  if (kind === 'expiry') return { label: 'Expiry', icon: Clock3 }
  if (kind === 'maintenance' || kind === 'mot' || kind === 'service') return { label: 'Maintenance', icon: Wrench }
  if (kind === 'payment') return { label: 'Payment', icon: CircleDollarSign }
  if (kind === 'follow_up') return { label: 'Follow-up', icon: Bell }
  return { label: 'Reminder', icon: Bell }
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

export function VaultDueContent({ inset = true }: { inset?: boolean } = {}) {
  const snapshot = useAppState(state => {
    const entityById = new Map(state.data.records.map(record => [record.id, record]))

    const typedReminders = state.data.reminders
      .filter(reminder => !reminder.dismissedAt)
      .map(reminder => {
        const entity = entityById.get(reminder.entityId)
        if (!entity) return null
        const kind = (reminder.kind ?? 'general') as ReminderKind
        const dueAt = new Date(reminder.dueAt ?? reminder.triggerAt).getTime()
        return {
          id: reminder.id,
          href: `/life/admin/${entity.id}`,
          entityTitle: entity.title,
          message: reminder.message ?? null,
          kind,
          dueAt,
          triggerAt: new Date(reminder.triggerAt).getTime(),
        }
      })
      .filter((reminder): reminder is {
        id: string
        href: string
        entityTitle: string
        message: string | null
        kind: ReminderKind
        dueAt: number
        triggerAt: number
      } => reminder !== null)

    const recordIdsWithTypedDates = new Set(typedReminders.filter(reminder => reminder.kind !== 'general').map(reminder => reminder.href))
    const legacyRenewals = state.data.records
      .filter(record => record.renewalDate && !recordIdsWithTypedDates.has(`/life/admin/${record.id}`))
      .map(record => ({
        id: `legacy-renewal-${record.id}`,
        href: `/life/admin/${record.id}`,
        entityTitle: record.title,
        message: record.renewalLabel ?? 'Renewal',
        kind: 'renewal' as ReminderKind,
        dueAt: new Date(record.renewalDate as string | number | Date).getTime(),
        triggerAt: new Date(record.renewalDate as string | number | Date).getTime(),
      }))

    return {
      dates: [...typedReminders, ...legacyRenewals].sort((a, b) => a.dueAt - b.dueAt),
    }
  })

  const groups = useMemo(() => {
    const overdue = snapshot.dates.filter(item => daysUntil(item.dueAt) < 0)
    const next = snapshot.dates.filter(item => daysUntil(item.dueAt) >= 0 && daysUntil(item.dueAt) <= 7)
    const later = snapshot.dates.filter(item => daysUntil(item.dueAt) > 7)
    return [
      { title: 'Overdue', items: overdue },
      { title: 'Next 7 days', items: next },
      { title: 'Later', items: later },
    ].filter(group => group.items.length > 0)
  }, [snapshot.dates])
  const sectionClassName = inset ? 'mx-4 mb-5' : 'mb-5'

  return (
    <>
      {groups.length > 0 ? groups.map(group => (
        <section key={group.title} className={sectionClassName}>
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-text-3">{group.title}</p>
          <div className="overflow-hidden rounded-2xl bg-surface">
            {group.items.map((reminder, index) => {
              const meta = kindMeta(reminder.kind)
              const Icon = meta.icon
              return (
                <a
                  key={reminder.id}
                  href={reminder.href}
                  className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-accent-bg text-accent">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-text-1">{reminder.message || reminder.entityTitle}</p>
                    <p className="mt-0.5 truncate text-[12px] text-text-2">{meta.label} · {reminder.entityTitle} · {formatShortDate(reminder.dueAt)}</p>
                  </div>
                  <DueBadge timestamp={reminder.dueAt} />
                </a>
              )
            })}
          </div>
        </section>
      )) : (
        <section className={sectionClassName}>
          <div className="overflow-hidden rounded-2xl bg-surface">
            <div className="px-4 py-8 text-center">
              <ShieldAlert className="mx-auto h-7 w-7 text-text-3" strokeWidth={1.9} />
              <p className="mt-3 text-[14px] font-semibold text-text-1">No important dates saved</p>
              <p className="mt-1 text-[12px] text-text-2">Add renewals, maintenance, payments and follow-ups from a Vault record.</p>
            </div>
          </div>
        </section>
      )}
    </>
  )
}

export function RemindersPage() {
  return (
    <ScreenShell title="Reminders">
      <VaultDueContent />
    </ScreenShell>
  )
}
