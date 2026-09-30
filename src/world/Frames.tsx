import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore, live } from '../lib/store'
import { assignmentFor, imageForFrame, type SlotAssignment } from '../content/projects'
import { drawPoster, whenFontsReady, type PosterSpec } from '../lib/posters'
import type { Slot } from './parseWorld'

// Puts artwork on every display frame (slot_* mesh), highlights the frame the visitor is
// looking at, and lets it be clicked. Uses real images from content/ when present
// (loaded lazily as the visitor gets close), otherwise a printed-hoarding style placeholder.

export type FrameEntry = {
  slot: Slot
  assignment: SlotAssignment
  clickable: boolean
  title: string
  materials: THREE.MeshBasicMaterial[]
  glow: THREE.Mesh
  top: THREE.Vector3
  radius: number // how close you need to be for the frame to take focus
  face: THREE.Vector3 // the side the artwork reads correctly from (towards the route)
  mirror: boolean // artwork printed on the back of the model's frame so it reads from the route
  imageUrl: string | null
  imageState: 'none' | 'loading' | 'done'
  highlight: number
}

export const frames: FrameEntry[] = []
export const pointer = { hoverId: null as string | null }

const GLOW = new THREE.Color('#ffd79a')
const FOCUS_ANGLE = 0.62 // cos of the angle from view centre within which a frame can take focus
const IMAGE_LOAD_DIST = 60 // images load when the visitor is this close
const tmp = { fwd: new THREE.Vector3(), to: new THREE.Vector3(), label: new THREE.Vector3() }
let loadTimer = 0

function posterFor(slot: Slot, a: SlotAssignment): PosterSpec {
  const id = slot.id
  if (a.kind === 'project') {
    const p = a.project
    const [bg, fg] = a.role === 'hero' || a.n % 2 === 0 ? p.palette : [p.palette[1], p.palette[0]]
    return {
      aspect: slot.aspect,
      bg,
      fg,
      kicker: p.category,
      title: p.title,
      number: String(p.index + 1).padStart(2, '0'),
      footer: `${id}  ·  View project →`,
    }
  }
  if (a.kind === 'fixed') {
    if (id.endsWith('name-sign')) {
      return { aspect: slot.aspect, bg: '#2b211c', fg: '#ffd9a8', kicker: 'Studio', title: 'Chiranjeev', footer: 'Associate creative director · Mumbai' }
    }
    return { aspect: slot.aspect, bg: '#fff4e6', fg: '#2b211c', kicker: 'About', title: a.label.replace(/^About:\s*/i, ''), footer: id }
  }
  return { aspect: slot.aspect, bg: '#ebe2d3', fg: '#6f6258', kicker: 'This space', title: 'Coming soon', footer: id, muted: true }
}

function coverFit(tex: THREE.Texture, imgAspect: number, frameAspect: number, mirror: boolean) {
  tex.repeat.set(1, 1)
  tex.offset.set(0, 0)
  if (imgAspect > frameAspect) {
    tex.repeat.x = frameAspect / imgAspect
    tex.offset.x = (1 - tex.repeat.x) / 2
  } else if (imgAspect < frameAspect) {
    tex.repeat.y = imgAspect / frameAspect
    tex.offset.y = (1 - tex.repeat.y) / 2
  }
  // seen from behind, a double-sided frame shows the image flipped; flip it back
  if (mirror) {
    tex.offset.x += tex.repeat.x
    tex.repeat.x = -tex.repeat.x
  }
}

/** Does the visitor on the route see this frame from its back? Decided by the side they approach it from. */
function seenFromBack(slot: Slot, path: { dense: THREE.Vector3[] } | null) {
  if (!path) return false
  const c = slot.center, n = slot.normal
  let vote = 0
  for (let i = 1; i < path.dense.length; i++) {
    const p = path.dense[i], q = path.dense[i - 1]
    const dx = p.x - c.x, dz = p.z - c.z
    const d = Math.hypot(dx, dz)
    if (d > 25 || d < 0.5) continue
    // only where the frame is ahead of the visitor (that is when it gets read)
    if ((c.x - p.x) * (p.x - q.x) + (c.z - p.z) * (p.z - q.z) <= 0) continue
    vote += Math.sign(dx * n.x + dz * n.z) / d
  }
  return vote < 0
}

export function Frames() {
  const world = useStore((s) => s.world)
  const path = useStore((s) => s.path)
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    if (!world) return
    let cancelled = false
    const created: { dispose(): void }[] = []
    const aniso = Math.min(8, gl.capabilities.getMaxAnisotropy())

    whenFontsReady().then(() => {
      if (cancelled) return
      frames.length = 0
      for (const slot of world.slots) {
        const a = assignmentFor(slot.id)
        const mirror = seenFromBack(slot, path)
        const tex = new THREE.CanvasTexture(drawPoster(posterFor(slot, a)))
        tex.flipY = false // glTF UVs
        if (mirror) coverFit(tex, 1, 1, true)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = aniso
        created.push(tex)

        const materials = slot.meshes.map((m) => {
          const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })
          mat.color.setScalar(0.9)
          m.material = mat
          m.castShadow = false
          m.receiveShadow = false
          created.push(mat)
          return mat
        })

        // soft rim of light just behind the artwork, faded in when the frame has focus
        const src = slot.meshes[0]
        const g = src.geometry.clone()
        g.computeBoundingBox()
        const c = g.boundingBox!.getCenter(new THREE.Vector3())
        g.translate(-c.x, -c.y, -c.z).scale(1.07, 1.07, 1.07).translate(c.x, c.y, c.z)
        const glowMat = new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })
        const glow = new THREE.Mesh(g, glowMat)
        src.updateWorldMatrix(true, false)
        src.matrixWorld.decompose(glow.position, glow.quaternion, glow.scale)
        glow.position.addScaledVector(slot.normal, mirror ? 0.03 : -0.03)
        glow.renderOrder = -0.5
        glow.visible = false
        world.root.add(glow)
        created.push(g, glowMat, { dispose: () => world.root.remove(glow) })

        const box = new THREE.Box3()
        for (const m of slot.meshes) box.expandByObject(m)
        const size = box.getSize(new THREE.Vector3()).length()
        const imageUrl = imageForFrame(a, slot.aspect)
        frames.push({
          slot,
          assignment: a,
          clickable: a.kind === 'project',
          title: a.kind === 'project' ? a.project.title : '',
          materials,
          glow,
          top: new THREE.Vector3(slot.center.x, box.max.y, slot.center.z),
          radius: 9 + size * 1.1,
          face: mirror ? slot.normal.clone().negate() : slot.normal,
          mirror,
          imageUrl,
          imageState: imageUrl ? 'none' : 'done',
          highlight: 0,
        })
      }
      useStore.getState().setFramesReady(true)
    })

    return () => {
      cancelled = true
      frames.length = 0
      created.forEach((d) => d.dispose())
    }
  }, [world, path, gl])

  useFrame(({ camera }, dt) => {
    if (!frames.length) return
    const fwd = camera.getWorldDirection(tmp.fwd)
    const mode = useStore.getState().mode
    let best: FrameEntry | null = null, bestScore = 0
    for (const f of frames) {
      if (!f.clickable) continue
      const to = tmp.to.subVectors(f.slot.center, camera.position)
      const d = to.length()
      if (d > f.radius) continue
      to.divideScalar(d)
      const inView = to.dot(fwd)
      const facing = -to.dot(f.face) // artwork faces the visitor
      if (inView < FOCUS_ANGLE || facing < 0.05) continue
      const score = inView * (1 - d / f.radius)
      if (score > bestScore) {
        bestScore = score
        best = f
      }
    }
    if (mode === 'moving') best = null
    const hovered = pointer.hoverId ? frames.find((f) => f.slot.id === pointer.hoverId) ?? null : null
    const focus = hovered ?? best
    const focusId = focus?.slot.id ?? null
    if (useStore.getState().focusId !== focusId) useStore.getState().setFocusId(focusId)

    const k = 1 - Math.exp(-6 * dt)
    for (const f of frames) {
      const target = f === focus ? 1 : 0
      f.highlight += (target - f.highlight) * k
      const v = 0.9 + 0.12 * f.highlight
      for (const m of f.materials) m.color.setScalar(v)
      const gm = f.glow.material as THREE.MeshBasicMaterial
      gm.opacity = 0.9 * f.highlight
      f.glow.visible = f.highlight > 0.01
    }

    // label anchored above the focused frame
    if (focus) {
      const p = tmp.label.copy(focus.top).project(camera)
      live.label.visible = p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2
      live.label.x = (p.x * 0.5 + 0.5) * 100
      live.label.y = (-p.y * 0.5 + 0.5) * 100
    } else live.label.visible = false

    // lazy-load real artwork as the visitor gets close
    loadTimer += dt
    if (loadTimer > 0.5) {
      loadTimer = 0
      for (const f of frames) {
        if (f.imageState !== 'none' || !f.imageUrl) continue
        if (f.slot.center.distanceTo(camera.position) > IMAGE_LOAD_DIST) continue
        f.imageState = 'loading'
        new THREE.TextureLoader().load(
          f.imageUrl,
          (tex) => {
            tex.flipY = false
            tex.colorSpace = THREE.SRGBColorSpace
            tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
            const img = tex.image as HTMLImageElement
            coverFit(tex, img.width / img.height, f.slot.aspect, f.mirror)
            for (const m of f.materials) {
              m.map?.dispose()
              m.map = tex
              m.needsUpdate = true
            }
            f.imageState = 'done'
          },
          undefined,
          () => (f.imageState = 'done'),
        )
      }
    }
  })

  return null
}


/** Frame under a screen point (NDC), nearest first. */
const raycaster = new THREE.Raycaster()
export function pickFrame(ndc: THREE.Vector2, camera: THREE.Camera): FrameEntry | null {
  raycaster.setFromCamera(ndc, camera)
  raycaster.far = 120
  const meshes = frames.flatMap((f) => f.slot.meshes)
  const hit = raycaster.intersectObjects(meshes, false)[0]
  if (!hit) return null
  return frames.find((f) => f.slot.meshes.includes(hit.object as THREE.Mesh)) ?? null
}
