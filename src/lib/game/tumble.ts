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
import { PIG_RADIUS, withPigs } from './obstacles'
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

/** A throw, as the velocity it starts with — game space, up is −Y. Built by
 * the THROWER: the melee's is `flingVelocity` (the exe's own 45°), a blast's
 * is `hurlVelocity` (the line from the burst to the body's centre). */
export interface Velocity {
  vx: number
  vy: number
  vz: number
}

export interface Tumbles {
  /**
   * Throw this pig with `velocity` — whoever throws says HOW, this only owns
   * the flight. Throwing one that is already in the air REPLACES what it had:
   * a second blast catching a pig mid-flight is the last word on where it goes.
   *
   * `ejected` wears the FLYING clip for the whole arc (a melee hit, a wall's
   * throw-out); `struck` is a BULLET's knockdown — the exe plays clip 39
   * "Bouncing on B-Hind" AT the impact (0x478AC4), so the flight starts
   * already `touched` and wears the bounce from its first frame.
   */
  fling(pig: Pig, velocity: Velocity, ejected?: boolean, struck?: boolean): void
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
export const flingVelocity = (speed: number, bearing: number): Velocity => ({
  // Heading 0 faces +Z and x is its sine, which is the convention the walk and
  // the jump's own push already use (lib/game/locomotion.ts).
  vx: Math.cos(PITCH) * speed * Math.sin(bearing),
  vy: -Math.sin(PITCH) * speed,
  vz: Math.cos(PITCH) * speed * Math.cos(bearing)
})

/**
 * The velocity of a throw off a BLAST, from where the burst stood against
 * the body: `along` is the line from the burst point to the body's own
 * centre of gravity.
 *
 * The THROW is `[play]`'s outright, and the read behind that has now been
 * verified THREE ways (2026-08-26, after play challenged it — "кидает -
 * как он может не кидать?"): the switch table at 0x478564 bounds the
 * effect arm to 0x4778ae..0x477daa, that whole arm contains not one call
 * of either velocity primitive, and an every-caller scan of 0x4A9100 (20
 * sites) and 0x4A9260 (7) puts none of them inside it. **Neither the PC
 * exe nor the PSX build throws a pig from a weapon BLAST** — a grenade,
 * TNT or mine burst deals damage and fatigue and nothing else. (A first
 * pass at that scan mis-attributed two arms: the steep 96-at-79° throw at
 * 0x477fd8 belongs to the PROJECTILE arm and is the FIRE RAIN droplets',
 * kind 0x15 — not fielded here yet — and the prologue's throws are
 * pig-versus-pig contacts. `weapons/fire.md` carries the whole map.) The
 * pigs play remembers flying were projectile hits, fire rain, building
 * explosions and melee.
 *
 * The SHAPE is three cases, and the boundary between them is the body's
 * own FOOTPRINT (`PIG_RADIUS`):
 *
 * - **Under the body** (the burst inside the trotters' own circle, below
 *   the centre): straight UP — play's "поставить динамит под свина — он
 *   улетит вверх".
 * - **Over the body** (inside the circle, above): straight DOWN — the
 *   knockdown on the spot, "граната прям над свиньёй — падает на жопу".
 * - **Anywhere else: the engine's own 45° knock, at FULL speed along the
 *   flat bearing away from the burst.** Every knock either original ever
 *   throws is pitch 0x200 = 45° — the melee, the shove, the building
 *   blast (PC 0x44050c, PSX 0x800FAC84) — and nothing in either engine
 *   throws steeper. The 45° toss with its bounces and its roll is the
 *   "сдвинута — ещё и по земле откатывает" of play's spec.
 *
 * The first cut of this function interpolated instead — the centre line
 * won whenever it was STEEPER than 45° — and that window is a hundred
 * units wide off a centre 100 over the soles: half a pig. A grenade
 * landing at the trotters, visibly OFFSET, threw at 60..75° with almost
 * no horizontal, went up, came back down beside its crater and read as
 * broken — play, on a hillside: "должно было вверх по горе подвинуть, а
 * он на месте катился". The footprint is the boundary the spec actually
 * drew: под свином is under the PIG, not under a geometric ray.
 */
export const hurlVelocity = (
  speed: number,
  along: { x: number; y: number; z: number },
  /**
   * The unit normal of the ground under the body, game space
   * (`TerrainQuery.normal` — up is NEGATIVE y). Read only when the burst is
   * inside the footprint, and only then because that is the case where the
   * line itself says nothing about which way to go.
   */
  ground?: { x: number; y: number; z: number }
): Velocity => {
  const span = Math.hypot(along.x, along.y, along.z)
  if (span < 1) return { vx: 0, vy: -speed, vz: 0 }
  const flat = Math.hypot(along.x, along.z)
  if (flat < PIG_RADIUS) {
    // Y-DOWN: `along` runs burst → centre, so a burst BELOW the centre has
    // along.y < 0 — up it goes; above, down onto its behind.
    //
    // **AND ON A SLOPE, "UP" IS THE HILL'S UP.** Play, 2026-08-25: "от
    // динамита застрял свин на склоне, а не улетел." The log has the launch:
    // `v 0,-3000,0 flat 0`, and the landing 185 units later — a charge laid
    // under the trotters threw the pig straight into the sky and the same
    // hillside caught it on the way down, which reads as stuck. A body
    // resting on a slope is held by that slope, so what a charge under it
    // does is throw it along the GROUND'S OWN NORMAL: flat ground still
    // gives (0,-1,0) and the straight-up case is untouched, a thirty-degree
    // face throws it thirty degrees down the hill, and the steeper the
    // ground the further it goes.
    if (ground && along.y < 0) {
      return { vx: ground.x * speed, vy: ground.y * speed, vz: ground.z * speed }
    }
    return { vx: 0, vy: along.y < 0 ? -speed : speed, vz: 0 }
  }
  const run = (Math.cos(PITCH) * speed) / flat
  return { vx: along.x * run, vy: -Math.sin(PITCH) * speed, vz: along.z * run }
}

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
    fling(pig, velocity, ejected = false, struck = false) {
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
      const { vx, vy, vz } = velocity
      // `bouncing` is what makes it read as being thrown rather than jumping:
      // the clip is the BOUNCE and the landing bounces on before it settles
      // (lib/game/locomotion.ts). `ejected` swaps that clip for the FLYING
      // one — which is what a MELEE hit wears, the exe putting a struck pig
      // through 0x470c70 and that arm calling for clip 38 (0x470cf5), the
      // same clip a pig thrown out of a wall gets.
      state.airborne = { vx, vy, vz, bouncing: true, pushIn: null, ejected, touched: struck }
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
        // Down for good — but NOT gone until it is back on its feet. The
        // landing hands out `getUp` (lib/game/locomotion.ts `fly`), and the
        // only thing that burns it and HOLDS the get-up clip is `ground()`,
        // which nothing else runs for a pig that is not acting. Deleting on
        // the landing frame was the invisible knockdown play reported ("свин
        // даже не шелохнулся"): the very next battle frame found
        // `tumbles.has(pig)` false and stamped IDLE over a get-up that had
        // lived one step. So the record stays — and both dressing loops keep
        // skipping the pig — until the get-up has run down. A DEAD body keeps
        // none: its dying clip is not a stand-up (the `isDead` guard above),
        // and the corpse flow waits on `tumbling` (lib/game/corpses.ts).
        if (state.airborne === null && (state.getUp <= 0 || isDead(pig))) flying.delete(id)
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
