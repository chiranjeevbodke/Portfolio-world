import Lenis from 'lenis'
import gsap from 'gsap'
import { SCROLL } from './config'
import { useStore } from './store'

// Lenis smooths a real, tall page scroll. The page's scroll position is the
// fly-through clock: SCROLL.PX_PER_SECOND pixels = one second of the Blender fly-through.
// The camera reads the already-eased value, so there is only one smoothing layer.

let lenis: Lenis | null = null

export function initScroll() {
  if (lenis) return lenis
  lenis = new Lenis({
    lerp: SCROLL.LERP,
    wheelMultiplier: 1,
    syncTouch: true,
    syncTouchLerp: SCROLL.TOUCH_LERP,
    touchMultiplier: 1.4,
    // let panels and the map scroll on their own
    prevent: (node) => !!node.closest?.('[data-lenis-prevent]'),
  })
  gsap.ticker.add((t) => lenis?.raf(t * 1000))
  gsap.ticker.lagSmoothing(0)
  lenis.on('scroll', () => {
    const { path, mode, targetTime } = useStore.getState()
    if (!path || !lenis) return
    if (mode !== 'route') return
    const t = Math.min(path.duration, lenis.scroll / SCROLL.PX_PER_SECOND - SCROLL.INTRO_SECONDS)
    if (Math.abs(t - targetTime) > 1e-4) useStore.getState().setTargetTime(t)
  })
  return lenis
}

export function getLenis() {
  return lenis
}

/** Jump the page scroll to fly-through time t (no animation; the camera does its own move). */
export function scrollToTime(t: number) {
  lenis?.scrollTo((t + SCROLL.INTRO_SECONDS) * SCROLL.PX_PER_SECOND, { immediate: true, force: true })
}

export function stopScroll() {
  lenis?.stop()
}

export function startScroll() {
  lenis?.start()
}

/** Glide the page back to the very top (the aerial shot). */
export function scrollToTop() {
  lenis?.scrollTo(0, { duration: 2.4, force: true })
}
