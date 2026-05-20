import { requireSession } from '@/lib/auth/session'

export default async function WatchPage() {
  await requireSession()

  return (
    <div className="flex flex-col max-w-lg mx-auto">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-[22px] font-extrabold text-text-1 tracking-tight">Watch</h1>
        <p className="text-[13px] text-text-2 mt-0.5">Films, TV, and going out</p>
      </header>
      <div className="mx-4 bg-surface border border-border rounded-2xl px-5 py-8 text-center">
        <p className="text-[15px] font-semibold text-text-1 mb-1">Coming in Phase 4</p>
        <p className="text-[13px] text-text-2">Film watchlist with TMDB metadata and your OneDrive library</p>
      </div>
    </div>
  )
}
