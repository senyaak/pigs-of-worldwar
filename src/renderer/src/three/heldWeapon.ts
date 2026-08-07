// The weapon in a pig's hand.
//
// `Chars/WEAPONS.MAD` is one mesh per weapon and the exe holds the 1-based
// index of it at `[pig+0x58]`, out of the per-weapon record's +0x0c
// (lib/game/weapons.ts). It is the same slot the canopy uses one field along,
// so a rifle arrives exactly the way a parachute does.
//
// WHERE it hangs is not a placement anybody had to guess: the models carry a
// bone index like every other VTX, and `WE_RIF` and `WE_KNIFE` are wholly on
// bone 7, the right forearm. So a held weapon is simply geometry parented to
// that bone — the arm animates and the rifle goes with it. Vertices arrive
// resolved to the bind pose (the loader adds the skeleton's accumulated
// offsets), so the mesh sits at MINUS that bone's offset inside it, which is
// what turns a bind-pose position back into a bone-local one.
//
// A weapon whose model the archive does not carry — the rocket, the guided
// missile, the grenade launcher all ask for entries past its end — simply
// shows nothing.

import * as THREE from 'three'
import type { Model, Texture } from '../api'
import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'
import type { Pig as PigMesh } from './pig'

/** Where the models live, and where the canopy comes from too. */
const WEAPON_ARCHIVE = 'Chars/WEAPONS.MAD'

interface Art {
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
  /** The bone the model's own vertices are skinned to. */
  bone: number
}

export interface HeldWeapons {
  /**
   * Show `name` in this pig's hand, or nothing when it is null. The first
   * call for a model loads it; until it arrives the hand stays empty, and
   * a hand that changed its mind in the meantime is left alone.
   */
  show(pig: PigMesh, name: string | null): void
  dispose(): void
}

/** Which bone most of a model's corners belong to. */
function mainBone(model: Model): number {
  const votes = new Map<number, number>()
  for (const bone of model.boneIndices) votes.set(bone, (votes.get(bone) ?? 0) + 1)
  let best = 0
  let most = 0
  for (const [bone, count] of votes) {
    if (count > most) {
      most = count
      best = bone
    }
  }
  return best
}

/** A bone's bind-pose offset from the model origin: its own and its parents'. */
function bindOffset(bones: THREE.Bone[], index: number): THREE.Vector3 {
  const at = new THREE.Vector3()
  let node: THREE.Object3D | null = bones[index] ?? null
  while (node && (node as THREE.Bone).isBone) {
    at.add(node.position)
    node = node.parent
  }
  return at
}

export function createHeldWeapons(): HeldWeapons {
  /** One decoded model per archive entry; null once a load has failed, so a
   * missing entry is asked for once and not once a frame. */
  const art = new Map<string, Art | null>()
  const loading = new Set<string>()
  /** What each pig should be holding, and what it actually is. */
  const wanted = new Map<PigMesh, string | null>()
  const held = new Map<PigMesh, { name: string; mesh: THREE.Mesh }>()

  const build = (model: Model, textures: Texture[]): Art => ({
    geometry: buildModelGeometry(model, textures),
    materials: buildTextureMaterials(model, textures),
    bone: mainBone(model)
  })

  /** Bring one pig's hand up to date with what was asked of it. */
  const apply = (pig: PigMesh): void => {
    const name = wanted.get(pig) ?? null
    const already = held.get(pig)
    if ((already?.name ?? null) === name) return
    if (already) {
      already.mesh.removeFromParent()
      held.delete(pig)
    }
    if (!name) return

    const ready = art.get(name)
    // Not decoded yet, or known to be missing: the hand stays empty and the
    // load, once it lands, comes back through here.
    if (!ready) {
      if (ready === null || loading.has(name)) return
      loading.add(name)
      void window.api.loadModel(WEAPON_ARCHIVE, name).then((result) => {
        loading.delete(name)
        if (!result.ok) {
          console.log(`no ${name} to hold: ${result.error}`)
          art.set(name, null)
          return
        }
        art.set(name, build(result.model, result.textures))
        for (const each of wanted.keys()) apply(each)
      })
      return
    }

    const mesh = new THREE.Mesh(ready.geometry, ready.materials)
    mesh.name = name
    mesh.position.copy(bindOffset(pig.bones, ready.bone)).negate()
    ;(pig.bones[ready.bone] ?? pig.bones[0]).add(mesh)
    held.set(pig, { name, mesh })
  }

  return {
    show(pig, name) {
      if ((wanted.get(pig) ?? null) === name) return
      wanted.set(pig, name)
      apply(pig)
    },
    dispose() {
      for (const { mesh } of held.values()) mesh.removeFromParent()
      held.clear()
      wanted.clear()
      for (const ready of art.values()) {
        if (ready) disposeMesh(ready.geometry, ready.materials)
      }
      art.clear()
    }
  }
}
