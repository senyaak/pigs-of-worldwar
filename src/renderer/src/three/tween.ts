// Drawing BETWEEN steps.
//
// The rules move in fixed quanta (lib/game/engine.ts, STEP_SECONDS) and the
// screen does not: a rendered frame buys one step, sometimes none, sometimes
// two. Anything drawn straight off the engine's numbers therefore stands still
// for a frame and then jumps two — which play felt as a shake in the camera
// long before anything measured it, because the rig eases where it STANDS and
// not what it LOOKS at, so the stutter went almost entirely into the aim.
//
// So the scene keeps the last two step boundaries for everything the engine
// moves, and draws the point in between. The acting pig is tweened in
// `three/battle.ts` off its locomotion state; everything with an IDENTITY — a
// bullet, a grenade, a crate coming down, the spot a blow left behind — goes
// through here.

import type { Point } from '../../../lib/game/pose'

/** What is where, as of one step boundary. The key is the engine's own object,
 * so a list that splices does not shift anything's history. */
export type Marks = Iterable<readonly [unknown, Point]>

export interface Tween {
  /** Where things stand NOW — called just before each step runs, so that a
   * frame which buys two steps still ends up holding the boundary one step
   * back rather than two. */
  from(marks: Marks): void
  /** …and where they stand once the frame's steps have run. */
  to(marks: Marks): void
  /**
   * Where to draw one, `alpha` of the way between those two boundaries.
   *
   * `now` is where the engine says it is, and it is what comes back for
   * anything with no history — something in its first step has nowhere to be
   * drawn from, and guessing would put it somewhere it never was.
   */
  at(key: unknown, now: Point, alpha: number): Point
}

export function createTween(): Tween {
  let before = new Map<unknown, Point>()
  let after = new Map<unknown, Point>()
  const copy = (marks: Marks): Map<unknown, Point> => {
    const seen = new Map<unknown, Point>()
    for (const [key, at] of marks) seen.set(key, { x: at.x, y: at.y, z: at.z })
    return seen
  }

  return {
    from: (marks) => void (before = copy(marks)),
    to: (marks) => void (after = copy(marks)),
    at(key, now, alpha) {
      const start = before.get(key)
      if (!start) return now
      const end = after.get(key) ?? now
      return {
        x: start.x + (end.x - start.x) * alpha,
        y: start.y + (end.y - start.y) * alpha,
        z: start.z + (end.z - start.z) * alpha
      }
    }
  }
}
