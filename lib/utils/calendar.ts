// Calendar date helpers.
//
// All-day events are stored at UTC midnight so they are timezone-independent
// (an "all-day on 6 June" event is the same calendar day for every viewer).
// Read those with UTC date components. Timed events are real instants — read
// them with the viewer's local components.

// Bare "Y-M-D" key for the calendar day a calendar item sits on.
// Matches the local key of a month-grid cell.
export function calendarDayKey(date: Date, allDay: boolean): string {
  if (allDay) return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// Local "Y-M-D" key for a grid cell (cells are always local Dates).
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

// A local Date representing an all-day event's calendar day, safe to format
// with toLocaleDateString without timezone drift.
export function allDayAsLocal(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// The local Date for whichever calendar day the item sits on.
function itemLocalDay(date: Date, allDay: boolean): Date {
  return allDay ? allDayAsLocal(date) : startOfLocalDay(date)
}

// "Today" / "Tomorrow" / "Sat 6 Jun"
export function relativeDayLabel(date: Date, allDay: boolean): string {
  const day = itemLocalDay(date, allDay)
  const today = startOfLocalDay(new Date())
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function eventTimeLabel(date: Date, allDay: boolean): string {
  if (allDay) return 'All day'
  // Explicit timezone so server-side renders are always UK local time, not UTC.
  return date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Europe/London',
  })
}
