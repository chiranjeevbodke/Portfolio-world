import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../lib/store'

// Renders the loaded world once from straight above into an image for the mini-map,
// so the map always matches whatever world.glb is in use.

const MARGIN = 16 // metres around the route and frames
const HEIGHT_PX = 720

export function MapCapture() {
  const gl = useThree((s) => s.gl)
  const world = useStore((s) => s.world)
  const walk = useStore((s) => s.walk)

  useEffect(() => {
    if (!world) return
    // frame the neighbourhood: the route and every display frame, plus a margin, kept inside the ground
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
    for (const p of [...world.route, ...world.slots.map((s) => s.center)]) {
      b.minX = Math.min(b.minX, p.x - MARGIN)
      b.maxX = Math.max(b.maxX, p.x + MARGIN)
      b.minZ = Math.min(b.minZ, p.z - MARGIN)
      b.maxZ = Math.max(b.maxZ, p.z + MARGIN)
    }
    if (walk) {
      b.minX = Math.max(b.minX, walk.minX - 4)
      b.maxX = Math.min(b.maxX, walk.maxX + 4)
      b.minZ = Math.max(b.minZ, walk.minZ - 4)
      b.maxZ = Math.min(b.maxZ, walk.maxZ + 4)
    }
    const W = b.maxX - b.minX, H = b.maxZ - b.minZ
    const px = { w: Math.round((HEIGHT_PX * W) / H), h: HEIGHT_PX }

    const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 500)
    cam.position.set(b.minX + W / 2, 300, b.minZ + H / 2)
    cam.up.set(0, 0, -1) // north (-Z) at the top
    cam.lookAt(b.minX + W / 2, 0, b.minZ + H / 2)
    cam.updateMatrixWorld()

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#d9c7ae')
    scene.add(new THREE.HemisphereLight('#fff3e6', '#a08670', 1.9))
    const sun = new THREE.DirectionalLight('#ffe2c0', 1.7)
    sun.position.set(-40, 100, 60)
    scene.add(sun)

    const rt = new THREE.WebGLRenderTarget(px.w, px.h)
    rt.texture.colorSpace = THREE.SRGBColorSpace
    const parent = world.root.parent
    const shadows = gl.shadowMap.enabled
    scene.add(world.root)
    gl.shadowMap.enabled = false
    gl.setRenderTarget(rt)
    gl.render(scene, cam)
    const pixels = new Uint8Array(px.w * px.h * 4)
    gl.readRenderTargetPixels(rt, 0, 0, px.w, px.h, pixels)
    gl.setRenderTarget(null)
    gl.shadowMap.enabled = shadows
    parent?.add(world.root)
    rt.dispose()

    const canvas = document.createElement('canvas')
    canvas.width = px.w
    canvas.height = px.h
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(px.w, px.h)
    for (let y = 0; y < px.h; y++) {
      // WebGL rows are bottom-up
      img.data.set(pixels.subarray((px.h - 1 - y) * px.w * 4, (px.h - y) * px.w * 4), y * px.w * 4)
    }
    ctx.putImageData(img, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) useStore.getState().setMap({ url: URL.createObjectURL(blob), ...b })
    })
  }, [gl, world, walk])

  return null
}
