import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOOK } from '../lib/config'

// Soft golden-hour gradient dome that follows the camera (atmosphere, not world geometry).
export function Sky() {
  const ref = useRef<THREE.Mesh>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          zenith: { value: new THREE.Color(LOOK.SKY_ZENITH) },
          mid: { value: new THREE.Color(LOOK.SKY_MID) },
          horizon: { value: new THREE.Color(LOOK.SKY_HORIZON) },
          sunDir: { value: new THREE.Vector3(...LOOK.SUN_DIR).normalize() },
          sunColor: { value: new THREE.Color('#fff1d6') },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith, mid, horizon, sunDir, sunColor;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = clamp(d.y, -1.0, 1.0);
            vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
            col = mix(col, zenith, smoothstep(0.15, 0.75, h));
            col = mix(col, horizon * 0.92, smoothstep(0.0, -0.2, h));
            float s = max(dot(d, sunDir), 0.0);
            col += sunColor * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 0.9);
            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  useFrame(({ camera }) => ref.current?.position.copy(camera.position))
  return (
    <mesh ref={ref} material={material} renderOrder={-1} frustumCulled={false}>
      <icosahedronGeometry args={[500, 3]} />
    </mesh>
  )
}
