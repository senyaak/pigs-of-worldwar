// THE MAP VIEW — "pull back and take me round the field, pig by pig".
//
// It is a CAMERA MODE, the exe's 7, and two things enter it: skill 63 MAP
// VIEW, and the PAUSE (0x49205F sets it, 0x49F740 restores whatever the
// camera was in on the way out). So a paused mission is not a frozen picture
// in the original — the world stops and the camera goes touring.
//
// Two numbers and one rule, all read (`scanner/notes.md`):
//
// - **the camera pulls back to 11000** against the ordinary chase's 3072, out
//   of row 7 of the per-mode table at 0x4D9528. The row's second column is
//   1024; mode 7's handler has not been traced reading it, so it is not
//   applied here — the same line the melee and rifle rows are held to.
// - **the corner scanner SHRINKS while it is up**: the mode's own `SetMode`
//   arm calls `afSetScannerSizeSmall(1)` (0x49FBF0) and grows it back at
//   0x49F867. That is the very same small size a charging shot uses, so the
//   widget needs no new number (`lib/game/scanner.ts`).
// - **the tour** is 0x4A4D40, the mode's per-frame update: it walks the pig
//   list, takes the first pig whose `+0x30` is set — the byte the draw loop
//   gates on, so a pig that is not being DRAWN is not toured — looks at it
//   for 0x7D frames, then steps to the next such pig and wraps.
//
// Pure: numbers in, an index out.

import { fromExeFrames } from './ballistics'

/** The chase's own distance, which every other rig is a fraction of. */
export const CHASE_DISTANCE = 3072
/** Row 7 of 0x4D9528: the survey stands nearly four times as far out. */
export const MAP_DISTANCE = 11000
export const MAP_CLOSE = MAP_DISTANCE / CHASE_DISTANCE

/** How long one pig is looked at, 0x7D frames of the exe's own clock. */
export const TOUR_FRAMES = 0x7d
export const TOUR_SECONDS = fromExeFrames(TOUR_FRAMES)

/**
 * Which of `count` pigs the tour is on, `elapsed` seconds in — stepping every
 * `TOUR_SECONDS` and wrapping, which is what "steps to the next and wraps"
 * means when nothing cuts a turn short.
 *
 * −1 for nothing to look at, which is a real case: every pig on the field can
 * be inside a building at once.
 *
 * The exe ALSO cuts a pig's turn short when the camera comes too close to it
 * or it leaves the screen. Neither is modelled — both are properties of a
 * camera that is still travelling, and this one is parked at 11000 with the
 * whole field in shot. `[gap]`, and it is a shortening, never a lengthening.
 */
export const touredIndex = (elapsed: number, count: number): number =>
  count <= 0 ? -1 : Math.floor(Math.max(0, elapsed) / TOUR_SECONDS) % count
