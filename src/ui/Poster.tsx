import { useEffect, useState } from 'react'
import type { Project } from '../content/projects'
import { drawPoster, whenFontsReady } from '../lib/posters'

const cache = new Map<string, string>()

/** The same placeholder artwork the hoardings show, as an <img>. */
export function Poster({ project, aspect, variant = 0 }: { project: Project; aspect: number; variant?: number }) {
  const key = `${project.slug}|${aspect.toFixed(3)}|${variant}`
  const [url, setUrl] = useState(() => cache.get(key) ?? '')
  useEffect(() => {
    if (cache.has(key)) return setUrl(cache.get(key)!)
    let alive = true
    whenFontsReady().then(() => {
      const [bg, fg] = variant % 2 ? [project.palette[1], project.palette[0]] : project.palette
      const c = drawPoster(
        {
          aspect,
          bg,
          fg,
          kicker: project.category,
          title: project.title,
          number: String(project.index + 1).padStart(2, '0'),
          footer: variant ? `Placeholder ${variant + 1}` : 'Cover placeholder',
        },
        900,
      )
      c.toBlob((b) => {
        if (!b || !alive) return
        const u = URL.createObjectURL(b)
        cache.set(key, u)
        setUrl(u)
      })
    })
    return () => {
      alive = false
    }
  }, [key, project, aspect, variant])
  return (
    <div className="poster" style={{ aspectRatio: String(aspect), background: project.palette[0] }}>
      {url && <img src={url} alt="" />}
    </div>
  )
}
