// PHASE 002 (domain) — the CLUSTER GRENADE scatters five bomblets. Pure.
//
// Read out of the exe 2026-08-28 (weapons/cluster.md in the disasm repo):
// kind 25's destructor (0x43290E) spawns its own full 30-point blast
// (effect 0x46, the grenade's row 0) and FIVE projectiles of id 421,
// kind 33, at full charge — four pitched 0x3E8 with yaws a quarter turn
// apart, one dead vertical — each an ordinary timed grenade of its own row:
// fifteen points over 1300, bursting as effect 0x47 (row 6). The camera
// re-seats on the vertical one, which is why it is pushed FIRST.

import { test, expect } from '@playwright/test'

import { createLobs } from '../src/lib/game/lobs'
import { BOMBLET, lobOf } from '../src/lib/game/grenade'
import { ObstacleField } from '../src/lib/game/obstacles'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const CLUSTER = 20

function field(): {
  throwIt: () => void
  lobs: ReturnType<typeof createLobs>
  events: BattleEvent[]
} {
  const events: BattleEvent[] = []
  const thrower = {
    id: 9,
    holding: CLUSTER,
    heading: 0,
    position: { x: 0, y: 0, z: 0 }
  } as unknown as Pig
  const lobs = createLobs(
    {
      pigs: () => [],
      targets: [],
      present: () => true,
      training: false,
      query: terrain(() => 0),
      obstacles: new ObstacleField([]),
      mines: { tread: () => false } as never,
      pose: { boneToWorld: () => ({ x: 0, y: -300, z: 0 }) },
      random: () => 0
    },
    (event) => events.push(event)
  )
  return {
    throwIt: () => {
      expect(lobs.throwOne(thrower, 512, 0xfff)).toBe(true)
    },
    lobs,
    events
  }
}

test('the bomblet row is the read: id 421, kind 33, fifteen over 1300', { tag: '@nodata' }, () => {
  const row = lobOf(BOMBLET)!
  expect(row.id).toBe(421)
  expect(row.kind).toBe(33)
  expect(row.speed).toBe(250)
  expect(row.damage).toBe(1920)
  expect(row.blast).toBe(1300)
  expect(row.effect).toBe(0x47)
})

test('a cluster bursts into its own pop and five bomblets, vertical first', { tag: '@nodata' }, () => {
  const { throwIt, lobs, events } = field()
  throwIt()
  // The hand-detonator cuts the canister's fuse where it flies.
  lobs.detonateNow()
  const pops = events.flatMap((one) => (one.kind === 'blasted' ? [one.effect] : []))
  expect(pops).toEqual([0x46])
  // Five children in the air, all the bomblet's own pseudo-skill — and the
  // FIRST is the vertical one (the exe re-seats the camera on it): straight
  // up is -y, with nothing sideways.
  const children = lobs.all()
  expect(children).toHaveLength(5)
  expect(children.every((one) => one.skill === BOMBLET)).toBe(true)
  const vertical = lobs.head()!
  expect(vertical.vy).toBeLessThan(0)
  expect(Math.abs(vertical.vx)).toBeLessThan(1e-6)
  expect(Math.abs(vertical.vz)).toBeLessThan(1e-6)
  // …and the other four fan a quarter turn apart, steeply up.
  for (const one of children.slice(1)) {
    expect(one.vy).toBeLessThan(0)
    expect(Math.hypot(one.vx, one.vz)).toBeGreaterThan(0)
  }
})

test('each bomblet then bursts as its own 0x47 crack', { tag: '@nodata' }, () => {
  const { throwIt, lobs, events } = field()
  throwIt()
  lobs.detonateNow()
  events.length = 0
  // A second press cuts the five's fuses the same way.
  lobs.detonateNow()
  const pops = events.flatMap((one) => (one.kind === 'blasted' ? [one.effect] : []))
  expect(pops).toEqual([0x47, 0x47, 0x47, 0x47, 0x47])
  expect(lobs.all()).toHaveLength(0)
})
