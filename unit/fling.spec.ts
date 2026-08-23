// PHASE 002 (domain) — the thrown pig's FLIGHT, and the roll at the end of it.
//
// Play: "всё ещё нет движения по земле — будто трений слишком большое —
// катится на месте." The launch was never the problem (unit/blast.spec.ts
// pins it); what died was the ground roll. The exe's landing threshold is the
// FULL arrival speed — `di` at 0x4711d8 is `[hit+0x14]`, the LENGTH of the
// relative velocity (0x407a44 → 0x418310, an fsqrt of all three components)
// — so a pig skimming fast and flat keeps bouncing, its slope-parallel speed
// surviving every contact, until the whole magnitude drops under 25 a frame.
// Settling on the NORMAL arrival alone discarded 700+ units a second of
// horizontal on the second touch, which is what "катится на месте" was.
//
// The worlds are built to order (unit/fixture.ts) and the flight is the real
// one — `updateLocomotion` at the engine's own step, gravity, bleed, bounce
// and settle included.

import { test, expect } from '@playwright/test'

import { createLocomotion, updateLocomotion } from '../src/lib/game/locomotion'
import type { LocomotionState } from '../src/lib/game/locomotion'
import { burst, flingSpeed } from '../src/lib/game/blast'
import { blastReach } from '../src/lib/game/grenade'
import { DAMAGE_UNIT } from '../src/lib/game/projectile'
import { hurlVelocity } from '../src/lib/game/tumble'
import type { Velocity } from '../src/lib/game/tumble'
import { STEP_SECONDS } from '../src/lib/game/engine'
import { Game } from '../src/lib/game/game'
import { createBus } from '../src/lib/game/events'
import type { TerrainQuery } from '../src/lib/game/terrain'
import { terrain } from './fixture'

/** A grenade's own throw: thirty points at the core. */
const SPEED = flingSpeed(30)

/**
 * The whole flight, at the engine's step: launched from (0,0) with `v`,
 * flown until it settles. Returns where it first touched the ground and
 * where it came to rest — the stretch between the two is the ROLL.
 */
function flown(query: TerrainQuery, v: Velocity): { touchdown: number; rest: number } {
  const s: LocomotionState = createLocomotion(query, 0, 0, 0)
  s.airborne = { ...v, bouncing: true, pushIn: null }
  let touchdown: number | null = null
  for (let frame = 0; frame < 1200 && s.airborne; frame++) {
    updateLocomotion(s, query, { walk: 0, turn: 0, jump: false }, STEP_SECONDS)
    if (touchdown === null && Math.abs(s.y - query.height(s.x, s.z)) < 0.5) touchdown = s.x
  }
  // Settled — an endless slide would be its own bug.
  expect(s.airborne).toBeNull()
  return { touchdown: touchdown ?? s.x, rest: s.x }
}

/** 45° up along +x, as hard as a grenade throws — the knock's own shape. */
const knock: Velocity = { vx: Math.SQRT1_2 * SPEED, vy: -Math.SQRT1_2 * SPEED, vz: 0 }

test('a 45° toss over FLAT ground flies, lands, and ROLLS on along the ground', { tag: '@nodata' }, () => {
  const { touchdown, rest } = flown(terrain(() => 0), knock)
  // The arc itself — measured 1884 at the bench, floored loosely.
  expect(touchdown).toBeGreaterThan(1500)
  // …and the roll past it: the horizontal SURVIVES the landing and is eaten
  // by friction, not discarded. This is the line that failed before the fix
  // (the settle threw 700+ a second away on the second touch: rest — touchdown
  // came out under 30).
  expect(rest - touchdown).toBeGreaterThan(80)
})

test('knocked DOWNHILL, the pig always gets away — the slope only helps', { tag: '@nodata' }, () => {
  // A 30° hillside falling along +x, the throw pointed down it.
  const hill = terrain((x) => -x * Math.tan(Math.PI / 6))
  const flat = flown(terrain(() => 0), knock)
  const down = flown(hill, knock)
  // The ground falls away under the arc, so the flight alone carries further
  // than the whole trip on the flat — and then it still rolls.
  expect(down.touchdown).toBeGreaterThan(flat.touchdown)
  expect(down.rest).toBeGreaterThan(flat.rest)
})

test('knocked INTO a rising slope, it still moves off the spot and comes to rest', { tag: '@nodata' }, () => {
  // The same 30° hillside, thrown up it: the arc is cut short by the rising
  // ground, but the parallel part of the arrival survives the landing and
  // skips on up the hill — no freezing where the flight happened to end.
  const { rest } = flown(terrain((x) => x * Math.tan(Math.PI / 6)), knock)
  expect(rest).toBeGreaterThan(600)
})

test('a BLAST up the hill of a pig on a slope sends it away DOWN the slope', { tag: '@nodata' }, () => {
  // Play's own case: "со склона всегда должен улетать, если в сторону склона
  // откидывает." A pig standing on a 30° hillside, the grenade bursting on
  // the ground 300 up the slope of it — the whole chain: burst → share →
  // hurlVelocity → the real flight.
  const hill = terrain((x) => -x * Math.tan(Math.PI / 6))
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby'] }],
    spawns: [{ x: 0, z: 0, y: 0, body: { footOffset: 100, crownRise: 80 } }]
  })
  const pig = game.currentPig
  let velocity: Velocity | null = null
  burst(
    // On the ground 300 up the slope: higher ground is a SMALLER game y.
    { x: -300, y: -hill.height(-300, 0), z: 0 },
    { damage: 30 * DAMAGE_UNIT, reach: blastReach(1024) },
    {
      pigs: () => [pig],
      targets: [],
      present: () => true,
      training: false,
      fling: (_pig, given) => {
        velocity = given
      }
    },
    createBus().emit
  )
  expect(velocity).not.toBeNull()
  // Down the slope is +x, and the knock's floor makes the pitch 45°.
  expect(velocity!.vx).toBeGreaterThan(0)
  expect(-velocity!.vy).toBeCloseTo(velocity!.vx, 6)
  const { rest } = flown(hill, velocity!)
  expect(rest).toBeGreaterThan(1500)
})
