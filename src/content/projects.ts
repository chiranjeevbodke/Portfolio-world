import contentMap from '../../content_map.json'
import imageSizes from 'virtual:image-sizes'

// Content lives in /content/projects/<slug>/: a project.json plus any images / PDFs.
// Everything is picked up at build time, so adding a file and redeploying is enough.

type ProjectJson = {
  title?: string
  category?: string
  year?: string
  client?: string
  role?: string
  description?: string
  cover?: string
  images?: string[]
  caseStudy?: string | string[]
}

const jsons = import.meta.glob('/content/projects/*/project.json', { eager: true, import: 'default' }) as Record<string, ProjectJson>
const files = import.meta.glob('/content/projects/*/*.{jpg,jpeg,png,webp,avif,gif,svg,pdf,JPG,JPEG,PNG,WEBP,PDF}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export type CaseStudy = { kind: 'pdf'; url: string } | { kind: 'images'; urls: string[] } | { kind: 'link'; url: string }

export type Project = {
  slug: string
  index: number
  title: string
  category: string
  group: string
  zone: string
  hero: string
  frames: string[]
  description: string
  year: string
  client: string
  role: string
  cover: string | null
  images: string[]
  /** width / height of each image URL (read at build time), for fitting images to frames */
  aspects: Record<string, number>
  caseStudy: CaseStudy | null
  palette: [string, string] // placeholder colours until real images are added
}

export type SlotAssignment =
  | { kind: 'project'; project: Project; role: 'hero' | 'extra' | 'auto'; n: number }
  | { kind: 'fixed'; label: string; id: string }
  | { kind: 'spare' }

// Groups for the /work page, in this order. A category joins the first group whose name it starts with.
export const GROUPS = ['Events & branding', 'Packaging', 'Branding']

const PALETTES: [string, string][] = [
  ['#1d3557', '#f1c453'],
  ['#c8553d', '#fff3e0'],
  ['#0f6e6e', '#f6e7b4'],
  ['#2b2d42', '#ef8354'],
  ['#5a3d8a', '#ffcb47'],
  ['#e76f51', '#1f2f3a'],
  ['#2a9d8f', '#fbf4e4'],
  ['#9e2a2b', '#f5e6c8'],
  ['#3d405b', '#f2cc8f'],
  ['#1282a2', '#ffe08a'],
  ['#073b4c', '#7ce0b8'],
  ['#8a5a3b', '#f3e5d6'],
  ['#5f0f40', '#fb8b24'],
  ['#14213d', '#fca311'],
]

function fileUrl(slug: string, name?: string) {
  if (!name) return null
  if (/^https?:\/\//.test(name) || name.startsWith('/')) return name
  return files[`/content/projects/${slug}/${name}`] ?? null
}

function groupOf(category: string) {
  const c = category.toLowerCase()
  return GROUPS.find((g) => c === g.toLowerCase()) ?? GROUPS.find((g) => c.startsWith(g.toLowerCase())) ?? category
}

function caseStudyOf(slug: string, cs: ProjectJson['caseStudy']): CaseStudy | null {
  if (!cs || (Array.isArray(cs) && !cs.length)) return null
  if (Array.isArray(cs)) {
    const urls = cs.map((n) => fileUrl(slug, n)).filter((u): u is string => !!u)
    return urls.length ? { kind: 'images', urls } : null
  }
  if (/^https?:\/\//.test(cs)) return { kind: 'link', url: cs }
  const url = fileUrl(slug, cs)
  if (!url) return null
  return /\.pdf$/i.test(cs) ? { kind: 'pdf', url } : { kind: 'images', urls: [url] }
}

export const projects: Project[] = contentMap.projects.map((p, index) => {
  const j = jsons[`/content/projects/${p.slug}/project.json`] ?? {}
  const images = (j.images ?? []).map((n) => fileUrl(p.slug, n)).filter((u): u is string => !!u)
  const aspects: Record<string, number> = {}
  for (const name of [j.cover, ...(j.images ?? [])]) {
    const url = fileUrl(p.slug, name)
    const size = imageSizes[`/content/projects/${p.slug}/${name}`]
    if (url && size) aspects[url] = size.w / size.h
  }
  const category = j.category || p.category
  return {
    slug: p.slug,
    index,
    title: j.title || p.title,
    category,
    group: groupOf(category),
    zone: p.zone,
    hero: p.hero,
    frames: p.frames,
    description: j.description ?? '',
    year: j.year ?? '',
    client: j.client ?? '',
    role: j.role ?? '',
    cover: fileUrl(p.slug, j.cover) ?? images[0] ?? null,
    images,
    aspects,
    caseStudy: caseStudyOf(p.slug, j.caseStudy),
    palette: PALETTES[index % PALETTES.length],
  }
})

export const projectBySlug = new Map(projects.map((p) => [p.slug, p]))

const assignments = new Map<string, SlotAssignment>()
for (const p of projects) {
  assignments.set(p.hero, { kind: 'project', project: p, role: 'hero', n: 0 })
  p.frames.forEach((id, i) => assignments.set(id, { kind: 'project', project: p, role: 'extra', n: i + 1 }))
}
for (const [id, label] of Object.entries(contentMap.fixed ?? {})) assignments.set(id, { kind: 'fixed', label: String(label), id })

/** Frame plan for the loaded model: content_map.json assignments plus auto-filled spare frames. */
const plan = new Map<string, SlotAssignment>()

/** What a display frame shows. Frames not listed in content_map.json are treated as spare. */
export function assignmentFor(slotId: string): SlotAssignment {
  return plan.get(slotId) ?? assignments.get(slotId) ?? { kind: 'spare' }
}

/** true: spare frames rotate through all projects; false: they say "Coming soon" */
export const AUTO_FILL_SPARE = false
export const SPARE_MIN_GAP = 25 // metres: the same brand never shows twice closer than this

/**
 * Fill every spare frame with a project so each brand appears repeatedly around the city.
 * Hero and assigned frames never change. Rotates through all projects (least-shown first) and
 * never puts the same brand on two frames within SPARE_MIN_GAP metres.
 */
export function planFrames(slots: { id: string; center: { x: number; z: number } }[]) {
  plan.clear()
  if (!projects.length) return plan
  const placed: { slug: string; x: number; z: number }[] = []
  const uses = new Map(projects.map((p) => [p.slug, 0]))
  const spare: typeof slots = []
  for (const s of slots) {
    const a = assignments.get(s.id)
    if (a) {
      plan.set(s.id, a)
      if (a.kind === 'project') {
        placed.push({ slug: a.project.slug, x: s.center.x, z: s.center.z })
        uses.set(a.project.slug, (uses.get(a.project.slug) ?? 0) + 1)
      }
    } else spare.push(s)
  }
  // spare frames show "Coming soon" so every brand stays in its own area (flip to fill them)
  if (!AUTO_FILL_SPARE) return plan
  // deterministic order: sweep the city west to east, north to south
  spare.sort((a, b) => a.center.x - b.center.x || a.center.z - b.center.z || a.id.localeCompare(b.id))
  let turn = 0
  for (const s of spare) {
    const nearest = (slug: string) =>
      placed.reduce((m, q) => (q.slug === slug ? Math.min(m, Math.hypot(q.x - s.center.x, q.z - s.center.z)) : m), Infinity)
    const order = [...projects].sort(
      (a, b) => (uses.get(a.slug) ?? 0) - (uses.get(b.slug) ?? 0) || ((a.index - turn + 1000) % projects.length) - ((b.index - turn + 1000) % projects.length),
    )
    const pick = order.find((p) => nearest(p.slug) >= SPARE_MIN_GAP) ?? order.reduce((a, b) => (nearest(b.slug) > nearest(a.slug) ? b : a))
    const n = uses.get(pick.slug) ?? 0
    plan.set(s.id, { kind: 'project', project: pick, role: 'auto', n })
    uses.set(pick.slug, n + 1)
    placed.push({ slug: pick.slug, x: s.center.x, z: s.center.z })
    turn++
  }
  return plan
}

/** The image a frame shows (null = placeholder poster): assigned frames keep their image,
 * auto-filled frames use the project image whose shape is closest to the frame (then cover-cropped). */
export function imageForFrame(a: SlotAssignment, frameAspect: number): string | null {
  if (a.kind !== 'project') return null
  const p = a.project
  if (a.role === 'hero') return p.cover
  if (a.role === 'extra') return p.images[a.n] ?? p.cover
  const all = [...new Set([p.cover, ...p.images].filter((u): u is string => !!u))]
  if (!all.length) return null
  const score = (u: string) => Math.abs(Math.log((p.aspects[u] ?? 1.5) / frameAspect))
  const best = Math.min(...all.map(score))
  const close = all.filter((u) => score(u) <= best + 0.15) // near-ties rotate so repeats vary
  return close[a.n % close.length]
}

export function groupedProjects() {
  const order = [...GROUPS, ...new Set(projects.map((p) => p.group).filter((g) => !GROUPS.includes(g)))]
  return order.map((g) => ({ group: g, items: projects.filter((p) => p.group === g) })).filter((g) => g.items.length)
}
