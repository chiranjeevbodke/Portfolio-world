import { Component, useEffect, useMemo, type ReactNode } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { parseWorld, type ParsedWorld } from './parseWorld'
import { RoutePath } from '../lib/routePath'
import { WalkGrid } from '../lib/walkGrid'
import { computeZones } from '../lib/zones'
import { planFrames } from '../content/projects'
import { useStore } from '../lib/store'
import { DRACO, WORLD_FALLBACK_URL, WORLD_URL } from '../lib/config'

// The city model. v7 is Meshopt-compressed (drei's useGLTF decodes Meshopt and Draco);
// if it can't be loaded we fall back to the uncompressed export.

/** Opening aerial shot: from cam_intro / cam_intro_target if the model has them,
 * otherwise high behind the start of the route, looking over the neighbourhood. */
function introFor(parsed: ParsedWorld, path: RoutePath) {
  if (parsed.intro) return parsed.intro
  const start = path.pointAt(0)
  const centre = new THREE.Vector3()
  for (const s of parsed.slots) centre.add(s.center)
  centre.divideScalar(Math.max(1, parsed.slots.length))
  centre.y = 0
  const away = new THREE.Vector3(start.x - centre.x, 0, start.z - centre.z)
  if (away.lengthSq() < 1) away.set(-1, 0, 1)
  away.normalize()
  const position = new THREE.Vector3(start.x, 0, start.z).addScaledVector(away, 75).setY(60)
  const target = new THREE.Vector3().lerpVectors(new THREE.Vector3(start.x, 0, start.z), centre, 0.45)
  return { position, target }
}

function WorldModel({ url }: { url: string }) {
  const gltf = useGLTF(url, DRACO)
  const parsed = useMemo(() => parseWorld(gltf.scene), [gltf.scene])
  const walk = useMemo(() => {
    const grid = WalkGrid.build(parsed.colliders)
    if (!grid) console.warn('No ground found in the city model; collisions are disabled.')
    // only the streets you can actually reach from the route (not the insides of closed buildings)
    else grid.keepReachable(parsed.route)
    return grid
  }, [parsed])
  const path = useMemo(() => {
    if (parsed.route.length < 2) {
      console.error(`${url} has no route_XX empties; scroll movement is disabled.`)
      return null
    }
    // always rebuilt from the route_XX empties in the loaded file
    // the path steers around anything standing on it (stalls, benches) instead of passing through
    return new RoutePath(parsed.route, parsed.slots.map((s) => s.center), walk)
  }, [parsed, url, walk])

  useEffect(() => {
    if (!path) return
    parsed.intro = introFor(parsed, path)
    planFrames(parsed.slots)
    useStore.getState().setWorld(parsed, path, walk, computeZones(parsed.slots, path))
  }, [parsed, path, walk])

  return <primitive object={parsed.root} />
}

class FallbackOnError extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn(`[world] Could not load ${WORLD_URL}; using the uncompressed ${WORLD_FALLBACK_URL} instead.`, error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function World() {
  return (
    <FallbackOnError fallback={<WorldModel url={WORLD_FALLBACK_URL} />}>
      <WorldModel url={WORLD_URL} />
    </FallbackOnError>
  )
}

useGLTF.preload(WORLD_URL, DRACO)
