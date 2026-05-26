import type { ReactNode } from 'react'
import { useSessionState } from '../lib/session-store'
import { BottomNav } from './bottom-nav'
import { LoginPage } from './shared'

export function ScreenShell({ title, children }: { title: string; children: ReactNode }) {
  const sessionState = useSessionState(state => state)

  if (sessionState.status === 'loading') {
    return <div className="min-h-dvh flex items-center justify-center bg-bg text-text-2">Loading…</div>
  }

  if (sessionState.status !== 'authenticated') {
    return <LoginPage />
  }

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="safe-top px-5 pt-6 pb-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-2">HomeOS</p>
          <h1 className="mt-1 text-[32px] font-bold text-text-1">{title}</h1>
        </header>
        <main className="flex-1 pb-28">{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
