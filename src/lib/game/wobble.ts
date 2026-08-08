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
 * ## THE RETICLE MOVES - not the camera. Play named the mistake outright
 *
 * "вместо того чтобы трясти прицел - ты тряс камеру?????" Yes, and every
 * complaint before it was a symptom of exactly that:
 *
 * - shaking the view DIRECTION kept the crosshair pinned to the middle of the
 *   screen, so the tremor read as "в радиусе центра" however it was shaped;
 * - the crosshair then LIED about where the bullet went, because the bullet left
 *   along the angle and the picture had been swung off it;
 * - and moving the EYE instead had the same problem from the other end: the barrel
 *   was honest and the mark on the glass still could not wander.
 *
 * What moves is the MARK. `target` out of `dashtims.mad` travels inside the scope's
 * ring while the camera holds perfectly still, and the shot leaves along whatever
 * the mark is on - so the picture is steady, the aim is what shakes, and what you
 * see is exactly what you get. The player brings the target under a wandering
 * crosshair rather than fighting a wandering world.
 *
 * The ZOOM then needs nothing of its own: the offset is an ANGLE, and a magnified
 * view is fewer degrees across, so the same angle carries the mark further across
 * the glass. "чем ближе, тем больше расстояния проходит" falls out of the
 * magnification for free, and the `ZOOMED` fudge that used to be here is gone.
 *
 * ## What each half is
 *
 * - the **JITTER**: an independent sample every engine frame, eased towards. The
 *   resting analogue stick, and the shape play called ПРАВИЛЬНО;
 * - the **DRIFT**: a free random walk with **no centre and no bound** - "ЦЕНТРА
 *   ВООБЩЕ НЕ ДОЛЖНО БЫТЬ, мы можем уехать в одном направлении на 10 метров
 *   если рандо так сделает." A walk does not run away in a hurry - it goes as
 *   the square root of the frames - so a few seconds in the scope is under a
 *   degree, and the rare long excursion is the point rather than a bug.
 *
 * Both are in the game's own aim units, 4096 to the turn.
 */

/**
 * How far the JITTER reaches, in 4096ths of a turn - about half a degree, and the
 * number play settled on ("дрож чутка слабая" took it from 4 to 7).
 *
 * The chase below eats some of it: against white noise a chase at `EASE` settles to
 * `sqrt(EASE / (2 - EASE))` of the sample, so 0.65 shows about seven tenths. Turn
 * this up rather than `EASE` down, or it goes back to floating.
 */
const AMPLITUDE = 7

/** How much of the way to a fresh sample one engine frame moves. One is the raw
 * stick and reads as a rattle; play asked for "чуть плавнее, но не сильно". */
const EASE = 0.65

/** How far the DRIFT steps each engine frame, in aim units. Eyework, and there is
 * deliberately no limit on where it gets to. */
const DRIFT_STEP = 1.2

export interface Wobble {
  /** The jitter's sample each axis is heading for, drawn once an engine frame. */
  sampledPitch: number
  sampledYaw: number
  /** ...and where the jitter has actually got to. */
  jitterPitch: number
  jitterYaw: number
  /** ...and the drift, which goes wherever it goes. */
  driftPitch: number
  driftYaw: number
  /** Frames owed. A sample and a step land once an ENGINE frame: doing either per
   * rendered frame makes the tremor as fast as the screen. */
  owed: number
}

export const createWobble = (): Wobble => ({
  sampledPitch: 0,
  sampledYaw: 0,
  jitterPitch: 0,
  jitterYaw: 0,
  driftPitch: 0,
  driftYaw: 0,
  owed: 0
})

/** Put the mark back in the middle. Used when the sights are lowered for good -
 * NOT while a shot is in the fuse, which HOLDS instead (see below). */
export function resetWobble(wobble: Wobble): void {
  wobble.sampledPitch = 0
  wobble.sampledYaw = 0
  wobble.jitterPitch = 0
  wobble.jitterYaw = 0
  wobble.driftPitch = 0
  wobble.driftYaw = 0
  wobble.owed = 0
}

/**
 * Advance the tremor. `frames` is engine frames, not rendered ones.
 *
 * **Stop calling it and it FREEZES where it is** - nothing here resets. That is
 * `Pig::Aim`'s own behaviour and it matters: the exe's tremor arrives THROUGH
 * `Pig::Aim` (0x495cb0 calls 0x46A7F0 with the stick's step), that function bails
 * while `Pig::MayAct` is false, and `MayAct` is false from the fire press until the
 * attack. So the mark stops dead for the length of the fuse and the bullet leaves
 * along exactly what the player last saw.
 *
 * `random` is injectable so a spec can pin it. There is no zoom argument: the offset
 * is an angle and the magnification does that scaling by itself.
 */
export function updateWobble(
  wobble: Wobble,
  frames: number,
  random: () => number = Math.random
): void {
  wobble.owed += frames
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    // A fresh sample for the jitter...
    wobble.sampledPitch = (random() * 2 - 1) * AMPLITUDE
    wobble.sampledYaw = (random() * 2 - 1) * AMPLITUDE
    // ...and a step for the drift, in a fresh direction, going wherever it goes.
    wobble.driftPitch += (random() * 2 - 1) * DRIFT_STEP
    wobble.driftYaw += (random() * 2 - 1) * DRIFT_STEP
  }
  // Chase the sample by the same engine frames, so the smoothing does not get
  // finer just because the screen is faster.
  const ease = Math.min(1, EASE * Math.max(frames, 0))
  wobble.jitterPitch += (wobble.sampledPitch - wobble.jitterPitch) * ease
  wobble.jitterYaw += (wobble.sampledYaw - wobble.jitterYaw) * ease
}

/**
 * Where the MARK is, off the middle of the scope: the drift plus the jitter, in aim
 * units. The camera does not take it and the shot DOES - that is the whole design
 * (see the note at the top).
 */
export const wobblePitch = (wobble: Wobble): number => wobble.driftPitch + wobble.jitterPitch

/** ...and the yaw, the same way. The pig's own heading does not follow it: the model
 * stands where it stands and the barrel turns by this much on the shot alone. */
export const wobbleYaw = (wobble: Wobble): number => wobble.driftYaw + wobble.jitterYaw
