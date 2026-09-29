import { Suspense, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { LOOK } from '../lib/config'
import { World } from './World'
import { Sky } from './Sky'
import { Lights } from './Lights'
import { CameraRig } from './CameraRig'
import { useWorldInput } from './useWorldInput'
import { MapCapture } from './MapCapture'

const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function Experience() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useWorldInput(el)

  // auto-lower the pixel ratio when frames drop, raise it again when there is headroom
  const maxDpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.75 : 2)
  const [dpr, setDpr] = useState(maxDpr)
  const fog = useMemo(() => new THREE.Fog(LOOK.SKY_HORIZON, LOOK.FOG_NEAR, LOOK.FOG_FAR), [])

  return (
    <div ref={setEl} className="experience">
      <Canvas
        dpr={dpr}
        flat
        shadows="percentage"
        camera={{ near: 0.1, far: 700, position: [6, 1.7, 10] }}
        gl={{ antialias: !isCoarse || maxDpr < 1.5, powerPreference: 'high-performance' }}
        onCreated={({ scene }) => {
          scene.fog = fog
        }}
      >
        <PerformanceMonitor
          bounds={() => [50, 58]}
          flipflops={4}
          onChange={({ factor }) => setDpr(Math.round((0.6 + (maxDpr - 0.6) * factor) * 20) / 20)}
        />
        <Sky />
        <Lights shadowSize={isCoarse ? 1024 : 2048} />
        <Suspense fallback={null}>
          <World />
        </Suspense>
        <CameraRig />
        <MapCapture />
      </Canvas>
    </div>
  )
}
