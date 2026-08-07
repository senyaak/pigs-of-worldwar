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
 * four units is about a third of a degree. EYEWORK.
 */
const AMPLITUDE = 4

export interface Wobble {
  /** The current sample on each axis, held for one engine frame. */
  pitch: number
  yaw: number
  /** Frames owed. A new sample lands once an engine frame at fifteen a
   * second — resampling per rendered frame at sixty would turn it into a
   * blur, and holding it longer would turn it into a wobble. */
  owed: number
}

export const createWobble = (): Wobble => ({ pitch: 0, yaw: 0, owed: 0 })

/**
 * Advance the tremor. `frames` is engine frames, not rendered ones.
 * `random` is injectable so a spec can pin it.
 */
export function updateWobble(
  wobble: Wobble,
  frames: number,
  sighting: boolean,
  random: () => number = Math.random
): void {
  if (!sighting) {
    wobble.pitch = 0
    wobble.yaw = 0
    wobble.owed = 0
    return
  }
  wobble.owed += frames
  if (wobble.owed < 1) return
  wobble.owed = wobble.owed % 1
  wobble.pitch = (random() * 2 - 1) * AMPLITUDE
  wobble.yaw = (random() * 2 - 1) * AMPLITUDE
}

/** How far off the pitch is this frame, in aim units. View only. */
export const wobblePitch = (wobble: Wobble): number => wobble.pitch

/** …and the yaw. The pig's own heading does not follow it: the model stands
 * where it stands and only the sights move. */
export const wobbleYaw = (wobble: Wobble): number => wobble.yaw
