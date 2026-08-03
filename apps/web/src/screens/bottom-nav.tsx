import { useEffect, useState } from 'react'
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  CircleDot,
  Clapperboard,
  CloudSun,
  Droplet,
  FileText,
  Grid2X2,
  Home,
  Inbox,
  ListChecks,
  NotebookPen,
  PackageCheck,
  ShoppingBasket,
  Trash2,
  Tv,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react'

type LinkItem = { href: string; label: string; color: string; icon: LucideIcon }

const drawerGroups: Array<{ label: string; items: LinkItem[] }> = [
  {
    label: 'Everyday',
    items: [
      { href: '/', label: 'Home', color: '#2787D8', icon: Home },
      { href: '/calendar', label: 'Calendar', color: '#2787D8', icon: CalendarDays },
      { href: '/household/tasks', label: 'Tasks', color: '#EF9B2D', icon: ListChecks },
      { href: '/household/shopping', label: 'Shopping', color: '#49A96F', icon: ShoppingBasket },
      { href: '/household/shopping/meals', label: 'Meals', color: '#E36574', icon: Utensils },
      { href: '/inbox', label: 'Capture', color: '#7D73D8', icon: Inbox },
      { href: '/notes', label: 'Notes', color: '#D5A22D', icon: NotebookPen },
    ],
  },
  {
    label: 'Home & family',
    items: [
      { href: '/household', label: 'Household', color: '#2EA7A0', icon: Users },
      { href: '/life/admin', label: 'Vault', color: '#6471C9', icon: FileText },
      { href: '/reminders', label: 'Reminders', color: '#E17055', icon: Bell },
      { href: '/household/bins', label: 'Bins', color: '#4D8E74', icon: Trash2 },
      { href: '/household/plans', label: 'House plans', color: '#A26D45', icon: PackageCheck },
      { href: '/more', label: 'More', color: '#2EA7A0', icon: Grid2X2 },
    ],
  },
  {
    label: 'Weather & entertainment',
    items: [
      { href: '/weather', label: 'Weather', color: '#47A5D9', icon: CloudSun },
      { href: '/watch', label: 'Watch', color: '#DC3B42', icon: Tv },
      { href: '/media', label: 'Media', color: '#AF52DE', icon: Clapperboard },
    ],
  },
  {
    label: 'Personal',
    items: [
      { href: '/cycle-tracker', label: 'Cycle', color: '#C04A7A', icon: Droplet },
      { href: '/ulcer-tracker', label: 'Ulcers', color: '#E25555', icon: CircleDot },
    ],
  },
]

const drawerItems = drawerGroups.flatMap(group => group.items)

function activeDrawerHref(pathname: string) {
  if (pathname.startsWith('/life/')) return '/life/admin'
  return drawerItems
    .filter(item => item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
}

function isTextEntryElement(element: Element | null) {
  if (!element) return false
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !['button', 'checkbox', 'color', 'date', 'datetime-local', 'file', 'hidden', 'image', 'month', 'radio', 'range', 'reset', 'submit', 'time', 'week'].includes(element.type)
}

function useKeyboardNavHidden() {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const update = () => {
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
      const focusedTextEntry = isTextEntryElement(document.activeElement)
      const viewport = window.visualViewport
      setHidden(coarsePointer && focusedTextEntry && Boolean(viewport && viewport.height < window.innerHeight - 80))
    }
    update()
    window.addEventListener('focusin', update)
    window.addEventListener('focusout', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('focusin', update)
      window.removeEventListener('focusout', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])
  return hidden
}

function TabLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return <a href={href} className={`family-nav-tab ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}><Icon /><span>{label}</span></a>
}

function DrawerLink({ item, active, close }: { item: LinkItem; active: boolean; close: () => void }) {
  const Icon = item.icon
  return <a href={item.href} onClick={close} className={active ? 'is-active' : ''}><Icon style={{ color: item.color }} /><span>{item.label}</span>{active ? <i /> : null}</a>
}

export function BottomNav() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
  const [open, setOpen] = useState(false)
  const keyboardHidden = useKeyboardNavHidden()
  const mainRoute = pathname === '/' || pathname.startsWith('/calendar') || pathname.startsWith('/household/shopping')
  const activeHref = activeDrawerHref(pathname)

  useEffect(() => {
    const openMenu = () => setOpen(true)
    window.addEventListener('homeos:open-menu', openMenu)
    return () => window.removeEventListener('homeos:open-menu', openMenu)
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey) }
  }, [open])

  const close = () => setOpen(false)
  return (
    <>
      <div className={`family-drawer-wrap ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <button type="button" className="family-drawer-scrim" onClick={close} aria-label="Close navigation" />
        <aside className="family-drawer" aria-label="HOME•OS navigation">
          <div className="family-drawer-family">
            <button type="button" onClick={close} aria-label="Close navigation"><X /></button>
            <span><Users /></span>
            <div><strong>The Coakes Family</strong><small>Dan & Imogen</small></div>
          </div>
          <p className="family-drawer-brand">HOME•OS</p>
          {drawerGroups.map(group => (
            <section key={group.label} className="family-drawer-section">
              <p className="family-drawer-label">{group.label}</p>
              <nav className="family-drawer-links">{group.items.map(item => <DrawerLink key={item.href} item={item} active={item.href === activeHref} close={close} />)}</nav>
            </section>
          ))}
          <a className="family-drawer-designs" href="/designs"><ChevronLeft /> Review original designs</a>
        </aside>
      </div>

      <nav className={`family-bottom-nav ${keyboardHidden ? 'is-hidden' : ''}`} aria-label="Primary navigation">
        <div className="family-bottom-nav-inner">
          <TabLink href="/" label="Home" icon={Home} active={pathname === '/'} />
          <TabLink href="/calendar" label="Calendar" icon={CalendarDays} active={pathname.startsWith('/calendar')} />
          <TabLink href="/household/shopping" label="Shopping" icon={ShoppingBasket} active={pathname.startsWith('/household/shopping')} />
          <TabLink href="/more" label="More" icon={Grid2X2} active={!mainRoute} />
        </div>
      </nav>
    </>
  )
}
