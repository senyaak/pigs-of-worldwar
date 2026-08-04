// Building a skinned, textured mesh from parsed game data.
//
// Everything stays in the game's own Y-down coordinate space — geometry,
// bones, animation rotations all agree there. The conversion to three's Y-up
// happens at the very top: the returned group is rotated 180° about X, which
// is a proper rotation (no mirroring), so windings, normals and animations
// survive untouched.

import * as THREE from 'three'
import type { Bone, Model, Texture } from '../api'

export interface Pig {
  /** Add THIS to the scene; already converted to Y-up. */
  group: THREE.Group
  mesh: THREE.SkinnedMesh
  /** Index-addressable bones, HIR order. */
  bones: THREE.Bone[]
  dispose(): void
}

function buildTextureMaterials(model: Model, textures: Texture[]): THREE.Material[] {
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
    return new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.5 })
  })
}

function buildGeometry(model: Model, textures: Texture[]): THREE.BufferGeometry {
  const cornerCount = model.positions.length / 3
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(model.positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(model.normals, 3))

  // UVs arrive in texture pixels; normalize against the size of the texture
  // each corner's group references. V flips because TIM rows are top-down.
  const uvs = new Float32Array(cornerCount * 2)
  for (const group of model.groups) {
    const texture = textures[group.texture]
    const width = texture ? texture.width : 1
    const height = texture ? texture.height : 1
    for (let corner = group.start; corner < group.start + group.count; corner++) {
      uvs[corner * 2] = (model.uvs[corner * 2] + 0.5) / width
      uvs[corner * 2 + 1] = 1 - (model.uvs[corner * 2 + 1] + 0.5) / height
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

  // Rigid PS1-style skinning: every corner follows exactly one bone.
  const skinIndices = new Uint16Array(cornerCount * 4)
  const skinWeights = new Float32Array(cornerCount * 4)
  for (let corner = 0; corner < cornerCount; corner++) {
    skinIndices[corner * 4] = Math.max(0, model.boneIndices[corner])
    skinWeights[corner * 4] = 1
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4))

  model.groups.forEach((group, index) => geometry.addGroup(group.start, group.count, index))
  return geometry
}

/** The HIR skeleton as three bones, positioned at their bind-pose offsets. */
function buildBones(skeleton: Bone[]): THREE.Bone[] {
  const bones = skeleton.map((bone, index) => {
    const threeBone = new THREE.Bone()
    threeBone.name = `bone_${index}`
    threeBone.position.set(bone.x, bone.y, bone.z)
    return threeBone
  })
  skeleton.forEach((bone, index) => {
    // The root points at itself; parents come before children (docs/formats.md).
    if (index > 0) bones[bone.parentIndex].add(bones[index])
  })
  return bones
}

export function buildPig(model: Model, textures: Texture[], skeleton: Bone[]): Pig {
  const geometry = buildGeometry(model, textures)
  const materials = buildTextureMaterials(model, textures)
  const mesh = new THREE.SkinnedMesh(geometry, materials)

  const bones = skeleton.length > 0 ? buildBones(skeleton) : [new THREE.Bone()]
  mesh.add(bones[0])
  // Geometry positions are bind-pose world coordinates (vertex + accumulated
  // bone offset), and the bones start at exactly those offsets — so binding
  // with the identity transform lines the two up.
  mesh.bind(new THREE.Skeleton(bones))

  const group = new THREE.Group()
  group.rotation.x = Math.PI
  group.add(mesh)

  return {
    group,
    mesh,
    bones,
    dispose() {
      geometry.dispose()
      for (const material of materials) {
        ;(material as THREE.MeshStandardMaterial).map?.dispose()
        material.dispose()
      }
    }
  }
}
