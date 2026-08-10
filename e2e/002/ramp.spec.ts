// PHASE 002 — the RAMP pieces, and the tilt nothing in the record asks for.
//
// Pure: the shipped CAMP and ISLAND files, read through the readers, with the
// same composition `three/props.ts` builds — the yaw about the vertical,
// outside a −45° turn about the model's own z (lib/game/ramps.ts).
//
// What it pins is the MEASUREMENT the rule rests on, because the mechanism in
// the exe is not found: tilted, CAMP's second bridge and ISLAND's six ramps
// land on their decks and on the ground to the unit; untilted they miss by
// 256 and overlap each other.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { modelRotationY, parsePog } from '../../src/lib/formats/pog'
import type { MapObject } from '../../src/lib/formats/pog'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseModel } from '../../src/lib/formats/model'
import { parsePmg } from '../../src/lib/formats/pmg'
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

test('the ramp family is exactly the art that is off its own origin', () => {
  // The rule's own witness: a prop's stored y is its model's CENTRE (all 6322
  // shipped records, objects/notes.md), so a model whose vertical extent does
  // not straddle its origin is drawn in some other orientation. On CAMP that
  // is BRID2_S and nothing else — the abutment BRIDGE_S and the deck sections
  // are centred as they stand.
  const centre = (map: string, name: string): number => {
    const ys = vertices(map, name).map(([, y]) => y)
    const { lo, hi } = span(ys)
    return (lo + hi) / 2
  }
  expect(Math.abs(centre('CAMP', 'BRIDGE_S'))).toBeLessThan(8)
  expect(Math.abs(centre('CAMP', 'BRIDGE_C'))).toBeLessThan(8)
  expect(centre('CAMP', 'BRID2_S')).toBeGreaterThan(300)
  expect(isRamp('BRID2_S')).toBe(true)
  expect(isRamp('BRIDGE_S')).toBe(false)

  // …and the tilt is what centres it, at half a right angle exactly: the art
  // is 1451 model units across and 1451/√2 is the 725 that halves to 512.
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
