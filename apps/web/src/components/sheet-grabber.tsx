import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

export function SheetGrabber({
  onDismiss,
  disabled = false,
  className = 'flex h-10 shrink-0 items-center justify-center',
  barClassName = 'h-1.5 w-10 rounded-full bg-border',
}: {
  onDismiss: () => void
  disabled?: boolean
  className?: string
  barClassName?: string
}) {
  const drag = useRef<{ pointerId: number; startY: number; startTime: number; sheet: HTMLElement } | null>(null)

  function reset(sheet: HTMLElement) {
    sheet.style.transition = 'transform 180ms cubic-bezier(.32,.72,0,1)'
    sheet.style.transform = 'translate3d(0,0,0)'
    window.setTimeout(() => {
      sheet.style.removeProperty('transition')
      sheet.style.removeProperty('transform')
      sheet.style.removeProperty('will-change')
    }, 190)
  }

  function finish(event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    const distance = Math.max(0, event.clientY - current.startY)
    const velocity = distance / Math.max(Date.now() - current.startTime, 1)
    if (!cancelled && (distance > 88 || velocity > 0.45)) {
      current.sheet.style.transition = 'transform 180ms cubic-bezier(.32,.72,0,1)'
      current.sheet.style.transform = 'translate3d(0,110%,0)'
      window.setTimeout(onDismiss, 150)
      return
    }
    reset(current.sheet)
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="Swipe down to close"
      className={`w-full ${className}`}
      style={{ touchAction: 'none' }}
      onPointerDown={event => {
        if (disabled) return
        const sheet = event.currentTarget.closest<HTMLElement>('[data-swipe-sheet]')
        if (!sheet) return
        event.currentTarget.setPointerCapture(event.pointerId)
        sheet.style.transition = 'none'
        sheet.style.willChange = 'transform'
        drag.current = { pointerId: event.pointerId, startY: event.clientY, startTime: Date.now(), sheet }
      }}
      onPointerMove={event => {
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) return
        const distance = Math.max(0, event.clientY - current.startY)
        current.sheet.style.transform = `translate3d(0,${distance}px,0)`
      }}
      onPointerUp={event => finish(event)}
      onPointerCancel={event => finish(event, true)}
    >
      <span className={barClassName} />
    </button>
  )
}
