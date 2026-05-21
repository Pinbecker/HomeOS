export default function ShopLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <div className="h-5 w-20 bg-surface-2 rounded" />
        <div className="h-5 w-8 bg-surface-2 rounded" />
      </div>

      <header className="px-5 pt-1 pb-3">
        <div className="h-8 w-40 bg-surface-2 rounded-xl" />
      </header>

      {/* Quick-add bar */}
      <div className="mx-4 mb-4">
        <div className="h-12 bg-surface border border-border rounded-xl" />
      </div>

      {/* Item list */}
      <div className="mx-4 h-3 w-24 bg-surface-2 rounded mb-2" />
      <div className="mx-4 bg-surface border border-border rounded-2xl overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`flex items-center gap-3 px-4 py-[13px] ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="w-5 h-5 rounded-[6px] border-[1.5px] border-border shrink-0" />
            <div className="h-4 bg-surface-2 rounded" style={{ width: `${50 + (i % 4) * 12}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
