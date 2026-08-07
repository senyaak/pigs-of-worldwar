// Turning a parsed model into three's geometry and materials.
//
// Shared by everything drawn from a VTX/NO2/FAC triple — the pig (which
// binds a skeleton on top) and the map's props (which do not). Everything
// stays in the game's own Y-down space; the conversion happens once, at the
// group each caller hangs its meshes off.

import * as THREE from 'three'
import type { Model, Texture } from '../api'

/**
 * One material per model group, in group order — which is also the order
 * the geometry's draw groups are added in.
 *
 * `lit` is off for the map's props, and that is a finding rather than a
 * taste: a THIRD of their NO2 entries are not unit vectors at all but
 * garbage floats (TREEP 12 of 37, IRONGATE 5 of 12, DUMMY 20 of 66), and
 * the faces reference them — the best any index offset can do is 67% of
 * quad corners landing on a real normal, and the plateau across +8..+16
 * says the vertex and normal index arrays are the same numbers anyway. The
 * original cannot be lighting geometry off that; it would get exactly the
 * speckle we got, a fir shredded into grey shards with its trunk eaten.
 * The characters are the other way round — `pcgru_hi` has 645 of 653 unit
 * length — so the pig keeps its light.
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
  return model.groups.map((group) => {
    const texture = textures[group.texture]
    if (!texture) return fallback
    const map = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat)
    // TIM rows are top-down; the V flip in the UV build assumes the data is
    // not flipped again at upload.
    map.flipY = false
    map.magFilter = THREE.NearestFilter
    map.minFilter = THREE.LinearFilter
    map.colorSpace = THREE.SRGBColorSpace
    map.needsUpdate = true
    const options = { map, side: THREE.DoubleSide, alphaTest: 0.5 }
    return lit ? new THREE.MeshStandardMaterial(options) : new THREE.MeshBasicMaterial(options)
  })
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
