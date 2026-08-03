import {
  Bell,
  CalendarDays,
  ChevronRight,
  CloudSun,
  FileText,
  Home,
  Inbox,
  ListChecks,
  NotebookPen,
  PackageCheck,
  ShoppingBasket,
  Trash2,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import { useAppState } from '../lib/app-store'
import { ScreenShell } from './shell'

type MoreFeature = { href: string; label: string; sub: string; color: string; soft: string; icon: LucideIcon }

export function MorePage() {
  const snapshot = useAppState(state => {
    const taskCount = state.data.items.filter(item => item.type === 'task' && item.status === 'active' && !item.deletedAt).length
    const noteCount = state.data.items.filter(item => item.type === 'note' && item.status === 'active' && !item.deletedAt).length
    const inboxCount = state.data.items.filter(item => item.type === 'inbox' && item.status === 'active' && !item.deletedAt).length
    const shoppingCount = state.data.listItems.filter(item => !item.checked && !item.deletedAt).length
    const reminderCount = state.data.reminders.filter(item => !item.dismissedAt).length
    return { taskCount, noteCount, inboxCount, shoppingCount, reminderCount, recordCount: state.data.records.length, users: state.data.users }
  })

  const features: MoreFeature[] = [
    { href: '/calendar', label: 'Calendar', sub: 'Family schedule', color: '#2787D8', soft: '#E5F3FF', icon: CalendarDays },
    { href: '/household/tasks', label: 'Tasks', sub: `${snapshot.taskCount} left to do`, color: '#EF9B2D', soft: '#FFF2DF', icon: ListChecks },
    { href: '/household/shopping', label: 'Shopping', sub: `${snapshot.shoppingCount} items`, color: '#49A96F', soft: '#E5F6EB', icon: ShoppingBasket },
    { href: '/household/shopping/meals', label: 'Meals', sub: 'Plan this week', color: '#E36574', soft: '#FFE9ED', icon: Utensils },
    { href: '/inbox', label: 'Capture', sub: `${snapshot.inboxCount} to organise`, color: '#7D73D8', soft: '#EEEBFF', icon: Inbox },
    { href: '/notes', label: 'Notes', sub: `${snapshot.noteCount} shared notes`, color: '#D5A22D', soft: '#FFF5D8', icon: NotebookPen },
    { href: '/household', label: 'Household', sub: 'Home at a glance', color: '#2EA7A0', soft: '#E2F7F5', icon: Home },
    { href: '/life/admin', label: 'Vault', sub: `${snapshot.recordCount} records`, color: '#6471C9', soft: '#E9EBFF', icon: FileText },
    { href: '/weather', label: 'Weather', sub: 'Forecasts & places', color: '#47A5D9', soft: '#E5F5FF', icon: CloudSun },
    { href: '/reminders', label: 'Reminders', sub: `${snapshot.reminderCount} coming up`, color: '#E17055', soft: '#FFEBE5', icon: Bell },
    { href: '/household/bins', label: 'Bins', sub: 'Collection schedule', color: '#4D8E74', soft: '#E4F2EC', icon: Trash2 },
    { href: '/household/plans', label: 'House plans', sub: 'Projects & ideas', color: '#A26D45', soft: '#F7ECE2', icon: PackageCheck },
  ]

  return (
    <ScreenShell title="More">
      <div className="more-dashboard">
        <section className="more-home-hero"><div><small>OUR HOME</small><strong>Good to see you</strong><span>Everything for family life, in one place.</span></div><Home /></section>

        <div className="more-status-row">
          <a href="/household/bins"><span className="bins"><Trash2 /></span><div><small>COLLECTIONS</small><strong>Bins</strong><p>View the next collection</p></div><ChevronRight /></a>
          <a href="/reminders"><span className="reminders"><Bell /></span><div><small>COMING UP</small><strong>{snapshot.reminderCount} reminders</strong><p>Renewals and important dates</p></div><ChevronRight /></a>
        </div>

        <div className="family-section-heading more-heading"><div><small>EVERYTHING TOGETHER</small><h2>Family tools</h2></div></div>
        <div className="family-feature-grid more-feature-grid">
          {features.map(feature => { const Icon = feature.icon; return <a key={feature.href} href={feature.href} className="family-feature-card"><span style={{ color: feature.color, background: feature.soft }}><Icon /></span><strong>{feature.label}</strong><small>{feature.sub}</small></a> })}
        </div>

        <div className="family-section-heading more-heading"><div><small>THE COAKES FAMILY</small><h2>Family members</h2></div></div>
        <div className="more-family-members">
          {snapshot.users.slice(0, 4).map((user, index) => <a key={user.id} href={`/members/${encodeURIComponent(user.id)}`}><span style={{ background: index % 2 ? '#BE6B91' : '#F0A25A' }}>{user.name?.slice(0, 1).toUpperCase() ?? '?'}</span><div><strong>{user.name ?? 'Family member'}</strong><small>View shared profile</small></div><ChevronRight /></a>)}
          {snapshot.users.length === 0 ? <div><span><Users /></span><div><strong>Dan & Imogen</strong><small>The Coakes Family</small></div></div> : null}
        </div>
      </div>
    </ScreenShell>
  )
}
