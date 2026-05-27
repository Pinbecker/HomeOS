import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { SwipeRow } from '../components/swipe-row'
import { enqueueMutation, makeId, type CycleEntry, useAppState } from '../lib/app-store'
import {
  addCycleDays,
  calculateCycleInsights,
  cycleCalendarItems,
  cycleDate,
  cycleDateInput,
  cycleDayKey,
  formatCycleDate,
  parseCycleDateInput,
  type CycleConfidence,
  type CycleInsights,
} from '../lib/cycle-tracker'
import { ScreenShell } from './shell'

const ACCENT = '#C04A7A'
const SOFT = 'color-mix(in srgb, #C04A7A 11%, var(--surface))'
const SOFTER = 'color-mix(in srgb, #C04A7A 7%, var(--surface))'
const DAY_MS = 86_400_000
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

type DayStatus = 'confirmed' | 'estimated' | 'predicted'

export function CycleTrackerPage() {
  const snapshot = useAppState(state => ({
    householdId: state.data.household[0]?.id ?? 'default',
    entries: state.data.cycleEntries,
  }))
  const insights = useMemo(() => calculateCycleInsights(snapshot.entries), [snapshot.entries])
  const latestAnchor = insights.latestStart ?? new Date()
  const [month, setMonth] = useState(() => new Date(Date.UTC(latestAnchor.getUTCFullYear(), latestAnchor.getUTCMonth(), 1)))
  const [startDate, setStartDate] = useState(() => cycleDateInput(new Date()))
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [timelineOpen, setTimelineOpen] = useState(false)

  useEffect(() => {
    if (!timelineOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [timelineOpen])

  function resetForm() {
    setStartDate(cycleDateInput(new Date()))
    setEndDate('')
    setError(null)
  }

  async function saveCycleEntry(existing: CycleEntry | null, nextStartDate: string, nextEndDate: string, setMessage: (message: string | null) => void) {
    const start = parseCycleDateInput(nextStartDate)
    const end = nextEndDate ? parseCycleDateInput(nextEndDate) : null
    if (Number.isNaN(start.getTime())) {
      setMessage('Start date is required')
      return false
    }
    if (end && end.getTime() < start.getTime()) {
      setMessage('End date cannot be before start date')
      return false
    }

    const now = new Date().toISOString()
    const id = existing?.id ?? makeId('cycle')
    const payload: CycleEntry = {
      id,
      householdId: snapshot.householdId,
      startDate: start.toISOString(),
      endDate: end ? end.toISOString() : null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'cycle.entry.upsert',
      entityType: 'cycle_entry',
      entityId: id,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        cycleEntries: prev.data.cycleEntries.some(entry => entry.id === id)
          ? prev.data.cycleEntries.map(entry => entry.id === id ? payload : entry)
          : [...prev.data.cycleEntries, payload],
      },
    }))

    setMessage(null)
    return true
  }

  async function saveEntry(event: FormEvent) {
    event.preventDefault()
    const saved = await saveCycleEntry(null, startDate, endDate, setError)
    if (!saved) return
    resetForm()
  }

  async function deleteEntry(entry: CycleEntry) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'cycle.entry.delete',
      entityType: 'cycle_entry',
      entityId: entry.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        cycleEntries: prev.data.cycleEntries.filter(row => row.id !== entry.id),
      },
    }))
  }

  return (
    <ScreenShell title="Cycle Tracker">
      <div className="mx-4 min-w-0 space-y-4 overflow-x-hidden">
        <PredictionCard insights={insights} entryCount={snapshot.entries.length} />

        <form onSubmit={saveEntry} className="overflow-hidden rounded-2xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-bold text-text-1">Add cycle</h2>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <div className="block min-w-0">
              <span className="mb-1 block text-[12px] font-semibold text-text-2">Start date</span>
              <DateField value={startDate} onChange={setStartDate} required />
            </div>
            <div className="block min-w-0">
              <span className="mb-1 block text-[12px] font-semibold text-text-2">End date</span>
              <DateField value={endDate} onChange={setEndDate} clearable />
            </div>
          </div>
          {error ? <p className="mt-2 text-[12px] font-semibold text-red">{error}</p> : null}
          <button type="submit" className="mt-3 h-11 w-full rounded-xl text-[15px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>
            Add
          </button>
        </form>

        <MonthView month={month} entries={snapshot.entries} onPrevious={() => setMonth(value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - 1, 1)))} onNext={() => setMonth(value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1)))} />

        <button type="button" onClick={() => setTimelineOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-left active:bg-surface-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-[17px] font-bold text-white" style={{ background: ACCENT }}>{insights.entries.length}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold text-text-1">Cycle timeline</span>
            <span className="mt-0.5 block truncate text-[12px] text-text-2">{insights.entries.length === 0 ? 'No entries yet' : 'View logged starts and gaps'}</span>
          </span>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-text-3"><path d="M6 3l5 5-5 5" /></svg>
        </button>

        <section className="grid gap-3">
          <LineChart insights={insights} />
          <DurationChart entries={snapshot.entries} />
        </section>
      </div>
      <TimelineSheet
        open={timelineOpen}
        entries={snapshot.entries}
        insights={insights}
        onClose={() => setTimelineOpen(false)}
        onDelete={entry => void deleteEntry(entry)}
        onSave={(entry, nextStartDate, nextEndDate, setMessage) => saveCycleEntry(entry, nextStartDate, nextEndDate, setMessage)}
      />
    </ScreenShell>
  )
}

function PredictionCard({ insights, entryCount }: { insights: CycleInsights; entryCount: number }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-4" style={{ background: SOFT }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: ACCENT }}>Based on logged data</p>
          <h2 className="mt-1 text-[20px] font-bold text-text-1">Likely next period</h2>
        </div>
        <ConfidenceBadge confidence={insights.confidence} />
      </div>

      {entryCount === 0 ? (
        <p className="rounded-xl bg-surface/70 px-3 py-3 text-[14px] text-text-2">No data yet</p>
      ) : entryCount === 1 ? (
        <MetricGrid metrics={[
          ['Latest start', insights.latestStart ? formatCycleDate(insights.latestStart, { day: 'numeric', month: 'short', year: 'numeric' }) : '-'],
          ['Prediction', 'Need another start'],
        ]} />
      ) : (
        <MetricGrid metrics={[
          ['Next likely start', insights.predictedStart ? formatCycleDate(insights.predictedStart, { weekday: 'short', day: 'numeric', month: 'short' }) : '-'],
          ['Likely window', insights.windowStart && insights.windowEnd ? `${formatCycleDate(insights.windowStart)} - ${formatCycleDate(insights.windowEnd)}` : '-'],
          ['Average cycle', insights.averageCycleLength ? `${insights.averageCycleLength} days` : '-'],
          ['Average period', insights.averagePeriodLength ? `${insights.averagePeriodLength} days` : 'Unknown'],
        ]} />
      )}
    </section>
  )
}

function MetricGrid({ metrics }: { metrics: Array<[string, string]> }) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2">
      {metrics.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-xl bg-surface/70 px-3 py-2.5">
          <p className="text-[11px] font-semibold text-text-3">{label}</p>
          <p className="mt-0.5 truncate text-[15px] font-bold text-text-1">{value}</p>
        </div>
      ))}
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: CycleConfidence }) {
  const label = confidence === 'none' ? 'No data' : `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`
  return (
    <span className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: 'color-mix(in srgb, #C04A7A 22%, transparent)', color: ACCENT, background: 'color-mix(in srgb, #C04A7A 8%, var(--surface))' }}>
      {label}
    </span>
  )
}

function MonthView({ month, entries, onPrevious, onNext }: { month: Date; entries: CycleEntry[]; onPrevious: () => void; onNext: () => void }) {
  const { items } = cycleCalendarItems(entries, { includePrediction: true })
  const statuses = new Map<string, DayStatus>()
  for (const item of items) {
    for (let day = item.start.getTime(); day < item.endExclusive.getTime(); day += DAY_MS) {
      const key = cycleDayKey(new Date(day))
      const next: DayStatus = item.kind === 'predicted' ? 'predicted' : item.estimated ? 'estimated' : 'confirmed'
      const existing = statuses.get(key)
      if (existing === 'confirmed') continue
      if (existing === 'estimated' && next === 'predicted') continue
      statuses.set(key, next)
    }
  }

  const days = monthGrid(month)
  const label = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={onPrevious} className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-2 active:opacity-70" aria-label="Previous month">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M10 3L5 8l5 5" /></svg>
        </button>
        <h2 className="text-[17px] font-bold text-text-1">{label}</h2>
        <button onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-2 active:opacity-70" aria-label="Next month">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day, index) => <p key={`${day}-${index}`} className="pb-1 text-center text-[11px] font-bold text-text-3">{day}</p>)}
        {days.map(day => {
          const inMonth = day.getUTCMonth() === month.getUTCMonth()
          const status = statuses.get(cycleDayKey(day))
          return (
            <div key={day.toISOString()} className={`relative flex aspect-square items-center justify-center rounded-xl text-[13px] ${inMonth ? 'text-text-1' : 'text-text-3'}`} style={dayStyle(status)}>
              {day.getUTCDate()}
              {status === 'estimated' ? <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: ACCENT, opacity: 0.45 }} /> : null}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-text-2">
        <LegendDot label="Logged" style={{ background: ACCENT }} />
        <LegendDot label="Estimated" style={{ border: `1px dashed ${ACCENT}`, background: SOFTER }} />
        <LegendDot label="Likely" style={{ background: SOFTER }} />
      </div>
    </section>
  )
}

function TimelineSheet({ open, entries, insights, onClose, onDelete, onSave }: { open: boolean; entries: CycleEntry[]; insights: CycleInsights; onClose: () => void; onDelete: (entry: CycleEntry) => void; onSave: (entry: CycleEntry, startDate: string, endDate: string, setMessage: (message: string | null) => void) => Promise<boolean> }) {
  const newest = useMemo(() => [...entries].sort((a, b) => cycleDate(b.startDate).getTime() - cycleDate(a.startDate).getTime()), [entries])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  if (!open) return null

  function beginEdit(entry: CycleEntry) {
    setEditingId(entry.id)
    setEditStartDate(cycleDateInput(entry.startDate))
    setEditEndDate(entry.endDate ? cycleDateInput(entry.endDate) : '')
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditStartDate('')
    setEditEndDate('')
    setEditError(null)
  }

  return (
    <>
      <button type="button" aria-label="Close cycle timeline" onClick={onClose} className="fixed inset-0 z-[58] bg-black/40" />
      <div className="fixed inset-x-0 bottom-0 z-[60]">
        <div className="mx-auto max-w-lg overflow-hidden rounded-t-[26px] border-t border-border bg-surface shadow-[0_-10px_40px_rgba(0,0,0,0.18)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <div className="px-4 pb-2 pt-3">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-text-3/35" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[19px] font-bold text-text-1">Cycle timeline</h2>
                <p className="mt-0.5 text-[12px] text-text-2">Swipe an entry to edit or delete</p>
              </div>
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text-2 active:opacity-70" aria-label="Close">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {newest.length === 0 ? (
              <p className="border-t border-border px-4 py-5 text-center text-[14px] text-text-2">No data yet</p>
            ) : (
              newest.map((entry, index) => (
                editingId === entry.id ? (
                  <InlineEditRow
                    key={entry.id}
                    entry={entry}
                    startDate={editStartDate}
                    endDate={editEndDate}
                    error={editError}
                    onStartChange={setEditStartDate}
                    onEndChange={setEditEndDate}
                    onCancel={cancelEdit}
                    onSave={async () => {
                      const saved = await onSave(entry, editStartDate, editEndDate, setEditError)
                      if (saved) cancelEdit()
                    }}
                    className={index > 0 ? 'border-t border-border' : 'border-t border-border'}
                  />
                ) : (
                  <SwipeRow key={entry.id} onEdit={() => beginEdit(entry)} onDelete={() => { if (editingId === entry.id) cancelEdit(); onDelete(entry) }} className={index > 0 ? 'border-t border-border' : 'border-t border-border'}>
                    <TimelineEntryRow entry={entry} insights={insights} />
                  </SwipeRow>
                )
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function TimelineEntryRow({ entry, insights }: { entry: CycleEntry; insights: CycleInsights }) {
  const normalized = insights.entries.find(row => row.id === entry.id)
  const entryIndex = normalized ? insights.entries.findIndex(row => row.id === entry.id) : -1
  const previous = entryIndex > 0 ? insights.entries[entryIndex - 1] : null
  const gap = normalized && previous ? Math.round((normalized.start.getTime() - previous.start.getTime()) / DAY_MS) : null
  const duration = entry.endDate ? daysInclusive(entry.startDate, entry.endDate) : null

  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: ACCENT }}>{cycleDate(entry.startDate).getUTCDate()}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-text-1">{formatCycleDate(entry.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        <p className="mt-0.5 truncate text-[12px] text-text-2">
          {gap ? `${gap} days since previous start` : 'First logged start'}
          {duration ? ` - ${duration}d period` : ' - End unknown'}
        </p>
      </div>
    </div>
  )
}

function InlineEditRow({ entry, startDate, endDate, error, onStartChange, onEndChange, onCancel, onSave, className }: { entry: CycleEntry; startDate: string; endDate: string; error: string | null; onStartChange: (value: string) => void; onEndChange: (value: string) => void; onCancel: () => void; onSave: () => void; className: string }) {
  return (
    <div className={`bg-surface px-4 py-3 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-bold text-text-1">Edit {formatCycleDate(entry.startDate)}</p>
        <button onClick={onCancel} className="shrink-0 text-[12px] font-semibold text-text-2 active:opacity-70">Cancel</button>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <div className="block min-w-0">
          <span className="mb-1 block text-[11px] font-semibold text-text-3">Start date</span>
          <DateField value={startDate} onChange={onStartChange} required />
        </div>
        <div className="block min-w-0">
          <span className="mb-1 block text-[11px] font-semibold text-text-3">End date</span>
          <DateField value={endDate} onChange={onEndChange} clearable />
        </div>
      </div>
      {error ? <p className="mt-2 text-[12px] font-semibold text-red">{error}</p> : null}
      <button onClick={onSave} className="mt-3 h-10 w-full rounded-xl text-[14px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>Update</button>
    </div>
  )
}

function DateField({ value, onChange, required = false, clearable = false }: { value: string; onChange: (value: string) => void; required?: boolean; clearable?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="date"
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
        className="block h-11 min-w-0 flex-1 appearance-none rounded-xl border border-border bg-bg px-3 py-0 text-left text-[16px] leading-[44px] text-text-1 outline-none focus:border-accent"
        style={{ boxSizing: 'border-box', WebkitAppearance: 'none', lineHeight: '44px' }}
      />
      {clearable && value ? (
        <button
          type="button"
          onPointerDown={event => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            onChange('')
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-2 active:opacity-70"
          aria-label="Clear end date"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      ) : null}
    </div>
  )
}

function LineChart({ insights }: { insights: CycleInsights }) {
  const points = insights.validIntervals.slice(-8)
  return (
    <ChartShell title="Cycle length">
      {points.length === 0 ? <EmptyChart /> : <SimpleLineChart values={points.map(point => point.days)} labels={points.map(point => formatCycleDate(point.toStart))} suffix="d" />}
    </ChartShell>
  )
}

function DurationChart({ entries }: { entries: CycleEntry[] }) {
  const values = [...entries]
    .sort((a, b) => cycleDate(a.startDate).getTime() - cycleDate(b.startDate).getTime())
    .flatMap(entry => entry.endDate ? [{ label: formatCycleDate(entry.startDate), value: daysInclusive(entry.startDate, entry.endDate) }] : [])
    .slice(-8)
  return (
    <ChartShell title="Period duration">
      {values.length === 0 ? <EmptyChart /> : <BarChart values={values} />}
    </ChartShell>
  )
}

function ChartShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-[17px] font-bold text-text-1">{title}</h2>
      {children}
    </section>
  )
}

function SimpleLineChart({ values, labels, suffix }: { values: number[]; labels: string[]; suffix: string }) {
  const min = Math.min(...values) - 2
  const max = Math.max(...values) + 2
  const width = 320
  const height = 130
  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : 18 + index * ((width - 36) / (values.length - 1))
    const y = 18 + (1 - (value - min) / Math.max(1, max - min)) * (height - 42)
    return { x, y, value, label: labels[index] }
  })
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-[130px] w-full overflow-hidden">
      <path d={path} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {points.map(point => (
        <g key={`${point.x}-${point.y}`}>
          <circle cx={point.x} cy={point.y} r={4} fill={ACCENT} />
          <text x={point.x} y={point.y - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--text-2)">{point.value}{suffix}</text>
          <text x={point.x} y={height - 5} textAnchor="middle" fontSize={9} fill="var(--text-3)">{point.label}</text>
        </g>
      ))}
    </svg>
  )
}

function BarChart({ values }: { values: Array<{ label: string; value: number }> }) {
  const max = Math.max(...values.map(item => item.value), 1)
  return (
    <div className="flex h-[132px] items-end gap-2">
      {values.map(item => (
        <div key={`${item.label}-${item.value}`} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex w-full flex-1 items-end rounded-t-xl bg-surface-2">
            <div className="w-full rounded-t-xl" style={{ height: `${Math.max(8, (item.value / max) * 100)}%`, background: ACCENT, opacity: 0.8 }} />
          </div>
          <p className="text-[10px] font-bold text-text-2">{item.value}d</p>
          <p className="w-full truncate text-center text-[9px] text-text-3">{item.label}</p>
        </div>
      ))}
    </div>
  )
}

function EmptyChart() {
  return <div className="flex h-[120px] items-center justify-center rounded-xl bg-surface-2 text-[14px] text-text-2">No data yet</div>
}

function LegendDot({ label, style }: { label: string; style: CSSProperties }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={style} />
      {label}
    </span>
  )
}

function dayStyle(status: DayStatus | undefined): CSSProperties {
  if (status === 'confirmed') return { background: ACCENT, color: '#fff', fontWeight: 800 }
  if (status === 'estimated') return { background: SOFTER, border: `1px dashed ${ACCENT}`, color: ACCENT, fontWeight: 700 }
  if (status === 'predicted') return { background: SOFTER, color: ACCENT, opacity: 0.72 }
  return {}
}

function monthGrid(month: Date) {
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1))
  const offset = (first.getUTCDay() + 6) % 7
  const cells: Date[] = []
  for (let index = 0; index < 42; index++) {
    cells.push(addCycleDays(first, index - offset))
  }
  return cells
}

function daysInclusive(start: string | number | Date, end: string | number | Date) {
  return Math.max(1, Math.round((cycleDate(end).getTime() - cycleDate(start).getTime()) / DAY_MS) + 1)
}
