import { useLocation } from '@tanstack/react-router'
import { useLayoutEffect, useRef } from 'react'

type ScrollPosition = {
  left: number
  top: number
}

type HistoryState = {
  __TSR_index?: number
  __TSR_key?: string
  key?: string
}

const STORAGE_PREFIX = 'homeos:app-main-scroll:v2:'
export const APP_MAIN_SCROLL_RESTORATION_ID = 'app-main'
const RESTORE_SETTLE_MS = 750
const RESTORE_TIMEOUT_MS = 5000

function entryIdentity(href: string, state: HistoryState) {
  const entry = state.__TSR_key ?? state.key ?? (Number.isFinite(state.__TSR_index)
    ? `index-${state.__TSR_index}`
    : 'initial')
  return `${entry}:${href}`
}

function readPosition(identity: string): ScrollPosition | null {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${identity}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ScrollPosition>
    if (!Number.isFinite(parsed.top) || !Number.isFinite(parsed.left)) return null
    return { top: parsed.top as number, left: parsed.left as number }
  } catch {
    return null
  }
}

function writePosition(identity: string, position: ScrollPosition) {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${identity}`, JSON.stringify(position))
  } catch {
    // Scroll restoration remains best-effort when storage is unavailable.
  }
}

export function useAppMainScrollRestoration() {
  const elementRef = useRef<HTMLElement>(null)
  const identity = useLocation({
    select: location => entryIdentity(location.href, location.state as HistoryState),
  })

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return undefined

    const saved = readPosition(identity)
    let restoreTarget = saved
    let restoring = saved !== null
    let userInterrupted = false
    let pageWasHidden = false
    let writeFrame = 0
    let applyFrame = 0
    const restoreFrames: number[] = []
    const restoreTimers: number[] = []
    let restoreStartedAt = 0
    let restoreDeadline = 0

    const persist = () => {
      writePosition(identity, { left: element.scrollLeft, top: element.scrollTop })
    }

    const schedulePersist = () => {
      if (restoring || writeFrame) return
      writeFrame = window.requestAnimationFrame(() => {
        writeFrame = 0
        persist()
      })
    }

    const interruptRestore = () => {
      userInterrupted = true
      restoring = false
    }

    const applyPosition = (position: ScrollPosition) => {
      if (userInterrupted || !restoring) return
      element.scrollLeft = position.left
      element.scrollTop = position.top

      const reachedTarget = Math.abs(element.scrollTop - position.top) <= 1
        && Math.abs(element.scrollLeft - position.left) <= 1
      const now = performance.now()
      if ((reachedTarget && now - restoreStartedAt >= RESTORE_SETTLE_MS) || now >= restoreDeadline) {
        restoring = false
        persist()
      }
    }

    const scheduleApply = (position: ScrollPosition) => {
      if (applyFrame || userInterrupted || !restoring) return
      applyFrame = window.requestAnimationFrame(() => {
        applyFrame = 0
        applyPosition(position)
      })
    }

    const restorePosition = (position: ScrollPosition) => {
      restoreTarget = position
      restoreStartedAt = performance.now()
      restoreDeadline = restoreStartedAt + RESTORE_TIMEOUT_MS
      restoring = true
      userInterrupted = false
      const apply = () => applyPosition(position)
      apply()
      restoreFrames.push(window.requestAnimationFrame(() => {
        apply()
        restoreFrames.push(window.requestAnimationFrame(apply))
      }))
      ;[80, 220, 500, 1000, 2000, 4000].forEach(delay => {
        restoreTimers.push(window.setTimeout(apply, delay))
      })
      restoreTimers.push(window.setTimeout(() => {
        apply()
        restoring = false
        persist()
      }, RESTORE_TIMEOUT_MS))
    }

    const handlePageHide = () => {
      pageWasHidden = true
      if (restoring && restoreTarget && !userInterrupted) writePosition(identity, restoreTarget)
      else persist()
    }

    const handlePageShow = () => {
      if (!pageWasHidden) return
      pageWasHidden = false
      const position = readPosition(identity)
      if (position) restorePosition(position)
    }

    element.addEventListener('scroll', schedulePersist, { passive: true })
    element.addEventListener('touchstart', interruptRestore, { passive: true })
    element.addEventListener('pointerdown', interruptRestore, { passive: true })
    element.addEventListener('wheel', interruptRestore, { passive: true })
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (restoreTarget) scheduleApply(restoreTarget)
        })
    const observeContent = () => {
      if (!resizeObserver) return
      resizeObserver.observe(element)
      Array.from(element.children).forEach(child => resizeObserver.observe(child))
    }
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          observeContent()
          if (restoreTarget) scheduleApply(restoreTarget)
        })
    observeContent()
    mutationObserver?.observe(element, { childList: true, subtree: true })

    if (saved) restorePosition(saved)
    else {
      element.scrollLeft = 0
      element.scrollTop = 0
    }

    return () => {
      if (writeFrame) window.cancelAnimationFrame(writeFrame)
      if (applyFrame) window.cancelAnimationFrame(applyFrame)
      restoreFrames.forEach(frame => window.cancelAnimationFrame(frame))
      restoreTimers.forEach(timer => window.clearTimeout(timer))
      if (restoring && restoreTarget && !userInterrupted) writePosition(identity, restoreTarget)
      else persist()
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      element.removeEventListener('scroll', schedulePersist)
      element.removeEventListener('touchstart', interruptRestore)
      element.removeEventListener('pointerdown', interruptRestore)
      element.removeEventListener('wheel', interruptRestore)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [identity])

  return { elementRef, restorationId: APP_MAIN_SCROLL_RESTORATION_ID }
}
