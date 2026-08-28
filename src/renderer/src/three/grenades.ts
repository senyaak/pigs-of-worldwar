// Grenades, DRAWN — the weapon's own model on each one, and the smoke behind
// it.
//
// Where they are, what they bounce off and what a blast catches is the
// engine's (`lib/game/lobs.ts`); this file owns meshes. It used to own the
// flight as well, which meant a grenade could not be thrown anywhere a scene
// graph was not.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import type { FlightShot } from '../../../lib/game/snapshot'
import { LOB_STEP } from '../../../lib/game/lobs'
import { MODEL_SCALE } from '../../../lib/game/scale'
import type { Point } from '../../../lib/game/pose'
import { weaponModelName } from '../../../lib/game/weapons'
import { projectileModel } from '../../../lib/game/ammo'
import { isPlanted, lobOf } from '../../../lib/game/grenade'
import { SKILL } from '../../../lib/game/skills'
import { createLobArt } from './lobArt'
import { createLobTrails } from './lobTrail'
import { FUSE_TRAIL, LOB_TRAIL, ROCKET_TRAIL } from '../../../lib/game/trail'
import { fromExeY } from '../../../lib/game/terrain'

/**
 * How far the MESH is lifted off the point that bounces.
 *
 * The point is the projectile's centre and the model hangs around it, so a
 * grenade resting exactly on the ground is half buried — and on a slope its
 * downhill half is under the surface, which is what play saw ("проваливается
 * под текстуры где наклон"). Lifting by the body's own radius puts it ON the
 * ground instead of in it. In MODEL units, like the mesh's scale.
 */
const MESH_LIFT = LOB_STEP

/** A PLANTED charge as it was last drawn — which is a thing about the mesh and
 * not about the rules, so this is the only place it can be asked. */
export interface DrawnCharge {
  /** Where its FUSE points, a unit vector in game space: (0, −1, 0) is straight
   * up, since up is −Y. */
  fuse: Point
  /** The world y of its LOWEST corner — what has to be the ground under it. */
  base: number
}

export interface GrenadeArt {
  /** Show exactly these, and lay their smoke. Once a frame. */
  /** `where` is where to DRAW one — between the last two steps
   * (three/tween.ts); the lob's own x/y/z is where the rules have it. */
  draw(live: readonly FlightShot[], delta: number, where: (shot: FlightShot) => Point): void
  /** How every planted charge is standing, as of the last frame — a spec cannot
   * look at it, and "standing" is not something the engine's list knows. */
  charges(): DrawnCharge[]
  /** How many puffs the trails have up (lib/game/trail.ts). */
  trail(): number
  /** …and how many fuses are alight: one per planted charge that is laying its
   * own trail (lib/game/trail.ts, `FUSE_TRAIL`). */
  burning(): number
  clear(): void
  dispose(): void
}

/**
 * **A planted charge STANDS, fuse up.** Play: "тнт лежит боком на земле — должна
 * стоять фитилём вверх."
 *
 * Which way is up for it is the MODEL'S own fact, measured out of
 * `Chars/WEAPONS.MAD` rather than guessed: `WE_TNT` is 40 vertices in two boxes,
 * the bundle from x −64..77 (its two end caps are flat planes of their own,
 * textures AMMO002 and AMMO003) and a thinner stub from x −148..−64 carrying
 * AMMO001. The bundle's texture corners average rgb 181,82,0 — orange sticks —
 * and the stub's average **0,0,0**. A black stub out of the end of a bundle of
 * dynamite is the fuse, so the fuse points along model **−X**, and the whole
 * thing is authored lying down because a hand is what holds it.
 *
 * Game space is Y-DOWN, so up is −Y: turning +π/2 about Z takes model −X to
 * world −Y. The yaw the pool hands out (`lobArt.ts` `TURNED`) then only spins it
 * about the vertical, which is why it can stay.
 */
const STAND = Math.PI / 2

/** Scratch, reused: posing a mesh must not allocate once a frame. */
const posed = new THREE.Box3()
const pose = new THREE.Matrix4()
/** The model's fuse axis, before the pose turns it into a world direction. */
const FUSE_AXIS = new THREE.Vector3(-1, 0, 0)
const facing = new THREE.Vector3()

/**
 * **WHICH WAY A ROCKET POINTS, measured off its own model.** Play: "прожектайл
 * кривой при выстреле базуки", twice.
 *
 * The old pose was a yaw and a pitch that assumed the nose ran along +Z, which
 * was a guess and a wrong one — `WE_TNT`'s long axis turned out to be −X and
 * `WE_BAZZ`'s is neither. Measured out of the MAP's own archive, which is where
 * a fired rocket's art comes from (lib/game/ammo.ts): thirteen vertices, long
 * axis **Y** (−196..191), with **one** vertex at the −196 end against **six** at
 * +191 — an apex over a hexagonal body. A single vertex at one end of a rocket
 * is the nose, so the nose is model **−Y**.
 *
 * Turning that onto the velocity is the whole pose, and it is right for a ball
 * as well: `WE_GRE2` is symmetric about every axis, so spinning it costs
 * nothing.
 */
const NOSE_AXIS = new THREE.Vector3(0, -1, 0)
const heading = new THREE.Vector3()

/**
 * How far to lift THIS mesh so it sits ON the ground rather than half in it — a
 * grenade's own radius for the things that are in the air most of the time, and
 * for a planted charge **the lowest point of the model AS POSED**.
 *
 * Asked of the rotation the mesh is actually wearing, so the lift cannot drift
 * from the pose: standing, the TNT's deepest point is the far end of the bundle
 * (model x 77) rather than the 32 its half-height gave it lying down, which is
 * why the same bundle that used to sink is now on its end and on the ground.
 */
const posedBox = (mesh: THREE.Mesh): THREE.Box3 | null => {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  if (!box) return null
  return posed.copy(box).applyMatrix4(pose.makeRotationFromEuler(mesh.rotation))
}

const liftOf = (mesh: THREE.Mesh, skill: number): number => {
  if (!isPlanted(skill)) return MESH_LIFT
  // Y-DOWN: the LOWEST corner is the greatest y, and that is what has to come
  // off the ground.
  return posedBox(mesh)?.max.y ?? MESH_LIFT
}

/**
 * **WHERE THE FUSE TIP IS**, as an offset from the mesh's own origin — the
 * posed box's HIGHEST point, which in Y-down is its least y.
 *
 * Play: "искры идут из фитиля а не из самого динамита." They were: the sparks
 * were laid `FUSE_LIFT` (0x3C, the exe's own offset) above the projectile's
 * ORIGIN, and the origin is where the bundle sits on the ground. Sixty units up
 * from there is the middle of the sticks. Standing, the model's highest point
 * IS the black stub the fuse is (`STAND` above measures the same model the
 * other way), so the art answers this rather than a number.
 */
const tipOf = (mesh: THREE.Mesh): number => posedBox(mesh)?.min.y ?? 0

export function createGrenadeArt(
  root: THREE.Object3D,
  /** A fresh mesh of one of the MAP's models by name — where the engine's own
   * spawned art lives (lib/game/ammo.ts). The bazooka's rocket is `WE_BAZZ` and
   * it is not in `Chars/WEAPONS.MAD` at all, so without this a fired rocket had
   * nothing to be drawn as. */
  spawn?: (name: string) => THREE.Mesh | null
): GrenadeArt {
  /** The mesh drawn for each live grenade, by its index — null while the model
   * is still loading, which is the one state that draws nothing at all. */
  const meshes: (THREE.Mesh | null)[] = []
  const art = createLobArt()
  /** How the planted ones came out this frame — rebuilt every draw, since the
   * meshes are a pool and there is nothing to keep. */
  const standing: DrawnCharge[] = []
  /** The smoke behind each one. The engine hangs it off the projectile in the
   * CONSTRUCTOR — a parented effect of id 0x15 — so it is born with the grenade
   * and dies a few frames after it (lib/game/trail.ts). */
  const trails = createLobTrails(root)
  /** Where each fuse tip came out this frame, so the trail is laid off the MESH's
   * own origin rather than off the lob's ground point — the lift is counted once. */
  const alight = new Map<number, { x: number; y: number; z: number }>()

  /** The mesh for the i-th live grenade, made on demand out of the weapon's
   * own model. Null until that model has arrived. */
  const meshAt = (i: number, name: string | null): THREE.Mesh | null => {
    while (meshes.length <= i) meshes.push(null)
    if (meshes[i]) return meshes[i]
    if (!name) return null
    // The weapon archive first, and the MAP's if it has never heard of the name:
    // `take` caches its miss, so this asks WEAPONS.MAD once and the map after.
    const mesh = art.take(name) ?? spawn?.(name) ?? null
    if (!mesh) return null
    mesh.scale.setScalar(MODEL_SCALE)
    root.add(mesh)
    meshes[i] = mesh
    return mesh
  }

  /** Take every mesh off the scene — the list is index-aligned with the live
   * one, so anything going away shifts the rest. */
  const clearMeshes = (): void => {
    for (const mesh of meshes) if (mesh) art.release(mesh)
    meshes.length = 0
  }

  return {
    draw(live, delta, where) {
      // Index-aligned with the engine's list, and a splice shifts everything
      // after it, so the simplest correct thing is to rebuild rather than track
      // identities: there is never more than a handful in the air.
      if (meshes.length > live.length) clearMeshes()
      standing.length = 0
      alight.clear()
      for (let i = 0; i < live.length; i++) {
        const shot = live[i]
        // What FLIES is not always what was in the hand — a bazooka's rocket is
        // `WE_BAZZ` and the launcher stays with the pig (lib/game/ammo.ts).
        const mesh = meshAt(i, projectileModel(shot.skill) ?? weaponModelName(shot.skill))
        if (!mesh) continue
        const at = where(shot)
        // How it SITS in the air. Nothing has been read about a projectile's
        // orientation — the constructor hands the body a yaw and a pitch and
        // the drawing half is not decoded — so both poses are the remake's.
        // A charge that was PUT somewhere has no velocity to point along: it
        // stands on its end instead (`STAND`). A ROCKET points its nose
        // along its flight (`NOSE_AXIS` — measured, the apex vertex).
        // Everything else flies UNTURNED — a tumble was built and play threw
        // it out ("граната по сути шар", lib/game/grenade.ts has the note) —
        // and the identity is WRITTEN, not assumed, because the meshes are a
        // pool and the slot may have worn another pose last frame.
        if (isPlanted(shot.skill)) mesh.rotation.z = STAND
        else if (shot.skill === SKILL.BAZOOKA) {
          heading.set(shot.vx, shot.vy, shot.vz)
          if (heading.lengthSq() > 1e-6) {
            mesh.quaternion.setFromUnitVectors(NOSE_AXIS, heading.normalize())
          }
        } else {
          mesh.quaternion.identity()
        }
        // …and the lift comes after the pose, because it is measured FROM it.
        // Y-DOWN, so lifting is subtracting.
        const lift = liftOf(mesh, shot.skill) * MODEL_SCALE
        mesh.position.set(at.x, at.y - lift, at.z)
        if (isPlanted(shot.skill)) {
          facing.copy(FUSE_AXIS).applyEuler(mesh.rotation)
          standing.push({
            fuse: { x: facing.x, y: facing.y, z: facing.z },
            base: mesh.position.y + lift
          })
          // …and its own trail comes off the FUSE TIP rather than off the
          // bundle — the exe hangs effect 0x1D on the projectile with an offset
          // of 0x3C (`FUSE_LIFT`), which is measured from the charge's own base
          // and lands in the middle of the sticks. Play saw that and it is the
          // art that answers it (`tipOf`).
          alight.set(shot.id, {
            x: mesh.position.x,
            y: mesh.position.y + tipOf(mesh) * MODEL_SCALE,
            z: mesh.position.z
          })
        }
        // Nothing special for a SINKING one: the water sheet is see-through, so
        // it is simply visible under it (three/terrain.ts, `WATER_ALPHA`).
      }
      // The trail follows what is still up; anything gone stops laying and its
      // last few fade out on their own. Keyed by the lob itself, and laid at the
      // point being DRAWN or the puffs would come off a stepping position. A
      // planted charge lays its FUSE's trail instead, off the tip worked out
      // above — which is why this is the end of the frame and not the top of it.
      //
      // WHICH trail it is comes off the SKILL and not off the tip: a charge is
      // born on a frame whose model may still be loading, and the kind is fixed
      // the first time a trail is seen — so reading it off `alight` latched
      // every charge onto the grenade's row for the whole of its fuse.
      for (const shot of live) {
        const planted = isPlanted(shot.skill)
        // …and a ROCKET lays its own, which is thicker and white. The exe hangs
        // no trail on it at all — both of its sites were read and kind 10 is
        // outside both — so this row is the remake's, on play's word
        // (lib/game/trail.ts, `ROCKET_TRAIL`).
        const row = planted ? FUSE_TRAIL : lobOf(shot.skill)?.contact ? ROCKET_TRAIL : LOB_TRAIL
        trails.follow(shot.id, (planted ? alight.get(shot.id) : null) ?? where(shot), row)
      }
      trails.update(delta)
    },
    charges: () => standing,
    trail: () => trails.live(),
    burning: () => trails.laying(FUSE_TRAIL),
    clear() {
      trails.clear()
      clearMeshes()
    },
    dispose() {
      trails.dispose()
      clearMeshes()
      art.dispose()
    }
  }
}
