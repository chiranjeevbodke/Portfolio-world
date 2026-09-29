import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FLY, SCROLL } from '../lib/config'
import { live, useStore } from '../lib/store'

// Blender 24 mm lens on a 36 mm sensor, "auto" sensor fit (fits the longer side).
function verticalFov(aspect: number) {
  const half = Math.atan(FLY.SENSOR_MM / 2 / FLY.LENS_MM)
  const v = aspect >= 1 ? 2 * Math.atan(Math.tan(half) / aspect) : 2 * half
  return THREE.MathUtils.radToDeg(v)
}

// Blender smooths the look target by 0.12 per frame at 24 fps; as a rate that is:
const LOOK_RATE = -Math.log(1 - FLY.LOOK_SMOOTH_24FPS) * 24

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const look = useRef<THREE.Vector3 | null>(null)
  const tmp = useRef({ target: new THREE.Vector3(), pos: new THREE.Vector3() })

  useEffect(() => {
    camera.fov = verticalFov(size.width / size.height)
    camera.updateProjectionMatrix()
  }, [camera, size])

  useFrame((_, rawDt) => {
    const { path, targetTime } = useStore.getState()
    if (!path) return
    const dt = Math.min(rawDt, 0.1)

    // ease the fly-through clock toward where scrolling wants it
    live.time += (targetTime - live.time) * (1 - Math.exp(-SCROLL.FOLLOW_RATE * dt))
    if (Math.abs(targetTime - live.time) < 1e-4) live.time = targetTime
    const d = path.distAtTime(live.time)
    live.progress = path.duration > 0 ? live.time / path.duration : 0

    const { target, pos } = tmp.current
    path.pointAt(d, pos)
    path.lookTargetAt(d, target)
    if (!look.current) look.current = target.clone()
    else look.current.lerp(target, 1 - Math.exp(-LOOK_RATE * dt))

    camera.position.copy(pos)
    camera.lookAt(look.current)
  })

  return null
}
