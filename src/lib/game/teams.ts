// The game's six nations and the pigs that fill them — read out of
// `fetext`, not invented.
//
// The frontend text holds them as six blocks of ten from index 166: the
// side's name, then its nine pigs. TOMMY'S TROTTERS gets NOBBY, GINGER, DEN,
// MONTY, BASIL, PONSONBY, PERCY, SMITH and JONES; then GARLIC GRUNTS,
// UNCLE HAMS HOGS, PIGGYSTROIKA, SUSHI-SWINE and SOW-A-KRAUTS in the same
// shape. (fetext 25-30 name the same six for the team-select screen, and 226
// starts TEAM LARD — the developers' own side, which is not a nation.)
//
// **A marker's side bit is NOT an index into this list**, which is what this
// file used to say. It is a slot: DEVI carries sides 2 and 4 and OASIS 1 and 5,
// with no side 0 on either, and both are campaign maps. Who wears what is the
// SAVE's business — the player's own choice and the campaign's enemy schedule
// (lib/game/nations.ts, lib/game/enemies.ts) — and the map only says where the
// pigs stand.

import { NATIONS } from './nations'

/** Where the six blocks start in fetext, and how long each one is. */
const FIRST = 166
const BLOCK = 10
export { NATIONS }

export interface Team {
  name: string
  pigNames: string[]
}

/** The six nations, in the order the side bits count them. */
export function nations(strings: string[]): Team[] {
  const teams: Team[] = []
  for (let nation = 0; nation < NATIONS; nation++) {
    const at = FIRST + nation * BLOCK
    const name = strings[at]
    if (!name) break
    teams.push({
      name,
      pigNames: strings.slice(at + 1, at + BLOCK).filter((pigName) => pigName.length > 0)
    })
  }
  return teams
}
