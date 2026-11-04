// THE PROVING GROUND — one map to test every weapon and machine on.
//
// `[play]`, 2026-11-02 (docs/todo/proving-ground.md): a straight flat strip,
// the player's pig at its head, real enemy pigs standing down it as dummies, a
// row of crates in front of the pig with a signpost by each, vehicles to get
// into, the two emplacements, and a little relief off to one side.
//
// **Its LAYOUT is the remake's own; everything that HAPPENS on it is the
// original's.** The records built here go through the same `fielded` →
// `mapSquads` → `musterGame` → `createEngine` path as a shipped map's, and each
// one is a copy of a shipped record of the same model (lib/game/provingSources.ts)
// — so a crate here is a crate by the same rules as CAMP's, and a tank a tank by
// OASIS's.
//
// Pure: no file is read and nothing is written into the install.

import { FIELD_COUNT, objectFromFields } from '../formats/pog'
import type { MapObject } from '../formats/pog'
import { skillFromCrate } from './skills'
import {
  COMMAND_FIELDS,
  CRATE_SOURCE,
  MARKER_SOURCE,
  MOUNT_SOURCES,
  SIGN_SOURCE
} from './provingSources'
import type { SourceRecord } from './provingSources'
import { provingElevation } from './provingTerrain'

/** The map's name, as ONE PLAYER's third bar opens it (ui/onePlayer.ts) and the
 * console map selector takes it (`pow.swapMap('PROVING')`, ui/battle.ts) — no
 * shipped map is called this. */
export const PROVING_GROUND = 'PROVING'

/** Whether a map name is the proving ground, however it was spelled — what a
 * rule that is this map's alone asks (lib/game/engine.ts). */
export const isProvingGround = (map: string): boolean => map.toUpperCase() === PROVING_GROUND

/**
 * Every skill a pig carries BY ITSELF, one crate each: 1..38 and 50..59.
 *
 * The eleven between are not a pig's to carry: 39..44 are the BIG_GUN's
 * shells (`weapons/artillery.md`) and 45..49 the pillbox's and the tank's own
 * guns (`weapons/emplaced.md`, lib/game/vehicles.ts) — tested by getting in.
 */
export const CRATE_SKILLS: readonly number[] = [
  ...Array.from({ length: 38 }, (_, i) => i + 1),
  ...Array.from({ length: 10 }, (_, i) => i + 50)
]

/**
 * The byte a crate stores to hand over this skill — the inverse of the
 * crate table at 0x4D9DC8 (lib/game/skills.ts, `skillFromCrate`), which is
 * not the identity: 13 SUPER SHOTGUN is byte 69 and 55 HIDE is byte 68.
 */
export function crateByteFor(skill: number): number {
  for (let byte = 0; byte < 0xff; byte++) if (skillFromCrate(byte) === skill) return byte
  throw new Error(`no crate byte hands over skill ${skill}`)
}

/** Field 14's tag on a record that hands something over (lib/formats/pog.ts). */
const CARRIES = 19
/** One round of its skill — the work list's own rule. */
export const CRATE_ROUNDS = 1

/** A stored yaw, in the file's 4096ths of a turn. */
const TURN = 4096
/** A marker's facing is half a turn on from its yaw (lib/game/spawns.ts), so
 * a pig facing +x (heading π/2) stands on a marker of yaw 3072, and one facing
 * −x on 1024. */
const FACING_PLUS_X = (3 * TURN) / 4
const FACING_MINUS_X = TURN / 4

/** The player's one pig, at the head of the strip, looking down it (+x). */
export const PIG_AT = { x: -1536, z: 0 }

/**
 * The dummies, down the strip from short range to long, and every one near
 * the middle of the map: an air strike or an airlift aimed at any of them
 * starts its approach 16384 units back towards the pig (0x470430,
 * `objects/airship.md`), which from x ≥ 1024 is still inside the ±15871 the
 * airship is kept within.
 */
export const DUMMIES_AT: readonly { x: number; z: number }[] = [1024, 2560, 4608, 7168].map((x) => ({
  x,
  z: 0
}))

/**
 * The crate row: across the strip, one stride in front of the pig, with a gap
 * where the strip runs so nothing stands in the line of fire. A crate's box is
 * 192×256 and a pig reaches 85 past its own centre (lib/game/pickups.ts,
 * `reached`), so 512 between crates is more than any one standing point can
 * span — walking the row takes them one at a time.
 *
 * The signposts stand at the same pitch, and that is what sets it: at
 * `SIGN_YAW` a sign's box lies 256 along the row (lib/game/obstacles.ts,
 * `boxOf`), which leaves 256 between two of them, room for the pig's 170 across
 * (`PIG_RADIUS`) and for the drawn pig's 182 to 195. At 400 they stood 144
 * apart, and the row was a fence.
 */
export const CRATE_ROW_X = -768
export const CRATE_PITCH = 512
/** The first crate either side of the strip's middle. */
export const CRATE_GAP = 768
/** A crate's signpost stands this far beyond it, on the dummies' side. */
export const SIGN_OFFSET = 384
/**
 * A signpost's stored yaw: the one that leaves the model as it was modelled
 * (`modelRotationY`, lib/formats/pog.ts, is `yaw − π/2`). Its boards then look
 * along ±x, across the crates at the side the pig walks along, where the record
 * it is copied from looks along ±z and would show the pig its edge.
 */
export const SIGN_YAW = TURN / 4

/** Where the n-th crate of the row stands — skill order, from +z across to −z. */
export function crateAt(index: number): { x: number; z: number } {
  const half = CRATE_SKILLS.length / 2
  const z = index < half ? CRATE_GAP + (half - 1 - index) * CRATE_PITCH : -(CRATE_GAP + (index - half) * CRATE_PITCH)
  return { x: CRATE_ROW_X, z }
}

/** The vehicles beside the strip, far enough apart that each is entered on
 * its own, and the two emplacements behind them. */
export const MOUNTS_AT: Readonly<Record<string, { x: number; z: number }>> = {
  TANK: { x: 1536, z: 2048 },
  AM_TANK: { x: 3584, z: 2048 },
  CARRY: { x: 5632, z: 2048 },
  AMLAUNCH: { x: 7680, z: 2048 },
  PILLBOX: { x: 2048, z: 4608 },
  BIG_GUN: { x: 5632, z: 4608 }
}

/** The side bits of the flags' high byte (lib/game/spawns.ts). */
const SIDE_PLAYER = 0x100
const SIDE_DUMMIES = 0x200
/** Placed, and in games of one to four players (`existsForPlayers`, 0x4a58cb). */
const EVERY_GAME = 0x3f
/** The record field whose bit 0 marks the player's own side (0x4A5D2A). */
const SCRIPTED_FIELD = 28

/** A copy of `source` standing at (x, z) with this id and yaw, on its own
 * centre above the ground there. */
function placed(
  source: SourceRecord,
  id: number,
  x: number,
  z: number,
  yaw: number,
  edit: (fields: Int16Array) => void = () => {}
): MapObject {
  const fields = new Int16Array(FIELD_COUNT)
  fields.set(source.fields)
  fields[0] = x
  fields[1] = provingElevation(x, z) + source.rise
  fields[2] = z
  fields[3] = id
  fields[5] = yaw
  edit(fields)
  return objectFromFields(source.name, fields)
}

/** Take the record's script command off it: no wait, no signal, no drop. */
const commandless = (fields: Int16Array): void => {
  for (const field of COMMAND_FIELDS) fields[field] = 0
}

/** A signpost and the skill of the crate beside it. The pairing is the proving
 * ground's and lives here rather than on the record, where a kind-19 SIGN would
 * be a pickup (lib/formats/pog.ts). */
export interface ProvingSign {
  id: MapObject['id']
  skill: (typeof CRATE_SKILLS)[number]
}

/**
 * Everything the proving ground places, as POG records, ids from 1, and which
 * signpost stands for which skill.
 *
 * Nothing is held back and nothing drops in: no record carries a script
 * command (a crate's kind tag is its CONTENTS, and with no wait label it is on
 * the ground from the first frame — lib/game/script.ts), and the markers carry
 * no parachute bit.
 */
function layOut(): { objects: MapObject[]; signs: ProvingSign[] } {
  const objects: MapObject[] = []
  const signs: ProvingSign[] = []
  const next = (): number => objects.length + 1

  // The two sides' markers: the player's pig first, carrying the scripted bit
  // that puts its side first (`battleSides`), then the dummies on a side of
  // their own.
  objects.push(
    placed(MARKER_SOURCE, next(), PIG_AT.x, PIG_AT.z, FACING_PLUS_X, (fields) => {
      fields[13] = SIDE_PLAYER | EVERY_GAME
      fields[SCRIPTED_FIELD] = 1
    })
  )
  for (const at of DUMMIES_AT) {
    objects.push(
      placed(MARKER_SOURCE, next(), at.x, at.z, FACING_MINUS_X, (fields) => {
        fields[13] = SIDE_DUMMIES | EVERY_GAME
        fields[SCRIPTED_FIELD] = 0
      })
    )
  }

  // The crates, one round of one skill each, and a signpost by every one.
  CRATE_SKILLS.forEach((skill, index) => {
    const at = crateAt(index)
    objects.push(
      placed(CRATE_SOURCE, next(), at.x, at.z, 0, (fields) => {
        fields[14] = CARRIES
        // High byte the contents, low byte the wait label — none.
        fields[15] = crateByteFor(skill) << 8
        fields[16] = CRATE_ROUNDS
      })
    )
    signs.push({ id: next(), skill })
    objects.push(placed(SIGN_SOURCE, next(), at.x + SIGN_OFFSET, at.z, SIGN_YAW, commandless))
  })

  // The vehicles and the emplacements.
  for (const source of MOUNT_SOURCES) {
    const at = MOUNTS_AT[source.name]
    objects.push(placed(source, next(), at.x, at.z, 0, commandless))
  }
  return { objects, signs }
}

export const provingGroundObjects = (): MapObject[] => layOut().objects

export const provingGroundSigns = (): ProvingSign[] => layOut().signs
