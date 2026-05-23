'use client'

import { useState } from 'react'
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

function pad(n: number) { return String(n).padStart(2, '0') }
function dateInput(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function timeInput(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

// Parse "YYYY-MM-DD" + "HH:MM" → local timestamp ms
function parseDt(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, min).getTime()
}

// Split local timestamp ms → { date: "YYYY-MM-DD", time: "HH:MM" }
function splitDt(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  return { date: dateInput(d), time: timeInput(d) }
}

// Add n days to a YYYY-MM-DD string, returning a new YYYY-MM-DD string
function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000
  const r = new Date(ms)
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`
}

// Day span between two YYYY-MM-DD strings (end - start in whole days)
function daySpan(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

export function EventEditor({
  initialDate,
  event,
  onClose,
  onSaved,
}: {
  initialDate: Date
  event: CalEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const editing = Boolean(event)

  const init = (() => {
    if (event) {
      if (event.allDay) {
        const startLocal = allDayAsLocal(new Date(event.start))
        // end in DB is exclusive UTC midnight — subtract 1 day for inclusive display
        const endExclMs = event.end > event.start ? event.end : event.start + 86_400_000
        const endLocal = allDayAsLocal(new Date(endExclMs - 86_400_000))
        return {
          title: event.title,
          allDay: true,
          startDate: dateInput(startLocal),
          endDate: dateInput(endLocal),
          startTime: '09:00',
          endTime: '10:00',
          location: event.location ?? '',
          notes: event.description ?? '',
        }
      } else {
        const s = new Date(event.start)
        const e = new Date(event.end > event.start ? event.end : event.start + 3_600_000)
        return {
          title: event.title,
          allDay: false,
          startDate: dateInput(s),
          endDate: dateInput(e),
          startTime: timeInput(s),
          endTime: timeInput(e),
          location: event.location ?? '',
          notes: event.description ?? '',
        }
      }
    }
    return {
      title: '',
      allDay: false,
      startDate: dateInput(initialDate),
      endDate: dateInput(initialDate),
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      notes: '',
    }
  })()

  const [title, setTitle] = useState(init.title)
  const [allDay, setAllDay] = useState(init.allDay)
  const [startDate, setStartDate] = useState(init.startDate)
  const [endDate, setEndDate] = useState(init.endDate)
  const [startTime, setStartTime] = useState(init.startTime)
  const [endTime, setEndTime] = useState(init.endTime)
  const [location, setLocation] = useState(init.location)
  const [notes, setNotes] = useState(init.notes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Smart date/time handlers ─────────────────────────────────────────────

  function handleAllDayChange(checked: boolean) {
    setAllDay(checked)
    if (!checked) {
      // Un-checking all-day: collapse to same start day, 09:00–10:00
      setEndDate(startDate)
      setStartTime('09:00')
      setEndTime('10:00')
    } else {
      // Checking all-day: ensure end ≥ start
      if (endDate < startDate) setEndDate(startDate)
    }
  }

  // Timed: start date changed — preserve duration, roll end forward/back
  function handleStartDateChange(newDate: string) {
    const oldStart = parseDt(startDate, startTime)
    const oldEnd = parseDt(endDate, endTime)
    const duration = Math.max(oldEnd - oldStart, 3_600_000) // at least 1 hr
    const { date: newEndDate, time: newEndTime } = splitDt(parseDt(newDate, startTime) + duration)
    setStartDate(newDate)
    setEndDate(newEndDate)
    setEndTime(newEndTime)
  }

  // Timed: start time changed — preserve duration, roll end accordingly
  function handleStartTimeChange(newTime: string) {
    const oldStart = parseDt(startDate, startTime)
    const oldEnd = parseDt(endDate, endTime)
    const duration = Math.max(oldEnd - oldStart, 3_600_000)
    const { date: newEndDate, time: newEndTime } = splitDt(parseDt(startDate, newTime) + duration)
    setStartTime(newTime)
    setEndDate(newEndDate)
    setEndTime(newEndTime)
  }

  // Timed: end date changed — snap forward if before start
  function handleEndDateChange(newDate: string) {
    const startMs = parseDt(startDate, startTime)
    if (parseDt(newDate, endTime) <= startMs) {
      const snapped = splitDt(startMs + 3_600_000)
      setEndDate(snapped.date)
      setEndTime(snapped.time)
    } else {
      setEndDate(newDate)
    }
  }

  // Timed: end time changed — snap forward if before/equal to start
  function handleEndTimeChange(newTime: string) {
    const startMs = parseDt(startDate, startTime)
    if (parseDt(endDate, newTime) <= startMs) {
      const snapped = splitDt(startMs + 3_600_000)
      setEndDate(snapped.date)
      setEndTime(snapped.time)
    } else {
      setEndTime(newTime)
    }
  }

  // All-day: start date changed — preserve multi-day span, or keep same-day
  function handleAllDayStartDateChange(newDate: string) {
    const span = daySpan(startDate, endDate)
    setStartDate(newDate)
    setEndDate(addDaysToDate(newDate, span)) // preserves 0-day span for single-day events
  }

  // All-day: end date changed — cannot go before start
  function handleAllDayEndDateChange(newDate: string) {
    setEndDate(newDate < startDate ? startDate : newDate)
  }

  // ── Payload builder ──────────────────────────────────────────────────────

  function buildPayload() {
    if (allDay) {
      const [sy, sm, sd] = startDate.split('-').map(Number)
      const [ey, em, ed] = endDate.split('-').map(Number)
      const start = Date.UTC(sy, sm - 1, sd)
      // Google all-day end is exclusive; store one day past the inclusive display end
      const end = Date.UTC(ey, em - 1, ed) + 86_400_000
      return { title: title.trim(), allDay: true, start, end, location: location.trim() || null, description: notes.trim() || null }
    }
    const start = parseDt(startDate, startTime)
    const end = parseDt(endDate, endTime)
    return { title: title.trim(), allDay: false, start, end, location: location.trim() || null, description: notes.trim() || null }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function save() {
    if (!title.trim()) { setError('Give it a name'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(
        editing ? `/api/calendar/events/${event!.id}` : '/api/calendar/events',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildPayload()),
        },
      )
      if (res.status === 409) {
        setError('Connect your Google account first (button on the calendar screen).')
        setSaving(false)
        return
      }
      if (!res.ok) {
        setError('Could not save. Please try again.')
        setSaving(false)
        return
      }
      onSaved()
    } catch {
      setError('Could not save. Check your connection and try again.')
      setSaving(false)
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputClass = 'w-full bg-surface-2 rounded-xl px-3.5 py-2.5 text-[15px] text-text-1 outline-none placeholder:text-text-3'
  const pickerClass = 'bg-surface-2 rounded-lg px-3 py-1.5 text-[15px] text-text-1 outline-none'

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
        <button onClick={onClose} className="text-accent text-[16px] active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold text-text-1">{editing ? 'Edit event' : 'New event'}</span>
        <button onClick={save} disabled={saving} className="text-accent text-[16px] font-semibold active:opacity-60 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
        {/* Title */}
        <input
          autoFocus={!editing}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Event name"
          className="w-full bg-transparent text-[22px] font-bold text-text-1 outline-none placeholder:text-text-3"
        />

        {/* Date / time card */}
        <div className="bg-surface rounded-2xl overflow-hidden">

          {/* All-day toggle */}
          <label className="flex items-center justify-between px-4 py-3">
            <span className="text-[15px] text-text-1">All-day</span>
            <input
              type="checkbox"
              checked={allDay}
              onChange={e => handleAllDayChange(e.target.checked)}
              className="w-5 h-5 accent-accent"
            />
          </label>

          {/* Starts row */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            <span className="text-[15px] text-text-1 shrink-0">Starts</span>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <input
                type="date"
                value={startDate}
                onChange={e => allDay
                  ? handleAllDayStartDateChange(e.target.value)
                  : handleStartDateChange(e.target.value)
                }
                className={pickerClass}
              />
              {!allDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={e => handleStartTimeChange(e.target.value)}
                  className={pickerClass}
                />
              )}
            </div>
          </div>

          {/* Ends row */}
          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            <span className="text-[15px] text-text-1 shrink-0">Ends</span>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => allDay
                  ? handleAllDayEndDateChange(e.target.value)
                  : handleEndDateChange(e.target.value)
                }
                className={pickerClass}
              />
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={e => handleEndTimeChange(e.target.value)}
                  className={pickerClass}
                />
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Location (optional)"
          className={inputClass}
        />

        {/* Notes */}
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={4}
          className={`${inputClass} resize-none`}
        />

        {error && <p className="text-[13.5px] text-red px-1">{error}</p>}
      </div>
    </div>
  )
}
