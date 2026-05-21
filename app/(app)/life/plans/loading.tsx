export default function PlansLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <div className="px-3 pt-3 pb-1">
        <div className="h-5 w-10 bg-surface-2 rounded" />
      </div>
      <header className="px-5 pt-1 pb-3">
        <div className="h-8 w-36 bg-surface-2 rounded-xl" />
        <div className="h-3 w-52 bg-surface-2 rounded mt-2" />
      </header>

      <div className="mx-4 bg-surface rounded-2xl overflow-hidden">
        {[1, 2, 3].map(i => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="w-[22px] h-[22px] rounded-full border-2 border-border shrink-0" />
            <div className="flex-1 h-4 bg-surface-2 rounded" style={{ width: `${60 + (i % 3) * 12}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
