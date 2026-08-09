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
import type { Bone, Clip, Model, Texture } from '../api'
import type { Pig } from '../../../lib/game/game'
import { restingY } from '../../../lib/game/locomotion'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { buildPig } from './pig'
import type { Pig as PigMesh } from './pig'
import { createPlayer } from './clips'
import type { Player as ClipPlayer } from './clips'
import { classArt } from './soldiers'
import type { PigPlate } from '../contracts/overlay'

/** One dressed soldier model out of Chars/british.mad. */
export interface SoldierArt {
  /** Archive base name, e.g. `pcgru_hi` (three/soldiers.ts). */
  base: string
  model: Model
  textures: Texture[]
}

// The model's own forward axis — chosen so a pig FACES where it walks
// (π had them strolling sideways like crabs; π/2 had them moonwalking).
export const PIG_HEADING_OFFSET = -Math.PI / 2

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
   * Wear a looping clip, or the bind pose. Repeating the one already on is
   * free, and asking for a different one CANCELS a committed animation —
   * which is the original's own model: a movement clip request resets the
   * cursor outright (0x472320), so landing on the run replaces the get-up on
   * the next frame. Who decides is the domain, not this.
   */
  setClip(index: number | null): void
  /** Commit to a clip played through once, holding its last frame. */
  playOnce(index: number): void
  /**
   * Lay a clip's upper body over whatever is worn, held at `phase` (0..1
   * through it); -1 clears it. This is aiming — the pig runs, walks or idles
   * underneath while its arms hold the weapon, which is how the original
   * keeps two animations on one pig (three/clips.ts, lib/game/aim.ts).
   */
  overlay(index: number, phase: number): void
  /** Put it where the game says it is: soles on the ground, sunk a little
   * when swimming. */
  settle(): void
  /** Stand it at a height worked out elsewhere — the drop-in's, mid-air, and
   * the acting pig's, from the locomotion state. `y` is the FEET. */
  place(x: number, y: number, z: number, heading: number): void
}

export interface Squad {
  readonly members: Soldier[]
  /** The soldier drawing this pig, if it is on this map. */
  of(pig: Pig): Soldier | undefined
  /** Every pig but `except`, as bodies to walk into (lib/game/obstacles). */
  bodies(except: Soldier): { x: number; y: number; z: number }[]
  /** Where each living pig's name hangs, in a view this big. `lift` is how far
   * over the crown the name floats — the dashboard's own number, passed in
   * rather than read, so this module owes `ui/` nothing. */
  plates(camera: THREE.Camera, width: number, height: number, lift: number): PigPlate[]
  /** Advance every clip player. */
  update(delta: number): void
  dispose(): void
}

export interface SquadAssets {
  /** Every model the squads need — one per class group on the map. The first
   * is the fallback for a class nothing loaded art for. */
  soldiers: SoldierArt[]
  skeleton: Bone[]
  clips: Clip[]
}

/**
 * Field every pig the game has, standing on its own spawn, into `root`.
 */
export function fieldSquad(
  assets: SquadAssets,
  pigs: Pig[],
  query: TerrainQuery,
  root: THREE.Object3D
): Squad {
  const artFor = (pigClass: number): SoldierArt =>
    assets.soldiers.find((art) => art.base === classArt(pigClass)) ?? assets.soldiers[0]

  // The clip player is the one piece a caller never touches, so it stays
  // beside the soldier rather than on it.
  const drawn = pigs.map((pig) => {
    const art = artFor(pig.pigClass)
    const mesh = buildPig(art.model, art.textures, assets.skeleton)
    // buildPig wraps the mesh in its own converted group; the battle has one
    // already, so only the mesh moves across.
    const node = mesh.group.children[0]
    const player: ClipPlayer = createPlayer(mesh)
    let clip: number | null = null
    root.add(node)

    const soldier: Soldier = {
      pig,
      mesh,
      node,
      art: art.base,
      setClip(index) {
        if (clip === index) return
        clip = index
        player.play(index === null ? null : (assets.clips[index] ?? null))
      },
      playOnce(index) {
        clip = index
        player.playOnce(assets.clips[index] ?? null)
      },
      overlay(index, phase) {
        player.overlay(assets.clips[index] ?? null, phase)
      },
      settle() {
        const { x, z } = pig.position
        soldier.place(x, restingY(query, x, z), z, pig.heading)
      },
      place(x, y, z, heading) {
        // The PIG carries where it stands; the mesh follows it. Anything that
        // can hit a pig reads the domain now, never this node
        // (lib/game/body.ts).
        pig.position = { x, y, z }
        pig.heading = heading
        node.position.set(x, y - mesh.footOffset, z)
        node.rotation.y = heading + PIG_HEADING_OFFSET
      }
    }
    soldier.place(pig.position.x, restingY(query, pig.position.x, pig.position.z), pig.position.z, pig.heading)
    return { soldier, player }
  })
  const members = drawn.map((each) => each.soldier)

  return {
    members,
    of: (pig) => members.find((soldier) => soldier.pig === pig),
    bodies: (except) =>
      members
        .filter((soldier) => soldier !== except)
        .map((soldier) => ({ ...soldier.pig.position })),
    plates(camera, width, height, lift) {
      const at = new THREE.Vector3()
      const out: PigPlate[] = []
      for (const soldier of members) {
        if (soldier.pig.health <= 0) continue
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
          health: soldier.pig.health
        })
      }
      return out
    },
    update(delta) {
      for (const { player } of drawn) player.update(delta)
    },
    dispose() {
      for (const { mesh } of members) mesh.dispose()
    }
  }
}
