// Three.js model viewer: one scene, swapped meshes.
//
// The game's coordinate system is PSX-era Y-down. The conversion to three's
// Y-up is baked into the geometry: Y is negated on positions and normals, and
// the triangle winding is reversed to keep faces front-facing (a mirror flips
// handedness). Doing this with mesh.scale.y = -1 instead turns every face
// back-facing, and the double-sided shader then re-flips the perfectly good
// normals — which is how half the pig went dark.

import * as THREE from 'three'
import type { Model } from './api'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let mesh: THREE.Mesh | null = null

function ensureScene(container: HTMLElement): void {
  if (renderer) return
  // preserveDrawingBuffer lets tests read pixels back (docs/testing.md).
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x23271d)
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 10_000)
  scene.add(new THREE.AmbientLight(0xffffff, 0.5))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(1, 2, 3)
  scene.add(sun)

  const animate = (): void => {
    requestAnimationFrame(animate)
    if (mesh) mesh.rotation.y += 0.01
    if (renderer && scene && camera) renderer.render(scene, camera)
  }
  animate()

  new ResizeObserver(() => {
    if (!renderer || !camera) return
    renderer.setSize(container.clientWidth, container.clientHeight)
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
  }).observe(container)
}

export function showModel(container: HTMLElement, model: Model): void {
  ensureScene(container)
  if (mesh && scene) {
    scene.remove(mesh)
    mesh.geometry.dispose()
    ;(mesh.material as THREE.Material).dispose()
  }

  const cornerCount = model.positions.length / 3
  const positions = new Float32Array(model.positions.length)
  const normals = new Float32Array(model.normals.length)
  const swap = [0, 2, 1]
  for (let corner = 0; corner < cornerCount; corner++) {
    const triangle = Math.floor(corner / 3)
    const src = (triangle * 3 + swap[corner % 3]) * 3
    const dst = corner * 3
    positions[dst] = model.positions[src]
    positions[dst + 1] = -model.positions[src + 1]
    positions[dst + 2] = model.positions[src + 2]
    normals[dst] = model.normals[src]
    normals[dst + 1] = -model.normals[src + 1]
    normals[dst + 2] = model.normals[src + 2]
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  const material = new THREE.MeshStandardMaterial({ color: 0xe8a2a2, side: THREE.DoubleSide })
  mesh = new THREE.Mesh(geometry, material)

  // Center on the bounding box and back the camera off proportionally.
  geometry.computeBoundingBox()
  const box = geometry.boundingBox as THREE.Box3
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3()).length()
  mesh.position.set(-center.x, -center.y, -center.z)

  if (scene && camera) {
    scene.add(mesh)
    camera.position.set(0, size * 0.25, size * 0.9)
    camera.lookAt(0, 0, 0)
  }
}
