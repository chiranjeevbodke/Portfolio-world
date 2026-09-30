import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Reads world.glb purely by naming convention, so the detailed models can
// replace the blockout without code changes:
//   slot_<zone>__<id>  display frames (custom props slot_id, aspect)
//   route_00, route_01 ... scroll route empties
// Everything else is static scenery: it is re-shaded flat and merged by
// material to keep draw calls low on phones.
// Works with plain, Draco and Meshopt (quantized) exports, with or without normals:
// flat shading comes from the material, so no normals are ever computed.

export type Slot = {
  id: string // e.g. "bazaar/shop-sign-01"
  zone: string
  aspect: number
  object: THREE.Object3D // the slot mesh (or group of meshes)
  meshes: THREE.Mesh[]
  center: THREE.Vector3 // world-space centre
  normal: THREE.Vector3 // world-space direction the image faces
  size: number // bounding-box diagonal (m)
}

export type ParsedWorld = {
  root: THREE.Group
  scenery: THREE.Mesh[] // merged static meshes (also used for collisions / map later)
  slots: Slot[]
  route: THREE.Vector3[]
  bounds: THREE.Box3
  /** spots where an animated animal loops in place: life_<kind>__<id> */
  lifeSpots: { kind: string; id: string; position: THREE.Vector3; yaw: number }[]
  /** loops for moving life: lifepath_<name>_00, _01 ... (props on _00: kind, count, speed) */
  lifePaths: { name: string; kind: string; count: number; speed: number; points: THREE.Vector3[] }[]
  /** cloud_* meshes (kept separate so they can drift) */
  clouds: THREE.Object3D[]
  /** opening aerial shot: cam_intro / cam_intro_target */
  intro: { position: THREE.Vector3; target: THREE.Vector3 } | null
  /** original meshes for collisions: ground* is floor only, sea* marks water (never walkable,
   * never a wall), slot_* frames are left out */
  colliders: { mesh: THREE.Mesh; role: 'floor' | 'water' | 'any' }[]
}

const SLOT_RE = /^slot_([a-z0-9-]+)__(.+)$/i
const ROUTE_RE = /^route_(\d+)/i
const LIFE_RE = /^life_([a-z]+)__(.+)$/i
const LIFEPATH_RE = /^lifepath_(.+)_(\d+)$/i

function slotIdFrom(obj: THREE.Object3D): { id: string; zone: string } | null {
  const ud = obj.userData ?? {}
  if (typeof ud.slot_id === 'string' && ud.slot_id.includes('/')) {
    return { id: ud.slot_id, zone: ud.slot_id.split('/')[0] }
  }
  const m = obj.name.match(SLOT_RE)
  return m ? { id: `${m[1]}/${m[2]}`, zone: m[1] } : null
}

/** Quantized (Meshopt / KHR_mesh_quantization) attributes -> plain floats, so geometry can be
 * transformed and merged without clamping. Values are unchanged. */
function dequantize(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute
    const interleaved = (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true
    const plain = !interleaved && (a as THREE.BufferAttribute).array instanceof Float32Array && !a.normalized
    if (plain) continue
    // getX..getW undo normalization for both plain and interleaved attributes
    const get = [a.getX, a.getY, a.getZ, a.getW]
    const out = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = get[k].call(a, i)
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize))
  }
  return g
}

export function toFlatMaterial(src: THREE.Material): THREE.Material {
  const s = src as THREE.MeshStandardMaterial
  const m = new THREE.MeshLambertMaterial({
    name: src.name,
    color: s.color ? s.color.clone() : new THREE.Color('#ffffff'),
    map: s.map ?? null,
    emissive: s.emissive ? s.emissive.clone() : undefined,
    emissiveMap: s.emissiveMap ?? null,
    emissiveIntensity: s.emissiveIntensity ?? 1,
    vertexColors: s.vertexColors,
    transparent: s.transparent,
    opacity: s.opacity,
    alphaTest: s.alphaTest,
    side: s.side,
    flatShading: true,
  })
  return m
}

function faceNormal(meshes: THREE.Mesh[]): THREE.Vector3 {
  // Area-weighted average of world-space triangle normals.
  const n = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const ab = new THREE.Vector3(), ac = new THREE.Vector3()
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position')
    const idx = mesh.geometry.getIndex()
    const count = idx ? idx.count : pos.count
    for (let i = 0; i + 2 < count; i += 3) {
      const i0 = idx ? idx.getX(i) : i
      const i1 = idx ? idx.getX(i + 1) : i + 1
      const i2 = idx ? idx.getX(i + 2) : i + 2
      a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld)
      n.add(ab.subVectors(b, a).cross(ac.subVectors(c, a)))
    }
  }
  if (n.lengthSq() < 1e-8) n.set(0, 0, 1)
  return n.normalize()
}

export function parseWorld(scene: THREE.Object3D): ParsedWorld {
  scene.updateMatrixWorld(true)

  const root = new THREE.Group()
  root.name = 'world'
  const slots: Slot[] = []
  const routeNodes: { n: number; p: THREE.Vector3 }[] = []
  const staticMeshes: THREE.Mesh[] = []
  const slotObjects = new Set<THREE.Object3D>()
  const lifeSpots: ParsedWorld['lifeSpots'] = []
  const pathNodes = new Map<string, { props: Record<string, unknown>; nodes: { n: number; p: THREE.Vector3 }[] }>()
  const cloudSources: THREE.Object3D[] = []
  let introPos: THREE.Vector3 | null = null
  let introTarget: THREE.Vector3 | null = null

  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) {
      const life = o.name.match(LIFE_RE)
      if (life) {
        const q = o.getWorldQuaternion(new THREE.Quaternion())
        const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y
        lifeSpots.push({ kind: String(o.userData.kind ?? life[1]).toLowerCase(), id: life[2], position: o.getWorldPosition(new THREE.Vector3()), yaw })
        return
      }
      const lp = o.name.match(LIFEPATH_RE)
      if (lp) {
        const entry = pathNodes.get(lp[1]) ?? { props: {}, nodes: [] as { n: number; p: THREE.Vector3 }[] }
        entry.nodes.push({ n: Number(lp[2]), p: o.getWorldPosition(new THREE.Vector3()) })
        if (o.userData.kind) entry.props = o.userData
        pathNodes.set(lp[1], entry)
        return
      }
      if (o.name === 'cam_intro') introPos = o.getWorldPosition(new THREE.Vector3())
      if (o.name === 'cam_intro_target') introTarget = o.getWorldPosition(new THREE.Vector3())
    }
    if (o.name.startsWith('cloud_') && o.parent === scene) {
      cloudSources.push(o)
      return
    }
    let inCloud = false
    for (let q = o.parent; q; q = q.parent) if (q.name.startsWith('cloud_')) inCloud = true
    if (inCloud) return
    const r = o.name.match(ROUTE_RE)
    if (r && !(o as THREE.Mesh).isMesh) {
      routeNodes.push({ n: Number(r[1]), p: o.getWorldPosition(new THREE.Vector3()) })
      return
    }
    // skip anything inside an already-registered slot
    let p: THREE.Object3D | null = o.parent
    while (p) {
      if (slotObjects.has(p)) return
      p = p.parent
    }
    const sid = o.name.startsWith('slot_') ? slotIdFrom(o) : null
    if (sid) {
      const meshes: THREE.Mesh[] = []
      o.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh)
      })
      if (!meshes.length) return
      slotObjects.add(o)
      const box = new THREE.Box3().setFromObject(o)
      slots.push({
        id: sid.id,
        zone: sid.zone,
        aspect: Number(o.userData?.aspect) || 1,
        object: o,
        meshes,
        center: box.getCenter(new THREE.Vector3()),
        normal: faceNormal(meshes),
        size: box.getSize(new THREE.Vector3()).length(),
      })
      return
    }
    if ((o as THREE.Mesh).isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh) {
      staticMeshes.push(o as THREE.Mesh)
    }
  })

  // ---- flat-shaded materials, shared per source material
  const matCache = new Map<string, THREE.Material>()
  const flat = (m: THREE.Material) => {
    let f = matCache.get(m.uuid)
    if (!f) {
      f = toFlatMaterial(m)
      matCache.set(m.uuid, f)
    }
    return f
  }

  // ---- merge static scenery by material + attribute layout
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
  const scenery: THREE.Mesh[] = []
  for (const mesh of staticMeshes) {
    if (Array.isArray(mesh.material) || mesh.geometry.groups.length > 1) {
      // unusual multi-material mesh: keep as its own object
      const clone = mesh.clone()
      clone.material = Array.isArray(mesh.material) ? mesh.material.map(flat) : flat(mesh.material)
      mesh.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale)
      root.add(clone)
      scenery.push(clone)
      continue
    }
    const mat = flat(mesh.material)
    const g = dequantize(mesh.geometry.clone())
    const keep = new Set(['position', 'normal'])
    if ((mat as THREE.MeshLambertMaterial).map) keep.add('uv')
    if ((mat as THREE.MeshLambertMaterial).vertexColors) keep.add('color')
    for (const name of Object.keys(g.attributes)) if (!keep.has(name)) g.deleteAttribute(name)
    for (const name of keep) if (!g.getAttribute(name)) keep.delete(name)
    g.morphAttributes = {}
    g.applyMatrix4(mesh.matrixWorld)
    const key = `${mat.uuid}|${[...keep].sort().join(',')}|${g.index ? 'i' : 'n'}`
    let entry = groups.get(key)
    if (!entry) groups.set(key, (entry = { mat, geos: [] }))
    entry.geos.push(g)
  }
  for (const { mat, geos } of groups.values()) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
    const list = merged ? [merged] : geos // fall back to separate meshes if merging fails
    for (const geo of list) {
      geo.computeBoundingBox()
      geo.computeBoundingSphere()
      const m = new THREE.Mesh(geo, mat)
      m.name = `scenery_${mat.name}`
      m.castShadow = true
      m.receiveShadow = true
      m.matrixAutoUpdate = false
      root.add(m)
      scenery.push(m)
    }
  }

  // ---- slots keep their own mesh (their material gets swapped for cards)
  // (cloned, so the cached glTF scene is never modified)
  for (const s of slots) {
    const copy = s.object.clone(true)
    s.object.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale)
    root.add(copy)
    copy.updateMatrixWorld(true)
    s.object = copy
    s.meshes = []
    copy.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) s.meshes.push(c as THREE.Mesh)
    })
    for (const m of s.meshes) {
      m.geometry = dequantize(m.geometry.clone())
      m.material = Array.isArray(m.material) ? m.material.map(flat) : flat(m.material)
      m.receiveShadow = true
    }
  }

  routeNodes.sort((a, b) => a.n - b.n)
  const bounds = new THREE.Box3()
  for (const m of scenery) bounds.expandByObject(m)

  // clouds: copied as they are (flat-shaded, no shadows) so the site can drift them
  const clouds = cloudSources.map((src) => {
    const c = src.clone(true)
    src.matrixWorld.decompose(c.position, c.quaternion, c.scale)
    c.traverse((m) => {
      const mesh = m as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(flat) : flat(mesh.material)
      mesh.castShadow = mesh.receiveShadow = false
    })
    root.add(c)
    return c as THREE.Object3D
  })

  const lifePaths: ParsedWorld['lifePaths'] = []
  for (const [name, { props, nodes }] of pathNodes) {
    if (nodes.length < 2) continue
    nodes.sort((a, b) => a.n - b.n)
    lifePaths.push({
      name,
      kind: String(props.kind ?? name.split('_')[0]).toLowerCase(),
      count: Math.max(1, Number(props.count) || 1),
      speed: Number(props.speed) || 3,
      points: nodes.map((x) => x.p),
    })
  }

  return {
    root,
    scenery,
    slots,
    route: routeNodes.map((r) => r.p),
    bounds,
    lifeSpots,
    lifePaths,
    clouds,
    intro: introPos && introTarget ? { position: introPos, target: introTarget } : null,
    colliders: staticMeshes.map((mesh) => ({
      mesh,
      role: /^ground/i.test(mesh.name) ? ('floor' as const) : /^sea(?!front)/i.test(mesh.name) ? ('water' as const) : ('any' as const),
    })),
  }
}
