// The weapon in a pig's hand.
//
// `Chars/WEAPONS.MAD` is one mesh per weapon and the exe holds the 1-based
// index of it at `[pig+0x58]`, out of the per-weapon record's +0x0c
// (lib/game/weapons.ts). It is the same slot the canopy uses one field along.
//
// WHERE it hangs is decoded, not judged. An animated model carries three
// attachment slots, and 0x440d55 fills them:
//
//   [pig+0x58]  the WEAPON           -> [animModel+0x40]
//   a hat table at 0x51bc80          -> [animModel+0x44]
//   [pig+0x5c]  canopy / rocket pack -> [animModel+0x48]
//
// and `afDrawAnimModel` in `Data/_d3d.dll` draws each of them with a bone's
// matrix copied straight in (0x1000dbd1..0x1000dc70): +0x40 takes the one at
// +0xf0 of the built pose, +0x44 the one at +0x60, +0x48 the one at +0x30.
// A pose entry is a 3×4 matrix, 0x30 bytes, so those are bones **5, 2 and 1**
// — the hand, the head and the spine. Weapon in the hand, hat on the head,
// parachute on the back.
//
// Two things follow. The bone is always 5 and never the one a model's own VTX
// field names — that field is no attachment (`WE_TELR` splits 13 vertices on
// bone 7 and 19 on bone 0, most models sit on 0 outright, the same "carries
// something else" the map props' field does, main/assets.ts). And the matrix
// goes in WHOLE, with no offset of its own, so the vertices are bone-local:
// the accumulated bone offsets the model loader adds have to come back off
// again, which is what `unresolve` does.
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

/** The bone a held weapon hangs off: the hand (exe 0x440d55, dll 0x1000dbd1). */
const HAND = 5

/** …and the HEAD, which the same decode gives as bone 2 — where a HAT goes
 * (three/frontendPig.ts uses it). */
export const HEAD = 2

/**
 * …and a half turn about the model's own vertical, which the weapons are
 * authored needing. Not a nudge — a measurement. `WE_RIF` hung on bone 5 with
 * no turn puts its barrel at yaw −177.6° with the aim level: pointing exactly
 * backwards, and level, which is a reversal and nothing else. Turned, the
 * barrel tracks the aim through the whole sweep:
 *
 * | aim | yaw off forward | pitch |
 * | --- | --------------- | ----- |
 * | 45° up | −3.5° | +53.8° |
 * | level | −2.3° | +9.0° |
 * | 45° down | −2.7° | −36.0° |
 *
 * — within three degrees of straight ahead, with the pitch following the
 * angle. (At the very ends the barrel is near vertical and its yaw stops
 * meaning anything, which is the only place the numbers wander.)
 *
 * **And the original's own turn is now read.** The table at 0x51bc04 is filled
 * by a loop at 0x486443: `chars\weapons.mad` walked a triple at a time
 * (`afCreateObj2`, the entry pointer stepping 0x48 = three 24-byte records),
 * `afScaleObj` at unity, and then **`afSetObjPos(obj, 0,0,0, 0, 0x800, 0)`** —
 * and 0x1000 is a whole circle everywhere in this exe (`and eax,0FFFh` on the
 * sine table), so 0x800 is HALF of one, about the vertical. The hat loop at
 * 0x486340 does the same to `chars\fhats.mad`. The pig's BODY does not: its
 * constructor scales (0x45e443) and never calls `afSetObjPos`. So the turn is
 * the attachments', it is applied once at load, and a HAT gets it too.
 */
const TURNED = Math.PI

interface Art {
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
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

/** A bone's bind-pose offset from the model origin: its own and its parents'. */
function bindOffset(bones: THREE.Bone[], index: number, out: THREE.Vector3): THREE.Vector3 {
  out.set(0, 0, 0)
  let node: THREE.Object3D | null = bones[index] ?? null
  while (node && (node as THREE.Bone).isBone) {
    out.add(node.position)
    node = node.parent
  }
  return out
}

/**
 * Take the skeleton's accumulated offsets back OUT of a model's vertices.
 *
 * The loader adds them, because that is what a character model wants — its
 * parts are authored bone-local and pile up on the origin otherwise
 * (docs/formats.md). A held weapon is drawn with a bone's matrix and nothing
 * else, so it wants them off again; and since the bone index they were added
 * for is junk on these models, this simply undoes what was done rather than
 * reading anything into it.
 */
/** Take the loader's accumulated bone offsets back OFF, so the vertices are
 * bone-local and a bone's whole matrix can be handed over as the exe hands it.
 * Exported because a HAT is attached exactly the same way. */
export function unresolve(model: Model, geometry: THREE.BufferGeometry, bones: THREE.Bone[]): void {
  const position = geometry.getAttribute('position')
  const at = new THREE.Vector3()
  const offsets = new Map<number, THREE.Vector3>()
  for (let corner = 0; corner < position.count; corner++) {
    const bone = model.boneIndices[corner] ?? 0
    let offset = offsets.get(bone)
    if (!offset) {
      offset = bindOffset(bones, bone, at).clone()
      offsets.set(bone, offset)
    }
    position.setXYZ(
      corner,
      position.getX(corner) - offset.x,
      position.getY(corner) - offset.y,
      position.getZ(corner) - offset.z
    )
  }
  position.needsUpdate = true
}

export function createHeldWeapons(): HeldWeapons {
  /** One decoded model per archive entry; null once a load has failed, so a
   * missing entry is asked for once and not once a frame. */
  const art = new Map<string, Art | null>()
  const loading = new Set<string>()
  /** What each pig should be holding, and what it actually is. */
  const wanted = new Map<PigMesh, string | null>()
  const held = new Map<PigMesh, { name: string; mesh: THREE.Mesh }>()

  const build = (model: Model, textures: Texture[], bones: THREE.Bone[]): Art => {
    const geometry = buildModelGeometry(model, textures)
    unresolve(model, geometry, bones)
    return { geometry, materials: buildTextureMaterials(model, textures) }
  }

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
        art.set(name, build(result.model, result.textures, pig.bones))
        for (const each of wanted.keys()) apply(each)
      })
      return
    }

    // Straight onto the hand bone, at its origin: the engine hands the bone's
    // whole matrix over and adds nothing to it — except the half turn.
    const mesh = new THREE.Mesh(ready.geometry, ready.materials)
    mesh.name = name
    mesh.rotation.y = TURNED
    ;(pig.bones[HAND] ?? pig.bones[0]).add(mesh)
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
