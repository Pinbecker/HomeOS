export default function CalendarLoading() {
  return (
    <div className="flex flex-col max-w-lg mx-auto px-4 pt-5 animate-pulse">
      {/* Month + nav */}
      <div className="flex items-center justify-between mb-4">
        <div className="h-7 w-32 bg-surface-2 rounded-xl" />
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-surface rounded-full" />
          <div className="w-8 h-8 bg-surface rounded-full" />
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-4 bg-surface-2 rounded mx-auto w-5" />
        ))}
      </div>

      {/* Calendar grid — 5 rows × 7 cols */}
      <div className="grid grid-cols-7 gap-1">
        {[...Array(35)].map((_, i) => (
          <div key={i} className="aspect-square bg-surface rounded-lg" />
        ))}
      </div>

      {/* Event list below */}
      <div className="mt-5 space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 bg-surface rounded-xl" />
        ))}
      </div>
    </div>
  )
}
