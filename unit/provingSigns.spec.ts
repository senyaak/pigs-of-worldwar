// What a proving-ground signpost wears: a menu icon on a black field the shape
// of the board (lib/game/provingSigns.ts, docs/facts/proving-ground.md).
//
// The icon here is made up, in the shipped art's shape: 56×34 with its black
// field punched out (`skills/notes.md` § "The menu's art", `punchBlack`). What
// the real one looks like on a real board is `e2e/002/proving-ground.spec.ts`.

import { test, expect } from '@playwright/test'

import { signBoardArt } from '../src/lib/game/provingSigns'

/** skills/notes.md § "The menu's art": every skill's icon is 56×34. */
const WIDTH = 56
const HEIGHT = 34

/** A punched icon with one opaque texel, at (x, y) in the icon. */
const iconWith = (x: number, y: number, [r, g, b]: number[]): Uint8Array => {
  const rgba = new Uint8Array(WIDTH * HEIGHT * 4)
  const at = (y * WIDTH + x) * 4
  rgba.set([r, g, b, 255], at)
  return rgba
}

const texel = (art: { width: number; rgba: Uint8Array }, x: number, y: number): number[] => {
  const at = (y * art.width + x) * 4
  return [...art.rgba.subarray(at, at + 4)]
}

test('the board is square, as the SIGN model board is, and keeps the icon name', { tag: '@nodata' }, () => {
  const art = signBoardArt({ name: 'grenade', width: WIDTH, height: HEIGHT, rgba: iconWith(0, 0, [9, 9, 9]) })
  expect(art.name).toBe('grenade')
  expect(art.width).toBe(WIDTH)
  expect(art.height).toBe(WIDTH)
  expect(art.rgba.length).toBe(WIDTH * WIDTH * 4)
})

test('no texel of the board is a hole for the alpha test', { tag: '@nodata' }, () => {
  const art = signBoardArt({ name: 'knife', width: WIDTH, height: HEIGHT, rgba: iconWith(3, 4, [200, 100, 50]) })
  for (let at = 3; at < art.rgba.length; at += 4) expect(art.rgba[at]).toBe(255)
  // A punched texel of the icon is the black field, and so is what is round it.
  expect(texel(art, 0, 0)).toEqual([0, 0, 0, 255])
  expect(texel(art, 10, 20)).toEqual([0, 0, 0, 255])
})

test('the icon stands in the middle, with its own proportions and the right way round', { tag: '@nodata' }, () => {
  const colour = [200, 100, 50]
  // Top left of the icon: 11 rows of field above it, (56 − 34) / 2.
  const art = signBoardArt({ name: 'knife', width: WIDTH, height: HEIGHT, rgba: iconWith(0, 0, colour) })
  expect(texel(art, 0, 11)).toEqual([...colour, 255])
  expect(texel(art, WIDTH - 1, 11)).toEqual([0, 0, 0, 255])
  // Bottom right: the last row of the icon, with the same field below it.
  const low = signBoardArt({ name: 'knife', width: WIDTH, height: HEIGHT, rgba: iconWith(WIDTH - 1, HEIGHT - 1, colour) })
  expect(texel(low, WIDTH - 1, 11 + HEIGHT - 1)).toEqual([...colour, 255])
  expect(texel(low, WIDTH - 1, 11 + HEIGHT)).toEqual([0, 0, 0, 255])
})
