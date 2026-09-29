import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EYE_HEIGHT, FLY, ROAM, SCROLL } from '../lib/config'
import { live, useStore } from '../lib/store'
import { input, rig } from '../lib/rig'

// Blender 24 mm lens on a 36 mm sensor, "auto" sensor fit (fits the longer side).
function verticalFov(aspect: number) {
  const half = Math.atan(FLY.SENSOR_MM / 2 / FLY.LENS_MM)
  const v = aspect >= 1 ? 2 * Math.atan(Math.tan(half) / aspect) : 2 * half
  return THREE.MathUtils.radToDeg(v)
}

// Blender smooths the look target by 0.12 per frame at 24 fps; as a rate that is:
const LOOK_RATE = -Math.log(1 - FLY.LOOK_SMOOTH_24FPS) * 24
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
  const look = useRef(new THREE.Vector3())
  const tmp = useRef({ target: new THREE.Vector3(), pos: new THREE.Vector3(), prevTime: 0 })

  useEffect(() => {
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
    const scrolling = Math.abs(live.time - tmp.current.prevTime) > 1e-3
    tmp.current.prevTime = live.time
    const d = path.distAtTime(live.time)
    live.progress = path.duration > 0 ? live.time / path.duration : 0
    path.pointAt(d, pos)
    path.lookTargetAt(d, target)
    if (rig.resetLook) {
      look.current.copy(target)
      rig.resetLook = false
    } else look.current.lerp(target, 1 - Math.exp(-LOOK_RATE * dt))
    const lx = look.current.x - pos.x, ly = look.current.y - pos.y, lz = look.current.z - pos.z
    const routeYaw = yawOf(lx, lz)
    const routePitch = Math.atan2(ly, Math.hypot(lx, lz))

    if (mode === 'route') {
      // drag-to-look offset eases back to the path once the visitor scrolls again
      if (scrolling) {
        const k = Math.exp(-ROAM.OFFSET_RETURN_RATE * dt)
        rig.offYaw *= k
        rig.offPitch *= k
      }
      rig.pos.copy(pos)
      rig.yaw = routeYaw + rig.offYaw
      rig.pitch = THREE.MathUtils.clamp(routePitch + rig.offPitch, -MAX_PITCH, MAX_PITCH)
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
      rig.pos.lerpVectors(m.from, pos, t)
      rig.pos.y += Math.sin(Math.PI * t) * m.arc
      const lookDown = Math.sin(Math.PI * t) * (m.arc > 0 ? 0.35 : 0)
      rig.yaw = m.fromYaw + shortAngle(m.fromYaw, routeYaw) * t
      rig.pitch = THREE.MathUtils.lerp(m.fromPitch, routePitch, t) - lookDown
    }

    camera.position.copy(rig.pos)
    camera.rotation.set(rig.pitch, rig.yaw, 0, 'YXZ')
    live.x = rig.pos.x
    live.z = rig.pos.z
    live.yaw = rig.yaw
  })

  return null
}
