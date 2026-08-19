// Who a map fields: which sides play, whose names they wear, and where each
// pig is standing before the first frame runs.
//
// This was in `ui/battle.ts` — the dashboard deciding how many sides a battle
// has, which nation each one is, how many pigs it fields and what a pig's
// starting height is. None of that is a picture. It is here so that the same
// squads come out whoever is asking: the app that draws them, and a battle
// stepped with nothing drawing at all.
//
// Game space (Y-down) throughout.

import { Game } from './game'
import type { PigSpawn } from './game'
import { battleSides } from './spawns'
import type { Team } from './teams'
import { turnSecondsFor } from './turns'
import { restingY } from './locomotion'
import { existsForPlayers } from '../formats/pog'
import type { MapObject } from '../formats/pog'
import type { TerrainQuery } from './terrain'
import type { BodyExtent } from './body'

/**
 * How many sides a battle fields. The markers name up to six (FINAL uses all
 * of them), but there is no AI for the rest, so two play: the CAMPAIGN'S OWN
 * side and the first other one the map carries (lib/game/spawns.ts orders them
 * that way).
 */
export const SIDES_FIELDED = 2

export interface Squad {
  name: string
  pigNames: string[]
  /** Which nation this side wears — 0..6, the index `lib/game/nations.ts`
   * turns into a skin. The MAP does not decide it: the player's is the one
   * chosen at SELECT TEAM and the enemy's is the campaign's own schedule. */
  nation: number
  spawns: PigSpawn[]
}

/**
 * How many PLAYERS the game has — **which is not how many sides it fields**,
 * and confusing the two dropped a whole campaign map's own squad.
 *
 * The campaign is one player against the computer, so it is 1. The number
 * beside it, `SIDES_FIELDED`, is 2 because two squads stand on the map; the
 * exe's own record filter asks the first question and never the second.
 */
export const PLAYERS = 1

/**
 * The records this many players actually get.
 *
 * A map does not place the same things in every game: the low byte of a
 * record's flags says which player counts it exists in. BOOM is the map that
 * shows it — one-player snipers and multiplayer grunts on the very same spots
 * (lib/formats/pog.ts).
 *
 * **ROAD is the map that proves the count has to be 1.** Measured over its
 * POG: its five scripted markers — the player's own side — carry low byte
 * 0x71, whose only player bit is the first, so asking for two players drops
 * every one of them. What was left was the enemy's two four-player markers,
 * and since no surviving side carried the scripted bit they were promoted to
 * OUR squad: mission 2 opened as a lone pair of pigs with nobody to fight. At
 * one player the same map fields 5 against 3, which is a mission. ROAD and
 * BOOM are the only two of the 59 that read differently either way.
 */
export function fielded(objects: MapObject[], players: number = PLAYERS): MapObject[] {
  return objects.filter((object) => existsForPlayers(object, players))
}

/**
 * The squads for a map, and ONLY what the map has: one side per set of spawn
 * markers, each pig standing on the marker that named its class.
 *
 * A skirmish arena fields four sides of five and a campaign map two, of which
 * the first two are taken. CAMP fields one side of one pig, because the
 * training ground is one pig — there is no filling in, and a map that carries
 * no markers cannot be played, which is the empty list.
 */
export function mapSquads(objects: MapObject[], teams: Team[], nations: readonly number[]): Squad[] {
  return battleSides(objects, SIDES_FIELDED).map((side, index) => {
    // Which NATION fields this side is handed in, campaign side first — the
    // map only says where the pigs stand. A nation past the six playable ones
    // (Team Lard, the last mission) has no `fetext` block, so the names fall
    // back on the side's own order.
    const nation = nations[index] ?? index
    const team = teams[nation] ?? teams[index] ?? teams[0]
    const pigs = side.slice(0, team.pigNames.length)
    return {
      name: team.name,
      nation,
      pigNames: team.pigNames.slice(0, pigs.length),
      spawns: pigs.map((at) => ({
        x: at.x,
        z: at.z,
        heading: at.heading,
        pigClass: at.pigClass,
        parachutes: at.parachutes
      }))
    }
  })
}

export interface MusterParts {
  squads: Squad[]
  /** Which map this is: a turn's length is the LEVEL's, not a constant — 99
   * seconds on the training ground (lib/game/turns.ts). */
  map: string
  ground: TerrainQuery
  /**
   * How big a pig of this class is, measured off its own art
   * (lib/game/body.ts).
   *
   * Passed in because the measurement comes from the MODEL, and which models an
   * install has is not the rules' business — but the number is: every blow asks
   * how tall a pig is, and it used to ask the mesh.
   */
  bodyOf: (pigClass: number) => BodyExtent
}

/**
 * The battle's own state, ready to be stepped.
 *
 * A pig arrives KNOWING where it stands and how big it is: its soles on the
 * ground its marker sits on, and its body off its art.
 */
export function musterGame(parts: MusterParts): Game {
  const { squads, map, ground, bodyOf } = parts
  return new Game({
    players: squads.map((squad) => ({
      name: squad.name,
      nation: squad.nation,
      pigNames: squad.pigNames
    })),
    spawns: squads.flatMap((squad) =>
      squad.spawns.map((at) => ({
        ...at,
        y: restingY(ground, at.x, at.z),
        body: bodyOf(at.pigClass ?? 0)
      }))
    ),
    turnSeconds: turnSecondsFor(map)
  })
}
