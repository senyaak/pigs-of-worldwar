// PHASE 002 (drawing) — which of a model's groups lie painted on another.
//
// `lib/formats/paintLayers.ts` decides which of a model's faces get pulled clear
// of the plane they share. The shapes are the house's own: a wall quad with a
// corner-stone quad over its end (CAMP.MAD's STW07PWW, docs/facts/wall-art.md),
// and its two wall sections meeting edge to edge, which must NOT count.

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

test('stones laid over the end of a wall are a layer on it', { tag: '@nodata' }, () => {
  const wall = quad(0, 512, 0, 512)
  const stones = quad(-64, 128, 0, 512)
  expect(paintLayers(modelOf([[wall], [stones]]))).toEqual([0, 1])
})

test('two sections meeting edge to edge are not on each other', { tag: '@nodata' }, () => {
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [quad(512, 1024, 0, 512)]]))).toEqual([0, 0])
})

test('a quad clear of the wall in its plane is not on it', { tag: '@nodata' }, () => {
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [quad(600, 900, 0, 512)]]))).toEqual([0, 0])
})

test('a parallel face, the wall inner side, is another plane', { tag: '@nodata' }, () => {
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [quad(0, 512, 0, 512, 64)]]))).toEqual([0, 0])
})

test('a face crossing the wall at an angle shares no plane with it', { tag: '@nodata' }, () => {
  const across: Quad = [
    [256, 0, -64],
    [256, 0, 64],
    [256, 512, 64],
    [256, 512, -64]
  ]
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [across]]))).toEqual([0, 0])
})

test('one group lying over two sections is one layer, not two', { tag: '@nodata' }, () => {
  // The middle of a long wall: its two sections abut, and one stone quad spans the
  // joint. The two sections are layer 0 and the stones 1.
  const model = modelOf([[quad(0, 512, 0, 512)], [quad(512, 1024, 0, 512)], [quad(448, 576, 0, 512)]])
  expect(paintLayers(model)).toEqual([0, 0, 1])
})

test('a group on a group on a group stacks', { tag: '@nodata' }, () => {
  const model = modelOf([[quad(0, 512, 0, 512)], [quad(100, 300, 0, 512)], [quad(150, 250, 0, 512)]])
  expect(paintLayers(model)).toEqual([0, 1, 2])
})

test('a group with no faces of any area is on nothing', { tag: '@nodata' }, () => {
  const line: Quad = [
    [0, 0, 0],
    [512, 0, 0],
    [512, 0, 0],
    [0, 0, 0]
  ]
  expect(paintLayers(modelOf([[quad(0, 512, 0, 512)], [line]]))).toEqual([0, 0])
})
