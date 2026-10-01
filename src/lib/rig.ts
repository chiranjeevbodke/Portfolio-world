import * as THREE from 'three'
import gsap from 'gsap'
import { EYE_HEIGHT } from './config'
import { live, useStore } from './store'
import { scrollToTime, startScroll, stopScroll } from './scroll'

// Shared camera state and the actions that switch between route, free roam and camera moves.

export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 }, // joystick, -1..1 (y down = back)
  /** mouse position, -1..1 from screen centre (desktop parallax) */
  mouse: { x: 0, y: 0 },
}

export const rig = {
  camera: null as THREE.PerspectiveCamera | null,
  /** current camera pose (what the rig last rendered) */
  pos: new THREE.Vector3(6, EYE_HEIGHT, 10),
  yaw: 0,
  pitch: 0,
  /** look-around offset while on the route (drag / swipe), eases away when scrolling */
  offYaw: 0,
  offPitch: 0,
  /** free-roam pose */
  free: { pos: new THREE.Vector3(), yaw: 0, pitch: 0, vel: new THREE.Vector2(), step: 0, bob: 0 },
  /** camera move (free → route, map jumps) */
  move: { from: new THREE.Vector3(), fromYaw: 0, fromPitch: 0, k: 0, arc: 0, lookAt: null as THREE.Vector3 | null },
  /** route heading the rig computed last frame (used to turn a final gaze into a look offset) */
  routeYaw: 0,
  routePitch: 0,
  /** ask the rig to drop the smoothed look (after a jump) */
  resetLook: true,
}

let tween: gsap.core.Tween | null = null

export function enterFree() {
  const { mode, setMode } = useStore.getState()
  if (mode !== 'route') return
  rig.free.pos.set(rig.pos.x, EYE_HEIGHT, rig.pos.z)
  rig.free.yaw = rig.yaw
  rig.free.pitch = rig.pitch
  rig.free.vel.set(0, 0)
  rig.offYaw = rig.offPitch = 0
  stopScroll()
  setMode('free')
}

/** Smoothly move the camera from wherever it is to the route at fly-through time t. */
export function moveToRouteTime(t: number, opts: { duration?: number; lookAt?: THREE.Vector3 } = {}) {
  const s = useStore.getState()
  if (!s.path) return
  tween?.kill()
  rig.move.from.copy(rig.pos)
  rig.move.fromYaw = rig.yaw
  rig.move.fromPitch = rig.pitch
  rig.move.k = 0
  rig.move.lookAt = opts.lookAt ?? null
  rig.offYaw = rig.offPitch = 0
  useStore.setState({ targetTime: t, mode: 'moving', hasScrolled: true })
  live.time = t
  rig.resetLook = true
  scrollToTime(t)
  stopScroll()

  const to = s.path.pointAt(s.path.distAtTime(t))
  const dist = Math.hypot(to.x - rig.pos.x, to.z - rig.pos.z)
  // hop over the rooftops on long moves instead of walking through buildings
  rig.move.arc = dist > 14 ? Math.min(50, Math.max(8, dist * 0.36)) : 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  tween = gsap.to(rig.move, {
    k: 1,
    duration: reduced ? 0.01 : opts.duration ?? Math.min(3.2, 1.1 + dist / 45),
    ease: 'power3.inOut',
    onComplete: () => {
      tween = null
      // keep facing the frame we travelled to; the gaze eases back to the path on the next scroll
      const la = rig.move.lookAt
      if (la) {
        const dx = la.x - rig.pos.x, dy = la.y - rig.pos.y, dz = la.z - rig.pos.z
        const yaw = Math.atan2(-dx, -dz)
        let off = (yaw - rig.routeYaw) % (Math.PI * 2)
        if (off > Math.PI) off -= Math.PI * 2
        if (off < -Math.PI) off += Math.PI * 2
        rig.offYaw = off
        rig.offPitch = Math.atan2(dy, Math.hypot(dx, dz)) - rig.routePitch
      }
      useStore.getState().setMode('route')
      startScroll()
    },
  })
}

/** Scrolling in free roam: ease back onto the nearest point of the route. */
export function returnToRoute() {
  const { path, mode } = useStore.getState()
  if (!path || mode !== 'free') return
  moveToRouteTime(path.timeAtDist(path.closestDist(rig.pos)))
}

export function goToZone(id: string) {
  const zone = useStore.getState().zones.find((z) => z.id === id)
  if (!zone) return
  const key = zone.key ? useStore.getState().world?.slots.find((s) => s.id === zone.key) : null
  moveToRouteTime(zone.routeTime, { lookAt: key?.center })
}

/** Travel to the route spot that best shows a display frame. */
export function goToSlot(slotId: string, opts: { duration?: number } = {}) {
  const { path, world } = useStore.getState()
  const slot = world?.slots.find((s) => s.id === slotId)
  if (!path || !slot) return
  moveToRouteTime(path.timeAtDist(path.bestViewDist(slot.center, slot.normal, slot.size)), { ...opts, lookAt: slot.center })
}

if (import.meta.env.DEV) Object.assign(window, { __rig: { goToSlot, goToZone, moveToRouteTime, enterFree, rig } })
