export default function TasksLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <header className="px-5 pt-5 pb-3">
        <div className="h-8 w-16 bg-surface-2 rounded-xl" />
      </header>

      {/* "All" smart row */}
      <div className="mx-4 mb-5">
        <div className="bg-surface rounded-xl px-3.5 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-2 shrink-0" />
          <div className="flex-1 h-4 bg-surface-2 rounded" />
          <div className="w-6 h-4 bg-surface-2 rounded" />
        </div>
      </div>

      <div className="px-5 mb-2 h-3 w-16 bg-surface-2 rounded" />

      {/* 2-col grid of list cards */}
      <div className="mx-4 grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-surface rounded-2xl p-3.5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-8 h-8 rounded-full bg-surface-2" />
              <div className="w-6 h-5 bg-surface-2 rounded" />
            </div>
            <div className="h-4 bg-surface-2 rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}
