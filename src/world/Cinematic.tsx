import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { LOOK } from '../lib/config'

// Cinematic finish, drawn after the scene (no extra library, no extra geometry):
// - light shafts: the low golden-hour sun streaming past buildings, trees and hoardings
//   (screen-space rays, marched through the depth buffer toward the sun)
// - sun haze: distance haze that glows warmer when you look toward the sun
// - a gentle grade (warm highlights, cool shadows), vignette and fine film grain

export const FX = {
  RAYS: 0.7, // light-shaft strength
  RAY_DECAY: 0.955, // how quickly a shaft fades along its length
  HAZE: 0.0045, // haze density per metre
  HAZE_MIX: 0.22, // how much haze can cover a far object
  GRAIN: 0.035,
  VIGNETTE: 0.32,
}

const quad = new THREE.PlaneGeometry(2, 2)
const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const raysFrag = /* glsl */ `
#include <packing>
uniform sampler2D tDepth; uniform vec2 uSun; uniform float uNear, uFar, uFogNear, uFogFar, uDecay, uAspect;
varying vec2 vUv;
float skyAt(vec2 uv){
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
  return smoothstep(uFogNear, uFogFar, z);
}
void main(){
  vec2 delta = (uSun - vUv) / float(SAMPLES) * 0.9;
  vec2 uv = vUv; float illum = 1.0; float acc = 0.0;
  for (int i = 0; i < SAMPLES; i++) { uv += delta; acc += skyAt(uv) * illum; illum *= uDecay; }
  acc /= float(SAMPLES) * 0.35;
  float d = length((vUv - uSun) * vec2(uAspect, 1.0));
  gl_FragColor = vec4(vec3(acc * exp(-d * 1.1)), 1.0);
}`

const compFrag = /* glsl */ `
#include <packing>
uniform sampler2D tScene, tDepth, tRays;
uniform vec3 uSunCol, uHazeCol, uSunView;
uniform float uNear, uFar, uRays, uSunVis, uHaze, uHazeMix, uGrain, uVignette, uTime, uAspect, uTanHalf;
varying vec2 vUv;
float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
void main(){
  vec3 col = texture2D(tScene, vUv).rgb;
  float depth = texture2D(tDepth, vUv).x;
  float z = -perspectiveDepthToViewZ(depth, uNear, uFar);
  float isSky = step(0.99999, depth);
  vec3 dir = normalize(vec3((vUv * 2.0 - 1.0) * vec2(uAspect, 1.0) * uTanHalf, -1.0));
  float mu = max(dot(dir, uSunView), 0.0);
  // sun haze
  float haze = (1.0 - exp(-z * uHaze)) * uHazeMix * (1.0 - isSky);
  vec3 hazeCol = uHazeCol * (0.75 + 1.6 * pow(mu, 6.0));
  col = mix(col, hazeCol, haze);
  // light shafts
  col += texture2D(tRays, vUv).r * uSunCol * uRays * uSunVis;
  // grade: cool shadows, warm highlights, a touch more colour
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col * vec3(0.93, 0.98, 1.06), col * vec3(1.06, 1.0, 0.91), smoothstep(0.02, 0.5, lum));
  col = mix(vec3(lum), col, 1.08);
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <colorspace_fragment>
  // soft contrast, vignette and grain in display space
  vec3 c = gl_FragColor.rgb;
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  vec2 v = (vUv - 0.5) * vec2(uAspect, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.35, 1.25, length(v));
  c += (rnd(vUv * 1000.0) - 0.5) * uGrain;
  gl_FragColor.rgb = c;
}`

export function Cinematic({ low }: { low: boolean }) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const fx = useMemo(() => {
    const depth = new THREE.DepthTexture(1, 1)
    depth.type = THREE.UnsignedIntType
    const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: low ? 0 : 4, depthTexture: depth })
    const raysRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
    const common = { uNear: { value: 0.1 }, uFar: { value: 1000 }, uAspect: { value: 1 } }
    const rays = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: raysFrag,
      defines: { SAMPLES: low ? 28 : 48 },
      uniforms: {
        ...THREE.UniformsUtils.clone(common),
        tDepth: { value: depth },
        uSun: { value: new THREE.Vector2() },
        uFogNear: { value: LOOK.FOG_NEAR },
        uFogFar: { value: LOOK.FOG_FAR },
        uDecay: { value: FX.RAY_DECAY },
      },
      depthTest: false,
      depthWrite: false,
    })
    const comp = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: compFrag,
      uniforms: {
        ...THREE.UniformsUtils.clone(common),
        tScene: { value: sceneRT.texture },
        tDepth: { value: depth },
        tRays: { value: raysRT.texture },
        uSunCol: { value: new THREE.Color(LOOK.SUN_COLOR) },
        uHazeCol: { value: new THREE.Color(LOOK.SKY_HORIZON) },
        uSunView: { value: new THREE.Vector3() },
        uRays: { value: FX.RAYS },
        uSunVis: { value: 0 },
        uHaze: { value: FX.HAZE },
        uHazeMix: { value: FX.HAZE_MIX },
        uGrain: { value: FX.GRAIN },
        uVignette: { value: FX.VIGNETTE },
        uTime: { value: 0 },
        uTanHalf: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const raysMesh = new THREE.Mesh(quad, rays)
    const compMesh = new THREE.Mesh(quad, comp)
    raysMesh.frustumCulled = compMesh.frustumCulled = false
    return { depth, sceneRT, raysRT, rays, comp, raysMesh, compMesh, cam: new THREE.Camera(), sun: new THREE.Vector3(), tmp: new THREE.Vector3() }
  }, [low])

  useEffect(() => {
    const w = Math.max(1, Math.floor(size.width * dpr)), h = Math.max(1, Math.floor(size.height * dpr))
    fx.sceneRT.setSize(w, h)
    const k = low ? 0.25 : 0.5 // shafts are soft, so they render at reduced size
    fx.raysRT.setSize(Math.max(1, Math.floor(w * k)), Math.max(1, Math.floor(h * k)))
  }, [fx, size, dpr, low])

  useEffect(
    () => () => {
      fx.sceneRT.dispose()
      fx.raysRT.dispose()
      fx.depth.dispose()
      fx.rays.dispose()
      fx.comp.dispose()
    },
    [fx],
  )

  // priority 1: runs after the camera has moved and takes over rendering
  useFrame(({ scene, camera, clock }) => {
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    const sunDir = fx.sun.set(LOOK.SUN_DIR[0], LOOK.SUN_DIR[1], LOOK.SUN_DIR[2]).normalize()
    // sun on screen, and how much we face it (shafts fade out when it is behind us)
    const fwd = cam.getWorldDirection(fx.tmp)
    const facing = fwd.dot(sunDir)
    const sp = fx.tmp.copy(cam.position).addScaledVector(sunDir, 500).project(cam)
    const vis = THREE.MathUtils.smoothstep(facing, -0.1, 0.45)

    for (const m of [fx.rays, fx.comp]) {
      m.uniforms.uNear.value = cam.near
      m.uniforms.uFar.value = cam.far
      m.uniforms.uAspect.value = aspect
    }
    fx.rays.uniforms.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5)
    fx.comp.uniforms.uSunVis.value = vis
    fx.comp.uniforms.uSunView.value.copy(sunDir).transformDirection(cam.matrixWorldInverse)
    fx.comp.uniforms.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
    fx.comp.uniforms.uTime.value = clock.elapsedTime % 100

    gl.setRenderTarget(fx.sceneRT)
    gl.render(scene, cam)
    if (vis > 0.001) {
      gl.setRenderTarget(fx.raysRT)
      gl.render(fx.raysMesh, fx.cam)
    } else {
      gl.setRenderTarget(fx.raysRT)
      gl.clear()
    }
    gl.setRenderTarget(null)
    gl.render(fx.compMesh, fx.cam)
  }, 1)

  return null
}
