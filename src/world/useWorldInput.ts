import { useEffect } from 'react'
import { ROAM, SCROLL } from '../lib/config'
import { useStore } from '../lib/store'
import { enterFree, input, returnToRoute, rig } from '../lib/rig'

// All pointer / keyboard input for the 3D view.
// - wheel, trackpad, PageUp/PageDown/Space: move along the route (and bring free roam back to it)
// - WASD / arrows: free roam
// - mouse drag: look around. Touch: on the route a vertical swipe walks the route and a
//   sideways swipe looks around; in free roam any swipe looks around.

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

function scroll(seconds: number) {
  const { mode, scrollBy } = useStore.getState()
  if (mode === 'free') returnToRoute()
  else scrollBy(seconds)
}

function lookBy(dxPx: number, dyPx: number) {
  const mode = useStore.getState().mode
  const dy = -dxPx * ROAM.LOOK_PER_PX
  const dp = -dyPx * ROAM.LOOK_PER_PX
  if (mode === 'free') {
    rig.free.yaw += dy
    rig.free.pitch += dp
  } else if (mode === 'route') {
    rig.offYaw += dy
    rig.offPitch = Math.max(-1, Math.min(1, rig.offPitch + dp))
  }
}

export function useWorldInput(target: HTMLElement | null) {
  useEffect(() => {
    if (!target) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return // pinch-zoom on trackpads
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      scroll(dy * unit * SCROLL.SECONDS_PER_WHEEL_PX)
    }

    // ---- pointer drag (mouse, pen, touch)
    type Drag = { x: number; y: number; t: number; axis: 'v' | 'h' | 'look' | null; v: number }
    const drags = new Map<number, Drag>()
    let fling = 0
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (drags.size >= 1) return // one finger at a time
      cancelAnimationFrame(fling)
      drags.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), axis: null, v: 0 })
      target.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      const d = drags.get(e.pointerId)
      if (!d) return
      const dx = e.clientX - d.x, dy = e.clientY - d.y
      if (d.axis === null) {
        if (Math.hypot(dx, dy) < 6) return
        const touch = e.pointerType === 'touch'
        d.axis = !touch || useStore.getState().mode !== 'route' ? 'look' : Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
        target.classList.add('is-dragging')
      }
      const now = performance.now()
      if (d.axis === 'v') {
        const s = -dy * SCROLL.SECONDS_PER_TOUCH_PX
        scroll(s)
        d.v = s / Math.max(1, now - d.t)
      } else {
        lookBy(dx, d.axis === 'h' ? 0 : dy)
      }
      d.x = e.clientX
      d.y = e.clientY
      d.t = now
    }
    const onUp = (e: PointerEvent) => {
      const d = drags.get(e.pointerId)
      if (!d) return
      drags.delete(e.pointerId)
      target.classList.remove('is-dragging')
      if (d.axis !== 'v' || performance.now() - d.t > 80) return
      // momentum after a swipe
      let v = d.v * 1000
      let prev = performance.now()
      const step = () => {
        const now = performance.now()
        const dt = (now - prev) / 1000
        prev = now
        useStore.getState().scrollBy(v * dt)
        v *= Math.exp(-SCROLL.FLING_DECAY * dt)
        if (Math.abs(v) > 0.05 && useStore.getState().mode === 'route') fling = requestAnimationFrame(step)
      }
      fling = requestAnimationFrame(step)
    }

    // ---- keyboard
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (MOVE_KEYS.has(e.code)) {
        input.keys.add(e.code)
        enterFree()
        e.preventDefault()
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        input.keys.add(e.code)
        return
      }
      if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) scroll(SCROLL.SECONDS_PER_KEY)
      else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) scroll(-SCROLL.SECONDS_PER_KEY)
      else if (e.key === 'Home') scroll(-1e9)
      else if (e.key === 'End') scroll(1e9)
      else return
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => input.keys.delete(e.code)
    const onBlur = () => input.keys.clear()

    target.addEventListener('wheel', onWheel, { passive: false })
    target.addEventListener('pointerdown', onDown)
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      cancelAnimationFrame(fling)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('pointerdown', onDown)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [target])
}
