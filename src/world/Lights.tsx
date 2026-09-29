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

  // keep the shadow box centred on the visitor; snap to texels to avoid shimmering
  useFrame(({ camera }) => {
    const l = sun.current
    if (!l) return
    const texel = (SHADOW_RANGE * 2) / shadowSize
    const x = Math.round(camera.position.x / texel) * texel
    const z = Math.round(camera.position.z / texel) * texel
    l.target.position.set(x, 0, z)
    l.position.set(x + SUN.x * 120, SUN.y * 120, z + SUN.z * 120)
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
