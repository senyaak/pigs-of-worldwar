// PHASE 002 (domain) — WHERE a blast throws a pig. Pure, no Electron.
//
// Play, of the grenade: "до сих пор как-то странно отбрасывает — похоже ещё
// не очень работает взрыв", and then the rule itself: "чтобы свинья летала
// если граната ниже центра тяжести свиньи итд итп." The model that answers
// it is one line: the throw runs along the LINE from the burst point to the
// body's own centre of gravity (lib/game/tumble.ts `hurlVelocity`,
// lib/game/blast.ts `burst`) — the line the exe's one throwing explosion, a
// building going off, throws every pig around it along (0x44050c; the PC
// exe's own BLAST throws nobody at all, and the fling is play's ruling).
// A line pointing INTO the ground is answered by the ground: flat, at full
// speed, away.
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

test('below and beside: up AND away, along the exact line to the centre', { tag: '@nodata' }, () => {
  // The burst lies on the ground 300 to −x: the line to the centre is
  // (300, −100, 0), so the pig flies 3 across for every 1 up, at full speed.
  const v = thrown({ x: -300, y: 0, z: 0 })!
  expect(v.vx).toBeGreaterThan(0)
  expect(v.vy).toBeLessThan(0)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
  expect(v.vx).toBeCloseTo(-3 * v.vy, 6)
  expect(Math.hypot(v.vx, v.vy, v.vz)).toBeCloseTo(flingSpeed(30), 6)
})

test('level with the centre: shoved flat away, no lift at all', { tag: '@nodata' }, () => {
  const v = thrown({ x: -300, y: -BODY.footOffset, z: 0 })!
  expect(v.vx).toBeGreaterThan(0)
  expect(Math.abs(v.vy)).toBeLessThan(1e-6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
})

test('a charge ABOVE AND BEHIND shoves the pig FLAT along the ground', { tag: '@nodata' }, () => {
  // The line to the centre points down-and-away, and the ground answers the
  // downward leg: the shove runs flat, at full speed, away from the blast.
  // Play saw the alternative — the ground swallowing the throw whole: "он
  // как стоял так и стоит — а должен был отброситься по земле в сторону."
  const v = thrown({ x: -100, y: -400, z: 0 })!
  expect(v.vy).toBe(0)
  expect(v.vx).toBeCloseTo(flingSpeed(30), 6)
  expect(Math.abs(v.vz)).toBeLessThan(1e-6)
})

test('a charge DEAD OVERHEAD slams straight down — the landing does the rest', { tag: '@nodata' }, () => {
  const v = thrown({ x: 0, y: -400, z: 0 })!
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
