// Dashboard skeleton — appears instantly on tap, replaced when server data arrives
export default function DashboardLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto px-4 pt-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="h-3 w-16 bg-surface-2 rounded mb-2" />
          <div className="h-7 w-44 bg-surface-2 rounded-xl" />
        </div>
        <div className="w-9 h-9 rounded-full bg-surface-2" />
      </div>

      {/* Pinned notes row */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="h-24 bg-surface rounded-2xl" />
        <div className="h-24 bg-surface rounded-2xl" />
      </div>

      {/* Today section */}
      <div className="h-4 w-24 bg-surface-2 rounded mb-2" />
      <div className="bg-surface rounded-2xl overflow-hidden mb-3">
        {[1, 2].map(i => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i > 1 ? 'border-t border-border' : ''}`}>
            <div className="w-5 h-5 rounded-full bg-surface-2 shrink-0" />
            <div className="flex-1 h-4 bg-surface-2 rounded" />
          </div>
        ))}
      </div>

      {/* Shopping preview */}
      <div className="h-4 w-24 bg-surface-2 rounded mb-2" />
      <div className="bg-surface rounded-2xl px-4 py-3 mb-3">
        <div className="flex gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-7 w-20 bg-surface-2 rounded-full" />
          ))}
        </div>
      </div>

      {/* Inbox + calendar placeholders */}
      <div className="h-16 bg-surface rounded-2xl mb-3" />
      <div className="h-20 bg-surface rounded-2xl mb-3" />
    </div>
  )
}
