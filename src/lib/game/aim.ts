// Pointing a weapon up and down.
//
// One signed number does all of it. `[pig+0x304]` is a s16 in the engine's
// 4096-to-the-turn units, so 1024 is 90°, and `Pig::ChangeAimAngle`
// (exe 0x46a7f0) is the only thing that moves it: clamp, then a handful of
// per-weapon rules, then the aiming pose is scrubbed to match.
// `weapons/notes.md` has the read.
//
// Everything here is in the game's own units. The renderer asks for radians
// and for a clip phase; nothing outside this file does that arithmetic.

import { FRAME_SECONDS } from './ballistics'
import { weaponOf } from './weapons'

/** A full turn, in the engine's angle units — the same 4096 everything else
 * in the exe measures angles and fixed-point fractions in. */
export const AIM_UNITS = 4096

/** How far either way the angle may go: 0x3ff up, 0xfc01 down (0x46a82f). */
export const AIM_LIMIT = 1023

/**
 * How fast it moves. The aim keys ramp an accumulator by 2 a frame to a cap
 * of 0x20 (0x492bb8 sets the step, 0x492bf5 the cap), so a tap is worth 2 of
 * 4096 and a hold accelerates over sixteen frames to 2.8° a frame. That is
 * the same top speed a pig turns at, reached half as quickly — see
 * `TURN_SPEED` in lib/game/locomotion.ts, which is the same shape.
 */
export const AIM_RAMP = 2
export const AIM_TOP = 32

/**
 * DOWN THE SIGHTS both axes are slower, and they are the same as each other.
 *
 * The aim view is not driven by the ordinary pad handler at all. Holding it
 * puts the game in camera mode 0x0E and hands input to `0x495690`, which
 * dispatches per mode through the byte map at 0x496514 — and mode 0x0E's arm
 * is **0x495b29**, with numbers of its own:
 *
 * ```
 * 495b32  ebp = 0x10                              ; the cap, not 0x20
 * 495b5a  [game+0x300]++  (the TURN accumulator)  ; by ONE, not two
 * 495b6d  ...clamped to ebp
 * 495db8  [game+0x304]++  (the AIM accumulator)   ; the same again
 * ```
 *
 * So in the sights both axes ramp by **1 a frame to a cap of 16** — half the
 * speed and half the acceleration of aiming while walking about, and
 * identical to each other, which is what play asked for and the original
 * already did. An earlier note here had the match down as the remake's own
 * choice at the ordinary handler's 2 and 0x20; it is neither.
 *
 * Both also go through the sniper's zoom scaling in that arm (0x495b9a and
 * 0x495c50, `lib/game/zoom.ts`).
 *
 * Returns how many angle units this frame is worth, and advances the ramp.
 */
export const SIGHT_RAMP = 1
export const SIGHT_TOP = 0x10

export function rampedStep(
  ramp: { rate: number },
  direction: number,
  deltaSeconds: number,
  step = SIGHT_RAMP,
  top = SIGHT_TOP
): number {
  if (direction === 0) {
    ramp.rate = 0
    return 0
  }
  const frames = deltaSeconds / FRAME_SECONDS
  ramp.rate = Math.min(top, (ramp.rate === 0 ? step : ramp.rate) + step * frames)
  return direction * ramp.rate * frames
}

/**
 * Where a weapon comes up pointing (`Pig::ReadyWeapon`, 0x46912c).
 *
 * Guns come up LEVEL and everything else at 45°, already lobbing — which is
 * why a grenade is useful the moment it is out and a rifle is not pointing
 * at the sky.
 *
 * A grenade-specific ~70° was put in beside this for one commit, on a
 * remembered figure, and taken straight back out: the 0x200 the exe writes is
 * what a grenade comes up at, and 45° is what play sees once it is actually
 * looked at. **What the engine gives gets checked in play BEFORE anything is
 * substituted for it** — a remembered number is a reason to go and verify the
 * decoded one, not a reason to replace it.
 */
export const AIM_LOB = 512

const LEVEL_START = [
  6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 45, 46,
  // 3 BAYONET and 5 CATTLE PROD get there the long way in the exe:
  // `ReadyWeapon` writes 0x200 like everything that is not a gun, and then
  // `ChangeAimAngle(0)` pins them to zero (0x46a891). Level is where they
  // belong and the animation proves it — the last frame of their
  // getting-it-out clip IS frame 32 of their aiming clip, the level one, so
  // a pig that draws and then jumps to 45° visibly snaps.
  3, 5
]

/** Weapons that cannot be pointed below 45° (0x46a86d): the guided missile,
 * the mortar and the jetpack. */
const FLOOR_LOB = [16, 28, 50]

/** Weapons with no aiming pose to scrub (0x46a8e8) — everything thrown. */
const NO_POSE = [19, 20, 21, 22, 23, 24, 25, 26, 27, 33, 50]

/**
 * What a weapon starts at, in game units.
 */
export function readyAim(skill: number | null): number {
  if (skill === null) return 0
  return LEVEL_START.includes(skill) ? 0 : AIM_LOB
}

/**
 * The angle a weapon is allowed to hold.
 *
 * The exe has one more rule than this, and the remake leaves it out on
 * purpose: 0x46a891 pins 3 BAYONET and 5 CATTLE PROD to zero outright, so
 * those two cannot be aimed at all in the original. The bayonet is the first
 * weapon the training ground hands out and tilting it is the whole of what a
 * player does with it here, so it aims like everything else until the fire
 * half of the mode is built and there is something else to do with it.
 */
export function clampAim(skill: number | null, angle: number): number {
  const limited = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, angle))
  if (skill !== null && FLOOR_LOB.includes(skill)) return Math.max(AIM_LOB, limited)
  if (skill === 50) return Math.max(0, limited)
  return limited
}

/** Whether the weapon has an aiming pose the angle scrubs. */
export function scrubsPose(skill: number | null): boolean {
  if (skill === null) return false
  return weaponOf(skill).aimClip !== 0 && !NO_POSE.includes(skill)
}

/**
 * Where in its aiming clip a weapon held at this angle sits, as a fraction of
 * the clip: `(0x400 - angle) * 2` out of 0x1000 (0x46a903). Full up is the
 * first frame, level the middle, full down the last.
 */
export const aimPhase = (angle: number): number => (1024 - angle) / 2048

/** The angle in radians, positive up — what the scene points things by. */
export const aimRadians = (angle: number): number => (angle / AIM_UNITS) * 2 * Math.PI

export interface AimState {
  /** Game units, signed, positive up. */
  angle: number
  /** The held-key accumulator, in units per frame; 0 when nothing is held. */
  rate: number
}

export const createAim = (skill: number | null): AimState => ({
  angle: clampAim(skill, readyAim(skill)),
  rate: 0
})

/**
 * One frame of aiming. `direction` is -1 (down), 0 (nothing held) or +1 (up),
 * exactly as the two aim keys give it.
 */
export function updateAim(
  aim: AimState,
  skill: number | null,
  direction: number,
  deltaSeconds: number,
  /** What the sniper's magnification does to the step — the scope makes the
   * aim finer the closer it is zoomed (lib/game/zoom.ts). Identity for
   * everything else. */
  scale: (step: number) => number = (raw) => raw,
  /** The ramp to use: the ordinary handler's by default, the aim view's own
   * `SIGHT_RAMP`/`SIGHT_TOP` when the sights are up. */
  step = AIM_RAMP,
  top = AIM_TOP
): void {
  // Letting go drops the accumulator, so the next press starts slow again; a
  // fresh press is worth the step itself, not nothing, because the exe writes
  // the step into the accumulator on the frame the key goes down. Both live
  // in `rampedStep`, which the scope's sideways turn borrows.
  aim.angle = clampAim(
    skill,
    aim.angle + scale(rampedStep(aim, direction, deltaSeconds, step, top))
  )
}
