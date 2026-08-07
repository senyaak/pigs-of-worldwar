// The level's opening: the squad coming down under canopies onto its own
// spawn markers.
//
// The rule and its derivation are in `lib/game/parachute.ts`; this is the
// scene's half — who is up there, the canopy over each of them, and the fact
// that NOTHING else in the battle runs until they are all down. That last
// part is the original's too: the pig update's parachute branch (exe
// 0x46ed23) advances the clip and returns, so there is no clock and no input
// while a pig is under a canopy.
//
// Drop state lives HERE, keyed by soldier, rather than as fields on the
// soldier — arriving is a phase the battle passes through once, and nothing
// about standing and walking should carry a nullable canopy around forever.

import type * as THREE from 'three'
import type { Clip, Model, Texture } from '../api'
import { ANIM, restingY } from '../../../lib/game/locomotion'
import { createDrop, updateDrop } from '../../../lib/game/parachute'
import type { DropState } from '../../../lib/game/parachute'
import type { TerrainQuery } from '../../../lib/game/terrain'
import type { Bank } from '../audio/bank'
import { BATTLE_SOUNDS } from '../audio/battle'
import { clipSeconds } from './clips'
import { buildCanopies } from './parachute'
import type { Canopies } from './parachute'
import type { Soldier, Squad } from './squad'

/** What a spec sees of the drop — a canopy coming down is not something an
 * assertion can watch. */
export interface DropInState {
  running: boolean
  pigs: { name: string; y: number; landed: boolean; canopy: boolean }[]
}

export interface DropIn {
  /** One frame. Returns whether the phase is still going — while it is, the
   * battle does nothing else. */
  update(delta: number): boolean
  /** How much hangs above this soldier that the camera must clear. */
  riseOver(soldier: Soldier): number
  state(): DropInState
  dispose(): void
}

/** A drop-in that is already over: what a map with no canopy art gets, and
 * what a map whose markers all stand gets too. */
const NOBODY: DropIn = {
  update: () => false,
  riseOver: () => 0,
  state: () => ({ running: false, pigs: [] }),
  dispose: () => {}
}

/**
 * Lift every pig whose marker says so and hang a canopy on it.
 *
 * `canopy` null — no `WE_PARA` in the install — stands the squad on its
 * markers instead: a pig hanging from nothing is worse than one that simply
 * starts the level where it was going to end up.
 */
export function createDropIn(
  squad: Squad,
  query: TerrainQuery,
  clips: Clip[],
  canopy: { model: Model; textures: Texture[] } | null,
  /** The bank, asked for each time: it loads beside the scene and the first
   * frames of a battle are silent. */
  bank: () => Bank
): DropIn {
  const arriving = squad.members.filter((soldier) => soldier.pig.parachutes)
  if (!canopy || arriving.length === 0) return NOBODY

  const canopies: Canopies = buildCanopies(canopy.model, canopy.textures)
  /** How long the landing clip runs — what a play-once costs in seconds. */
  const landSeconds = clipSeconds(clips[ANIM.LAND])

  interface Arrival {
    soldier: Soldier
    drop: DropState
    canopy: THREE.Mesh | null
    /** Seconds of the landing clip left to play. */
    landIn: number
    done: boolean
  }

  const arrivals: Arrival[] = arriving.map((soldier) => {
    const { x, z } = soldier.pig.position
    // The spread is the exe's own `rand & 0x1ff`, so a squad arrives over a
    // beat rather than all together.
    const drop = createDrop(restingY(query, x, z), Math.random())
    soldier.place(x, drop.y, z, soldier.pig.heading)
    soldier.setClip(ANIM.PARACHUTE)
    return { soldier, drop, canopy: canopies.open(soldier.node), landIn: 0, done: false }
  })

  /** Whether the canopies have been heard opening yet. */
  let heard = false

  return {
    update(delta) {
      let busy = false
      for (const arrival of arrivals) {
        if (arrival.done) continue
        busy = true
        const { x, z } = arrival.soldier.pig.position
        if (!arrival.drop.landed) {
          updateDrop(arrival.drop, restingY(query, x, z), delta)
          arrival.soldier.place(x, arrival.drop.y, z, arrival.soldier.pig.heading)
          if (!arrival.drop.landed) continue
          // Touchdown: the canopy is cut and the pig gets to its feet, which
          // is `SetAnim(0x0a, …, 1, …)` — clip 10, once (exe 0x4717f5).
          if (arrival.canopy) canopies.cut(arrival.canopy)
          arrival.canopy = null
          arrival.landIn = landSeconds
          arrival.soldier.setClip(ANIM.LAND)
          bank().play(BATTLE_SOUNDS.land)
          continue
        }
        arrival.landIn -= delta
        if (arrival.landIn > 0) continue
        arrival.soldier.setClip(ANIM.IDLE)
        arrival.done = true
      }
      // The bank arrives a beat after the scene does, so the canopies cannot
      // simply be heard opening on frame one — the first frame it CAN be is
      // the one this fires on, and only while there is still someone up.
      if (busy && !heard && bank().has(BATTLE_SOUNDS.chute)) {
        bank().play(BATTLE_SOUNDS.chute)
        heard = true
      }
      return busy
    },
    riseOver: (soldier) =>
      arrivals.find((arrival) => arrival.soldier === soldier)?.canopy ? canopies.rise : 0,
    state: () => ({
      running: arrivals.some((arrival) => !arrival.done),
      pigs: arrivals
        .filter((arrival) => !arrival.done)
        .map((arrival) => ({
          name: arrival.soldier.pig.name,
          y: arrival.soldier.node.position.y,
          landed: arrival.drop.landed,
          canopy: arrival.canopy !== null
        }))
    }),
    dispose: () => canopies.dispose()
  }
}
