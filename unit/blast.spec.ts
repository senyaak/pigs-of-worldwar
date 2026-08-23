// PHASE 002 (domain) — WHERE a blast throws a pig. Pure, no Electron.
//
// Play, of the grenade: "до сих пор как-то странно отбрасывает — похоже ещё
// не очень работает взрыв", and then the rule itself: "чтобы свинья летала
// если граната ниже центра тяжести свиньи итд итп." The model that answers
// it is three cases split by the body's own FOOTPRINT (lib/game/tumble.ts
// `hurlVelocity`, lib/game/blast.ts `burst`): a burst inside the trotters'
// circle goes straight UP from below and straight DOWN from above, and
// everything outside it is the engine's one knock — 45° at full speed along
// the flat bearing, the pitch every throw in both originals uses (0x200
// everywhere; the PC exe's own BLAST throws nobody at all, and the fling is
// play's ruling). A first cut let a STEEP centre line win instead, and its
// window was half a pig wide — an offset grenade threw near-vertical with
// no horizontal worth having, and play saw it on a hillside: "должно было
// вверх по горе подвинуть, а он на месте катился".
//
// The worlds here are synthetic — a squad with a measured body, no terrain —
// because what is pinned is the GEOMETRY of the launch, not the flight; the
// flight itself is e2e/002/tumble.spec.ts's, on CAMP's own minefield.

import { test, expect } from '@playwright/test'

import { burst, flingSpeed } from '../src/lib/game/blast'
import { hurlVelocity } from '../src/lib/game/tumble'
import type { Velocity } from '../src/lib/game/tumble'
import { blastReach } from '../src/lib/game/grenade'
import { DAMAGE_UNIT } from '../src/lib/game/projectile'
import { Game } from '../src/lib/game/game'
import type { Pig } from '../src/lib/game/game'
import { createBus } from '../src/lib/game/events'

/** A body with a real waist: the centre of gravity stands 100 above the
 * soles, the way a measured pig's does (lib/game/body.ts). */
const BODY = { footOffset: 100, crownRise: 80 }

/** Thirty points at the core — a grenade's own charge. */
const CHARGE = { damage: 30 * DAMAGE_UNIT, reach: blastReach(1024) }

/**
 * One pig standing at the origin (soles at y = 0, centre at y = −100), a
 * burst at `at`, and the velocity the blast handed it — null when the blast
 * never threw it at all.
 */
function thrown(at: { x: number; y: number; z: number }): Velocity | null {
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby'] }],
    spawns: [{ x: 0, z: 0, y: 0, body: BODY }]
  })
  const pig = game.currentPig
  let velocity: Velocity | null = null
  burst(
    at,
    CHARGE,
    {
      pigs: () => [pig],
      targets: [],
      present: () => true,
      training: false,
      fling: (_flung, given) => {
        velocity = given
      }
    },
    createBus().emit
  )
  return velocity
}

test('a charge UNDER the trotters throws the pig straight UP', { tag: '@nodata' }, () => {
  // The burst sits at the soles, dead centre: the line to the centre of
  // gravity is vertical, so the whole impulse is vertical — up is −Y.
  const v = thrown({ x: 0, y: 0, z: 0 })!
  expect(v).not.toBeNull()
  expect(v.vy).toBeLessThan(0)
  expect(Math.abs(v.vx)).toBeLessThan(1e-6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  // …and as hard as thirty points throw: the full core impulse.
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('OFFSET but still under the trotters: straight up all the same', { tag: '@nodata' }, () => {
  // The burst on the ground 50 to −x of the axis — inside the footprint
  // (PIG_RADIUS 85), so this is still "динамит под свином". A first cut
  // threw along the centre line here, 63° with barely any horizontal, and
  // that read as broken the moment the grenade landed AT the trotters
  // rather than exactly on the axis.
  const v = thrown({ x: -50, y: 0, z: 0 })!
  expect(v.vy).toBeLessThan(0)
  expect(Math.abs(v.vx)).toBeLessThan(1e-6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('just PAST the trotters: the full 45° knock away — no vertical window beyond the body', { tag: '@nodata' }, () => {
  // 120 out is outside the 85 of the footprint. The centre line is still
  // steep (about 40°) but the line does not decide anything any more: the
  // knock is 45° at FULL speed along the flat bearing, which is what makes
  // an offset grenade SHOVE — "если сдвинута, то ещё и по земле откатывает".
  const v = thrown({ x: -120, y: 0, z: 0 })!
  expect(v.vx).toBeGreaterThan(0)
  expect(v.vy).toBeLessThan(0)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  expect(-v.vy).toBeCloseTo(v.vx, 6)
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('a SHALLOW line takes the knock\'s own 45° — nothing is ever thrown flat', { tag: '@nodata' }, () => {
  // The burst 300 out on the ground: the line climbs 1 in 3 — under 45° —
  // and a throw that shallow would hug the ground and be eaten whole by
  // the landing. The engine's every read knock is 0x200 = 45°: away along
  // the flat bearing, 45° up, full speed.
  const v = thrown({ x: -300, y: 0, z: 0 })!
  expect(v.vx).toBeGreaterThan(0)
  expect(v.vy).toBeLessThan(0)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  expect(-v.vy).toBeCloseTo(v.vx, 6)
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('level with the centre: the same 45° knock away', { tag: '@nodata' }, () => {
  const v = thrown({ x: -300, y: -BODY.footOffset, z: 0 })!
  expect(v.vx).toBeGreaterThan(0)
  expect(-v.vy).toBeCloseTo(v.vx, 6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
})

test('a charge ABOVE AND BEHIND knocks the pig 45° away — never swallowed', { tag: '@nodata' }, () => {
  // The line to the centre points down-and-away. A first fix shoved FLAT
  // along the ground — and the flight hugged the terrain, the landing read
  // a zero normal arrival and settled the same frame: play, on uneven
  // ground, "граната попадает на свина — он никуда не сдвинулся". The
  // downward leg becomes the 45° knock instead, and the bounces are the
  // roll-back play remembers.
  const v = thrown({ x: -100, y: -400, z: 0 })!
  expect(v.vx).toBeGreaterThan(0)
  expect(-v.vy).toBeCloseTo(v.vx, 6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('a charge DEAD OVERHEAD slams straight down — the landing does the rest', { tag: '@nodata' }, () => {
  const v = thrown({ x: 0, y: -400, z: 0 })!
  expect(v.vy).toBeCloseTo(flingSpeed(30), 6)
  expect(Math.abs(v.vx)).toBeLessThan(1e-6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
})

test('…and OVERHEAD is the whole footprint, not the axis: offset above still slams down', { tag: '@nodata' }, () => {
  // "Граната прям НАД свиньёй — падает на жопу" — прям над is over the
  // BODY. Fifty off the axis, four hundred up: inside the trotters' circle,
  // so down it goes, on the spot.
  const v = thrown({ x: -50, y: -400, z: 0 })!
  expect(v.vy).toBeCloseTo(flingSpeed(30), 6)
  expect(Math.abs(v.vx)).toBeLessThan(1e-6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
})

test('a burst INSIDE the body has one way to send it: straight up', { tag: '@nodata' }, () => {
  // Exactly at the centre of gravity the line has no length and no
  // direction — the degenerate arm of `hurlVelocity`.
  const v = thrown({ x: 0, y: -BODY.footOffset, z: 0 })!
  expect(v.vy).toBeLessThan(0)
  expect(Math.abs(v.vx)).toBeLessThan(1e-6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('the farther pig is thrown slower — the impulse rides the falloff', { tag: '@nodata' }, () => {
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby', 'Percy'] }],
    spawns: [
      { x: 0, z: 0, y: 0, body: BODY },
      { x: 900, z: 0, y: 0, body: BODY }
    ]
  })
  const pigs = game.players[0].pigs
  const speeds = new Map<number, number>()
  burst(
    { x: 0, y: 0, z: 0 },
    CHARGE,
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training: false,
      fling: (pig: Pig, v: Velocity) => speeds.set(pig.id, Math.hypot(v.vx, v.vy, v.vz))
    },
    createBus().emit
  )
  const [near, far] = pigs
  expect(speeds.get(near.id)!).toBeCloseTo(flingSpeed(30), 6)
  expect(speeds.get(far.id)!).toBeGreaterThan(0)
  expect(speeds.get(far.id)!).toBeLessThan(speeds.get(near.id)!)
})
