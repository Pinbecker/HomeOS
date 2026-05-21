import Link from 'next/link'
import { db } from '@/lib/db'
import { items, lists } from '@/lib/db/schema'
import { and, eq, isNull, asc } from 'drizzle-orm'
import { HousePlansView } from './plans-view'

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? 'default'

export default async function HousePlansPage() {
  const list = await db.query.lists.findFirst({
    where: and(eq(lists.householdId, HOUSEHOLD_ID), eq(lists.type, 'house_plans')),
  })

  const plans = list
    ? await db.query.items.findMany({
        where: and(eq(items.listId, list.id), isNull(items.deletedAt)),
        orderBy: [asc(items.createdAt)],
        columns: { id: true, title: true, status: true },
      })
    : []

  const active = plans.filter(p => p.status !== 'completed')
  const done = plans.filter(p => p.status === 'completed')

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
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">House Plans</h1>
        <p className="text-[13px] text-text-2 mt-0.5">Projects & improvements</p>
      </header>

      <HousePlansView initialActive={active} initialDone={done} />
    </div>
  )
}
