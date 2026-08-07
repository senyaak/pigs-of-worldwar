// After the blow: the game stops and shows you what you did.
//
// Knocking something down does not hand the turn straight back. The exe puts
// the game into a WAIT (0x495288, and a second copy of the same at 0x495340)
// and will not move on until every one of these agrees:
//
// ```
// 495288  [0x537FC0] is clear
// 49529b  0x436DD0()            ; no projectile is still live
// 4952d3  0x415420(15)          ; ...and has been so for FIFTEEN frames
// 4952dd  0x4661A0()            ; nothing was placed on the map this frame
// 4952fb  0x43BB10() != 3       ; the sergeant has finished talking (training)
// 49530b  0x47D800()            ; no pig is still busy
// 495316  0x494570(game)        ; -> on with it
// ```
//
// `0x415420(n)` is a plain frame counter at `[0x4de9d4]`: every call bumps it
// and it reports true at `n`, but it is reset to zero the moment anything else
// on that list objects — so the fifteen frames are fifteen QUIET ones, a beat
// after the world has settled rather than a beat after the blow.
//
// And the camera goes to look. `0x4661a0` walks the pickup list for anything
// flagged "just placed" (`[obj+0x8F]`, set by both placement arms), gives the
// first one to the camera as its subject and asks for **mode 0** — the
// ordinary chase distance, on a crate instead of a pig (0x4661c2). So the
// parachute coming down IS the wait, which is what play remembers.
//
// Pure, in seconds. What counts as busy is the scene's to say.

import { FRAME_SECONDS } from './ballistics'

/** `0x415420(15)` — the quiet the game wants before it hands the turn back. */
export const SETTLE_FRAMES = 15
export const SETTLE = SETTLE_FRAMES * FRAME_SECONDS

/**
 * …and a CEILING on the whole thing, which is play's and not the exe's.
 *
 * "надо думаю ждать 2-3 секунды пока завершится всё" — and it is the crate
 * that overruns: the break effect runs about a second, the canopy takes two
 * and a half more from 0xC00 up, and a second of quiet on top makes four and
 * a half. So the hold lets go after three seconds whatever is still going on;
 *
 * The ceiling is on the WHOLE hold, and the blow's own animation is inside
 * it — a bayonet strikes on frame 11 of 36 and has most of a second left to
 * run, which the crate then starts down after. So the crate gets roughly the
 * last two seconds and the camera comes off it just before it lands. That is
 * the trade play asked for: finishing one animation before starting the next
 * matters more than watching the second one land.
 * a crate that has not landed keeps coming down behind the ordinary camera,
 * which it can, because nothing about a descent needs to be watched.
 */
export const AFTERMATH_MAX = 3

export interface Aftermath {
  /** What the camera is on: where the thing fell, or the crate coming down to
   * replace it. Game space, Y-down. */
  at: { x: number; y: number; z: number }
  /** Seconds of quiet still owed. */
  quiet: number
  /** Seconds this hold has run in total, against `AFTERMATH_MAX`. */
  spent: number
}

export const beginAftermath = (at: { x: number; y: number; z: number }): Aftermath => ({
  at: { x: at.x, y: at.y, z: at.z },
  quiet: SETTLE,
  spent: 0
})

/** Look somewhere else — a crate takes the camera off the thing it replaces. */
export function watchAftermath(
  aftermath: Aftermath,
  at: { x: number; y: number; z: number }
): void {
  aftermath.at.x = at.x
  aftermath.at.y = at.y
  aftermath.at.z = at.z
}

/**
 * One frame. `busy` is anything the exe's own list would object to, and play
 * named the set: a projectile still in the air, damage still landing, a pig
 * still swimming for the shore, a body still coming apart. Whatever the
 * scene can answer for goes in there. True when the wait is over — either
 * because everything settled and the quiet ran out, or because
 * `AFTERMATH_MAX` did.
 */
export function advanceAftermath(aftermath: Aftermath, delta: number, busy: boolean): boolean {
  aftermath.spent += delta
  if (aftermath.spent >= AFTERMATH_MAX) return true
  if (busy) {
    aftermath.quiet = SETTLE
    return false
  }
  aftermath.quiet -= delta
  return aftermath.quiet <= 0
}
