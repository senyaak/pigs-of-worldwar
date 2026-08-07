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
// **The remake's own, and it borrows that last shape.** Play: "дрожание
// совсем не то — щас плавает, а в оригинале прям дрожит." A sine floats; a
// random walk with a fresh step every frame does not. So the sights get the
// engine's own tremor, at the engine's own numbers, on the two axes the
// sights have — scaled down, because ±0x80 is eleven degrees and that is a
// body slipping on ice rather than a pig holding its breath.
//
// Set `SCALE` to zero and the scope still breathes; it just breathes as
// quietly as the original's hand does.
//
// Angles are the engine's 4096-to-the-turn units, like every other angle.

/** `8 + (rand() & 7)`: the step, straight off 0x49e07f. */
const STEP_BASE = 8
const STEP_SPREAD = 8
/** `±0x80`: where it turns round, off 0x49e06c. */
const LIMIT = 0x80
/**
 * How much of it the sights get. EYEWORK: the walk's own ±128 is 11°, which
 * is a body sliding down a slope; a quarter of it reads as a held rifle.
 */
const SCALE = 0.25

export interface Wobble {
  /** The two accumulators, `[obj+0x12A]` and `[obj+0x12C]`. */
  pitch: number
  yaw: number
  /** Which way each is walking, `[obj+0x12E]` and `[obj+0x12F]`. */
  pitchUp: boolean
  yawUp: boolean
  /** Frames owed. The walk steps ONCE A FRAME at the engine's fifteen, and
   * that is the whole point — stepping it per rendered frame at sixty would
   * smooth it back into a float. */
  owed: number
}

export const createWobble = (): Wobble => ({
  pitch: 0,
  yaw: 0,
  pitchUp: true,
  yawUp: false,
  owed: 0
})

/** One axis, one frame: step, and turn round at the stop. */
function walk(value: number, up: boolean, random: () => number): { value: number; up: boolean } {
  const step = STEP_BASE + Math.floor(random() * STEP_SPREAD)
  const moved = up ? value + step : value - step
  if (up && moved > LIMIT) return { value: moved, up: false }
  if (!up && moved < -LIMIT) return { value: moved, up: true }
  return { value: moved, up }
}

/**
 * Advance the tremor. `frames` is engine frames, not rendered ones — whole
 * steps only, so the jitter lands at fifteen a second however fast the screen
 * runs.
 *
 * `random` is injectable so a spec can pin the walk.
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
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    const p = walk(wobble.pitch, wobble.pitchUp, random)
    wobble.pitch = p.value
    wobble.pitchUp = p.up
    const y = walk(wobble.yaw, wobble.yawUp, random)
    wobble.yaw = y.value
    wobble.yawUp = y.up
  }
}

/** How far off the pitch is right now, in aim units. */
export const wobblePitch = (wobble: Wobble): number => wobble.pitch * SCALE

/** …and the yaw, which the pig's own heading does not follow: the model
 * stands where it stands and only the sights move. */
export const wobbleYaw = (wobble: Wobble): number => wobble.yaw * SCALE
