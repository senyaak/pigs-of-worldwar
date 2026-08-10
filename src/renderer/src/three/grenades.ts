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
import { isPlanted } from '../../../lib/game/grenade'
import { createLobArt } from './lobArt'
import { createLobTrails } from './lobTrail'

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

export interface GrenadeArt {
  /** Show exactly these, and lay their smoke. Once a frame. */
  /** `where` is where to DRAW one — between the last two steps
   * (three/tween.ts); the lob's own x/y/z is where the rules have it. */
  draw(live: readonly FlightShot[], delta: number, where: (shot: FlightShot) => Point): void
  /** How many puffs the trails have up (lib/game/trail.ts). */
  trail(): number
  clear(): void
  dispose(): void
}

/** How far to lift THIS mesh so it sits ON the ground rather than half in it —
 * its own half-height for anything planted, and a grenade's own radius for the
 * things that are in the air most of the time anyway. */
const liftOf = (mesh: THREE.Mesh, skill: number): number => {
  if (!isPlanted(skill)) return MESH_LIFT
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
  const box = mesh.geometry.boundingBox
  return box ? (box.max.y - box.min.y) / 2 : MESH_LIFT
}

export function createGrenadeArt(root: THREE.Object3D): GrenadeArt {
  /** The mesh drawn for each live grenade, by its index — null while the model
   * is still loading, which is the one state that draws nothing at all. */
  const meshes: (THREE.Mesh | null)[] = []
  const art = createLobArt()
  /** The smoke behind each one. The engine hangs it off the projectile in the
   * CONSTRUCTOR — a parented effect of id 0x15 — so it is born with the grenade
   * and dies a few frames after it (lib/game/trail.ts). */
  const trails = createLobTrails(root)

  /** The mesh for the i-th live grenade, made on demand out of the weapon's
   * own model. Null until that model has arrived. */
  const meshAt = (i: number, name: string | null): THREE.Mesh | null => {
    while (meshes.length <= i) meshes.push(null)
    if (meshes[i]) return meshes[i]
    if (!name) return null
    const mesh = art.take(name)
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
      // The trail follows what is still up; anything gone stops laying and its
      // last six fade out on their own. Keyed by the lob itself and laid at the
      // point being DRAWN, or the puffs would come off a stepping position.
      for (const shot of live) trails.follow(shot.id, where(shot))
      trails.update(delta)
      // Index-aligned with the engine's list, and a splice shifts everything
      // after it, so the simplest correct thing is to rebuild rather than track
      // identities: there is never more than a handful in the air.
      if (meshes.length > live.length) clearMeshes()
      for (let i = 0; i < live.length; i++) {
        const shot = live[i]
        const mesh = meshAt(i, weaponModelName(shot.skill))
        if (!mesh) continue
        const at = where(shot)
        // Y-DOWN, so lifting is subtracting. A PLANTED charge is lifted by its
        // OWN half-height instead of a grenade's radius: play saw the TNT sunk
        // into the ground ("тнт ложится в пол — а надо чтобы стояло"), which is
        // what a bundle as tall as a pig's knee does when it is lifted by the 35
        // a ball wants. The model's origin is taken to be its middle, as the
        // grenade's is.
        mesh.position.set(at.x, at.y - liftOf(mesh, shot.skill) * MODEL_SCALE, at.z)
        // It POINTS along its flight, nose down as it falls. Nothing has been
        // read about a projectile's orientation — the constructor hands the
        // body a yaw and a pitch and the drawing half is not decoded — so this
        // is the remake's, and it is the same pair the launch was built from.
        // A charge that was PUT somewhere stands as it was put: no velocity to
        // point along, and nothing to pitch.
        if (isPlanted(shot.skill)) continue
        mesh.rotation.y = Math.atan2(shot.vx, shot.vz) + Math.PI
        mesh.rotation.x = Math.atan2(shot.vy, Math.hypot(shot.vx, shot.vz))
        // Nothing special for a SINKING one: the water sheet is see-through, so
        // it is simply visible under it (three/terrain.ts, `WATER_ALPHA`).
      }
    },
    trail: () => trails.live(),
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
