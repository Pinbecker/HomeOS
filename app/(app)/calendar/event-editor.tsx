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
      const startLocal = event.allDay ? allDayAsLocal(new Date(event.start)) : new Date(event.start)
      const endLocal = event.allDay ? allDayAsLocal(new Date(event.start)) : new Date(event.end)
      return {
        title: event.title,
        allDay: event.allDay,
        date: dateInput(startLocal),
        startTime: event.allDay ? '09:00' : timeInput(startLocal),
        endTime: event.allDay ? '10:00' : timeInput(endLocal),
        location: event.location ?? '',
        notes: event.description ?? '',
      }
    }
    return {
      title: '',
      allDay: false,
      date: dateInput(initialDate),
      startTime: '09:00',
      endTime: '10:00',
      location: '',
      notes: '',
    }
  })()

  const [title, setTitle] = useState(init.title)
  const [allDay, setAllDay] = useState(init.allDay)
  const [date, setDate] = useState(init.date)
  const [startTime, setStartTime] = useState(init.startTime)
  const [endTime, setEndTime] = useState(init.endTime)
  const [location, setLocation] = useState(init.location)
  const [notes, setNotes] = useState(init.notes)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function buildPayload() {
    const [y, m, d] = date.split('-').map(Number)
    if (allDay) {
      const start = Date.UTC(y, m - 1, d)
      return { title: title.trim(), allDay: true, start, end: start, location: location.trim() || null, description: notes.trim() || null }
    }
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const start = new Date(y, m - 1, d, sh, sm).getTime()
    let end = new Date(y, m - 1, d, eh, em).getTime()
    if (end <= start) end = start + 3_600_000
    return { title: title.trim(), allDay: false, start, end, location: location.trim() || null, description: notes.trim() || null }
  }

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

  const inputClass = 'w-full bg-surface-2 rounded-xl px-3.5 py-2.5 text-[15px] text-text-1 outline-none placeholder:text-text-3'

  return (
    <div className="fixed inset-0 z-[60] bg-bg flex flex-col max-w-lg mx-auto">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border safe-top">
        <button onClick={onClose} className="text-accent text-[16px] active:opacity-60">Cancel</button>
        <span className="text-[16px] font-semibold text-text-1">{editing ? 'Edit event' : 'New event'}</span>
        <button onClick={save} disabled={saving} className="text-accent text-[16px] font-semibold active:opacity-60 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
        <input
          autoFocus={!editing}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Event name"
          className="w-full bg-transparent text-[22px] font-bold text-text-1 outline-none placeholder:text-text-3"
        />

        <div className="bg-surface rounded-2xl overflow-hidden">
          <label className="flex items-center justify-between px-4 py-3">
            <span className="text-[15px] text-text-1">All-day</span>
            <input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-5 h-5 accent-accent" />
          </label>

          <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
            <span className="text-[15px] text-text-1">Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-surface-2 rounded-lg px-3 py-1.5 text-[15px] text-text-1 outline-none" />
          </div>

          {!allDay && (
            <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3">
              <span className="text-[15px] text-text-1">Time</span>
              <div className="flex items-center gap-2">
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-surface-2 rounded-lg px-3 py-1.5 text-[15px] text-text-1 outline-none" />
                <span className="text-text-3">–</span>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-surface-2 rounded-lg px-3 py-1.5 text-[15px] text-text-1 outline-none" />
              </div>
            </div>
          )}
        </div>

        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location (optional)" className={inputClass} />
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)" rows={4} className={`${inputClass} resize-none`} />

        {error && <p className="text-[13.5px] text-red px-1">{error}</p>}
      </div>
    </div>
  )
}
