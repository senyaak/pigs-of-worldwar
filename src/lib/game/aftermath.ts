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

/**
 * `0x415420(15)` — the quiet the game wants before it hands the turn back,
 * and it is half a second rather than the one this file used to compute.
 *
 * The frame count is the exe's. The SECONDS are not: `FRAME_SECONDS` here is
 * 1/15, deliberately stretched from the engine's own rate so that the walking
 * speeds read right against half-scale models (CLAUDE.md), so every timer
 * taken off the exe in frames comes out twice as long as the original ran it.
 * Fifteen frames at the rate that walk was measured against is 0.5 s — which
 * is exactly the tail play asked for: "и только потом через 0.5 с где-то
 * вернуться к геймплею". Two readings agreeing, so it is written in seconds.
 */
export const SETTLE = 0.5

export interface Aftermath {
  /** What the camera is on: where the thing fell, or the crate coming down to
   * replace it. Game space, Y-down. */
  at: { x: number; y: number; z: number }
  /** Seconds of quiet still owed. */
  quiet: number
}

export const beginAftermath = (at: { x: number; y: number; z: number }): Aftermath => ({
  at: { x: at.x, y: at.y, z: at.z },
  quiet: SETTLE
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
 * still swimming for the shore, a body still coming apart, the blow's own
 * animation, and the crate all the way down to the ground and through
 * whatever it lands with. Whatever the scene can answer for goes in there.
 * True when the wait is over.
 *
 * There is NO ceiling on this. One was tried — three seconds flat, because a
 * crate that started down through the smoke of the thing it replaced dragged
 * the hold out to four and a half — but that was the interruption's fault
 * rather than the crate's, and with the blow finishing first play wants the
 * descent watched to the end: "нужно ждать пока сундук упадёт на землю… и
 * только потом через 0.5 с где-то вернуться".
 */
export function advanceAftermath(aftermath: Aftermath, delta: number, busy: boolean): boolean {
  if (busy) {
    aftermath.quiet = SETTLE
    return false
  }
  aftermath.quiet -= delta
  return aftermath.quiet <= 0
}
