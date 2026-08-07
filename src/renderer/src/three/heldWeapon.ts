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
// **It is CARRIED ACROSS to the other side, not mirrored.** Play says the
// original holds it in the other hand, and the file is the weaker witness on
// that: its bone field is no attachment at all — `WE_TELR` splits 13 vertices
// on bone 7 and 19 on bone 0, most models sit on 0 outright, which is the
// same "carries something else" the map props' field does (main/assets.ts) —
// so which arm it names is not evidence. `Chars/PROPOINT.MAD` is where the
// real attachment points probably live and nothing in the exe has been traced
// to it.
//
// Only the POSITION crosses the midline; the orientation is left exactly as
// the arm holds it. Both stronger operations were tried and both are wrong.
// Mirroring the POSE swings the barrel to the far side — the aiming stance
// already carries the rifle 52° to one side at a level angle, +60° full up
// and +88° full down, and reflecting that aims it across the body the other
// way. Mirroring the weapon's whole TRANSFORM does the same thing to the
// weapon alone. And hanging the mesh off the opposite arm bone arrives upside
// down, because the two arms do not hold a rifle symmetrically: the rotation
// that would fix that is about 93°, and it drifts 31 to 48 degrees across the
// aim sweep, so no fixed correction exists either.
//
// So: the mesh rides where its own arm puts it, turned the way its own arm
// turns it, with the attachment point reflected in z — which is the body's
// midline, the arm bones splitting along Z rather than X.
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

  const build = (model: Model, textures: Texture[]): Art => ({
    geometry: buildModelGeometry(model, textures),
    materials: buildTextureMaterials(model, textures),
    bone: mainBone(model)
  })

  // Scratch for `update`, which runs every frame for every armed pig.
  const arm = new THREE.Matrix4()
  const inverse = new THREE.Matrix4()
  const at = new THREE.Vector3()
  const turn = new THREE.Quaternion()
  const size = new THREE.Vector3()

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
    // Minus the bone's bind offset — what turns a bind-pose position back
    // into a bone-local one.
    const offset = bindOffset(pig.bones, ready.bone)
    const shift = new THREE.Matrix4().makeTranslation(-offset.x, -offset.y, -offset.z)
    pig.mesh.add(mesh)
    held.set(pig, { name, mesh, bone: ready.bone, shift })
    carry(pig)
  }

  /** One pig's weapon, put where its arm has it — on the other side. */
  const carry = (pig: PigMesh): void => {
    const entry = held.get(pig)
    if (!entry) return
    const bone = pig.bones[entry.bone] ?? pig.bones[0]
    // The arm has to be current: this runs after the animation wrote it.
    bone.updateWorldMatrix(true, false)
    inverse.copy(pig.mesh.matrixWorld).invert()
    arm.multiplyMatrices(inverse, bone.matrixWorld).multiply(entry.shift)
    // Everything as the arm holds it, and then across the midline.
    arm.decompose(at, turn, size)
    at.z = -at.z
    entry.mesh.matrix.compose(at, turn, size)
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
