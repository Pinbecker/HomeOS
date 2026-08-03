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
  if (kind === 'maintenance' || kind === 'mot' || kind === 'service') return { label: 'Service', icon: Wrench }
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
      { title: 'Overdue', eyebrow: 'Needs attention', tone: 'overdue', icon: ShieldAlert, items: overdue },
      { title: 'Next 7 days', eyebrow: 'Coming up soon', tone: 'soon', icon: CalendarClock, items: next },
      { title: 'Later', eyebrow: 'On the horizon', tone: 'later', icon: Clock3, items: later },
    ].filter(group => group.items.length > 0)
  }, [snapshot.dates])

  const overdueCount = snapshot.dates.filter(item => daysUntil(item.dueAt) < 0).length
  const soonCount = snapshot.dates.filter(item => daysUntil(item.dueAt) >= 0 && daysUntil(item.dueAt) <= 7).length
  const laterCount = snapshot.dates.length - overdueCount - soonCount

  return (
    <div className={`vault-due-content ${inset ? 'is-inset' : ''}`}>
      {groups.length > 0 ? (
        <>
          <section className="vault-due-overview">
            <div className="vault-due-overview-copy">
              <span><CalendarClock /></span>
              <div><small>DATE RADAR</small><strong>{snapshot.dates.length} important {snapshot.dates.length === 1 ? 'date' : 'dates'}</strong><p>Everything that needs your attention, in order.</p></div>
            </div>
            <div className="vault-due-stats" aria-label="Due date summary">
              <span className="is-overdue"><b>{overdueCount}</b><small>Overdue</small></span>
              <span className="is-soon"><b>{soonCount}</b><small>This week</small></span>
              <span className="is-later"><b>{laterCount}</b><small>Later</small></span>
            </div>
          </section>

          {groups.map(group => {
            const GroupIcon = group.icon
            return (
              <section key={group.title} className={`vault-due-group is-${group.tone}`}>
                <header className="vault-due-group-header">
                  <span><GroupIcon /></span>
                  <div><small>{group.eyebrow}</small><h2>{group.title}</h2></div>
                  <b>{group.items.length}</b>
                </header>
                <div className="vault-due-list">
                  {group.items.map((reminder, index) => {
                    const meta = kindMeta(reminder.kind)
                    const Icon = meta.icon
                    return (
                      <a
                        key={reminder.id}
                        href={reminder.href}
                        className={`vault-due-row ${index > 0 ? 'is-divided' : ''}`}
                      >
                        <span className="vault-due-row-icon"><Icon /></span>
                        <div className="vault-due-row-copy">
                          <small>{meta.label} · DUE {formatShortDate(reminder.dueAt).toUpperCase()}</small>
                          <p>{reminder.entityTitle}</p>
                          {reminder.message ? <span>{reminder.message}</span> : null}
                        </div>
                        <DueBadge timestamp={reminder.dueAt} />
                      </a>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </>
      ) : (
        <section className="vault-due-empty">
          <span><ShieldAlert /></span>
          <p>No important dates saved</p>
          <small>Add renewals, services, payments and follow-ups from a Vault record.</small>
        </section>
      )}
    </div>
  )
}

export function RemindersPage() {
  return (
    <ScreenShell title="Reminders">
      <div className="family-summary-card family-summary-reminders">
        <div><small>COMING UP</small><strong>Important dates</strong><span>Renewals, services and follow-ups.</span></div>
        <Bell />
      </div>
      <div className="family-content-label"><small>YOUR TIMELINE</small><h2>Upcoming</h2></div>
      <VaultDueContent />
    </ScreenShell>
  )
}
