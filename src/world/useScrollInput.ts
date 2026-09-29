import { useEffect } from 'react'
import { SCROLL } from '../lib/config'
import { useStore } from '../lib/store'

// Virtual scroll: wheel, trackpad, vertical swipe and PageUp/PageDown/Space
// all move the camera along the route (forward = down, like a page).

export function useScrollInput(target: HTMLElement | null) {
  useEffect(() => {
    if (!target) return
    const scrollBy = (s: number) => useStore.getState().scrollBy(s)

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch-zoom on trackpads
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      scrollBy(dy * unit * SCROLL.SECONDS_PER_WHEEL_PX)
    }

    // touch: a vertical swipe scrolls the route, with a little momentum on release
    let touchId: number | null = null
    let lastY = 0, lastX = 0, lastT = 0, velocity = 0, vertical: boolean | null = null
    let fling = 0
    const onTouchStart = (e: TouchEvent) => {
      if (touchId !== null) return
      const t = e.changedTouches[0]
      touchId = t.identifier
      lastY = t.clientY
      lastX = t.clientX
      lastT = performance.now()
      velocity = 0
      vertical = null
      cancelAnimationFrame(fling)
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = [...e.changedTouches].find((c) => c.identifier === touchId)
      if (!t) return
      const dy = lastY - t.clientY
      const dx = lastX - t.clientX
      if (vertical === null && Math.hypot(dx, dy) > 6) vertical = Math.abs(dy) > Math.abs(dx)
      if (!vertical) return
      const now = performance.now()
      const s = dy * SCROLL.SECONDS_PER_TOUCH_PX
      scrollBy(s)
      velocity = s / Math.max(1, now - lastT) // seconds per ms
      lastY = t.clientY
      lastX = t.clientX
      lastT = now
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (![...e.changedTouches].some((c) => c.identifier === touchId)) return
      touchId = null
      if (!vertical || performance.now() - lastT > 80) return
      let v = velocity * 1000 // seconds per second
      let prev = performance.now()
      const step = () => {
        const now = performance.now()
        const dt = (now - prev) / 1000
        prev = now
        scrollBy(v * dt)
        v *= Math.exp(-SCROLL.FLING_DECAY * dt)
        if (Math.abs(v) > 0.05) fling = requestAnimationFrame(step)
      }
      fling = requestAnimationFrame(step)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) scrollBy(SCROLL.SECONDS_PER_KEY)
      else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) scrollBy(-SCROLL.SECONDS_PER_KEY)
      else if (e.key === 'Home') scrollBy(-1e9)
      else if (e.key === 'End') scrollBy(1e9)
      else return
      e.preventDefault()
    }

    target.addEventListener('wheel', onWheel, { passive: false })
    target.addEventListener('touchstart', onTouchStart, { passive: true })
    target.addEventListener('touchmove', onTouchMove, { passive: true })
    target.addEventListener('touchend', onTouchEnd)
    target.addEventListener('touchcancel', onTouchEnd)
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(fling)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('touchstart', onTouchStart)
      target.removeEventListener('touchmove', onTouchMove)
      target.removeEventListener('touchend', onTouchEnd)
      target.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('keydown', onKey)
    }
  }, [target])
}
