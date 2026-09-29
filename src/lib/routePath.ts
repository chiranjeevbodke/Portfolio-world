import * as THREE from 'three'
import { EYE_HEIGHT, FLY } from './config'

// Port of blender/02_camera_flythrough.py.
// "time" is fly-through seconds (what scrolling advances); "distance" is metres along the path.

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function catmullRom(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, t: number, out: THREE.Vector3) {
  const t2 = t * t, t3 = t2 * t
  for (const k of ['x', 'y', 'z'] as const) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
  }
  return out
}

export class RoutePath {
  readonly dense: THREE.Vector3[] = []
  readonly dist: number[] = [0]
  readonly length: number
  readonly times: number[] = [0]
  readonly samples: number[] = [0]
  readonly duration: number
  private slots: THREE.Vector3[]

  constructor(points: THREE.Vector3[], slotCentres: THREE.Vector3[]) {
    const pts = points.map((p) => new THREE.Vector3(p.x, EYE_HEIGHT, p.z))
    this.slots = slotCentres
    const first = pts[0].clone().multiplyScalar(2).sub(pts[1])
    const last = pts[pts.length - 1].clone().multiplyScalar(2).sub(pts[pts.length - 2])
    const ext = [first, ...pts, last]
    const STEPS = 30
    for (let i = 1; i < ext.length - 2; i++) {
      for (let k = 0; k < STEPS; k++) {
        this.dense.push(catmullRom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / STEPS, new THREE.Vector3()))
      }
    }
    this.dense.push(pts[pts.length - 1].clone())
    for (let i = 1; i < this.dense.length; i++) {
      this.dist.push(this.dist[i - 1] + this.dense[i].distanceTo(this.dense[i - 1]))
    }
    this.length = this.dist[this.dist.length - 1]

    // timing: slow near work
    const step = 0.5
    const pos = new THREE.Vector3(), fwd = new THREE.Vector3()
    let t = 0, d = 0
    while (d < this.length) {
      this.pointAt(d, pos)
      this.forwardAt(d, fwd)
      const [, sd] = this.nearestSlotAhead(pos, fwd)
      const speed = FLY.CRUISE_SPEED * (FLY.SLOW_FACTOR + (1 - FLY.SLOW_FACTOR) * smoothstep(FLY.SLOW_NEAR, FLY.SLOW_FAR, sd))
      const ds = Math.min(step, this.length - d)
      t += ds / speed
      d += ds
      this.times.push(t)
      this.samples.push(d)
    }
    this.duration = t
  }

  private static search(arr: number[], v: number) {
    let lo = 0, hi = arr.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (arr[mid] <= v) lo = mid
      else hi = mid
    }
    return lo
  }

  pointAt(d: number, out = new THREE.Vector3()) {
    d = Math.max(0, Math.min(this.length, d))
    const lo = RoutePath.search(this.dist, d)
    const hi = Math.min(lo + 1, this.dense.length - 1)
    const seg = this.dist[hi] - this.dist[lo]
    const t = seg === 0 ? 0 : (d - this.dist[lo]) / seg
    return out.lerpVectors(this.dense[lo], this.dense[hi], t)
  }

  /** horizontal unit direction of travel at distance d */
  forwardAt(d: number, out = new THREE.Vector3()) {
    const a = this.pointAt(Math.min(d, this.length - 1))
    const b = this.pointAt(Math.min(d, this.length - 1) + 1)
    out.set(b.x - a.x, 0, b.z - a.z)
    return out.lengthSq() > 1e-8 ? out.normalize() : out.set(0, 0, -1)
  }

  distAtTime(t: number) {
    t = Math.max(0, Math.min(this.duration, t))
    const lo = RoutePath.search(this.times, t)
    const hi = Math.min(lo + 1, this.times.length - 1)
    const span = this.times[hi] - this.times[lo]
    const f = span === 0 ? 0 : (t - this.times[lo]) / span
    return this.samples[lo] + (this.samples[hi] - this.samples[lo]) * f
  }

  timeAtDist(d: number) {
    d = Math.max(0, Math.min(this.length, d))
    const lo = RoutePath.search(this.samples, d)
    const hi = Math.min(lo + 1, this.samples.length - 1)
    const span = this.samples[hi] - this.samples[lo]
    const f = span === 0 ? 0 : (d - this.samples[lo]) / span
    return this.times[lo] + (this.times[hi] - this.times[lo]) * f
  }

  /** closest distance along the path to a world point (horizontal) */
  closestDist(p: THREE.Vector3) {
    let best = 0, bestD = Infinity
    for (let i = 0; i < this.dense.length; i++) {
      const q = this.dense[i]
      const dd = (q.x - p.x) ** 2 + (q.z - p.z) ** 2
      if (dd < bestD) {
        bestD = dd
        best = this.dist[i]
      }
    }
    return best
  }

  nearestSlotAhead(pos: THREE.Vector3, forward: THREE.Vector3): [THREE.Vector3 | null, number] {
    let best: THREE.Vector3 | null = null, bestD = 1e9
    for (const c of this.slots) {
      const vx = c.x - pos.x, vz = c.z - pos.z
      const d = Math.hypot(vx, vz)
      if (d < bestD && d > 0.01 && (vx * forward.x + vz * forward.z) / d > -0.2) {
        best = c
        bestD = d
      }
    }
    return [best, bestD]
  }

  /** un-smoothed look target at distance d (ahead on the path, pulled toward the nearest frame) */
  lookTargetAt(d: number, out = new THREE.Vector3()) {
    const pos = this.pointAt(d)
    const ahead = this.pointAt(d + FLY.LOOK_AHEAD)
    const fwd = new THREE.Vector3(ahead.x - pos.x, 0, ahead.z - pos.z)
    if (fwd.lengthSq() > 1e-4) fwd.normalize()
    else fwd.copy(this.forwardAt(d))
    out.set(ahead.x, EYE_HEIGHT - 0.1, ahead.z)
    if (ahead.distanceToSquared(pos) < 1) out.set(pos.x + fwd.x * FLY.LOOK_AHEAD, EYE_HEIGHT - 0.1, pos.z + fwd.z * FLY.LOOK_AHEAD)
    const [sc, sd] = this.nearestSlotAhead(pos, fwd)
    if (sc) {
      const w = FLY.LOOK_AT_WORK * (1 - smoothstep(FLY.SLOW_NEAR, FLY.SLOW_FAR, sd))
      out.lerp(sc, w)
    }
    return out
  }
}
