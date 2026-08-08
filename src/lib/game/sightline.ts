// Finding a camera angle that can actually SEE its subject.
//
// **This is the remake's own and the original has nothing like it**, which was
// checked rather than assumed: `Map::IsBlocked` has ten callers in the whole
// binary and not one is in the camera code (0x49e000..0x4a6000), nor is the
// watery test. The camera's only question about the world is
// `Map::SampleHeight`, at fifteen sites, and all it does with the answer is
// keep itself off the ground. So in the original a wall between you and your
// grenade simply hides it.
//
// Play asked for it anyway — "давай всё равно сделаем камеру, а то не удобно" —
// so it is here, in its own file, marked, and easy to delete.
//
// Pure: game space (Y-down), and the caller supplies the only thing this cannot
// know, which is what counts as solid.

/** Whether this point is inside something the view cannot pass. */
export type Blocked = (x: number, y: number, z: number) => boolean

/** How many samples along the line — enough that a wall one tile thick cannot
 * fall between two of them at the rig's own distance. */
const SAMPLES = 12

/** How far round to try, and in what steps. Both eyework: a quarter turn each
 * way in twelve-degree steps finds a gap in a courtyard without the camera
 * ever swinging so far that the player loses which way is forward. */
const STEP = (12 / 360) * 2 * Math.PI
const SWEEP = 8

/**
 * Whether the camera at `back` and `lift` from `at`, along `heading`, can see
 * it. Samples the LINE rather than the camera point: standing in the open on
 * the far side of a wall is no use.
 */
export function canSee(
  at: { x: number; y: number; z: number },
  heading: number,
  back: number,
  lift: number,
  blocked: Blocked
): boolean {
  const eyeX = at.x - Math.sin(heading) * back
  const eyeZ = at.z - Math.cos(heading) * back
  // Y-down, so the camera being ABOVE is a smaller y.
  const eyeY = at.y - lift
  for (let i = 1; i <= SAMPLES; i++) {
    const t = i / (SAMPLES + 1)
    if (blocked(at.x + (eyeX - at.x) * t, at.y + (eyeY - at.y) * t, at.z + (eyeZ - at.z) * t)) {
      return false
    }
  }
  return false === blocked(eyeX, eyeY, eyeZ)
}

/**
 * The heading to watch `at` from: `heading` when it is clear, else the nearest
 * one either side that is.
 *
 * Alternates outwards — one step left, one step right, two left… — so the
 * camera takes the shortest way round whatever is in the way and does not
 * always swing the same direction. Returns `heading` unchanged when nothing
 * within the sweep is clear, because a camera spinning hopelessly is worse
 * than one behind a wall.
 */
export function clearHeading(
  at: { x: number; y: number; z: number },
  heading: number,
  back: number,
  lift: number,
  blocked: Blocked
): number {
  if (canSee(at, heading, back, lift, blocked)) return heading
  for (let step = 1; step <= SWEEP; step++) {
    for (const side of [1, -1]) {
      const tried = heading + side * step * STEP
      if (canSee(at, tried, back, lift, blocked)) return tried
    }
  }
  return heading
}
