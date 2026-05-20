'use client'

import { useRef, useState, type ReactNode, type PointerEvent, type MouseEvent } from 'react'

const ACTION_W = 84       // revealed delete-button width
const OPEN_AT = 42        // drag past this -> snap open
const FULL_AT = 150       // drag past this -> delete on release
const MAX_DRAG = 240      // clamp

export function SwipeRow({
  children,
  onDelete,
  className = '',
  deleteLabel = 'Delete',
}: {
  children: ReactNode
  onDelete: () => void
  className?: string
  deleteLabel?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)

  const offsetRef = useRef(0)
  const openRef = useRef(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const axis = useRef<null | 'h' | 'v'>(null)
  const active = useRef(false)
  const swiped = useRef(false)

  function setOff(v: number) {
    offsetRef.current = v
    setOffset(v)
  }

  function snapTo(target: number, open: boolean) {
    setAnimating(true)
    openRef.current = open
    setOff(target)
  }

  function close() {
    snapTo(0, false)
  }

  function down(e: PointerEvent) {
    active.current = true
    axis.current = null
    swiped.current = false
    startX.current = e.clientX
    startY.current = e.clientY
    setAnimating(false)
  }

  function move(e: PointerEvent) {
    if (!active.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current

    if (axis.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (axis.current === 'h') {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
      }
    }
    if (axis.current !== 'h') return

    swiped.current = true
    const base = openRef.current ? -ACTION_W : 0
    let next = base + dx
    if (next > 0) next = 0
    if (next < -MAX_DRAG) next = -MAX_DRAG
    setOff(next)
  }

  function up() {
    if (!active.current) return
    active.current = false
    if (axis.current !== 'h') { axis.current = null; return }
    axis.current = null

    const o = offsetRef.current
    if (o <= -FULL_AT) {
      const w = wrapRef.current?.offsetWidth ?? 400
      setAnimating(true)
      setOff(-w)
      window.setTimeout(onDelete, 180)
    } else if (o <= -OPEN_AT) {
      snapTo(-ACTION_W, true)
    } else {
      snapTo(0, false)
    }
  }

  // Suppress the child's click right after a swipe, and let a tap on an open
  // row close it instead of activating the content.
  function clickCapture(e: MouseEvent) {
    if (swiped.current) {
      e.preventDefault(); e.stopPropagation()
      swiped.current = false
      return
    }
    if (openRef.current) {
      e.preventDefault(); e.stopPropagation()
      close()
    }
  }

  return (
    <div ref={wrapRef} className="relative overflow-hidden">
      {/* Delete action behind */}
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTION_W }}>
        <button
          onClick={onDelete}
          className="flex-1 bg-red text-white text-[14px] font-semibold flex items-center justify-center active:opacity-80"
          aria-label={deleteLabel}
          tabIndex={offset < -10 ? 0 : -1}
        >
          {deleteLabel}
        </button>
      </div>

      {/* Foreground */}
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
