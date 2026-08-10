// Water HURTS, and the longer a pig is in it the faster.
//
// The tail of the pig's own ground update, read at 0x46fff3-0x470133:
//
// ```
// 46fff3  IsInWater(x, z) != 1        -> [pig+0x384] = 0, done   (0x47013b)
// 470000  [pig+0x384]++                                          ; FRAMES in water
// 470012  state in {3,4,5,6,7}        -> done                     ; riding, in the air, dead
// 47004a  more than 5 frames, no status timer, and either not the acting pig
//         or the mode IS 13          -> 0x472DD0, make for the shore
// 470087  eax = [pig+0x19C]           ; the CLASS
// 47008d  eax == 4, or 14..16, AND [0x5206F0] <= 1:
// 4700bc      health > 0x7f          -> done                     ; NOTHING happens
// 4700c6      otherwise              -> TakeDamage(1, 1)
// 4700e5  everyone else: TakeDamage(min([pig+0x384], 0x40), 1)
// 470101  …and AGAIN, same amount, if this is the ACTING pig and the mode is
//         not 13                                                 (0x47011c)
// ```
//
// Three things fall out of that and all three are here:
//
// * the bite RAMPS. It is the frame counter itself, in the 128ths the exe's
//   health counts, so it climbs from a hundred-and-twenty-eighth of a point to
//   half a point a frame over 64 frames and stays there;
// * **the pig whose turn it is takes it TWICE** — unless the mode is 13, WALK
//   AWAY, which is the phase at the end of a turn where nobody is driving;
// * one class GROUP does not drown at all. Not built, and it cannot be from
//   here: the damage is kind 1, and `Pig::TakeDamage` shows its floating number
//   only above 0x7f (0x467b4b), which a cap of 0x40 never reaches. Water is
//   silent and invisible; the health bar is the only thing that says it.
//
// Pure, like the rest of lib/game: pigs and a terrain query in, damage out.

import { FRAME_SECONDS } from './ballistics'
import { hurt, isDead } from './health'
import type { Emit } from './events'
import type { Pig } from './game'
import type { TerrainQuery } from './terrain'

/**
 * The ramp's ceiling, in the 128ths of a point the exe's health counts:
 * `cmp eax,40h` at 0x4700eb, so half a point a frame at the top.
 */
export const SOAK_CAP = 64

/** A point, in those 128ths (lib/game/health.ts counts POINTS). */
const HEALTH_UNIT = 1 / 128

/** How long the ramp takes to reach the cap — 64 of the exe's frames. */
export const SOAK_FULL = SOAK_CAP * FRAME_SECONDS

/**
 * The classes water does not touch: **4, and 14 through 16**.
 *
 * They are exactly the group the class table collapses into one record for a
 * multiplayer game (0x467284: 1-3 → 18, 5-7 → 19, 8-10 → 20, 11-13 → 21, and
 * `eax == 4 || eax >= 0x0E` → 22), and by the spawn markers those are CO_ME,
 * LE_ME and AC_ME — the commando and the top of the tree (three/soldiers.ts).
 */
export const SWIMMERS = new Set([4, 14, 15, 16])

/**
 * How many PLAYERS the battle is for — the exe's `[0x5206F0]`, which the pig
 * constructor reads the same way (0x4669de).
 *
 * The exemption above is gated on it being 1: a campaign game, which is what
 * this remake plays. Field an arena and NOBODY is exempt, which is the exe's own
 * rule and not a simplification. Deliberately not `SIDES_FIELDED`
 * (lib/game/muster.ts): that counts the sides standing on the map, and a
 * campaign map has two of them for one player.
 */
export const PLAYERS = 1

/** Whether water hurts this class at all. */
export const drowns = (pigClass: number, players: number = PLAYERS): boolean =>
  players > 1 || !SWIMMERS.has(pigClass)

/** What one step of water costs `pig`, in points. */
export function soakDamage(seconds: number, doubled: boolean, delta: number): number {
  // The counter is incremented BEFORE the bite, so the first frame in the water
  // already costs one 128th. Held as time and turned back into frames, because
  // this engine steps four times an exe frame (lib/game/engine.ts).
  const frames = Math.min(SOAK_CAP, Math.ceil(seconds / FRAME_SECONDS))
  const perFrame = frames * HEALTH_UNIT
  return (perFrame / FRAME_SECONDS) * delta * (doubled ? 2 : 1)
}

export interface Drowning {
  /**
   * One step of it, over every pig on the map.
   *
   * `acting` is the pig whose turn it is — it pays double — and `walkAway` is
   * the ONE thing that takes the doubling off: the exe's mode 13, the beat at
   * the end of a turn where nobody is driving. Every other mode, the beat at
   * the top of a turn and the one after a blow included, pays it.
   * `aloft` is whether the acting pig is in the air, which the exe skips
   * outright (states 3, 4 and 5).
   */
  update(delta: number, where: { acting: Pig | null; walkAway: boolean; aloft: boolean }): void
  /** How long this pig has been in the water — the exe's `[pig+0x384]`, as
   * time. What the shore swim waits on. */
  soaked(pig: Pig): number
  /** Drop every counter — a new battle. */
  clear(): void
}

export function createDrowning(
  world: { pigs: () => Pig[]; query: TerrainQuery; training: boolean },
  emit: Emit
): Drowning {
  /** Seconds in the water, per pig id. Gone the moment one is out of it. */
  const wet = new Map<number, number>()

  return {
    update(delta, { acting, walkAway, aloft }) {
      for (const pig of world.pigs()) {
        const dry =
          isDead(pig) ||
          (pig === acting && aloft) ||
          !world.query.isWater(pig.position.x, pig.position.z)
        if (dry) {
          wet.delete(pig.id)
          continue
        }
        const seconds = (wet.get(pig.id) ?? 0) + delta
        wet.set(pig.id, seconds)
        if (!drowns(pig.pigClass)) continue
        const damage = soakDamage(seconds, pig === acting && !walkAway, delta)
        const outcome = hurt(pig, damage, world.training)
        if (outcome === 'died' || outcome === 'gibbed') emit({ kind: 'killed', pig: pig.id })
      }
    },
    soaked: (pig) => wet.get(pig.id) ?? 0,
    clear: () => wet.clear()
  }
}
