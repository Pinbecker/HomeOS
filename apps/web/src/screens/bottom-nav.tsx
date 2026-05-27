import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CalendarDays,
  CloudSun,
  Droplet,
  FileText,
  Grid3X3,
  House,
  Inbox,
  ListChecks,
  ShieldCheck,
  ShoppingBag,
  Tv,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'

type Tab = {
  href: string
  label: string
  exact?: boolean
  color: string
  icon: LucideIcon
}

type MenuItem = { href: string; label: string; color: string; icon: LucideIcon }

const leftTabs: Tab[] = [
  {
    href: '/',
    label: 'Home',
    exact: true,
    color: '#007AFF',
    icon: House,
  },
  {
    href: '/household/shopping',
    label: 'Shopping',
    color: '#34C759',
    icon: ShoppingBag,
  },
]

const rightTabs: Tab[] = [
  {
    href: '/calendar',
    label: 'Calendar',
    color: '#32ADE6',
    icon: CalendarDays,
  },
  {
    href: '/household/tasks',
    label: 'Tasks',
    color: '#FF9500',
    icon: ListChecks,
  },
]

const menuItems: MenuItem[] = [
  {
    href: '/life/admin',
    label: 'Vault',
    color: '#5856D6',
    icon: ShieldCheck,
  },
  {
    href: '/watch',
    label: 'Watch',
    color: 'var(--red)',
    icon: Tv,
  },
  {
    href: '/weather',
    label: 'Weather',
    color: '#32ADE6',
    icon: CloudSun,
  },
  {
    href: '/household',
    label: 'Household',
    color: 'var(--sage)',
    icon: Users,
  },
  {
    href: '/inbox',
    label: 'Inbox',
    color: 'var(--accent)',
    icon: Inbox,
  },
  {
    href: '/reminders',
    label: 'Reminders',
    color: 'var(--amber)',
    icon: Bell,
  },
  {
    href: '/cycle-tracker',
    label: 'Cycle',
    color: '#C04A7A',
    icon: Droplet,
  },
  {
    href: '/notes',
    label: 'Notes',
    color: '#5856D6',
    icon: FileText,
  },
]

const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_THRESHOLD = 90

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
      const keyboardCompressed = viewport ? viewport.height < window.innerHeight - 80 : false
      setHidden(coarsePointer && focusedTextEntry && (keyboardCompressed || window.innerWidth < 768))
    }

    update()
    window.addEventListener('focusin', update)
    window.addEventListener('focusout', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('focusin', update)
      window.removeEventListener('focusout', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])

  return hidden
}

function NavTab({ tab, active, onClick }: { tab: Tab; active: boolean; onClick?: () => void }) {
  const Icon = tab.icon

  return (
    <a href={tab.href} onClick={onClick} aria-label={tab.label} className="flex-1 flex items-center justify-center py-[10px]">
      <div
        className="w-[54px] h-[54px] flex items-center justify-center rounded-[17px] transition-all duration-200"
        style={{
          background: `color-mix(in srgb, ${tab.color} ${active ? 18 : 0}%, transparent)`,
          color: tab.color,
          opacity: active ? 1 : 0.45,
        }}
      >
        <Icon className="w-[26px] h-[26px]" strokeWidth={1.8} />
      </div>
    </a>
  )
}

export function BottomNav() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname
  const [open, setOpen] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<number | null>(null)
  const keyboardNavHidden = useKeyboardNavHidden()
  const hideNav = keyboardNavHidden && !open

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  function close() {
    setOpen(false)
    setDragY(0)
    setDragging(false)
    dragStartRef.current = null
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!keyboardNavHidden || !open) return
    close()
  }, [keyboardNavHidden, open])

  function onTouchStart(e: React.TouchEvent) {
    dragStartRef.current = e.touches[0].clientY
    setDragging(true)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragStartRef.current === null) return
    const delta = e.touches[0].clientY - dragStartRef.current
    setDragY(delta > 0 ? delta : delta * 0.25)
  }

  function onTouchEnd() {
    if (dragY > CLOSE_THRESHOLD) close()
    else {
      setDragY(0)
      setDragging(false)
      dragStartRef.current = null
    }
  }

  const menuLinks = useMemo(() => menuItems, [])
  const renderMenu = open || dragging || dragY > 0

  return (
    <>
      {renderMenu ? (
        <>
          <div
            className="fixed inset-x-0 bottom-0 z-40"
            style={{
              top: 'env(safe-area-inset-top)',
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              opacity: Math.max(0, 1 - dragY / 320),
              pointerEvents: open ? 'auto' : 'none',
              transition: dragging ? 'none' : 'opacity 0.4s ease',
            }}
            onClick={close}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quick menu"
            className="fixed inset-x-0 bottom-0 z-[60]"
            style={{
              transform: open ? `translateY(${dragY}px)` : 'translateY(110%)',
              transition: dragging ? 'none' : `transform 0.46s ${SHEET_EASE}`,
              pointerEvents: open ? 'auto' : 'none',
              willChange: 'transform',
            }}
          >
            <div
              className="mx-auto max-w-md bg-surface border-t border-border"
              style={{
                borderTopLeftRadius: 26,
                borderTopRightRadius: 26,
                boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 22px)',
              }}
            >
              <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ padding: '11px 0 4px', cursor: 'grab', touchAction: 'none' }}>
                <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--text-3)', opacity: 0.4, margin: '0 auto' }} />
              </div>
              <p className="text-center text-text-3" style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 16px', letterSpacing: '0.01em' }}>Jump to</p>
              <div className="grid grid-cols-3 gap-y-5 px-5" style={{ justifyItems: 'center' }}>
                {menuLinks.map((item, idx) => {
                  const Icon = item.icon

                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={close}
                      aria-label={item.label}
                      className="flex flex-col items-center gap-2 active:scale-90 transition-transform"
                      style={{
                        width: 84,
                        opacity: open ? 1 : 0,
                        transform: open ? 'translateY(0)' : 'translateY(14px)',
                        transition: `transform 0.5s ${SHEET_EASE} ${idx * 35 + 60}ms, opacity 0.4s ease ${idx * 35 + 60}ms`,
                      }}
                    >
                      <div style={{
                        width: 64, height: 64, borderRadius: 19,
                        background: `color-mix(in srgb, ${item.color} 14%, transparent)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: item.color,
                      }}>
                        <Icon className="w-[26px] h-[26px]" strokeWidth={1.8} />
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '0.01em' }}>{item.label}</span>
                    </a>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div
        className="fixed bottom-0 inset-x-0 z-50"
        style={{
          background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.10)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          opacity: hideNav ? 0 : 1,
          pointerEvents: hideNav ? 'none' : 'auto',
          transform: hideNav ? 'translateY(calc(100% + env(safe-area-inset-bottom) + 12px))' : 'translateY(0)',
          transition: 'transform 0.22s ease, opacity 0.18s ease',
        }}
      >
        <div className="flex items-center max-w-lg mx-auto" style={{ paddingLeft: 4, paddingRight: 4 }}>
          {leftTabs.map(tab => (
            <NavTab key={tab.href} tab={tab} active={isActive(tab.href, tab.exact)} onClick={close} />
          ))}

          <div className="flex-1 flex items-center justify-center py-[10px]">
            <button
              onClick={() => (open ? close() : setOpen(true))}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="active:scale-90 transition-transform"
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: open ? `color-mix(in srgb, var(--accent) 20%, var(--surface))` : 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: open ? 'none' : '0 3px 12px color-mix(in srgb, var(--accent) 18%, transparent)',
                transition: 'background 0.22s ease, box-shadow 0.22s ease',
              }}
            >
              <span style={{ position: 'relative', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Grid3X3
                  color="white"
                  size={20}
                  strokeWidth={2.2}
                  style={{
                    position: 'absolute',
                    opacity: open ? 0 : 1,
                    transform: open ? 'scale(0.6) rotate(-45deg)' : 'scale(1) rotate(0deg)',
                    transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                />
                <X
                  color={open ? 'var(--accent)' : 'white'}
                  size={20}
                  strokeWidth={2.4}
                  style={{
                    position: 'absolute',
                    opacity: open ? 1 : 0,
                    transform: open ? 'scale(1) rotate(0deg)' : 'scale(0.6) rotate(45deg)',
                    transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                />
              </span>
            </button>
          </div>

          {rightTabs.map(tab => (
            <NavTab key={tab.href} tab={tab} active={isActive(tab.href, tab.exact)} onClick={close} />
          ))}
        </div>
      </div>
    </>
  )
}
