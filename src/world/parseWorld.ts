import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Reads world.glb purely by naming convention, so the detailed models can
// replace the blockout without code changes:
//   slot_<zone>__<id>  display frames (custom props slot_id, aspect)
//   route_00, route_01 ... scroll route empties
// Everything else is static scenery: it is re-shaded flat and merged by
// material to keep draw calls low on phones.

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
}

const SLOT_RE = /^slot_([a-z0-9-]+)__(.+)$/i
const ROUTE_RE = /^route_(\d+)/i

function slotIdFrom(obj: THREE.Object3D): { id: string; zone: string } | null {
  const ud = obj.userData ?? {}
  if (typeof ud.slot_id === 'string' && ud.slot_id.includes('/')) {
    return { id: ud.slot_id, zone: ud.slot_id.split('/')[0] }
  }
  const m = obj.name.match(SLOT_RE)
  return m ? { id: `${m[1]}/${m[2]}`, zone: m[1] } : null
}

function toFlatMaterial(src: THREE.Material): THREE.Material {
  const s = src as THREE.MeshStandardMaterial
  const m = new THREE.MeshLambertMaterial({
    name: src.name,
    color: s.color ? s.color.clone() : new THREE.Color('#ffffff'),
    map: s.map ?? null,
    emissive: s.emissive ? s.emissive.clone() : undefined,
    emissiveMap: s.emissiveMap ?? null,
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

  scene.traverse((o) => {
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
    const g = mesh.geometry.clone()
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
      m.material = Array.isArray(m.material) ? m.material.map(flat) : flat(m.material)
      m.receiveShadow = true
    }
  }

  routeNodes.sort((a, b) => a.n - b.n)
  const bounds = new THREE.Box3()
  for (const m of scenery) bounds.expandByObject(m)

  return { root, scenery, slots, route: routeNodes.map((r) => r.p), bounds }
}
