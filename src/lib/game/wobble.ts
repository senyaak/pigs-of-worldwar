// The sights will not hold still.
//
// **All of this is the remake's own.** Nothing in the binary wobbles an aim:
// `Pig::Aim` (0x46a7f0) adds the player's input to `[pig+0x304]`, clamps it to
// ±0x3FF and stops, and the shot reads that field exactly (0x47a2b6). There is
// no call to the RNG anywhere on the path and no per-frame drift term. Play
// says the scope breathes, so it breathes here, and this file is where to come
// when the real thing turns up.
//
// It is a BREATH, not noise: two slow sines at periods that do not divide each
// other, so the drift never settles into a visible loop and never jumps. And
// it is applied to the view AND the shot together — the crosshair sits at the
// middle of the screen in the original, so what moves is where the pig is
// pointing, not the mark.
//
// Angles are the engine's 4096-to-the-turn units, like every other angle.

/** How far off it drifts, in 4096ths — about a degree up and down, a little
 * more across. */
const PITCH = 10
const YAW = 14
/** Seconds a cycle. Deliberately not a ratio of small whole numbers. */
const PITCH_PERIOD = 2.7
const YAW_PERIOD = 3.9

export interface Wobble {
  /** Seconds since the sights came up. */
  time: number
}

export const createWobble = (): Wobble => ({ time: 0 })

/** One frame. Only runs while the sights are actually up — a wobble that keeps
 * counting behind a chase camera would jump when they come back. */
export function updateWobble(wobble: Wobble, delta: number, sighting: boolean): void {
  if (!sighting) {
    wobble.time = 0
    return
  }
  wobble.time += delta
}

/** How far off the pitch is right now, in aim units. */
export const wobblePitch = (wobble: Wobble): number =>
  PITCH * Math.sin((wobble.time / PITCH_PERIOD) * 2 * Math.PI)

/** …and the yaw, which the pig's own heading does not follow: the model stands
 * where it stands and only the sights move. */
export const wobbleYaw = (wobble: Wobble): number =>
  YAW * Math.sin((wobble.time / YAW_PERIOD) * 2 * Math.PI + Math.PI / 3)
