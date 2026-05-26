import { useEffect, useMemo, useRef, useState } from 'react'

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[26px] h-[26px]">
      {children}
    </svg>
  )
}

function MenuIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-[26px] h-[26px]">
      {children}
    </svg>
  )
}

type Tab = {
  href: string
  label: string
  exact?: boolean
  color: string
  icon: React.ReactNode
}

type MenuItem = { href: string; label: string; color: string; icon: React.ReactNode }

const leftTabs: Tab[] = [
  {
    href: '/',
    label: 'Home',
    exact: true,
    color: '#007AFF',
    icon: (
      <NavIcon>
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </NavIcon>
    ),
  },
  {
    href: '/household/shopping',
    label: 'Shopping',
    color: '#34C759',
    icon: (
      <NavIcon>
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </NavIcon>
    ),
  },
]

const rightTabs: Tab[] = [
  {
    href: '/calendar',
    label: 'Calendar',
    color: '#32ADE6',
    icon: (
      <NavIcon>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </NavIcon>
    ),
  },
  {
    href: '/household/tasks',
    label: 'Tasks',
    color: '#FF9500',
    icon: (
      <NavIcon>
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <polyline points="9 12 11 14 15 10" />
      </NavIcon>
    ),
  },
]

const menuItems: MenuItem[] = [
  {
    href: '/life/admin',
    label: 'Vault',
    color: '#5856D6',
    icon: (
      <MenuIcon>
        <rect x="3" y="2" width="16" height="20" rx="2" />
        <circle cx="11" cy="12" r="4.5" />
        <circle cx="11" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <path d="M11 8v1.5M11 14.5V16M7.5 12H9M13 12h1.5" />
        <path d="M19 9v6" strokeWidth={2.2} strokeLinecap="round" />
      </MenuIcon>
    ),
  },
  {
    href: '/watch',
    label: 'Watch',
    color: 'var(--red)',
    icon: (
      <MenuIcon>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </MenuIcon>
    ),
  },
  {
    href: '/household',
    label: 'Household',
    color: 'var(--sage)',
    icon: (
      <MenuIcon>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </MenuIcon>
    ),
  },
  {
    href: '/inbox',
    label: 'Inbox',
    color: 'var(--accent)',
    icon: (
      <MenuIcon>
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </MenuIcon>
    ),
  },
  {
    href: '/reminders',
    label: 'Reminders',
    color: 'var(--amber)',
    icon: (
      <MenuIcon>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </MenuIcon>
    ),
  },
  {
    href: '/notes',
    label: 'Notes',
    color: '#5856D6',
    icon: (
      <MenuIcon>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </MenuIcon>
    ),
  },
]

const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_THRESHOLD = 90

function NavTab({ tab, active, onClick }: { tab: Tab; active: boolean; onClick?: () => void }) {
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
        {tab.icon}
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

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: open ? Math.max(0, 1 - dragY / 320) : 0,
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
            {menuLinks.map((item, idx) => (
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
                  {item.icon}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '0.01em' }}>{item.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>

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
                boxShadow: open ? 'none' : '0 6px 24px color-mix(in srgb, var(--accent) 55%, transparent)',
                transition: 'background 0.22s ease, box-shadow 0.22s ease',
              }}
            >
              <span style={{ position: 'relative', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg
                  viewBox="0 0 22 22"
                  fill="white"
                  width={20}
                  height={20}
                  style={{
                    position: 'absolute',
                    opacity: open ? 0 : 1,
                    transform: open ? 'scale(0.6) rotate(-45deg)' : 'scale(1) rotate(0deg)',
                    transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <circle cx="5" cy="5" r="2" /><circle cx="11" cy="5" r="2" /><circle cx="17" cy="5" r="2" />
                  <circle cx="5" cy="11" r="2" /><circle cx="11" cy="11" r="2" /><circle cx="17" cy="11" r="2" />
                  <circle cx="5" cy="17" r="2" /><circle cx="11" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
                </svg>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={open ? 'var(--accent)' : 'white'}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  width={20}
                  height={20}
                  style={{
                    position: 'absolute',
                    opacity: open ? 1 : 0,
                    transform: open ? 'scale(1) rotate(0deg)' : 'scale(0.6) rotate(45deg)',
                    transition: 'opacity 0.22s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
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
