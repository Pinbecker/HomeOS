export default function LifeLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <header className="px-5 pt-5 pb-4">
        <div className="h-7 w-12 bg-surface-2 rounded-xl" />
      </header>
      <div className="mx-4 flex flex-col gap-[5px]">
        {[1, 2].map(i => (
          <div key={i} className="bg-surface border border-border rounded-2xl px-4 py-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-surface-2 shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-32 bg-surface-2 rounded mb-1.5" />
              <div className="h-3 w-48 bg-surface-2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
