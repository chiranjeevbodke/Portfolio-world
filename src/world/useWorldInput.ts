import { useEffect } from 'react'
import * as THREE from 'three'
import { ROAM } from '../lib/config'
import { useStore } from '../lib/store'
import { enterFree, input, returnToRoute, rig } from '../lib/rig'
import { navigate } from '../lib/router'
import { frames, pickFrame, pointer } from './Frames'

// Pointer / keyboard input for the 3D view. Scrolling itself is Lenis (see lib/scroll.ts).
// - mouse drag: look around · click a frame: open the project
// - touch: vertical swipe scrolls (Lenis), sideways swipe looks around, tap a frame to open it;
//   in free roam any swipe looks around
// - WASD / arrows: free roam · wheel or Space in free roam: back onto the route

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const TAP_SLOP = 8

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

const ndc = new THREE.Vector2()
function frameAt(clientX: number, clientY: number) {
  if (!rig.camera) return null
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1)
  return pickFrame(ndc, rig.camera)
}

export function openFrame(slotId: string | null) {
  const f = slotId ? frameAtId(slotId) : null
  if (f?.assignment.kind === 'project') navigate(`/work/${f.assignment.project.slug}`)
}
const frameAtId = (id: string) => frames.find((f) => f.slot.id === id)

export function useWorldInput(target: HTMLElement | null) {
  useEffect(() => {
    if (!target) return

    // wheel only matters in free roam (Lenis handles it on the route)
    const onWheel = (e: WheelEvent) => {
      if (useStore.getState().mode === 'free' && Math.abs(e.deltaY) > 2) returnToRoute()
    }

    type Drag = { x0: number; y0: number; x: number; y: number; axis: 'look' | 'h' | 'v' | null; type: string }
    let drag: Drag | null = null
    let dragId = -1

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (drag) return
      drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, axis: null, type: e.pointerType }
      dragId = e.pointerId
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        input.mouse.x = (e.clientX / window.innerWidth) * 2 - 1
        input.mouse.y = (e.clientY / window.innerHeight) * 2 - 1
      }
      if (!drag || e.pointerId !== dragId) {
        // hover highlight (mouse only)
        if (e.pointerType === 'mouse' && useStore.getState().mode !== 'moving' && target.contains(e.target as Node)) {
          const f = frameAt(e.clientX, e.clientY)
          pointer.hoverId = f?.clickable ? f.slot.id : null
          target.style.cursor = pointer.hoverId ? 'pointer' : ''
        }
        else if (pointer.hoverId && !target.contains(e.target as Node)) pointer.hoverId = null
        return
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      if (drag.axis === null) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < TAP_SLOP) return
        const touchOnRoute = drag.type !== 'mouse' && useStore.getState().mode === 'route'
        const vertical = Math.abs(e.clientY - drag.y0) > Math.abs(e.clientX - drag.x0)
        drag.axis = !touchOnRoute ? 'look' : vertical ? 'v' : 'h'
        if (drag.axis !== 'v') {
          target.setPointerCapture?.(e.pointerId)
          target.classList.add('is-dragging')
        }
      }
      if (drag.axis === 'look') lookBy(dx, dy)
      else if (drag.axis === 'h') lookBy(dx, 0)
      drag.x = e.clientX
      drag.y = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== dragId) return
      const tap = drag.axis === null && e.type === 'pointerup'
      drag = null
      target.classList.remove('is-dragging')
      if (tap && useStore.getState().mode !== 'moving') {
        const f = frameAt(e.clientX, e.clientY)
        if (f?.clickable) openFrame(f.slot.id)
      }
    }
    const onLeave = () => {
      input.mouse.x = input.mouse.y = 0
      pointer.hoverId = null
    }

    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return
      if (document.body.classList.contains('has-overlay')) return
      if (MOVE_KEYS.has(e.code)) {
        input.keys.add(e.code)
        enterFree()
        e.preventDefault()
        return
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.keys.add(e.code)
      if (e.key === 'Enter') openFrame(useStore.getState().focusId)
      if ((e.key === ' ' || e.key === 'PageDown' || e.key === 'PageUp') && useStore.getState().mode === 'free') {
        e.preventDefault()
        returnToRoute()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => input.keys.delete(e.code)
    const onBlur = () => input.keys.clear()

    window.addEventListener('wheel', onWheel, { passive: true })
    target.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    target.addEventListener('pointerleave', onLeave)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('wheel', onWheel)
      target.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      target.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [target])
}
