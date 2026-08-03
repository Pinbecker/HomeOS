import { CheckCircle2, ChevronRight, Clock3, FileText, ListChecks, UserRound } from 'lucide-react'
import { useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

function dueLabel(value: string | number | Date | null | undefined) {
  if (!value) return 'No due date'
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  return sameDay ? 'Due today' : `Due ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

export function MemberProfilePage({ userId }: { userId: string }) {
  const snapshot = useAppState(state => {
    const member = state.data.users.find(user => user.id === userId) ?? null
    const memberIndex = Math.max(0, state.data.users.findIndex(user => user.id === userId))
    const membership = state.data.householdMembers.find(row => row.userId === userId)
    const assignedTasks = state.data.items
      .filter(item => item.type === 'task' && item.assigneeId === userId && !item.deletedAt)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      })
    const notes = state.data.items
      .filter(item => item.type === 'note' && item.createdById === userId && item.status === 'active' && !item.deletedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3)
    return {
      member,
      memberIndex,
      role: membership?.role ?? 'member',
      activeTasks: assignedTasks.filter(item => item.status === 'active'),
      completedTasks: assignedTasks.filter(item => item.status === 'completed'),
      notes,
    }
  })

  if (!snapshot.member) {
    return (
      <ScreenShell title="Family member">
        <div className="member-profile member-profile-empty"><UserRound /><h2>Family member not found</h2><a href="/more">Back to the family</a></div>
      </ScreenShell>
    )
  }

  const member = snapshot.member
  const colour = snapshot.memberIndex % 2 ? '#F0A25A' : '#BE6B91'

  return (
    <ScreenShell title={member.name}>
      <div className="member-profile">
        <section className="member-profile-hero">
          <span style={{ background: colour }}>{member.name.slice(0, 1).toUpperCase()}</span>
          <div><small>THE COAKES FAMILY</small><h2>{member.name}</h2><p>{snapshot.role === 'owner' ? 'Household owner' : 'Family member'}</p></div>
        </section>

        <section className="member-profile-stats" aria-label={`${member.name}'s shared activity`}>
          <div><ListChecks /><strong>{snapshot.activeTasks.length}</strong><small>Tasks left</small></div>
          <div><CheckCircle2 /><strong>{snapshot.completedTasks.length}</strong><small>Completed</small></div>
          <div><FileText /><strong>{snapshot.notes.length}</strong><small>Recent notes</small></div>
        </section>

        <div className="family-section-heading member-profile-heading"><div><small>SHARED RESPONSIBILITIES</small><h2>Tasks</h2></div><a href="/household/tasks">See all</a></div>
        <section className="member-profile-list">
          {snapshot.activeTasks.slice(0, 5).map(task => (
            <a key={task.id} href="/household/tasks">
              <span className="member-task-icon"><Clock3 /></span>
              <div><strong>{task.title}</strong><small>{dueLabel(task.dueDate)}</small></div>
              <ChevronRight />
            </a>
          ))}
          {snapshot.activeTasks.length === 0 ? <div className="member-profile-none"><CheckCircle2 /><span><strong>All clear</strong><small>No shared tasks assigned right now.</small></span></div> : null}
        </section>

        <div className="family-section-heading member-profile-heading"><div><small>SHARED WITH THE FAMILY</small><h2>Recent notes</h2></div><a href="/notes">Open notes</a></div>
        <section className="member-profile-list">
          {snapshot.notes.map(note => (
            <a key={note.id} href="/notes"><span className="member-note-icon"><FileText /></span><div><strong>{note.title}</strong><small>{note.body?.trim() || 'Shared family note'}</small></div><ChevronRight /></a>
          ))}
          {snapshot.notes.length === 0 ? <div className="member-profile-none"><FileText /><span><strong>No recent notes</strong><small>Shared notes by {member.name} will appear here.</small></span></div> : null}
        </section>
      </div>
    </ScreenShell>
  )
}
