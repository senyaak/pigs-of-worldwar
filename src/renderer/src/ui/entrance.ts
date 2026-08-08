// How a frontend screen DRIVES ON.
//
// Nothing on the original's menu is where it belongs on the first frame: the
// whole screen starts off it and settles into place. The exe does that with
// ONE displacement added to every piece it draws — the backdrop excepted,
// which is blitted before the switch — out of a per-widget pair the screen's
// own update springs toward zero.
//
// All of it is read; see frontend/notes.md in the disasm repo.
//
// - WHERE a screen starts is a pair of tables in `.data` indexed by the screen
//   id (0x4C09B8 x, 0x4C0A18 y). The main menu is screen 1 and its pair is
//   `(0, -650)`, so it drops straight down and does not slide across.
// - The numbers are in the frontend's OWN space, 1024×820, which the exe
//   squeezes into the 640×480 the art is drawn at (0x41ADB0/0x41ADD0, with
//   `[0x51F120]` shipped as 1). -650 is 380 screen pixels.
// - HOW it settles is one shared damped spring, 0x41FD30, and the main menu's
//   update arm (0x423ea8) hands it gain 8, damping 17 and a speed cap of 80,
//   toward a target of zero.
//
// Ten engine frames, and it OVERSHOOTS: the column passes its resting place
// by about ten pixels on the fourth frame and comes back up. That is the
// spring's own doing, not a flourish — the exe does not clamp the step, and
// it will even kick a settled value one unit past the target if it arrives
// with speed still on it.

import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'

/** The frontend is authored for 1024×820 and drawn at 640×480. */
const scaleY = (y: number): number => Math.trunc((y * 480) / 820)

export interface Tuning {
  /** How hard the distance pulls, in tenths (exe `a4`). */
  gain: number
  /** What the velocity is divided down by each frame, over five (exe `a5`). */
  damping: number
  /** The most it may travel in one frame before the pull is applied (`a6`). */
  cap: number
}

/** The MAIN MENU's own three, off its update arm at 0x423ea8. */
export const MENU_TUNING: Tuning = { gain: 8, damping: 17, cap: 80 }

export interface Entrance {
  /** Advance to `now` and answer the y displacement in SCREEN pixels. */
  offset(now: number): number
  /** Come in again from the beginning. */
  restart(now: number): void
  /** Whether it is still on its way. */
  moving(): boolean
}

/**
 * A screen that comes in from `from`, in the frontend's own units. Zero — or
 * a screen that never calls `restart` — simply sits where it belongs.
 */
export function entrance(from: number, tuning: Tuning = MENU_TUNING): Entrance {
  let value = 0
  let velocity = 0
  let settled = true
  /** When the last engine frame was stepped. The spring is defined per FRAME
   * and the screen repaints at 25 a second, so it cannot be stepped per
   * repaint without changing the shape of the arrival. */
  let stepped = 0

  const trunc = Math.trunc

  /** One engine frame of 0x41FD30, target zero, arithmetic and all. */
  const step = (): void => {
    if (Math.abs(velocity) > tuning.cap) velocity = velocity > 0 ? tuning.cap : -tuning.cap
    const pull = trunc((-value * tuning.gain) / 10)
    velocity = trunc(trunc((10 * (pull + velocity)) / tuning.damping) / 2)
    const travel = 2 * velocity
    if (value === 0) {
      // At the stop with speed still on it, the exe kicks one unit past.
      if (Math.abs(travel) <= 2) {
        velocity = 0
        settled = true
        return
      }
      value = velocity > 0 ? -1 : 1
      return
    }
    value += travel !== 0 ? travel : value < 0 ? 1 : -1
  }

  return {
    offset(now) {
      if (settled) return 0
      const frames = Math.floor((now - stepped) / (EXE_FRAME_SECONDS * 1000))
      if (frames > 0) {
        stepped += frames * EXE_FRAME_SECONDS * 1000
        for (let i = 0; i < frames && !settled; i++) step()
      }
      // The draw arm halves the scaled offset and doubles it again, so an odd
      // pixel never reaches the screen (0x41bf43..0x41bfd0).
      return 2 * trunc(scaleY(value) / 2)
    },
    restart(now) {
      value = from
      velocity = 0
      settled = from === 0
      stepped = now
    },
    moving: () => !settled
  }
}
