// Turning a parsed model into three's geometry and materials.
//
// Shared by everything drawn from a VTX/NO2/FAC triple — the pig (which
// binds a skeleton on top) and the map's props (which do not). Everything
// stays in the game's own Y-down space; the conversion happens once, at the
// group each caller hangs its meshes off.

import * as THREE from 'three'
import type { Model, Texture } from '../api'
import { paintLayers } from '../../../lib/formats/paintLayers'

/**
 * How far one painted layer is pulled toward the eye, in the depth buffer's own
 * smallest steps, on top of one step of the face's own slope.
 *
 * A wall's corner stones lie exactly on the wall's plane (lib/formats/paintLayers.ts),
 * and the two are different triangles, so each works out its own depth at a pixel
 * and rounds it its own way: at every pixel one or the other is a step nearer, and
 * the wall's stone comes through the corner stones in stripes and stipple that
 * move with the camera. Play: "Всё ещё текстуры странно себя ведут на стыках дома."
 * The rounding is worth a step or so: one step and four differ at one pixel in each
 * of 2 of the house's 10 views, and at none in the other 8 (docs/facts/wall-art.md).
 * Four is the remake's own margin, and the walls being 64 units thick it is nowhere
 * near showing through anything.
 *
 * A fade's clones copy all of this, so its depth prepass settles the same way.
 */
const LAYER_DEPTH_STEPS = 4

/**
 * One material per model group, in group order — which is also the order
 * the geometry's draw groups are added in.
 *
 * `lit` is off for the map's props, and the reason is now READ rather than
 * inferred. Play would not have "garbage in the data" as an answer — "в игре
 * не может быть мусора" — and he was right to push: the bytes are not
 * meaningless, they are **x86 machine code**. STW07PWW's NO2 holds 28 entries
 * of which 7 are unit vectors or exact zeros and the other 21 read
 * `5a 59 5b c3` (pop edx, pop ecx, pop ebx, ret), `53 51 52 56`,
 * `b8 ff ff ff`, `e8 d4 1e 00` — fragments of the game's own code, with every
 * fourth dword left zero. The tool that wrote these archives padded them with
 * whatever memory it had.
 *
 * A quad's normal indices are its VERTEX indices, one for one (dumped: quad 0
 * of STW07PWW carries 18,19,16,17 in both fields), so the faces do point
 * straight into that. Which settles it from the other end: the original cannot
 * be lighting a prop off its NO2, because half of what it would read is
 * instruction bytes. The characters are the other way round — 97.5% of every
 * corner `british.mad` hands over is unit length — so the pig keeps its light.
 *
 * A prop's own NO2 does carry real normals where the model was authored with
 * them, and exact ZEROS elsewhere (STW04PPP: eight unit, eight zero), and a
 * zero normal is its own instruction: nothing to light this face by.
 *
 * This is the same rule the ground already follows: the art carries its own
 * light and the engine must not add one.
 */
export function buildTextureMaterials(
  model: Model,
  textures: Texture[],
  { lit = true }: { lit?: boolean } = {}
): THREE.Material[] {
  const fallback = new THREE.MeshStandardMaterial({ color: 0xe8a2a2, side: THREE.DoubleSide })
  const layers = paintLayers(model, textures)
  return model.groups.map((group, index) => {
    const texture = textures[group.texture]
    return texture ? textureMaterial(texture, lit, layers[index]) : fallback
  })
}

/** One face group's material, its map named after its texture, `layer` painted
 * layers toward the eye. */
export function textureMaterial(texture: Texture, lit: boolean, layer = 0): THREE.Material {
  const map = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat)
  map.name = texture.name
  // TIM rows are top-down; the V flip in the UV build assumes the data is
  // not flipped again at upload.
  map.flipY = false
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.LinearFilter
  map.colorSpace = THREE.SRGBColorSpace
  map.needsUpdate = true
  const options = {
    map,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    polygonOffset: layer > 0,
    polygonOffsetFactor: -layer,
    polygonOffsetUnits: -layer * LAYER_DEPTH_STEPS
  }
  return lit ? new THREE.MeshStandardMaterial(options) : new THREE.MeshBasicMaterial(options)
}

/** Positions, normals, per-texture UVs and the draw groups. Skinning, where
 * a caller wants it, goes on top of this. */
export function buildModelGeometry(model: Model, textures: Texture[]): THREE.BufferGeometry {
  const cornerCount = model.positions.length / 3
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3))

  // UVs arrive in texture pixels; normalize against the size of the texture
  // each corner's group references.
  //
  // V does NOT flip. It used to, "because TIM rows are top-down" — but the
  // texture is uploaded with `flipY = false`, which already means data row 0
  // is v = 0, so the flip was a second one on top of nothing and every model
  // wore its texture upside down. The ground never did this: `three/terrain`
  // takes v straight out of `tileUvs` and looks right. What gave it away is
  // the map's firs, which are billboards with the whole tree PAINTED on
  // them — flipped, their crown samples the image's bottom row and the
  // trunk climbs into the sky, which is exactly how they looked.
  const uvs = new Float32Array(cornerCount * 2)
  for (const group of model.groups) {
    const texture = textures[group.texture]
    const width = texture ? texture.width : 1
    const height = texture ? texture.height : 1
    for (let corner = group.start; corner < group.start + group.count; corner++) {
      uvs[corner * 2] = (model.uvs[corner * 2] + 0.5) / width
      uvs[corner * 2 + 1] = (model.uvs[corner * 2 + 1] + 0.5) / height
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

  model.groups.forEach((group, index) => geometry.addGroup(group.start, group.count, index))
  return geometry
}

/** Free a geometry and everything its materials uploaded. */
export function disposeMesh(geometry: THREE.BufferGeometry, materials: THREE.Material[]): void {
  geometry.dispose()
  for (const material of materials) {
    ;(material as THREE.MeshStandardMaterial).map?.dispose()
    material.dispose()
  }
}
