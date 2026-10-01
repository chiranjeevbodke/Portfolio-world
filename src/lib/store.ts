import { create } from 'zustand'
import { SCROLL } from './config'
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
  setTargetTime: (seconds: number) => void
  setMode: (mode: CameraMode) => void
  /** artwork is on the frames */
  framesReady: boolean
  setFramesReady: (v: boolean) => void
  /** the display frame the visitor is looking at / hovering (slot id) */
  focusId: string | null
  setFocusId: (id: string | null) => void
}

export const useStore = create<State>((set, get) => ({
  world: null,
  path: null,
  walk: null,
  zones: [],
  map: null,
  mode: 'route',
  targetTime: -SCROLL.INTRO_SECONDS,
  hasScrolled: false,
  setWorld: (world, path, walk, zones) => set({ world, path, walk, zones }),
  setMap: (map) => set({ map }),
  setTargetTime: (t) => set({ targetTime: t, ...(t > 0.3 - SCROLL.INTRO_SECONDS && !get().hasScrolled ? { hasScrolled: true } : {}) }),
  setMode: (mode) => set({ mode }),
  framesReady: false,
  setFramesReady: (framesReady) => set({ framesReady }),
  focusId: null,
  setFocusId: (focusId) => set({ focusId }),
}))

/** Per-frame camera values, written by the rig and read by UI without React re-renders. */
export const live = {
  time: -SCROLL.INTRO_SECONDS, // current fly-through time (seconds); negative = the opening swoop
  progress: 0, // 0..1 along the route
  x: 0,
  z: 0,
  yaw: 0, // 0 = facing north (-Z), positive = turning left
  /** screen position (%) of the focused frame's label */
  label: { x: 50, y: 50, visible: false },
}

if (import.meta.env.DEV) Object.assign(window, { __portfolio: { useStore, live } })
