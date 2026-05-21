export default function NotesLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto animate-pulse">
      <header className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="h-7 w-16 bg-surface-2 rounded-xl" />
        <div className="w-8 h-8 bg-surface-2 rounded-lg" />
      </header>

      <div className="mx-4 bg-surface border border-border rounded-2xl overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`px-4 py-3.5 ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="h-4 w-3/4 bg-surface-2 rounded mb-1.5" />
            <div className="h-3 w-1/2 bg-surface-2 rounded mb-1.5" />
            <div className="h-3 w-16 bg-surface-2 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
