// The weapon in a pig's hand.
//
// `Chars/WEAPONS.MAD` is one mesh per weapon and the exe holds the 1-based
// index of it at `[pig+0x58]`, out of the per-weapon record's +0x0c
// (lib/game/weapons.ts). It is the same slot the canopy uses one field along,
// so a rifle arrives exactly the way a parachute does.
//
// WHERE it hangs comes off the models themselves, with one correction from
// play. Every one of them is authored around the pig's own skeleton on the
// SAME side — the arm bones split along Z, not X (bone 4 at z +199, bone 7 at
// z −193), and `WE_RIF` runs z −458..+123 out of bone 7 while `WE_LEWIS` and
// `WE_MGUN` reach the same way out of the hip. So a held weapon is geometry
// parented to a bone: vertices arrive resolved to the bind pose (the loader
// adds the skeleton's accumulated offsets), and the mesh sits at MINUS that
// bone's offset inside it, which turns a bind-pose position back into a
// bone-local one.
//
// **The MODEL is mirrored across z, and only the model.** Play says the
// original holds it in the other hand, and the file is the weaker witness
// here: its bone field is no attachment at all — `WE_TELR` splits 13 vertices
// on bone 7 and 19 on bone 0, most models sit on 0 outright, which is the
// same "carries something else" the map props' field does (main/assets.ts) —
// so which arm it names is not evidence. `Chars/PROPOINT.MAD` is where the
// real attachment points probably live and nothing in the exe has been traced
// to it.
//
// The POSE stays as authored. Mirroring that too was tried and it is what
// sent the barrel pointing right: the aiming stance already carries the rifle
// 52° to the pig's LEFT at a level angle, +60° full up and +88° full down, so
// flipping it aims the weapon the wrong way across the body. Only the mesh
// moves, and the grip survives it — measured against the posed skeleton, the
// nearest rifle vertex sits 83 units from the near hand and 110 from the far
// one, against 76 and 168 unmirrored, on hands 203 apart holding a rifle 581
// long. Both hands stay on the weapon.
//
// Mirroring negates z on the positions AND the normals, and then the mesh is
// placed by MIRRORING ITS WHOLE TRANSFORM every frame rather than by hanging
// it off the opposite arm. Hanging it there was tried and it arrives upside
// down, because the two arms do not hold a rifle symmetrically: the rotation
// that would fix it is about 93° — the roll that reads as upside down — and
// it drifts 31 to 48 degrees across the aim sweep, so no fixed correction
// exists. Reflecting the transform is exact at every frame instead, and
// carries no negative scale, since the two flips cancel.
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
  /** Carry every held weapon to where its arm has moved. Once a frame, after
   * the animation has been applied. */
  update(): void
  dispose(): void
}

/** The body's midline: the skeleton's sides run along Z, not X. */
const FLIP = new THREE.Matrix4().makeScale(1, 1, -1)

/** Flip a model's geometry across the body's midline, normals included. */
function mirrorZ(geometry: THREE.BufferGeometry): void {
  for (const name of ['position', 'normal']) {
    const attribute = geometry.getAttribute(name)
    if (!attribute) continue
    for (let i = 0; i < attribute.count; i++) attribute.setZ(i, -attribute.getZ(i))
    attribute.needsUpdate = true
  }
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
  const held = new Map<
    PigMesh,
    { name: string; mesh: THREE.Mesh; bone: number; shift: THREE.Matrix4 }
  >()

  const build = (model: Model, textures: Texture[]): Art => {
    const geometry = buildModelGeometry(model, textures)
    mirrorZ(geometry)
    return {
      geometry,
      materials: buildTextureMaterials(model, textures),
      bone: mainBone(model)
    }
  }

  // Scratch for `update`, which runs every frame for every armed pig.
  const arm = new THREE.Matrix4()
  const inverse = new THREE.Matrix4()

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
    // Placed by hand every frame, off the arm it belongs to (`update`).
    mesh.matrixAutoUpdate = false
    // The bone's bind offset, mirrored — what turns a mirrored bind-pose
    // position back into a bone-local one.
    const at = bindOffset(pig.bones, ready.bone)
    const shift = new THREE.Matrix4().makeTranslation(-at.x, -at.y, at.z)
    pig.mesh.add(mesh)
    held.set(pig, { name, mesh, bone: ready.bone, shift })
    carry(pig)
  }

  /** One pig's weapon, put where the mirror image of its arm is now. */
  const carry = (pig: PigMesh): void => {
    const entry = held.get(pig)
    if (!entry) return
    const bone = pig.bones[entry.bone] ?? pig.bones[0]
    // The arm has to be current: this runs after the animation wrote it.
    bone.updateWorldMatrix(true, false)
    inverse.copy(pig.mesh.matrixWorld).invert()
    arm.multiplyMatrices(inverse, bone.matrixWorld)
    // FLIP · arm · FLIP · shift — the arm's own transform, reflected.
    entry.mesh.matrix.copy(arm).premultiply(FLIP).multiply(FLIP).multiply(entry.shift)
    entry.mesh.matrixWorldNeedsUpdate = true
  }

  return {
    show(pig, name) {
      if ((wanted.get(pig) ?? null) === name) return
      wanted.set(pig, name)
      apply(pig)
    },
    update() {
      for (const pig of held.keys()) carry(pig)
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
