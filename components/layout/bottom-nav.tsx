'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NavIcon = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="w-[22px] h-[22px]"
  >
    {children}
  </svg>
)

const tabs = [
  {
    href: '/',
    label: 'Home',
    icon: (
      <NavIcon>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </NavIcon>
    ),
  },
  {
    href: '/household',
    label: 'Household',
    icon: (
      <NavIcon>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </NavIcon>
    ),
  },
  {
    href: '/watch',
    label: 'Watch',
    icon: (
      <NavIcon>
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="2" y1="7" x2="7" y2="7" />
        <line x1="2" y1="17" x2="7" y2="17" />
        <line x1="17" y1="7" x2="22" y2="7" />
        <line x1="17" y1="17" x2="22" y2="17" />
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

export function BottomNav() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-nav-bg backdrop-blur-2xl border-t border-border pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="flex items-start pt-2 pb-1 px-1">

        {/* Home */}
        <Link href={tabs[0].href} className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${isActive(tabs[0].href) ? 'text-accent' : 'text-text-3'}`}>
          {tabs[0].icon}
          <span className="text-[9.5px] font-semibold tracking-wide">{tabs[0].label}</span>
        </Link>

        {/* Household */}
        <Link href={tabs[1].href} className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${isActive(tabs[1].href) ? 'text-accent' : 'text-text-3'}`}>
          {tabs[1].icon}
          <span className="text-[9.5px] font-semibold tracking-wide">{tabs[1].label}</span>
        </Link>

        {/* Capture — centre, raised */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <Link
            href="/inbox/capture"
            className="w-[46px] h-[46px] bg-accent rounded-[15px] flex items-center justify-center shadow-lg shadow-accent/30 -mt-[18px] active:scale-95 transition-transform"
            aria-label="Capture"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Link>
          <span className="text-[9.5px] font-semibold tracking-wide text-accent">Capture</span>
        </div>

        {/* Watch */}
        <Link href={tabs[2].href} className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${isActive(tabs[2].href) ? 'text-accent' : 'text-text-3'}`}>
          {tabs[2].icon}
          <span className="text-[9.5px] font-semibold tracking-wide">{tabs[2].label}</span>
        </Link>

        {/* Life */}
        <Link href={tabs[3].href} className={`flex-1 flex flex-col items-center gap-1 py-1 transition-colors ${isActive(tabs[3].href) ? 'text-accent' : 'text-text-3'}`}>
          {tabs[3].icon}
          <span className="text-[9.5px] font-semibold tracking-wide">{tabs[3].label}</span>
        </Link>

      </div>
    </nav>
  )
}
