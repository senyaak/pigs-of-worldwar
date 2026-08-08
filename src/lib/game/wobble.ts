// The sights will not hold still — and they JITTER, they do not float.
//
// ## What the binary actually has
//
// Four places were searched and this is what is in them:
//
// - **`Pig::Aim` (0x46a7f0)** adds the input to `[pig+0x304]`, clamps to
//   ±0x3FF and returns. No drift term, no RNG on the path. The shot reads
//   that field exactly (0x47a2b6).
// - **The rifle cam (0x4a2e30) is bolted to the HAND** — row 14 of 0x4d0ee0,
//   `(44, 32, 230)`, through bone 5. So the view rides a breathing chest, and
//   that motion is real and free (`three/chase.ts`, `SCOPE_MOUNT`). Measured
//   off the shipped `mcap.mad` it is about 32 model units across per breath —
//   under a degree at the range a dummy stands.
// - **The camera has a shake, and it is the wrong kind**: 0x49fea0 jitters
//   all three axes by `± rand() % [cam+0xB8]` and then decays the amplitude by
//   `[cam+0xBC]` every frame (0x4a0002). A decaying impulse — a blast — not
//   something held.
// - **The engine's held tremor is a RANDOM WALK**, at 0x49e030, and the game
//   puts it on a body standing on terrain type 4 or 11:
//
//   ```
//   49e056  if going down:  [obj+0x12C] -= 8 + (rand() & 7)
//   49e06c                  if it passed -0x80, turn round
//   49e07f  if going up:    [obj+0x12C] += 8 + (rand() & 7)
//   49e091                  if it passed +0x80, turn round
//   49e0a3  ...and the same again for [obj+0x12A]
//   ```
//
//   Two axes, each stepping **8..15 a frame** between **±0x80**, changing
//   speed every frame and reversing at the stops.
//
// ## What this file is
//
// **A stick that never sits at zero.** Four passes looked for a tremor and
// there is no dedicated one — but `0x495690`, the aim view's own handler,
// ends by feeding the camera six signed bytes unpacked out of `[game+0x444]`
// and `[game+0x44C]`, halved, on every frame no direction is held:
//
// ```
// 495699  (s8)[game+0x444]        /2        -> vtable +0x20
// 4956af  (s8)([game+0x444] >> 8) /2, neg   -> vtable +0x1C
// 4956c0  (s8)([game+0x444] >>16) /2        -> vtable +0x0C
// 4956cd  (s8)([game+0x444] >>24) /2, neg   -> vtable +0x04
// ```
//
// Those are the ANALOGUE STICK axes. On the machine this game was made for
// the sights are wired straight to a stick, and a resting stick reads a few
// units either way and a different few every frame. That is a small, FAST,
// ANGULAR tremor — nothing like a hand's slow sway, and nothing like a sine.
// On a keyboard those bytes are zero and the sights are dead still, which is
// what the remake had.
//
// So: an independent sample every engine frame, a couple of units of 4096,
// on the two axes the sights have. **The angles, not the eye** — that is
// where the exe puts it, and it is small enough not to steer a bullet
// noticeably (the shot still reads the clean angle; only the view moves).
//
// `AMPLITUDE` is the knob. Zero it and the scope is dead still again.

/**
 * ## IT GOES INTO THE AIM ITSELF - one number, read by everything
 *
 * Five passes tried to keep the tremor beside the aim: on the view's direction, on
 * the eye, on the mark drawn over the glass. Every one of them produced the same
 * class of bug, and play named it exactly: "ты сделал так что камера не
 * отражает действительности - так?" Yes: two numbers, and whichever one the
 * picture used, something else was using the other.
 *
 * So there is ONE number. The tremor is a STEP added into `aim.angle` (and into the
 * pig's turn for the other axis) on every engine frame, exactly as the exe does it:
 * the aim view's handler feeds the analogue stick's reading through `Pig::Aim`
 * (0x495cb0 -> 0x46A7F0), which is the field the CAMERA reads, the field the SHOT
 * reads (0x47a2b6), and the field the dial shows. Nothing can disagree, because
 * there is nothing to disagree with.
 *
 * Everything play asked for falls out of that:
 *
 * - **the picture follows the sight** - "ОНА ДОЛЖНА ЗА ПРИЦЕЛОМ ИДТИ" - because
 *   the camera looks along the aim and the aim is what moved;
 * - **nothing is bounded** - "ЦЕНТРА ВООБЩЕ НЕ ДОЛЖНО БЫТЬ" - a walk of small
 *   steps, held only by the aim's own ±0x3FF clamp, which is the exe's;
 * - **closer travels further** - the step is an ANGLE and a magnified view is fewer
 *   degrees across, so the same step carries the picture further over the glass;
 * - **and one mechanism gives both feels**: frame to frame a walk of a couple of
 *   units reads as a rattle, and over seconds it wanders off. That is what a resting
 *   stick is and why the exe needs nothing else.
 *
 * `AMPLITUDE` is the knob. Zero it and the sights are dead still.
 */

/**
 * How far the stick reads, in 4096ths of a turn, per engine frame. A byte axis is
 * ±127 and a resting stick sits in the low single figures; the handler halves it
 * before it goes anywhere. EYEWORK on top of that.
 */
const AMPLITUDE = 2

export interface Wobble {
  /** Frames owed. A step lands once an ENGINE frame - stepping per rendered frame
   * would make the tremor as fast as the screen. */
  owed: number
}

export const createWobble = (): Wobble => ({ owed: 0 })

/** Nothing to put back: the tremor lives in the aim now, so lowering the sights
 * simply stops adding to it. */
export function resetWobble(wobble: Wobble): void {
  wobble.owed = 0
}

/**
 * This frame's tremor, in aim units, to be ADDED to the aim and the turn.
 *
 * `frames` is engine frames, not rendered ones; a fraction owes nothing until it
 * makes a whole one up. `random` is injectable so a spec can pin it.
 */
export function wobbleStep(
  wobble: Wobble,
  frames: number,
  random: () => number = Math.random
): { pitch: number; yaw: number } {
  wobble.owed += frames
  let pitch = 0
  let yaw = 0
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    pitch += (random() * 2 - 1) * AMPLITUDE
    yaw += (random() * 2 - 1) * AMPLITUDE
  }
  return { pitch, yaw }
}
