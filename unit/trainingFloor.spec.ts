// PHASE 002 (domain) — the training ground's floor hands the turn on. Pure, no
// Electron.
//
// exe: `damage/training-floor.md` in the disasm repo, 0x467c76. On CAMP a pig
// that falls under one point is left on one, and if it is the pig being played
// its turn is over, WHATEVER hurt it. The rest of the way, the turn's end itself
// on the running battle, is e2e/002/drown.spec.ts.
//
// Each cause here is the real module that deals it, on the battle's real bus and
// listener: the point is that no way of hurting a pig forgets to say so.

import { test, expect } from '@playwright/test'

import { fromExeFrames, FRAME_SECONDS } from '../src/lib/game/ballistics'
import { listen } from '../src/lib/game/battle/listeners'
import type { BattleCore } from '../src/lib/game/battle/core'
import { createState } from '../src/lib/game/battle/state'
import type { BattleState } from '../src/lib/game/battle/state'
import { burst } from '../src/lib/game/blast'
import { NO_BODY } from '../src/lib/game/body'
import { createDrowning } from '../src/lib/game/drowning'
import { createBus } from '../src/lib/game/events'
import type { Emit } from '../src/lib/game/events'
import { FALL_GATE, chargeLanding } from '../src/lib/game/falling'
import { Game } from '../src/lib/game/game'
import type { Pig } from '../src/lib/game/game'
import { GAS_OPEN_FRAMES, createGas } from '../src/lib/game/gas'
import { blastReach } from '../src/lib/game/grenade'
import type { Lobbed } from '../src/lib/game/grenade'
import { TRAINING_FLOOR, hurtPig, isDead } from '../src/lib/game/health'
import type { LocomotionState } from '../src/lib/game/locomotion'
import { createPoison } from '../src/lib/game/poison'
import { DAMAGE_UNIT } from '../src/lib/game/projectile'
import { TILE_WATER } from '../src/lib/formats/pmg'
import { terrain } from './fixture'

const FULL_HEALTH = 90
/** Low enough for every cause below to take it under one point. */
const NEARLY_OUT = 2
/** The gas canister's skill (lib/game/grenade.ts). */
const GAS_SKILL = 26
/** Long enough in the water for its ramp to cost more than `NEARLY_OUT`. */
const SOAK_FRAMES = 50

/** Two pigs, a side each, the first of them being played. */
const field = (): { acting: Pig; other: Pig; emit: Emit; state: BattleState } => {
  const game = new Game({
    players: [
      { name: 'Tommy', pigNames: ['Nobby'] },
      { name: 'Fritz', pigNames: ['Hans'] }
    ],
    spawns: [
      { x: 0, z: 0, y: 0, body: NO_BODY },
      { x: 3000, z: 0, y: 0, body: NO_BODY }
    ]
  })
  const everyone = game.players.flatMap((player) => player.pigs)
  const [acting, other] = everyone
  const bus = createBus()
  const state = createState(game, terrain(() => 0), () => false)
  listen({ game, emit: bus.emit, everyone: () => everyone, state, bus } as unknown as BattleCore)
  return { acting, other, emit: bus.emit, state }
}

enum Cause {
  Water = 'water',
  Poison = 'poison',
  Landing = 'landing',
  Gas = 'gas',
  Blast = 'blast'
}

/** What each cause does on the training ground, through the module that deals it. */
const CAUSES: Record<Cause, (pig: Pig, emit: Emit) => void> = {
  // exe: `water/notes.md`, 0x4700e5 — cause 1.
  [Cause.Water]: (pig, emit) => {
    const query = terrain(
      () => 0,
      () => ({ type: TILE_WATER })
    )
    const drowning = createDrowning({ pigs: () => [pig], query, training: true }, emit)
    for (let frame = 0; frame < SOAK_FRAMES; frame++) {
      drowning.update(FRAME_SECONDS, { acting: null, walkAway: false, aloft: false })
    }
  },
  // exe: `damage/notes.md`, 0x470413 — cause 3, ten points at the top of a turn.
  [Cause.Poison]: (pig, emit) => {
    const poison = createPoison({ training: true }, emit)
    poison.afflict(pig)
    poison.turnStarted(pig)
  },
  // exe: `movement/falling.md`, 0x4aa010 — cause 4, a hard landing's flat four.
  [Cause.Landing]: (pig, emit) => {
    const landed = { impact: { flying: true, speed: FALL_GATE + 1 } }
    chargeLanding(pig, landed as unknown as LocomotionState, true, emit)
  },
  // exe: `weapons/gas.md`, 0x477b54 — the touch is fifteen flat, and cause 0, so
  // it ends the turn by itself too (`turns/notes.md`, 0x467c56; unit/gas.spec.ts).
  [Cause.Gas]: (pig, emit) => {
    const poison = createPoison({ training: true }, emit)
    const gas = createGas({ pigs: () => [pig], training: true, poison }, emit)
    const canister: Lobbed = {
      id: 7,
      skill: GAS_SKILL,
      x: pig.position.x,
      y: pig.position.y,
      z: pig.position.z,
      vx: 0,
      vy: 0,
      vz: 0,
      heading: 0,
      fuse: 5,
      age: fromExeFrames(GAS_OPEN_FRAMES),
      resting: false,
      doused: false,
      sinking: 0,
      owner: 9
    }
    gas.stream(canister)
  },
  // exe: `turns/notes.md`, 0x467c56 — cause 0, which ends the turn by itself too.
  [Cause.Blast]: (pig, emit) => {
    burst(
      pig.position,
      { damage: 30 * DAMAGE_UNIT, reach: blastReach(1024), force: 0 },
      { pigs: () => [pig], targets: [], present: () => true, training: true },
      emit
    )
  }
}

for (const cause of Object.values(Cause)) {
  test(`${cause}: at the floor the acting pig's turn ends`, { tag: '@nodata' }, () => {
    const { acting, emit, state } = field()
    acting.health = NEARLY_OUT
    CAUSES[cause](acting, emit)
    // exe: `damage/training-floor.md`, 0x467c85 — the floor, one point — and
    // 0x467c9d, the turn handed on with no test of the cause anywhere in the arm.
    expect(acting.health).toBe(TRAINING_FLOOR)
    expect(isDead(acting)).toBe(false)
    expect(state.spent).toBe(true)
  })

  test(`${cause}: another pig reaching the floor costs the acting pig nothing`, { tag: '@nodata' }, () => {
    const { other, emit, state } = field()
    other.health = NEARLY_OUT
    CAUSES[cause](other, emit)
    expect(other.health).toBe(TRAINING_FLOOR)
    // exe: `damage/training-floor.md`, 0x467c98 — the compare with the played pig.
    expect(state.spent).toBe(false)
  })
}

// The causes that are no blow, so nothing but the floor can end the turn with them.
for (const cause of [Cause.Water, Cause.Poison, Cause.Landing]) {
  test(`${cause}: above the floor the turn goes on`, { tag: '@nodata' }, () => {
    const { acting, emit, state } = field()
    acting.health = FULL_HEALTH
    CAUSES[cause](acting, emit)
    expect(acting.health, 'it was hurt').toBeLessThan(FULL_HEALTH)
    // exe: `damage/training-floor.md`, 0x467c83 — over 0x7f the arm is skipped.
    expect(acting.health).toBeGreaterThan(TRAINING_FLOOR)
    expect(state.spent).toBe(false)
  })
}

test('landing ON one point is an ordinary hit: the floor catches only what falls under it', { tag: '@nodata' }, () => {
  const { acting, emit, state } = field()
  acting.health = TRAINING_FLOOR + 10
  hurtPig(acting, 10, true, emit)
  // exe: `damage/training-floor.md`, 0x467c7f — the test is `<= 0x7f`, and one
  // whole point is 0x80.
  expect(acting.health).toBe(TRAINING_FLOOR)
  expect(state.spent).toBe(false)
})

test('a pig already on the floor pays again for the next hit, but not for one of nothing', { tag: '@nodata' }, () => {
  const { acting, emit, state } = field()
  acting.health = TRAINING_FLOOR
  // exe: `damage/training-floor.md`, 0x467ef2 — the zero-amount call the wound
  // routine makes reaches the arm and finds 0x80, which is over the test.
  hurtPig(acting, 0, true, emit)
  expect(state.spent).toBe(false)
  // The smallest hit there is: water's one 128th of a point.
  hurtPig(acting, 1 / 128, true, emit)
  expect(acting.health).toBe(TRAINING_FLOOR)
  expect(state.spent).toBe(true)
})

test('off the training ground there is no floor to reach', { tag: '@nodata' }, () => {
  const { acting, emit, state } = field()
  acting.health = NEARLY_OUT
  hurtPig(acting, 10, false, emit)
  // exe: `damage/training-floor.md`, 0x467c76 — the flag gates the whole arm. A
  // dead acting pig ends its turn by another road (lib/game/battle/turnEnd.ts).
  expect(isDead(acting)).toBe(true)
  expect(state.spent).toBe(false)
})
