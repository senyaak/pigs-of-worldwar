// PHASE 000 (formats) — which trailing TIM columns are ALIGNMENT PADDING.
// Pure, no Electron, no installation: synthetic TIMs against the narrow rule
// `spritePadding` applies (lib/formats/tim.ts) — the shipped-data half is
// pinned in e2e/000/timpadding.spec.ts.

import { test, expect } from '@playwright/test'

import { spritePadding } from '../src/lib/formats/tim'
import type { Tim } from '../src/lib/formats/tim'

/** A Tim built straight from an index grid; `palette` is CLUT words. */
const tim = (
  width: number,
  height: number,
  palette: number[],
  at: (x: number, y: number) => number
): Tim => {
  const indices = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) indices[y * width + x] = at(x, y)
  return { width, height, rgba: new Uint8Array(width * height * 4), palette: Uint16Array.from(palette), indices }
}

/** An 8-bit CLUT: 256 words, body colour at 14, filler grey at 0. */
const CLUT8 = (): number[] => {
  const words = new Array(256).fill(0x1111)
  words[0] = 0x39ce // an opaque grey — the shipped fillers' shape
  words[13] = 0 // the transparent entry the masks actually use
  return words
}

test('a full trailing column of an index the body barely uses is padding', { tag: '@nodata' }, () => {
  // The shipped shape (`sau4`): body of index 14 over transparent 13, one
  // stray texel of 0, and the last column solid 0 — the rounding filler.
  const padded = tim(64, 82, CLUT8(), (x, y) =>
    x === 63 ? 0 : x === 25 && y === 40 ? 0 : y > 60 ? 13 : 14
  )
  expect(spritePadding(padded)).toBe(1)
})

test('a transparent filler is not worth a trim', { tag: '@nodata' }, () => {
  const clut = CLUT8()
  clut[0] = 0
  const padded = tim(64, 82, clut, (x) => (x === 63 ? 0 : 14))
  expect(spritePadding(padded)).toBe(0)
})

test("an index the body LEANS on is art, not filler — pause5's dark rim", { tag: '@nodata' }, () => {
  // The rim column is uniform, but the same index fills a run of the body.
  const rimmed = tim(16, 16, CLUT8(), (x, y) => (x === 15 ? 4 : x > 10 && y > 2 ? 4 : 14))
  expect(spritePadding(rimmed)).toBe(0)
})

test('solid art of one index everywhere keeps every column — fpole', { tag: '@nodata' }, () => {
  const pole = tim(4, 31, new Array(16).fill(0x39ce), () => 2)
  expect(spritePadding(pole)).toBe(0)
})

test('4-bit art can round up by THREE columns, and all three go', { tag: '@nodata' }, () => {
  // A 16-colour CLUT is what says the art was 4-bit — the padding allowance
  // is the format's own rounding, 4 texels a 16-bit unit.
  const clut = new Array(16).fill(0x1111)
  clut[0] = 0x39ce
  const padded = tim(24, 32, clut, (x) => (x >= 21 ? 0 : 5))
  expect(spritePadding(padded)).toBe(3)
})
