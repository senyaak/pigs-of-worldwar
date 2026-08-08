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
 * ## A JITTER ON A WANDERING CENTRE — and it took four goes at the shape
 *
 * Play settled it, and the last correction is the whole design: "тебе надо было
 * просто после каждого сдвига обновлять центр — чтобы могло уезжать в любую
 * сторону. Раньше было ПРАВИЛЬНО."
 *
 * So both halves, and neither replaces the other:
 *
 * - the **JITTER** is what was right before — an independent sample of a couple of
 *   units every engine frame, chased rather than snapped to, which is the resting
 *   stick the arm above feeds the camera;
 * - the **CENTRE** it jitters about does not sit still. It takes a step of its own
 *   every frame, in a fresh random direction, and it is what makes the sights
 *   travel: they wander off the target and have to be brought back.
 *
 * A pass with only the walk was tried and play read it exactly right — "щас реально
 * по одному эллипсу ездит". Two axes each sweeping between reflecting stops IS an
 * ellipse; a direction that is redrawn every step is not, and that is the
 * difference between the two.
 */

/**
 * How far the JITTER reaches, in 4096ths of a turn — about half a degree, and the
 * number play settled on before ("дрож чутка слабая" took it from 4 to 7).
 *
 * The chase below eats some of it: against white noise a chase at `EASE` settles to
 * `sqrt(EASE / (2 − EASE))` of the sample, so 0.65 shows about seven tenths. Turn
 * this up rather than `EASE` down, or it goes back to floating.
 */
const AMPLITUDE = 7

/** How much of the way to a fresh sample one engine frame moves. One is the raw
 * stick and reads as a rattle; play asked for "чуть плавнее, но не сильно". */
const EASE = 0.65

/**
 * How far the CENTRE steps each engine frame, in aim units, and how far it may get
 * from where the player pointed. Both eyework.
 *
 * `DRIFT_BOUND` is about two degrees. It does not ride the zoom: play was explicit
 * that the radius is not the thing that should grow.
 */
const DRIFT_STEP = 1.2
const DRIFT_BOUND = 24

/**
 * How much further the centre travels a second at full zoom.
 *
 * **The exe's zoom divisor is not this quantity, and pass three had it backwards.**
 * The aim-view arm scales what comes out of `[game+0x300]` by
 * `(0x1000 − zoom) >> 12` (0x495ecc), so a magnified view gets a FINER step — but
 * that accumulator is the player's own aiming input, i.e. control sensitivity,
 * which a scope wants fine. The tremor is what the player fights, and play's rule
 * for it is the other way about: closer covers more ground. It scales the STEP and
 * not the bound — "чем ближе, тем больше расстояния проходит, а не тем шире радиус".
 */
const ZOOMED = 2

export interface Wobble {
  /** The jitter's sample each axis is heading for, drawn once an engine frame. */
  sampledPitch: number
  sampledYaw: number
  /** …where the jitter has actually got to. */
  jitterPitch: number
  jitterYaw: number
  /** …and the centre it is jittering about, which walks. */
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

/** Put the sights back where they are pointed. Used when they are lowered for
 * good — NOT while a shot is in the fuse, which HOLDS instead (see below). */
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
 * **Stop calling it and it FREEZES where it is** — nothing here resets. That is
 * `Pig::Aim`'s own behaviour and it matters: the exe's tremor arrives THROUGH
 * `Pig::Aim` (0x495cb0 calls 0x46A7F0 with the stick's step), that function bails
 * while `Pig::MayAct` is false, and `MayAct` is false from the fire press until the
 * attack. So in the original the sights stop dead for the length of the fuse and
 * the bullet leaves along exactly what the player last saw. Zeroing it there
 * instead was the bug play hit: "нажимаешь, прицел смотрит на 1 вещь, а стреляет
 * будто секунду назад."
 *
 * `zoom` is 0 wide open and 1 at the cap: it scales how far the CENTRE travels each
 * frame, and nothing else. `random` is injectable so a spec can pin it.
 */
export function updateWobble(
  wobble: Wobble,
  frames: number,
  zoom = 0,
  random: () => number = Math.random
): void {
  const reach = 1 + Math.max(0, Math.min(1, zoom)) * (ZOOMED - 1)
  const bounded = (value: number): number =>
    Math.max(-DRIFT_BOUND, Math.min(DRIFT_BOUND, value))
  wobble.owed += frames
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    // A fresh sample for the jitter…
    wobble.sampledPitch = (random() * 2 - 1) * AMPLITUDE
    wobble.sampledYaw = (random() * 2 - 1) * AMPLITUDE
    // …and a step for the centre, in a FRESH direction each time. Keeping a
    // direction and reversing at the stops is what drew the ellipse.
    wobble.driftPitch = bounded(wobble.driftPitch + (random() * 2 - 1) * DRIFT_STEP * reach)
    wobble.driftYaw = bounded(wobble.driftYaw + (random() * 2 - 1) * DRIFT_STEP * reach)
  }
  // Chase the sample by the same engine frames, so the smoothing does not get
  // finer just because the screen is faster.
  const ease = Math.min(1, EASE * Math.max(frames, 0))
  wobble.jitterPitch += (wobble.sampledPitch - wobble.jitterPitch) * ease
  wobble.jitterYaw += (wobble.sampledYaw - wobble.jitterYaw) * ease
}

/**
 * How far off the pitch is, in aim units: the wandering centre plus the jitter on
 * top of it.
 *
 * **The SHOT reads this too, and it must.** The picture and the bullet cannot
 * disagree — the crosshair is nailed to the middle of the screen, so a view that
 * points somewhere the bullet will not go is simply a lie, and play read it as the
 * shot lagging. The exe has no such split: its tremor is the stick's own step going
 * through `Pig::Aim` into `[pig+0x304]`, which is the field the bullet reads
 * (0x47a2b6). An earlier note here claimed "the view jitters, the shot does not" —
 * that was written before the stick was found feeding `Pig::Aim`, and it is wrong.
 */
export const wobblePitch = (wobble: Wobble): number => wobble.driftPitch + wobble.jitterPitch

/** …and the yaw, the same way. The pig's own heading does not follow it — the model
 * stands where it stands; in the exe this axis goes to the pig's turn instead, and
 * turning the model from a tremor would fight the walk. */
export const wobbleYaw = (wobble: Wobble): number => wobble.driftYaw + wobble.jitterYaw
