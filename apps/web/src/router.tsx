import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ensureBootstrap, useAppState } from './lib/app-store'
import { ensureSession, useSessionState } from './lib/session-store'
import { DashboardPage } from './screens/dashboard'
import { BottomNav } from './screens/bottom-nav'
import { CalendarPage } from './screens/calendar'
import { BinsPage, HouseholdPage, HousePlansPage } from './screens/household'
import { InboxCapturePage, InboxPage } from './screens/inbox'
import { LifeCategoryPage, LifeEntityPage, LifeOverviewPage } from './screens/life'
import { NotesPage } from './screens/notes'
import { RemindersPage } from './screens/reminders'
import { ShoppingDetailPage, ShoppingOverviewPage } from './screens/shopping'
import { LoginPage } from './screens/shared'
import { TaskDetailPage, TasksOverviewPage } from './screens/tasks'
import { WatchPage } from './screens/watch'

function RootLayout() {
  const syncState = useAppState(state => state.error ? 'error' : state.syncing ? 'syncing' : 'idle')
  const sessionStatus = useSessionState(state => state.status)

  useEffect(() => {
    ensureSession().catch(() => undefined)
    return undefined
  }, [])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return undefined
    ensureBootstrap().catch(() => undefined)
    return undefined
  }, [sessionStatus])

  return (
    <div className="min-h-dvh bg-bg text-text-1">
      <div className="safe-top fixed inset-x-0 top-0 z-50 pointer-events-none">
        <div className="mx-auto max-w-lg px-4 pt-2">
          {syncState !== 'idle' && (
            <div className={`rounded-full border px-3 py-2 text-[12px] font-medium backdrop-blur ${
              syncState === 'error'
                ? 'border-amber-border bg-amber-bg text-amber'
                : 'border-accent-border bg-accent-bg text-accent'
            }`}>
              {syncState === 'error' ? 'Offline data sync paused' : 'Syncing changes…'}
            </div>
          )}
        </div>
      </div>
      <Outlet />
    </div>
  )
}

function AppShell({ title }: { title: string }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
        <header className="safe-top px-5 pt-6 pb-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-2">HomeOS</p>
          <h1 className="mt-1 text-[32px] font-bold text-text-1">{title}</h1>
        </header>
        <main className="flex-1 px-4 pb-28">
          <div className="rounded-2xl border border-border bg-surface px-5 py-6 shadow-sm">
            <p className="text-[15px] font-semibold text-text-1">Offline-first rebuild in progress</p>
            <p className="mt-2 text-[14px] leading-6 text-text-2">
              This route is now on the new PWA shell and preserves the final URL structure. The next porting pass will
              replace this placeholder with the existing view and local-first data flow.
            </p>
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  )
}

function ProtectedPage({ title }: { title: string }) {
  const sessionStatus = useSessionState(state => state.status)
  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bg text-text-2">Loading…</div>
    )
  }
  if (sessionStatus !== 'authenticated') {
    return <LoginPage />
  }
  return <AppShell title={title} />
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})

function makeProtectedRoute(path: string, title: string) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path,
    component: () => <ProtectedPage title={title} />,
  })
}

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: CalendarPage,
})
const householdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household',
  component: HouseholdPage,
})
const householdBinsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/bins',
  component: BinsPage,
})
const householdPlansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/plans',
  component: HousePlansPage,
})
const householdTasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/tasks',
  component: TasksOverviewPage,
})
const householdTaskListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/tasks/$listId',
  component: TaskDetailPage,
})
const householdShoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/shopping',
  component: ShoppingOverviewPage,
})
const householdShoppingAllRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/shopping/all',
  component: ShoppingDetailPage,
})
const householdShoppingShopRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/household/shopping/$shopId',
  component: ShoppingDetailPage,
})
const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox',
  component: InboxPage,
})
const inboxCaptureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/inbox/capture',
  component: InboxCapturePage,
})
const lifeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/life',
  component: LifeOverviewPage,
})
const lifeCategoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/life/$category',
  component: LifeCategoryPage,
})
const lifeAdminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/life/admin',
  component: LifeOverviewPage,
})
const lifeAdminEntityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/life/admin/$entityId',
  component: LifeEntityPage,
})
const watchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/watch',
  component: WatchPage,
})
const remindersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reminders',
  component: RemindersPage,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
})

const notesListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/notes',
  component: NotesPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  homeRoute,
  calendarRoute,
  householdRoute,
  householdBinsRoute,
  householdPlansRoute,
  householdTasksRoute,
  householdTaskListRoute,
  householdShoppingRoute,
  householdShoppingAllRoute,
  householdShoppingShopRoute,
  inboxRoute,
  inboxCaptureRoute,
  notesListRoute,
  lifeRoute,
  lifeCategoryRoute,
  lifeAdminRoute,
  lifeAdminEntityRoute,
  watchRoute,
  remindersRoute,
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
