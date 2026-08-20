// One step of ground movement, following the original's `Pig::TryMove`
// (warhogs_.exe VA 0x478ca0). Pure: it takes a terrain query and a position,
// and says where the pig ends up and in what state.
//
// A pig walks in a STRAIGHT LINE. The exe's collision dispatch decides that:
// hitting the landscape is a success — the pig is simply pinned to the ground
// height, however steep — and only hitting an OBJECT sends it down the
// step-up-then-sidestep path. Terrain height never refuses a step. What stops
// a pig is a wall tile (and the original blocks part of a tile, not all of
// it) or the edge of the world; what makes it leave the ground is nothing
// under its feet.
//
//   1. clamp the candidate to the world limits — nothing left, refuse
//   2. a CLIFF FACE ahead — ground falling away steeper than WALK_OFF_GRADE
//      within one FACE_PROBE — walk off and fall
//   3. otherwise walk, and take the ground height with you
//
// NOTHING about the ground refuses a step — not its height and not the wall
// flag. The exe pins a pig to the landscape however steep, and the wall flag
// does not block at all: the landscape collider swaps in an almost
// frictionless, almost perfectly elastic material and lets the physics deal
// with it. Refusing at a wall was this remake's invention, and it walled
// pigs IN on top of cliffs — the lip of a cliff is a wall tile too.
//
// Step-up and sidestep are deliberately absent: they belong to the object
// collision path, and there are no objects in the scene yet. Their rules are
// recorded in movement/notes.md for when there are.

import { FRAME_SECONDS, fromExeSpeed } from './ballistics'
import { clampToWorld, fromExeY } from './terrain'
import type { TerrainQuery } from './terrain'

/**
 * A class's speed scale, sixteenths of the request (exe pig +0x3bc).
 *
 * It comes from the class table at 0x4d02e0 — 128 bytes a record,
 * `{ hp, speed, (weapon, ammo) pairs terminated by 0/-1 }` — indexed by the
 * pig's class at +0x19c and copied in by the constructor at 0x466ae8. A
 * GRUNT is record 0 and carries 13; the promoted classes carry 13, 14 or 15
 * (the heavies and the hero ranks are the 15s). The remake spawns grunts.
 */
export const PIG_CLASS_SPEED = 13

/**
 * What one press of forward ASKS for, in exe units a logic frame.
 *
 * Everything that drives a pig asks for the same fixed 64: the player's
 * input handler (0x492bcc forward, 0x492bdf back), and every AI state that
 * walks (0x46d478, 0x46dda6, 0x46e106). There is no analogue stick and no
 * accelerating gait — the number below is the whole of the walking speed.
 */
export const WALK_REQUEST = 64

/**
 * How much quicker than that a pig actually walks here — the remake's own, and
 * the ONLY thing in the chain that is.
 *
 * Play asked for a slightly faster walk, and the obvious lever was the wrong
 * one: `FRAME_SECONDS` is the rate of everything counted in frames, so turning
 * it up took the turn, the jump's hang, the swing's wind-up, the aim's ramp and
 * the parachute with it — "и вообще сама игра будто быстрее стала — это не что
 * надо было". Both ends of that were tried in play (1/20 and 1/25) and both
 * came back wrong for the same reason. A walk-only factor is what was actually
 * asked for.
 *
 * The value is by eye and nothing else: 52 units a frame at 1/15 is 780 a
 * second, and 4/3 makes it 1040 — two tiles. Play walked the two candidates and
 * settled here: 5/3 (1300, the same walk the 1/25 experiment had, tried once the
 * rest of the game was no longer coming along for the ride) went back down to
 * this one. **Both ends of it have now been seen in play, so do not re-propose
 * either** — 1/15 with a walk-only 4/3 is the answer, arrived at four ways.
 *
 * The exe's own 52 is untouched underneath, and so is every relation that hangs
 * off the stride: the running jump leaves faster because `Pig::Walk`'s own
 * `|nDist|/2` says it does — apex 271 against a pig 320 tall, where 5/3 put it
 * at a full 326 — and `LOOK_AHEAD` grows with the step because the original
 * checks one step ahead.
 */
export const WALK_SCALE = 4 / 3

/**
 * How fast a pig walks, world units per second — the exe's, not a taste.
 *
 * `Pig::Walk` (0x46aa10) turns the request into the per-frame distance that
 * `UpdateMovement` then hands to `TryMove` out of +0x33c:
 *
 *   nDist = request * class_speed / 16      ; 0x46ad0d
 *   health > 3200 -> as is; > 1280 -> two thirds; below -> a third
 *
 * so a healthy grunt covers `64 * 13 / 16` = 52 units a frame. Health is
 * absolute, not a fraction: a grunt starts at 6400 (the table's hp times the
 * difficulty byte at 0x4d1008 = 2, halved), so the bands bite at half and at
 * a fifth of its life. Nothing damages a pig here yet, so full speed it is —
 * this is where the wounded limp goes when there is damage to feel it with.
 */
export const WALK_SPEED = fromExeSpeed((WALK_REQUEST * PIG_CLASS_SPEED) / 16) * WALK_SCALE


/**
 * Backwards is exactly half, and it is not the class that halves it:
 * `Pig::Walk` clamps its argument to -32 (0x46aa1a, again at 0x46aa7e)
 * BEFORE the class scale sees it, so the -64 the player asks for arrives as
 * -32 and a grunt backs up at 26 units a frame.
 */
export const WALK_BACK_SPEED = fromExeSpeed((32 * PIG_CLASS_SPEED) / 16) * WALK_SCALE

/** Drop the feet this far looking for ground before declaring a fall
 * (exe 0x4bd340, in its own vertical scale — see `fromExeY`). */
export const STEP_DOWN = fromExeY(32)

/**
 * What tells a CLIFF from a HILLSIDE: a fall wants the ground to fall away
 * steeper than WALK_OFF_GRADE within one probe THIS long. Anything
 * shallower is a grade and is WALKED down, pinned to the ground the whole
 * way, the mirror of the climb (which has no limit at all).
 *
 * `[play]` — both numbers are the remake's own, and the grade is PLAY'S
 * DIAL. The exe starts a fall when the step's endpoint finds no ground
 * within 32 below the feet (`TryMove` step 6, movement/notes.md); naively
 * converted to this engine's halved heights that is a slope test at 17.1°,
 * and the first build compared terrain a whole LOOK_AHEAD out instead of a
 * stride, which pushed it to 13.0° — under CAMP's own median slope of 14°,
 * so most descents were a stutter of launches ("спускаюсь с горки —
 * стукаюсь: падаю - иду - падаю - иду"). And there is no natural line to
 * move it to: a census of every shipped map's tile faces
 * (movement/slope-census.mjs, 2026-08-20) runs CONTINUOUSLY from flat to
 * ~88° — 12% of non-wall tiles are past 45°, and play confirms surfaces
 * past 45° are walked both ways. 60° is where cliff walls plausibly begin
 * in that census; a real walked surface found past it in play moves the
 * number, nothing else.
 */
export const FACE_PROBE = STEP_DOWN

/** The grade a fall wants the ground to exceed within one FACE_PROBE — 60°.
 * See FACE_PROBE for why it is a dial and not a fact. */
export const WALK_OFF_GRADE = Math.tan((60 * Math.PI) / 180)

/**
 * How far ahead the ground is checked for an edge: one of the original's
 * walking steps. Its `TryMove` runs once a logic frame and moves `nDist`, so
 * the check and the step were the same distance; ours must not shrink with
 * the frame rate.
 */
export const LOOK_AHEAD = WALK_SPEED * FRAME_SECONDS
/** A fall keeps this much of the walking speed horizontally
 * (exe `|nDist| * 3 / 2`). */
export const FALL_SPEED_FACTOR = 1.5

export type MoveOutcome =
  /** The world limits ate the whole step — the only refusal there is. */
  | 'limit'
  /** Walked off an edge; the caller hands over to ballistics. */
  | 'falling'
  /** Moved. */
  | 'moved'

export interface MoveResult {
  outcome: MoveOutcome
  x: number
  z: number
}

/**
 * Try to walk `distance` world units from (x, z) along `heading`.
 * `distance` is negative walking backwards, as in the original.
 */
export function step(
  query: TerrainQuery,
  x: number,
  z: number,
  heading: number,
  distance: number,
  /**
   * Whether something OTHER than the landscape holds a pig up at (x, z) — a
   * bridge deck or a ramp (lib/game/obstacles.ts). The look-ahead below is the
   * landscape's, and a walkway is not on it: over a ditch the ground falls away
   * ahead of every step, and a pig walking a bridge would launch itself off a
   * drop it is standing over. Worse at the near END of one — CAMP's first
   * bridge sits two units above the bank it starts from, so a pig stepping off
   * the lip left the ground two units UNDER the deck, and a body in flight only
   * lands on what is BELOW it: it sailed over the abutment and into the ditch.
   */
  supported: (x: number, z: number) => boolean = () => false
): MoveResult {
  const wantX = x + Math.sin(heading) * distance
  const wantZ = z + Math.cos(heading) * distance
  const { x: toX, z: toZ } = clampToWorld(wantX, wantZ)
  if (toX !== wantX || toZ !== wantZ) return { outcome: 'limit', x, z }

  // The edge is looked for a FIXED distance ahead, not at wherever this
  // frame's step happened to land. The original tests the ground one
  // `nDist` on — one whole walking step at its own frame rate — so a pig
  // running at a drop launches off it. Testing our own step instead makes
  // the look-ahead a function of the frame rate: at 60 Hz it is half as far,
  // no single step ever clears STEP_DOWN, and the pig creeps over the lip
  // and walks down the face while gravity does the work. It should leave the
  // ground.
  //
  // …and what is looked FOR is a CLIFF FACE, not a hillside. One comparison
  // across the whole reach is a slope test — it fired on every hillside
  // steeper than 13° and turned a descent into a stutter of launches
  // (FACE_PROBE has the derivation). So the reach is walked in probes
  // instead: a fall is the ground falling away steeper than WALK_OFF_GRADE
  // within ONE probe, which walked ground never does and a cliff wall always
  // does — still a whole walking step out, so a running pig still leaves
  // from the lip.
  const reach = Math.max(Math.abs(distance), LOOK_AHEAD)
  const dirX = Math.sin(heading) * Math.sign(distance)
  const dirZ = Math.cos(heading) * Math.sign(distance)
  if (!query.isWater(toX, toZ)) {
    // Game-space heights grow DOWNWARD, so a bigger height is lower ground.
    let last = query.height(x, z)
    let lastAlong = 0
    for (let at = FACE_PROBE; ; at += FACE_PROBE) {
      const along = Math.min(at, reach)
      const sx = x + dirX * along
      const sz = z + dirZ * along
      const there = query.height(sx, sz)
      if (there - last > (along - lastAlong) * WALK_OFF_GRADE && !supported(sx, sz)) {
        return { outcome: 'falling', x: toX, z: toZ }
      }
      last = there
      lastAlong = along
      if (along >= reach) break
    }
  }
  // No wall refusal, because the original has none. `0x415590` turns the
  // landscape into friction 0.01 / restitution 0.99 wherever
  // `Map::IsBlocked` says yes, and that is the whole of it: the pig walks
  // in, an almost perfectly elastic floor throws it about, and the wedge
  // counter ejects it. Refusing the step was this remake's own idea.
  return { outcome: 'moved', x: toX, z: toZ }
}
