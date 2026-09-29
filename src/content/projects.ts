import contentMap from '../../content_map.json'

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
  caseStudy: CaseStudy | null
  palette: [string, string] // placeholder colours until real images are added
}

export type SlotAssignment =
  | { kind: 'project'; project: Project; role: 'hero' | 'extra'; n: number }
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

/** What a display frame shows. Frames not listed in content_map.json are treated as spare. */
export function assignmentFor(slotId: string): SlotAssignment {
  return assignments.get(slotId) ?? { kind: 'spare' }
}

export function groupedProjects() {
  const order = [...GROUPS, ...new Set(projects.map((p) => p.group).filter((g) => !GROUPS.includes(g)))]
  return order.map((g) => ({ group: g, items: projects.filter((p) => p.group === g) })).filter((g) => g.items.length)
}
