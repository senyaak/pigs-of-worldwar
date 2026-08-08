// The MULTI-PLAYER screen — the original's own, read out of fetext rather
// than designed: MULTI-PLAYER (59) over TEAM A..D (60-63), NETWORK (65),
// FIELD CONDITIONS (66) and DONE (64), with each team slot reading PLAYER,
// CPU or OFF (330-332). The ceiling is four, which the game says itself:
// "IN THE FULL VERSION OF THE GAME YOU WILL BE ABLE TO PLAY WITH UP TO 4
// HUMAN OR COMPUTER PLAYERS" (782).
//
// It is the same machine the main menu rides on — see `barScreen.ts`, which
// owns everything about how it looks.
//
// THREE of the seven bars are dark, and each is waiting on something real:
//
// - a TEAM SLOT cannot be moved yet. CPU wants an AI, and there is none; and
//   C and D want a battle that fields more than two sides, which it does not
//   ("Two sides, though a map offers up to six" — the map's markers name six,
//   the scene takes the first two because nothing drives the rest). So the
//   four slots show the truth — two players, two empty — and refuse to be
//   changed. Delete this paragraph and `SLOTS` becomes editable.
// - NETWORK is the sub-screen the strings already name — NETWORK: CONNECT,
//   GAMES, PLAYERS, HOSTING NEW GAME, CHOOSE ARMY (155-163), with ENTER
//   TARGET IP ADDRESS and - HOST GAME - under it (460-461). It waits on a
//   transport.
// - FIELD CONDITIONS is its own screen too (276-320: LANDMASS, THEME, MINES,
//   HEIGHT, VEHICLES, MIRRORED, SKY, PICK-UPS, PIGS, TURN TIME, DEATHMATCH
//   LIMIT, HEALTH, SUDDEN DEATH), and every one of those is a rule the battle
//   does not have a knob for yet.
//
// DONE is live, and it is the rung under all of it: two people on one
// keyboard, taking turns, which is what the battle already does — the turn
// rotates between the two squads a two-sided map fields.

import { byId } from './dom'
import { feText, initBarScreen } from './barScreen'
import type { Bar, BarScreen } from './barScreen'

/** fetext indices: the title, the four slots, then the three actions. */
const TITLE_TEXT = 59
const TEAM_TEXT = [60, 61, 62, 63]
const NETWORK_TEXT = 65
const CONDITIONS_TEXT = 66
const DONE_TEXT = 64

/** What a slot can say — the original's own three words. */
const SLOT_TEXT = { player: 330, cpu: 331, off: 332 } as const
type Slot = keyof typeof SLOT_TEXT

/**
 * How the four slots stand. Two players and two empty, because that is what
 * the battle can field — see the header. Not a default a player may move away
 * from yet; it is the only arrangement there is.
 */
const SLOTS: Slot[] = ['player', 'player', 'off', 'off']

/**
 * Which map DONE opens.
 *
 * The original goes to MULTI-PLAYER SELECT LEVEL (105) from here — SURVIVAL
 * and DEATH MATCH over its own list of arena names (720-744) — and that
 * screen is not built, so there is nowhere to choose from. LIBERATE is picked
 * because it is a shipped map that fields two real squads: a saboteur, a hero
 * and three grunts against four spies and a gunner, off its own spawn
 * markers. The training ground the ONE PLAYER bar opens carries one side of
 * one pig and so cannot be taken in turns.
 */
const DEFAULT_MAP = 'LIBERATE'

export type MultiPlayerScreen = BarScreen

export function initMultiPlayer(handlers: {
  /** Start the battle on a map. */
  onStart: (map: string) => void
  /** Back to the main menu. */
  onBack: () => void
}): MultiPlayerScreen {
  const teamBar = (index: number): Bar => ({
    label: () => feText(TEAM_TEXT[index]).trim(),
    value: () => feText(SLOT_TEXT[SLOTS[index]]),
    // Dark, and the header says what each is waiting on.
    enabled: () => false
  })

  return initBarScreen({
    canvas: byId<HTMLCanvasElement>('mp-screen'),
    title: () => feText(TITLE_TEXT),
    onBack: handlers.onBack,
    bars: [
      teamBar(0),
      teamBar(1),
      teamBar(2),
      teamBar(3),
      { label: () => feText(NETWORK_TEXT), enabled: () => false },
      { label: () => feText(CONDITIONS_TEXT), enabled: () => false },
      {
        label: () => feText(DONE_TEXT),
        enabled: () => true,
        choose: () => handlers.onStart(DEFAULT_MAP)
      }
    ]
  })
}
