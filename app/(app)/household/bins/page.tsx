import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { bins } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getNextBinCollection, getBinReminderDate, daysUntil, BIN_COLOURS } from '@/lib/utils/bins'
import { createBin, updateBinSchedule } from './actions'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const INTERVAL_OPTIONS = [
  { value: 1, label: 'Weekly' },
  { value: 2, label: 'Every 2 weeks' },
  { value: 3, label: 'Every 3 weeks' },
  { value: 4, label: 'Every 4 weeks' },
]

function describeSchedule(intervalWeeks: number, day: number): string {
  const weekday = WEEKDAYS[day]
  if (intervalWeeks === 1) return `Every ${weekday}`
  if (intervalWeeks === 2) return `Every 2 weeks · ${weekday}`
  if (intervalWeeks === 3) return `Every 3 weeks · ${weekday}`
  return `Every ${intervalWeeks} weeks · ${weekday}`
}

function whenLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-3">{label}</span>
      {children}
    </label>
  )
}

const inputClass = 'w-full min-h-11 rounded-xl border border-border bg-bg px-3 text-[14px] font-medium text-text-1 outline-none focus:border-accent'

export default async function BinsPage() {
  await requireSession()

  const rows = await db.query.bins.findMany({ where: eq(bins.active, true) })
  const list = rows
    .map(b => ({ ...b, next: getNextBinCollection(b) }))
    .sort((a, b) => a.next.getTime() - b.next.getTime())

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <div className="px-3 pt-3 pb-1">
        <Link href="/household" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1 w-fit">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Household</span>
        </Link>
      </div>

      <header className="px-5 pt-1 pb-3">
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">Bins</h1>
        <p className="text-[13px] text-text-2 mt-1">
          Set each collection from a real collection date. Home reminders show the day before.
        </p>
      </header>

      {list.length === 0 ? (
        <div className="mx-4 bg-surface rounded-2xl px-4 py-8 text-center">
          <p className="text-[14px] text-text-2">No bins set up yet</p>
        </div>
      ) : (
        <div className="mx-4 flex flex-col gap-3">
          {list.map(bin => {
            const days = daysUntil(bin.next)
            const colour = BIN_COLOURS[bin.colour]?.bg ?? '#6B7280'
            const nextStr = formatLongDate(bin.next)
            const reminderStr = formatLongDate(getBinReminderDate(bin.next))
            const putOut = days <= 1
            return (
              <div key={bin.id} className="bg-surface border border-border rounded-2xl p-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-[12px] shrink-0 flex items-center justify-center" style={{ background: colour }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[16px] font-semibold text-text-1">{bin.name}</p>
                    <p className="text-[12.5px] text-text-2">{describeSchedule(bin.intervalWeeks, bin.collectionDay)}</p>
                    <p className="text-[12.5px] text-text-2 mt-0.5">Next: {nextStr}</p>
                    <p className="text-[12.5px] text-text-2 mt-0.5">Reminder: {reminderStr}</p>
                  </div>
                  <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${putOut ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'}`}>
                    {whenLabel(days)}
                  </span>
                </div>

                <form action={updateBinSchedule} className="mt-4 grid grid-cols-2 gap-3">
                  <input type="hidden" name="binId" value={bin.id} />
                  <div className="col-span-2">
                    <Field label="Last collected">
                      <input name="anchorDate" type="date" required defaultValue={bin.anchorDate ?? ''} className={inputClass} />
                    </Field>
                  </div>
                  <Field label="Collection day">
                    <select name="collectionDay" required defaultValue={bin.collectionDay} className={inputClass}>
                      {WEEKDAYS.map((weekday, index) => (
                        <option key={weekday} value={index}>{weekday}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Frequency">
                    <select name="intervalWeeks" required defaultValue={bin.intervalWeeks} className={inputClass}>
                      {INTERVAL_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <button type="submit" className="col-span-2 min-h-11 rounded-xl bg-accent px-4 text-[14px] font-bold text-white active:opacity-70">
                    Save schedule
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}

      <section className="mx-4 mt-4 bg-surface border border-border rounded-2xl p-4">
        <h2 className="text-[16px] font-bold text-text-1">Add a bin</h2>
        <form action={createBin} className="mt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Name">
              <input name="name" required placeholder="Recycling" className={inputClass} />
            </Field>
          </div>
          <Field label="Colour">
            <select name="colour" required defaultValue="blue" className={inputClass}>
              {Object.entries(BIN_COLOURS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Last collected">
            <input name="anchorDate" type="date" required className={inputClass} />
          </Field>
          <Field label="Collection day">
            <select name="collectionDay" required defaultValue={1} className={inputClass}>
              {WEEKDAYS.map((weekday, index) => (
                <option key={weekday} value={index}>{weekday}</option>
              ))}
            </select>
          </Field>
          <Field label="Frequency">
            <select name="intervalWeeks" required defaultValue={2} className={inputClass}>
              {INTERVAL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <button type="submit" className="col-span-2 min-h-11 rounded-xl bg-text-1 px-4 text-[14px] font-bold text-surface active:opacity-70">
            Add bin
          </button>
        </form>
      </section>

      <div className="h-4" />
    </div>
  )
}
