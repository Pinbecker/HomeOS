import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { bins } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getNextBinCollection, daysUntil, BIN_COLOURS } from '@/lib/utils/bins'

function describeSchedule(intervalWeeks: number, day: number): string {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]
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
      </header>

      {list.length === 0 ? (
        <div className="mx-4 bg-surface rounded-2xl px-4 py-8 text-center">
          <p className="text-[14px] text-text-2">No bins set up</p>
        </div>
      ) : (
        <div className="mx-4 flex flex-col gap-3">
          {list.map(bin => {
            const days = daysUntil(bin.next)
            const colour = BIN_COLOURS[bin.colour]?.bg ?? '#6B7280'
            const nextStr = bin.next.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
            const putOut = days <= 1
            return (
              <div key={bin.id} className="bg-surface rounded-2xl p-4 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-[12px] shrink-0 flex items-center justify-center" style={{ background: colour }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-semibold text-text-1">{bin.name}</p>
                  <p className="text-[12.5px] text-text-2">{describeSchedule(bin.intervalWeeks, bin.collectionDay)}</p>
                  <p className="text-[12.5px] text-text-2 mt-0.5">Next: {nextStr}</p>
                </div>
                <span className={`text-[12px] font-bold px-2.5 py-1 rounded-lg shrink-0 ${putOut ? 'bg-amber-bg text-amber' : 'bg-surface-2 text-text-2'}`}>
                  {whenLabel(days)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      <p className="px-5 pt-4 text-[12px] text-text-3 text-center">
        Bins you need to put out tonight appear on your Home screen.
      </p>

      <div className="h-4" />
    </div>
  )
}
