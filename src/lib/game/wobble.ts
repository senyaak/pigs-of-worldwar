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
// random walk with a fresh step every frame does not.
//
// **It moves the EYE, not the aim.** That is not a style choice — it is what
// the binary does. The shot reads `[pig+0x304]` exactly and the rifle cam is
// a POSITION on the hand, so in the original a tremor shifts the picture and
// cannot steer the bullet. An angular jitter does both, swings the whole
// world, and gets worse the further you look; at four times magnification it
// is unusable. Play's second verdict — "дрож камеры всё ещё фу" — was that
// one. So these are OFFSETS, in model units, across and up from wherever the
// hand has the camera.
//
// Set `SCALE` to zero and the scope still breathes on the hand's own 32 units
// a breath; it just does not tremble on top.

/** `8 + (rand() & 7)`: the step, straight off 0x49e07f. */
const STEP_BASE = 8
const STEP_SPREAD = 8
/** `±0x80`: where it turns round, off 0x49e06c. */
const LIMIT = 0x80
/**
 * How much of it the sights get, as MODEL UNITS per unit of walk. EYEWORK: at
 * 0.25 the eye wanders ±32 units, which doubles the hand's own breath and is
 * about a tenth of a pig's width.
 */
const SCALE = 0.25

export interface Wobble {
  /** The two accumulators, `[obj+0x12A]` and `[obj+0x12C]`. */
  up: number
  across: number
  /** Which way each is walking, `[obj+0x12E]` and `[obj+0x12F]`. */
  upRising: boolean
  acrossRising: boolean
  /** Frames owed. The walk steps ONCE A FRAME at the engine's fifteen, and
   * that is the whole point — stepping it per rendered frame at sixty would
   * smooth it back into a float. */
  owed: number
}

export const createWobble = (): Wobble => ({
  up: 0,
  across: 0,
  upRising: true,
  acrossRising: false,
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
    wobble.up = 0
    wobble.across = 0
    wobble.owed = 0
    return
  }
  wobble.owed += frames
  while (wobble.owed >= 1) {
    wobble.owed -= 1
    const u = walk(wobble.up, wobble.upRising, random)
    wobble.up = u.value
    wobble.upRising = u.up
    const a = walk(wobble.across, wobble.acrossRising, random)
    wobble.across = a.value
    wobble.acrossRising = a.up
  }
}

/** How far the eye has wandered UP of where the hand put it, model units. */
export const wobbleUp = (wobble: Wobble): number => wobble.up * SCALE

/** …and ACROSS, to the pig's right. Neither steers the barrel. */
export const wobbleAcross = (wobble: Wobble): number => wobble.across * SCALE
