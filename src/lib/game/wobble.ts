// The sights will not hold still.
//
// **The original's wobble was found, and it is not an angle.** Searching for
// a drift term was the wrong search: nothing adds one. `Pig::Aim` (0x46a7f0)
// takes the input, clamps to ±0x3FF and returns, with no call to the RNG on
// the path, and the shot reads `[pig+0x304]` exactly (0x47a2b6).
//
// What moves is the CAMERA, because it is bolted to the pig's hand. The rifle
// cam (0x4a2e30) does not build a position out of the mode table at all — it
// takes row 14 of the offset table at 0x4d0ee0, `(44, 32, 230)`, and puts it
// through bone 5 with the very call the muzzle uses (0x4a2ec0). The hand
// rides the chest and the chest breathes: measured over clip 27 (IDLE, 36
// frames) with the aim pose held on the arm, that mount point travels about
// **32 model units across, 26 up and 13 forward** every breath.
//
// The remake mounts the camera there (`three/chase.ts`, `SCOPE_MOUNT`), so
// that part is the original's and needs no help.
//
// **What is left in this file is the remake's own EXAGGERATION**, and it is
// here because play asked twice for a bigger drift than the breath alone
// gives — thirty-two units of sway is under a degree at the range a dummy
// stands. Turn it off by setting both amplitudes to zero and the scope still
// breathes; it just breathes as quietly as the original.
//
// It is a BREATH, not noise: two slow sines at periods that do not divide each
// other, so the drift never settles into a visible loop and never jumps. And
// it is applied to the view AND the shot together — the crosshair sits at the
// middle of the screen in the original, so what moves is where the pig is
// pointing, not the mark.
//
// Angles are the engine's 4096-to-the-turn units, like every other angle.

/**
 * How far the exaggeration drifts, in 4096ths: about four degrees up and down
 * and five across. Pure EYEWORK, and the third pass — a degree was invisible
 * and two and a half was still not what play wanted.
 *
 * At the dummy yard's 1200 units that is some ninety to a hundred and twenty
 * off centre, a third of a pig, so it is felt without making the shot a
 * lottery.
 */
const PITCH = 45
const YAW = 56
/**
 * Seconds a cycle. Deliberately not a ratio of small whole numbers, and
 * deliberately not the breath's own 2.4 s (clip 27 at 15 Hz) — two periods
 * that close would beat against each other and pulse.
 */
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
