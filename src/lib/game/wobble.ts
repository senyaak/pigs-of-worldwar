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
 * ## A JITTER ON THE AIM, AND A DRIFT ON THE EYE - which is where each belongs
 *
 * Play settled both halves, and the split matters more than either number:
 *
 * - the **JITTER** is the sampled-and-eased one that was right from the fifth pass
 *   ("раньше было ПРАВИЛЬНО"), a couple of aim units redrawn every
 *   engine frame. It is on the ANGLE, it is tiny, and it is the resting stick;
 * - the **DRIFT** is what makes the sights leave the target, and it has **no centre
 *   and no bound**: "ЦЕНТРА ВООБЩЕ НЕ ДОЛЖНО БЫТЬ - мы можем
 *   уехать в одном направлении на 10 метров если рандо так сделает." A free
 *   random walk, then, and it moves the **EYE** rather than the angle.
 *
 * **The eye is why the bullet stays honest.** A drift on the ANGLE is a lie: the
 * crosshair is nailed to the middle of the screen, so an unbounded angular drift
 * eventually points the picture somewhere the shot will never go - and folding the
 * drift into the shot to fix that was worse, which play said in one line:
 * "пуля летела не туда только после твоего фикса". Moving the eye slides the
 * WORLD across the sights instead: the target drifts off the crosshair, the player
 * has to bring it back, and the barrel never points anywhere but where the player
 * put it. It is also where the exe's own scope motion comes from - the rifle cam is
 * a POSITION on the hand bone (0x4a2e30) and nothing else.
 */

/**
 * How far the JITTER reaches, in 4096ths of a turn - about half a degree, and the
 * number play settled on before ("дрож чутка слабая" took it from 4 to 7).
 *
 * The chase below eats some of it: against white noise a chase at `EASE` settles to
 * `sqrt(EASE / (2 - EASE))` of the sample, so 0.65 shows about seven tenths. Turn
 * this up rather than `EASE` down, or it goes back to floating.
 */
const AMPLITUDE = 7

/** How much of the way to a fresh sample one engine frame moves. One is the raw
 * stick and reads as a rattle; play asked for "чуть плавнее, но не сильно". */
const EASE = 0.65

/**
 * How far the EYE wanders each engine frame, in game units, across the view and up
 * it. Eyework, and there is deliberately NO limit on where it gets to - that is the
 * whole of play's correction. `resetWobble` is what brings it home, and the sights
 * coming down is what calls it.
 */
const DRIFT_STEP = 7

/**
 * How much further the eye travels a second at full zoom.
 *
 * **The exe's zoom divisor is not this quantity, and one pass had it backwards.**
 * The aim-view arm scales what comes out of `[game+0x300]` by
 * `(0x1000 - zoom) >> 12` (0x495ecc), so a magnified view gets a FINER step - but
 * that accumulator is the player's own aiming input, i.e. control sensitivity,
 * which a scope wants fine. The tremor is what the player fights, and play's rule
 * for it is the other way about: closer covers more ground.
 */
const ZOOMED = 2

export interface Wobble {
  /** The jitter's sample each axis is heading for, drawn once an engine frame. */
  sampledPitch: number
  sampledYaw: number
  /** ...and where the jitter has actually got to, in aim units. */
  jitterPitch: number
  jitterYaw: number
  /** Where the EYE has wandered to, in game units - across the view and up it.
   * Unbounded on purpose. */
  driftAcross: number
  driftUp: number
  /** Frames owed. A sample and a step land once an ENGINE frame: doing either per
   * rendered frame makes the tremor as fast as the screen. */
  owed: number
}

export const createWobble = (): Wobble => ({
  sampledPitch: 0,
  sampledYaw: 0,
  jitterPitch: 0,
  jitterYaw: 0,
  driftAcross: 0,
  driftUp: 0,
  owed: 0
})

/** Put the sights back where they are pointed. Used when they are lowered for
 * good - NOT while a shot is in the fuse, which HOLDS instead (see below). */
export function resetWobble(wobble: Wobble): void {
  wobble.sampledPitch = 0
  wobble.sampledYaw = 0
  wobble.jitterPitch = 0
  wobble.jitterYaw = 0
  wobble.driftAcross = 0
  wobble.driftUp = 0
  wobble.owed = 0
}

/**
 * Advance the tremor. `frames` is engine frames, not rendered ones.
 *
 * **Stop calling it and it FREEZES where it is** - nothing here resets. That is
 * `Pig::Aim`'s own behaviour and it matters: the exe's tremor arrives THROUGH
 * `Pig::Aim` (0x495cb0 calls 0x46A7F0 with the stick's step), that function bails
 * while `Pig::MayAct` is false, and `MayAct` is false from the fire press until the
 * attack. So in the original the sights stop dead for the length of the fuse.
 *
 * `zoom` is 0 wide open and 1 at the cap: it scales how far the EYE travels each
 * frame, and nothing else. `random` is injectable so a spec can pin it.
 */
export function updateWobble(
  wobble: Wobble,
  frames: number,
  zoom = 0,
  random: () => number = Math.random
): void {
  const reach = 1 + Math.max(0, Math.min(1, zoom)) * (ZOOMED - 1)
  wobble.owed += frames
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    // A fresh sample for the jitter...
    wobble.sampledPitch = (random() * 2 - 1) * AMPLITUDE
    wobble.sampledYaw = (random() * 2 - 1) * AMPLITUDE
    // ...and a step for the EYE, in a fresh direction, going wherever it goes.
    wobble.driftAcross += (random() * 2 - 1) * DRIFT_STEP * reach
    wobble.driftUp += (random() * 2 - 1) * DRIFT_STEP * reach
  }
  // Chase the sample by the same engine frames, so the smoothing does not get
  // finer just because the screen is faster.
  const ease = Math.min(1, EASE * Math.max(frames, 0))
  wobble.jitterPitch += (wobble.sampledPitch - wobble.jitterPitch) * ease
  wobble.jitterYaw += (wobble.sampledYaw - wobble.jitterYaw) * ease
}

/**
 * The JITTER on the pitch, in aim units - half a degree of stick, and the shot is
 * welcome to it: it is small enough that the crosshair does not lie.
 */
export const wobblePitch = (wobble: Wobble): number => wobble.jitterPitch

/** ...and on the yaw. The pig's own heading does not follow it - the model stands
 * where it stands; in the exe this axis goes to the pig's turn instead, and turning
 * the model from a tremor would fight the walk. */
export const wobbleYaw = (wobble: Wobble): number => wobble.jitterYaw

/** How far the EYE has wandered ACROSS the view, in game units. The picture moves
 * and the barrel does not (see the note at the top). */
export const wobbleAcross = (wobble: Wobble): number => wobble.driftAcross

/** ...and UP it. */
export const wobbleUp = (wobble: Wobble): number => wobble.driftUp
