import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { daysUntil, formatShortDate, getRecordsReminderViewData } from '@/lib/entities/records'

function BackLink() {
  return (
    <Link href="/life/admin" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M10 3L5 8l5 5" />
      </svg>
      <span className="text-[16px]">Records</span>
    </Link>
  )
}

function DueBadge({ timestamp }: { timestamp: number }) {
  const days = daysUntil(timestamp)
  const label = days < 0 ? 'Overdue' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`
  return (
    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
      days <= 0 ? 'bg-red-bg text-red' : days <= 7 ? 'bg-amber-bg text-amber' : 'bg-accent-bg text-accent'
    }`}>
      {label}
    </span>
  )
}

export default async function RecordsRemindersPage() {
  await requireSession()
  const data = await getRecordsReminderViewData()

  return (
    <div className="flex flex-col max-w-lg mx-auto pb-4">
      <div className="px-3 pt-3 pb-2">
        <BackLink />
      </div>

      <header className="px-5 pt-1 pb-5">
        <h1 className="text-[34px] leading-tight font-extrabold text-text-1 tracking-tight">Reminders</h1>
        <p className="text-[16px] text-text-2 mt-1">Life admin dates and household follow-ups.</p>
      </header>

      <section className="mx-4 mb-5">
        <p className="text-[12px] font-bold uppercase tracking-wide text-text-3 mb-2">Coming up</p>
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {data.reminders.length > 0 ? (
            data.reminders.map((reminder, index) => (
              <Link key={reminder.id} href={reminder.href} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="w-9 h-9 rounded-[11px] bg-amber-bg flex items-center justify-center text-amber text-[17px] shrink-0">⏱</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-semibold text-text-1 truncate">{reminder.message || reminder.entityTitle}</p>
                  <p className="text-[12px] text-text-2 mt-0.5 truncate">{reminder.entityTitle} · {formatShortDate(reminder.triggerAt)}</p>
                </div>
                <DueBadge timestamp={reminder.triggerAt} />
              </Link>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-1">No reminders coming up</p>
              <p className="text-[12px] text-text-2 mt-1">Add reminders from any record profile.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-4 mb-5">
        <p className="text-[12px] font-bold uppercase tracking-wide text-text-3 mb-2">Renewals & due dates</p>
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {data.renewals.length > 0 ? (
            data.renewals.map((entity, index) => (
              <Link key={entity.id} href={entity.href} className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-[18px] shrink-0" style={{ background: `${entity.color}1F` }}>
                  {entity.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-semibold text-text-1 truncate">{entity.title}</p>
                  <p className="text-[12px] text-text-2 mt-0.5 truncate">{entity.renewalLabel ?? 'Due'} · {formatShortDate(entity.renewalDate!)}</p>
                </div>
                <DueBadge timestamp={entity.renewalDate!} />
              </Link>
            ))
          ) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-1">No dates saved yet</p>
              <p className="text-[12px] text-text-2 mt-1">Add due dates from a record profile.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
