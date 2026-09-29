import * as THREE from 'three'
import type { Slot } from '../world/parseWorld'
import type { RoutePath } from './routePath'

export type Zone = {
  id: string
  label: string
  center: THREE.Vector3 // centre of the zone's display frames
  routeTime: number // fly-through time of the route spot that best overlooks the zone
}

const LABELS: Record<string, string> = {
  studio: 'Studio',
  bazaar: 'Bazaar',
  seafront: 'Seafront',
  airport: 'Airport',
  maidan: 'Maidan',
  art: 'Art street',
}

// Zones are derived from the frame names (slot_<zone>__<id>), so new zones in Blender just appear.
export function computeZones(slots: Slot[], path: RoutePath): Zone[] {
  const byZone = new Map<string, Slot[]>()
  for (const s of slots) {
    const list = byZone.get(s.zone) ?? []
    list.push(s)
    byZone.set(s.zone, list)
  }
  const zones: Zone[] = []
  for (const [id, list] of byZone) {
    const center = new THREE.Vector3()
    for (const s of list) center.add(s.center)
    center.divideScalar(list.length)
    // route spot closest (on average) to the zone's frames; the earliest one if the route passes twice
    const scores = path.dense.map((p) => list.reduce((sum, s) => sum + Math.hypot(s.center.x - p.x, s.center.z - p.z), 0))
    const min = Math.min(...scores)
    const i = scores.findIndex((v) => v <= min * 1.1 + 1)
    zones.push({
      id,
      label: LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1),
      center,
      routeTime: path.timeAtDist(path.dist[i]),
    })
  }
  return zones.sort((a, b) => a.routeTime - b.routeTime)
}
