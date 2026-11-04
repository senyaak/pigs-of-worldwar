// PHASE 002 (drawing) — which of a model's groups lie painted on another.
//
// `lib/formats/paintLayers.ts` decides which of a model's faces get pulled clear
// of the plane they share. The shapes are the house's own: a wall quad with a
// corner-stone quad over its end (CAMP.MAD's STW07PWW, docs/facts/wall-art.md),
// and its two wall sections meeting edge to edge, which must NOT count. Only a keyed
// group on an opaque one is what the art settles; the review of #167 measured a bias
// on an opaque pair changing the TANK's picture, so that pair has no layer (#170).

import { test, expect } from '@playwright/test'

import type { Model } from '../src/lib/formats/model'
import { paintLayers } from '../src/lib/formats/paintLayers'

type Point = readonly [number, number, number]
type Quad = readonly [Point, Point, Point, Point]

/** A quad on the plane z = `z`, from x0 to x1 and y0 to y1. */
const quad = (x0: number, x1: number, y0: number, y1: number, z = 0): Quad => [
  [x0, y0, z],
  [x1, y0, z],
  [x1, y1, z],
  [x0, y1, z]
]

/** A model with one texture group per list of quads, split as the reader splits. */
function modelOf(groups: readonly (readonly Quad[])[]): Model {
  const corners: number[] = []
  const list: Model['groups'] = []
  groups.forEach((quads, texture) => {
    const start = corners.length / 3
    for (const [a, b, c, d] of quads) corners.push(...a, ...c, ...b, ...a, ...d, ...c)
    list.push({ start, count: corners.length / 3 - start, texture })
  })
  const count = corners.length / 3
  return {
    positions: new Float32Array(corners),
    normals: new Float32Array(count * 3),
    uvs: new Float32Array(count * 2),
    boneIndices: new Int16Array(count),
    groups: list,
    triangleCount: count / 3,
    sourceTriangles: 0,
    sourceQuads: count / 6,
    vertexCount: count
  }
}

/** Two texels. An opaque texture, the wall's `ST011`, has no alpha of zero. */
const OPAQUE = { rgba: new Uint8Array([90, 80, 70, 255, 90, 80, 70, 255]) }
/** Half of it holes, as `ST018`'s columns are: a TIM's transparent colour is alpha 0
 * (lib/formats/tim.ts). */
const KEYED = { rgba: new Uint8Array([0, 0, 0, 0, 90, 80, 70, 255]) }

test('stones laid over the end of a wall are a layer on it', { tag: '@nodata' }, () => {
  const wall = quad(0, 512, 0, 512)
  const stones = quad(-64, 128, 0, 512)
  expect(paintLayers(modelOf([[wall], [stones]]), [OPAQUE, KEYED])).toEqual([0, 1])
})

test('an opaque group over an opaque one has no layer: the art does not say', { tag: '@nodata' }, () => {
  // The shape of TANK's TANK1011 on TANK1001, wholly opaque both (measured, every
  // shipped map). A bias on it changed the picture at the ends of the tracks, in the
  // review of #167, and which of the two the player sees is #170's.
  const plate = quad(0, 512, 0, 512)
  const face = quad(-64, 128, 0, 512)
  expect(paintLayers(modelOf([[plate], [face]]), [OPAQUE, OPAQUE])).toEqual([0, 0])
})

test('a keyed group over a keyed one has no layer: the art does not say', { tag: '@nodata' }, () => {
  // The shape of TREEG's TREE1A on TREE1B, keyed both (measured, every shipped map).
  const leaves = quad(0, 512, 0, 512)
  const more = quad(-64, 128, 0, 512)
  expect(paintLayers(modelOf([[leaves], [more]]), [KEYED, KEYED])).toEqual([0, 0])
})

test('keyed is on top wherever the model lists it', { tag: '@nodata' }, () => {
  // SEPIA1's M1W05PPP lists its stones, MET006 and MET007, before their wall, MET002
  // (measured, SEPIA1.MAD). The other maps' M1W05PPP list the wall first.
  const stones = quad(-64, 128, 0, 512)
  const wall = quad(0, 512, 0, 512)
  expect(paintLayers(modelOf([[stones], [wall]]), [KEYED, OPAQUE])).toEqual([1, 0])
})

test('a group whose texture is missing is opaque, as its fallback is drawn', { tag: '@nodata' }, () => {
  const wall = quad(0, 512, 0, 512)
  const stones = quad(-64, 128, 0, 512)
  const noWall: { rgba: Uint8Array }[] = []
  noWall[1] = KEYED
  expect(paintLayers(modelOf([[wall], [stones]]), noWall)).toEqual([0, 1])
  expect(paintLayers(modelOf([[wall], [stones]]), [])).toEqual([0, 0])
})

test('two sections meeting edge to edge are not on each other', { tag: '@nodata' }, () => {
  const model = modelOf([[quad(0, 512, 0, 512)], [quad(512, 1024, 0, 512)]])
  expect(paintLayers(model, [OPAQUE, KEYED])).toEqual([0, 0])
})

test('a quad clear of the wall in its plane is not on it', { tag: '@nodata' }, () => {
  const model = modelOf([[quad(0, 512, 0, 512)], [quad(600, 900, 0, 512)]])
  expect(paintLayers(model, [OPAQUE, KEYED])).toEqual([0, 0])
})

test('a parallel face, the wall inner side, is another plane', { tag: '@nodata' }, () => {
  const model = modelOf([[quad(0, 512, 0, 512)], [quad(0, 512, 0, 512, 64)]])
  expect(paintLayers(model, [OPAQUE, KEYED])).toEqual([0, 0])
})

test('a face crossing the wall at an angle shares no plane with it', { tag: '@nodata' }, () => {
  const across: Quad = [
    [256, 0, -64],
    [256, 0, 64],
    [256, 512, 64],
    [256, 512, -64]
  ]
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [across]]), [OPAQUE, KEYED])).toEqual([0, 0])
})

test('one group lying over two sections is one layer, not two', { tag: '@nodata' }, () => {
  // The middle of a long wall: its two sections abut, and one stone quad spans the
  // joint. The two sections are layer 0 and the stones 1.
  const model = modelOf([[quad(0, 512, 0, 512)], [quad(512, 1024, 0, 512)], [quad(448, 576, 0, 512)]])
  expect(paintLayers(model, [OPAQUE, OPAQUE, KEYED])).toEqual([0, 0, 1])
})

test('a group with no faces of any area is on nothing', { tag: '@nodata' }, () => {
  const line: Quad = [
    [0, 0, 0],
    [512, 0, 0],
    [512, 0, 0],
    [0, 0, 0]
  ]
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [line]]), [OPAQUE, KEYED])).toEqual([0, 0])
})
