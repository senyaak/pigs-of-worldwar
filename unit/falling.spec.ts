// PHASE 002 (domain) — a HARD LANDING costs its flat four. Pure, no Electron.
//
// The exe's shape (lib/game/falling.ts carries the read): only a FLYING body
// is hurt by the ground — thrown, ejected, or a plain fall past the 25-frame
// conversion — and the arrival speed is a GATE at 200 a frame, never a
// multiplier: crossing it costs 508/128ths, kind 4, per qualifying contact.
// A jump cannot hurt you twice over, and the parachute never comes through
// this code at all (lib/game/dropIn.ts is its own descent).

import { test, expect } from '@playwright/test'

import { FALL_GATE, FALL_POINTS, chargeLanding } from '../src/lib/game/falling'
import {
  FLY_AFTER_SECONDS,
  createLocomotion,
  updateLocomotion
} from '../src/lib/game/locomotion'
import { fromExeSpeed } from '../src/lib/game/ballistics'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const STEP = 1 / 60

const pigAt = (health = 75): Pig =>
  ({
    id: 1,
    name: 'SCOUT',
    index: 0,
    health,
    carrying: [],
    holding: null,
    position: { x: 0, y: 0, z: 0 },
    body: NO_BODY,
    heading: 0,
    pigClass: 8,
    gone: false,
    parachutes: false
  }) as unknown as Pig

/** Drop a state from `height` world units up and run it to the ground,
 * charging every contact the way battle and the tumbles do. */
function fallFrom(
  height: number,
  hurled: boolean,
  pig: Pig,
  heard: BattleEvent[]
): void {
  const query = terrain(() => 0)
  const state = createLocomotion(query, 0, 0, 0)
  state.y = -height
  state.airborne = { vx: 0, vy: 0, vz: 0, bouncing: hurled, pushIn: null, hurled }
  const emit = (event: BattleEvent): void => void heard.push(event)
  for (let guard = 0; guard < 3000 && state.airborne !== null; guard++) {
    updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, STEP)
    pig.position = { x: state.x, y: state.y, z: state.z }
    chargeLanding(pig, state, false, emit)
  }
}

test('a THROWN pig slammed down pays the flat four — per hard contact, never scaled', { tag: '@nodata' }, () => {
  const pig = pigAt()
  const heard: BattleEvent[] = []
  // Deep enough to cross the gate: from rest it takes about 4800 units of
  // drop to reach 200 a frame (the integrator's own settle — the same
  // arithmetic the read estimated).
  fallFrom(9000, true, pig, heard)
  const bitten = heard.filter((one) => one.kind === 'damaged')
  expect(bitten.length).toBeGreaterThanOrEqual(1)
  // Every charge is the same flat 508/128 — the speed only gates.
  expect(pig.health).toBeCloseTo(75 - bitten.length * FALL_POINTS, 6)
  expect(bitten[0]).toMatchObject({ amount: 4, pig: pig.id })
})

test('a plain SHORT fall lands free however it arrives — no flying, no bill', { tag: '@nodata' }, () => {
  const pig = pigAt()
  const heard: BattleEvent[] = []
  // Short enough to stay under the 25-frame conversion: the landing is the
  // harmless 0x470910 arm, and the speed never even gets asked.
  fallFrom(900, false, pig, heard)
  expect(pig.health).toBe(75)
  expect(heard.filter((one) => one.kind === 'damaged')).toHaveLength(0)
})

test('…and a plain LONG fall converts mid-air and pays like a thrown one', { tag: '@nodata' }, () => {
  const pig = pigAt()
  const heard: BattleEvent[] = []
  // Deep enough that the drop outlasts FLY_AFTER_SECONDS before the ground.
  fallFrom(20000, false, pig, heard)
  expect(heard.filter((one) => one.kind === 'damaged').length).toBeGreaterThanOrEqual(1)
  expect(pig.health).toBeLessThan(75)
})

test('the gate is the exe\'s 200 a frame, and under it nothing is owed', { tag: '@nodata' }, () => {
  expect(FALL_GATE).toBeCloseTo(fromExeSpeed(200), 6)
  const pig = pigAt()
  const heard: BattleEvent[] = []
  const query = terrain(() => 0)
  const state = createLocomotion(query, 0, 0, 0)
  // A soft flying contact, written the way `fly` writes one.
  state.impact = { speed: FALL_GATE, flying: true }
  chargeLanding(pig, state, false, (event) => void heard.push(event))
  expect(pig.health).toBe(75)
  expect(state.impact).toBeNull()
  // …and the conversion clock is the exe's 25 frames.
  expect(FLY_AFTER_SECONDS).toBeCloseTo(25 / 15, 6)
})
