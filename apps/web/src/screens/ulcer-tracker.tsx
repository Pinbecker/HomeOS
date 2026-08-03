import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { Activity, CheckCircle2, Crosshair, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import {
  enqueueMutation,
  enqueueMutations,
  makeId,
  type MouthRegion,
  type UlcerCheckin,
  type UlcerEpisode,
  type UlcerEventStage,
  type UlcerEventType,
  type UlcerWellbeing,
  useAppState,
} from '../lib/app-store'
import { useSessionState } from '../lib/session-store'
import {
  calculateUlcerInsights,
  formatUlcerDate,
  isActiveEpisode,
  mouthRegionLabel,
  nearestMouthRegion,
  TREATMENT_OPTIONS,
  TRIGGER_OPTIONS,
  ULCER_EVENT_LABELS,
  ULCER_STAGE_LABELS,
  ulcerStatusLabel,
  type NormalizedUlcerCheckin,
  type NormalizedUlcerEpisode,
  type UlcerEpisodeReport,
  type UlcerInsights,
} from '../lib/ulcer-tracker'
import { ScreenShell } from './shell'

const ACCENT = '#E25555'
const HEALED = '#6FA878'
const WARNING = '#D68A2C'
const PURPLE = '#7C6CE4'
const SOFT = 'color-mix(in srgb, #E25555 10%, var(--surface))'
const SOFTER = 'color-mix(in srgb, #E25555 6%, var(--surface))'

type DraftPin = {
  x: number
  y: number
  mouthRegion: MouthRegion
}

type UlcerMutation = Parameters<typeof enqueueMutations>[0][number]

type EventDraft = {
  eventType: UlcerEventType
  stage: UlcerEventStage | ''
  occurredDate: string
  severity: number
  pain: number
  sizeMm: number
  redness: number
  triggers: string[]
  treatments: string[]
  stress: number
  sleep: number
  illness: boolean
  medication: boolean
  cycleRelated: boolean
  notes: string
}

const OBSERVATION_TYPES = new Set<UlcerEventType>(['noticed', 'observation', 'worsened', 'improved', 'reopened'])

function defaultEventDraft(eventType: UlcerEventType = 'observation'): EventDraft {
  return {
    eventType,
    stage: eventType === 'noticed' ? 'new' : eventType === 'healed' ? 'healed' : '',
    occurredDate: dateInputValue(new Date()),
    severity: eventType === 'healed' ? 0 : 4,
    pain: eventType === 'healed' ? 0 : 4,
    sizeMm: eventType === 'healed' ? 0 : 3,
    redness: eventType === 'healed' ? 0 : 3,
    triggers: [],
    treatments: [],
    stress: 5,
    sleep: 6,
    illness: false,
    medication: false,
    cycleRelated: false,
    notes: '',
  }
}

export function UlcerTrackerPage() {
  const userId = useSessionState(state => state.user?.id ?? null)
  const snapshot = useAppState(state => ({
    householdId: state.data.household[0]?.id ?? 'default',
    episodes: state.data.ulcerEpisodes,
    events: state.data.ulcerCheckins,
    cycleEntries: state.data.cycleEntries,
  }))
  const insights = useMemo(
    () => calculateUlcerInsights(snapshot.episodes, snapshot.events, userId, snapshot.cycleEntries),
    [snapshot.episodes, snapshot.events, snapshot.cycleEntries, userId],
  )
  const [draftPin, setDraftPin] = useState<DraftPin | null>(null)
  const [activeEpisodeId, setActiveEpisodeId] = useState<string | null>(null)
  const [eventDraft, setEventDraft] = useState<EventDraft>(() => defaultEventDraft('observation'))
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedEpisode = insights.episodes.find(episode => episode.id === activeEpisodeId) ?? null
  const selectedReport = selectedEpisode ? insights.reportByEpisode.get(selectedEpisode.id) ?? null : null
  const sheetOpen = Boolean(draftPin || selectedEpisode)

  useEffect(() => {
    if (!sheetOpen) return undefined
    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [sheetOpen])

  function openNewPin(pin: DraftPin) {
    setDraftPin(pin)
    setActiveEpisodeId(null)
    setEditingEventId(null)
    setEventDraft(defaultEventDraft('noticed'))
    setError(null)
  }

  function openEpisode(episode: NormalizedUlcerEpisode) {
    const report = insights.reportByEpisode.get(episode.id)
    setActiveEpisodeId(episode.id)
    setDraftPin(null)
    setEditingEventId(null)
    setEventDraft(draftFromLatest(report))
    setError(null)
  }

  function closeSheet() {
    setDraftPin(null)
    setActiveEpisodeId(null)
    setEditingEventId(null)
    setError(null)
  }

  function editEvent(event: NormalizedUlcerCheckin) {
    setEditingEventId(event.id)
    setEventDraft({
      eventType: event.eventType,
      stage: event.stage ?? '',
      occurredDate: dateInputValue(event.loggedAt),
      severity: event.severity,
      pain: event.pain,
      sizeMm: event.sizeMm,
      redness: event.redness ?? 0,
      triggers: event.triggers,
      treatments: event.treatments,
      stress: event.wellbeing?.stress ?? 5,
      sleep: event.wellbeing?.sleep ?? 6,
      illness: event.wellbeing?.illness ?? false,
      medication: event.wellbeing?.medication ?? false,
      cycleRelated: event.wellbeing?.cycleRelated ?? false,
      notes: event.notes ?? '',
    })
  }

  async function saveEvent() {
    if (!userId) {
      setError('Sign in before logging ulcers')
      return
    }

    const occurredAt = localDateIso(eventDraft.occurredDate)
    const now = new Date().toISOString()
    const wellbeing: UlcerWellbeing = {
      stress: eventDraft.stress,
      sleep: eventDraft.sleep,
      illness: eventDraft.illness,
      medication: eventDraft.medication,
      cycleRelated: eventDraft.cycleRelated,
    }
    const notes = eventDraft.notes.trim() || null

    if (draftPin) {
      const episodeId = makeId('ulcer')
      const eventId = makeId('ulcer-event')
      const episode: UlcerEpisode = {
        id: episodeId,
        householdId: snapshot.householdId,
        userId,
        mouthRegion: draftPin.mouthRegion,
        x: draftPin.x,
        y: draftPin.y,
        label: null,
        startedAt: occurredAt,
        healedAt: null,
        firstNoticedAt: occurredAt,
        estimatedStartedAt: occurredAt,
        resolvedAt: null,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }
      const event = buildEvent(eventId, episodeId, snapshot.householdId, userId, occurredAt, eventDraft, wellbeing, notes, now)
      await enqueueMutations([
        {
          id: makeId('mutation'),
          name: 'ulcer.episode.upsert',
          entityType: 'ulcer_episode',
          entityId: episodeId,
          operation: 'upsert',
          payload: episode,
        },
        {
          id: makeId('mutation'),
          name: 'ulcer.checkin.upsert',
          entityType: 'ulcer_checkin',
          entityId: eventId,
          operation: 'upsert',
          payload: event,
        },
      ], prev => ({
        ...prev,
        data: {
          ...prev.data,
          ulcerEpisodes: [...prev.data.ulcerEpisodes, episode],
          ulcerCheckins: [...prev.data.ulcerCheckins, event],
        },
      }))
      closeSheet()
      return
    }

    if (!selectedEpisode) return
    const existingEvent = editingEventId ? selectedReport?.events.find(event => event.id === editingEventId) ?? null : null
    const eventId = editingEventId ?? makeId('ulcer-event')
    const event = buildEvent(eventId, selectedEpisode.id, snapshot.householdId, userId, occurredAt, eventDraft, wellbeing, notes, existingEvent?.createdAt.toISOString() ?? now)
    const episodeUpdate = episodeAfterEvent(selectedEpisode, eventDraft.eventType, occurredAt)
    const mutations: UlcerMutation[] = [
      {
        id: makeId('mutation'),
        name: 'ulcer.checkin.upsert',
        entityType: 'ulcer_checkin',
        entityId: eventId,
        operation: 'upsert' as const,
        payload: event,
      },
    ]
    if (episodeUpdate) {
      mutations.unshift({
        id: makeId('mutation'),
        name: 'ulcer.episode.upsert',
        entityType: 'ulcer_episode',
        entityId: selectedEpisode.id,
        operation: 'upsert' as const,
        payload: episodeUpdate,
      })
    }
    await enqueueMutations(mutations, prev => ({
      ...prev,
      data: {
        ...prev.data,
        ulcerEpisodes: episodeUpdate
          ? prev.data.ulcerEpisodes.map(row => row.id === selectedEpisode.id ? episodeUpdate : row)
          : prev.data.ulcerEpisodes,
        ulcerCheckins: editingEventId
          ? prev.data.ulcerCheckins.map(row => row.id === eventId ? event : row)
          : [...prev.data.ulcerCheckins, event],
      },
    }))
    setEditingEventId(null)
    setEventDraft(draftFromLatest(insights.reportByEpisode.get(selectedEpisode.id)))
  }

  async function deleteEpisode(episode: NormalizedUlcerEpisode) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'ulcer.episode.delete',
      entityType: 'ulcer_episode',
      entityId: episode.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        ulcerEpisodes: prev.data.ulcerEpisodes.filter(row => row.id !== episode.id),
        ulcerCheckins: prev.data.ulcerCheckins.filter(row => row.episodeId !== episode.id),
      },
    }))
    closeSheet()
  }

  async function deleteEvent(event: NormalizedUlcerCheckin) {
    await enqueueMutation({
      id: makeId('mutation'),
      name: 'ulcer.checkin.delete',
      entityType: 'ulcer_checkin',
      entityId: event.id,
      operation: 'delete',
      payload: null,
    }, prev => ({
      ...prev,
      data: {
        ...prev.data,
        ulcerCheckins: prev.data.ulcerCheckins.filter(row => row.id !== event.id),
      },
    }))
    if (editingEventId === event.id) {
      setEditingEventId(null)
      setEventDraft(defaultEventDraft('observation'))
    }
  }

  return (
    <ScreenShell title="Ulcer Tracker" showHeader={false}>
      <header className="family-specialty-header px-5 pt-3 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[32px] font-bold text-text-1">Ulcer Tracker</h1>
            <p className="mt-1 text-[13px] text-text-2">Track each ulcer as a timeline, then compare longer-term patterns.</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: SOFT, color: ACCENT }}>
            <Crosshair className="h-5 w-5" strokeWidth={2.1} />
          </div>
        </div>
      </header>

      <div className="mx-4 min-w-0 space-y-4 overflow-x-hidden pb-28">
        <HeroStats insights={insights} />
        <MouthMap insights={insights} draftPin={draftPin} onNewPin={openNewPin} onOpenEpisode={openEpisode} />
        <CurrentUlcers insights={insights} onOpen={openEpisode} />
        <EpisodeHistory insights={insights} onOpen={openEpisode} />
        <TrendDashboard insights={insights} />
        <p className="px-1 pb-2 text-[11.5px] leading-5 text-text-3">For personal tracking and trend spotting only, not diagnosis or medical advice.</p>
      </div>

      {sheetOpen ? (
        <EditorSheet
          draftPin={draftPin}
          episode={selectedEpisode}
          report={selectedReport}
          draft={eventDraft}
          editingEventId={editingEventId}
          error={error}
          onDraftChange={setEventDraft}
          onClose={closeSheet}
          onSave={() => void saveEvent()}
          onDeleteEpisode={selectedEpisode ? () => void deleteEpisode(selectedEpisode) : undefined}
          onEditEvent={editEvent}
          onDeleteEvent={event => void deleteEvent(event)}
        />
      ) : null}
    </ScreenShell>
  )
}

function buildEvent(id: string, episodeId: string, householdId: string, userId: string, loggedAt: string, draft: EventDraft, wellbeing: UlcerWellbeing, notes: string | null, createdAt: string): UlcerCheckin {
  return {
    id,
    episodeId,
    householdId,
    userId,
    loggedAt,
    eventType: draft.eventType,
    stage: draft.stage || null,
    severity: draft.severity,
    pain: draft.pain,
    sizeMm: draft.sizeMm,
    redness: draft.redness,
    triggers: draft.triggers,
    treatments: draft.treatments,
    wellbeing,
    notes,
    createdAt,
    updatedAt: new Date().toISOString(),
  }
}

function episodeAfterEvent(episode: NormalizedUlcerEpisode, eventType: UlcerEventType, occurredAt: string): UlcerEpisode | null {
  const base: UlcerEpisode = {
    ...episode,
    startedAt: episode.startedAt.toISOString(),
    healedAt: episode.healedAt?.toISOString() ?? null,
    firstNoticedAt: episode.firstNoticedAt.toISOString(),
    estimatedStartedAt: episode.estimatedStartedAt?.toISOString() ?? null,
    resolvedAt: episode.resolvedAt?.toISOString() ?? null,
    createdAt: episode.createdAt.toISOString(),
    updatedAt: new Date().toISOString(),
  }
  if (eventType === 'healed') {
    return { ...base, status: 'healed', healedAt: occurredAt, resolvedAt: occurredAt }
  }
  if (eventType === 'reopened') {
    return { ...base, status: 'reopened', healedAt: null, resolvedAt: null }
  }
  if (eventType === 'improved') {
    return { ...base, status: 'healing', healedAt: null, resolvedAt: null }
  }
  if ((eventType === 'observation' || eventType === 'worsened' || eventType === 'treatment_started') && episode.status === 'healed') {
    return { ...base, status: 'reopened', healedAt: null, resolvedAt: null }
  }
  return null
}

function draftFromLatest(report: UlcerEpisodeReport | undefined) {
  const latest = report?.latestObservation
  return {
    ...defaultEventDraft('observation'),
    severity: latest?.severity ?? 4,
    pain: latest?.pain ?? 4,
    sizeMm: latest?.sizeMm ?? 3,
    redness: latest?.redness ?? 3,
    triggers: latest?.triggers ?? [],
    stress: latest?.wellbeing?.stress ?? 5,
    sleep: latest?.wellbeing?.sleep ?? 6,
    illness: latest?.wellbeing?.illness ?? false,
    medication: latest?.wellbeing?.medication ?? false,
    cycleRelated: latest?.wellbeing?.cycleRelated ?? false,
    notes: '',
  }
}

function HeroStats({ insights }: { insights: UlcerInsights }) {
  return (
    <section className="grid grid-cols-3 gap-2">
      <MetricCard label="Active" value={String(insights.activeEpisodes.length)} color={ACCENT} />
      <MetricCard label="Median heal" value={insights.medianDurationDays === null ? '-' : `${insights.medianDurationDays}d`} color={WARNING} />
      <MetricCard label="Peak" value={insights.maxSeverity === null ? '-' : `${insights.maxSeverity}/10`} color={PURPLE} />
    </section>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[8px] border border-border bg-surface px-3 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-3">{label}</p>
      <p className="mt-2 text-[22px] font-bold leading-none text-text-1" style={{ color }}>{value}</p>
    </div>
  )
}

function MouthMap({ insights, draftPin, onNewPin, onOpenEpisode }: { insights: UlcerInsights; draftPin: DraftPin | null; onNewPin: (pin: DraftPin) => void; onOpenEpisode: (episode: NormalizedUlcerEpisode) => void }) {
  function handleMapPointerUp(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest('[data-ulcer-pin]')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.round(((event.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((event.clientY - rect.top) / rect.height) * 100)
    onNewPin({ x: clamp(x, 1, 99), y: clamp(y, 1, 99), mouthRegion: nearestMouthRegion(x, y) })
  }

  return (
    <section className="rounded-[8px] border border-border bg-surface p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold text-text-1">Mouth map</h2>
          <p className="mt-1 text-[12px] text-text-2">Tap a location to start a new ulcer timeline.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: SOFTER, color: ACCENT }}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
          New
        </div>
      </div>
      <div
        role="button"
        tabIndex={0}
        onPointerUp={handleMapPointerUp}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') onNewPin({ x: 50, y: 56, mouthRegion: 'tongue_top' })
        }}
        className="relative aspect-square touch-manipulation overflow-hidden rounded-[8px] border border-border bg-surface-2"
        aria-label="Tap mouth map to add an ulcer"
      >
        <img src="/ulcer-tracker/mouth-map.png" alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_54%,transparent_52%,rgba(0,0,0,0.03)_78%)]" />
        {draftPin ? <UlcerPin x={draftPin.x} y={draftPin.y} color={ACCENT} size={26} draft /> : null}
        {insights.episodes.map(episode => {
          const report = insights.reportByEpisode.get(episode.id)
          const active = isActiveEpisode(episode)
          const size = 16 + (report?.peakSeverity ?? report?.latestObservation?.severity ?? 0) * 1.4
          return (
            <UlcerPin
              key={episode.id}
              x={episode.x}
              y={episode.y}
              color={active ? ACCENT : HEALED}
              size={size}
              opacity={active ? 1 : 0.62}
              label={`${mouthRegionLabel(episode.mouthRegion)} ulcer`}
              onClick={() => onOpenEpisode(episode)}
            />
          )
        })}
      </div>
    </section>
  )
}

function UlcerPin({ x, y, color, size, opacity = 1, label, draft = false, onClick }: { x: number; y: number; color: string; size: number; opacity?: number; label?: string; draft?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      data-ulcer-pin
      onClick={event => {
        event.stopPropagation()
        onClick?.()
      }}
      className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform ${onClick ? 'active:scale-90' : ''} ${draft ? 'ring-4 ring-white/55' : ''}`}
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, background: color, opacity, pointerEvents: onClick ? 'auto' : 'none' }}
      tabIndex={onClick ? 0 : -1}
      aria-disabled={!onClick}
      aria-label={label ?? 'New ulcer location'}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
      {draft ? <span className="absolute inset-[-8px] rounded-full border border-white/80" /> : null}
    </button>
  )
}

function CurrentUlcers({ insights, onOpen }: { insights: UlcerInsights; onOpen: (episode: NormalizedUlcerEpisode) => void }) {
  if (!insights.activeEpisodes.length) {
    return (
      <section className="rounded-[8px] border border-border bg-surface px-4 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: 'color-mix(in srgb, #6FA878 14%, var(--surface))', color: HEALED }}>
            <CheckCircle2 className="h-5 w-5" strokeWidth={2.1} />
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-text-1">No active ulcers</h2>
            <p className="mt-1 text-[13px] text-text-2">The next pin starts an event timeline.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-[8px] border border-border bg-surface p-3 shadow-sm">
      <h2 className="px-1 text-[17px] font-bold text-text-1">Current ulcers</h2>
      <div className="mt-2 space-y-2">
        {insights.activeEpisodes.map(episode => (
          <EpisodeRow key={episode.id} report={insights.reportByEpisode.get(episode.id)!} onOpen={() => onOpen(episode)} />
        ))}
      </div>
    </section>
  )
}

function EpisodeHistory({ insights, onOpen }: { insights: UlcerInsights; onOpen: (episode: NormalizedUlcerEpisode) => void }) {
  const history = insights.reports.filter(report => !isActiveEpisode(report.episode)).slice(0, 6)
  if (!history.length) return null
  return (
    <section className="rounded-[8px] border border-border bg-surface p-3 shadow-sm">
      <h2 className="px-1 text-[17px] font-bold text-text-1">Episode history</h2>
      <div className="mt-2 space-y-2">
        {history.map(report => <EpisodeRow key={report.episode.id} report={report} onOpen={() => onOpen(report.episode)} />)}
      </div>
    </section>
  )
}

function EpisodeRow({ report, onOpen }: { report: UlcerEpisodeReport; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center justify-between gap-3 rounded-[8px] bg-surface-2 px-3 py-3 text-left active:bg-surface">
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-text-1">{mouthRegionLabel(report.episode.mouthRegion)}</p>
        <p className="mt-1 text-[12px] text-text-2">
          {ulcerStatusLabel(report.episode.status)} · {report.daysOpen}d {isActiveEpisode(report.episode) ? 'open' : 'total'}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-bold" style={{ color: isActiveEpisode(report.episode) ? ACCENT : HEALED }}>{report.peakSeverity === null ? '-' : `${report.peakSeverity}/10`}</p>
        <p className="mt-1 text-[11px] text-text-3">{report.latestObservation ? `${report.latestObservation.sizeMm}mm` : 'No obs'}</p>
      </div>
    </button>
  )
}

function TrendDashboard({ insights }: { insights: UlcerInsights }) {
  return (
    <section className="space-y-3">
      <div className="grid gap-3">
        <ChartCard title="New ulcers by week">
          <BarChart values={insights.flareBuckets} color={ACCENT} emptyLabel="No ulcer starts logged yet" />
        </ChartCard>
        <ChartCard title="Active days by week">
          <BarChart values={insights.activeDayBuckets} color={WARNING} emptyLabel="Active ulcer days will appear here" />
        </ChartCard>
        <ChartCard title="Peak severity by ulcer">
          <BarChart values={insights.severitySeries.slice(-8)} color={PURPLE} emptyLabel="Add observations to see peak severity" />
        </ChartCard>
      </div>
      <section className="rounded-[8px] border border-border bg-surface p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: ACCENT }} strokeWidth={2.1} />
          <h2 className="text-[17px] font-bold text-text-1">Pattern reports</h2>
        </div>
        <div className="mt-3 grid gap-3">
          <InsightRows title="Recurring locations" rows={insights.regionStats.map(row => ({ label: row.label, value: `${row.count}`, weight: row.count }))} empty="Locations will appear here after logging." />
          <InsightRows title="Episode triggers" rows={insights.triggerStats.map(row => ({ label: row.trigger, value: `${row.count}`, weight: row.count }))} empty="Trigger counts are per episode, not per check-in." />
          <InsightRows title="Treatments used" rows={insights.treatmentStats.map(row => ({ label: row.treatment, value: `${row.count}`, weight: row.count }))} empty="Treatments will appear here after logging." />
          <div className="rounded-[8px] bg-surface-2 px-3 py-3">
            <p className="text-[13px] font-semibold text-text-1">Context</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-text-2">
              <ContextPill label="Avg stress" value={insights.wellbeing.averageStress === null ? '-' : `${insights.wellbeing.averageStress}/10`} />
              <ContextPill label="Avg sleep" value={insights.wellbeing.averageSleep === null ? '-' : `${insights.wellbeing.averageSleep}/10`} />
              <ContextPill label="Illness tags" value={String(insights.wellbeing.illnessCount)} />
              <ContextPill label="Cycle links" value={String(insights.wellbeing.cycleRelatedCount + insights.wellbeing.startedDuringLoggedPeriod)} />
            </div>
          </div>
        </div>
      </section>
    </section>
  )
}

function EditorSheet({ draftPin, episode, report, draft, editingEventId, error, onDraftChange, onClose, onSave, onDeleteEpisode, onEditEvent, onDeleteEvent }: {
  draftPin: DraftPin | null
  episode: NormalizedUlcerEpisode | null
  report: UlcerEpisodeReport | null
  draft: EventDraft
  editingEventId: string | null
  error: string | null
  onDraftChange: (draft: EventDraft) => void
  onClose: () => void
  onSave: () => void
  onDeleteEpisode?: () => void
  onEditEvent: (event: NormalizedUlcerCheckin) => void
  onDeleteEvent: (event: NormalizedUlcerCheckin) => void
}) {
  const title = draftPin ? mouthRegionLabel(draftPin.mouthRegion) : episode ? mouthRegionLabel(episode.mouthRegion) : 'Ulcer'
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ y: number; time: number; pointerId: number } | null>(null)
  const latestDragRef = useRef(0)
  const eventOptions = draftPin
    ? ['noticed'] as UlcerEventType[]
    : episode && !isActiveEpisode(episode)
      ? ['reopened', 'observation', 'treatment_started'] as UlcerEventType[]
      : ['observation', 'worsened', 'improved', 'treatment_started', 'treatment_stopped', 'healed'] as UlcerEventType[]

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    onDraftChange({ ...draft, [key]: value })
  }

  function toggle<K extends 'triggers' | 'treatments'>(key: K, value: string) {
    set(key, draft[key].includes(value) ? draft[key].filter(item => item !== value) : [...draft[key], value])
  }

  function onDragStart(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStartRef.current = { y: event.clientY, time: Date.now(), pointerId: event.pointerId }
    latestDragRef.current = 0
    setDragging(true)
  }

  function onDragMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const delta = Math.max(0, event.clientY - start.y)
    latestDragRef.current = delta
    setDragY(delta)
  }

  function onDragEnd(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    const distance = latestDragRef.current
    const velocity = distance / Math.max(Date.now() - start.time, 1)
    dragStartRef.current = null
    latestDragRef.current = 0
    if (distance > 86 || velocity > 0.45) {
      onClose()
      return
    }
    setDragY(0)
    setDragging(false)
  }

  return (
    <>
      <button type="button" aria-label="Close ulcer editor" className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-[24px] border-t border-border bg-bg shadow-[0_-18px_48px_rgba(0,0,0,0.24)]"
        style={{
          top: 'calc(env(safe-area-inset-top) + 48px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 10px)',
          transform: `translateY(${Math.max(0, dragY)}px)`,
          transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div className="flex h-10 shrink-0 touch-none items-center justify-center bg-bg" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <div className="h-1 w-10 rounded-full bg-text-3/40" />
        </div>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-bg/95 px-4 pb-3 backdrop-blur" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-3">{draftPin ? 'New ulcer' : episode ? ulcerStatusLabel(episode.status) : 'Ulcer'}</p>
            <h2 className="mt-1 truncate text-[22px] font-bold text-text-1">{title}</h2>
            {episode ? <p className="mt-1 text-[12px] text-text-2">First noticed {formatUlcerDate(episode.firstNoticedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-text-2 active:bg-surface-2" aria-label="Close">x</button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4" style={{ touchAction: 'pan-y' }}>
          {draftPin ? <LocationPreview pin={draftPin} /> : null}
          {report ? <EpisodeSummary report={report} /> : null}

          <section className="rounded-[8px] border border-border bg-surface p-3">
            <h3 className="text-[15px] font-bold text-text-1">{editingEventId ? 'Edit event' : draftPin ? 'First event' : 'Add event'}</h3>
            <div className="mt-3 grid gap-4">
              <SegmentedButtons options={eventOptions} value={draft.eventType} labels={ULCER_EVENT_LABELS} onChange={value => onDraftChange({ ...draft, ...eventDefaultsForType(value) })} />
              <label className="grid gap-2">
                <span className="text-[13px] font-semibold text-text-1">Date</span>
                <input type="date" value={draft.occurredDate} onChange={event => set('occurredDate', event.target.value)} className="h-10 rounded-[8px] border border-border bg-surface-2 px-3 text-[14px] text-text-1 outline-none focus:border-accent" />
              </label>
              {OBSERVATION_TYPES.has(draft.eventType) || draft.eventType === 'healed' ? (
                <>
                  <SegmentedButtons options={['new', 'worse', 'same', 'better', 'nearly_healed', 'healed']} value={draft.stage || 'same'} labels={ULCER_STAGE_LABELS} onChange={value => set('stage', value)} />
                  <RangeField label="Severity" value={draft.severity} max={10} onChange={value => set('severity', value)} />
                  <RangeField label="Pain" value={draft.pain} max={10} onChange={value => set('pain', value)} />
                  <RangeField label="Size" value={draft.sizeMm} max={50} suffix="mm" onChange={value => set('sizeMm', value)} />
                  <RangeField label="Redness" value={draft.redness} max={10} onChange={value => set('redness', value)} />
                </>
              ) : null}
            </div>
          </section>

          <TagSection title="Suspected triggers" options={TRIGGER_OPTIONS} selected={draft.triggers} onToggle={value => toggle('triggers', value)} />
          <TagSection title="Treatments" options={TREATMENT_OPTIONS} selected={draft.treatments} onToggle={value => toggle('treatments', value)} />

          <section className="rounded-[8px] border border-border bg-surface p-3">
            <h3 className="text-[15px] font-bold text-text-1">Wellbeing context</h3>
            <div className="mt-3 grid gap-4">
              <RangeField label="Stress" value={draft.stress} max={10} onChange={value => set('stress', value)} />
              <RangeField label="Sleep quality" value={draft.sleep} max={10} onChange={value => set('sleep', value)} />
              <div className="grid grid-cols-3 gap-2">
                <TogglePill label="Illness" checked={draft.illness} onChange={value => set('illness', value)} />
                <TogglePill label="Medication" checked={draft.medication} onChange={value => set('medication', value)} />
                <TogglePill label="Cycle" checked={draft.cycleRelated} onChange={value => set('cycleRelated', value)} />
              </div>
              <textarea value={draft.notes} onChange={event => set('notes', event.target.value)} placeholder="Optional notes" rows={2} className="w-full resize-none rounded-[8px] border border-border bg-surface-2 px-3 py-2 text-[14px] text-text-1 outline-none focus:border-accent" />
            </div>
          </section>

          {report?.events.length ? <Timeline report={report} editingEventId={editingEventId} onEdit={onEditEvent} onDelete={onDeleteEvent} /> : null}
          {error ? <p className="rounded-[8px] border border-amber-border bg-amber-bg px-3 py-2 text-[13px] text-amber">{error}</p> : null}
        </div>

        <div className="shrink-0 border-t border-border bg-bg/95 px-4 pb-3 pt-3 backdrop-blur">
          <button type="button" onClick={onSave} className="flex h-12 w-full items-center justify-center gap-2 rounded-[8px] text-[15px] font-bold text-white active:opacity-90" style={{ background: draft.eventType === 'healed' ? HEALED : ACCENT }}>
            {draft.eventType === 'reopened' ? <RotateCcw className="h-4 w-4" strokeWidth={2.4} /> : <Plus className="h-4 w-4" strokeWidth={2.4} />}
            {editingEventId ? 'Save event' : draftPin ? 'Start timeline' : ULCER_EVENT_LABELS[draft.eventType]}
          </button>
          {onDeleteEpisode ? (
            <button type="button" onClick={onDeleteEpisode} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-red-bg text-[14px] font-bold text-red active:opacity-80">
              <Trash2 className="h-4 w-4" strokeWidth={2.2} />
              Delete ulcer
            </button>
          ) : null}
        </div>
      </div>
    </>
  )
}

function eventDefaultsForType(eventType: UlcerEventType): Partial<EventDraft> {
  if (eventType === 'healed') return { eventType, stage: 'healed', severity: 0, pain: 0, sizeMm: 0, redness: 0 }
  if (eventType === 'worsened') return { eventType, stage: 'worse' }
  if (eventType === 'improved') return { eventType, stage: 'better' }
  if (eventType === 'reopened' || eventType === 'noticed') return { eventType, stage: 'new' }
  return { eventType, stage: '' }
}

function EpisodeSummary({ report }: { report: UlcerEpisodeReport }) {
  return (
    <section className="grid grid-cols-3 gap-2">
      <MetricCard label="Days" value={String(report.daysOpen)} color={isActiveEpisode(report.episode) ? ACCENT : HEALED} />
      <MetricCard label="Peak" value={report.peakSeverity === null ? '-' : `${report.peakSeverity}/10`} color={PURPLE} />
      <MetricCard label="Max size" value={report.maxSizeMm === null ? '-' : `${report.maxSizeMm}mm`} color={WARNING} />
    </section>
  )
}

function Timeline({ report, editingEventId, onEdit, onDelete }: { report: UlcerEpisodeReport; editingEventId: string | null; onEdit: (event: NormalizedUlcerCheckin) => void; onDelete: (event: NormalizedUlcerCheckin) => void }) {
  return (
    <section className="rounded-[8px] border border-border bg-surface p-3">
      <h3 className="text-[15px] font-bold text-text-1">Timeline</h3>
      <div className="mt-2 space-y-2">
        {report.events.slice().reverse().map(event => (
          <div key={event.id} className={`rounded-[8px] bg-surface-2 px-3 py-2 ${editingEventId === event.id ? 'ring-2 ring-accent' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-1">{ULCER_EVENT_LABELS[event.eventType]} · {formatUlcerDate(event.loggedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="mt-1 text-[12px] text-text-2">{event.stage ? ULCER_STAGE_LABELS[event.stage] : 'Event'} · {event.severity}/10 · {event.sizeMm}mm</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => onEdit(event)} className="rounded-[6px] bg-surface px-2 py-1 text-[11px] font-semibold text-text-2">Edit</button>
                <button type="button" onClick={() => onDelete(event)} className="rounded-[6px] bg-red-bg px-2 py-1 text-[11px] font-semibold text-red">Del</button>
              </div>
            </div>
            {event.triggers.length ? <p className="mt-1 text-[12px] capitalize text-text-2">Triggers: {event.triggers.join(', ')}</p> : null}
            {event.treatments.length ? <p className="mt-1 text-[12px] capitalize text-text-2">Treatments: {event.treatments.join(', ')}</p> : null}
            {event.notes ? <p className="mt-1 text-[12px] leading-5 text-text-2">{event.notes}</p> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

function LocationPreview({ pin }: { pin: DraftPin }) {
  return (
    <section className="rounded-[8px] border border-border bg-surface p-3">
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[8px] border border-border bg-surface-2">
          <img src="/ulcer-tracker/mouth-map.png" alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          <UlcerPin x={pin.x} y={pin.y} color={ACCENT} size={18} draft />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-text-1">{mouthRegionLabel(pin.mouthRegion)}</p>
          <p className="mt-1 text-[12px] text-text-2">This starts an individual ulcer timeline.</p>
        </div>
      </div>
    </section>
  )
}

function SegmentedButtons<T extends string>({ options, value, labels, onChange }: { options: T[]; value: T; labels: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const selected = value === option
        return (
          <button key={option} type="button" onClick={() => onChange(option)} className="rounded-full border px-3 py-1.5 text-[12px] font-semibold" style={selected ? { borderColor: ACCENT, background: SOFTER, color: ACCENT } : undefined}>
            {labels[option]}
          </button>
        )
      })}
    </div>
  )
}

function TagSection({ title, options, selected, onToggle }: { title: string; options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <section className="rounded-[8px] border border-border bg-surface p-3">
      <h3 className="text-[15px] font-bold text-text-1">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map(option => {
          const active = selected.includes(option)
          return (
            <button key={option} type="button" onClick={() => onToggle(option)} className="rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize" style={active ? { borderColor: ACCENT, background: SOFTER, color: ACCENT } : undefined}>
              {option}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function RangeField({ label, value, max, suffix = '/10', onChange }: { label: string; value: number; max: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-semibold text-text-1">{label}</span>
        <span className="text-[13px] font-bold" style={{ color: ACCENT }}>{value}{suffix}</span>
      </div>
      <input type="range" min={0} max={max} value={value} onChange={event => onChange(Number(event.target.value))} style={{ accentColor: ACCENT } as CSSProperties} />
    </label>
  )
}

function TogglePill({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="h-10 rounded-[8px] border px-2 text-[12px] font-semibold" style={checked ? { borderColor: ACCENT, background: SOFTER, color: ACCENT } : undefined}>
      {label}
    </button>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[8px] border border-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-text-3" strokeWidth={2.1} />
        <h2 className="text-[16px] font-bold text-text-1">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function BarChart({ values, color, emptyLabel }: { values: Array<{ label: string; count?: number; value?: number }>; color: string; emptyLabel: string }) {
  const points = values.map(point => ({ label: point.label, value: point.value ?? point.count ?? 0 }))
  const max = Math.max(1, ...points.map(point => point.value))
  if (!points.some(point => point.value > 0)) return <EmptyChart label={emptyLabel} />
  return (
    <div className="flex h-[120px] items-end gap-2">
      {points.map(point => (
        <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-[88px] w-full items-end rounded-[6px] bg-surface-2">
            <div className="w-full rounded-[6px]" style={{ height: `${Math.max(8, (point.value / max) * 88)}px`, background: color }} />
          </div>
          <span className="max-w-full truncate text-[9px] text-text-3">{point.label}</span>
        </div>
      ))}
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return <div className="flex h-[116px] items-center justify-center rounded-[8px] bg-surface-2 px-4 text-center text-[13px] text-text-3">{label}</div>
}

function InsightRows({ title, rows, empty }: { title: string; rows: Array<{ label: string; value: string; weight: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map(row => row.weight))
  return (
    <div className="rounded-[8px] bg-surface-2 px-3 py-3">
      <p className="text-[13px] font-semibold text-text-1">{title}</p>
      {rows.length ? (
        <div className="mt-2 space-y-2">
          {rows.map(row => (
            <div key={row.label} className="grid grid-cols-[88px_1fr_24px] items-center gap-2">
              <span className="truncate text-[12px] text-text-2">{row.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface">
                <span className="block h-full rounded-full" style={{ width: `${(row.weight / max) * 100}%`, background: ACCENT }} />
              </span>
              <span className="text-right text-[12px] font-bold text-text-1">{row.value}</span>
            </div>
          ))}
        </div>
      ) : <p className="mt-2 text-[12px] text-text-3">{empty}</p>}
    </div>
  )
}

function ContextPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-surface px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.05em] text-text-3">{label}</p>
      <p className="mt-1 text-[14px] font-bold text-text-1">{value}</p>
    </div>
  )
}

function dateInputValue(date: Date) {
  const local = new Date(date)
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  return local.toISOString().slice(0, 10)
}

function localDateIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0).toISOString()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
