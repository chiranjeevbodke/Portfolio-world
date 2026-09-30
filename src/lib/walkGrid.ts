import * as THREE from 'three'

// A light 2D "can I stand here?" grid, generated from the loaded meshes.
// - floor: any roughly horizontal surface near ground level (ground, roads, plaza, promenade).
//   Places with no floor (the sea, beyond the map edge) are not walkable.
// - blockers: any triangle that reaches into the body band between knee and head height
//   (walls, stalls, poles, trees, seawall). Thin ground slabs stay below the band, so they never block.
// The grid is then grown by the body radius so the camera keeps a little distance from walls.

export const WALK = {
  CELL: 0.25, // metres per grid cell
  FLOOR_MIN: -0.25, // lowest surface that still counts as floor (the sea sits lower)
  STEP: 0.35, // anything that only rises this high can be walked over
  HEAD: 2.0, // anything starting above this height can be walked under (awnings, signs)
  RADIUS: 0.35, // body radius
}

export class WalkGrid {
  readonly minX: number
  readonly minZ: number
  readonly w: number
  readonly h: number
  readonly cell = WALK.CELL
  /** 1 = walkable */
  readonly walk: Uint8Array

  private constructor(minX: number, minZ: number, w: number, h: number, walk: Uint8Array) {
    this.minX = minX
    this.minZ = minZ
    this.w = w
    this.h = h
    this.walk = walk
  }

  get maxX() { return this.minX + this.w * this.cell }
  get maxZ() { return this.minZ + this.h * this.cell }

  /** role 'floor': the mesh only ever counts as floor (ground); 'water': its footprint is never
   * walkable (sea); 'any': floor or blocker by shape */
  static build(sources: { mesh: THREE.Mesh; role: 'floor' | 'water' | 'any' }[]): WalkGrid | null {
    const floorTris: number[] = [] // x0 z0 x1 z1 x2 z2
    const blockTris: number[] = []
    const waterTris: number[] = []
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    const ab = new THREE.Vector3(), ac = new THREE.Vector3()
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity

    for (const { mesh, role } of sources) {
      mesh.updateWorldMatrix(true, false)
      const pos = mesh.geometry.getAttribute('position')
      if (!pos) continue
      const idx = mesh.geometry.getIndex()
      const count = idx ? idx.count : pos.count
      const mw = mesh.matrixWorld
      for (let i = 0; i + 2 < count; i += 3) {
        a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mw)
        b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(mw)
        c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(mw)
        const yMin = Math.min(a.y, b.y, c.y), yMax = Math.max(a.y, b.y, c.y)
        const n = ab.subVectors(b, a).cross(ac.subVectors(c, a))
        const len = n.length()
        const flat = len > 1e-9 && Math.abs(n.y / len) > 0.7
        if (role === 'water') {
          waterTris.push(a.x, a.z, b.x, b.z, c.x, c.z)
          continue
        }
        if (flat && yMax <= WALK.STEP && yMin >= WALK.FLOOR_MIN) {
          floorTris.push(a.x, a.z, b.x, b.z, c.x, c.z)
          minX = Math.min(minX, a.x, b.x, c.x)
          maxX = Math.max(maxX, a.x, b.x, c.x)
          minZ = Math.min(minZ, a.z, b.z, c.z)
          maxZ = Math.max(maxZ, a.z, b.z, c.z)
        } else if (role === 'any' && yMax > WALK.STEP && yMin < WALK.HEAD) {
          blockTris.push(a.x, a.z, b.x, b.z, c.x, c.z)
        }
      }
    }
    if (!floorTris.length) return null

    const cell = WALK.CELL
    const w = Math.ceil((maxX - minX) / cell) + 1
    const h = Math.ceil((maxZ - minZ) / cell) + 1
    const floor = new Uint8Array(w * h)
    const block = new Uint8Array(w * h)
    const raster = (tris: number[], out: Uint8Array) => {
      const mark = (x: number, z: number) => {
        const i = Math.floor((x - minX) / cell), j = Math.floor((z - minZ) / cell)
        if (i >= 0 && j >= 0 && i < w && j < h) out[j * w + i] = 1
      }
      for (let t = 0; t < tris.length; t += 6) {
        const x0 = tris[t], z0 = tris[t + 1], x1 = tris[t + 2], z1 = tris[t + 3], x2 = tris[t + 4], z2 = tris[t + 5]
        // edges (covers vertical walls, whose footprint is a line)
        for (const [ax, az, bx, bz] of [[x0, z0, x1, z1], [x1, z1, x2, z2], [x2, z2, x0, z0]]) {
          const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (cell * 0.5)))
          for (let s = 0; s <= steps; s++) mark(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps)
        }
        // interior
        const area = (x1 - x0) * (z2 - z0) - (x2 - x0) * (z1 - z0)
        if (Math.abs(area) < cell * cell * 0.5) continue
        const i0 = Math.max(0, Math.floor((Math.min(x0, x1, x2) - minX) / cell))
        const i1 = Math.min(w - 1, Math.floor((Math.max(x0, x1, x2) - minX) / cell))
        const j0 = Math.max(0, Math.floor((Math.min(z0, z1, z2) - minZ) / cell))
        const j1 = Math.min(h - 1, Math.floor((Math.max(z0, z1, z2) - minZ) / cell))
        for (let j = j0; j <= j1; j++) {
          const pz = minZ + (j + 0.5) * cell
          for (let i = i0; i <= i1; i++) {
            const px = minX + (i + 0.5) * cell
            const w0 = ((x1 - px) * (z2 - pz) - (x2 - px) * (z1 - pz)) / area
            const w1 = ((x2 - px) * (z0 - pz) - (x0 - px) * (z2 - pz)) / area
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) out[j * w + i] = 1
          }
        }
      }
    }
    raster(floorTris, floor)
    raster(blockTris, block)
    raster(waterTris, block)

    // walkable = floor and not blocked, then shrink by the body radius
    const solid = new Uint8Array(w * h)
    for (let k = 0; k < w * h; k++) solid[k] = floor[k] && !block[k] ? 0 : 1
    const r = WALK.RADIUS / cell
    const ri = Math.ceil(r)
    const offsets: number[] = []
    for (let dj = -ri; dj <= ri; dj++) for (let di = -ri; di <= ri; di++) if (di * di + dj * dj <= r * r + 0.5) offsets.push(di, dj)
    const walk = new Uint8Array(w * h)
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let ok = 1
        for (let o = 0; o < offsets.length && ok; o += 2) {
          const ii = i + offsets[o], jj = j + offsets[o + 1]
          if (ii < 0 || jj < 0 || ii >= w || jj >= h || solid[jj * w + ii]) ok = 0
        }
        walk[j * w + i] = ok
      }
    }
    return new WalkGrid(minX, minZ, w, h, walk)
  }

  /** Keep only the walkable areas connected to one of the seeds (drops the insides of closed buildings). */
  keepReachable(seeds: { x: number; z: number }[]) {
    const seen = new Uint8Array(this.w * this.h)
    const stack: number[] = []
    for (const s of seeds) {
      const c = this.nearestFree(s.x, s.z, 4)
      if (!c) continue
      const k = Math.floor((c.z - this.minZ) / this.cell) * this.w + Math.floor((c.x - this.minX) / this.cell)
      if (!seen[k]) (seen[k] = 1), stack.push(k)
    }
    if (!stack.length) return
    while (stack.length) {
      const k = stack.pop()!
      const i = k % this.w, j = (k - i) / this.w
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue
        const n = jj * this.w + ii
        if (!seen[n] && this.walk[n]) (seen[n] = 1), stack.push(n)
      }
    }
    this.walk.set(seen)
  }

  /** Centre of the closest walkable cell within maxDist metres, or null. */
  nearestFree(x: number, z: number, maxDist: number): { x: number; z: number } | null {
    if (this.canStand(x, z)) return { x, z }
    const i0 = Math.floor((x - this.minX) / this.cell), j0 = Math.floor((z - this.minZ) / this.cell)
    const R = Math.ceil(maxDist / this.cell)
    let best: { x: number; z: number } | null = null, bestD = Infinity
    for (let dj = -R; dj <= R; dj++) {
      for (let di = -R; di <= R; di++) {
        const d = di * di + dj * dj
        if (d >= bestD || d > R * R) continue
        const i = i0 + di, j = j0 + dj
        if (i < 0 || j < 0 || i >= this.w || j >= this.h || !this.walk[j * this.w + i]) continue
        bestD = d
        best = { x: this.minX + (i + 0.5) * this.cell, z: this.minZ + (j + 0.5) * this.cell }
      }
    }
    return best
  }

  canStand(x: number, z: number) {
    const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell)
    return i >= 0 && j >= 0 && i < this.w && j < this.h && this.walk[j * this.w + i] === 1
  }

  /** Move pos by (dx, dz), sliding along walls. If already stuck inside something, allow moving out. */
  move(pos: THREE.Vector3, dx: number, dz: number) {
    const dist = Math.hypot(dx, dz)
    const steps = Math.max(1, Math.ceil(dist / (this.cell * 0.5)))
    const sx = dx / steps, sz = dz / steps
    for (let s = 0; s < steps; s++) {
      const stuck = !this.canStand(pos.x, pos.z)
      if (stuck || this.canStand(pos.x + sx, pos.z + sz)) {
        pos.x += sx
        pos.z += sz
      } else if (this.canStand(pos.x + sx, pos.z)) pos.x += sx
      else if (this.canStand(pos.x, pos.z + sz)) pos.z += sz
      else break
    }
  }
}
