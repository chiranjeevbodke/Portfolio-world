import * as THREE from 'three'
import type { Slot } from '../world/parseWorld'
import type { RoutePath } from './routePath'
import { assignmentFor } from '../content/projects'

export type Zone = {
  id: string
  label: string
  center: THREE.Vector3 // centre of the zone's display frames
  routeTime: number // fly-through time of the route spot that best overlooks the zone
  key: string // slot id the camera faces on arrival
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
    // land in front of the zone's first project (or its biggest frame)
    const heroes = list
      .map((s) => ({ s, a: assignmentFor(s.id) }))
      .filter((x) => x.a.kind === 'project' && x.a.role === 'hero')
      .sort((x, y) => (x.a.kind === 'project' && y.a.kind === 'project' ? x.a.project.index - y.a.project.index : 0))
    const key = heroes[0]?.s ?? list.reduce((a, b) => (b.size > a.size ? b : a))
    const d = path.bestViewDist(key.center, key.normal, key.size)
    zones.push({
      id,
      label: LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1),
      center,
      routeTime: path.timeAtDist(d),
      key: key.id,
    })
  }
  return zones.sort((a, b) => a.routeTime - b.routeTime)
}
