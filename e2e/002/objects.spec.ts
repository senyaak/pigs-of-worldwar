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
import { startGame } from '../menu'
import { BOX_UNIT, POG_RECORD_SIZE, modelRotationY, parsePog } from '../../src/lib/formats/pog'
import type { MapObject } from '../../src/lib/formats/pog'
import { parsePmg } from '../../src/lib/formats/pmg'
import { HEIGHT_SCALE, TerrainQuery } from '../../src/lib/game/terrain'
import { ObstacleField, PIG_RADIUS } from '../../src/lib/game/obstacles'
import { WALL_CLIMB } from '../../src/lib/game/locomotion'


const mapFile = (name: string): Buffer => readFileSync(path.join(GAME_DIR, 'Maps', name))

const CAMP = parsePog(mapFile('CAMP.POG'))

test('CAMP.POG: the record layout, and z exactly as stored', () => {
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
  expect(CAMP[0]).toMatchObject({ name: 'DUMMY', id: 1, type: 436, x: -4352, y: 1600, z: -5888 })
  // The stored z is the world's, untouched — the negation this once carried
  // was the map being mirrored (lib/formats/pmg.ts, TerrainBlock.z).
  expect(CAMP[0].fields[2]).toBe(-5888)

  // A crate says what is in it: a weapon and a count, or a health pack —
  // the health ones storing −256 where the weapon goes. That is also what
  // separates a crate to collect from a crate to walk round.
  const crates = CAMP.filter((object) => object.name.startsWith('CRATE'))
  expect(crates.length).toBeGreaterThan(0)
  expect(crates.every((crate) => crate.contents !== null)).toBe(true)
  const health = crates.filter((crate) => crate.contents?.weapon === null)
  expect(health.length).toBeGreaterThan(0)
  expect(health.every((crate) => crate.contents!.amount > 0)).toBe(true)
  // The rest name a weapon out of the game's own list, and how many.
  const armed = crates.filter((crate) => crate.contents?.weapon !== null)
  expect(armed.length).toBeGreaterThan(0)
  expect(armed.every((crate) => crate.contents!.weapon! > 0 && crate.contents!.amount > 0)).toBe(true)

  // `_ME` records are spawn markers, not props: they carry a pig CLASS in
  // `type` and have no model in the map's archive.
  const markers = CAMP.filter((object) => object.name.endsWith('_ME'))
  expect(markers).toHaveLength(1)
  expect(markers[0].type).toBe(0)
})

test('a prop stands on the ground it was placed over', () => {
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  // Game space is Y-down and the stored y is an elevation in the PMG's own
  // height space — so it rides HEIGHT_SCALE, exactly as the ground does, and
  // the two must be compared in the same space (measured: mean |y - ground|
  // of 685 with the scale against 1994 without it, over all 6322 records).
  // A model's origin is its CENTRE, so the gap is its own half-height and
  // always upward — what would fail here is the z sign, which throws objects
  // to the far side of the map and puts them under or over the ground.
  const above = (object: MapObject, z: number): number =>
    object.y * HEIGHT_SCALE - -query.height(object.x, z)
  const near = (gaps: number[]): number[] =>
    gaps.filter((gap) => gap >= -64 * HEIGHT_SCALE && gap < 900 * HEIGHT_SCALE)
  const gaps = CAMP.map((object) => above(object, object.z))
  expect(near(gaps).length / gaps.length).toBeGreaterThan(0.9)

  // Mirroring z instead is the mistake worth failing on: it is invisible on
  // a symmetric map and wrong everywhere else.
  const mirrored = CAMP.map((object) => above(object, -object.z))
  expect(near(gaps).length).toBeGreaterThan(near(mirrored).length)
})

test('the bridge is one walkway, which is what settles the yaw', () => {
  // Seven records in a line at z 7424: an abutment, deck sections 220
  // units higher, and an abutment back down. BRIDGE_S is solid at its own
  // −x end and thins to a deck at its +x end, so the two of them have to
  // face each other across the span. The span lies along x, which a mirror
  // in z leaves alone, so this reads the same either way round — what it
  // pins is the quarter turn (lib/formats/pog.ts).
  const run = CAMP.filter((object) => object.name.startsWith('BRID'))
  expect(run.length).toBeGreaterThanOrEqual(3)
  expect(new Set(run.map((object) => object.z))).toEqual(new Set([7424]))

  const ramps = run.filter((object) => object.name === 'BRIDGE_S').sort((a, b) => a.x - b.x)
  expect(ramps).toHaveLength(2)
  // Which way the model's +x points once placed, in game (x, z).
  const facing = (object: MapObject): { x: number; z: number } => {
    const phi = modelRotationY(object.yaw)
    return { x: Math.cos(phi), z: -Math.sin(phi) }
  }
  expect(facing(ramps[0]).x).toBeCloseTo(-1, 3)
  expect(facing(ramps[1]).x).toBeCloseTo(1, 3)
})

test('the training dummy faces the path it is shot from', () => {
  // DUMMY is a plank facing its own +x, and this one is stored at yaw 0 —
  // where the sign cannot matter. It is NOT evidence for the quarter turn
  // any more: after the map was un-mirrored this was recalculated from the
  // mirror hypothesis rather than re-measured, and CAMP's iron gate — two
  // records of one model, which a sign cannot move — then put the turn half
  // a circle the other way (lib/formats/pog.ts). So the spec now records
  // where the dummy ACTUALLY looks under the rule the gate settled, and the
  // pairing with the path is the open question, not the assertion.
  const dummy = CAMP.find((object) => object.name === 'DUMMY' && object.x === -4352)
  expect(dummy).toBeDefined()
  expect(dummy!.yaw).toBe(0)
  const phi = modelRotationY(dummy!.yaw)
  // Game-space facing of the model's own +x: (cos φ, −sin φ).
  expect(-Math.sin(phi)).toBeCloseTo(1, 3)

  const blocks = parsePmg(mapFile('CAMP.PMG'))
  const query = new TerrainQuery(blocks)
  const texture = (x: number, z: number): number => query.tileAddress(x, z)?.texture ?? -1
  // The path is on its -z side; the dummy under the gate's rule faces +z.
  expect(texture(dummy!.x, dummy!.z - 512)).toBe(40)
})

test('the collision box is turned the way the art is', () => {
  // Found in play, not in a test: a wall you cannot see, a stride away from
  // the gate and from the barbed wire that own it. The box was being turned
  // by the RAW yaw while the model was turned by the converted one, so
  // every asymmetric object had its collider lying across its own art.
  const field = new ObstacleField(CAMP)
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const centre = (col: number, row: number): { x: number; z: number } => ({
    x: -16384 + col * 512 + 256,
    z: -16384 + row * 512 + 256
  })
  for (const [col, row] of [
    [13, 52],
    [42, 51]
  ]) {
    const { x, z } = centre(col, row)
    expect(field.blocks(x, z, query.height(x, z), WALL_CLIMB), `tile ${col},${row}`).toBe(false)
  }

  // The positive half: the gate is 1280 along its own +z and 192 across, so
  // it blocks a long way down the line its art lies on and nowhere near
  // that far across it.
  const gate = CAMP.find((object) => object.name === 'IRONGATE')!
  const phi = modelRotationY(gate.yaw)
  const along = { x: Math.sin(phi), z: Math.cos(phi) }
  const across = { x: Math.cos(phi), z: -Math.sin(phi) }
  const at = (dir: { x: number; z: number }, distance: number): boolean => {
    const x = gate.x + dir.x * distance
    const z = gate.z + dir.z * distance
    return field.blocks(x, z, query.height(x, z), WALL_CLIMB)
  }
  // 500, not 1000: the box unit is 64 world units, not 128 (formats/pog.ts),
  // so the gate's 20-count length is 1280 and reaches 640 either way.
  expect(at(along, 500), 'along the gate').toBe(true)
  expect(at(across, 500), 'across the gate').toBe(false)
})

test('the battle draws the map objects where the file puts them', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const drawn = await page.evaluate(() => window.pow!.debug!.props())
  expect(drawn.objects).toBe(148)
  // Everything but the one spawn marker, which has no geometry to draw.
  expect(drawn.placed).toBe(147)

  // Game space is Y-down, so a scene node sits at the negated elevation.
  const first = drawn.at[0]
  expect(first).toMatchObject({ name: 'DUMMY', x: -4352, y: -1600 * HEIGHT_SCALE, z: -5888 })

  // Nothing is left at the origin — the failure mode when a name misses its
  // model and the record is placed anyway.
  expect(drawn.at.filter((at) => at.x === 0 && at.z === 0)).toHaveLength(0)

  expect(app.errors()).toEqual([])
})

test('a drawn object is also one to walk into', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // The training dummy on the green path, approached from the path's side —
  // which is the side its face points at, so a pig comes to a stop its own
  // radius plus the box's half-thickness short of the middle and no nearer.
  // Both are counts of BOX_UNIT, so both moved with the model's scale.
  const dummy = CAMP.find((object) => object.name === 'DUMMY' && object.x === -4352)!
  await warp(page, dummy.x, dummy.z + 1400, Math.PI)
  await hold(page, 'walkForward', 1500)

  const at = await debugState(page)
  const gap = Math.hypot(at.x - dummy.x, at.z - dummy.z)
  expect(gap).toBeGreaterThan(PIG_RADIUS + BOX_UNIT - 1)
  // It really did walk — it is not simply where it was put.
  expect(gap).toBeLessThan(1200)
  expect(app.errors()).toEqual([])
})
