// PHASE 002 (domain) — the difficulty dial. Pure, no Electron.
//
// One number per map, 0..1, off the campaign order (lib/game/wits.ts): the
// first fight is the dumbest machine, Team Lard the sharpest, and every
// position in between a little more than the one before — smooth, where
// the turn timer steps per island.

import { test, expect } from '@playwright/test'

import { ARENA_WITS, witsFor } from '../src/lib/game/wits'
import { CAMPAIGN_LENGTH, mapAt } from '../src/lib/game/missions'

test('the training ground and the first fight think at zero', { tag: '@nodata' }, () => {
  expect(witsFor('CAMP')).toBe(0)
  expect(witsFor(mapAt(1)!)).toBe(0)
})

test('Team Lard thinks at one, and the ramp between is smooth and rising', { tag: '@nodata' }, () => {
  expect(witsFor(mapAt(CAMPAIGN_LENGTH - 1)!)).toBe(1)
  let last = 0
  for (let position = 2; position < CAMPAIGN_LENGTH; position++) {
    const wits = witsFor(mapAt(position)!)
    expect(wits).toBeGreaterThan(last)
    // SMOOTH: no step bigger than twice the even share.
    expect(wits - last).toBeLessThanOrEqual(2 / (CAMPAIGN_LENGTH - 2))
    last = wits
  }
})

test('a map outside the campaign plays at the arena setting', { tag: '@nodata' }, () => {
  expect(witsFor('ARCHI')).toBe(ARENA_WITS)
})
