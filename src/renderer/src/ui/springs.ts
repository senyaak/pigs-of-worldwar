// The three ways the frontend moves a number, and it never moves one any
// other way.
//
// A screen arrives, leaves, and drags its scenery about with these and
// nothing else — one damped spring, one accelerating launcher and one plain
// clamped step. All three are integer arithmetic in the frontend's own units,
// stepped once per frontend tick, and all three are transcribed rather than
// approximated: the overshoot, the one-unit kick and the truncation are the
// exe's and are what the motion looks like. See frontend/notes.md in the
// disasm repo.
//
// Each takes the value AND its velocity together, because the exe keeps the
// velocity in a cell of its own and hands it back in every call.

/** A number on its way somewhere, with the speed it carries. */
export interface Motion {
  value: number
  velocity: number
}

export const still = (value: number): Motion => ({ value, velocity: 0 })

const trunc = Math.trunc

/** What a spring pulls with (exe `a4`, `a5`, `a6`). */
export interface Spring {
  /** How hard the distance pulls, in tenths. */
  gain: number
  /** What the velocity is divided down by, over five. */
  damping: number
  /** The most speed it may carry into a tick. */
  cap: number
}

/**
 * One tick of the shared spring, 0x41FD30. Answers whether it has SETTLED.
 *
 * Two details shape it and neither is an accident: the step is not clamped,
 * so any gain overshoots and comes back, and a value already at the target
 * with speed still on it is kicked one unit past rather than stopping dead.
 */
export function spring(motion: Motion, target: number, tuning: Spring): boolean {
  if (Math.abs(motion.velocity) > tuning.cap) {
    motion.velocity = motion.velocity > 0 ? tuning.cap : -tuning.cap
  }
  const pull = trunc(((target - motion.value) * tuning.gain) / 10)
  motion.velocity = trunc(trunc((10 * (motion.velocity + pull)) / tuning.damping) / 2)
  const travel = 2 * motion.velocity
  if (motion.value === target) {
    if (Math.abs(travel) <= 2) {
      motion.velocity = 0
      return true
    }
    motion.value = motion.velocity > 0 ? target - 1 : target + 1
    return false
  }
  motion.value += travel !== 0 ? travel : target > motion.value ? 1 : -1
  if (motion.value === target) motion.velocity = 0
  return false
}

/** What a launcher accelerates with (exe `a4`, `a5`). */
export interface Launch {
  /** Added to the speed every tick. */
  accel: number
  /** The most it may reach — 5 while it is travelling the WRONG way. */
  cap: number
}

/**
 * One tick of 0x41FE20, which is how a screen leaves: no pull, just a speed
 * that grows by `accel` a tick and a position that moves by twice it, clamped
 * at the target. Answers whether it has got there.
 */
export function launch(motion: Motion, target: number, tuning: Launch): boolean {
  const cap = (target - motion.value) * motion.velocity >= 0 ? tuning.cap : 5
  motion.velocity += target > motion.value ? tuning.accel : -tuning.accel
  if (Math.abs(motion.velocity) > cap) motion.velocity = motion.velocity > 0 ? cap : -cap
  const moved = motion.value + 2 * motion.velocity
  motion.value = target > motion.value ? Math.min(moved, target) : Math.max(moved, target)
  if (motion.value === target) {
    motion.velocity = 0
    return true
  }
  return false
}

/**
 * One tick of 0x41FD00: `step` twice over toward the target, clamped, with no
 * speed at all. The tracks are walked out of the screen with this.
 */
export function approach(motion: Motion, target: number, step: number): boolean {
  const moved = motion.value + (target > motion.value ? 2 * step : -2 * step)
  motion.value = target > motion.value ? Math.min(moved, target) : Math.max(moved, target)
  return motion.value === target
}
