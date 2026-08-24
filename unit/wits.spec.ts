// PHASE 002 (domain) — the difficulty dial. Pure, no Electron.
//
// One number per map off the campaign order, over a scale of 26
// (lib/game/wits.ts): the first fight thinks at 1/26 — a little, never
// zero — the campaign's final at 25/26, and the full 1 is RESERVED for the
// secret faction's second pass, the day it exists. Smooth in between,
// where the turn timer steps per island.

import { test, expect } from '@playwright/test'

import { ARENA_WITS, ISLAND_STEP, LARD_WITS, witsFor } from '../src/lib/game/wits'
import { CAMPAIGN_LENGTH, mapAt } from '../src/lib/game/missions'
import { regionOf } from '../src/lib/game/pigmap'

test('the first fight thinks a LITTLE — 1/26, never zero', { tag: '@nodata' }, () => {
  expect(witsFor(mapAt(1)!)).toBeCloseTo(1 / 26, 10)
  expect(witsFor(mapAt(1)!)).toBeGreaterThan(0)
})

test('the campaign final stops at 25/26: the top is reserved for the purple pass', { tag: '@nodata' }, () => {
  expect(witsFor(mapAt(CAMPAIGN_LENGTH - 1)!)).toBeCloseTo(25 / 26, 10)
  expect(witsFor(mapAt(CAMPAIGN_LENGTH - 1)!)).toBeLessThan(LARD_WITS)
})

test('the ramp CREEPS across an island and JUMPS at a new one', { tag: '@nodata' }, () => {
  // Play's shape, 2026-08-24: "каждый остров растёт медленно, а новый
  // остров — буст". So the ramp is not one step repeated — it is two, and
  // which one a mission gets is whether it opened an island.
  let last = 0
  const steps: { position: number; step: number; opens: boolean }[] = []
  for (let position = 1; position < CAMPAIGN_LENGTH; position++) {
    const wits = witsFor(mapAt(position)!)
    // RISING, every map, whatever the shape does.
    expect(wits).toBeGreaterThan(last)
    if (position > 1) {
      steps.push({
        position,
        step: wits - last,
        opens: regionOf(position) !== regionOf(position - 1)
      })
    }
    last = wits
  }
  const creeps = steps.filter((one) => !one.opens).map((one) => one.step)
  const jumps = steps.filter((one) => one.opens).map((one) => one.step)
  // Five islands open after the first, so five jumps.
  expect(jumps).toHaveLength(5)
  // Each family is uniform, and a jump is ISLAND_STEP creeps.
  for (const creep of creeps) expect(creep).toBeCloseTo(creeps[0], 10)
  for (const jump of jumps) expect(jump).toBeCloseTo(creeps[0] * ISLAND_STEP, 10)
})

test('…and the ends stay nailed down however the knob is turned', { tag: '@nodata' }, () => {
  // The shape may be argued with; the two ends are play's and are not part
  // of the argument (1/26 for the first fight, 25/26 for Team Lard).
  expect(witsFor(mapAt(1)!)).toBeCloseTo(1 / 26, 10)
  expect(witsFor(mapAt(CAMPAIGN_LENGTH - 1)!)).toBeCloseTo(25 / 26, 10)
  expect(ISLAND_STEP).toBeGreaterThan(1)
})

test('a map outside the campaign plays at the arena setting', { tag: '@nodata' }, () => {
  expect(witsFor('ARCHI')).toBe(ARENA_WITS)
})
