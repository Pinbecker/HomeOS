import Link from 'next/link'

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export default async function HouseholdPage() {
  const sections = [
    {
      href: '/household/bins',
      label: 'Bins',
      desc: 'Collection schedule',
      color: '#34C759',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      ),
    },
    {
      href: '/household/meals',
      label: 'Meals',
      desc: 'Meal ideas & planner',
      color: '#FF9500',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      ),
    },
    {
      href: '/household/plans',
      label: 'House Plans',
      desc: 'Projects & improvements',
      color: '#5856D6',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[16px] h-[16px]">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[28px] font-bold text-text-1 tracking-tight">Household</h1>
      </header>
      <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
        {sections.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className={`flex items-center gap-3 px-4 py-3 active:bg-surface-2 ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: s.color }}>
              {s.icon}
            </div>
            <div className="flex-1">
              <p className="text-[16px] font-medium text-text-1">{s.label}</p>
              <p className="text-[12px] text-text-2">{s.desc}</p>
            </div>
            <Chevron />
          </Link>
        ))}
      </div>
      <div className="h-4" />
    </div>
  )
}
