import Link from 'next/link'
import { desc } from 'drizzle-orm'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { aiJobs } from '@/lib/db/schema'

function BackLink() {
  return (
    <Link href="/life/admin" className="flex items-center gap-1 text-accent active:opacity-60 -ml-1">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M10 3L5 8l5 5" />
      </svg>
      <span className="text-[16px]">Vault</span>
    </Link>
  )
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function actionLabel(action: Record<string, unknown>) {
  return [
    action.type,
    action.title ? `"${String(action.title)}"` : null,
    action.entityId ? String(action.entityId) : null,
  ].filter(Boolean).join(' · ')
}

export default async function AiLogPage() {
  await requireSession()
  const jobs = await db.query.aiJobs.findMany({
    orderBy: [desc(aiJobs.createdAt)],
    limit: 30,
  })

  return (
    <div className="flex flex-col max-w-lg mx-auto pb-4">
      <div className="px-3 pt-3 pb-2">
        <BackLink />
      </div>

      <header className="px-5 pt-1 pb-5">
        <h1 className="text-[34px] leading-tight font-extrabold text-text-1 tracking-tight">AI Log</h1>
        <p className="text-[16px] text-text-2 mt-1">Recent captures, plans, and actual results.</p>
      </header>

      <section className="mx-4">
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {jobs.length > 0 ? jobs.map((job, index) => {
            const plan = job.classification as { response?: string; result?: string; actions?: Record<string, unknown>[] } | null
            const executionResults = (job.executionResults ?? []) as Array<{
              status?: string
              type?: string
              reason?: string | null
              appliedActions?: Record<string, unknown>[]
            }>
            const hasMismatch = executionResults.some(result => result.status && result.status !== 'applied')
              || ((plan?.actions?.length ?? 0) > 0 && (job.actionsTaken?.length ?? 0) === 0 && job.status !== 'needs_clarification')

            return (
              <article key={job.id} className={`px-4 py-4 ${index > 0 ? 'border-t border-border' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-text-3">{formatDate(job.createdAt)} · {job.sourceType}</p>
                    <p className="text-[14.5px] font-semibold text-text-1 mt-1 whitespace-pre-wrap">{job.rawInput}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 ${
                    hasMismatch ? 'bg-amber-bg text-amber' : job.status === 'applied' ? 'bg-accent-bg text-accent' : 'bg-surface-2 text-text-2'
                  }`}>
                    {job.status}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2 text-[12.5px] leading-snug">
                  {plan?.response && (
                    <p className="text-text-2"><span className="font-semibold text-text-1">AI said:</span> {plan.response}</p>
                  )}
                  {job.finalResponse && (
                    <p className="text-text-2"><span className="font-semibold text-text-1">Final:</span> {job.finalResponse}</p>
                  )}
                  {plan?.actions && plan.actions.length > 0 && (
                    <p className="text-text-2"><span className="font-semibold text-text-1">Planned:</span> {plan.actions.map(action => String(action.type)).join(', ')}</p>
                  )}
                  {executionResults.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {executionResults.map((result, resultIndex) => (
                        <p key={resultIndex} className="text-text-2">
                          <span className="font-semibold text-text-1">{result.status ?? 'unknown'}:</span> {result.type}
                          {result.reason ? ` · ${result.reason}` : ''}
                          {result.appliedActions?.length ? ` · ${result.appliedActions.map(actionLabel).join('; ')}` : ''}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            )
          }) : (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] font-semibold text-text-1">No AI jobs yet</p>
              <p className="text-[12px] text-text-2 mt-1">Voice and text captures will appear here.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
