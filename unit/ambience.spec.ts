// PHASE 002 (domain) — THE WAR BEYOND THE MAP'S EDGE. Pure: a clock and two
// lists (audio/ambience.ts), driven with a rigged roll so nothing here is
// timing-dependent.

import { test, expect } from '@playwright/test'

import { createAmbience, BIRD_GAP, DISTANT_GAP } from '../src/renderer/src/audio/ambience'
import { SILENT } from '../src/renderer/src/audio/bank'

/** Always the range's floor, and always the first cue of a family. */
const first = (): number => 0

test('nothing sounds before the first wait is out', { tag: '@nodata' }, () => {
  const ambience = createAmbience(() => SILENT, first)
  // A battle opens on its drop-in, which has noises of its own: the first
  // ambient wait is a whole one, not a roll from zero.
  ambience.update(DISTANT_GAP[0] - 0.1, true)
  expect(ambience.heard()).toEqual([])
})

test('the distant battle and the birds keep their own clocks', { tag: '@nodata' }, () => {
  const ambience = createAmbience(() => SILENT, first)
  // Past the distant floor but short of the birds': one, and only one.
  ambience.update(DISTANT_GAP[0], true)
  expect(ambience.heard()).toEqual(['BATT_L1'])
  // …and past the birds' floor, the other family speaks too — the distant
  // one having restarted its own wait rather than repeating.
  ambience.update(BIRD_GAP[0] - DISTANT_GAP[0], true)
  expect(ambience.heard()).toEqual(['BATT_L1', 'AMB_1D'])
})

test('a stopped world is a SILENT one, and it does not count down', { tag: '@nodata' }, () => {
  const ambience = createAmbience(() => SILENT, first)
  // Ten times the longest wait, with the world stopped: nothing, and nothing
  // banked up either — an ambience that fired the moment a pause lifted
  // would be the one noise a pause could not stop.
  for (let i = 0; i < 10; i++) ambience.update(BIRD_GAP[1], false)
  expect(ambience.heard()).toEqual([])
  ambience.update(DISTANT_GAP[0], true)
  expect(ambience.heard()).toEqual(['BATT_L1'])
})

test('the roll picks WHICH of a family, and it is bounded', { tag: '@nodata' }, () => {
  // A roll of almost-one must land on the last entry rather than past it.
  const ambience = createAmbience(() => SILENT, () => 0.999999)
  ambience.update(DISTANT_GAP[1], true)
  expect(ambience.heard()).toEqual(['BATT_S3'])
})
