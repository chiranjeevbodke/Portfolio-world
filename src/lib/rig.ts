import * as THREE from 'three'
import gsap from 'gsap'
import { EYE_HEIGHT } from './config'
import { live, useStore } from './store'

// Shared camera state and the actions that switch between route, free roam and camera moves.

export const input = {
  keys: new Set<string>(),
  joy: { x: 0, y: 0 }, // joystick, -1..1 (y down = back)
}

export const rig = {
  /** current camera pose (what the rig last rendered) */
  pos: new THREE.Vector3(6, EYE_HEIGHT, 10),
  yaw: 0,
  pitch: 0,
  /** look-around offset while on the route (drag / swipe), eases away when scrolling */
  offYaw: 0,
  offPitch: 0,
  /** free-roam pose */
  free: { pos: new THREE.Vector3(), yaw: 0, pitch: 0 },
  /** camera move (free → route, map jumps) */
  move: { from: new THREE.Vector3(), fromYaw: 0, fromPitch: 0, k: 0, arc: 0 },
  /** ask the rig to drop the smoothed look (after a jump) */
  resetLook: true,
}

let tween: gsap.core.Tween | null = null

export function enterFree() {
  const { mode, setMode } = useStore.getState()
  if (mode === 'free') return
  if (mode === 'moving') return
  rig.free.pos.set(rig.pos.x, EYE_HEIGHT, rig.pos.z)
  rig.free.yaw = rig.yaw
  rig.free.pitch = rig.pitch
  rig.offYaw = rig.offPitch = 0
  setMode('free')
}

/** Smoothly move the camera from wherever it is to the route at fly-through time t. */
export function moveToRouteTime(t: number) {
  const s = useStore.getState()
  if (!s.path) return
  tween?.kill()
  const fromX = rig.pos.x, fromZ = rig.pos.z
  rig.move.from.copy(rig.pos)
  rig.move.fromYaw = rig.yaw
  rig.move.fromPitch = rig.pitch
  rig.move.k = 0
  rig.offYaw = rig.offPitch = 0
  live.time = t
  rig.resetLook = true
  useStore.setState({ targetTime: t, mode: 'moving', hasScrolled: true })

  const to = s.path.pointAt(s.path.distAtTime(t))
  const dist = Math.hypot(to.x - fromX, to.z - fromZ)
  // hop over the rooftops on long moves instead of walking through buildings
  rig.move.arc = dist > 14 ? Math.min(50, Math.max(8, dist * 0.36)) : 0
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  tween = gsap.to(rig.move, {
    k: 1,
    duration: reduced ? 0.01 : Math.min(3.2, 0.9 + dist / 45),
    ease: 'power2.inOut',
    onComplete: () => {
      tween = null
      useStore.getState().setMode('route')
    },
  })
}

/** Scrolling in free roam: ease back onto the nearest point of the route. */
export function returnToRoute() {
  const { path, mode } = useStore.getState()
  if (!path || mode === 'route') return
  if (mode === 'moving') return
  moveToRouteTime(path.timeAtDist(path.closestDist(rig.pos)))
}

export function goToZone(id: string) {
  const zone = useStore.getState().zones.find((z) => z.id === id)
  if (zone) moveToRouteTime(zone.routeTime)
}
