import { create } from 'zustand'
import type { ParsedWorld } from '../world/parseWorld'
import type { RoutePath } from './routePath'
import type { WalkGrid } from './walkGrid'
import type { Zone } from './zones'

/** route: riding the scroll path · free: walking with joystick / keys · moving: a camera move in progress */
export type CameraMode = 'route' | 'free' | 'moving'

export type MapImage = { url: string; minX: number; maxX: number; minZ: number; maxZ: number }

type State = {
  world: ParsedWorld | null
  path: RoutePath | null
  walk: WalkGrid | null
  zones: Zone[]
  map: MapImage | null
  mode: CameraMode
  /** where scrolling wants the camera, in fly-through seconds */
  targetTime: number
  /** set once the visitor has scrolled (hides the hint) */
  hasScrolled: boolean
  setWorld: (world: ParsedWorld, path: RoutePath, walk: WalkGrid | null, zones: Zone[]) => void
  setMap: (map: MapImage) => void
  scrollBy: (seconds: number) => void
  setMode: (mode: CameraMode) => void
}

export const useStore = create<State>((set, get) => ({
  world: null,
  path: null,
  walk: null,
  zones: [],
  map: null,
  mode: 'route',
  targetTime: 0,
  hasScrolled: false,
  setWorld: (world, path, walk, zones) => set({ world, path, walk, zones }),
  setMap: (map) => set({ map }),
  scrollBy: (seconds) => {
    const { path, targetTime, hasScrolled } = get()
    if (!path) return
    const t = Math.max(0, Math.min(path.duration, targetTime + seconds))
    set({ targetTime: t, ...(hasScrolled ? {} : { hasScrolled: true }) })
  },
  setMode: (mode) => set({ mode }),
}))

/** Per-frame camera values, written by the rig and read by UI without React re-renders. */
export const live = {
  time: 0, // current fly-through time (seconds)
  progress: 0, // 0..1 along the route
  x: 0,
  z: 0,
  yaw: 0, // 0 = facing north (-Z), positive = turning left
}

if (import.meta.env.DEV) Object.assign(window, { __portfolio: { useStore, live } })
