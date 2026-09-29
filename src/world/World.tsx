import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { parseWorld } from './parseWorld'
import { RoutePath } from '../lib/routePath'
import { useStore } from '../lib/store'

export const WORLD_URL = '/models/world.glb'

export function World() {
  const gltf = useGLTF(WORLD_URL)
  const parsed = useMemo(() => parseWorld(gltf.scene), [gltf.scene])
  const path = useMemo(() => {
    if (parsed.route.length < 2) {
      console.error('world.glb has no route_XX empties; scroll movement is disabled.')
      return null
    }
    return new RoutePath(parsed.route, parsed.slots.map((s) => s.center))
  }, [parsed])

  useEffect(() => {
    if (path) useStore.getState().setWorld(parsed, path)
  }, [parsed, path])

  return <primitive object={parsed.root} />
}

useGLTF.preload(WORLD_URL)
