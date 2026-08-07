// Where a map puts its pigs — read from its own .POG rather than searched
// for. Pure, like the rest of lib/game: it takes parsed records.
//
// The `*_ME` records are the spawn markers (lib/formats/pog.ts). Three
// fields of each one matter here:
//
// - `type` is the pig CLASS, and the marker's NAME is the class group it
//   belongs to: GR_ME is always 0, HV_ME is 1/2/3, ME_ME is 11/12/13,
//   SB_ME 10, SN_ME 8, SP_ME 9, CO_ME 4, SA_ME 5, LE_ME 14, AC_ME 16 —
//   the class list `gtext` holds from index 63.
// - `flags`' HIGH byte is the side, one bit each: 0x100, 0x200, 0x400,
//   0x800, 0x1000, 0x2000. Six of them, for the game's six nations. Every
//   shipped map partitions cleanly along it — the skirmish arenas into four
//   sides of five, the campaign maps into two, FINAL into all six, and the
//   training ground into one lonely marker.
// - `yaw` is a real facing: 62 markers of 772 sit at zero and the rest are
//   spread right round.

import { parachutesIn } from '../formats/pog'
import type { MapObject } from '../formats/pog'

export interface SpawnPoint {
  x: number
  z: number
  /** Facing, radians in the game's own space. */
  heading: number
  /** Side, 0..5, from the one flag bit that is set. */
  team: number
  /** Class index — Grunt 0, Gunner 1, … (gtext 63 up). */
  pigClass: number
  /** The marker's own name, e.g. `GR_ME`: the class GROUP. */
  marker: string
  /** Whether this pig DROPS IN under a canopy rather than starting on the
   * ground — flags bit 6, and on a campaign map it is the player's side
   * that carries it (lib/formats/pog.ts, lib/game/parachute.ts). */
  parachutes: boolean
}

/** A record is a spawn marker exactly when its name ends this way — and
 * those are precisely the names with no model in the map's archive. */
export const isSpawnMarker = (object: MapObject): boolean => object.name.endsWith('_ME')

/** How many sides the flags word can name. */
export const MAX_TEAMS = 6

const TEAM_SHIFT = 8

/** Which side a marker belongs to, or -1 if it names none. */
export function spawnTeam(object: MapObject): number {
  const bits = (object.flags >> TEAM_SHIFT) & ((1 << MAX_TEAMS) - 1)
  if (bits === 0) return -1
  // One bit per side, and no shipped marker sets two; the lowest wins if
  // one ever does.
  for (let team = 0; team < MAX_TEAMS; team++) if (bits & (1 << team)) return team
  return -1
}

/** Every spawn marker on a map, in file order. */
export function mapSpawns(objects: MapObject[]): SpawnPoint[] {
  const spawns: SpawnPoint[] = []
  for (const object of objects) {
    if (!isSpawnMarker(object)) continue
    const team = spawnTeam(object)
    if (team < 0) continue
    spawns.push({
      x: object.x,
      z: object.z,
      // Half a turn on from the marker's yaw, and the half turn belongs to
      // the MARKER — that is settled, not open.
      //
      // The derivation says it should be `yaw` outright: a marker is a POG
      // record, the engine turns every record by one yaw about the vertical
      // (exe 0x4a5bd5 pushes field 5 and no other angle), so a marker asks
      // for `yaw - π/2` like any prop — the turn CAMP's iron gate settled —
      // and a pig's mesh is turned `heading + PIG_HEADING_OFFSET`, which is
      // `heading - π/2`. Same rule, so heading = yaw. Tried; the pig spawns
      // facing backwards.
      //
      // So one of the two is half a turn out, and PLAY separates them: a
      // driven pig walks the way it is facing, which is exactly what
      // `PIG_HEADING_OFFSET` aims. The offset is right. Nothing but the
      // pig's starting position and facing was ever in question, and a
      // marker's stored yaw simply does not mean what a prop's does.
      heading: object.yaw + Math.PI,
      team,
      pigClass: object.type,
      marker: object.name,
      parachutes: parachutesIn(object)
    })
  }
  return spawns
}

/**
 * The map's spawns grouped by side, sides with no markers dropped, each
 * side keeping the file's order. A map that names no sides comes back
 * empty, and the caller falls back to picking ground itself.
 */
/**
 * The sides to field, at most `most` of them: whatever the map has, in bit
 * order, and nothing else. A map with no markers comes back empty and is
 * not a map anything can be played on.
 *
 * There is no filling in. CAMP fields ONE side of ONE pig because that is
 * what the training ground is, and a fabricated opponent would be a lie
 * about the map.
 */
export function battleSides(objects: MapObject[], most: number): SpawnPoint[][] {
  return spawnTeams(objects).slice(0, most)
}

export function spawnTeams(objects: MapObject[]): SpawnPoint[][] {
  const teams = new Map<number, SpawnPoint[]>()
  for (const spawn of mapSpawns(objects)) {
    teams.set(spawn.team, [...(teams.get(spawn.team) ?? []), spawn])
  }
  return [...teams.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list)
}
