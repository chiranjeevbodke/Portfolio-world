import { useEffect, useRef, useState } from 'react'
import { live, useStore } from '../lib/store'
import { goToZone } from '../lib/rig'

// keep labels inside the map frame
const clamp = (pct: number) => Math.min(86, Math.max(14, pct))

export function MiniMap() {
  const map = useStore((s) => s.map)
  const zones = useStore((s) => s.zones)
  const marker = useRef<HTMLDivElement>(null)
  // on small screens the map starts compact (no labels); the first tap opens it
  const [open, setOpen] = useState(false)
  const compact = () => window.matchMedia('(max-width: 700px)').matches

  useEffect(() => {
    if (!map) return
    let raf = 0
    const W = map.maxX - map.minX, H = map.maxZ - map.minZ
    const tick = () => {
      const el = marker.current
      if (el) {
        el.style.left = `${((live.x - map.minX) / W) * 100}%`
        el.style.top = `${((live.z - map.minZ) / H) * 100}%`
        el.style.transform = `translate(-50%, -50%) rotate(${-live.yaw}rad)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map])

  if (!map) return null
  const W = map.maxX - map.minX, H = map.maxZ - map.minZ

  // clicking anywhere on the map goes to the nearest zone
  const go = (id: string) => {
    goToZone(id)
    setOpen(false)
  }
  const onMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (compact() && !open) return setOpen(true)
    const r = e.currentTarget.getBoundingClientRect()
    const x = map.minX + ((e.clientX - r.left) / r.width) * W
    const z = map.minZ + ((e.clientY - r.top) / r.height) * H
    let best = zones[0], bestD = Infinity
    for (const zn of zones) {
      const d = Math.hypot(zn.center.x - x, zn.center.z - z)
      if (d < bestD) {
        bestD = d
        best = zn
      }
    }
    if (best) go(best.id)
  }

  return (
    <nav className={`minimap ${open ? 'is-open' : ''}`} aria-label="Neighbourhood map" style={{ aspectRatio: `${W} / ${H}` }}>
      <div className="minimap__inner" onClick={onMapClick}>
        <img src={map.url} alt="" draggable={false} />
        {zones.map((z) => (
          <button
            key={z.id}
            className="minimap__zone"
            style={{ left: `${clamp(((z.center.x - map.minX) / W) * 100)}%`, top: `${clamp(((z.center.z - map.minZ) / H) * 100)}%` }}
            onClick={(e) => {
              e.stopPropagation()
              if (compact() && !open) setOpen(true)
              else go(z.id)
            }}
          >
            {z.label}
          </button>
        ))}
        <div ref={marker} className="minimap__me" aria-hidden />
      </div>
      {open && (
        <button className="minimap__close" aria-label="Close map" onClick={() => setOpen(false)}>
          ×
        </button>
      )}
    </nav>
  )
}
