import { useEffect, useRef, useState } from 'react'
import { live, useStore } from '../lib/store'
import { rig } from '../lib/rig'
import { SCROLL } from '../lib/config'
import { usePath } from '../lib/router'

// A small "how to get around" card. Each control ticks off as the visitor uses it; once the
// three movement controls are done (or "Got it" is pressed) it fades away and is not shown
// again on this browser. The "?" button brings it back.

const KEY = 'guide-done-v1'
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

type StepId = 'scroll' | 'look' | 'roam' | 'open'
const STEPS: { id: StepId; keys: string[]; text: string }[] = isTouch
  ? [
      { id: 'scroll', keys: ['Swipe up'], text: 'Walk the tour, project to project' },
      { id: 'look', keys: ['Swipe sideways'], text: 'Look around' },
      { id: 'roam', keys: ['Joystick'], text: 'Walk anywhere you like' },
      { id: 'open', keys: ['Tap a hoarding'], text: 'Open the project' },
    ]
  : [
      { id: 'scroll', keys: ['Scroll'], text: 'Walk the tour, project to project' },
      { id: 'look', keys: ['Drag'], text: 'Look around' },
      { id: 'roam', keys: ['W', 'A', 'S', 'D'], text: 'Walk anywhere · mouse to look · Shift to run' },
      { id: 'open', keys: ['Click a hoarding'], text: 'Open the project' },
    ]
const MOVEMENT: StepId[] = ['scroll', 'look', 'roam']

const remembered = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
const remember = () => {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* private mode: it just shows again next time */
  }
}

export function ControlsGuide() {
  const [open, setOpen] = useState(() => !remembered())
  const [done, setDone] = useState<Set<StepId>>(() => new Set())
  const [leaving, setLeaving] = useState(false)
  const mode = useStore((s) => s.mode)
  const path = usePath()
  const yaw0 = useRef<number | null>(null)
  // wait until the opening title has faded so the card never covers it
  const [shown, setShown] = useState(false)

  const mark = (id: StepId) => setDone((d) => (d.has(id) ? d : new Set(d).add(id)))

  // watch what the visitor does
  useEffect(() => {
    if (!open) return
    let raf = 0
    const tick = () => {
      if (live.time > -SCROLL.INTRO_SECONDS * 0.5 || useStore.getState().mode !== 'route') setShown(true)
      if (live.time > -SCROLL.INTRO_SECONDS + 1) mark('scroll')
      if (Math.abs(rig.offYaw) + Math.abs(rig.offPitch) > 0.25) mark('look')
      if (rig.free && useStore.getState().mode === 'free') {
        if (yaw0.current === null) yaw0.current = rig.free.yaw
        else if (Math.abs(rig.free.yaw - yaw0.current) > 0.25) mark('look')
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [open])
  useEffect(() => {
    if (mode === 'free') mark('roam')
  }, [mode])
  useEffect(() => {
    if (path.startsWith('/work/')) mark('open')
  }, [path])

  const close = () => {
    remember()
    setLeaving(true)
    setTimeout(() => {
      setOpen(false)
      setLeaving(false)
    }, 450)
  }

  // all movement learnt: let the last tick show, then go
  useEffect(() => {
    if (!open || leaving || !MOVEMENT.every((id) => done.has(id))) return
    const t = setTimeout(close, 1400)
    return () => clearTimeout(t)
  }, [done, open, leaving])

  if (!open) {
    return (
      <button
        className="guide-help"
        aria-label="Show controls"
        title="Controls"
        onClick={() => {
          setDone(new Set())
          yaw0.current = null
          setOpen(true)
        }}
      >
        ?
      </button>
    )
  }

  if (!shown) return null
  return (
    <section className={`guide ${leaving ? 'is-leaving' : ''}`} aria-label="How to get around">
      <header className="guide__head">
        <span className="guide__title">How to get around</span>
        <span className="guide__count">
          {done.size}/{STEPS.length}
        </span>
      </header>
      <ul className="guide__list">
        {STEPS.map((s) => (
          <li key={s.id} className={`guide__step ${done.has(s.id) ? 'is-done' : ''}`}>
            <span className="guide__keys">
              {s.keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </span>
            <span className="guide__text">{s.text}</span>
            <span className="guide__tick" aria-label={done.has(s.id) ? 'done' : 'not yet'} />
          </li>
        ))}
      </ul>
      <footer className="guide__foot">
        <span>Scroll any time to rejoin the tour</span>
        <button className="btn btn--primary btn--sm" onClick={close}>
          Got it
        </button>
      </footer>
    </section>
  )
}
