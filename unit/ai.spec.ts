// PHASE 002 (domain) — the computer's turn: the stub brain. Pure, no Electron.
//
// The brain is a function of the battle's own stepped time — never the wall
// clock — because a lockstep battle has to roll the same on both machines
// (lib/game/ai.ts). Today it thinks for a moment and passes.

import { test, expect } from '@playwright/test'

import { AI_START_SECONDS, AI_THINK_SECONDS, createStubBrain } from '../src/lib/game/ai'

test('the stub waits out the card, begins, thinks once, and passes', { tag: '@nodata' }, () => {
  const brain = createStubBrain()
  // The GET READY card hangs while the beat at the top of the turn holds.
  expect(brain.update(AI_START_SECONDS / 2, true)).toBe('wait')
  expect(brain.update(AI_START_SECONDS / 2, true)).toBe('begin')
  // THINK is said once — it is the order that takes SKIP TURN in hand — and
  // the quiet after it is the thinking itself.
  expect(brain.update(0, false)).toBe('think')
  expect(brain.update(AI_THINK_SECONDS / 2, false)).toBe('wait')
  expect(brain.update(AI_THINK_SECONDS / 2, false)).toBe('pass')
})

test('a beat resolved by its own timeout still gets a think before the pass', { tag: '@nodata' }, () => {
  // The beat can expire on its own (game.ts burns it down in tick), so the
  // brain may never be asked while `starting` is up.
  const brain = createStubBrain()
  expect(brain.update(1, false)).toBe('think')
  expect(brain.update(AI_THINK_SECONDS, false)).toBe('pass')
})

test('a reset is a fresh turn', { tag: '@nodata' }, () => {
  const brain = createStubBrain()
  brain.update(AI_START_SECONDS, true)
  brain.update(0, false)
  brain.reset()
  expect(brain.update(AI_START_SECONDS / 2, true)).toBe('wait')
})
