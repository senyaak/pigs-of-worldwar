// PHASE 002 — the RAMP pieces, and the tilt nothing in the record asks for.
//
// Pure: the shipped CAMP and ISLAND files, read through the readers, with the
// same composition `three/props.ts` builds — the yaw about the vertical,
// outside a −45° turn about the model's own z (lib/game/ramps.ts).
//
// What it pins is the MEASUREMENT the rule rests on, because the mechanism in
// the exe is not found: which of the nine bodiless models are drawn lying down
// (their own collision box says, and it is not close), and that tilted,
// CAMP's second bridge and ISLAND's twelve ramps land on their decks and on
// the ground to the unit — where untilted they sit 256 below the deck and
// overlap each other by 213.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { BOX_UNIT, modelRotationY, parsePog } from '../../src/lib/formats/pog'
import type { MapObject } from '../../src/lib/formats/pog'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseModel } from '../../src/lib/formats/model'
import { parsePmg } from '../../src/lib/formats/pmg'
import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import { createLocomotion, updateLocomotion } from '../../src/lib/game/locomotion'
import { ObstacleField } from '../../src/lib/game/obstacles'
import { RAMP_TILT, isRamp } from '../../src/lib/game/ramps'
import { MODEL_SCALE } from '../../src/lib/game/scale'
import { HEIGHT_SCALE, TerrainQuery } from '../../src/lib/game/terrain'

const mapFile = (name: string): Buffer => readFileSync(path.join(GAME_DIR, 'Maps', name))

/** One model's vertices out of a map's own archive. */
function vertices(map: string, name: string): number[][] {
  const data = mapFile(`${map}.MAD`)
  const { entries } = parseArchive(data)
  const part = (ext: string): Uint8Array => {
    const entry = entries.find((one) => one.name.toLowerCase() === `${name}.${ext}`.toLowerCase())
    if (!entry) throw new Error(`no ${name}.${ext} in ${map}.MAD`)
    return data.subarray(entry.offset, entry.offset + entry.size)
  }
  const model = parseModel(part('VTX'), part('NO2'), part('FAC'))
  const out: number[][] = []
  for (let i = 0; i < model.positions.length; i += 3) {
    out.push([model.positions[i], model.positions[i + 1], model.positions[i + 2]])
  }
  return out
}

/**
 * A placed record's corners in the world: elevation (up-positive, the space
 * the POG and the PMG share) against world x and z.
 *
 * The transform is `props.ts`'s: position, then the yaw about the vertical,
 * then the ramp's own tilt inside it, then MODEL_SCALE.
 */
function placed(object: MapObject, model: number[][]): { x: number; z: number; elevation: number }[] {
  const tilt = isRamp(object.name) ? RAMP_TILT : 0
  const phi = modelRotationY(object.yaw)
  return model.map(([mx, my, mz]) => {
    // About the model's own z: (x, y) → (x cos − y sin, x sin + y cos).
    const tx = mx * Math.cos(tilt) - my * Math.sin(tilt)
    const ty = mx * Math.sin(tilt) + my * Math.cos(tilt)
    // …then about the vertical, in three's own sense.
    const x = object.x + MODEL_SCALE * (tx * Math.cos(phi) + mz * Math.sin(phi))
    const z = object.z + MODEL_SCALE * (-tx * Math.sin(phi) + mz * Math.cos(phi))
    // Game space is Y-down and the stored y is an elevation, so the model's
    // y comes back off it.
    return { x, z, elevation: object.y * HEIGHT_SCALE - MODEL_SCALE * ty }
  })
}

const span = (values: number[]): { lo: number; hi: number } => ({
  lo: Math.min(...values),
  hi: Math.max(...values)
})

/**
 * Two elevations that are the same place, within slack.
 *
 * `ART` is the models' own vertex noise — BRID2_S is authored a couple of
 * units out of true, so its tilted extent is 512 either side ±2. `PLACED` is
 * the level designer's hand: ISLAND's six ramps are stored at y 377, 383, 384
 * and 394 for the one deck.
 */
const ART = 4
const PLACED = 16
const near = (a: number, b: number, slack: number): boolean => Math.abs(a - b) <= slack

test("the record's own collision box says which art is drawn lying down", () => {
  // The witness the rule rests on. Fields 8-10 are the collider's extents, in
  // the order (z, y, x) and counts of BOX_UNIT (formats/pog.ts), and the exe
  // reads them at 0x4a6236 — so the box is the game's own statement about how
  // big the piece is. For every one of the nine shape-1 models it matches ONE
  // orientation of the art and misses the other by about 360 units.
  const check = (map: string, name: string, ramp: boolean): void => {
    const record = parsePog(mapFile(`${map}.POG`)).find((one) => one.name === name)
    expect(record, `${name} on ${map}`).toBeDefined()
    const model = vertices(map, name)
    const at = (tilt: number): number[] => {
      const points = model.map(([mx, my, mz]) => [
        mx * Math.cos(tilt) - my * Math.sin(tilt),
        mx * Math.sin(tilt) + my * Math.cos(tilt),
        mz
      ])
      return [0, 1, 2].map((axis) => {
        const { lo, hi } = span(points.map((p) => p[axis]))
        return (hi - lo) * MODEL_SCALE
      })
    }
    // The HEIGHT is what decides, because a 45° turn is what moves it most:
    // the box's y extent lands on the drawn orientation within the art's own
    // few units of noise, and 300 or more off the other one. (The x and z
    // extents agree, but a collider is not the art — a tree's box is its
    // trunk — so they are allowed their slack and this is not.)
    const flat = Math.abs(at(0)[1] - record!.box.y)
    const tilted = Math.abs(at(RAMP_TILT)[1] - record!.box.y)
    const [near_, far] = ramp ? [tilted, flat] : [flat, tilted]
    expect(isRamp(name), `${name} is in the family`).toBe(ramp)
    expect(near_, `${name}: ${near_} off as drawn`).toBeLessThanOrEqual(ART)
    // …and the other way round it is out by more than a whole BOX_UNIT: 105
    // at the closest (BRR02PPP), 297 at the furthest.
    expect(far, `${name}: only ${far} off the other way`).toBeGreaterThan(BOX_UNIT)
  }
  check('CAMP', 'BRID2_S', true)
  check('ICEFLOW', 'M1S_ST01', true)
  check('RIDGE', 'STS_ST01', true)
  check('RUMBLE', 'BRR02PPP', true)
  check('CAMP', 'BRIDGE_S', false)
  check('MASHED', 'D_BRID', false)
  // The three long ones are ARCH bridges, deck at the origin and the arch
  // hanging below — which is why their art is off its own centre without
  // being tilted, and why the centre alone is not the test.
  check('MASHED', 'STR06PPP', false)
  check('BAY', 'W1R06PPP', false)
  check('ICEFLOW', 'SNR05PPP', false)

  // The turn is half a right angle exactly: the art is 1451 model units
  // across and 1451/√2 is the 725 that halves to the box's 512.
  const origin = { name: 'BRID2_S', yaw: 0, x: 0, y: 0, z: 0 } as MapObject
  const tilted = span(placed(origin, vertices('CAMP', 'BRID2_S')).map((p) => p.elevation))
  expect(near((tilted.lo + tilted.hi) / 2, 0, ART)).toBe(true)
  expect(near(tilted.hi - tilted.lo, 512, ART)).toBe(true)
})

test("CAMP's second bridge is one 45° ramp from the deck to the ground", () => {
  const CAMP = parsePog(mapFile('CAMP.POG'))
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const at = (name: string): MapObject[] =>
    CAMP.filter((object) => object.name === name).sort((a, b) => a.x - b.x)

  const [deck] = at('BRID2_C')
  const ramps = at('BRID2_S')
  const legs = at('M1S_SU03')
  expect(ramps).toHaveLength(2)
  expect(legs).toHaveLength(4)
  // All seven arrive together — one script group, field 15 shared (script.ts).
  for (const one of [deck, ...ramps, ...legs]) expect(one.fields[14]).toBe(23)

  const deckTop = span(placed(deck, vertices('CAMP', 'BRID2_C')).map((p) => p.elevation)).hi
  const model = vertices('CAMP', 'BRID2_S')
  const shape = ramps.map((one) => {
    const points = placed(one, model)
    return { x: span(points.map((p) => p.x)), elevation: span(points.map((p) => p.elevation)) }
  })

  // Each piece is a 512 run — which is the spacing the records are placed at,
  // and only the tilt gives it: untilted the art is 725 across and the two
  // would overlap by 213.
  for (const one of shape) expect(near(one.x.hi - one.x.lo, 512, ART)).toBe(true)
  // They meet, and the high end of the first IS the deck's walking surface.
  expect(near(shape[0].x.hi, shape[1].x.lo, ART)).toBe(true)
  expect(near(shape[0].elevation.hi, deckTop, ART)).toBe(true)
  expect(near(shape[0].elevation.lo, shape[1].elevation.hi, ART)).toBe(true)
  // …and the low end of the second is the ground it arrives on.
  const foot = { x: shape[1].x.hi - 64, z: ramps[1].z }
  expect(near(shape[1].elevation.lo, -query.height(foot.x, foot.z), ART)).toBe(true)

  // The four legs are the first ramp's underside: they stand from the ground
  // to exactly where the two pieces join, under exactly its footprint.
  const legShape = legs.map((one) => {
    const points = placed(one, vertices('CAMP', 'M1S_SU03'))
    return { x: span(points.map((p) => p.x)), elevation: span(points.map((p) => p.elevation)) }
  })
  for (const leg of legShape) {
    expect(near(leg.elevation.hi, shape[0].elevation.lo, ART)).toBe(true)
    expect(leg.x.lo).toBeGreaterThanOrEqual(shape[0].x.lo - ART)
    expect(leg.x.hi).toBeLessThanOrEqual(shape[0].x.hi + ART)
  }
})

test('a pig walks up the ramp and onto the deck', () => {
  // The other half of what play asked for, and the reason the geometry had to
  // be right first: a ramp is field-11 shape 1, so nothing about it is a
  // collider in the original and terrain height is all a pig is pinned to.
  // The remake gives it the record's own box with a sloped top
  // (lib/game/obstacles.ts) and the ordinary step-up envelope does the rest.
  const CAMP = parsePog(mapFile('CAMP.POG'))
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const field = new ObstacleField(CAMP)
  const ramps = CAMP.filter((one) => one.name === 'BRID2_S').sort((a, b) => a.x - b.x)
  const deck = CAMP.find((one) => one.name === 'BRID2_C')!

  // At the foot of the lower ramp, facing up it: the run is along −x, so the
  // heading whose forward is (sin h, cos h) = (−1, 0).
  const foot = { x: 4160, z: ramps[1].z }
  const state = createLocomotion(query, foot.x, foot.z, -Math.PI / 2)
  expect(near(-state.y, -query.height(foot.x, foot.z), ART), 'starts on the ground').toBe(true)

  // Long enough to cover the two ramps' 1024 and step onto the deck.
  const frames = Math.round(2 / FRAME_SECONDS)
  let highest = state.y
  for (let i = 0; i < frames; i++) {
    updateLocomotion(state, query, { walk: 1, turn: 0, jump: false }, FRAME_SECONDS, field)
    highest = Math.min(highest, state.y)
  }
  // It got up, it got ALL the way up, and it is standing on the deck rather
  // than hanging in the air over it.
  const deckTop = span(placed(deck, vertices('CAMP', 'BRID2_C')).map((p) => p.elevation)).hi
  expect(near(-highest, deckTop, ART), `climbed to ${-highest} of ${deckTop}`).toBe(true)
  expect(state.x, 'and it is past the ramps').toBeLessThan(ramps[0].x - 256 + ART)
  expect(state.airborne, 'on its feet').toBeNull()

  // …and without the ramps it cannot: the same walk against the terrain alone
  // stops at the foot of a 1024-unit face.
  const bare = createLocomotion(query, foot.x, foot.z, -Math.PI / 2)
  for (let i = 0; i < frames; i++) {
    updateLocomotion(bare, query, { walk: 1, turn: 0, jump: false }, FRAME_SECONDS)
  }
  expect(-bare.y, 'the bare terrain is 1024 lower').toBeLessThan(deckTop - 512)
})

test('a pig on a bridge is not in the water it crosses', () => {
  // ISLAND's spans are all over open water, so the deck is the case CAMP has
  // not got: everything the engine asks the LANDSCAPE says water, and the pig
  // is forty feet above it.
  const ISLAND = parsePog(mapFile('ISLAND.POG'))
  const query = new TerrainQuery(parsePmg(mapFile('ISLAND.PMG')))
  const field = new ObstacleField(ISLAND)
  // Ramp #6 at (6912, −6400) climbs +z, and the shore at its foot is exactly
  // its own low end — so this is a walk from the beach onto the bridge.
  const state = createLocomotion(query, 6912, -6900, 0)
  const frames = Math.round(1.8 / FRAME_SECONDS)
  for (let i = 0; i < frames; i++) {
    updateLocomotion(state, query, { walk: 1, turn: 0, jump: false }, FRAME_SECONDS, field)
  }
  expect(query.isWater(state.x, state.z), 'over water').toBe(true)
  expect(near(-state.y, 640, ART), `on the deck at ${-state.y}`).toBe(true)
  // Running, not swimming — the swim clip and its 16-a-frame cap belong to the
  // pig that is actually in the water.
  expect(state.clip, 'running').toBe(0)
  expect(state.z, 'and it got a walk’s worth of distance').toBeGreaterThan(-6000)
})

test("ISLAND's ramps all climb to their own deck's surface", () => {
  // Six of them, at both ends of two bridges, and the yaw is what picks which
  // way each climbs — so this is the sign of the tilt as much as its size.
  const ISLAND = parsePog(mapFile('ISLAND.POG'))
  const model = vertices('ISLAND', 'BRID2_S')
  const decks = ISLAND.filter((object) => object.name.startsWith('BRIDGE_C'))
  const deckTop = span(
    decks.flatMap((one) => placed(one, vertices('ISLAND', 'BRIDGE_C')).map((p) => p.elevation))
  ).hi

  const ramps = ISLAND.filter((object) => object.name === 'BRID2_S')
  expect(ramps.length).toBeGreaterThanOrEqual(6)
  for (const ramp of ramps) {
    const points = placed(ramp, model)
    const elevation = span(points.map((p) => p.elevation))
    expect(near(elevation.hi, deckTop, PLACED), `ramp ${ramp.id} tops out at ${elevation.hi}`).toBe(true)
    expect(near(elevation.hi - elevation.lo, 512, ART), `ramp ${ramp.id} rise`).toBe(true)
    // Its high end faces the deck: the nearest deck section along the run.
    const phi = modelRotationY(ramp.yaw)
    const run = { x: Math.cos(phi), z: -Math.sin(phi) }
    const high = points.reduce((best, p) => (p.elevation > best.elevation ? p : best), points[0])
    // The deck sections on this ramp's OWN line: near it along the run, and
    // on it across. ISLAND carries three separate bridges, so without the
    // across test a ramp finds the deck of a bridge half the map away.
    const toDeck = decks
      .map((one) => ({
        along: (one.x - ramp.x) * run.x + (one.z - ramp.z) * run.z,
        across: (one.x - ramp.x) * run.z - (one.z - ramp.z) * run.x
      }))
      .filter((one) => Math.abs(one.along) < 4096 && Math.abs(one.across) < 512)
      .map((one) => one.along)
    expect(toDeck.length, `ramp ${ramp.id} has a deck`).toBeGreaterThan(0)
    const nearest = toDeck.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b))
    const towardHigh = (high.x - ramp.x) * run.x + (high.z - ramp.z) * run.z
    expect(Math.sign(nearest), `ramp ${ramp.id} climbs at its deck`).toBe(Math.sign(towardHigh))
  }
})
