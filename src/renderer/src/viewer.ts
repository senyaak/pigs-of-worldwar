// Three.js model viewer: one scene, swapped meshes.
//
// The game's coordinate system is PSX-era Y-down. The conversion to three's
// Y-up is baked into the geometry: Y is negated on positions and normals, and
// the triangle winding is reversed to keep faces front-facing (a mirror flips
// handedness). Doing this with mesh.scale.y = -1 instead turns every face
// back-facing, and the double-sided shader then re-flips the perfectly good
// normals — which is how half the pig went dark.
//
// Textures: one material per TIM, bound over the geometry's same-texture
// groups. UVs arrive in texture pixels and are normalized here, where the
// texture sizes are known; V is flipped because TIM rows are stored top-down
// while UV space points up.

import * as THREE from 'three'
import type { Model, Texture } from './api'

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

function disposeMesh(): void {
  if (!mesh || !scene) return
  scene.remove(mesh)
  mesh.geometry.dispose()
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of materials) {
    ;(material as THREE.MeshStandardMaterial).map?.dispose()
    material.dispose()
  }
  mesh = null
}

export function showModel(container: HTMLElement, model: Model, textures: Texture[]): void {
  ensureScene(container)
  disposeMesh()

  const cornerCount = model.positions.length / 3
  const positions = new Float32Array(model.positions.length)
  const normals = new Float32Array(model.normals.length)
  const uvs = new Float32Array(cornerCount * 2)
  const swap = [0, 2, 1]

  // Group ranges are whole triangles, so per-triangle corner swaps keep every
  // corner inside its group; texture sizes for UV normalization come from the
  // group the corner belongs to.
  const textureOfCorner = new Int32Array(cornerCount)
  for (const group of model.groups) textureOfCorner.fill(group.texture, group.start, group.start + group.count)

  for (let corner = 0; corner < cornerCount; corner++) {
    const triangle = Math.floor(corner / 3)
    const src = triangle * 3 + swap[corner % 3]
    positions[corner * 3] = model.positions[src * 3]
    positions[corner * 3 + 1] = -model.positions[src * 3 + 1]
    positions[corner * 3 + 2] = model.positions[src * 3 + 2]
    normals[corner * 3] = model.normals[src * 3]
    normals[corner * 3 + 1] = -model.normals[src * 3 + 1]
    normals[corner * 3 + 2] = model.normals[src * 3 + 2]
    const texture = textures[textureOfCorner[corner]]
    const width = texture ? texture.width : 1
    const height = texture ? texture.height : 1
    uvs[corner * 2] = (model.uvs[src * 2] + 0.5) / width
    uvs[corner * 2 + 1] = 1 - (model.uvs[src * 2 + 1] + 0.5) / height
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

  // One material per group; material index = group's position in the list.
  const fallback = new THREE.MeshStandardMaterial({ color: 0xe8a2a2, side: THREE.DoubleSide })
  const materials: THREE.Material[] = []
  model.groups.forEach((group, index) => {
    geometry.addGroup(group.start, group.count, index)
    const texture = textures[group.texture]
    if (!texture) {
      materials.push(fallback)
      return
    }
    const map = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat)
    // TIM rows are top-down; UV space is bottom-up. The V flip above assumes
    // the data is NOT flipped again by the texture.
    map.flipY = false
    map.magFilter = THREE.NearestFilter
    map.minFilter = THREE.LinearFilter
    map.colorSpace = THREE.SRGBColorSpace
    map.needsUpdate = true
    materials.push(
      new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5 })
    )
  })

  mesh = new THREE.Mesh(geometry, materials.length > 0 ? materials : fallback)

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
