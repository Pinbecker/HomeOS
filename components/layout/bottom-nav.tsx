'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      {children}
    </svg>
  )
}

function MenuIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
      {children}
    </svg>
  )
}

type Tab = { href: string; label: string; exact?: boolean; icon: React.ReactNode }
type MenuItem = { href: string; label: string; color: string; icon: React.ReactNode }

const leftTabs: Tab[] = [
  {
    href: '/',
    label: 'Home',
    exact: true,
    icon: (
      <NavIcon>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </NavIcon>
    ),
  },
  {
    href: '/household/shopping',
    label: 'Shopping',
    icon: (
      <NavIcon>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </NavIcon>
    ),
  },
]

const rightTabs: Tab[] = [
  {
    href: '/household/tasks',
    label: 'Tasks',
    icon: (
      <NavIcon>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </NavIcon>
    ),
  },
  {
    href: '/life',
    label: 'Life',
    icon: (
      <NavIcon>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </NavIcon>
    ),
  },
]

const menuItems: MenuItem[] = [
  {
    href: '/calendar',
    label: 'Calendar',
    color: '#32ADE6',
    icon: (
      <MenuIcon>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
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

// iOS sheet easing — fast out, gentle settle. Matches UISheetPresentationController.
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_THRESHOLD = 90 // px dragged down before release dismisses

export function BottomNav() {
  const pathname = usePathname()
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

  // Lock background scroll + close on Escape while the sheet is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
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
    // Only follow downward drags; a touch of resistance on the upward edge.
    setDragY(delta > 0 ? delta : delta * 0.25)
  }

  function onTouchEnd() {
    if (dragY > CLOSE_THRESHOLD) {
      close()
    } else {
      setDragY(0)
      setDragging(false)
      dragStartRef.current = null
    }
  }

  return (
    <>
      {/* Backdrop */}
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

      {/* Bottom sheet */}
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
          {/* Grabber — drag down to dismiss */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{ padding: '11px 0 4px', cursor: 'grab', touchAction: 'none' }}
          >
            <div
              style={{
                width: 38,
                height: 5,
                borderRadius: 3,
                background: 'var(--text-3)',
                opacity: 0.4,
                margin: '0 auto',
              }}
            />
          </div>

          <p
            className="text-center text-text-3"
            style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 16px', letterSpacing: '0.01em' }}
          >
            Jump to
          </p>

          <div
            className="grid grid-cols-3 gap-y-5 px-5"
            style={{ justifyItems: 'center' }}
          >
            {menuItems.map((item, idx) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-label={item.label}
                className="flex flex-col items-center gap-2 active:scale-90"
                style={{
                  width: 84,
                  // Staggered rise-and-fade as the sheet settles.
                  opacity: open ? 1 : 0,
                  transform: open ? 'translateY(0)' : 'translateY(14px)',
                  transition: `transform 0.5s ${SHEET_EASE} ${idx * 35 + 60}ms, opacity 0.4s ease ${idx * 35 + 60}ms`,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 19,
                    background: `color-mix(in srgb, ${item.color} 14%, transparent)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: item.color,
                    transition: 'transform 0.15s ease',
                  }}
                >
                  {item.icon}
                </div>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--text-1)',
                    letterSpacing: '0.01em',
                  }}
                >
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <nav
        className="fixed bottom-0 inset-x-0 z-50 bg-nav-bg backdrop-blur-2xl border-t border-border pb-[calc(env(safe-area-inset-bottom)+10px)]"
        style={{ overflow: 'visible' }}
      >
        <div className="flex items-start pt-2 pb-1 px-1" style={{ overflow: 'visible' }}>

          {/* Left tabs */}
          {leftTabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={close}
              className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
                isActive(tab.href, tab.exact) ? 'text-accent' : 'text-text-3'
              }`}
            >
              {tab.icon}
              <span className="text-[9.5px] font-semibold tracking-wide">{tab.label}</span>
            </Link>
          ))}

          {/* Centre: menu button */}
          <div className="flex-1 flex flex-col items-center" style={{ overflow: 'visible' }}>
            <div style={{ position: 'relative', width: 46, height: 46, marginTop: -18, flexShrink: 0 }}>
              <button
                onClick={() => (open ? close() : setOpen(true))}
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 14,
                  background: open ? 'var(--surface-2)' : 'var(--accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: open
                    ? '0 2px 8px rgba(0,0,0,0.15)'
                    : '0 4px 14px rgba(0,122,255,0.35)',
                  transition: 'background 0.22s ease, box-shadow 0.22s ease',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={open ? 'var(--text-1)' : 'white'}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    width: 20,
                    height: 20,
                    transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                    transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            <span
              className="text-[9.5px] font-semibold tracking-wide"
              style={{ color: open ? 'var(--accent)' : 'var(--text-3)', transition: 'color 0.2s ease' }}
            >
              More
            </span>
          </div>

          {/* Right tabs */}
          {rightTabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={close}
              className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
                isActive(tab.href, tab.exact) ? 'text-accent' : 'text-text-3'
              }`}
            >
              {tab.icon}
              <span className="text-[9.5px] font-semibold tracking-wide">{tab.label}</span>
            </Link>
          ))}

        </div>
      </nav>
    </>
  )
}
