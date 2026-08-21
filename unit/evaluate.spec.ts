// PHASE 002 (domain) — the price list. Pure, no Electron.
//
// priceKit is a function: world in, best (item × target) out
// (lib/game/evaluate.ts). The worlds below are tiny and the prices are the
// engine's own tables — rifle 20, sniper 40, grenade 30 at the core — so
// nothing here asserts a number the tables do not carry.

import { test, expect } from '@playwright/test'

import { priceKit } from '../src/lib/game/evaluate'
import type { AiWorld, Seen } from '../src/lib/game/ai'
import { SKILL } from '../src/lib/game/skills'
import { UNLIMITED } from '../src/lib/game/inventory'

const foe = (over: Partial<Seen> = {}): Seen => ({ x: 0, y: 0, z: 800, health: 50, ...over })

const world = (over: {
  carrying?: { skill: number; amount: number }[]
  foes?: Seen[]
  friends?: Seen[]
  health?: number
}): AiWorld => ({
  timeLeft: 45,
  previous: null,
  acting: {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    aim: 0,
    health: over.health ?? 50,
    holding: null,
    carrying: over.carrying ?? [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  },
  foes: over.foes ?? [foe()],
  friends: over.friends ?? [],
  route: (to) => [to],
  // Flat ground at zero: the dry-run throw lands when it falls back to it.
  groundAt: () => 0
})

test('an empty kit, or an empty field, prices to nothing', { tag: '@nodata' }, () => {
  expect(priceKit(world({ carrying: [] }))).toBeNull()
  expect(priceKit(world({ foes: [] }))).toBeNull()
})

test('a lone gun prices as a gun at the best-paying foe', { tag: '@nodata' }, () => {
  const option = priceKit(world({}))!
  expect(option.kind).toBe('gun')
  expect(option.skill).toBe(SKILL.RIFLE)
})

test('against a LONE foe out of self-splash the grenade outbids the rifle', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({
      carrying: [
        { skill: SKILL.RIFLE, amount: UNLIMITED },
        { skill: SKILL.GRENADE, amount: 3 }
      ],
      foes: [foe({ z: 1500 })]
    })
  )!
  expect(option.kind).toBe('lob')
  expect(option.skill).toBe(SKILL.GRENADE)
  // In the arc, so the gauge is SOLVED: a real charge, not a default.
  expect(option.charge).toBeGreaterThan(0)
  expect(option.charge).toBeLessThanOrEqual(1)
})

test('a throw that would catch the THROWER is priced down: up close the rifle wins', { tag: '@nodata' }, () => {
  // The blast's whole reach is ~1100 units (core 512 + falloff, lib/game/
  // grenade.ts); at 800 the thrower stands inside his own rim and the ledger
  // says so: 30 to the foe minus ~19 to himself loses to the rifle's clean
  // 20. Self-preservation OUT OF ARITHMETIC — no "don't throw close" rule
  // anywhere.
  const option = priceKit(
    world({
      carrying: [
        { skill: SKILL.RIFLE, amount: UNLIMITED },
        { skill: SKILL.GRENADE, amount: 3 }
      ],
      foes: [foe({ z: 800 })]
    })
  )!
  expect(option.kind).toBe('gun')
})

test('a spent slot is not priced: no grenades left means the rifle', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({
      carrying: [
        { skill: SKILL.RIFLE, amount: UNLIMITED },
        { skill: SKILL.GRENADE, amount: 0 }
      ]
    })
  )!
  expect(option.skill).toBe(SKILL.RIFLE)
})

test('a FRIEND beside the target prices the grenade under the rifle', { tag: '@nodata' }, () => {
  // The blast would catch the friend at full share: his 30 cancels their 30,
  // and the rifle's clean 20 wins. "Не дамажить союзников" as arithmetic.
  const option = priceKit(
    world({
      carrying: [
        { skill: SKILL.RIFLE, amount: UNLIMITED },
        { skill: SKILL.GRENADE, amount: 3 }
      ],
      friends: [foe({ x: 100 })]
    })
  )!
  expect(option.kind).toBe('gun')
})

test('TWO foes clumped make the grenade worth more than the sniper: 60 beats 40', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({
      carrying: [
        { skill: SKILL.SNIPER_RIFLE, amount: UNLIMITED },
        { skill: SKILL.GRENADE, amount: 3 }
      ],
      foes: [foe({ z: 1500 }), foe({ x: 150, z: 1500 })]
    })
  )!
  expect(option.kind).toBe('lob')
})

test('a blade prices like everything else and wins when it is all there is', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({ carrying: [{ skill: SKILL.BAYONET, amount: UNLIMITED }], foes: [foe({ z: 100 })] })
  )!
  expect(option.kind).toBe('melee')
  expect(option.skill).toBe(SKILL.BAYONET)
})

test('the solved charge GROWS with the throw', { tag: '@nodata' }, () => {
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  const near = priceKit(world({ carrying: kit, foes: [foe({ z: 500 })] }))!
  const far = priceKit(world({ carrying: kit, foes: [foe({ z: 1100 })] }))!
  expect(near.charge).toBeDefined()
  expect(far.charge).toBeDefined()
  expect(far.charge!).toBeGreaterThan(near.charge!)
})
