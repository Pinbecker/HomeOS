import { requireSession } from '@/lib/auth/session'
import { BottomNav } from '@/components/layout/bottom-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession()

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <main className="flex-1 pb-[83px]">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
