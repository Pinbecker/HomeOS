import Link from 'next/link'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { and, eq, isNull, desc } from 'drizzle-orm'
import { PlansView } from './plans-view'

export default async function PlansPage() {
  const rows = await db.query.items.findMany({
    where: and(eq(items.type, 'trip_idea'), isNull(items.deletedAt)),
    orderBy: [desc(items.createdAt)],
    columns: { id: true, title: true, body: true, status: true },
  })

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
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">Plans & Trips</h1>
        <p className="text-[13px] text-text-2 mt-0.5">Holiday ideas, day trips & adventures</p>
      </header>

      <PlansView initialItems={rows} />
    </div>
  )
}
