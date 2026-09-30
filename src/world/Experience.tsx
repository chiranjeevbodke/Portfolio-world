import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { LOOK, SCROLL } from '../lib/config'
import { useStore } from '../lib/store'
import { initScroll, startScroll, stopScroll, getLenis } from '../lib/scroll'
import { World } from './World'
import { Sky } from './Sky'
import { Lights } from './Lights'
import { CameraRig } from './CameraRig'
import { Frames } from './Frames'
import { Life } from './Life'
import { useWorldInput } from './useWorldInput'
import { MapCapture } from './MapCapture'
import { Overlay } from '../ui/Overlay'

const isCoarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

/** The 3D neighbourhood. `paused` stops rendering and scrolling while a page covers it. */
export default function Experience({ paused, onSlow }: { paused: boolean; onSlow: () => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useWorldInput(el)
  const duration = useStore((s) => s.path?.duration ?? 0)
  const mode = useStore((s) => s.mode)
  // animated street life only when the model places some (life_* / lifepath_* markers)
  const hasLife = useStore((s) => !!s.world && s.world.lifeSpots.length + s.world.lifePaths.length > 0)

  // Lenis drives a real page scroll; the track below gives the page its length
  useEffect(() => {
    initScroll()
  }, [])
  useEffect(() => {
    getLenis()?.resize()
  }, [duration])
  useEffect(() => {
    if (paused || mode !== 'route') stopScroll()
    else startScroll()
    document.documentElement.classList.toggle('is-free', mode === 'free')
  }, [paused, mode])

  // pixel ratio only ever steps down (changing it causes a hitch, so we don't flip back and forth)
  const maxDpr = Math.min(window.devicePixelRatio || 1, isCoarse ? 1.5 : 2)
  const [dpr, setDpr] = useState(maxDpr)
  const fog = useMemo(() => new THREE.Fog(LOOK.SKY_HORIZON, LOOK.FOG_NEAR, LOOK.FOG_FAR), [])

  return (
    <>
      <div className="scroll-track" style={{ height: duration ? `calc(${Math.ceil((duration + SCROLL.INTRO_SECONDS) * SCROLL.PX_PER_SECOND)}px + 100vh)` : '100vh' }} />
      <div ref={setEl} className="experience" aria-label="3D neighbourhood. Scroll to walk; click a hoarding to open a project.">
        <Canvas
          dpr={dpr}
          flat
          shadows="percentage"
          frameloop={paused ? 'never' : 'always'}
          camera={{ near: 0.1, far: 1000, position: [6, 1.7, 10] }}
          gl={{ antialias: !isCoarse || maxDpr < 1.5, powerPreference: 'high-performance' }}
          onCreated={({ scene }) => {
            scene.fog = fog
          }}
        >
          <PerformanceMonitor
            bounds={() => [45, 58]}
            onDecline={() => setDpr((d) => Math.max(0.75, Math.round((d - 0.25) * 100) / 100))}
            flipflops={3}
            onFallback={onSlow}
          />
          <Sky />
          <Lights shadowSize={isCoarse ? 1024 : 2048} />
          <Suspense fallback={null}>
            <World />
          </Suspense>
          <Frames />
          {hasLife && (
            <Suspense fallback={null}>
              <Life />
            </Suspense>
          )}
          <CameraRig />
          <MapCapture />
        </Canvas>
      </div>
      <Overlay />
    </>
  )
}
