// How a frontend screen DRIVES ON, and how it leaves again.
//
// Nothing on the original's menu is where it belongs on the first frame: the
// whole screen starts off it, settles into place, and when a bar is chosen it
// clears out the same way. The exe does that with two displacements — one
// vertical, added to every piece the draw arm places except the tracks, and
// one horizontal that belongs to the TRACKS alone — and a per-screen update
// arm that springs them. All of it is read; see frontend/notes.md in the
// disasm repo.
//
// The order matters and is easy to miss: **the tracks slide in first, and the
// screen does not begin to fall until they have.** The update arm jumps
// straight to the track spring while its offset is non-zero and does nothing
// else, so for the first few ticks the racks are all there is to see. Leaving
// is the mirror: the screen flies UP first, and only once it is gone do the
// tracks walk back out.
//
// - WHERE a screen starts is a pair of tables in `.data` indexed by the screen
//   id (0x4C09B8 x, 0x4C0A18 y). The main menu is screen 1 and its pair is
//   `(0, -650)`, so it drops straight down and does not slide across.
// - The numbers are in the frontend's OWN space, 1024×820, which the exe
//   squeezes into the 640×480 the art is drawn at (0x41ADB0/0x41ADD0, with
//   `[0x51F120]` shipped as 1). -650 is 380 screen pixels.
// - The machine drives in to the sound of a COG, once a tick while the spring
//   is still carrying speed — `rumbled()` is that tick.

import { approach, launch, spring, still } from './springs'
import type { Launch, Spring } from './springs'

/** The frontend is authored for 1024×820 and drawn at 640×480. */
const scaleY = (y: number): number => Math.trunc((y * 480) / 820)

/** The screen's own drop, off the menu's update arm at 0x423ea8. */
const FALL: Spring = { gain: 8, damping: 17, cap: 80 }
/** The tracks coming in, off 0x424038 — and the enter arm seeds the velocity
 * cell with 10 before the first tick (0x41b5d9). */
const TRACKS_IN: Spring = { gain: 4, damping: 12, cap: 21 }
const TRACK_SPEED = 10
/** Where the tracks start, and where they are walked back out to (0x41b49d,
 * and 0x425492's target). */
const TRACKS_FROM = -36
const TRACKS_TO = -50
/** Three a tick, twice over — the exe's own step (0x41FD00's `2*step`). */
const TRACKS_OUT_STEP = 3
/** The screen leaving: no pull, just acceleration (0x42553a). */
const FLIGHT: Launch = { accel: 15, cap: 80 }

/** What a screen is doing. `gone` is the frame the exe hands over on. */
export type Phase = 'arriving' | 'here' | 'leaving' | 'gone'

export interface Drive {
  /** One frontend tick. */
  tick(): void
  /** The vertical displacement in SCREEN pixels, for everything the machine
   * draws — the backdrop and the tracks excepted. */
  offset(): number
  /** The same displacement in the frontend's OWN units. The screen's update
   * arm gates on this rather than on pixels — the plates are asked to turn
   * over once it has climbed past -50 (exe 0x423f57). */
  raw(): number
  /** How far the two tracks are pushed OUT. The draw arm adds it to the left
   * one's x and subtracts it from the right one's WITHOUT scaling it, unlike
   * the screen offset, so it is already in pixels. */
  trackShift(): number
  phase(): Phase
  /** Whether a cog should be heard this tick — the entrance's own rumble. */
  rumbled(): boolean
  /** Come in again from the beginning. */
  restart(): void
  /** Start clearing out. Answers nothing; watch `phase()` for `gone`. */
  leave(): void
}

/**
 * A screen that comes in from `from`, in the frontend's own units. Zero — or a
 * screen that never restarts — simply sits where it belongs and leaves at
 * once, which is every screen whose own entrance has not been read yet.
 */
export function drive(from: number): Drive {
  const y = still(0)
  const tracks = still(0)
  let phase: Phase = from === 0 ? 'here' : 'arriving'
  /** The rumble's own counter (0x512A1C), which arrival parks out of reach. */
  let rumble = 1000
  let rumbledThisTick = false

  /** The exe's own rate: a cog every `(k - |v|)/10` ticks, so it clatters
   * faster the faster the screen is moving, and the counter is never reset —
   * once it is past the period it fires every tick until the speed dies. */
  const rumbling = (from: number): boolean => {
    const speed = Math.abs(y.velocity)
    const period = Math.max(0, Math.trunc((from - speed) / 10))
    rumble += 1
    return rumble > period && speed > 2
  }

  return {
    tick() {
      rumbledThisTick = false
      if (phase === 'arriving') {
        // The tracks first, and NOTHING else while they are on their way.
        if (tracks.value !== 0) {
          spring(tracks, 0, TRACKS_IN)
          return
        }
        rumbledThisTick = rumbling(50)
        if (spring(y, 0, FALL)) {
          phase = 'here'
          rumble = 1000
        }
        return
      }
      if (phase === 'leaving') {
        if (y.value !== from + 1) {
          rumbledThisTick = rumbling(60)
          launch(y, from + 1, FLIGHT)
          return
        }
        if (approach(tracks, TRACKS_TO, TRACKS_OUT_STEP)) phase = 'gone'
      }
    },
    // The draw arm halves the scaled offset and doubles it again, so an odd
    // pixel never reaches the screen (0x41bf43..0x41bfd0).
    offset: () => 2 * Math.trunc(scaleY(y.value) / 2),
    raw: () => y.value,
    trackShift: () => tracks.value,
    phase: () => phase,
    rumbled: () => rumbledThisTick,
    restart() {
      if (from === 0) {
        phase = 'here'
        return
      }
      y.value = from
      y.velocity = 0
      tracks.value = TRACKS_FROM
      tracks.velocity = TRACK_SPEED
      rumble = 1000
      phase = 'arriving'
    },
    leave() {
      if (from === 0) {
        phase = 'gone'
        return
      }
      y.velocity = 0
      rumble = 1000
      phase = 'leaving'
    }
  }
}
