// The proving ground's map, as data — the remake's own map (docs/facts/proving-ground.md),
// built in code, put through the rules every shipped map goes through.
//
// Its layout is ours; what is asserted here is that everything ON it obeys the
// original's rules unchanged: a crate is a crate by the crate table, every
// record exists in a one-player game and stands from the first frame, the
// sides come out the way the loader sorts them, and water, walls and slopes
// are what the tile bytes make them.

import { test, expect } from '@playwright/test'

import { existsForPlayers, parachutesIn } from '../src/lib/formats/pog'
import { TILE_WALL, TILE_WATER, TILES_PER_SIDE, TILE_STEP } from '../src/lib/formats/pmg'
import { fielded, mapSquads } from '../src/lib/game/muster'
import { mapSpawns } from '../src/lib/game/spawns'
import { pickupsOf, reached } from '../src/lib/game/pickups'
import { skillFromCrate } from '../src/lib/game/skills'
import { createScript } from '../src/lib/game/script'
import { createScenery } from '../src/lib/game/scenery'
import { vehicleKind } from '../src/lib/game/vehicles'
import { buildingKind } from '../src/lib/game/buildings'
import { TerrainQuery } from '../src/lib/game/terrain'
import {
  CRATE_SKILLS,
  DUMMIES_AT,
  PIG_AT,
  PROVING_GROUND,
  provingGroundObjects
} from '../src/lib/game/provingGround'
import {
  GROUND,
  HILL,
  OPEN_TEXTURE,
  POND,
  STRIP,
  WALL,
  WATER_TEXTURE,
  provingGroundBlocks
} from '../src/lib/game/provingTerrain'
import { MAP_NAMES } from '../src/lib/game/missions'
import type { Team } from '../src/lib/game/teams'

const objects = provingGroundObjects()
const blocks = provingGroundBlocks()
const ground = new TerrainQuery(blocks)

/** Two nations' worth of names — the squads only need SOMETHING to wear. */
const TEAMS: Team[] = [
  { name: 'OURS', pigNames: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] },
  { name: 'THEIRS', pigNames: ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'] }
]

test('one crate per skill a pig carries by itself, one round each', { tag: '@nodata' }, () => {
  const crates = pickupsOf(objects)
  // Every record that hands something over, and nothing else of the kind.
  expect(crates.length).toBe(CRATE_SKILLS.length)
  expect(objects.filter((one) => one.contents !== null).length).toBe(CRATE_SKILLS.length)
  // 1..38 and 50..59 — 39..44 are the BIG_GUN's shells, 45..49 the pillbox's
  // and the tanks' own guns, reached by getting in.
  expect(CRATE_SKILLS).toEqual([
    ...Array.from({ length: 38 }, (_, i) => i + 1),
    ...Array.from({ length: 10 }, (_, i) => i + 50)
  ])
  expect(crates.map((one) => one.skill)).toEqual(CRATE_SKILLS)
  for (const crate of objects.filter((one) => one.contents !== null)) {
    // exe: skills/notes.md, 0x4D9DC8 — the crate's byte goes through the
    // table, and it is not the identity (13 is byte 69, 55 is byte 68).
    const skill = skillFromCrate(crate.contents!.weapon!)
    expect(skill, `crate ${crate.id}`).not.toBeNull()
    expect(crate.contents!.amount, `crate ${crate.id} holds one round`).toBe(1)
  }
  expect(crates.every((one) => one.kind === 'crate' && one.amount === 1)).toBe(true)
})

test('every record exists in a one-player game and stands from the first frame', { tag: '@nodata' }, () => {
  // exe: the loader's player-count test, 0x4a58cb.
  expect(fielded(objects, 1).length).toBe(objects.length)
  expect(objects.every((one) => existsForPlayers(one, 1))).toBe(true)
  // exe: script/notes.md — opcodes 21 and 23 and a crate with a wait label
  // start off the map; none is here.
  expect(createScript(objects).waiting()).toEqual([])
  const scenery = createScenery(
    objects,
    false,
    () => {
      throw new Error('nobody acts while the map is built')
    },
    () => {},
    () => {}
  )
  expect(scenery.waiting()).toEqual([])
  expect(scenery.remaining().length).toBe(CRATE_SKILLS.length)
  // …and nobody drops in: no marker carries the parachute bit (0x4a5f11).
  expect(objects.filter(parachutesIn)).toEqual([])
  // The ids are the records' own places, as a .POG's are.
  expect(objects.map((one) => one.id)).toEqual(objects.map((_, i) => i + 1))
})

test('no standing point reaches two crates at once', { tag: '@nodata' }, () => {
  const crates = pickupsOf(objects)
  const step = 16
  const around = 400
  const doubles: string[] = []
  /** Standing points that reach a crate at all — so the search is not empty. */
  let reaching = 0
  for (const crate of crates) {
    // Only a NEIGHBOUR could share a standing point; the rest are further off.
    const near = crates.filter(
      (other) => other !== crate && Math.hypot(other.x - crate.x, other.z - crate.z) < 2 * around
    )
    for (let x = crate.x - around; x <= crate.x + around; x += step) {
      for (let z = crate.z - around; z <= crate.z + around; z += step) {
        if (!reached(crate, x, z)) continue
        reaching++
        for (const other of near) {
          if (reached(other, x, z)) doubles.push(`(${x}, ${z}) reaches ${crate.skill} and ${other.skill}`)
        }
      }
    }
  }
  expect(reaching, 'every crate is reachable from somewhere').toBeGreaterThan(crates.length * 100)
  expect(doubles).toEqual([])
})

test('a signpost stands beside every crate', { tag: '@nodata' }, () => {
  const signs = objects.filter((one) => one.name === 'SIGN')
  expect(signs.length).toBe(CRATE_SKILLS.length)
  for (const crate of pickupsOf(objects)) {
    const nearest = Math.min(...signs.map((sign) => Math.hypot(sign.x - crate.x, sign.z - crate.z)))
    expect(nearest, `the sign by skill ${crate.skill}`).toBeLessThanOrEqual(512)
  }
})

test('one of each vehicle and each emplacement', { tag: '@nodata' }, () => {
  // exe: object table 0x4D9680 entries 445..451 (lib/game/vehicles.ts).
  const vehicles = objects.filter((one) => vehicleKind(one.name) !== null).map((one) => one.name)
  expect(vehicles.sort()).toEqual(['AMLAUNCH', 'AM_TANK', 'CARRY', 'TANK'])
  // weapons/emplaced.md, weapons/artillery.md (lib/game/buildings.ts).
  const buildings = objects.filter((one) => buildingKind(one.name) !== null).map((one) => one.name)
  expect(buildings.sort()).toEqual(['BIG_GUN', 'PILLBOX'])
  // None of them carries a script command — a wreck drops nothing here.
  for (const one of objects.filter((each) => vehicleKind(each.name) !== null || buildingKind(each.name) !== null)) {
    expect(one.fields[14], one.name).toBe(0)
  }
})

test('two sides: the player first with one pig, the dummies second', { tag: '@nodata' }, () => {
  const squads = mapSquads(objects, TEAMS, [])
  expect(squads.length).toBe(2)
  expect(squads[0].spawns.length).toBe(1)
  expect(squads[0].spawns[0]).toMatchObject({ x: PIG_AT.x, z: PIG_AT.z, parachutes: false })
  expect(squads[1].spawns.map((at) => ({ x: at.x, z: at.z }))).toEqual(DUMMIES_AT)
  // The player's marker is the one carrying the scripted bit (0x4A5D2A), and
  // it looks down the strip, +x, at the dummies; they look back.
  const spawns = mapSpawns(objects)
  const mine = spawns.filter((at) => at.player)
  expect(mine.length).toBe(1)
  expect(Math.sin(mine[0].heading)).toBeCloseTo(1, 6)
  for (const dummy of spawns.filter((at) => !at.player)) expect(Math.sin(dummy.heading)).toBeCloseTo(-1, 6)
  // The dummies stand down the strip, short range to long.
  const ranges = DUMMIES_AT.map((at) => at.x - PIG_AT.x)
  expect([...ranges].sort((a, b) => a - b)).toEqual(ranges)
  expect(DUMMIES_AT.every((at) => at.z >= STRIP.z0 && at.z <= STRIP.z1)).toBe(true)
})

test('the strip is flat; water, a wall and a slope lie off to one side', { tag: '@nodata' }, () => {
  // Flat the whole length of the strip, across its whole width.
  const bumps: string[] = []
  for (let x = STRIP.x0; x <= STRIP.x1; x += 256) {
    for (const z of [STRIP.z0, 0, STRIP.z1]) {
      if (ground.height(x, z) !== -GROUND) bumps.push(`(${x}, ${z})`)
    }
  }
  expect(bumps).toEqual([])

  let water = 0
  let walls = 0
  for (const block of blocks) {
    block.tiles.forEach((tile, i) => {
      const z = block.z + Math.floor(i / TILES_PER_SIDE) * TILE_STEP
      if (tile.type & TILE_WATER) {
        water++
        // Both halves of the rule (docs/facts/water.md): the bit AND the art.
        expect(tile.texture).toBe(WATER_TEXTURE)
        expect(tile.type & 0x1f).toBe(4)
        expect(z).toBeLessThan(STRIP.z0)
      }
      if (tile.type & TILE_WALL) {
        walls++
        expect(tile.slip).toBe(0)
        expect(z + TILE_STEP).toBeLessThan(STRIP.z0)
      }
      if (!(tile.type & (TILE_WATER | TILE_WALL))) expect(tile.texture).toBe(OPEN_TEXTURE)
    })
  }
  expect(water, 'open water').toBe(((POND.x1 - POND.x0) / TILE_STEP) * ((POND.z1 - POND.z0) / TILE_STEP))
  expect(walls, 'wall tiles').toBeGreaterThan(0)
  expect(ground.walkable((WALL.x0 + WALL.x1) / 2, WALL.z0 + 64), 'a wall tile refuses a pig').toBe(false)

  // The bank: the tile beside the open water is dry ground rising out of it.
  const bankX = POND.x0 - TILE_STEP / 2
  const midZ = (POND.z0 + POND.z1) / 2
  expect(ground.height(POND.x0 + 256, midZ)).toBe(-(GROUND - 128))
  expect(ground.height(bankX, midZ)).toBeLessThan(-(GROUND - 128))
  expect(ground.height(bankX, midZ)).toBeGreaterThan(-GROUND)

  // The hill: its sides slope, its top stands above the field.
  const side = ground.normal(HILL.x0 + 1024, (HILL.z0 + HILL.z1) / 2)
  expect(Math.abs(side.x)).toBeGreaterThan(0.2)
  expect(ground.height((HILL.x0 + HILL.x1) / 2, (HILL.z0 + HILL.z1) / 2)).toBeLessThan(-GROUND)
  expect(HILL.z1).toBeLessThan(STRIP.z0)
})

test('PROVING is no shipped map', { tag: '@nodata' }, () => {
  expect(MAP_NAMES).not.toContain(PROVING_GROUND)
})
