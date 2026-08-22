// PHASE 002 (domain) — the difficulty dial. Pure, no Electron.
//
// One number per map off the campaign order, over a scale of 26
// (lib/game/wits.ts): the first fight thinks at 1/26 — a little, never
// zero — the campaign's final at 25/26, and the full 1 is RESERVED for the
// secret faction's second pass, the day it exists. Smooth in between,
// where the turn timer steps per island.

import { test, expect } from '@playwright/test'

import { ARENA_WITS, LARD_WITS, witsFor } from '../src/lib/game/wits'
import { CAMPAIGN_LENGTH, mapAt } from '../src/lib/game/missions'

test('the first fight thinks a LITTLE — 1/26, never zero', { tag: '@nodata' }, () => {
  expect(witsFor(mapAt(1)!)).toBeCloseTo(1 / 26, 10)
  expect(witsFor(mapAt(1)!)).toBeGreaterThan(0)
})

test('the campaign final stops at 25/26: the top is reserved for the purple pass', { tag: '@nodata' }, () => {
  expect(witsFor(mapAt(CAMPAIGN_LENGTH - 1)!)).toBeCloseTo(25 / 26, 10)
  expect(witsFor(mapAt(CAMPAIGN_LENGTH - 1)!)).toBeLessThan(LARD_WITS)
})

test('the ramp between is smooth and rising', { tag: '@nodata' }, () => {
  let last = 0
  for (let position = 1; position < CAMPAIGN_LENGTH; position++) {
    const wits = witsFor(mapAt(position)!)
    expect(wits).toBeGreaterThan(last)
    // SMOOTH: every step is the same 1/26.
    if (position > 1) expect(wits - last).toBeCloseTo(1 / 26, 10)
    last = wits
  }
})

test('a map outside the campaign plays at the arena setting', { tag: '@nodata' }, () => {
  expect(witsFor('ARCHI')).toBe(ARENA_WITS)
})
