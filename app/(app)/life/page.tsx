import Link from 'next/link'
import { requireSession } from '@/lib/auth/session'

export default async function LifePage() {
  await requireSession()

  const sections = [
    {
      href: '/life/admin',
      label: 'Records & Admin',
      icon: '📋',
      color: '#5856D6',
      desc: 'Documents, insurance, utilities & accounts',
    },
    {
      href: '/life/plans',
      label: 'Plans & Trips',
      icon: '✈️',
      color: '#007AFF',
      desc: 'Holiday ideas, day trips & adventures',
    },
  ]

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-extrabold text-text-1 tracking-tight">Life</h1>
      </header>
      <div className="mx-4 flex flex-col gap-[5px]">
        {sections.map(s => (
          <Link key={s.href} href={s.href}
            className="bg-surface border border-border rounded-2xl px-4 py-4 flex items-center gap-4 active:opacity-70 transition-opacity"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${s.color}1F` }}>
              {s.icon}
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-semibold text-text-1">{s.label}</p>
              <p className="text-[12px] text-text-2">{s.desc}</p>
            </div>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-text-3 shrink-0">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </Link>
        ))}
      </div>
      <div className="h-4" />
    </div>
  )
}
