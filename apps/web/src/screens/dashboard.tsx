import { ScreenShell } from './shell'
import { useAppState } from '../lib/app-store'

function DashboardCard({
  title,
  subtitle,
  href,
  accent,
  value,
}: {
  title: string
  subtitle: string
  href: string
  accent: string
  value: string | number
}) {
  return (
    <a href={href} className="rounded-2xl border border-border bg-surface px-4 py-4 active:bg-surface-2">
      <div className="mb-3 h-2.5 w-2.5 rounded-full" style={{ background: accent }} />
      <p className="text-[14px] font-semibold text-text-1">{title}</p>
      <p className="mt-1 text-[12px] leading-5 text-text-2">{subtitle}</p>
      <p className="mt-4 text-[28px] font-bold text-text-1">{value}</p>
    </a>
  )
}

export function DashboardPage() {
  const snapshot = useAppState(state => {
    const shopping = state.data.listItems.filter(item => !item.deletedAt && !item.checked)
    const tasks = state.data.items.filter(item => item.type === 'task' && item.status === 'active' && !item.deletedAt)
    const inbox = state.data.items.filter(item => item.type === 'inbox' && item.status === 'active' && !item.deletedAt)
    const notes = state.data.items.filter(item => item.type === 'note' && item.status === 'active' && !item.deletedAt)
    const pinnedNotes = notes.filter(item => item.pinned).slice(0, 3)
    return {
      shoppingCount: shopping.length,
      taskCount: tasks.length,
      inboxCount: inbox.length,
      noteCount: notes.length,
      pinnedNotes,
    }
  })

  const firstName = useAppState(state => state.data.users[0]?.name?.split(' ')[0] ?? 'Dan')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? `Good morning, ${firstName}` : hour < 17 ? `Good afternoon, ${firstName}` : `Good evening, ${firstName}`
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <ScreenShell title="Home">
      <div className="px-4">
        <section className="mb-5 rounded-3xl bg-surface px-5 py-5">
          <p className="text-[24px] font-bold text-text-1">{greeting}</p>
          <p className="mt-1 text-[14px] text-text-2">{dateStr}</p>
        </section>

        <section className="grid grid-cols-2 gap-3 mb-5">
          <DashboardCard title="Shopping" subtitle="Items still to pick up" href="/household/shopping" accent="#34C759" value={snapshot.shoppingCount} />
          <DashboardCard title="Tasks" subtitle="Active tasks across lists" href="/household/tasks" accent="#FF9500" value={snapshot.taskCount} />
          <DashboardCard title="Inbox" subtitle="Captured items to process" href="/inbox" accent="#007AFF" value={snapshot.inboxCount} />
          <DashboardCard title="Notes" subtitle="Saved notes in the app" href="/notes" accent="#5856D6" value={snapshot.noteCount} />
        </section>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[19px] font-bold text-accent">Pinned</h2>
            <a href="/notes" className="text-[13px] font-medium text-text-2">All notes</a>
          </div>
          {snapshot.pinnedNotes.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface px-4 py-5">
              <p className="text-[14px] font-semibold text-text-1">Nothing pinned yet</p>
              <p className="mt-1 text-[13px] text-text-2">Pin important notes and they’ll show up here.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              {snapshot.pinnedNotes.map((note, index) => (
                <a key={note.id} href="/notes" className={`block px-4 py-3 active:bg-surface-2 ${index > 0 ? 'border-t border-border' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-[#34C759] shrink-0">
                      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.6l1.4 3.5a2 2 0 0 1 .15.76V11a1 1 0 0 1-1 1h-3v6.5a1 1 0 0 1-2 0V12H7.5a1 1 0 0 1-1-1V9.86a2 2 0 0 1 .14-.76L8 5.6V4z" />
                    </svg>
                    <p className="text-[14px] font-semibold text-text-1 truncate">{note.title}</p>
                  </div>
                  {note.body ? <p className="mt-1 text-[12px] leading-5 text-text-2 line-clamp-2">{note.body}</p> : null}
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </ScreenShell>
  )
}
