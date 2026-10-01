import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { groupedProjects, projects } from '../content/projects'
import { navigate } from '../lib/router'
import { Poster } from './Poster'

// "Skip the game": every project in a simple grid, grouped by category.
// Also the fallback for slow devices and reduced motion.

export function WorkPage({ can3D }: { can3D: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced || !root.current) return
    const tween = gsap.fromTo(
      root.current.querySelectorAll('.work__reveal'),
      { y: 24, autoAlpha: 0 },
      { y: 0, autoAlpha: 1, duration: 0.7, ease: 'power3.out', stagger: 0.04 },
    )
    return () => void tween.kill()
  }, [])

  const go3D = (e: React.MouseEvent) => {
    e.preventDefault()
    sessionStorage.setItem('force3d', '1')
    if (can3D) navigate('/')
    else location.href = '/'
  }

  return (
    <div ref={root} className="work" data-lenis-prevent>
      <header className="work__top">
        <a href="/" className="brand__name" onClick={go3D}>
          Chiranjeev
        </a>
        <a href="/" className="btn btn--ghost" onClick={go3D}>
          Walk the neighbourhood <span aria-hidden>→</span>
        </a>
      </header>
      <section className="work__intro work__reveal">
        <p className="work__kicker">Selected work · {projects.length} projects</p>
        <h1 className="work__title">
          Associate creative director, Mumbai. Events, packaging and brand identity.
        </h1>
      </section>
      {groupedProjects().map(({ group, items }) => (
        <section key={group} className="work__group">
          <h2 className="work__group-title work__reveal">
            {group} <span>{String(items.length).padStart(2, '0')}</span>
          </h2>
          <ul className="work__grid">
            {items.map((p) => (
              <li key={p.slug} className="work__reveal">
                <a
                  className="card"
                  href={`/work/${p.slug}`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate(`/work/${p.slug}`)
                  }}
                >
                  <div className="card__media">
                    {p.cover ? <img src={p.cover} alt="" loading="lazy" decoding="async" /> : <Poster project={p} aspect={4 / 3} />}
                  </div>
                  <div className="card__text">
                    <strong>{p.title}</strong>
                    <span>{p.category}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer className="work__foot">© Chiranjeev · Mumbai</footer>
    </div>
  )
}
