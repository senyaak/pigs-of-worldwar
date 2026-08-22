// WHEN A MISSION IS OVER, and the beat that shows it — the exe's mode 2,
// "END OF GAME MODE".
//
// Play: "убить последний манекен — не заканчивает миссию… очевидно что
// заканчивает миссию." Nothing in the remake ended a training level at all:
// `game.over` is "nobody is left" over the SQUADS, and the training ground
// fields one pig and no enemy, so it could never be true.
//
// **Nothing watches for a win frame by frame.** `Game::NextTurn` (0x48F490) asks
// ONE function what the state of the game is and dispatches on the answer, so a
// mission ends at the moment a turn would have been handed on and never before —
// the last dummy comes apart, its crate lands, the turn ends, and the sergeant
// speaks into the beat after it. That timing is the original's and it is worth
// keeping: it is what gives the blow room to play out.
//
// That function is **0x4966A0**, and it returns 0 (carry on), 1 (a score limit
// reached — not modelled), 2 (over, and not won) or 3 (won). Its two halves:
//
//  - **a TRAINING level** (`[game+0x329]`) walks the whole object list at
//    `[0x537FBC]` for a breakable — body type 0x135A — whose `[obj+0x84]` is
//    `0x43..0x47` or `0x4B`, and the win is finding none. There is no other way
//    for one to end, and NO WAY TO LOSE: the training ground floors a pig at one
//    point (lib/game/health.ts), so the only answer it can give is 0 or 3;
//  - **anything else** counts sides: `[+0x348] == 1` with `[+0x34C]` empty is the
//    win, both empty is 2, and one side left holding the field with the other at
//    one is 2 as well.
//
// `[obj+0x84]` is the object name table's index **minus 0x1C** — the same
// subtraction the breakable health table takes (`lea eax,[edi-1Ch]` at 0x48D070,
// stored at 0x48D076) — which is what pins the six kinds to names, below.
//
// Pure: no formats past a record's name, no scene, no clock but the one it is
// handed.

import type { MapObject } from '../formats/pog'

/**
 * The models whose loss ENDS a training mission — kinds 0x43..0x47 and 0x4B of
 * the test above, resolved through the name table (`tutorial/notes.md`).
 *
 * The three STANDS the targets are mounted on — `T_SUP`, `T_SUP2`, `T_SUP3`, the
 * kinds 0x48..0x4A the test steps over — are deliberately not here, though they
 * share the same one-point health row. You finish the mission by knocking down
 * the targets, not their furniture.
 */
export const MISSION_TARGETS = ['TARGET', 'TARGET2', 'TARGET3', 'TARGET4', 'TARGET5', 'DUMMY']

/**
 * Which of a map's records the mission is measured by. CAMP carries eleven
 * DUMMY records and none of the TARGET family, so on the shipped training
 * ground it is exactly the dummies.
 *
 * Every one of them, including the eight the map SCRIPT holds back (field-14 =
 * 23, lib/game/script.ts): the exe's test never looks at `[obj+0x30]`, the
 * placed flag, so a dummy that has not arrived yet still counts as standing —
 * which is the only reason the mission cannot end on the first frame.
 */
export function missionTargetIds(objects: MapObject[]): Set<number> {
  const out = new Set<number>()
  for (const object of objects) {
    if (MISSION_TARGETS.includes(object.name.toUpperCase())) out.add(object.id)
  }
  return out
}

/** What 0x4966A0 answers, in the terms this engine has. */
export type Outcome = 'playing' | 'won' | 'lost'

/**
 * The state of the game, asked at the handover.
 *
 * The exe's two counters ARE "the player's" and "the computer's" — `[+0x348]`
 * still 1 with `[+0x34C]` empty is the win, and every arm with our side empty
 * is 2, the both-empty case included. So losing the whole squad is a LOSS even
 * when it took the enemy down with it, and `ownStanding` is the campaign's own
 * side — index 0 of the battle's players, which `spawnTeams` orders first off
 * the map's player bit (lib/game/spawns.ts, record `+0x58`).
 *
 * `othersStanding` is how many of the OTHER sides still have somebody.
 */
export function outcomeOf(
  training: boolean,
  ownStanding: boolean,
  othersStanding: number,
  targetsLeft: number
): Outcome {
  if (training) return targetsLeft > 0 ? 'playing' : 'won'
  if (!ownStanding) return 'lost'
  return othersStanding === 0 ? 'won' : 'playing'
}

/**
 * The camera moves to the next survivor every TWO seconds — `[game+0x4BC]` is
 * stamped forward by exactly 0xC8 each time (0x490EFF) rather than reset, so the
 * tour keeps the beat however long a frame took.
 */
export const TOUR_SECONDS = 2

/**
 * Three seconds before a key is worth anything (`cmp eax,12Ch`, 0x490FB4) — and
 * twenty before it leaves on its own (`[game+0x47C]` = 1998 hundredths, the same
 * block of timeouts the start-of-turn beat's ten seconds comes out of).
 */
export const HOLD_SECONDS = 3
export const LEAVE_SECONDS = 19.98

export interface EndOfGame {
  /** Whether the mission was WON — what decides whether the sergeant has
   * anything to say (lib/game/tutorial.ts). */
  readonly won: boolean
  /** The pig the camera is on. */
  watching: number
  /** Seconds since the mission ended. */
  elapsed: number
  /** …and since the tour last moved. */
  sinceTour: number
  /** How many survivors the tour has shown. It goes round the list ONCE and
   * stops looking — the exe's own single wrap (`bl` guards it, 0x490EFF) —
   * where this used to cycle forever. */
  visited: number
}

/**
 * `survivors` is who is worth watching, in the list's own order — alive and not
 * shut inside a building, which is the exe's own pair of skips (`[pig+0x2EC]` of
 * 1 or 8, 0x490F46). An empty list is allowed: everybody being dead is one of the
 * ways a battle ends.
 */
export function beginEndOfGame(won: boolean, survivors: number[]): EndOfGame {
  return {
    won,
    watching: survivors[0] ?? -1,
    elapsed: 0,
    sinceTour: 0,
    visited: Math.min(1, survivors.length)
  }
}

/**
 * One frame of it. True when the beat is over and whoever is presenting the
 * battle should put it away — the exe goes to mode 18, QUIT, which every other
 * part of it reads as "not playing any more" (`turns/notes.md`).
 *
 * `pressed` is any input at all, the same "press any key" the beat at the top of
 * a turn takes (lib/game/controls.ts, `wakes`) — and it does nothing for the
 * first three seconds, so a finger still on the fire button that broke the last
 * dummy cannot skip the ending it earned.
 */
export function advanceEndOfGame(
  state: EndOfGame,
  delta: number,
  survivors: number[],
  pressed: boolean
): boolean {
  state.elapsed += delta
  state.sinceTour += delta
  while (state.sinceTour >= TOUR_SECONDS && state.visited < survivors.length) {
    state.sinceTour -= TOUR_SECONDS
    const at = survivors.indexOf(state.watching)
    state.watching = survivors[(at + 1) % survivors.length]
    state.visited++
  }
  if (state.elapsed < HOLD_SECONDS) return false
  return pressed || state.elapsed >= LEAVE_SECONDS
}
