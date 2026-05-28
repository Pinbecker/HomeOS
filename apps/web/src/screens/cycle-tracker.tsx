import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { SwipeRow } from '../components/swipe-row'
import { enqueueMutation, getCurrentState, makeId, type CycleEntry, useAppState } from '../lib/app-store'
import {
  addCycleDays,
  calculateCycleInsights,
  cycleCalendarItems,
  cycleDate,
  cycleDateInput,
  cycleDayKey,
  formatCycleDate,
  parseCycleDateInput,
  readCycleTrackerSettings,
  type CycleConfidence,
  type CycleInsights,
  type CycleTrackerSettings,
} from '../lib/cycle-tracker'
import { ScreenShell } from './shell'

const ACCENT = '#C04A7A'
const OVULATION = '#E58A2A'
const SOFT = 'color-mix(in srgb, #C04A7A 11%, var(--surface))'
const SOFTER = 'color-mix(in srgb, #C04A7A 7%, var(--surface))'
const DAY_MS = 86_400_000
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

type DayStatus = 'confirmed' | 'predicted' | 'fertile' | 'ovulation' | 'knownOvulation'

export function CycleTrackerPage() {
  const snapshot = useAppState(state => ({
    householdId: state.data.household[0]?.id ?? 'default',
    household: state.data.household[0] ?? null,
    entries: state.data.cycleEntries,
  }))
  const insights = useMemo(() => calculateCycleInsights(snapshot.entries), [snapshot.entries])
  const settings = readCycleTrackerSettings(snapshot.household?.settings)
  const openPeriod = useMemo(() => {
    const today = cycleDate(new Date())
    return insights.entries
      .filter(entry => !entry.end && entry.start.getTime() <= today.getTime())
      .at(-1) ?? null
  }, [insights.entries])
  const [month, setMonth] = useState(currentCycleCalendarMonth)
  const [periodError, setPeriodError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (!settingsOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [settingsOpen])

  async function saveCycleEntry(existing: CycleEntry | null, nextStartDate: string, nextEndDate: string, nextOvulationDate: string, setMessage: (message: string | null) => void) {
    const start = parseCycleDateInput(nextStartDate)
    const end = nextEndDate ? parseCycleDateInput(nextEndDate) : null
    const ovulationDate = nextOvulationDate ? parseCycleDateInput(nextOvulationDate) : null
    if (Number.isNaN(start.getTime())) {
      setMessage('Start date is required')
      return false
    }
    if (end && end.getTime() < start.getTime()) {
      setMessage('End date cannot be before start date')
      return false
    }
    if (ovulationDate && Number.isNaN(ovulationDate.getTime())) {
      setMessage('Known ovulation date is invalid')
      return false
    }

    const now = new Date().toISOString()
    const id = existing?.id ?? makeId('cycle')
    const payload: CycleEntry = {
      id,
      householdId: snapshot.householdId,
      startDate: start.toISOString(),
      endDate: end ? end.toISOString() : null,
      ovulationDate: ovulationDate ? ovulationDate.toISOString() : null,
      ovulationSource: ovulationDate ? 'known' : null,
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

  async function startPeriod() {
    const today = cycleDateInput(new Date())
    await saveCycleEntry(null, today, '', '', setPeriodError)
  }

  async function endPeriod() {
    if (!openPeriod) return
    await saveCycleEntry(
      snapshot.entries.find(entry => entry.id === openPeriod.id) ?? null,
      cycleDateInput(openPeriod.start),
      cycleDateInput(new Date()),
      openPeriod.ovulationDate ? cycleDateInput(openPeriod.ovulationDate) : '',
      setPeriodError,
    )
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

  async function saveSettings(recipe: (current: CycleTrackerSettings) => CycleTrackerSettings) {
    const state = getCurrentState()
    const householdRow = state.data.household[0] ?? snapshot.household
    const householdId = householdRow?.id ?? snapshot.householdId
    const currentSettings = householdRow?.settings ?? {}
    const payload = {
      id: householdId,
      name: householdRow?.name ?? 'Home',
      settings: {
        ...currentSettings,
        cycleTracker: recipe(readCycleTrackerSettings(currentSettings)),
      },
      createdAt: householdRow?.createdAt ?? new Date().toISOString(),
    }

    await enqueueMutation({
      id: makeId('mutation'),
      name: 'household.upsert',
      entityType: 'household',
      entityId: householdId,
      operation: 'upsert',
      payload,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        household: prev.data.household.some(row => row.id === householdId)
          ? prev.data.household.map(row => row.id === householdId ? { ...row, ...payload } : row)
          : [...prev.data.household, payload],
      },
    }))
  }

  return (
    <ScreenShell title="Cycle Tracker" showHeader={false}>
      <header className="safe-top flex items-end justify-between px-5 pt-6 pb-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-2">HomeOS</p>
          <h1 className="mt-1 text-[32px] font-bold text-text-1">Cycle Tracker</h1>
        </div>
        <button type="button" onClick={() => setSettingsOpen(true)} className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-2 active:bg-surface-2" aria-label="Cycle settings">
          <Settings className="h-[20px] w-[20px]" strokeWidth={2} />
        </button>
      </header>
      <div className="mx-4 min-w-0 space-y-4 overflow-x-hidden">
        <PredictionCard insights={insights} entryCount={snapshot.entries.length} openPeriod={openPeriod} />

        <PeriodActionCard openPeriod={openPeriod} error={periodError} onStart={() => void startPeriod()} onEnd={() => void endPeriod()} />

        <MonthView month={month} entries={snapshot.entries} showOvulation={settings.showOvulationWindows} onPrevious={() => setMonth(value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - 1, 1)))} onNext={() => setMonth(value => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1)))} />

        <section className="grid gap-3">
          <LineChart insights={insights} />
          <DurationChart entries={snapshot.entries} />
        </section>
      </div>
      <CycleSettingsSheet
        open={settingsOpen}
        entries={snapshot.entries}
        insights={insights}
        settings={settings}
        onSettingsChange={next => void saveSettings(current => ({ ...current, ...next }))}
        onClose={() => setSettingsOpen(false)}
        onDelete={entry => void deleteEntry(entry)}
        onSave={(entry, nextStartDate, nextEndDate, nextOvulationDate, setMessage) => saveCycleEntry(entry, nextStartDate, nextEndDate, nextOvulationDate, setMessage)}
        onAdd={(nextStartDate, nextEndDate, setMessage) => saveCycleEntry(null, nextStartDate, nextEndDate, '', setMessage)}
      />
    </ScreenShell>
  )
}

function PredictionCard({ insights, entryCount, openPeriod }: { insights: CycleInsights; entryCount: number; openPeriod: CycleInsights['entries'][number] | null }) {
  const showingOvulation = Boolean(openPeriod)
  const tone = showingOvulation ? OVULATION : ACCENT
  const background = showingOvulation ? 'color-mix(in srgb, #E58A2A 11%, var(--surface))' : SOFT
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-4" style={{ background }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: tone }}>Based on logged data</p>
          <h2 className="mt-1 text-[20px] font-bold text-text-1">{showingOvulation ? 'Likely next ovulation' : 'Likely next period'}</h2>
        </div>
        <ConfidenceBadge confidence={showingOvulation ? insights.ovulationConfidence : insights.confidence} color={tone} />
      </div>

      {entryCount === 0 ? (
        <p className="rounded-xl bg-surface/70 px-3 py-3 text-[14px] text-text-2">No data yet</p>
      ) : showingOvulation ? (
        insights.predictedOvulation ? (
          <MetricGrid metrics={[
            ['Predicted ovulation', formatCycleDate(insights.predictedOvulation, { weekday: 'short', day: 'numeric', month: 'short' })],
            ['Estimated fertile window', insights.fertileWindowStart && insights.fertileWindowEnd ? `${formatCycleDate(insights.fertileWindowStart)} - ${formatCycleDate(insights.fertileWindowEnd)}` : '-'],
            ['Confidence', insights.ovulationConfidence === 'none' ? 'No data' : insights.ovulationConfidence],
            ['Known ovulation entries', String(insights.knownOvulationCount)],
          ]} />
        ) : (
          <p className="rounded-xl bg-surface/70 px-3 py-3 text-[14px] text-text-2">Need more cycle history</p>
        )
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

function PeriodActionCard({ openPeriod, error, onStart, onEnd }: { openPeriod: CycleInsights['entries'][number] | null; error: string | null; onStart: () => void; onEnd: () => void }) {
  const day = openPeriod ? Math.max(1, Math.floor((cycleDate(new Date()).getTime() - openPeriod.start.getTime()) / DAY_MS) + 1) : null

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-4">
      {openPeriod ? (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] text-[14px] font-bold text-white" style={{ background: ACCENT }}>
            Day {day}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold text-text-1">Period Day {day}</h2>
            <p className="mt-0.5 truncate text-[12px] text-text-2">Started {formatCycleDate(openPeriod.start, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
          <button type="button" onClick={onEnd} className="shrink-0 rounded-xl border border-border bg-surface-2 px-3 py-2 text-[13px] font-bold text-text-1 active:opacity-75">
            End period
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={onStart} className="h-12 w-full rounded-xl text-[16px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>
            Start Period
          </button>
          <p className="mt-2 text-center text-[12px] text-text-2">Older cycles can be added from Cycle settings.</p>
        </>
      )}
      {error ? <p className="mt-2 text-[12px] font-semibold text-red">{error}</p> : null}
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

function ConfidenceBadge({ confidence, color = ACCENT }: { confidence: CycleConfidence; color?: string }) {
  const label = confidence === 'none' ? 'No data' : `${confidence[0].toUpperCase()}${confidence.slice(1)} confidence`
  return (
    <span className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold" style={{ borderColor: `color-mix(in srgb, ${color} 22%, transparent)`, color, background: `color-mix(in srgb, ${color} 8%, var(--surface))` }}>
      {label}
    </span>
  )
}

function MonthView({ month, entries, showOvulation, onPrevious, onNext }: { month: Date; entries: CycleEntry[]; showOvulation: boolean; onPrevious: () => void; onNext: () => void }) {
  const { items } = cycleCalendarItems(entries, { includePrediction: true, includeKnownOvulation: true, includeOvulation: showOvulation })
  const statuses = new Map<string, { status: DayStatus; label: string }>()
  for (const item of items) {
    for (let day = item.start.getTime(); day < item.endExclusive.getTime(); day += DAY_MS) {
      const key = cycleDayKey(new Date(day))
      const next: { status: DayStatus; label: string } = item.kind === 'ovulation'
        ? { status: item.estimated ? 'ovulation' : 'knownOvulation', label: item.estimated ? 'Ovulation' : 'Known' }
        : item.kind === 'fertile'
          ? { status: 'fertile', label: 'Fertile' }
          : item.kind === 'predicted'
            ? { status: 'predicted', label: 'Period Est.' }
            : { status: 'confirmed', label: item.title.replace('Period ', '') }
      const existing = statuses.get(key)
      if (existing && dayPriority(existing.status) >= dayPriority(next.status)) continue
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
            <div key={day.toISOString()} className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-[13px] ${inMonth ? 'text-text-1' : 'text-text-3'}`} style={dayStyle(status?.status)}>
              <span>{day.getUTCDate()}</span>
              {status ? <span className="mt-0.5 max-w-full truncate px-1 text-[8.5px] font-bold leading-none opacity-90">{status.label}</span> : null}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-text-2">
        <LegendDot label="Logged" style={{ background: ACCENT }} />
        <LegendDot label="Period Est." style={{ background: SOFTER }} />
        {showOvulation ? <LegendDot label="Fertile" style={{ border: '1px dashed #7C6CE4', background: 'color-mix(in srgb, #7C6CE4 9%, var(--surface))' }} /> : null}
        {showOvulation ? <LegendDot label="Ovulation" style={{ background: 'color-mix(in srgb, #E58A2A 18%, var(--surface))' }} /> : null}
      </div>
    </section>
  )
}

function currentCycleCalendarMonth() {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
}

function CycleSettingsSheet({ open, entries, insights, settings, onSettingsChange, onClose, onDelete, onSave, onAdd }: {
  open: boolean
  entries: CycleEntry[]
  insights: CycleInsights
  settings: CycleTrackerSettings
  onSettingsChange: (settings: Partial<CycleTrackerSettings>) => void
  onClose: () => void
  onDelete: (entry: CycleEntry) => void
  onSave: (entry: CycleEntry, startDate: string, endDate: string, ovulationDate: string, setMessage: (message: string | null) => void) => Promise<boolean>
  onAdd: (startDate: string, endDate: string, setMessage: (message: string | null) => void) => Promise<boolean>
}) {
  const newest = useMemo(() => [...entries].sort((a, b) => cycleDate(b.startDate).getTime() - cycleDate(a.startDate).getTime()), [entries])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editOvulationDate, setEditOvulationDate] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [addStartDate, setAddStartDate] = useState(() => cycleDateInput(new Date()))
  const [addEndDate, setAddEndDate] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [knownOvulationDate, setKnownOvulationDate] = useState(() => cycleDateInput(new Date()))
  const [knownOvulationCycleId, setKnownOvulationCycleId] = useState('')
  const [knownOvulationError, setKnownOvulationError] = useState<string | null>(null)

  if (!open) return null

  function beginEdit(entry: CycleEntry) {
    setEditingId(entry.id)
    setEditStartDate(cycleDateInput(entry.startDate))
    setEditEndDate(entry.endDate ? cycleDateInput(entry.endDate) : '')
    setEditOvulationDate(entry.ovulationDate ? cycleDateInput(entry.ovulationDate) : '')
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditStartDate('')
    setEditEndDate('')
    setEditOvulationDate('')
    setEditError(null)
  }

  async function saveHistorical(event: FormEvent) {
    event.preventDefault()
    const saved = await onAdd(addStartDate, addEndDate, setAddError)
    if (!saved) return
    setAddStartDate(cycleDateInput(new Date()))
    setAddEndDate('')
    setAddError(null)
  }

  async function saveKnownOvulation(event: FormEvent) {
    event.preventDefault()
    const selected = entries.find(entry => entry.id === knownOvulationCycleId)
      ?? [...entries]
        .sort((a, b) => cycleDate(b.startDate).getTime() - cycleDate(a.startDate).getTime())
        .find(entry => cycleDate(entry.startDate).getTime() <= parseCycleDateInput(knownOvulationDate).getTime())
      ?? null
    if (!selected) {
      setKnownOvulationError('Add a cycle first')
      return
    }
    const saved = await onSave(
      selected,
      cycleDateInput(selected.startDate),
      selected.endDate ? cycleDateInput(selected.endDate) : '',
      knownOvulationDate,
      setKnownOvulationError,
    )
    if (saved) setKnownOvulationError(null)
  }

  return (
    <>
      <button type="button" aria-label="Close cycle settings" onClick={onClose} className="fixed inset-0 z-[58] bg-black/40" />
      <div className="fixed inset-x-0 bottom-0 z-[60]">
        <div className="mx-auto max-w-lg overflow-hidden rounded-t-[26px] border-t border-border bg-surface shadow-[0_-10px_40px_rgba(0,0,0,0.18)]" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
          <div className="px-4 pb-2 pt-3">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-text-3/35" />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[19px] font-bold text-text-1">Cycle settings</h2>
                <p className="mt-0.5 text-[12px] text-text-2">History, edits and optional estimates</p>
              </div>
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-text-2 active:opacity-70" aria-label="Close">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
          </div>
          <div className="max-h-[68vh] overflow-y-auto">
            <section className="border-t border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-text-1">Ovulation windows</p>
                  <p className="mt-0.5 text-[12px] text-text-2">Show estimated fertile windows and ovulation dates.</p>
                </div>
                <Toggle checked={settings.showOvulationWindows} onChange={showOvulationWindows => onSettingsChange({ showOvulationWindows })} />
              </div>
              {settings.showOvulationWindows ? (
                <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[12px] leading-5 text-text-2">
                  Predicted ovulation uses cycle averages, or known ovulation entries where available. Confidence: {insights.ovulationConfidence}.
                </p>
              ) : null}
              <p className="mt-3 text-[11.5px] leading-5 text-text-3">This is for personal tracking and prediction only, not contraception or medical advice.</p>
            </section>

            <form onSubmit={saveHistorical} className="border-t border-border px-4 py-3">
              <h3 className="text-[15px] font-bold text-text-1">Add historical cycle</h3>
              <p className="mt-0.5 text-[12px] text-text-2">For past period start and end dates.</p>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
                <FieldLabel label="Start date"><DateField value={addStartDate} onChange={setAddStartDate} required /></FieldLabel>
                <FieldLabel label="End date"><DateField value={addEndDate} onChange={setAddEndDate} clearable clearLabel="Clear end date" /></FieldLabel>
              </div>
              {addError ? <p className="mt-2 text-[12px] font-semibold text-red">{addError}</p> : null}
              <button type="submit" className="mt-3 h-10 w-full rounded-xl text-[14px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>Add historical cycle</button>
            </form>

            <form onSubmit={saveKnownOvulation} className="border-t border-border px-4 py-3">
              <h3 className="text-[15px] font-bold text-text-1">Add known ovulation</h3>
              <p className="mt-0.5 text-[12px] text-text-2">Use this for a test result or known ovulation date.</p>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-2">
                <FieldLabel label="Ovulation date"><DateField value={knownOvulationDate} onChange={setKnownOvulationDate} required /></FieldLabel>
                <label className="block min-w-0">
                  <span className="mb-1 block text-[11px] font-semibold text-text-3">Cycle</span>
                  <select value={knownOvulationCycleId} onChange={event => setKnownOvulationCycleId(event.target.value)} className="block h-11 w-full rounded-xl border border-border bg-bg px-3 text-[16px] text-text-1 outline-none focus:border-accent">
                    <option value="">Closest previous cycle</option>
                    {newest.map(entry => (
                      <option key={entry.id} value={entry.id}>{formatCycleDate(entry.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</option>
                    ))}
                  </select>
                </label>
              </div>
              {knownOvulationError ? <p className="mt-2 text-[12px] font-semibold text-red">{knownOvulationError}</p> : null}
              <button type="submit" className="mt-3 h-10 w-full rounded-xl text-[14px] font-bold text-white active:opacity-80" style={{ background: OVULATION }}>Add known ovulation</button>
            </form>

            <div className="border-t border-border px-4 py-3">
              <h3 className="text-[15px] font-bold text-text-1">Cycle timeline</h3>
              <p className="mt-0.5 text-[12px] text-text-2">Swipe an entry to edit or delete.</p>
            </div>
            {newest.length === 0 ? (
              <p className="px-4 py-5 text-center text-[14px] text-text-2">No data yet</p>
            ) : (
              newest.map((entry, index) => (
                editingId === entry.id ? (
                  <InlineEditRow
                    key={entry.id}
                    entry={entry}
                    startDate={editStartDate}
                    endDate={editEndDate}
                    ovulationDate={editOvulationDate}
                    error={editError}
                    onStartChange={setEditStartDate}
                    onEndChange={setEditEndDate}
                    onOvulationChange={setEditOvulationDate}
                    onCancel={cancelEdit}
                    onSave={async () => {
                      const saved = await onSave(entry, editStartDate, editEndDate, editOvulationDate, setEditError)
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
  const ovulation = entry.ovulationDate ? ` - Known ovulation ${formatCycleDate(entry.ovulationDate)}` : ''

  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: ACCENT }}>{cycleDate(entry.startDate).getUTCDate()}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-text-1">{formatCycleDate(entry.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        <p className="mt-0.5 truncate text-[12px] text-text-2">
          {gap ? `${gap} days since previous start` : 'First logged start'}
          {duration ? ` - ${duration}d period` : ' - Incomplete'}
          {ovulation}
        </p>
      </div>
    </div>
  )
}

function InlineEditRow({ entry, startDate, endDate, ovulationDate, error, onStartChange, onEndChange, onOvulationChange, onCancel, onSave, className }: { entry: CycleEntry; startDate: string; endDate: string; ovulationDate: string; error: string | null; onStartChange: (value: string) => void; onEndChange: (value: string) => void; onOvulationChange: (value: string) => void; onCancel: () => void; onSave: () => void; className: string }) {
  return (
    <div className={`bg-surface px-4 py-3 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-bold text-text-1">Edit {formatCycleDate(entry.startDate)}</p>
        <button onClick={onCancel} className="shrink-0 text-[12px] font-semibold text-text-2 active:opacity-70">Cancel</button>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <FieldLabel label="Start date"><DateField value={startDate} onChange={onStartChange} required /></FieldLabel>
        <FieldLabel label="End date"><DateField value={endDate} onChange={onEndChange} clearable clearLabel="Clear end date" /></FieldLabel>
        <FieldLabel label="Known ovulation"><DateField value={ovulationDate} onChange={onOvulationChange} clearable clearLabel="Clear known ovulation" /></FieldLabel>
      </div>
      {error ? <p className="mt-2 text-[12px] font-semibold text-red">{error}</p> : null}
      <button onClick={onSave} className="mt-3 h-10 w-full rounded-xl text-[14px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>Update</button>
    </div>
  )
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold text-text-3">{label}</span>
      {children}
    </label>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-accent' : 'bg-surface-2'}`}>
      <span className={`absolute left-0 top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-transform duration-200 ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
    </button>
  )
}

function DateField({ value, onChange, required = false, clearable = false, clearLabel = 'Clear date' }: { value: string; onChange: (value: string) => void; required?: boolean; clearable?: boolean; clearLabel?: string }) {
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
          aria-label={clearLabel}
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
  if (status === 'predicted') return { background: SOFTER, color: ACCENT, opacity: 0.72 }
  if (status === 'fertile') return { background: 'color-mix(in srgb, #7C6CE4 9%, var(--surface))', border: '1px dashed #7C6CE4', color: '#6F60D6', fontWeight: 700 }
  if (status === 'ovulation') return { background: 'color-mix(in srgb, #E58A2A 12%, var(--surface))', border: '1px dashed #E58A2A', color: '#C77424', fontWeight: 700 }
  if (status === 'knownOvulation') return { background: 'color-mix(in srgb, #E58A2A 20%, var(--surface))', color: '#B9641D', fontWeight: 800 }
  return {}
}

function dayPriority(status: DayStatus) {
  switch (status) {
    case 'knownOvulation':
      return 5
    case 'confirmed':
      return 4
    case 'ovulation':
      return 3
    case 'fertile':
      return 2
    case 'predicted':
      return 1
  }
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
