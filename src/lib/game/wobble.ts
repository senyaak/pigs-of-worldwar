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
 * ## And it WALKS, it does not shiver in place — the fourth pass at its shape
 *
 * Play, looking at the sample-and-hold version: "ты держишь его в радиусе центра,
 * а надо чтобы прицел уезжал — и чем ближе, тем больше расстояния проходит, а не
 * тем шире радиус дёрганья."
 *
 * That is a different mechanism, not a bigger number, and it is the ENGINE's — the
 * random walk at 0x49e030 quoted at the top of this file. A direction per axis, a
 * fresh step every frame, and a reversal only when it reaches the stop. So the
 * crosshair travels: it wanders off the target and comes back rather than rattling
 * around it, and the two axes reach their stops at different times, which is what
 * makes it wander in every direction rather than along a line.
 *
 * The version this replaces drew an independent sample each frame and eased
 * towards it, which is a bounded rattle however far the bound is put — exactly
 * what play described. Three things went with it: `AMPLITUDE`, `EASE`, and the
 * whole idea that the zoom should widen the bound.
 */

/**
 * How far the sights may wander from where they are pointed, in 4096ths of a turn
 * — about two degrees. EYEWORK, and it does NOT ride the zoom: play was explicit
 * that the radius is not what should grow.
 */
const BOUND = 24

/**
 * A step, in 128ths of `BOUND` a frame — `8 + (rand() & 7)` against the engine's
 * own ±0x80 stops (0x49e056), carried over as it stands. Eight to fifteen of a
 * hundred and twenty-eight is a crossing of the whole range in ten to seventeen
 * engine frames, so the sights sweep about once a second.
 */
const STEP_LOW = 8
const STEP_SPAN = 8
const STEP_UNIT = BOUND / 0x80

/**
 * How much further it travels a second at full zoom.
 *
 * **The exe's zoom divisor is not this quantity, and pass three had it backwards.**
 * The aim-view arm scales what comes out of `[game+0x300]` by
 * `(0x1000 − zoom) >> 12` (0x495ecc), so a magnified view gets a FINER step — but
 * that accumulator is the player's own aiming input, i.e. control sensitivity,
 * which a scope wants fine. The tremor is what the player fights, and play's rule
 * for it is the other way about: closer covers more ground. It scales the STEP and
 * not the bound, which is what "чем ближе, тем больше расстояния проходит, а не тем
 * шире радиус" says.
 */
const ZOOMED = 2

export interface Wobble {
  /** Where each axis has wandered to, in aim units. */
  pitch: number
  yaw: number
  /** Which way each one is going, +1 or −1. Reversed at the stops, and only
   * there — that is what makes it travel rather than rattle. */
  pitchWay: number
  yawWay: number
  /** Frames owed. A step lands once an ENGINE frame: stepping per rendered frame
   * would make the sweep as fast as the screen. */
  owed: number
}

export const createWobble = (): Wobble => ({
  pitch: 0,
  yaw: 0,
  pitchWay: 1,
  yawWay: -1,
  owed: 0
})

/**
 * Advance the tremor. `frames` is engine frames, not rendered ones.
 *
 * `zoom` is how far in the sights are, 0 wide open and 1 at the cap: it scales how
 * FAR the walk travels each frame and nothing else. `random` is injectable so a
 * spec can pin it.
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
    wobble.pitchWay = 1
    wobble.yawWay = -1
    wobble.owed = 0
    return
  }
  const reach = 1 + Math.max(0, Math.min(1, zoom)) * (ZOOMED - 1)
  wobble.owed += frames
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    const step = (): number => (STEP_LOW + random() * STEP_SPAN) * STEP_UNIT * reach
    // Reversing AT THE STOP is the whole of it — nothing pulls it back towards
    // the middle, so it crosses rather than hovers.
    wobble.pitch += wobble.pitchWay * step()
    if (wobble.pitch > BOUND) {
      wobble.pitch = BOUND
      wobble.pitchWay = -1
    } else if (wobble.pitch < -BOUND) {
      wobble.pitch = -BOUND
      wobble.pitchWay = 1
    }
    wobble.yaw += wobble.yawWay * step()
    if (wobble.yaw > BOUND) {
      wobble.yaw = BOUND
      wobble.yawWay = -1
    } else if (wobble.yaw < -BOUND) {
      wobble.yaw = -BOUND
      wobble.yawWay = 1
    }
  }
}

/** How far off the pitch has wandered, in aim units. View only. */
export const wobblePitch = (wobble: Wobble): number => wobble.pitch

/** …and the yaw. The pig's own heading does not follow it: the model stands
 * where it stands and only the sights move. */
export const wobbleYaw = (wobble: Wobble): number => wobble.yaw
