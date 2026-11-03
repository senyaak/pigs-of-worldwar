// What the dashboard keeps between frames: the art it painted, the letters it
// decoded, and the plates' own clocks.

import type { Font } from '../font'
import type { Sprite } from '../sprites'

export interface DashState {
  /** The same letters painted the heal's own colour — the pink a heal's number
   * comes up in (lib/game/damage.ts). */
  healFont: Font | null
  /** The plate's own letters (PLATE_FONT), unpainted — the fallback while a
   * team's painted copy is still decoding. */
  plateFont: Font | null
  /** …and the same letters painted BLACK, which is what the outline is drawn
   * with (`LAYOUT.plate.outline`). */
  plateOutline: Font | null
  /** The clock's ten digit faces. */
  digits: Sprite[]
  /** The dial's face, painted (`LAYOUT.dial.green`). */
  fans: Sprite[]
  /** The same heart baked poisoned-green — swapped in per plate, never both. */
  sickHeart: Sprite | null
  loaded: boolean
  /** Seconds of plate still owed to a pig that has just been hurt. */
  hurtFor: number
  /** Where the heart's beat stands (PULSE_STEP). A pause freezes it with
   * everything else: the delta it advances by is zero there. */
  heartBeat: number
  /** Seconds the plates' gate has been OPEN — what the fade-in ramps on
   * (`LAYOUT.plate.fade`). Zeroed the moment the gate shuts, so the next
   * appearance fades again. */
  shownFor: number
  /** Which colours the tints were baked with, so a console change to them
   * repaints instead of being quietly ignored. */
  painted: string
  /** The fans and the heart as the files ship them, white, for `repaint`. */
  white: { fans: Sprite[]; heart: Sprite } | null
}

export const createDashState = (): DashState => ({
  healFont: null,
  plateFont: null,
  plateOutline: null,
  digits: [],
  fans: [],
  sickHeart: null,
  loaded: false,
  hurtFor: 0,
  heartBeat: 0,
  shownFor: 0,
  painted: '',
  white: null
})
