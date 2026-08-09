// Building a skinned, textured mesh from parsed game data.
//
// Everything stays in the game's own Y-down coordinate space — geometry,
// bones, animation rotations all agree there. The conversion to three's Y-up
// happens at the very top: the returned group is rotated 180° about X, which
// is a proper rotation (no mirroring), so windings, normals and animations
// survive untouched.

import * as THREE from 'three'
import type { Bone, Model, Texture } from '../api'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { bodyExtent } from '../../../lib/game/body'
import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'

export interface Pig {
  /** Add THIS to the scene; already converted to Y-up. */
  group: THREE.Group
  mesh: THREE.SkinnedMesh
  /** Index-addressable bones, HIR order. */
  bones: THREE.Bone[]
  /** Bind-pose distance from the model origin (hip) down to the soles, in
   * WORLD units (the model's own, times `MODEL_SCALE`) — what to subtract
   * to stand ON the ground. */
  footOffset: number
  /** Model origin UP to the crown in the bind pose, WORLD units. The origin
   * is the hip, not the soles — the mesh hangs `footOffset` below the node
   * that carries it — so this, and not the pig's full height, is what
   * anything hanging OVER a pig clears. A magic offset would stop meaning
   * the same thing the moment the model's scale moved. */
  crownRise: number
  dispose(): void
}

function buildGeometry(model: Model, textures: Texture[]): THREE.BufferGeometry {
  const cornerCount = model.positions.length / 3
  const geometry = buildModelGeometry(model, textures)

  // Rigid PS1-style skinning: every corner follows exactly one bone.
  const skinIndices = new Uint16Array(cornerCount * 4)
  const skinWeights = new Float32Array(cornerCount * 4)
  for (let corner = 0; corner < cornerCount; corner++) {
    skinIndices[corner * 4] = Math.max(0, model.boneIndices[corner])
    skinWeights[corner * 4] = 1
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4))
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4))
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
  // A VTX unit is half a world unit (lib/game/scale.ts). The scale rides on
  // the MESH rather than the group below, because the battle reparents the
  // mesh out of that group into its own converted root and only the mesh
  // survives the move.
  mesh.scale.setScalar(MODEL_SCALE)

  const group = new THREE.Group()
  group.rotation.x = Math.PI
  group.add(mesh)

  // How tall the body is, measured off the art — a domain fact rather than a
  // drawing one, so the measuring lives next to the rules (lib/game/body.ts).
  const { footOffset, crownRise } = bodyExtent(model.positions)

  return {
    group,
    mesh,
    bones,
    footOffset,
    crownRise,
    dispose: () => disposeMesh(geometry, materials)
  }
}
