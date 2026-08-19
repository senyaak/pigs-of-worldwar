// How long a turn lasts, which is the CAMPAIGN POSITION's business and not a
// constant.
//
// The exe reads it out of a 27-entry table at 0x4d1860 indexed by `[0x51f17b]`
// and multiplies by 100 into the clock (0x4309f1..0x430a01). That index used
// to be "a level number whose link to the map is not decoded"; it is decoded
// now — `[0x51f17b]` is `team+0x53`, THE CAMPAIGN POSITION (the game-side team
// array is 0x51F128, `pigmap/notes.md`), and which map a position opens is the
// order table at 0x4D17F0 (`army/notes.md`), which `lib/game/missions.ts`
// already carries as `CAMPAIGN`. So the two tables compose into seconds by
// MAP, below:
//
//   positions 0-2   99 seconds   CAMP ESTU ROAD
//   positions 3-6   60           TRENCH DEVI RUMBLE ZULUS
//   positions 7-17  45           TWIN SNIPER MASHED GUNS LIBERATE OASIS
//                                FJORDS EYRIE BAY MEDIX BRIDGE
//   positions 18-23 30           DESVAL SNAKE EMPLACE SUPLINE KEEP TESTER
//   position  24    15           FOOT
//   position  25    30           FINAL
//   entry     26    99           past the campaign's end; nothing walks there
//
// A campaign that starts generous and tightens to fifteen seconds at
// Hamburger Hill — which is also why the dashboard's clock has exactly two
// digit windows: 99 is the most it can ever show.
//
// Derivation: turns/notes.md, and the index's identity in pigmap/notes.md.

import { DEFAULT_TURN_SECONDS } from './game'
import { CAMPAIGN, MAP_NAMES } from './missions'

/** The campaign's turn lengths in POSITION order, straight off the table at
 * 0x4d1860. The 27th entry is real and unreachable, kept because the table is
 * the finding. */
export const TURN_SECONDS_BY_POSITION: readonly number[] = [
  99, 99, 99, 60, 60, 60, 60, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 30, 30, 30, 30, 30, 30,
  15, 30, 99
]

/**
 * Seconds by MAP NAME: the campaign order composed with the turn table. Every
 * campaign map holds exactly one position, so the pairing is a bijection; the
 * skirmish arenas are in neither table and fall back on the default — the
 * original's multiplayer takes its turn time off the FIELD CONDITIONS screen
 * instead, which is not built.
 */
const BY_MAP: Record<string, number> = Object.fromEntries(
  CAMPAIGN.map((id, position) => [MAP_NAMES[id], TURN_SECONDS_BY_POSITION[position]])
)

/** Seconds on the clock for a map, by its archive name (`CAMP`, `LIBERATE`). */
export const turnSecondsFor = (map: string): number =>
  BY_MAP[map.toUpperCase()] ?? DEFAULT_TURN_SECONDS
