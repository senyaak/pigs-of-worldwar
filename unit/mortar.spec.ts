// PHASE 002 (domain) — the MORTAR, skill 28, the BOMBARDIER's own weapon. Pure.
//
// Read out of the exe 2026-09-01 (weapons/cluster.md in the disasm repo):
// record +0x10 is 430, so it is kind 42 — speed 500, fifty points over a
// field of 2048, arming 0 under a fuse of 0, which makes it a CONTACT shell
// like the rocket. Its destructor (0x4339A6) then draws effect 0x58 and
// throws THREE sub-shells at pitch 0x3B6, yaws 0x555 apart off the shell's
// own, at full charge and forty apart in height — each id 399, kind 11:
// twenty points over 1024, bursting as effect 0x4A.
//
// And the record's +0x14 is 0, so there is no power gauge to hold: the press
// fires it and the COME-UP is the whole of the aim.

import { test, expect } from '@playwright/test'

import { createLobs } from '../src/lib/game/lobs'
import { SUB_SHELL, lobOf, shardsOf } from '../src/lib/game/grenade'
import { AIM_UNITS } from '../src/lib/game/aim'
import { weaponOf } from '../src/lib/game/weapons'
import { ObstacleField } from '../src/lib/game/obstacles'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const MORTAR = 28

/** Flat ground at zero, one gunner at the origin, nothing else in the world. */
function field(): {
  fire: (aim: number) => void
  lobs: ReturnType<typeof createLobs>
  events: BattleEvent[]
  /** Step until something bursts, and answer the effect ids that did. */
  until: (pops: number) => number[]
} {
  const events: BattleEvent[] = []
  const gunner = {
    id: 9,
    holding: MORTAR,
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
  const blasts = (): number[] =>
    events.flatMap((one) => (one.kind === 'blasted' ? [one.effect] : []))
  return {
    fire: (aim) => {
      expect(lobs.throwOne(gunner, aim, 0xfff)).toBe(true)
    },
    lobs,
    events,
    until(pops) {
      // Ten seconds at the engine's own step is far more arc than any of this
      // has; the count is what ends the walk, not the clock.
      for (let i = 0; i < 600 && blasts().length < pops; i++) lobs.update(1 / 60)
      return blasts()
    }
  }
}

test('the mortar row is the read: kind 42, fifty over 2048, on CONTACT', { tag: '@nodata' }, () => {
  const row = lobOf(MORTAR)!
  expect(row.id).toBe(430)
  expect(row.kind).toBe(42)
  expect(row.speed).toBe(500)
  expect(row.damage).toBe(6400)
  expect(row.blast).toBe(2048)
  expect(row.effect).toBe(0x58)
  expect(row.contact).toBe(true)
})

test('…and its sub-shell is kind 11: twenty over 1024, effect 0x4A', { tag: '@nodata' }, () => {
  const row = lobOf(SUB_SHELL)!
  expect(row.id).toBe(399)
  expect(row.kind).toBe(11)
  expect(row.speed).toBe(250)
  expect(row.damage).toBe(2560)
  expect(row.blast).toBe(1024)
  expect(row.effect).toBe(0x4a)
  expect(row.contact).toBe(true)
})

test('IT HAS NO POWER GAUGE — record +0x14 is 0, and 29 BAZOOKA has one', { tag: '@nodata' }, () => {
  expect(weaponOf(MORTAR).power).toBe(false)
  expect(weaponOf(29).power).toBe(true)
})

test('the three are a third of a turn apart, off the SHELL own yaw', { tag: '@nodata' }, () => {
  const row = lobOf(MORTAR)!
  const heading = Math.PI / 2
  const shards = shardsOf(row, heading)!
  expect(shards).toHaveLength(3)
  expect(shards.every((one) => one.skill === SUB_SHELL)).toBe(true)
  expect(shards.every((one) => one.aim === 0x3b6)).toBe(true)
  // The HEAD is the LAST the exe makes — the one it re-seats the camera on —
  // so the list runs 0xAAA, 0, 0x555 and the heights follow it.
  const step = (0x555 / AIM_UNITS) * 2 * Math.PI
  expect(shards.map((one) => one.heading - heading)).toEqual([2 * step, 0, step])
  expect(shards.map((one) => one.rise)).toEqual([80, 0, 40])
})

test('a shell bursts ONCE and leaves three in the air', { tag: '@nodata' }, () => {
  const { fire, lobs, until } = field()
  fire(0x3c0)
  expect(until(1)).toEqual([0x58])
  const children = lobs.all()
  expect(children).toHaveLength(3)
  expect(children.every((one) => one.skill === SUB_SHELL)).toBe(true)
  // Every one of them is going UP (-y is up) and none is standing still.
  for (const one of children) {
    expect(one.vy).toBeLessThan(0)
    expect(Math.hypot(one.vx, one.vz)).toBeGreaterThan(0)
  }
})

test('…and each of those comes down as its own 0x4A crack', { tag: '@nodata' }, () => {
  const { fire, until, lobs } = field()
  fire(0x3c0)
  expect(until(4)).toEqual([0x58, 0x4a, 0x4a, 0x4a])
  expect(lobs.all()).toHaveLength(0)
})

test('a STEEPER come-up lands it SHORTER — the pitch is the range', { tag: '@nodata' }, () => {
  const where = (aim: number): number => {
    const { fire, lobs, until } = field()
    fire(aim)
    const spot = { x: 0, z: 0 }
    // The burst is where the shell was when it went; catch it before the
    // children start moving the head about.
    for (let i = 0; i < 600; i++) {
      const shell = lobs.all()[0]
      if (!shell || shell.skill === SUB_SHELL) break
      spot.x = shell.x
      spot.z = shell.z
      lobs.update(1 / 60)
    }
    until(1)
    return Math.hypot(spot.x, spot.z)
  }
  expect(where(0x200)).toBeGreaterThan(where(0x300))
  expect(where(0x300)).toBeGreaterThan(where(0x3c0))
})
