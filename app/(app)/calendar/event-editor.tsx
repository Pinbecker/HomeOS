'use client'

import { useState, useEffect, useRef } from 'react'
import { allDayAsLocal } from '@/lib/utils/calendar'

type CalEvent = {
  id: string
  title: string
  start: number
  end: number
  allDay: boolean
  location: string | null
  description: string | null
}

// ── Date / time utilities ────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0') }
function dateInput(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function timeInput(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

function parseDt(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min).getTime()
}

function splitDt(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  return { date: dateInput(d), time: timeInput(d) }
}

function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000
  const r = new Date(ms)
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`
}

function daySpan(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** iOS-style pill toggle switch */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-accent' : 'bg-surface-2'
      }`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-transform duration-200 ${
          checked ? 'translate-x-[21px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  )
}

/** Clock outline icon */
function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth={1.6} />
      <path d="M10 6.5V10l2.5 2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Map-pin icon */
function IconPin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 2a5.5 5.5 0 0 1 5.5 5.5c0 4.1-5.5 10.5-5.5 10.5S4.5 11.6 4.5 7.5A5.5 5.5 0 0 1 10 2z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx="10" cy="7.5" r="2" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

/** Lined-notes icon */
function IconNotes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M4.5 6h11M4.5 9.5h11M4.5 13h7" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

// Native date / time inputs styled to show as plain accent-coloured text on mobile.
// The browser renders its own date picker UI when tapped — no custom JS needed.
const pickerCls =
  'bg-transparent text-[15px] text-accent font-medium border-0 outline-none cursor-pointer min-w-0'

// ── Main component ───────────────────────────────────────────────────────────

export function EventEditor({
  initialDate,
  event,
  onClose,
  onSaved,
  embedded = false,
}: {
  initialDate: Date
  event: CalEvent | null
  onClose: () => void
  onSaved: () => void
  embedded?: boolean
}) {
  const editing = Boolean(event)

  // ── Initialise form state from event (or defaults) ───────────────────────
  const init = (() => {
    if (event) {
      if (event.allDay) {
        const startLocal = allDayAsLocal(new Date(event.start))
        const endExclMs  = event.end > event.start ? event.end : event.start + 86_400_000
        const endLocal   = allDayAsLocal(new Date(endExclMs - 86_400_000))
        return {
          title:     event.title,
          allDay:    true,
          startDate: dateInput(startLocal),
          endDate:   dateInput(endLocal),
          startTime: '09:00',
          endTime:   '10:00',
          location:  event.location ?? '',
          notes:     event.description ?? '',
        }
      }
      const s = new Date(event.start)
      const e = new Date(event.end > event.start ? event.end : event.start + 3_600_000)
      return {
        title:     event.title,
        allDay:    false,
        startDate: dateInput(s),
        endDate:   dateInput(e),
        startTime: timeInput(s),
        endTime:   timeInput(e),
        location:  event.location ?? '',
        notes:     event.description ?? '',
      }
    }
    return {
      title:     '',
      allDay:    false,
      startDate: dateInput(initialDate),
      endDate:   dateInput(initialDate),
      startTime: '09:00',
      endTime:   '10:00',
      location:  '',
      notes:     '',
    }
  })()

  const [title,     setTitle]     = useState(init.title)
  const [allDay,    setAllDay]    = useState(init.allDay)
  const [startDate, setStartDate] = useState(init.startDate)
  const [endDate,   setEndDate]   = useState(init.endDate)
  const [startTime, setStartTime] = useState(init.startTime)
  const [endTime,   setEndTime]   = useState(init.endTime)
  const [location,  setLocation]  = useState(init.location)
  const [notes,     setNotes]     = useState(init.notes)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const notesRef = useRef<HTMLTextAreaElement>(null)

  // Auto-expand notes textarea to fit content
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [notes])

  // ── Date / time smart handlers ───────────────────────────────────────────

  function handleAllDayChange(checked: boolean) {
    setAllDay(checked)
    if (!checked) {
      setEndDate(startDate)
      setStartTime('09:00')
      setEndTime('10:00')
    } else {
      if (endDate < startDate) setEndDate(startDate)
    }
  }

  function handleStartDateChange(newDate: string) {
    const duration = Math.max(parseDt(endDate, endTime) - parseDt(startDate, startTime), 3_600_000)
    const next = splitDt(parseDt(newDate, startTime) + duration)
    setStartDate(newDate); setEndDate(next.date); setEndTime(next.time)
  }

  function handleStartTimeChange(newTime: string) {
    const duration = Math.max(parseDt(endDate, endTime) - parseDt(startDate, startTime), 3_600_000)
    const next = splitDt(parseDt(startDate, newTime) + duration)
    setStartTime(newTime); setEndDate(next.date); setEndTime(next.time)
  }

  function handleEndDateChange(newDate: string) {
    const startMs = parseDt(startDate, startTime)
    if (parseDt(newDate, endTime) <= startMs) {
      const s = splitDt(startMs + 3_600_000); setEndDate(s.date); setEndTime(s.time)
    } else { setEndDate(newDate) }
  }

  function handleEndTimeChange(newTime: string) {
    const startMs = parseDt(startDate, startTime)
    if (parseDt(endDate, newTime) <= startMs) {
      const s = splitDt(startMs + 3_600_000); setEndDate(s.date); setEndTime(s.time)
    } else { setEndTime(newTime) }
  }

  function handleAllDayStartDateChange(newDate: string) {
    const span = daySpan(startDate, endDate)
    setStartDate(newDate); setEndDate(addDaysToDate(newDate, span))
  }

  function handleAllDayEndDateChange(newDate: string) {
    setEndDate(newDate < startDate ? startDate : newDate)
  }

  // ── Payload ──────────────────────────────────────────────────────────────

  function buildPayload() {
    if (allDay) {
      const [sy, sm, sd] = startDate.split('-').map(Number)
      const [ey, em, ed] = endDate.split('-').map(Number)
      return {
        title: title.trim(), allDay: true,
        start: Date.UTC(sy, sm - 1, sd),
        end:   Date.UTC(ey, em - 1, ed) + 86_400_000,   // exclusive end
        location: location.trim() || null,
        description: notes.trim() || null,
      }
    }
    return {
      title: title.trim(), allDay: false,
      start: parseDt(startDate, startTime),
      end:   parseDt(endDate, endTime),
      location: location.trim() || null,
      description: notes.trim() || null,
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function save() {
    if (!title.trim()) { setError('Add a title for the event'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch(
        editing ? `/api/calendar/events/${event!.id}` : '/api/calendar/events',
        { method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildPayload()) },
      )
      if      (res.status === 409) setError('Connect your Google account first.')
      else if (!res.ok)            setError('Could not save. Please try again.')
      else                         { onSaved(); return }
    } catch {
      setError('Could not save. Check your connection and try again.')
    }
    setSaving(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const navBar = (
    <div className={`px-4 pt-3 pb-2.5 flex items-center justify-between border-b border-border shrink-0 ${!embedded ? 'safe-top' : ''}`}>
      <button
        onClick={onClose}
        className="text-accent text-[16px] active:opacity-60 min-w-[56px]"
      >
        Cancel
      </button>
      <span className="text-[16px] font-semibold text-text-1 tracking-tight">
        {editing ? 'Edit Event' : 'New Event'}
      </span>
      <button
        onClick={save}
        disabled={saving || !title.trim()}
        className="text-accent text-[16px] font-semibold active:opacity-60 disabled:opacity-40 min-w-[56px] text-right"
      >
        {saving ? 'Saving…' : editing ? 'Done' : 'Add'}
      </button>
    </div>
  )

  const formBody = (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 pt-5 pb-10 flex flex-col gap-3">

          {/* ── Title + Location ── */}
          <div className="bg-surface rounded-2xl overflow-hidden shadow-sm">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()}
              placeholder="Title"
              className="w-full px-4 pt-4 pb-3 text-[20px] font-semibold text-text-1 placeholder:text-text-3 bg-transparent outline-none"
            />
            <div className="border-t border-border flex items-center gap-3 px-4 py-3.5">
              <IconPin className="w-[17px] h-[17px] text-text-3 shrink-0" />
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Location or address"
                className="flex-1 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none"
              />
            </div>
          </div>

          {/* ── Date / Time ── */}
          <div className="bg-surface rounded-2xl overflow-hidden shadow-sm">

            {/* All-day toggle */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <IconClock className="w-[17px] h-[17px] text-text-3 shrink-0" />
              <span className="flex-1 text-[15px] text-text-1">All-day</span>
              <Toggle checked={allDay} onChange={handleAllDayChange} />
            </div>

            {/* Starts */}
            <div className="border-t border-border flex items-center justify-between px-4 py-3.5 gap-3">
              <span className="text-[15px] text-text-2 shrink-0">Starts</span>
              <div className="flex items-center gap-2.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => allDay
                    ? handleAllDayStartDateChange(e.target.value)
                    : handleStartDateChange(e.target.value)
                  }
                  className={pickerCls}
                />
                {!allDay && (
                  <>
                    <span className="text-text-3 text-[13px]">·</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => handleStartTimeChange(e.target.value)}
                      className={pickerCls}
                    />
                  </>
                )}
              </div>
            </div>

            {/* Ends */}
            <div className="border-t border-border flex items-center justify-between px-4 py-3.5 gap-3">
              <span className="text-[15px] text-text-2 shrink-0">Ends</span>
              <div className="flex items-center gap-2.5">
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => allDay
                    ? handleAllDayEndDateChange(e.target.value)
                    : handleEndDateChange(e.target.value)
                  }
                  className={pickerCls}
                />
                {!allDay && (
                  <>
                    <span className="text-text-3 text-[13px]">·</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => handleEndTimeChange(e.target.value)}
                      className={pickerCls}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div className="bg-surface rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-start gap-3 px-4 py-3.5">
              <IconNotes className="w-[17px] h-[17px] text-text-3 shrink-0 mt-0.5" />
              <textarea
                ref={notesRef}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes"
                rows={1}
                className="flex-1 text-[15px] text-text-1 placeholder:text-text-3 bg-transparent outline-none resize-none overflow-hidden leading-relaxed"
              />
            </div>
          </div>

          {/* ── Error ── */}
          {error && (
            <div className="bg-red-bg rounded-xl px-4 py-3">
              <p className="text-[13.5px] text-red leading-snug">{error}</p>
            </div>
          )}

        </div>
      </div>
  )

  if (embedded) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {navBar}
        {formBody}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col max-w-lg mx-auto">
      {navBar}
      {formBody}
    </div>
  )
}
