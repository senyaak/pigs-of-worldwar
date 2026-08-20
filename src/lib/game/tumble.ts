// Pigs THROWN — the only pigs in this engine that move without being driven.
//
// Play: "мины не отбрасывают — как и тнт", and then "также мины и думаю гранаты
// тоже не отбрасывают — так что это общая проблемма." Right on both counts, and
// the reason was never the blast: the whole engine had exactly ONE locomotion
// state, the acting pig's (lib/game/battle.ts), so there was nowhere to put a
// velocity for anybody else. This module is that somewhere.
//
// It owns no physics of its own. A thrown pig is a pig in the AIR, which
// `updateLocomotion` already knows how to be — the flight, the obstacles, the
// bounce off the ground, the landing and the getting up are all in there
// (lib/game/locomotion.ts `fly`), and the exe agrees that the two are the same
// state: `UpdateMovement` returns at once when the pig's state is 5 (0x46b205),
// so a pig in the air gets no walking and no turning and the physics owns it
// until it lands.
//
// **The ACTING pig is not in here.** It has a locomotion state already and the
// battle drives it; a fling for that one goes straight onto `loco.airborne`,
// which is the same flight a jump takes. Two states for one pig would fight over
// its position, and the one that lost would drag it back to the ground.
//
// Pure, seconds and game space (Y-DOWN) like the rest of lib/game.

import { createLocomotion, updateLocomotion } from './locomotion'
import type { LocomotionState } from './locomotion'
import { withPigs } from './obstacles'
import type { Obstruction } from './obstacles'
import { isDead } from './health'
import type { Pig } from './game'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

export interface TumbleWorld {
  query: TerrainQuery
  /** Every pig, so the ones NOT flying can be in the way of the one that is. */
  pigs: () => Pig[]
  /** The map's own objects — a flung pig hits a crate the way a jumping one
   * does. */
  obstacles: Obstruction
}

export interface Tumbles {
  /**
   * Throw this pig: `speed` in game units a second, along `bearing`, at 45° up.
   *
   * The pitch is the engine's own and not a taste — every knock-about in the exe
   * goes through `0x4a9100(speed, 0x200, bearing, 0)`, and 0x200 of 4096 is 45°
   * (`PITCH` below). Throwing one that is already in the air REPLACES what it had:
   * a second blast catching a pig mid-flight is the last word on where it goes.
   */
  fling(pig: Pig, speed: number, bearing: number, ejected?: boolean): void
  /** One frame of every flight. */
  update(delta: number): void
  /** How many are in the air — what a turn cannot be handed over through
   * (lib/game/battle.ts `settling`). */
  live(): number
  /** Whether THIS pig is being thrown right now. */
  has(pig: Pig): boolean
  /** Where each one is, for a spec to measure — a flight is a thing nothing else
   * can see. */
  at(): { pig: number; y: number; vx: number; vy: number; vz: number }[]
  clear(): void
}

/**
 * **45° UP, along the bearing.** `0x200` of 4096, which is what the engine hands
 * `0x4a9100` at every site that throws a pig about: the melee's knockback
 * (0x4786c1, `weapons/melee.md`), a pig shoved by another body (0x477695,
 * 0x4781cd, 0x4783ff), and the map object at 0x44050c that pushes every pig
 * around it as it goes. Five call sites, one pitch.
 */
export const PITCH = Math.PI / 4

/** The velocity a throw of this speed and bearing comes to — spherical, the way
 * `0x4a9100` builds it, and up is −Y. */
export const flingVelocity = (
  speed: number,
  bearing: number
): { vx: number; vy: number; vz: number } => ({
  // Heading 0 faces +Z and x is its sine, which is the convention the walk and
  // the jump's own push already use (lib/game/locomotion.ts).
  vx: Math.cos(PITCH) * speed * Math.sin(bearing),
  vy: -Math.sin(PITCH) * speed,
  vz: Math.cos(PITCH) * speed * Math.cos(bearing)
})

export function createTumbles(world: TumbleWorld, emit: Emit): Tumbles {
  const { query } = world
  /** One locomotion state per pig in the air, by id. */
  const flying = new Map<number, LocomotionState>()

  /** Everything in the way of the body at `id`, which is standing at `at`: the
   * map's objects and every OTHER pig, the same body list the driven walk is
   * given — minus any it is already inside, or it would never get out
   * (lib/game/obstacles.ts). A body struck by a BAYONET always starts there. */
  const around = (id: number, at: LocomotionState): Obstruction =>
    withPigs(
      world.obstacles,
      world
        .pigs()
        .filter((pig) => pig.id !== id && !isDead(pig))
        .map((pig) => ({ ...pig.position })),
      { x: at.x, y: at.y, z: at.z }
    )

  return {
    fling(pig, speed, bearing, ejected = false) {
      // Built where the pig IS, standing on whatever it is standing on — a pig
      // blown off a crate must not be measured from the ground under it
      // (lib/game/locomotion.ts `Footing`).
      const state =
        flying.get(pig.id) ??
        createLocomotion(query, pig.position.x, pig.position.z, pig.heading, {
          y: pig.position.y,
          obstruction: world.obstacles
        })
      state.x = pig.position.x
      state.z = pig.position.z
      state.y = pig.position.y
      const { vx, vy, vz } = flingVelocity(speed, bearing)
      // `bouncing` is what makes it read as being thrown rather than jumping:
      // the clip is the BOUNCE and the landing bounces on before it settles
      // (lib/game/locomotion.ts). `ejected` swaps that clip for the FLYING
      // one — which is what a MELEE hit wears, the exe putting a struck pig
      // through 0x470c70 and that arm calling for clip 38 (0x470cf5), the
      // same clip a pig thrown out of a wall gets.
      state.airborne = { vx, vy, vz, bouncing: true, pushIn: null, ejected }
      state.getUp = 0
      flying.set(pig.id, state)
      // Nothing is announced HERE: the clip the pig will wear is the one the first
      // frame of the flight picks, and `update` announces it the moment it
      // changes. Saying anything now would only be the standing clip again.
    },
    update(delta) {
      for (const [id, state] of [...flying]) {
        const pig = world.pigs().find((one) => one.id === id)
        if (!pig) {
          flying.delete(id)
          continue
        }
        const was = state.clip
        // Nothing is DRIVEN here: no walk, no turn, no jump. The exe skips the
        // whole movement update for a pig in the air and so does this.
        updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, delta, around(id, state))
        pig.position = { x: state.x, y: state.y, z: state.z }
        // A dead pig still flies — it is a body, and the exe throws corpses about
        // as happily as anything else — but it must not be told to stand up out of
        // its own dying clip.
        if (state.clip !== was && !isDead(pig)) {
          emit({ kind: 'clip', pig: pig.id, index: state.clip, once: state.commit })
        }
        // Down for good. Whatever it was wearing goes back to standing, once —
        // the get-up clip is what the landing asked for and it plays out on its
        // own (lib/game/anim.ts).
        if (state.airborne === null) flying.delete(id)
      }
    },
    live: () => flying.size,
    has: (pig) => flying.has(pig.id),
    at: () =>
      [...flying].map(([pig, state]) => ({
        pig,
        y: state.y,
        vx: state.airborne?.vx ?? 0,
        vy: state.airborne?.vy ?? 0,
        vz: state.airborne?.vz ?? 0
      })),
    clear() {
      flying.clear()
    }
  }
}
