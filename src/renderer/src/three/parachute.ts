// The canopy a pig drops in under: `WE_PARA` out of `Chars/WEAPONS.MAD`.
//
// Not a guess at which model it is. `pig+0x5c` is the held-model slot and 0
// means empty, so it is 1-based, and `Pig::StartParachuting` (exe 0x4716c0)
// writes 0x18 — the archive's 24th model, which is `WE_PARA`. Landing
// (0x4717d0) writes 0 back, which is what takes it away.
//
// The model is 35 vertices, all on bone 0, reaching 1994 units up from the
// origin: a canopy authored to hang over the pig's own hip, which is exactly
// where the skinned mesh's origin sits. So it goes on the pig's mesh with no
// offset and no scale of its own — the mesh already carries MODEL_SCALE, and
// the canopy is in the same VTX units the pig is.
//
// It rides the MESH rather than a bone on purpose: the risers come off the
// shoulders and the canopy is what the pig swings under, so a canopy that
// followed the hip bone through the hang clip would wag with the body.

import * as THREE from 'three'
import type { Model, Texture } from '../api'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'

export interface Canopies {
  /** Hang one over a pig's mesh. */
  open(over: THREE.Object3D): THREE.Mesh
  /** Cut one away. */
  cut(canopy: THREE.Mesh): void
  /** How far the canopy reaches above the pig's origin, WORLD units — what
   * the camera has to leave room for while a pig is under one. Measured off
   * the model rather than written down, so it keeps meaning the same thing
   * if `MODEL_SCALE` ever moves. */
  rise: number
  dispose(): void
}

/** Geometry and materials built once and shared by every pig dropping in. */
export function buildCanopies(model: Model, textures: Texture[]): Canopies {
  const geometry = buildModelGeometry(model, textures)
  const materials = buildTextureMaterials(model, textures)
  // Game Y-down: the smallest Y is the top of the canopy.
  let top = 0
  for (let i = 1; i < model.positions.length; i += 3) {
    if (model.positions[i] < top) top = model.positions[i]
  }
  return {
    rise: -top * MODEL_SCALE,
    open(over) {
      const canopy = new THREE.Mesh(geometry, materials)
      canopy.name = 'WE_PARA'
      over.add(canopy)
      return canopy
    },
    cut(canopy) {
      canopy.removeFromParent()
    },
    dispose: () => disposeMesh(geometry, materials)
  }
}
