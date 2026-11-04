// PHASE 002 — THE HOUSE'S JOINTS.
//
// Play: "Всё ещё текстуры странно себя ведут на стыках дома." A wall piece carries
// corner stones on its own outer plane (docs/facts/wall-art.md), and two coplanar
// faces of one mesh fight over the depth buffer pixel by pixel: the wall's stone
// shows through the corner stones in stripes and stipple, right at the joints.
//
// This reads the CANVAS. Each opaque texel of the corner stones is projected onto
// the screen through a look at the house, drawn for the purpose, and the pixel there
// is compared with both things it could be: that texel of the stones, and the
// wall's own texel behind it, as read out of the game's own CAMP.MAD and camp.mtd.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { warp } from '../controller'
import { openBattle } from '../load'
import type { DebugHooks } from '../../src/renderer/src/input/pow'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseModel } from '../../src/lib/formats/model'
import type { Model, ModelGroup } from '../../src/lib/formats/model'
import { paintLayers } from '../../src/lib/formats/paintLayers'
import { modelRotationY, parsePog } from '../../src/lib/formats/pog'
import type { MapObject } from '../../src/lib/formats/pog'
import { parseTim } from '../../src/lib/formats/tim'
import type { Tim } from '../../src/lib/formats/tim'
import { boxOf } from '../../src/lib/game/obstacles'
import { MODEL_SCALE } from '../../src/lib/game/scale'
import { crosses } from '../../src/lib/game/seeThrough'
import { HEIGHT_SCALE } from '../../src/lib/game/terrain'

type Page = import('@playwright/test').Page
type Rgb = readonly [number, number, number]
type Vector = readonly [number, number, number]

const mapFile = (name: string): Buffer => readFileSync(path.join(GAME_DIR, 'Maps', name))

const CAMP = parsePog(mapFile('CAMP.POG'))
const MAD = mapFile('CAMP.MAD')
const MTD = mapFile('camp.mtd')
const MODELS = new Map(parseArchive(MAD).entries.map((entry) => [entry.name, entry]))
const TEXTURES = parseArchive(MTD).entries

/** Every wall piece of CAMP's house: the 15 `STW` records (dumped, `CAMP.POG`). */
const WALLS = CAMP.filter((object) => /^STW/.test(object.name))

const modelOf = (name: string): Model => {
  const part = (suffix: string): Buffer => {
    const entry = MODELS.get(`${name}${suffix}`)
    if (!entry) throw new Error(`CAMP.MAD has no ${name}${suffix}`)
    return MAD.subarray(entry.offset, entry.offset + entry.size)
  }
  return parseModel(part('.VTX'), part('.NO2'), part('.FAC'))
}

const textures = new Map<ModelGroup['texture'], { name: string; tim: Tim }>()
const textureOf = (index: ModelGroup['texture']): { name: string; tim: Tim } => {
  const had = textures.get(index)
  if (had) return had
  const entry = TEXTURES[index]
  const made = { name: entry.name, tim: parseTim(MTD.subarray(entry.offset, entry.offset + entry.size)) }
  textures.set(index, made)
  return made
}

/** The corner stones, by the name they have in the game's own camp.mtd. */
const isStones = (group: ModelGroup): boolean => /^ST01[89]/.test(textureOf(group.texture).name)

const texel = (tim: Tim, u: number, v: number): { rgb: Rgb; alpha: number } => {
  const at = (Math.floor(v) * tim.width + Math.floor(u)) * 4
  return { rgb: [tim.rgba[at], tim.rgba[at + 1], tim.rgba[at + 2]], alpha: tim.rgba[at + 3] }
}

interface Corner {
  at: Vector
  u: number
  v: number
}

const cornerOf = (model: Model, index: number): Corner => ({
  at: [model.positions[index * 3], model.positions[index * 3 + 1], model.positions[index * 3 + 2]],
  // Half a texel in, as three/modelMesh.ts draws them.
  u: model.uvs[index * 2] + 0.5,
  v: model.uvs[index * 2 + 1] + 0.5
})

/** Where a point of a triangle lies, as three weights, on two of its coordinates;
 * null outside it. */
function weights(
  corners: readonly [readonly number[], readonly number[], readonly number[]],
  x: number,
  y: number
): Vector | null {
  const [a, b, c] = corners
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])
  if (area === 0) return null
  const one = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / area
  const two = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / area
  if (one < 0 || two < 0 || one + two > 1) return null
  return [1 - one - two, one, two]
}

/** Where a look at the house stands and what it points at, in the world. */
interface Look {
  eye: { x: number; y: number; z: number }
  at: { x: number; y: number; z: number }
}

/** One spot of the stones where the stones and the wall disagree in colour. */
interface Sample {
  world: Vector
  /** Away from the wall's middle, in the world: which way these stones look. */
  outward: Vector
  /** One texel across and one texel down, in the world. */
  across: Vector
  down: Vector
  /** The record it is a part of, whose own box a sight of it does not count. */
  record: MapObject['id']
  stones: Rgb
  wall: Rgb
}

/** The wall's own texel at a point of the model, or null off the wall's faces. */
function wallBehind(model: Model, at: Vector, plane: 0 | 1 | 2): Rgb | null {
  const [across, along] = plane === 0 ? [1, 2] : plane === 1 ? [0, 2] : [0, 1]
  for (const group of model.groups) {
    if (isStones(group)) continue
    const { tim } = textureOf(group.texture)
    for (let start = group.start; start < group.start + group.count; start += 3) {
      const tri = [0, 1, 2].map((k) => cornerOf(model, start + k))
      if (tri.some((corner) => corner.at[plane] !== at[plane])) continue
      const found = weights(
        [
          [tri[0].at[across], tri[0].at[along]],
          [tri[1].at[across], tri[1].at[along]],
          [tri[2].at[across], tri[2].at[along]]
        ],
        at[across],
        at[along]
      )
      if (!found) continue
      const u = found[0] * tri[0].u + found[1] * tri[1].u + found[2] * tri[2].u
      const v = found[0] * tri[0].v + found[1] * tri[1].v + found[2] * tri[2].v
      return texel(tim, u, v).rgb
    }
  }
  return null
}

/** A distance between two colours that only a different texel reaches. */
const apart = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

/** Stones and wall this far apart are told from each other for certain. */
const DIFFERENT = 30
/** A pixel this close to a colour is that colour: the distance's haze shifts every
 * channel by a few levels, and half of `DIFFERENT` cannot reach the other one. */
const SAME = DIFFERENT / 2

/** Spots across each texel, kept off its edges. */
const WITHIN = [0.3, 0.5, 0.7]
/** A texel narrower on the screen than this can put the pixel a spot rounds to in
 * the next texel over, whose colour may be the very wall colour being looked for. */
const LEGIBLE_TEXEL = 3

function samplesOf(record: MapObject): Sample[] {
  const model = modelOf(record.name)
  const turn = modelRotationY(record.yaw)
  const toWorld = (at: Vector): Vector => {
    // As three/props.ts places a record, and then the battle's root, which is a
    // half turn about x: game (x, y, z) is world (x, -y, -z).
    const x = at[0] * MODEL_SCALE
    const y = at[1] * MODEL_SCALE
    const z = at[2] * MODEL_SCALE
    return [
      record.x + x * Math.cos(turn) + z * Math.sin(turn),
      -(-record.y * HEIGHT_SCALE + y),
      -(record.z - x * Math.sin(turn) + z * Math.cos(turn))
    ]
  }
  const samples: Sample[] = []
  for (const group of model.groups.filter(isStones)) {
    const { tim } = textureOf(group.texture)
    for (let start = group.start; start < group.start + group.count; start += 3) {
      const tri = [0, 1, 2].map((k) => cornerOf(model, start + k))
      const plane = ([0, 1, 2] as const).find(
        (axis) => tri[0].at[axis] === tri[1].at[axis] && tri[1].at[axis] === tri[2].at[axis]
      )
      if (plane === undefined) continue
      const uv: [number[], number[], number[]] = [
        [tri[0].u, tri[0].v],
        [tri[1].u, tri[1].v],
        [tri[2].u, tri[2].v]
      ]
      // How far the model moves for one texel of u and of v, over this triangle.
      const du1 = tri[1].u - tri[0].u
      const dv1 = tri[1].v - tri[0].v
      const du2 = tri[2].u - tri[0].u
      const dv2 = tri[2].v - tri[0].v
      const det = du1 * dv2 - du2 * dv1
      if (det === 0) continue
      const texelStep = (a: number, b: number): Vector => {
        const step = (axis: 0 | 1 | 2): number =>
          (a * (tri[1].at[axis] - tri[0].at[axis]) + b * (tri[2].at[axis] - tri[0].at[axis])) / det
        const from = toWorld([0, 0, 0])
        const to = toWorld([step(0), step(1), step(2)])
        return [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
      }
      const across = texelStep(dv2, -dv1)
      const down = texelStep(-du2, du1)
      // Not the top and bottom rows: the wall's foot meets the ground and its head
      // the roof, and an antialiased edge there is a third colour altogether.
      for (let row = 1; row < tim.height - 1; row++) {
        for (let column = 0; column < tim.width; column++) {
          for (const fx of WITHIN) {
            for (const fy of WITHIN) {
              const found = weights(uv, column + fx, row + fy)
              if (!found) continue
              const { rgb, alpha } = texel(tim, column + fx, row + fy)
              if (alpha < 128) continue
              const at: Vector = [
                found[0] * tri[0].at[0] + found[1] * tri[1].at[0] + found[2] * tri[2].at[0],
                found[0] * tri[0].at[1] + found[1] * tri[1].at[1] + found[2] * tri[2].at[1],
                found[0] * tri[0].at[2] + found[1] * tri[1].at[2] + found[2] * tri[2].at[2]
              ]
              const wall = wallBehind(model, at, plane)
              if (!wall || apart(rgb, wall) < DIFFERENT) continue
              const world = toWorld(at)
              const middle = toWorld([
                plane === 0 ? 0 : at[0],
                plane === 1 ? 0 : at[1],
                plane === 2 ? 0 : at[2]
              ])
              samples.push({
                world,
                outward: [world[0] - middle[0], world[1] - middle[1], world[2] - middle[2]],
                across,
                down,
                record: record.id,
                stones: rgb,
                wall
              })
            }
          }
        }
      }
    }
  }
  return samples
}

/** The matrices of a look at the house from somewhere the chase cannot put its eye. */
const lensFrom = (page: Page, look: Look): Promise<ReturnType<DebugHooks['lensFrom']>> =>
  page.evaluate(({ eye, at }) => {
    const { pow } = window
    if (!pow || !pow.debug) throw new Error('no battle scene is up')
    return pow.debug.lensFrom(eye, at)
  }, look)

/** That look, drawn on the canvas, and what these pixels of it came out as. */
const pixelsFrom = (page: Page, look: Look, spots: readonly (readonly [number, number])[]): Promise<Rgb[]> =>
  page.evaluate(
    ({ eye, at, spots: wanted }) => {
      const { pow } = window
      if (!pow || !pow.debug) throw new Error('no battle scene is up')
      return pow.debug.pixelsFrom(eye, at, wanted)
    },
    { ...look, spots }
  )

const fadedNow = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const { pow } = window
    if (!pow || !pow.debug) throw new Error('no battle scene is up')
    return pow.debug.props().faded
  })

/** A point through a column-major matrix. */
const through = (m: readonly number[], v: readonly number[]): number[] =>
  [0, 1, 2, 3].map((row) => m[row] * v[0] + m[row + 4] * v[1] + m[row + 8] * v[2] + m[row + 12] * v[3])

/** Stones in one colour palette: a random spot of another wall matches some wall's
 * texel often enough to count, so only a spot the eye has a clear line to is read. */
const BLOCKERS = CAMP.filter((object) => /^ST/.test(object.name)).map((object) => ({
  id: object.id,
  box: boxOf(object)
}))
function inSight(sample: Sample, eye: { x: number; y: number; z: number }): boolean {
  const [x, y, z] = sample.world
  const faces =
    (eye.x - x) * sample.outward[0] + (eye.y - y) * sample.outward[1] + (eye.z - z) * sample.outward[2]
  if (faces <= 0) return false
  // World to game, the battle's root: a half turn about x.
  const from = { x: eye.x, y: -eye.y, z: -eye.z }
  const to = { x, y: -y, z: -z }
  return !BLOCKERS.some(({ id, box }) => id !== sample.record && crosses(box, from, to))
}

interface Count {
  /** Spots on the screen at all. */
  seen: number
  /** …showing the stones, as they should. */
  stones: number
  /** …showing the wall behind the stones: the fight, lost. */
  wall: number
}

/** Look at the house from there, at the stones that face the eye, and count. */
async function count(page: Page, all: readonly Sample[], look: Look): Promise<Count> {
  const lens = await lensFrom(page, look)
  const onScreen = (world: Vector): [number, number] | null => {
    const clip = through(lens.projection, through(lens.view, [...world, 1]))
    if (clip[3] <= 0) return null
    return [((clip[0] / clip[3] + 1) / 2) * lens.width, ((1 - clip[1] / clip[3]) / 2) * lens.height]
  }
  const span = (from: [number, number], world: Vector, step: Vector): number => {
    const to = onScreen([world[0] + step[0], world[1] + step[1], world[2] + step[2]])
    return to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 0
  }
  const spots: [number, number][] = []
  const samples: Sample[] = []
  for (const sample of all) {
    if (!inSight(sample, look.eye)) continue
    const at = onScreen(sample.world)
    if (!at) continue
    if (span(at, sample.world, sample.across) < LEGIBLE_TEXEL) continue
    if (span(at, sample.world, sample.down) < LEGIBLE_TEXEL) continue
    const px = Math.floor(at[0])
    const py = Math.floor(at[1])
    if (px < 0 || py < 0 || px >= lens.width || py >= lens.height) continue
    spots.push([px, py])
    samples.push(sample)
  }
  const pixels = await pixelsFrom(page, look, spots)
  const counted: Count = { seen: samples.length, stones: 0, wall: 0 }
  samples.forEach((sample, index) => {
    if (apart(pixels[index], sample.stones) <= SAME) counted.stones++
    else if (apart(pixels[index], sample.wall) <= SAME) counted.wall++
  })
  return counted
}

/** Game space, as the map's own records are, to the world the camera stands in:
 * the battle's root is a half turn about x. */
const world = (x: number, y: number, z: number): { x: number; y: number; z: number } => ({
  x,
  y: -y,
  z: -z
})

test('the corner stones of each wall piece are the one thing painted on it', () => {
  // Measured, CAMP.MAD: each wall piece's two stone groups are painted on its wall,
  // and nothing else of it is on anything.
  expect(WALLS.length, 'the house has its wall pieces').toBeGreaterThanOrEqual(12)
  for (const name of new Set(WALLS.map((wall) => wall.name))) {
    const model = modelOf(name)
    const layers = paintLayers(model)
    model.groups.forEach((group, index) => {
      const texture = textureOf(group.texture).name
      expect(layers[index], `${name}'s ${texture}`).toBe(isStones(group) ? 1 : 0)
    })
  }
})

test('the stones are drawn, not the wall through them, at the joints of the house', async ({
  app
}) => {
  test.setTimeout(60_000)
  const { page } = app
  await openBattle(page)
  // Out of the way, so nothing is faded and no pig stands in the picture.
  await warp(page, 3000, 3000, 0)
  await expect.poll(() => fadedNow(page), { message: 'nothing to be faded' }).toBe(0)

  // [play]: the house's joints. The fight is worst on a wall seen at an angle, where
  // the depth runs fastest across a pixel, and a face-on wall barely shows it; the
  // chase's own eye is too far off for its texels to be told apart there. So these
  // stand nearer than the chase does, the way the aim and the melee views do.
  const GROUND = -1024 // CAMP's house, game space: the walls' foot, CAMP.MAD.
  const looks: [string, Look][] = [
    ['south-east corner', {
      eye: world(-5300, GROUND - 500, 900),
      at: world(-6144, GROUND - 256, 0)
    }],
    ['south-west corner', {
      eye: world(-10060, GROUND - 500, 900),
      at: world(-9216, GROUND - 256, 0)
    }],
    ['the porch', {
      eye: world(-7680, GROUND - 500, 700),
      at: world(-7680, GROUND - 256, -256)
    }],
    ['the west wall, along it', {
      eye: world(-10000, GROUND - 500, -100),
      at: world(-9216, GROUND - 256, -800)
    }]
  ]
  const all = WALLS.flatMap(samplesOf)
  const counts: string[] = []
  let wall = 0
  let fewest = Infinity
  for (const [name, look] of looks) {
    const counted = await count(page, all, look)
    counts.push(`${name}: ${counted.stones} stones, ${counted.wall} wall, of ${counted.seen}`)
    wall += counted.wall
    fewest = Math.min(fewest, counted.stones)
  }
  console.log(counts.join(', '))
  // A floor on what is told apart, or a projection gone wrong would pass as zero
  // wall: the stones have to be seen where they are computed to be, in every look.
  expect(fewest, counts.join('; ')).toBeGreaterThan(100)
  expect(wall, counts.join('; ')).toBe(0)
  expect(app.errors()).toEqual([])
})
