'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      {children}
    </svg>
  )
}

function RadialIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className="w-[21px] h-[21px]">
      {children}
    </svg>
  )
}

type Tab = { href: string; label: string; exact?: boolean; icon: React.ReactNode }
type RadialItem = { href: string; label: string; angle: number; bg: string; icon: React.ReactNode }

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
    href: '/household/tasks',
    label: 'Tasks',
    icon: (
      <NavIcon>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </NavIcon>
    ),
  },
]

const rightTabs: Tab[] = [
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

// Angles use standard math trig convention (ccw from positive-x, so 270° = straight up in screen).
// Spread: 215° → 325° gives a clean upper semicircle with clear separation at R=120.
const radialItems: RadialItem[] = [
  {
    href: '/watch',
    label: 'Watch',
    angle: 215,
    bg: '#FF3B30',
    icon: (
      <RadialIcon>
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </RadialIcon>
    ),
  },
  {
    href: '/household',
    label: 'Household',
    angle: 243,
    bg: '#34C759',
    icon: (
      <RadialIcon>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </RadialIcon>
    ),
  },
  {
    href: '/inbox',
    label: 'Inbox',
    angle: 270,
    bg: '#007AFF',
    icon: (
      <RadialIcon>
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </RadialIcon>
    ),
  },
  {
    href: '/calendar',
    label: 'Calendar',
    angle: 297,
    bg: '#FF9500',
    icon: (
      <RadialIcon>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </RadialIcon>
    ),
  },
  {
    href: '/life/plans',
    label: 'Plans',
    angle: 325,
    bg: '#5856D6',
    icon: (
      <RadialIcon>
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </RadialIcon>
    ),
  },
]

// Open stagger: center item (Inbox) first, outer items last
const OPEN_DELAYS = [50, 25, 0, 25, 50]
const RADIUS = 120

function radialPos(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: Math.round(Math.cos(rad) * r),
    y: Math.round(Math.sin(rad) * r),
  }
}

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function isActive(href: string, exact = false) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  function navigate(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0,0,0,0.48)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.22s ease',
        }}
        onClick={() => setOpen(false)}
      />

      <nav
        className="fixed bottom-0 inset-x-0 z-50 bg-nav-bg backdrop-blur-2xl border-t border-border pb-[calc(env(safe-area-inset-bottom)+10px)]"
        style={{ overflow: 'visible' }}
      >
        <div className="flex items-start pt-2 pb-1 px-1" style={{ overflow: 'visible' }}>

          {/* Left tabs: Home, Tasks */}
          {leftTabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
              className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${
                isActive(tab.href, tab.exact) ? 'text-accent' : 'text-text-3'
              }`}
            >
              {tab.icon}
              <span className="text-[9.5px] font-semibold tracking-wide">{tab.label}</span>
            </Link>
          ))}

          {/* Centre: radial menu button */}
          <div className="flex-1 flex flex-col items-center" style={{ overflow: 'visible' }}>
            <div
              style={{
                position: 'relative',
                width: 46,
                height: 46,
                marginTop: -18,
                overflow: 'visible',
                flexShrink: 0,
              }}
            >
              {/* Radial items fan out from button center */}
              {radialItems.map((item, idx) => {
                const { x, y } = radialPos(item.angle, RADIUS)
                return (
                  <button
                    key={item.href}
                    onClick={() => navigate(item.href)}
                    aria-label={item.label}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      transform: open
                        ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`
                        : `translate(-50%, -50%) scale(0.25)`,
                      opacity: open ? 1 : 0,
                      transition: open
                        ? `transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) ${OPEN_DELAYS[idx]}ms, opacity 0.18s ease ${OPEN_DELAYS[idx]}ms`
                        : 'transform 0.18s ease, opacity 0.14s ease',
                      pointerEvents: open ? 'auto' : 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: item.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 3px 10px ${item.bg}4D`,
                      }}
                    >
                      {item.icon}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: '#fff',
                        textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                        whiteSpace: 'nowrap',
                        lineHeight: 1,
                        letterSpacing: '0.01em',
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                )
              })}

              {/* The center button itself */}
              <button
                onClick={() => setOpen(o => !o)}
                aria-label={open ? 'Close menu' : 'Open menu'}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 14,
                  background: open ? '#3A3A3C' : '#007AFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: open
                    ? '0 2px 8px rgba(0,0,0,0.35)'
                    : '0 3px 12px rgba(0,122,255,0.45)',
                  transition: 'background 0.22s ease, box-shadow 0.22s ease',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    width: 20,
                    height: 20,
                    transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  }}
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            <span
              className="text-[9.5px] font-semibold tracking-wide"
              style={{ color: open ? '#007AFF' : '#8E8E93', transition: 'color 0.2s ease' }}
            >
              More
            </span>
          </div>

          {/* Right tabs: Shopping, Life */}
          {rightTabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setOpen(false)}
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
