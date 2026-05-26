import { useMemo } from 'react'
import { ScreenShell } from './shell'
import { useAppState } from '../lib/app-store'

type AgendaEntry =
  | {
      id: string
      kind: 'event'
      title: string
      startsAt: number
      endsAt: number
      allDay: boolean
      location: string | null
      description: string | null
    }
  | {
      id: string
      kind: 'task'
      title: string
      startsAt: number
      endsAt: number
      allDay: false
      location: null
      description: string | null
      completed: boolean
      color: string
    }

function dayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayLabel(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function CalendarDot({ color }: { color: string }) {
  return <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
}

export function CalendarPage() {
  const snapshot = useAppState(state => {
    const listColors = new Map(state.data.lists.map(list => [list.id, list.color ?? '#FF9500']))
    const eventEntries: AgendaEntry[] = state.data.calendarEvents.map(event => ({
      id: event.id,
      kind: 'event',
      title: event.title,
      startsAt: new Date(event.startsAt).getTime(),
      endsAt: new Date(event.endsAt ?? event.startsAt).getTime(),
      allDay: Boolean(event.allDay),
      location: event.location ?? null,
      description: event.description ?? null,
    }))
    const taskEntries: AgendaEntry[] = state.data.items
      .filter(item => item.type === 'task' && item.dueDate && !item.deletedAt)
      .map(item => ({
        id: item.id,
        kind: 'task',
        title: item.title,
        startsAt: new Date(item.dueDate as string | number | Date).getTime(),
        endsAt: new Date(item.dueDate as string | number | Date).getTime(),
        allDay: false,
        location: null,
        description: null,
        completed: item.status === 'completed',
        color: item.listId ? (listColors.get(item.listId) ?? '#FF9500') : '#FF9500',
      }))

    return { entries: [...eventEntries, ...taskEntries] }
  })

  const grouped = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const cutoff = today.getTime() - 86_400_000

    const map = new Map<string, { date: number; entries: AgendaEntry[] }>()
    for (const entry of snapshot.entries) {
      if (entry.endsAt < cutoff) continue
      const date = new Date(entry.startsAt)
      date.setHours(0, 0, 0, 0)
      const key = dayKey(date)
      if (!map.has(key)) {
        map.set(key, { date: date.getTime(), entries: [] })
      }
      map.get(key)?.entries.push(entry)
    }

    return Array.from(map.values())
      .sort((a, b) => a.date - b.date)
      .map(group => ({
        ...group,
        entries: group.entries.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1
          if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
          return a.startsAt - b.startsAt
        }),
      }))
  }, [snapshot.entries])

  const upcoming = grouped.slice(0, 14)

  return (
    <ScreenShell title="Calendar">
      <div className="px-4">
        <div className="mb-4 rounded-3xl bg-surface px-5 py-5">
          <p className="text-[24px] font-bold text-text-1">Upcoming</p>
          <p className="mt-1 text-[14px] text-text-2">Cached family events and dated tasks available offline.</p>
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-2xl bg-surface px-5 py-8 text-center">
            <p className="mb-1 text-[15px] font-semibold text-text-1">No upcoming items</p>
            <p className="text-[13px] text-text-2">When the server syncs events, they’ll appear here for offline viewing.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {upcoming.map(group => (
              <section key={group.date}>
                <div className="mb-2 px-1">
                  <p className="text-[12px] font-bold uppercase tracking-wide text-text-3">{formatDayLabel(group.date)}</p>
                </div>
                <div className="overflow-hidden rounded-2xl bg-surface">
                  {group.entries.map((entry, index) => (
                    <div key={`${entry.kind}-${entry.id}`} className={`px-4 py-3 ${index > 0 ? 'border-t border-border' : ''}`}>
                      <div className="flex items-start gap-3">
                        {entry.kind === 'event' ? <CalendarDot color="#007AFF" /> : <CalendarDot color={entry.color} />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`truncate text-[14.5px] font-semibold ${entry.kind === 'task' && entry.completed ? 'text-text-3 line-through' : 'text-text-1'}`}>
                              {entry.title}
                            </p>
                            <span className="shrink-0 text-[12px] font-medium text-text-2">
                              {entry.kind === 'event'
                                ? (entry.allDay ? 'All day' : formatTime(entry.startsAt))
                                : formatTime(entry.startsAt)}
                            </span>
                          </div>
                          {entry.kind === 'event' && entry.location ? (
                            <p className="mt-1 truncate text-[12px] text-text-2">{entry.location}</p>
                          ) : null}
                          {entry.kind === 'event' && entry.description ? (
                            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-text-2">{entry.description}</p>
                          ) : null}
                          {entry.kind === 'task' ? (
                            <p className="mt-1 text-[12px] text-text-2">{entry.completed ? 'Completed task' : 'Task due'}</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </ScreenShell>
  )
}
