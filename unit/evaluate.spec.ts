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
  crates?: AiWorld['crates']
  wits?: number
}): AiWorld => ({
  timeLeft: 45,
  wits: over.wits ?? 0,
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
  groundAt: () => 0,
  wet: () => false,
  swimming: false,
  swims: false,
  thrown: null,
  planted: null,
  crates: over.crates ?? []
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

test('an ARMED pig barely feels a crate: the greed knob', { tag: '@nodata' }, () => {
  // A sniper upgrade two tiles away: (40−20) × appetite 0.25 = 5 does not
  // cover the walk's tax of 10 — the rifle in hand keeps winning. "Самый
  // тупой комп очень редко берёт ящики."
  const option = priceKit(
    world({ crates: [{ x: 0, z: 1000, skill: SKILL.SNIPER_RIFLE, amount: 2 }] })
  )!
  expect(option.kind).toBe('gun')
  expect(option.skill).toBe(SKILL.RIFLE)
})

test('an UNARMED pig fetches a weapon crate at full worth: necessity is not greed', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({ carrying: [], crates: [{ x: 0, z: 2000, skill: SKILL.BAZOOKA, amount: 2 }] })
  )!
  expect(option.kind).toBe('crate')
})

test('with nobody left to shoot, a health crate is worth the stroll', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({ foes: [], crates: [{ x: 0, z: 1000, skill: null, amount: 50 }] })
  )!
  expect(option.kind).toBe('crate')
})

test('TNT is PLANTED when a foe stands in its blast, never thrown', { tag: '@nodata' }, () => {
  const option = priceKit(
    world({ carrying: [{ skill: SKILL.TNT, amount: 1 }], foes: [foe({ z: 300 })] })
  )!
  expect(option.kind).toBe('plant')
  expect(option.skill).toBe(SKILL.TNT)
})

test('TNT stays in the kit when nobody is near: no walking about with a lit bomb', { tag: '@nodata' }, () => {
  // The plant is priced where the pig STANDS; a far foe gives it nothing,
  // and the only other option is the pass.
  expect(
    priceKit(world({ carrying: [{ skill: SKILL.TNT, amount: 1 }], foes: [foe({ z: 3000 })] }))
  ).toBeNull()
})

test('the WITS dial turns the appetite: the sharp machine fetches what the dull one skips', { tag: '@nodata' }, () => {
  // The same sniper upgrade, nobody left to shoot. At wits 0 a quarter of
  // the 20-point gain does not cover the walk; at wits 1 the full gain does.
  const upgrade = {
    foes: [] as Seen[],
    crates: [{ x: 0, z: 1000, skill: SKILL.SNIPER_RIFLE, amount: 2 }]
  }
  expect(priceKit(world({ ...upgrade, wits: 0 }))).toBeNull()
  const sharp = priceKit(world({ ...upgrade, wits: 1 }))!
  expect(sharp.kind).toBe('crate')
})

test('the solved charge GROWS with the throw', { tag: '@nodata' }, () => {
  // Both stand clear of the thrower's own rim (~1100) — closer throws are
  // rightly refused as self-harm and price to nothing.
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  const near = priceKit(world({ carrying: kit, foes: [foe({ z: 1300 })] }))!
  const far = priceKit(world({ carrying: kit, foes: [foe({ z: 2000 })] }))!
  expect(near.charge).toBeDefined()
  expect(far.charge).toBeDefined()
  expect(far.charge!).toBeGreaterThan(near.charge!)
})
