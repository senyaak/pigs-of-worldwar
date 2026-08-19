// PHASE 002 (domain) — how long a turn is, by MAP. Pure, no Electron.
//
// The exe's turn table (0x4d1860) is indexed by the CAMPAIGN POSITION and the
// order table (0x4D17F0) says which map a position opens; `lib/game/turns.ts`
// composes the two. This pins the composition at its corners — the ends of
// the table, the crossover rows, and the fallback — because a table built by
// `Object.fromEntries` over two others would fail silently if either moved.

import { test, expect } from '@playwright/test'

import { TURN_SECONDS_BY_POSITION, turnSecondsFor } from '../src/lib/game/turns'
import { CAMPAIGN } from '../src/lib/game/missions'
import { DEFAULT_TURN_SECONDS } from '../src/lib/game/game'

test('the clock starts generous and tightens to fifteen at Hamburger Hill', { tag: '@nodata' }, () => {
  // Positions 0..2 — the training ground and the first two missions.
  expect(turnSecondsFor('CAMP')).toBe(99)
  expect(turnSecondsFor('ESTU')).toBe(99)
  expect(turnSecondsFor('ROAD')).toBe(99)
  // The bands: 60 from TRENCH, 45 from TWIN, 30 from DESVAL.
  expect(turnSecondsFor('TRENCH')).toBe(60)
  expect(turnSecondsFor('ZULUS')).toBe(60)
  expect(turnSecondsFor('TWIN')).toBe(45)
  expect(turnSecondsFor('BRIDGE')).toBe(45)
  expect(turnSecondsFor('DESVAL')).toBe(30)
  expect(turnSecondsFor('TESTER')).toBe(30)
  // FOOT is Hamburger Hill, position 24 — the campaign's tightest turn —
  // and FINAL eases back off it.
  expect(turnSecondsFor('FOOT')).toBe(15)
  expect(turnSecondsFor('FINAL')).toBe(30)
  // The name is normalised the way every other map argument is.
  expect(turnSecondsFor('foot')).toBe(15)
})

test('an arena is in neither table and falls back on the default', { tag: '@nodata' }, () => {
  expect(turnSecondsFor('BOOM')).toBe(DEFAULT_TURN_SECONDS)
  expect(turnSecondsFor('ISLAND')).toBe(DEFAULT_TURN_SECONDS)
})

test('every campaign position has a turn length, plus the unreachable 27th', { tag: '@nodata' }, () => {
  expect(CAMPAIGN).toHaveLength(26)
  expect(TURN_SECONDS_BY_POSITION).toHaveLength(27)
})
