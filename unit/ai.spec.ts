// PHASE 002 (domain) — the computer's turn: the stub brain. Pure, no Electron.
//
// A brain is asked ONCE per free pair of hands (think when idle) and answers
// with one order; the actuator works it out (unit/actuator.spec.ts). The
// stub's whole game: wait out the card, begin, take SKIP TURN, think, pass —
// and the pass is a FIRE order, because skipping IS using SKIP TURN, on the
// player's own road (lib/game/ai.ts).

import { test, expect } from '@playwright/test'

import { AI_START_SECONDS, AI_THINK_SECONDS, createStubBrain } from '../src/lib/game/ai'
import type { AiWorld } from '../src/lib/game/ai'
import { SKILL } from '../src/lib/game/skills'

const world = (starting: boolean): AiWorld => ({ starting, timeLeft: 45, previous: null })

test('the stub waits out the card, begins, takes SKIP TURN, thinks, and passes', { tag: '@nodata' }, () => {
  const brain = createStubBrain()
  expect(brain.decide(world(true))).toEqual({ kind: 'wait', seconds: AI_START_SECONDS })
  expect(brain.decide(world(true))).toEqual({ kind: 'begin' })
  expect(brain.decide(world(false))).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
  expect(brain.decide(world(false))).toEqual({ kind: 'wait', seconds: AI_THINK_SECONDS })
  expect(brain.decide(world(false))).toEqual({ kind: 'fire', charge: 0 })
})

test('a beat resolved by its own timeout still gets a think before the pass', { tag: '@nodata' }, () => {
  // The beat can expire on its own (game.ts burns it down in tick), so the
  // brain may never be asked while `starting` is up.
  const brain = createStubBrain()
  expect(brain.decide(world(false))).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
  expect(brain.decide(world(false))).toEqual({ kind: 'wait', seconds: AI_THINK_SECONDS })
  expect(brain.decide(world(false))).toEqual({ kind: 'fire', charge: 0 })
})

test('a reset is a fresh turn', { tag: '@nodata' }, () => {
  const brain = createStubBrain()
  brain.decide(world(true))
  brain.decide(world(true))
  brain.decide(world(false))
  brain.reset()
  expect(brain.decide(world(true))).toEqual({ kind: 'wait', seconds: AI_START_SECONDS })
})
