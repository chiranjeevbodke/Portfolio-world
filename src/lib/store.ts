import { create } from 'zustand'
import type { ParsedWorld } from '../world/parseWorld'
import type { RoutePath } from './routePath'

export type CameraMode = 'route' | 'free'

type State = {
  world: ParsedWorld | null
  path: RoutePath | null
  mode: CameraMode
  /** where scrolling wants the camera, in fly-through seconds */
  targetTime: number
  /** set once the visitor has scrolled (hides the hint) */
  hasScrolled: boolean
  setWorld: (world: ParsedWorld, path: RoutePath) => void
  scrollBy: (seconds: number) => void
  setMode: (mode: CameraMode) => void
}

export const useStore = create<State>((set, get) => ({
  world: null,
  path: null,
  mode: 'route',
  targetTime: 0,
  hasScrolled: false,
  setWorld: (world, path) => set({ world, path }),
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
}

if (import.meta.env.DEV) Object.assign(window, { __portfolio: { useStore, live } })
