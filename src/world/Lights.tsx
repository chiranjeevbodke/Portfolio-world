import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LOOK } from '../lib/config'

const SUN = new THREE.Vector3(...LOOK.SUN_DIR).normalize()
const SHADOW_RANGE = 45 // metres of crisp shadow around the visitor

export function Lights({ shadowSize }: { shadowSize: number }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const l = sun.current
    if (!l) return
    scene.add(l.target)
    const cam = l.shadow.camera
    cam.left = cam.bottom = -SHADOW_RANGE
    cam.right = cam.top = SHADOW_RANGE
    cam.near = 1
    cam.far = 250
    cam.updateProjectionMatrix()
    return () => void scene.remove(l.target)
  }, [scene])

  // keep the shadow box on what the visitor sees: around them at street level, and on the
  // ground ahead (and wider) from the air; snapped to texels to avoid shimmering
  const tmp = useRef({ dir: new THREE.Vector3(), range: SHADOW_RANGE })
  useFrame(({ camera }) => {
    const l = sun.current
    if (!l) return
    const h = Math.max(0, camera.position.y - 2)
    const range = Math.round(SHADOW_RANGE + h * 1.3)
    const dir = camera.getWorldDirection(tmp.current.dir)
    const ahead = dir.y < -0.05 ? Math.min(140, camera.position.y / -dir.y) * 0.8 : 12
    if (range !== tmp.current.range) {
      tmp.current.range = range
      const cam = l.shadow.camera
      cam.left = cam.bottom = -range
      cam.right = cam.top = range
      cam.far = 250 + h * 2
      cam.updateProjectionMatrix()
    }
    const texel = (range * 2) / shadowSize
    const x = Math.round((camera.position.x + dir.x * ahead) / texel) * texel
    const z = Math.round((camera.position.z + dir.z * ahead) / texel) * texel
    l.target.position.set(x, 0, z)
    l.position.set(x + SUN.x * 150, SUN.y * 150, z + SUN.z * 150)
  })

  return (
    <>
      <hemisphereLight args={[LOOK.HEMI_SKY, LOOK.HEMI_GROUND, LOOK.HEMI_INTENSITY]} />
      <directionalLight
        ref={sun}
        color={LOOK.SUN_COLOR}
        intensity={LOOK.SUN_INTENSITY}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0008}
        shadow-normalBias={0.12}
      />
    </>
  )
}
