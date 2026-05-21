import Link from 'next/link'
import { db } from '@/lib/db'
import { records } from '@/lib/db/schema'
import { count } from 'drizzle-orm'
import { CATEGORIES } from '../categories'

export default async function LifeAdminPage() {
  const countRows = await db
    .select({ category: records.category, n: count() })
    .from(records)
    .groupBy(records.category)
  const counts: Record<string, number> = {}
  for (const r of countRows) counts[r.category] = r.n

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <div className="px-3 pt-3 pb-1">
        <Link href="/life" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1 w-fit">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          <span className="text-[16px]">Life</span>
        </Link>
      </div>

      <header className="px-5 pt-1 pb-3">
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">Records & Admin</h1>
        <p className="text-[13px] text-text-2 mt-0.5">Everything important, in its place</p>
      </header>

      <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
        {CATEGORIES.map((c, i) => (
          <Link
            key={c.key}
            href={`/life/${c.key}`}
            className={`flex items-center gap-3.5 px-4 py-3 active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="w-9 h-9 rounded-[9px] flex items-center justify-center text-[18px] shrink-0" style={{ background: `${c.color}1F` }}>
              {c.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-medium text-text-1">{c.label}</p>
              <p className="text-[12.5px] text-text-2 truncate">{c.desc}</p>
            </div>
            {counts[c.key] ? (
              <span className="text-[15px] text-text-2">{counts[c.key]}</span>
            ) : null}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </Link>
        ))}
      </div>

      <div className="h-4" />
    </div>
  )
}
