import { useRef } from 'react'
import { enterFree, input } from '../lib/rig'
import { useStore } from '../lib/store'

const RADIUS = 42 // px the knob can travel
const DEAD = 0.12

export function Joystick() {
  const knob = useRef<HTMLDivElement>(null)
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null)

  const update = (x: number, y: number) => {
    const len = Math.hypot(x, y)
    const k = len > RADIUS ? RADIUS / len : 1
    x *= k
    y *= k
    if (knob.current) knob.current.style.transform = `translate(${x}px, ${y}px)`
    const nx = x / RADIUS, ny = y / RADIUS
    const mag = Math.hypot(nx, ny)
    if (mag < DEAD) {
      input.joy.x = input.joy.y = 0
      return
    }
    input.joy.x = nx
    input.joy.y = ny
    enterFree()
  }

  const release = () => {
    active.current = null
    input.joy.x = input.joy.y = 0
    if (knob.current) knob.current.style.transform = ''
  }

  return (
    <div
      className="joystick"
      role="application"
      aria-label="Walk: drag to move, left and right to turn"
      onPointerDown={(e) => {
        if (active.current || useStore.getState().mode === 'moving') return
        const r = e.currentTarget.getBoundingClientRect()
        active.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
        e.currentTarget.setPointerCapture(e.pointerId)
        update(e.clientX - active.current.cx, e.clientY - active.current.cy)
      }}
      onPointerMove={(e) => {
        const a = active.current
        if (a && a.id === e.pointerId) update(e.clientX - a.cx, e.clientY - a.cy)
      }}
      onPointerUp={(e) => active.current?.id === e.pointerId && release()}
      onPointerCancel={(e) => active.current?.id === e.pointerId && release()}
    >
      <div ref={knob} className="joystick__knob" />
    </div>
  )
}
