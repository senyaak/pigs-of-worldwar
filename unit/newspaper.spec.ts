// PHASE 002 (domain) — which newspaper page a win prints (0x45CB68's own
// jump table, `pigmap/notes.md` second pass).

import { test, expect } from '@playwright/test'

import { FRONT_PAGES, paperFor } from '../src/lib/game/newspaper'
import { nationArt } from '../src/lib/game/pigmap'

test('the photo follows the survivors, the wipeout split follows the points', { tag: '@nodata' }, () => {
  expect(paperFor(5, 2, 2, 25).photo).toBe(5)
  expect(paperFor(4, 1, 2, 25).photo).toBe(5)
  expect(paperFor(3, 1, 2, 25).photo).toBe(4)
  expect(paperFor(2, 1, 2, 25).photo).toBe(3)
  expect(paperFor(1, 1, 2, 25).photo).toBe(3)
  expect(paperFor(0, 2, 2, 25).photo).toBe(1)
  expect(paperFor(0, 1, 2, 25).photo).toBe(2)
})

test('the story rotates on the new position, four a variant', { tag: '@nodata' }, () => {
  // Full house: base 17, plus position mod 4.
  expect(paperFor(5, 2, 4, 25).story).toBe(17)
  expect(paperFor(5, 2, 5, 25).story).toBe(18)
  expect(paperFor(5, 2, 7, 25).story).toBe(20)
  // A wipeout that still scored two: base 1.
  expect(paperFor(0, 2, 4, 25).story).toBe(1)
  expect(paperFor(0, 1, 6, 25).story).toBe(7)
})

test('six maps carry a special page — unless the win was flawless', { tag: '@nodata' }, () => {
  // Map id 2 is text21 … map id 24 text26 (0x45CB94).
  expect(paperFor(3, 2, 4, 2).story).toBe(21)
  expect(paperFor(1, 2, 9, 24).story).toBe(26)
  // All five through: the special never fires.
  expect(paperFor(5, 2, 4, 2).story).toBe(17)
})

test('every nation has a front page', { tag: '@nodata' }, () => {
  expect(FRONT_PAGES).toHaveLength(7)
  for (let nation = 0; nation < 6; nation++) {
    expect(FRONT_PAGES[nationArt(nation)]).toBeTruthy()
  }
})
