// The sky: the original's own dome, drawn behind everything.
//
// Game space, Y-down, under the battle's converted root — so `skydome`, whose
// vertices run y −15778..0, is the half OVER the horizon and `skydomeu` the
// half below it. Which archive skins it is the map's (lib/game/sky.ts); this
// file only draws what it is handed.

import * as THREE from 'three'
import type { Model, Sky, Texture } from '../api'

/**
 * The dome's radius across, in world units, and the height it is squashed to.
 *
 * The original scales its 15778-unit model by (256, 128, 256) against
 * `afScaleObj`'s unity of 4096 — a dome four million units across, which is
 * 250× the whole map and so far away that the eye moving inside it changes
 * nothing. Nothing with a depth buffer can draw that: the battle's far plane
 * is 100 000 and vertices past it are clipped away.
 *
 * So the remake draws the same dome small enough to fit inside the frustum and
 * CENTRES IT ON THE EYE, which is the same picture in the limit — plus the
 * depth writes turned off and the first place in the draw order, which is what
 * keeps ground the dome now reaches past in front of it. The half-height is
 * the exe's own, and it is what stops the gradient reading like a ball.
 */
const SKY_RADIUS = 40_000
const SQUASH = 0.5

export interface SkyState {
  /** The mood the map picked (lib/game/sky.ts). */
  mood: string
  /** Triangles in each hemisphere, and one skin per quadrant. */
  triangles: number
  skins: number
  /** How far the dome's centre sits from the eye, world units. The whole
   * trick is that this stays 0 — a screenshot cannot say so and a camera that
   * quietly outran its sky would look like nothing at all until the edge of
   * the map. */
  offEye: number
  radius: number
}

export interface SkyArt {
  /** Bring the dome to the eye. Once a frame, before the scene is drawn —
   * `eye` is the camera in GAME space, which is what the battle already
   * carries for the see-through test. */
  follow(eye: THREE.Vector3): void
  /** What a spec can hold the dome to (three/debug.ts). */
  state(eye: THREE.Vector3): SkyState
  dispose(): void
}

/**
 * The dome's skins, opaque.
 *
 * A TIM's colour 0 is transparent (lib/formats/tim.ts) and the ordinary model
 * material discards it — which is right for a fir tree on a billboard and
 * wrong here twice over: pure black is a colour a night sky is mostly MADE of,
 * and there is nothing behind the sky for a hole to show. So the alpha is
 * painted back in and no `alphaTest` goes near it.
 */
function skin(texture: Texture): THREE.DataTexture {
  const rgba = new Uint8Array(texture.rgba)
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255
  const map = new THREE.DataTexture(rgba, texture.width, texture.height, THREE.RGBAFormat)
  // Rows top-down, as uploaded everywhere else — the UV build in
  // three/modelMesh.ts assumes it.
  map.flipY = false
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearFilter
  // A quadrant's own edge is its own; wrapping would fetch the far side of it.
  map.wrapS = THREE.ClampToEdgeWrapping
  map.wrapT = THREE.ClampToEdgeWrapping
  map.colorSpace = THREE.SRGBColorSpace
  map.needsUpdate = true
  return map
}

function buildHalf(model: Model, maps: THREE.DataTexture[]): THREE.Mesh {
  const corners = model.positions.length / 3
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3))
  const uvs = new Float32Array(corners * 2)
  const materials: THREE.Material[] = []
  model.groups.forEach((group, index) => {
    const map = maps[group.texture] ?? null
    const width = map ? map.image.width : 1
    const height = map ? map.image.height : 1
    for (let corner = group.start; corner < group.start + group.count; corner++) {
      uvs[corner * 2] = (model.uvs[corner * 2] + 0.5) / width
      uvs[corner * 2 + 1] = (model.uvs[corner * 2 + 1] + 0.5) / height
    }
    geometry.addGroup(group.start, group.count, index)
    materials.push(
      new THREE.MeshBasicMaterial({
        map,
        color: map ? 0xffffff : 0x6c8fbf,
        side: THREE.DoubleSide,
        // Behind everything, always: no depth of its own to compare or to
        // write, and drawn first (renderOrder below).
        depthTest: false,
        depthWrite: false,
        fog: false
      })
    )
  })
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  const mesh = new THREE.Mesh(geometry, materials)
  // The dome is centred on the eye every frame and reaches past the far plane
  // in nothing but its own corners; culling it against a box that moves with
  // the camera costs more than it saves and gets it wrong at the edges.
  mesh.frustumCulled = false
  return mesh
}

export function buildSky(root: THREE.Object3D, sky: Sky): SkyArt {
  const maps = sky.textures.map(skin)
  const group = new THREE.Group()
  const scale = SKY_RADIUS / 15778
  group.scale.set(scale, scale * SQUASH, scale)
  // Before every other opaque thing in the scene, which is what makes
  // depthTest:false safe — anything drawn after it simply covers it.
  group.renderOrder = -1
  const halves = [buildHalf(sky.above, maps), buildHalf(sky.below, maps)]
  for (const half of halves) {
    half.renderOrder = -1
    group.add(half)
  }
  root.add(group)

  return {
    follow(eye) {
      group.position.copy(eye)
    },
    state: (eye) => ({
      mood: sky.name,
      triangles: sky.above.triangleCount,
      skins: maps.length,
      offEye: group.position.distanceTo(eye),
      radius: SKY_RADIUS
    }),
    dispose() {
      root.remove(group)
      for (const half of halves) {
        half.geometry.dispose()
        for (const material of half.material as THREE.Material[]) material.dispose()
      }
      for (const map of maps) map.dispose()
    }
  }
}
