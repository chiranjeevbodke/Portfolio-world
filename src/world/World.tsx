import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { parseWorld } from './parseWorld'
import { RoutePath } from '../lib/routePath'
import { WalkGrid } from '../lib/walkGrid'
import { computeZones } from '../lib/zones'
import { useStore } from '../lib/store'
import { DRACO } from '../lib/config'

export const WORLD_URL = '/models/world.glb'

export function World() {
  const gltf = useGLTF(WORLD_URL, DRACO)
  const parsed = useMemo(() => parseWorld(gltf.scene), [gltf.scene])
  const path = useMemo(() => {
    if (parsed.route.length < 2) {
      console.error('world.glb has no route_XX empties; scroll movement is disabled.')
      return null
    }
    return new RoutePath(parsed.route, parsed.slots.map((s) => s.center))
  }, [parsed])
  const walk = useMemo(() => {
    const grid = WalkGrid.build([...parsed.scenery, ...parsed.slots.flatMap((s) => s.meshes)])
    if (!grid) console.warn('No ground found in world.glb; collisions are disabled.')
    return grid
  }, [parsed])

  useEffect(() => {
    if (path) useStore.getState().setWorld(parsed, path, walk, computeZones(parsed.slots, path))
  }, [parsed, path, walk])

  return <primitive object={parsed.root} />
}

useGLTF.preload(WORLD_URL, DRACO)
