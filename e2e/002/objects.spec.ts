// PHASE 002 (app) — what the map STANDS on its ground: the .POG object list,
// parsed and placed.
//
// Two halves. The pure half reads the shipped CAMP.POG through the reader
// and pins the record layout and the two conventions that were measured
// rather than read — z counts the other way, and a prop's stored y is its
// model's centre in the same elevation space the PMG's heights live in. The
// app half asks the battle scene where it actually put them.
//
// CAMP is the training ground, so it carries the tutorial's own furniture:
// dummies to shoot, crates to collect, a bridge in three pieces.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { debugState, hold, warp } from '../controller'
import { POG_RECORD_SIZE, parsePog } from '../../src/lib/formats/pog'
import type { MapObject } from '../../src/lib/formats/pog'
import { parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { propRotationY } from '../../src/renderer/src/three/props'

const mapFile = (name: string): Buffer => readFileSync(path.join(GAME_DIR, 'Maps', name))

const CAMP = parsePog(mapFile('CAMP.POG'))

test('CAMP.POG: the record layout, and z the other way up', () => {
  // Exact, not a floor: the shipped file cannot change under us.
  expect(CAMP).toHaveLength(148)
  expect(POG_RECORD_SIZE).toBe(94)
  expect(2 + CAMP.length * POG_RECORD_SIZE).toBeLessThanOrEqual(mapFile('CAMP.POG').byteLength)

  // Ids are the records' own places in the file, 1-based and in order.
  expect(CAMP.map((object) => object.id)).toEqual(CAMP.map((_, index) => index + 1))

  // The training ground's furniture, by name.
  const byName = new Map<string, MapObject[]>()
  for (const object of CAMP) byName.set(object.name, [...(byName.get(object.name) ?? []), object])
  expect(byName.get('DUMMY')).toHaveLength(11)
  expect(byName.get('CRATE1')?.length).toBeGreaterThan(0)
  expect(byName.get('IRONGATE')?.length).toBeGreaterThan(0)

  // The first record, field by field — the whole layout in one assertion.
  expect(CAMP[0]).toMatchObject({ name: 'DUMMY', id: 1, type: 436, x: -4352, y: 1600, z: 5888 })
  // Stored z is +(-5888): the file counts z DOWN where the game counts up.
  expect(CAMP[0].fields[2]).toBe(-5888)

  // `_ME` records are spawn markers, not props: they carry a pig CLASS in
  // `type` and have no model in the map's archive.
  const markers = CAMP.filter((object) => object.name.endsWith('_ME'))
  expect(markers).toHaveLength(1)
  expect(markers[0].type).toBe(0)
})

test('a prop stands on the ground it was placed over', () => {
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  // Game space is Y-down and the stored y is an elevation, so the ground
  // under an object is `-query.height`. A model's origin is its CENTRE, so
  // the gap is its own half-height and always upward — what would fail here
  // is the z sign, which throws objects to the far side of the map and puts
  // them hundreds of units under or over the ground.
  const gaps = CAMP.map((object) => object.y - -query.height(object.x, object.z))
  const near = gaps.filter((gap) => gap >= -64 && gap < 900)
  expect(near.length / gaps.length).toBeGreaterThan(0.9)

  // Mirroring z instead is the mistake worth failing on: it is invisible on
  // a symmetric map and wrong everywhere else.
  const mirrored = CAMP.map((object) => object.y - -query.height(object.x, -object.z))
  const nearMirrored = mirrored.filter((gap) => gap >= -64 && gap < 900)
  expect(near.length).toBeGreaterThan(nearMirrored.length)
})

test('the bridge is one walkway, which is what settles the yaw', () => {
  // Seven records in a line at z −7424: a ramp, deck sections 220 units
  // higher, and a ramp back down. The ramp model climbs toward its own +x,
  // so the two ramps have to point at each other — and only the negated
  // angle does that (three/props.ts).
  const run = CAMP.filter((object) => object.name.startsWith('BRID'))
  expect(run.length).toBeGreaterThanOrEqual(3)
  expect(new Set(run.map((object) => object.z))).toEqual(new Set([-7424]))

  const ramps = run.filter((object) => object.name === 'BRIDGE_S').sort((a, b) => a.x - b.x)
  expect(ramps).toHaveLength(2)
  // Which way the model's +x points once placed, in game (x, z).
  const facing = (object: MapObject): { x: number; z: number } => {
    const phi = propRotationY(object.yaw)
    return { x: Math.cos(phi), z: -Math.sin(phi) }
  }
  expect(facing(ramps[0]).x).toBeCloseTo(1, 3)
  expect(facing(ramps[1]).x).toBeCloseTo(-1, 3)
})

test('the training dummy faces the path it is shot from', () => {
  // DUMMY is a plank facing its own +x, and this one is stored at yaw 0 —
  // where the negation cannot matter and the quarter turn decides alone.
  // The green path (tile texture 40) runs up its +z side, from the crate at
  // z 8448, so the target has to look that way (three/props.ts).
  const dummy = CAMP.find((object) => object.name === 'DUMMY' && object.x === -4352)
  expect(dummy).toBeDefined()
  expect(dummy!.yaw).toBe(0)
  const phi = propRotationY(dummy!.yaw)
  expect(-Math.sin(phi)).toBeCloseTo(1, 3)

  const blocks = parsePmg(mapFile('CAMP.PMG'))
  const query = new TerrainQuery(blocks)
  const texture = (x: number, z: number): number => query.tileAddress(x, z)?.texture ?? -1
  expect(texture(dummy!.x, dummy!.z + 512)).toBe(40)
  expect(texture(dummy!.x, dummy!.z - 512)).not.toBe(40)
})

test('the battle draws the map objects where the file puts them', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  const drawn = await page.evaluate(() => window.pow!.debug!.props())
  expect(drawn.objects).toBe(148)
  // Everything but the one spawn marker, which has no geometry to draw.
  expect(drawn.placed).toBe(147)

  // Game space is Y-down, so a scene node sits at the negated elevation.
  const first = drawn.at[0]
  expect(first).toMatchObject({ name: 'DUMMY', x: -4352, y: -1600, z: 5888 })

  // Nothing is left at the origin — the failure mode when a name misses its
  // model and the record is placed anyway.
  expect(drawn.at.filter((at) => at.x === 0 && at.z === 0)).toHaveLength(0)

  expect(app.errors()).toEqual([])
})

test('a drawn object is also one to walk into', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  // The training dummy on the green path, approached from the path's side.
  // Its box is 256 across and 512 deep, so a pig of radius 320 comes to a
  // stop about 576 short of the middle of it and no nearer.
  const dummy = CAMP.find((object) => object.name === 'DUMMY' && object.x === -4352)!
  await warp(page, dummy.x, dummy.z + 1400, Math.PI)
  await hold(page, 'walkForward', 1500)

  const at = await debugState(page)
  const gap = Math.hypot(at.x - dummy.x, at.z - dummy.z)
  expect(gap).toBeGreaterThan(500)
  // It really did walk — it is not simply where it was put.
  expect(gap).toBeLessThan(1200)
  expect(app.errors()).toEqual([])
})
