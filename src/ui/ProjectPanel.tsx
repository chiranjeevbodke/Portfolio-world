import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { projects, type Project } from '../content/projects'
import { navigate } from '../lib/router'
import { Poster } from './Poster'

// Full project view over the world (or the /work grid). URL: /work/<slug>.

export function ProjectPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState(false)
  const closing = useRef(false)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tl = gsap.timeline()
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: reduced ? 0 : 0.35, ease: 'power2.out' })
    tl.fromTo(
      el.querySelectorAll('.panel__reveal'),
      { y: 28, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: reduced ? 0 : 0.7, ease: 'power3.out', stagger: 0.06 },
      reduced ? 0 : 0.08,
    )
    el.querySelector<HTMLElement>('.panel__close')?.focus({ preventScroll: true })
    return () => void tl.kill()
  }, [])

  const close = () => {
    if (closing.current) return
    closing.current = true
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.to(root.current, { autoAlpha: 0, duration: reduced ? 0 : 0.25, ease: 'power2.in', onComplete: onClose })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (viewer) setViewer(false)
      else close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const i = projects.indexOf(project)
  const next = projects[(i + 1) % projects.length]
  const prev = projects[(i - 1 + projects.length) % projects.length]
  const cs = project.caseStudy
  const meta = [
    ['Category', project.category],
    ['Client', project.client],
    ['Year', project.year],
    ['Role', project.role],
  ].filter(([, v]) => v)

  // gallery: real images, or three placeholders until they are added
  const gallery = project.images.length ? project.images : [null, null, null]

  return (
    <div ref={root} className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title" data-lenis-prevent>
      <div className="panel__backdrop" onClick={close} />
      <article className="panel__sheet">
        <header className="panel__bar">
          <span className="panel__crumb">
            {String(project.index + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}
          </span>
          <button className="panel__close" onClick={close} aria-label="Close project">
            <span aria-hidden>×</span> Close
          </button>
        </header>

        <div className="panel__hero panel__reveal">
          {project.cover ? (
            <img src={project.cover} alt={`${project.title} cover`} decoding="async" />
          ) : (
            <Poster project={project} aspect={2} />
          )}
        </div>

        <div className="panel__intro">
          <p className="panel__kicker panel__reveal">{project.category}</p>
          <h1 id="panel-title" className="panel__title panel__reveal">
            {project.title}
          </h1>
          <div className="panel__cols">
            <p className="panel__desc panel__reveal">{project.description}</p>
            <dl className="panel__meta panel__reveal">
              {meta.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {cs && (
            <div className="panel__reveal">
              {cs.kind === 'images' ? (
                <button className="btn btn--primary" onClick={() => setViewer(true)}>
                  Read case study <span aria-hidden>→</span>
                </button>
              ) : (
                <a className="btn btn--primary" href={cs.url} target="_blank" rel="noreferrer">
                  Read case study <span aria-hidden>↗</span>
                </a>
              )}
            </div>
          )}
        </div>

        <section className="panel__gallery" aria-label="Gallery">
          {gallery.map((src, n) =>
            src ? (
              <figure key={n} className="panel__reveal">
                <img src={src} alt={`${project.title}, image ${n + 1}`} loading="lazy" decoding="async" />
              </figure>
            ) : (
              <figure key={n} className="panel__placeholder panel__reveal">
                <Poster project={project} aspect={n === 0 ? 16 / 9 : 4 / 3} variant={n + 1} />
                <figcaption>
                  Image {n + 1}: add files to <code>content/projects/{project.slug}/</code>
                </figcaption>
              </figure>
            ),
          )}
        </section>

        <nav className="panel__next" aria-label="More projects">
          <button onClick={() => navigate(`/work/${prev.slug}`, { replace: true })}>
            <span>Previous</span>
            <strong>{prev.title}</strong>
          </button>
          <button onClick={() => navigate(`/work/${next.slug}`, { replace: true })}>
            <span>Next</span>
            <strong>{next.title}</strong>
          </button>
        </nav>
      </article>

      {viewer && cs?.kind === 'images' && (
        <div className="viewer" role="dialog" aria-label={`${project.title} case study`} data-lenis-prevent>
          <button className="viewer__close" onClick={() => setViewer(false)}>
            <span aria-hidden>×</span> Close
          </button>
          <div className="viewer__pages">
            {cs.urls.map((u, n) => (
              <img key={u} src={u} alt={`${project.title} case study, page ${n + 1}`} loading={n < 2 ? 'eager' : 'lazy'} decoding="async" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
