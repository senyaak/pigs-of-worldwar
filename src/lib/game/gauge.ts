// The POWER GAUGE: how hard a thing is thrown.
//
// Twenty-three skills have one and every gun does not. The flag is byte
// `+0x14` of the weapon's own 80-byte record at 0x4d7300 — already read into
// `Weapon.power` (lib/game/weapons.ts) — and it is 1 on the grenade family
// (19–27), 29–34, 39–44, 47 and 48.
//
// The fire button splits on it at 0x493796:
//
// - **with a gauge**, a fresh press starts `[game+0x4e4]` charging **0x50 a
//   frame toward 0xfff** (0x493812) and the throw happens on RELEASE — or on
//   its own the moment the charge tops out (0x493b39);
// - **without one**, the press writes `[game+0x4e4] = 1` and fires in the same
//   breath (0x493a98).
//
// The charge then rides all the way to the projectile: `Pig::Fire` parks it at
// `[pig+0x300]` (0x469371), the shot pushes it into the projectile
// constructor (0x47a298) and the constructor makes it the flight speed —
// `row.speed * charge >> 12` (0x432159 onward). So the gauge is a fraction of
// the weapon's own top speed and nothing else.
//
// Which is also why a gun cannot be reading it: a gun's charge is 1, and
// `300 * 1 >> 12` is zero. `lib/game/projectile.ts` says so at `fireShot`.
//
// Pure, in seconds. `weapons/fire.md`.

import { EXE_FRAME_SECONDS } from './ballistics'

/** What a full charge reads — `[game+0x4e4]`'s ceiling, 0x493812. */
export const GAUGE_FULL = 0xfff

/** What one engine frame adds. */
export const GAUGE_STEP = 0x50

/**
 * …so a gauge fills in this many frames, and 0xfff/0x50 is not a whole number:
 * the 52nd frame is the one that tops it out.
 *
 * In SECONDS that is the engine's rate, not this remake's — `EXE_FRAME_SECONDS`
 * in ballistics.ts argues why, and this is the third place to need it. At 1/15
 * the fill took three and a half seconds and play said so ("шкала заполняется
 * слишком медленно"); undistorted it is **1.7 s**, which is what a power gauge
 * you hold through a throw ought to be.
 */
export const GAUGE_FRAMES = Math.ceil(GAUGE_FULL / GAUGE_STEP)
export const GAUGE_SECONDS = GAUGE_FRAMES * EXE_FRAME_SECONDS

/** A charge in progress. Null anywhere else — nothing is holding the button. */
export interface Gauge {
  /** 0..`GAUGE_FULL`, the exe's own scale. */
  power: number
  /** Whether it has already reached the top and thrown. A gauge that tops out
   * fires by itself, and the button is then held over nothing until it is
   * let go. */
  spent: boolean
}

export const beginGauge = (): Gauge => ({ power: 0, spent: false })

/**
 * One frame of charging. `frames` is ENGINE frames — `delta /
 * EXE_FRAME_SECONDS`, not `/ FRAME_SECONDS`, since 0x50 is a per-frame step
 * off the exe.
 *
 * True on the frame it TOPS OUT, which is one of the two ways a throw
 * happens — the other is the button coming up, and that is the caller's to
 * notice.
 */
export function chargeGauge(gauge: Gauge, frames: number): boolean {
  if (gauge.spent) return false
  gauge.power += GAUGE_STEP * frames
  if (gauge.power < GAUGE_FULL) return false
  gauge.power = GAUGE_FULL
  gauge.spent = true
  return true
}

/** How full it is, 0..1 — what the dashboard draws and nothing else. */
export const gaugeFraction = (gauge: Gauge): number => gauge.power / GAUGE_FULL

/**
 * What a weapon with NO gauge throws with.
 *
 * The exe writes 1 and means "now", not "one four-thousandth of the speed" —
 * see the note in `projectile.ts`. Kept here so the two halves of the split
 * are one file apart rather than one guess apart.
 */
export const NO_GAUGE = 1
