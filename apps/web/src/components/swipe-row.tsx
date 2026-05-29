import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react'

const ACTION_W = 104
const OPEN_AT = 42
const MAX_DRAG = 320

type SwipeAction = {
  key: string
  label: string
  onClick: () => void
  className?: string
  bg?: string
  closeOnClick?: boolean
}

export function SwipeRow({
  children,
  onDelete,
  onEdit,
  actions,
  className = '',
  wrapClassName = '',
  deleteLabel = 'Delete',
  editLabel = 'Edit',
}: {
  children: ReactNode
  onDelete?: () => void
  onEdit?: () => void
  actions?: SwipeAction[]
  className?: string
  wrapClassName?: string
  deleteLabel?: string
  editLabel?: string
}) {
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const actionList: SwipeAction[] = actions ?? [
    ...(onEdit ? [{ key: 'edit', label: editLabel, onClick: onEdit, className: 'bg-accent' }] : []),
    ...(onDelete ? [{ key: 'delete', label: deleteLabel, onClick: onDelete, className: 'bg-red', closeOnClick: false }] : []),
  ]
  const actionW = ACTION_W * actionList.length

  const offsetRef = useRef(0)
  const openRef = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const axis = useRef<null | 'h' | 'v'>(null)
  const active = useRef(false)
  const swiped = useRef(false)

  function setOff(value: number) {
    offsetRef.current = value
    setOffset(value)
  }

  function snapTo(target: number, open: boolean) {
    setAnimating(true)
    openRef.current = open
    setOff(target)
  }

  function close() {
    snapTo(0, false)
  }

  function fire(action: SwipeAction) {
    if (action.closeOnClick !== false) close()
    action.onClick()
  }

  function down(event: PointerEvent) {
    active.current = true
    axis.current = null
    swiped.current = false
    startX.current = event.clientX
    startY.current = event.clientY
    setAnimating(false)
  }

  function move(event: PointerEvent) {
    if (!active.current) return
    const dx = event.clientX - startX.current
    const dy = event.clientY - startY.current

    if (axis.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (axis.current === 'h') {
        try {
          ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        } catch {}
      }
    }
    if (axis.current !== 'h') return

    swiped.current = true
    const base = openRef.current ? -actionW : 0
    let next = base + dx
    if (next > 0) next = 0
    if (next < -MAX_DRAG) next = -MAX_DRAG
    setOff(next)
  }

  function up() {
    if (!active.current) return
    active.current = false
    if (axis.current !== 'h') {
      axis.current = null
      return
    }
    axis.current = null
    snapTo(offsetRef.current <= -OPEN_AT ? -actionW : 0, offsetRef.current <= -OPEN_AT)
  }

  function clickCapture(event: MouseEvent) {
    if (swiped.current) {
      event.preventDefault()
      event.stopPropagation()
      swiped.current = false
      return
    }
    if (openRef.current) {
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  if (actionList.length === 0) {
    return <div className={`relative ${wrapClassName}`}>{children}</div>
  }

  return (
    <div className={`relative overflow-hidden ${wrapClassName}`}>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: actionW }}>
        {actionList.map(action => (
          <button
            key={action.key}
            onClick={() => fire(action)}
            className={`${action.bg ? '' : action.className ?? 'bg-red'} flex items-center justify-center px-2 text-center text-[12px] font-semibold leading-tight text-white active:opacity-80`}
            style={{ width: ACTION_W, ...(action.bg ? { background: action.bg } : {}) }}
            aria-label={action.label}
            tabIndex={offset < -10 ? 0 : -1}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div
        className={`relative z-10 bg-surface ${className} ${animating ? 'transition-transform duration-200 ease-out' : ''}`}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={clickCapture}
      >
        {children}
      </div>
    </div>
  )
}
