export default function AdminLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <div className="px-3 pt-3 pb-1">
        <div className="h-5 w-10 bg-surface-2 rounded" />
      </div>
      <header className="px-5 pt-1 pb-3">
        <div className="h-8 w-44 bg-surface-2 rounded-xl" />
        <div className="h-3 w-52 bg-surface-2 rounded mt-2" />
      </header>

      <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className={`flex items-center gap-3.5 px-4 py-3 ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="w-9 h-9 rounded-[9px] bg-surface-2 shrink-0" />
            <div className="flex-1">
              <div className="h-4 w-28 bg-surface-2 rounded mb-1.5" />
              <div className="h-3 w-40 bg-surface-2 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
