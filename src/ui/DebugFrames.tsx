import { useStore } from '../lib/store'
import { assignmentFor, imageForFrame, SPARE_MIN_GAP } from '../content/projects'
import { navigate } from '../lib/router'
import { WORLD_URL } from '../lib/config'

// /debug/frames: every display frame in the loaded model, what it shows and why.

export function DebugFrames() {
  const world = useStore((s) => s.world)
  const slots = world ? [...world.slots].sort((a, b) => a.id.localeCompare(b.id)) : []

  const rows = slots.map((s) => {
    const a = assignmentFor(s.id)
    const project = a.kind === 'project' ? a.project : null
    // nearest other frame showing the same brand (auto-fill keeps this >= SPARE_MIN_GAP)
    let nearestSame = Infinity
    if (project) {
      for (const o of slots) {
        if (o === s) continue
        const b = assignmentFor(o.id)
        if (b.kind === 'project' && b.project.slug === project.slug) nearestSame = Math.min(nearestSame, Math.hypot(o.center.x - s.center.x, o.center.z - s.center.z))
      }
    }
    return {
      id: s.id,
      aspect: s.aspect,
      how: a.kind === 'project' ? (a.role === 'hero' ? 'hero' : a.role === 'extra' ? 'assigned' : 'auto-filled') : a.kind,
      project: project ? project.title : a.kind === 'fixed' ? a.label : '—',
      image: imageForFrame(a, s.aspect) ?? (project ? 'placeholder poster (no image in content/ yet)' : a.kind === 'fixed' ? 'name / about card' : 'coming soon card'),
      nearestSame,
      pos: `${s.center.x.toFixed(1)}, ${s.center.z.toFixed(1)}`,
    }
  })
  const counts = new Map<string, number>()
  for (const r of rows) if (r.how !== 'fixed' && r.project !== '—') counts.set(r.project, (counts.get(r.project) ?? 0) + 1)
  const violations = rows.filter((r) => r.how === 'auto-filled' && r.nearestSame < SPARE_MIN_GAP)

  return (
    <div className="debug" data-lenis-prevent>
      <header className="debug__top">
        <strong>/debug/frames</strong>
        <span>
          {WORLD_URL} · {slots.length} frames · {world?.route.length ?? 0} route points
        </span>
        <button className="btn btn--sm btn--primary" onClick={() => navigate('/')}>
          Back to the city
        </button>
      </header>
      {!world ? (
        <p>Loading the model…</p>
      ) : (
        <>
          <p className="debug__note">
            Auto-filled frames rotate through every project; the same brand is never within {SPARE_MIN_GAP} m of itself
            {violations.length ? ` (${violations.length} frames could not meet this)` : ' (all frames meet this)'}.
          </p>
          <p className="debug__note">
            {[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ×${n}`).join(' · ')}
          </p>
          <table className="debug__table">
            <thead>
              <tr>
                <th>Frame id</th>
                <th>Aspect</th>
                <th>How</th>
                <th>Project</th>
                <th>Image used</th>
                <th>Nearest same brand</th>
                <th>x, z</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.id}</code>
                  </td>
                  <td>{r.aspect.toFixed(2)}</td>
                  <td>{r.how}</td>
                  <td>{r.project}</td>
                  <td>{r.image}</td>
                  <td>{Number.isFinite(r.nearestSame) ? `${r.nearestSame.toFixed(0)} m` : '—'}</td>
                  <td>{r.pos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
