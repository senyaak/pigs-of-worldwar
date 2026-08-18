// The pigs on the map: one dressed, skinned, animated model per pig the
// domain fielded, and the handful of things the battle asks of them.
//
// Everything here is game-space (Y-down) and goes under the battle's own
// converted root — this module never sees three's Y-up world except in
// `plates`, which is a projection and says so.
//
// A soldier knows nothing about how it got here: the opening parachute drop
// keeps its own state beside this list (`three/dropIn.ts`), so nothing about
// arriving leaks into the thing that stands and walks.

import * as THREE from 'three'
import type { Bone, Model, Texture } from '../api'
import type { Pig } from '../../../lib/game/game'
import { restingY } from '../../../lib/game/locomotion'
import { isDead } from '../../../lib/game/health'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { buildPig } from './pig'
import type { Pig as PigMesh } from './pig'
import type { Quat } from '../../../lib/game/quaternion'
import { classArt } from './soldiers'
import type { PigPlate } from '../contracts/overlay'

/**
 * One dressed soldier model: the geometry out of `Chars/british.mad` and the
 * skins out of whichever nation's `.MTD` (lib/game/nations.ts).
 *
 * All seven archives hold the same 120 entries under the same names at the
 * same sizes, so one set of faces indexes any of them — a nation is a repaint.
 * The pair `(base, nation)` is the KEY: two nations share the geometry, and
 * looking one up by `base` alone silently dressed both sides the same.
 */
export interface SoldierArt {
  /** Archive base name, e.g. `pcgru_hi` (three/soldiers.ts). */
  base: string
  /** Which nation these skins are, 0..6. */
  nation: number
  model: Model
  textures: Texture[]
}

// The model's own forward axis. It belongs to the RULES now — a bone's world
// position depends on it (lib/game/skeleton.ts) — and is re-exported here
// because everything that stands a pig up reads it from this module.
import { PIG_HEADING_OFFSET } from '../../../lib/game/skeleton'
export { PIG_HEADING_OFFSET }

/** One pig, drawn. */
export interface Soldier {
  readonly pig: Pig
  readonly mesh: PigMesh
  /** The skinned mesh itself, parented into the battle's root. Anything that
   * rides ON a pig — a canopy — hangs off this. */
  readonly node: THREE.Object3D
  /** The archive base actually drawn, which is the fallback when the pig's
   * class had no art of its own. */
  readonly art: string
  /**
   * Wear this pose: one parent-relative turn per bone, in HIR order.
   *
   * The ENGINE works it out — which clip, how far into it, the weapon channel
   * laid over the top and every convention behind them (lib/game/bonePose.ts)
   * — because where a bone ends up is what a blade sweeps through and where a
   * muzzle points. This writes it onto three's bones and lets the GPU skin.
   */
  pose(turns: readonly Quat[], root: { x: number; y: number; z: number }): void
  /**
   * DRAW it standing here — the drop-in's height mid-air, the acting pig's off
   * the locomotion state, or a point interpolated between two steps of it.
   * `y` is the FEET. Moves the mesh and nothing else.
   */
  place(x: number, y: number, z: number, heading: number): void
}

export interface Squad {
  readonly members: Soldier[]
  /** The soldier drawing this pig, by the pig's own id — what the bus carries
   * and what a snapshot will (lib/game/events.ts). */
  of(pig: number): Soldier | undefined
  /** Every pig but `except`, as bodies to walk into (lib/game/obstacles). */
  bodies(except: Soldier): { x: number; y: number; z: number }[]
  /** Where each living pig's name hangs, in a view this big. `lift` is how far
   * over the crown the name floats — the dashboard's own number, passed in
   * rather than read, so this module owes `ui/` nothing. */
  plates(camera: THREE.Camera, width: number, height: number, lift: number): PigPlate[]
  dispose(): void
}

export interface SquadAssets {
  /** Every model the squads need — one per class group on the map, per NATION
   * fielded. The first is the fallback for a class nothing loaded art for. */
  soldiers: SoldierArt[]
  skeleton: Bone[]
  /** Which nation each side wears, by side index — what picks between two
   * `SoldierArt`s that share a base. */
  nations: readonly number[]
}

/**
 * Field every pig the game has, standing on its own spawn, into `root`.
 */
export function fieldSquad(
  assets: SquadAssets,
  /** Every pig, side by side — the outer array's index is the side, which is
   * what says which nation's skins its pigs wear. */
  squads: Pig[][],
  query: TerrainQuery,
  root: THREE.Object3D
): Squad {
  const artFor = (pigClass: number, nation: number): SoldierArt => {
    const base = classArt(pigClass)
    return (
      assets.soldiers.find((art) => art.base === base && art.nation === nation) ??
      assets.soldiers.find((art) => art.base === base) ??
      assets.soldiers[0]
    )
  }

  const pigs = squads.flat()
  const nationOf = new Map<number, number>()
  squads.forEach((side, index) => {
    for (const pig of side) nationOf.set(pig.id, assets.nations[index] ?? index)
  })

  const members = pigs.map((pig) => {
    const art = artFor(pig.pigClass, nationOf.get(pig.id) ?? 0)
    const mesh = buildPig(art.model, art.textures, assets.skeleton)
    // buildPig wraps the mesh in its own converted group; the battle has one
    // already, so only the mesh moves across.
    const node = mesh.group.children[0]
    root.add(node)
    /** Where the ROOT bone sits in the bind pose — the body's own per-frame
     * offset is added to this rather than replacing it (pig.HIR gives the pig's
     * own root (0,0,0), but nothing here should depend on that). */
    const bind0 = mesh.bones[0]?.position.clone() ?? new THREE.Vector3()

    const soldier: Soldier = {
      pig,
      mesh,
      node,
      art: art.base,
      pose(turns, root) {
        const count = Math.min(turns.length, mesh.bones.length)
        for (let bone = 0; bone < count; bone++) {
          const { x, y, z, w } = turns[bone]
          mesh.bones[bone].quaternion.set(x, y, z, w)
        }
        // The body's own offset goes on the ROOT bone, on top of its bind place,
        // which is what the library does with it (`_d3d.dll` 0x1001223f writes
        // the primary channel's own root record beside the bones). Every bone is
        // its child, so the whole pig carries it.
        const root0 = mesh.bones[0]
        if (root0) root0.position.set(bind0.x + root.x, bind0.y + root.y, bind0.z + root.z)
      },
      place(x, y, z, heading) {
        // DRAWING, and only that. The pig's own position is the engine's and
        // is written by the rules that move it — this used to write it back
        // from here, which meant the renderer decided where a pig was every
        // frame and nothing interpolated could be drawn without lying to the
        // battle about it.
        node.position.set(x, y - mesh.footOffset, z)
        node.rotation.y = heading + PIG_HEADING_OFFSET
      }
    }
    soldier.place(pig.position.x, restingY(query, pig.position.x, pig.position.z), pig.position.z, pig.heading)
    return soldier
  })

  return {
    members,
    of: (id) => members.find((soldier) => soldier.pig.id === id),
    bodies: (except) =>
      members
        .filter((soldier) => soldier !== except)
        .map((soldier) => ({ ...soldier.pig.position })),
    plates(camera, width, height, lift) {
      const at = new THREE.Vector3()
      const out: PigPlate[] = []
      for (const soldier of members) {
        if (isDead(soldier.pig)) continue
        soldier.node.getWorldPosition(at)
        // World space is Y-up, so the plate hangs above by ADDING to y. The
        // node sits at the model's ORIGIN — the hip — so clear the rise to
        // the crown and let the caller's `lift` say only how far over the head
        // the name floats, which keeps meaning the same thing whatever the
        // model's scale does.
        at.y += soldier.mesh.crownRise + lift
        at.project(camera)
        if (at.z > 1) continue // behind the camera
        out.push({
          x: (at.x * 0.5 + 0.5) * width,
          y: (-at.y * 0.5 + 0.5) * height,
          name: soldier.pig.name,
          // WHOLE points, the way the dashboard's own number is: the exe hands
          // its plate `health >> 7` and drops the 128ths. Water takes fractions
          // of a point (lib/game/drowning.ts), so without this the plate would
          // read 43.7265625.
          health: Math.floor(soldier.pig.health)
        })
      }
      return out
    },
    dispose() {
      for (const { mesh } of members) mesh.dispose()
    }
  }
}
