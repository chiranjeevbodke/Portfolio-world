import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../lib/store'
import { DRACO } from '../lib/config'
import { toFlatMaterial } from './parseWorld'

// Street life: animated models from life.glb (built by blender/04_street_life.py), placed on the
// markers that blender/03_mumbai_world_detail.py puts in world.glb. Nothing is modelled here.

export const LIFE_URL = '/models/life.glb'
const ACTIVE_DIST = 110 // animals / vehicles further than this stop animating
const CLOUD_DRIFT = 0.012 // clouds sway slowly back and forth (rad/s of a long sine)

// wheel spin per metre travelled: clip period (s) / wheel circumference (m), from 04_street_life.py
const DRIVE_RATE: Record<string, number> = { taxi: 1 / (Math.PI * 2 * 0.32), auto: 0.8 / (Math.PI * 2 * 0.25), bus: 1.4 / (Math.PI * 2 * 0.5) }
const WALK_REF: Record<string, number> = { dog: 1.6 }

type Mover = {
  obj: THREE.Object3D
  mixer: THREE.AnimationMixer
  curve: THREE.CatmullRomCurve3 | null
  s: number // 0..1 along the loop
  speed: number // m/s
  length: number
  bank: boolean
}

function pickClip(clips: THREE.AnimationClip[], kind: string, moving: boolean) {
  const own = clips.filter((c) => c.name.startsWith(kind + '_'))
  const moveWords = /(walk|drive|fly|run)$/
  return (moving ? own.find((c) => moveWords.test(c.name)) : own.find((c) => !moveWords.test(c.name))) ?? own[0] ?? null
}

export function Life() {
  const world = useStore((s) => s.world)
  const gltf = useGLTF(LIFE_URL, DRACO)
  const movers = useRef<Mover[]>([])
  const cloudHome = useRef<{ obj: THREE.Object3D; x0: number }[]>([])

  const protos = useMemo(() => {
    const cache = new Map<string, THREE.Material>()
    const map = new Map<string, THREE.Object3D>()
    gltf.scene.traverse((o) => {
      const m = o.name.match(/^proto_(.+)$/)
      if (!m) return
      const p = o.clone(true)
      p.position.set(0, 0, 0)
      p.traverse((c) => {
        const mesh = c as THREE.Mesh
        if (!mesh.isMesh) return
        const conv = (mat: THREE.Material) => {
          let f = cache.get(mat.uuid)
          if (!f) cache.set(mat.uuid, (f = toFlatMaterial(mat)))
          return f
        }
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material)
        mesh.castShadow = true
      })
      map.set(m[1].toLowerCase(), p)
    })
    return map
  }, [gltf.scene])

  const group = useMemo(() => new THREE.Group(), [])

  useEffect(() => {
    if (!world) return
    const list: Mover[] = []
    const make = (kind: string, moving: boolean) => {
      const proto = protos.get(kind)
      if (!proto) return null
      const obj = proto.clone(true)
      const mixer = new THREE.AnimationMixer(obj)
      const clip = pickClip(gltf.animations, kind, moving)
      if (clip) {
        const action = mixer.clipAction(clip)
        action.play()
        action.time = Math.random() * clip.duration // don't move in sync
      }
      group.add(obj)
      return { obj, mixer }
    }

    for (const spot of world.lifeSpots) {
      const m = make(spot.kind, false)
      if (!m) continue
      m.obj.position.copy(spot.position)
      m.obj.rotation.y = spot.yaw
      list.push({ ...m, curve: null, s: 0, speed: 0, length: 0, bank: false })
    }
    for (const path of world.lifePaths) {
      const curve = new THREE.CatmullRomCurve3(path.points, true, 'centripetal')
      const length = curve.getLength()
      for (let i = 0; i < path.count; i++) {
        const m = make(path.kind, true)
        if (!m) break
        list.push({ ...m, curve, s: i / path.count + Math.random() * 0.05, speed: path.speed, length, bank: path.kind === 'bird' })
        const rate = DRIVE_RATE[path.kind] ? path.speed * DRIVE_RATE[path.kind] : WALK_REF[path.kind] ? path.speed / WALK_REF[path.kind] : 1
        m.mixer.timeScale = rate
      }
    }
    movers.current = list
    cloudHome.current = world.clouds.map((obj) => ({ obj, x0: obj.position.x }))
    return () => {
      for (const m of list) {
        m.mixer.stopAllAction()
        group.remove(m.obj)
      }
      movers.current = []
    }
  }, [world, protos, gltf.animations, group])

  const tmp = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3() }), [])
  useFrame(({ camera, clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    for (const m of movers.current) {
      if (m.curve) {
        m.s = (m.s + (m.speed * dt) / m.length) % 1
        m.curve.getPointAt(m.s, tmp.p)
        m.curve.getTangentAt(m.s, tmp.t)
        m.obj.position.copy(tmp.p)
        // models face +X
        const yaw = Math.atan2(-tmp.t.z, tmp.t.x)
        m.obj.rotation.set(0, yaw, 0)
        if (m.bank) {
          const ahead = m.curve.getTangentAt((m.s + 0.02) % 1, new THREE.Vector3())
          const turn = Math.atan2(-ahead.z, ahead.x) - yaw
          m.obj.rotation.x = -Math.atan2(Math.sin(turn), Math.cos(turn)) * 6
        }
      }
      // birds are always animated (they are seen from afar); the rest only near the visitor
      if (m.bank || m.obj.position.distanceToSquared(camera.position) < ACTIVE_DIST * ACTIVE_DIST) m.mixer.update(dt)
    }
    const t = clock.elapsedTime
    cloudHome.current.forEach((c, i) => {
      c.obj.position.x = c.x0 + Math.sin(t * CLOUD_DRIFT + i * 1.7) * 60
    })
  })

  return <primitive object={group} />
}

useGLTF.preload(LIFE_URL, DRACO)
