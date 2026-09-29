import { useEffect, useRef } from 'react'
import { useProgress } from '@react-three/drei'
import { live, useStore } from '../lib/store'
import { returnToRoute } from '../lib/rig'
import { MiniMap } from './MiniMap'
import { Joystick } from './Joystick'

function Loader() {
  const { progress, active } = useProgress()
  const ready = useStore((s) => !!s.path)
  return (
    <div className={`loader ${ready && !active ? 'is-done' : ''}`} aria-hidden={ready}>
      <div className="loader__name">Chiranjeev</div>
      <div className="loader__bar">
        <span style={{ transform: `scaleX(${Math.max(0.04, progress / 100)})` }} />
      </div>
      <div className="loader__hint">Setting up the neighbourhood…</div>
    </div>
  )
}

function RouteProgress() {
  const bar = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (bar.current) bar.current.style.transform = `scaleY(${live.progress})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className="route-progress" aria-hidden>
      <span ref={bar} />
    </div>
  )
}

function ScrollHint() {
  const show = useStore((s) => !!s.path && !s.hasScrolled && s.mode === 'route')
  return (
    <div className={`scroll-hint ${show ? '' : 'is-hidden'}`} aria-hidden={!show}>
      <span className="scroll-hint__icon" />
      Scroll or swipe to walk
    </div>
  )
}

function BackToWalk() {
  const free = useStore((s) => s.mode === 'free')
  return (
    <button className={`back-to-walk ${free ? '' : 'is-hidden'}`} onClick={returnToRoute} tabIndex={free ? 0 : -1}>
      Back to the walk
    </button>
  )
}

export function Overlay() {
  const ready = useStore((s) => !!s.path)
  return (
    <>
      <header className="brand">
        <a href="/" className="brand__name">Chiranjeev</a>
        <span className="brand__role">Associate creative director · Mumbai</span>
      </header>
      <RouteProgress />
      <ScrollHint />
      {ready && (
        <>
          <MiniMap />
          <Joystick />
          <BackToWalk />
        </>
      )}
      <Loader />
    </>
  )
}
