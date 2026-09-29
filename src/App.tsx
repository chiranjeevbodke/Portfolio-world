import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { navigate, parsePath, usePath } from './lib/router'
import { projectBySlug } from './content/projects'
import { ProjectPanel } from './ui/ProjectPanel'
import { WorkPage } from './ui/WorkPage'

// three.js is only downloaded when the 3D world is actually shown
const Experience = lazy(() => import('./world/Experience'))

function canRun3D() {
  if (sessionStorage.getItem('force3d') === '1') return true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const nav = navigator as Navigator & { deviceMemory?: number }
  if (nav.deviceMemory && nav.deviceMemory <= 2) return false
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

export default function App() {
  const path = usePath()
  const route = parsePath(path)
  const [can3D] = useState(canRun3D)
  const [slow, setSlow] = useState(false)
  // what sits underneath a project panel: the world or the /work grid
  const base = useRef<'world' | 'work'>(route.page === 'work' || !can3D ? 'work' : 'world')
  if (route.page === 'world') base.current = 'world'
  if (route.page === 'work') base.current = 'work'

  // slow devices and reduced motion get the simple /work page
  useEffect(() => {
    if (route.page === 'world' && !can3D) navigate('/work', { replace: true })
  }, [route.page, can3D])

  const slug = route.page === 'project' ? route.slug : null
  const project = slug ? projectBySlug.get(slug) ?? null : null
  useEffect(() => {
    if (slug && !project) navigate(base.current === 'work' ? '/work' : '/', { replace: true })
  }, [slug, project])

  const showWorld = can3D && base.current === 'world'
  const showWork = base.current === 'work'
  const overlayOpen = !!project || showWork

  useEffect(() => {
    document.body.classList.toggle('has-overlay', overlayOpen)
    document.title = project ? `${project.title} · Chiranjeev` : showWork ? 'Work · Chiranjeev' : 'Chiranjeev · Portfolio'
  }, [overlayOpen, project, showWork])

  const [worldMounted, setWorldMounted] = useState(showWorld)
  useEffect(() => {
    if (showWorld) setWorldMounted(true)
  }, [showWorld])

  return (
    <>
      {can3D && worldMounted && (
        <div className={`world-layer ${showWorld ? '' : 'is-hidden'}`}>
          <Suspense fallback={null}>
            <Experience paused={overlayOpen} onSlow={() => setSlow(true)} />
          </Suspense>
        </div>
      )}
      {showWork && <WorkPage can3D={can3D} />}
      {project && (
        <ProjectPanel
          key={project.slug}
          project={project}
          onClose={() => navigate(base.current === 'work' ? '/work' : '/')}
        />
      )}
      {slow && showWorld && !overlayOpen && (
        <div className="toast" role="status">
          Running slowly on this device?{' '}
          <a href="/work" onClick={(e) => (e.preventDefault(), navigate('/work'))}>
            Switch to the simple view
          </a>
          <button aria-label="Dismiss" onClick={() => setSlow(false)}>
            ×
          </button>
        </div>
      )}
    </>
  )
}
