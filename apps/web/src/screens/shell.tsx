import type { ReactNode } from 'react'
import { ChevronLeft, Home, Menu } from 'lucide-react'
import { useSessionState } from '../lib/session-store'
import { useAppMainScrollRestoration } from '../lib/scroll-restoration'
import { BottomNav } from './bottom-nav'
import { LoginPage } from './shared'

export function FamilyMenuButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      className={`family-header-control family-menu-button ${className}`}
      onClick={() => window.dispatchEvent(new Event('homeos:open-menu'))}
      aria-label="Open navigation"
    >
      <Menu />
    </button>
  )
}

export function ScreenShell({ title, children, showHeader = true, topContent, contentClassName = 'flex-1 pb-28' }: { title: string; children: ReactNode; showHeader?: boolean; topContent?: ReactNode; contentClassName?: string }) {
  const sessionState = useSessionState(state => state)
  const { elementRef, restorationId } = useAppMainScrollRestoration()

  if (sessionState.status === 'loading') {
    return <div className="min-h-dvh flex items-center justify-center bg-bg text-text-2">Loading…</div>
  }

  if (sessionState.status !== 'authenticated') {
    return <LoginPage />
  }

  return (
    <div className="app-shell bg-bg">
      <div className={`app-frame mx-auto flex max-w-lg flex-col ${showHeader ? 'has-family-header' : ''}`}>
        {showHeader ? (
          <header className="app-header family-page-header">
            <FamilyMenuButton />
            <div>
              <p>THE COAKES FAMILY</p>
              <h1>{title}</h1>
            </div>
            <a href="/" className="family-header-control" aria-label="Home"><Home /></a>
          </header>
        ) : null}
        {topContent ? <div className="app-top">{topContent}</div> : null}
        <main ref={elementRef} data-scroll-restoration-id={restorationId} className={`app-main ${contentClassName}`}>{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}

export function FamilySubHeader({ title, backHref, backLabel, action }: { title: string; backHref: string; backLabel: string; action?: ReactNode }) {
  return (
    <header className="family-sub-header">
      <a href={backHref} aria-label={`Back to ${backLabel}`}><ChevronLeft /><span>{backLabel}</span></a>
      <strong>{title}</strong>
      <div>{action}</div>
    </header>
  )
}
