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
 * How far the resting stick reads, in 4096ths, after the handler's halving.
 * A byte axis is ±127 and a stick at rest sits in the low single figures;
 * seven units is a little over half a degree. EYEWORK — play asked for more
 * than the four this started at.
 *
 * Note the easing below EATS some of it: against white noise, a chase at
 * `EASE` settles to `sqrt(EASE / (2 - EASE))` of the sample, so 0.65 shows
 * about seven tenths of whatever is set here. Turn this up, not `EASE` down,
 * or the jitter goes back to being a float.
 */
const AMPLITUDE = 7

/**
 * How much of the way to a fresh sample one engine frame moves.
 *
 * A raw sample-and-hold is a square wave and reads as a rattle; play asked
 * for "чуть плавнее — но не сильно". Two thirds keeps the jitter fast and
 * uncorrelated but takes the hard edge off each step. One is the raw stick.
 */
const EASE = 0.65

/**
 * How much MORE it shakes at full zoom, on top of what the magnification does to
 * the picture by itself.
 *
 * **This went in backwards first, and the mistake is worth keeping written down:
 * the exe's divisor is not this quantity.** The aim-view arm scales what comes out
 * of `[game+0x300]` by `(0x1000 − zoom) >> 12` (0x495ecc), so a magnified view
 * gets a FINER step — but that accumulator is a STEP that adds into the angle
 * frame by frame, i.e. control sensitivity, and a scope wants exactly that: fine
 * control up close. The tremor here is an OFFSET on the view, which is a different
 * quantity, and carrying the divisor across made the shake die out as the scope
 * closed in. Play: "дёргание при увеличении ты сделал в обратную сторону — чем
 * ближе, тем меньше, а надо наоборот."
 *
 * So it goes the other way, and eyework decides how far. 1 would leave the growth
 * entirely to the magnification (a fixed angle covers `SCOPE_MAGNIFY` times more
 * screen at the cap, which play read as "не масштабируется"); this doubles the
 * angle on top of that.
 */
const ZOOMED = 2

export interface Wobble {
  /** The sample each axis is heading for, drawn once an engine frame. */
  pitch: number
  yaw: number
  /** …and where each one has actually got to. */
  shownPitch: number
  shownYaw: number
  /** Frames owed. A new sample lands once an engine frame at fifteen a
   * second — resampling per rendered frame at sixty would turn it into a
   * blur, and holding it longer would turn it into a wobble. */
  owed: number
}

export const createWobble = (): Wobble => ({
  pitch: 0,
  yaw: 0,
  shownPitch: 0,
  shownYaw: 0,
  owed: 0
})

/**
 * Advance the tremor. `frames` is engine frames, not rendered ones.
 *
 * `zoom` is how far in the sights are, 0 wide open and 1 at the cap. **Closer
 * shakes MORE** — play's rule, twice over: the first pass had no scaling at all
 * ("при зуме дёрганье не масштабируется, а должно") and the second carried the
 * exe's step divisor across and shrank it ("сделал в обратную сторону"). See
 * `ZOOMED` for why that divisor is a different quantity from this one.
 *
 * `random` is injectable so a spec can pin it.
 */
export function updateWobble(
  wobble: Wobble,
  frames: number,
  sighting: boolean,
  zoom = 0,
  random: () => number = Math.random
): void {
  if (!sighting) {
    wobble.pitch = 0
    wobble.yaw = 0
    wobble.shownPitch = 0
    wobble.shownYaw = 0
    wobble.owed = 0
    return
  }
  wobble.owed += frames
  if (wobble.owed >= 1) {
    wobble.owed = wobble.owed % 1
    const close = Math.max(0, Math.min(1, zoom))
    const reach = AMPLITUDE * (1 + close * (ZOOMED - 1))
    wobble.pitch = (random() * 2 - 1) * reach
    wobble.yaw = (random() * 2 - 1) * reach
  }
  // Chase the sample rather than snapping to it, by the same engine frames —
  // so the smoothing does not get finer just because the screen is faster.
  const ease = Math.min(1, EASE * Math.max(frames, 0))
  wobble.shownPitch += (wobble.pitch - wobble.shownPitch) * ease
  wobble.shownYaw += (wobble.yaw - wobble.shownYaw) * ease
}

/** How far off the pitch is this frame, in aim units. View only. */
export const wobblePitch = (wobble: Wobble): number => wobble.shownPitch

/** …and the yaw. The pig's own heading does not follow it: the model stands
 * where it stands and only the sights move. */
export const wobbleYaw = (wobble: Wobble): number => wobble.shownYaw
