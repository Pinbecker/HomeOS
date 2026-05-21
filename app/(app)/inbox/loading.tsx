export default function InboxLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <header className="px-5 pt-5 pb-3">
        <div className="h-8 w-20 bg-surface-2 rounded-xl" />
      </header>

      <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`flex items-start gap-3 px-4 py-3 ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="w-8 h-8 rounded-full bg-surface-2 shrink-0 mt-0.5" />
            <div className="flex-1 py-0.5">
              <div className="h-4 bg-surface-2 rounded mb-1.5" style={{ width: `${55 + (i % 3) * 15}%` }} />
              <div className="h-3 bg-surface-2 rounded w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
