import { useSyncExternalStore } from 'react'

// Tiny history router: "/", "/work", "/work/<slug>".

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
window.addEventListener('popstate', emit)

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  if (path === location.pathname) return
  if (opts.replace) history.replaceState(null, '', path)
  else history.pushState(null, '', path)
  emit()
}

export function usePath() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => location.pathname,
  )
}

export function parsePath(path: string) {
  const clean = path.replace(/\/+$/, '') || '/'
  const m = clean.match(/^\/work\/([^/]+)$/)
  if (m) return { page: 'project' as const, slug: decodeURIComponent(m[1]) }
  if (clean === '/work') return { page: 'work' as const, slug: null }
  if (clean === '/debug/frames') return { page: 'debug' as const, slug: null }
  return { page: 'world' as const, slug: null }
}
