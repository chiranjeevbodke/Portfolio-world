import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EYE_HEIGHT, FLY, LOOK, ROAM, SCROLL } from '../lib/config'
import { live, useStore } from '../lib/store'
import { input, rig } from '../lib/rig'

const PARALLAX = { YAW: 0.05, PITCH: 0.03 } // subtle head movement following the mouse (radians)

// Blender 24 mm lens on a 36 mm sensor, "auto" sensor fit (fits the longer side).
function verticalFov(aspect: number) {
  const half = Math.atan(FLY.SENSOR_MM / 2 / FLY.LENS_MM)
  const v = aspect >= 1 ? 2 * Math.atan(Math.tan(half) / aspect) : 2 * half
  return THREE.MathUtils.radToDeg(v)
}

const LOOK_RATE = SCROLL.LOOK_RATE
const MAX_PITCH = THREE.MathUtils.degToRad(70)

const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz)
const shortAngle = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const scene = useThree((s) => s.scene)
  const look = useRef(new THREE.Vector3())
  const parallax = useRef({ x: 0, y: 0 })
  const tmp = useRef({ target: new THREE.Vector3(), pos: new THREE.Vector3(), base: new THREE.Vector3(), a: new THREE.Vector3(), c: new THREE.Vector3(), prevTime: 0 })

  useEffect(() => {
    rig.camera = camera
    camera.fov = verticalFov(size.width / size.height)
    camera.updateProjectionMatrix()
    camera.rotation.order = 'YXZ'
  }, [camera, size])

  useFrame((_, rawDt) => {
    const { path, targetTime, mode, walk } = useStore.getState()
    if (!path) return
    const dt = Math.min(rawDt, 0.1)
    const { target, pos } = tmp.current

    // ---- route pose (always computed: it is also the destination of camera moves)
    live.time += (targetTime - live.time) * (1 - Math.exp(-SCROLL.FOLLOW_RATE * dt))
    if (Math.abs(targetTime - live.time) < 1e-4) live.time = targetTime
    const scrolled = Math.abs(live.time - tmp.current.prevTime) // fly-through seconds this frame
    tmp.current.prevTime = live.time
    const d = path.distAtTime(live.time)
    live.progress = path.duration > 0 ? Math.max(0, live.time) / path.duration : 0
    path.pointAt(d, pos)
    path.lookTargetAt(d, target)
    // smooth the viewing angle (not the look point, which the camera could overtake and flip)
    const tx = target.x - pos.x, ty = target.y - pos.y, tz = target.z - pos.z
    const targetYaw = yawOf(tx, tz)
    const targetPitch = Math.atan2(ty, Math.hypot(tx, tz))
    const la = look.current
    if (rig.resetLook) {
      la.set(targetYaw, targetPitch, 0)
      rig.resetLook = false
    } else {
      const k = 1 - Math.exp(-LOOK_RATE * dt)
      la.x += shortAngle(la.x, targetYaw) * k
      la.y += (targetPitch - la.y) * k
    }
    const routeYaw = la.x
    const routePitch = la.y
    rig.routeYaw = routeYaw
    rig.routePitch = routePitch

    // ---- opening: blend from the aerial shot (cam_intro in Blender) down to the start of the walk
    let baseYaw = routeYaw, basePitch = routePitch
    const basePos = tmp.current.base.copy(pos)
    const intro = useStore.getState().world?.intro
    if (live.time < 0 && intro) {
      const k = THREE.MathUtils.clamp(1 + live.time / SCROLL.INTRO_SECONDS, 0, 1)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      const t = performance.now() / 1000
      const A = tmp.current.a.copy(intro.position)
      A.x += Math.sin(t * 0.07) * 6 * (1 - e)
      A.z += Math.cos(t * 0.05) * 4 * (1 - e)
      const C = tmp.current.c.set(A.x * 0.35 + pos.x * 0.65, pos.y + (A.y - pos.y) * 0.3, A.z * 0.35 + pos.z * 0.65)
      // quadratic bezier: glide forward and down, levelling out at eye height
      basePos.set(0, 0, 0).addScaledVector(A, (1 - e) * (1 - e)).addScaledVector(C, 2 * (1 - e) * e).addScaledVector(pos, e * e)
      const dx = intro.target.x - A.x, dy = intro.target.y - A.y, dz = intro.target.z - A.z
      const aYaw = yawOf(dx, dz), aPitch = Math.atan2(dy, Math.hypot(dx, dz))
      baseYaw = aYaw + shortAngle(aYaw, routeYaw) * e
      basePitch = aPitch + (routePitch - aPitch) * e
    }

    // fog and haze open up with height, so the aerial view isn't washed out
    if (scene.fog instanceof THREE.Fog) {
      const h = Math.max(0, camera.position.y - 2)
      scene.fog.near = LOOK.FOG_NEAR + h * 3
      scene.fog.far = LOOK.FOG_FAR + h * 7
    }

    if (mode === 'route') {
      // drag-to-look offset eases back to the path once the visitor scrolls again
      // (in proportion to how far they scroll, so tiny scroll noise doesn't cancel a look-around)
      const k = Math.exp(-ROAM.OFFSET_RETURN_RATE * scrolled)
      rig.offYaw *= k
      rig.offPitch *= k
      rig.pos.copy(basePos)
      rig.yaw = baseYaw + rig.offYaw
      rig.pitch = THREE.MathUtils.clamp(basePitch + rig.offPitch, -MAX_PITCH, MAX_PITCH)
    } else if (mode === 'free') {
      const f = rig.free
      const k = input.keys
      const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - input.joy.y
      const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
      const turn = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0) + input.joy.x
      f.yaw -= turn * ROAM.TURN_SPEED * dt
      f.pitch = THREE.MathUtils.clamp(f.pitch, -MAX_PITCH, MAX_PITCH)
      let mx = -Math.sin(f.yaw) * fwd + Math.cos(f.yaw) * strafe
      let mz = -Math.cos(f.yaw) * fwd - Math.sin(f.yaw) * strafe
      const len = Math.hypot(mx, mz)
      if (len > 1) {
        mx /= len
        mz /= len
      }
      const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? ROAM.RUN_SPEED : ROAM.WALK_SPEED) * dt
      if (len > 0.01) {
        if (walk) walk.move(f.pos, mx * speed, mz * speed)
        else f.pos.set(f.pos.x + mx * speed, EYE_HEIGHT, f.pos.z + mz * speed)
      }
      f.pos.y = EYE_HEIGHT
      rig.pos.copy(f.pos)
      rig.yaw = f.yaw
      rig.pitch = f.pitch
    } else {
      // camera move: blend from the captured pose to the (live) route pose, with an optional hop
      const m = rig.move
      const t = m.k
      rig.pos.lerpVectors(m.from, basePos, t)
      rig.pos.y += Math.sin(Math.PI * t) * m.arc
      const lookDown = Math.sin(Math.PI * t) * (m.arc > 0 ? 0.35 : 0)
      let toYaw = baseYaw, toPitch = basePitch
      if (m.lookAt) {
        const dx = m.lookAt.x - basePos.x, dy = m.lookAt.y - basePos.y, dz = m.lookAt.z - basePos.z
        toYaw = yawOf(dx, dz)
        toPitch = Math.atan2(dy, Math.hypot(dx, dz))
      }
      rig.yaw = m.fromYaw + shortAngle(m.fromYaw, toYaw) * t
      rig.pitch = THREE.MathUtils.lerp(m.fromPitch, toPitch, t) - lookDown
    }

    // gentle parallax toward the mouse (not while dragging or roaming)
    const pk = 1 - Math.exp(-2.5 * dt)
    const px = mode === 'route' ? input.mouse.x : 0, py = mode === 'route' ? input.mouse.y : 0
    parallax.current.x += (px - parallax.current.x) * pk
    parallax.current.y += (py - parallax.current.y) * pk

    camera.position.copy(rig.pos)
    camera.rotation.set(rig.pitch - parallax.current.y * PARALLAX.PITCH, rig.yaw - parallax.current.x * PARALLAX.YAW, 0, 'YXZ')
    live.x = rig.pos.x
    live.z = rig.pos.z
    live.yaw = rig.yaw
  })

  return null
}
