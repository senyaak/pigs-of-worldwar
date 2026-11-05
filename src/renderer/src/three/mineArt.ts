// The MINES as models: the two kinds that are objects. A BURIED mine is not one,
// and what a detector sees of it is the ground's own (three/mineGround.ts).
//
// **A TRODDEN mine is the engine's own art.** Row 428/429 of the object name
// table is `WE_APMIN` (`lib/game/ammo.ts`), a mine model of its own that lives in
// every MAP's archive rather than in `Chars/WEAPONS.MAD` — so the thing lying in
// the ground with four tenths of a second left on it is not the mine a pig
// carries, and this file used to draw the carried one for want of a path to the
// other.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { TRIPPED_MINE_MODEL } from '../../../lib/game/ammo'

/** Where a fresh mesh of one of the MAP's models comes from (three/props.ts). */
export type SpawnModel = (name: string) => THREE.Mesh | null

export interface MineArt {
  /** Show exactly these and nothing else. Once a frame. */
  draw(
    tripped: readonly { x: number; y: number; z: number }[],
    /** The sapper's mines still lying ON the ground — furniture EVERYBODY
     * sees, in the original too (lib/game/mines.ts, `laid`). The map's own
     * `WE_APMIN`, like the trodden ones. */
    laid?: readonly { x: number; y: number; z: number }[]
  ): void
  /** How many are on the scene, both kinds — what a spec counts, since a model
   * is art and a screenshot cannot tell one from a stone. */
  shown(): number
  /** …and how many of those are TRODDEN ones, wearing the engine's own model. */
  tripped(): number
  clear(): void
  dispose(): void
}

export function createMineArt(root: THREE.Object3D, spawn?: SpawnModel): MineArt {
  /** The trodden ones, out of the map's archive. */
  const live: THREE.Mesh[] = []
  /** …and the sapper's, lying on the ground before they bed in. */
  const lying: THREE.Mesh[] = []

  const shrink = (pool: THREE.Mesh[], to: number): void => {
    for (let i = to; i < pool.length; i++) root.remove(pool[i])
    pool.length = Math.max(to, 0)
  }

  /** Put one pool's meshes where the list says. `lift` is in MODEL units. */
  const place = (
    pool: THREE.Mesh[],
    at: readonly { x: number; y: number; z: number }[],
    make: () => THREE.Mesh | null,
    lift: number
  ): void => {
    // Grown and shrunk to fit, the way the grenades' pool is: a marker has no
    // identity worth tracking and there are never many in range.
    for (let i = 0; i < at.length; i++) {
      if (!pool[i]) {
        const mesh = make()
        if (!mesh) return
        mesh.scale.setScalar(MODEL_SCALE)
        root.add(mesh)
        pool[i] = mesh
      }
      // ON the ground rather than in it: the model hangs around its own origin,
      // and game space is Y-DOWN, so lifting is subtracting.
      pool[i].position.set(at[i].x, at[i].y - lift * MODEL_SCALE, at[i].z)
    }
  }

  return {
    draw(tripped, laid = []) {
      if (live.length > tripped.length) shrink(live, tripped.length)
      if (lying.length > laid.length) shrink(lying, laid.length)
      // The trodden ones off the MAP, which is where `WE_APMIN` is. A map
      // whose archive has none simply shows nothing rather than borrowing the
      // carried model back: a stand-in that outlives its excuse is the thing
      // this file just stopped doing.
      place(live, tripped, () => spawn?.(TRIPPED_MINE_MODEL) ?? null, APMIN_LIFT)
      // The laid ones wear the same map model — in the exe they ARE that
      // projectile, lying where the sapper put them until everyone leaves.
      place(lying, laid, () => spawn?.(TRIPPED_MINE_MODEL) ?? null, APMIN_LIFT)
    },
    shown: () => live.length + lying.length,
    tripped: () => live.length,
    clear() {
      shrink(live, 0)
      shrink(lying, 0)
    },
    dispose() {
      shrink(live, 0)
      shrink(lying, 0)
    }
  }
}

/**
 * `WE_APMIN`'s lift off the ground, measured rather than guessed.
 *
 * The model runs **y −46..44** over 24 vertices and 22 quads, and game space is
 * Y-DOWN, so the number that has to come off the ground is the GREATEST y — the
 * same rule `three/grenades.ts` applies to a standing charge. 44, not 46.
 *
 * Which the art agrees with: the one flat plane at y 44 carries `APMIN002` and the
 * one at −46 carries `AMMO006`, the same 4×4 red the carried mine has. A red
 * plunger on top of a plate is a mine the right way up, so +y really is its
 * underside.
 */
const APMIN_LIFT = 44
