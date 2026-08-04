// The one Three.js scene the viewer owns: renderer, camera, lights, loop.
// Content modules (pig.ts) add and remove objects; this file never knows
// what they are.

import * as THREE from 'three'

export interface SceneHost {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  /** Called every frame with the elapsed seconds since the previous one. */
  onFrame: Set<(delta: number) => void>
  /** Frame `object` (already added to the scene) and start orbiting it. */
  frameObject(object: THREE.Object3D): void
}

const hosts = new WeakMap<HTMLElement, SceneHost>()

export function ensureScene(container: HTMLElement): SceneHost {
  const existing = hosts.get(container)
  if (existing) return existing

  // preserveDrawingBuffer lets tests read pixels back (docs/testing.md).
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x23271d)
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 10_000) // near/far refit per object in frameObject
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(1, 2, 3)
  scene.add(sun)

  const onFrame = new Set<(delta: number) => void>()
  let framed: THREE.Object3D | null = null

  const clock = new THREE.Clock()
  const animate = (): void => {
    requestAnimationFrame(animate)
    const delta = clock.getDelta()
    if (framed) framed.rotation.y += delta * 0.6
    for (const callback of onFrame) callback(delta)
    renderer.render(scene, camera)
  }
  animate()

  new ResizeObserver(() => {
    renderer.setSize(container.clientWidth, container.clientHeight)
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
  }).observe(container)

  const host: SceneHost = {
    scene,
    camera,
    onFrame,
    frameObject(object) {
      framed = object
      object.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(object)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3()).length()
      object.position.sub(center)
      // Fit the clip planes to the object — a map is a thousand times the
      // size of a pig, and a fixed far plane clips it into an empty screen.
      camera.near = Math.max(size / 1000, 0.1)
      camera.far = size * 4
      camera.updateProjectionMatrix()
      camera.position.set(0, size * 0.25, size * 0.9)
      camera.lookAt(0, 0, 0)
    }
  }
  hosts.set(container, host)
  return host
}
