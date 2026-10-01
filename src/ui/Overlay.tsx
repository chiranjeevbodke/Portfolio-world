import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import gsap from 'gsap'
import { live, useStore } from '../lib/store'
import { goToSlot, returnToRoute } from '../lib/rig'
import { scrollToTop } from '../lib/scroll'
import { SCROLL } from '../lib/config'
import { navigate, parsePath } from '../lib/router'
import { assignmentFor, projectBySlug } from '../content/projects'
import { openFrame } from '../world/useWorldInput'
import { MiniMap } from './MiniMap'
import { Joystick } from './Joystick'
import { ControlsGuide } from './ControlsGuide'

const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const initialSlug = parsePath(location.pathname).slug

function useRaf(cb: () => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    let raf = 0
    const tick = () => {
      ref.current()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
}

function Loader() {
  const { progress, active } = useProgress()
  const ready = useStore((s) => !!s.path && s.framesReady)
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

/** Big intro title that drifts away as the visitor starts walking. */
function Intro() {
  const el = useRef<HTMLDivElement>(null)
  useRaf(() => {
    if (!el.current) return
    // fades as the camera swoops down from the aerial shot
    const k = Math.min(1, Math.max(0, (live.time + SCROLL.INTRO_SECONDS) / (SCROLL.INTRO_SECONDS * 0.45)))
    el.current.style.opacity = String(1 - k)
    el.current.style.transform = `translate3d(0, ${-k * 40}px, 0)`
    el.current.style.visibility = k >= 1 ? 'hidden' : 'visible'
  })
  // letters rise in once the neighbourhood has loaded
  useEffect(() => {
    if (!el.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tl = gsap.timeline({ delay: 0.5 })
    // fromTo (not from) so React's double effect in dev can't leave the letters hidden
    tl.fromTo(el.current.querySelectorAll('.intro__char'), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, ease: 'power4.out', stagger: 0.045 })
      .fromTo(el.current.querySelectorAll('.intro__fade'), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.12 }, '-=0.7')
    return () => void tl.kill()
  }, [])
  return (
    <div ref={el} className="intro">
      <p className="intro__kicker intro__fade">Portfolio · Mumbai</p>
      <h1 className="intro__title" aria-label="Chiranjeev, associate creative director">
        <span className="intro__word" aria-hidden>
          {'Chiranjeev'.split('').map((c, i) => (
            <span key={i} className="intro__char">
              {c}
            </span>
          ))}
        </span>
        <em className="intro__fade" aria-hidden>Associate creative director</em>
      </h1>
      <p className="intro__hint intro__fade">
        <span className="scroll-hint__icon" aria-hidden />
        {isTouch ? 'Swipe up to walk the neighbourhood' : 'Scroll to walk the neighbourhood'}
      </p>
    </div>
  )
}

/** Route progress with a tick per zone. */
function RouteProgress() {
  const bar = useRef<HTMLSpanElement>(null)
  const zones = useStore((s) => s.zones)
  const duration = useStore((s) => s.path?.duration ?? 1)
  useRaf(() => {
    if (bar.current) bar.current.style.transform = `scaleY(${live.progress})`
  })
  return (
    <div className="route-progress" aria-hidden>
      <span ref={bar} />
      {zones.map((z) => (
        <i key={z.id} style={{ top: `${(z.routeTime / duration) * 100}%` }} />
      ))}
    </div>
  )
}

/** Zone name card when the visitor enters a new part of the neighbourhood. */
function ZoneTitle() {
  const zones = useStore((s) => s.zones)
  const mode = useStore((s) => s.mode)
  const [zone, setZone] = useState<{ id: string; label: string; n: number } | null>(null)
  const last = useRef<string | null>(null)
  useRaf(() => {
    if (!zones.length) return
    let best: (typeof zones)[number] | null = null, bestD = 38
    for (const z of zones) {
      const d = Math.hypot(z.center.x - live.x, z.center.z - live.z)
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    const id = best?.id ?? null
    if (id !== last.current) {
      last.current = id
      setZone(best ? { id: best.id, label: best.label, n: zones.indexOf(best) + 1 } : null)
    }
  })
  const show = !!zone && mode !== 'moving' && live.time > 1
  const counts = zone ? countProjects(zone.id) : 0
  return (
    <div className={`zone-title ${show ? 'is-visible' : ''}`} aria-live="polite">
      {zone && (
        <>
          <span className="zone-title__n">{String(zone.n).padStart(2, '0')}</span>
          <strong>{zone.label}</strong>
          {counts > 0 && <span className="zone-title__sub">{counts} project{counts > 1 ? 's' : ''}</span>}
        </>
      )}
    </div>
  )
}

function countProjects(zone: string) {
  let n = 0
  for (const p of projectBySlug.values()) if (p.zone === zone) n++
  return n
}

/** Floating label above the frame the visitor is looking at. */
function FrameLabel() {
  const focusId = useStore((s) => s.focusId)
  const el = useRef<HTMLButtonElement>(null)
  useRaf(() => {
    const l = live.label
    if (!el.current) return
    el.current.style.left = `${Math.min(88, Math.max(12, l.x))}%`
    el.current.style.top = `${Math.min(85, Math.max(14, l.y))}%`
    el.current.classList.toggle('is-visible', !!focusId && l.visible)
  })
  const a = focusId ? assignmentFor(focusId) : null
  const p = a?.kind === 'project' ? a.project : null
  return (
    <button ref={el} className="frame-label" tabIndex={p ? 0 : -1} onClick={() => openFrame(focusId)} aria-hidden={!p}>
      {p && (
        <>
          <span className="frame-label__cat">{p.category}</span>
          <strong>{p.title}</strong>
          <span className="frame-label__cta">{isTouch ? 'Tap to open' : 'Click to open'} →</span>
        </>
      )}
    </button>
  )
}

function BackToWalk() {
  const free = useStore((s) => s.mode === 'free')
  return (
    <>
      <button className={`back-to-walk ${free ? '' : 'is-hidden'}`} onClick={returnToRoute} tabIndex={free ? 0 : -1}>
        Back to the walk
      </button>
      <div className="crosshair" aria-hidden />
      <p className="lock-hint" aria-hidden>
        Mouse to look · WASD to walk · Shift to run · Click a hoarding · Esc frees the mouse
      </p>
    </>
  )
}

export function Overlay() {
  const ready = useStore((s) => !!s.path && s.framesReady)

  // opened straight from a /work/<slug> link: place the visitor in front of that project
  useEffect(() => {
    if (!ready || !initialSlug) return
    const p = projectBySlug.get(initialSlug)
    if (p) goToSlot(p.hero, { duration: 0.01 })
  }, [ready])

  return (
    <div className="hud">
      <header className="brand">
        <a
          href="/"
          className="brand__name"
          onClick={(e) => {
            e.preventDefault()
            if (useStore.getState().mode === 'free') returnToRoute()
            else scrollToTop()
          }}
        >
          Chiranjeev
        </a>
        <span className="brand__role">Associate creative director · Mumbai</span>
        <a
          href="/work"
          className="btn btn--ghost btn--sm brand__work"
          onClick={(e) => {
            e.preventDefault()
            navigate('/work')
          }}
        >
          All work
        </a>
      </header>
      {ready && (
        <>
          <Intro />
          <ZoneTitle />
          <FrameLabel />
          <RouteProgress />
          <MiniMap />
          <Joystick />
          <BackToWalk />
          <ControlsGuide />
        </>
      )}
      <div className="vignette" aria-hidden />
      <Loader />
    </div>
  )
}
