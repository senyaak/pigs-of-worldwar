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
import { damageOf } from '../src/lib/game/projectile'

const foe = (over: Partial<Seen> = {}): Seen => ({ x: 0, y: 0, z: 800, health: 50, ...over })

const world = (over: {
  carrying?: { skill: number; amount: number }[]
  foes?: Seen[]
  friends?: Seen[]
  health?: number
  crates?: AiWorld['crates']
  wits?: number
  wet?: AiWorld['wet']
  groundAt?: AiWorld['groundAt']
  timeLeft?: number
}): AiWorld => ({
  timeLeft: over.timeLeft ?? 45,
  wits: over.wits ?? 0,
  // Neutral: the price list is tested on its own arithmetic — the
  // misjudgment is the BRAIN's and pinned in unit/grunt.spec.ts.
  roll: () => 0.5,
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
  groundAt: over.groundAt ?? (() => 0),
  wet: over.wet ?? (() => false),
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

test('a throw that comes down ON WATER is worth nothing — the engine douses it', { tag: '@nodata' }, () => {
  // The same foe the dry test above prices a grenade for, but he stands in
  // the shallows: the landing is wet, there is no blast to price, and a kit
  // with only the grenade passes rather than feeding the bay. This is the
  // machine-mission stall in miniature — two pigs once threw doused
  // grenades at each other for a simulated hour.
  const option = priceKit(
    world({
      carrying: [{ skill: SKILL.GRENADE, amount: 3 }],
      foes: [foe({ z: 1500 })],
      wet: (_x, z) => z > 800
    })
  )
  expect(option).toBeNull()
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

test('the WITS dial turns the appetite: the dull pig barely values the crate the sharp one prizes', { tag: '@nodata' }, () => {
  // The same sniper upgrade, nobody left to shoot. This test used to expect
  // the dull pig to price it to NOTHING and pass — superseded by two of
  // play's later rulings: a pig with nothing else to do takes the job
  // (crateFallback's lesson), and "что ближе — это моя цель" needs a near
  // crate ALIVE in the list (FAR_FLOOR reaches crates now). What the dial
  // still turns is the VALUE: a sliver at the bottom, the taxed gain at the
  // top — which is what keeps a dull pig off crates whenever any weapon
  // scores at all.
  const upgrade = {
    foes: [] as Seen[],
    crates: [{ x: 0, z: 1000, skill: SKILL.SNIPER_RIFLE, amount: 2 }]
  }
  const dull = priceKit(world({ ...upgrade, wits: 0 }))!
  expect(dull.kind).toBe('crate')
  const sharp = priceKit(world({ ...upgrade, wits: 1 }))!
  expect(sharp.kind).toBe('crate')
  expect(dull.score).toBeLessThan(2)
  expect(sharp.score).toBeGreaterThan(dull.score * 5)
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


test('the walk is TOLLED: a near healthy foe outbids a far nearly-dead one at dumb wits', { tag: '@nodata' }, () => {
  // GINGER, telemetry 2026-08-24: with a flat tax the +2 wits-scaled finish
  // bonus bought a 23-tile march. The toll is per tile now, so the near foe
  // wins the dumb election - and at wits 1 the full KILL_BONUS still pays
  // for the same march, which is the sharp play.
  const near = foe({ z: 2000, health: 50 })
  const far = foe({ z: 12000, health: 10 })
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const dumb = priceKit(world({ carrying: kit, foes: [near, far], wits: 0 }))!
  expect(dumb.target).toBe(near)
  const sharp = priceKit(world({ carrying: kit, foes: [near, far], wits: 1 }))!
  expect(sharp.target).toBe(far)
})

test('distance never argues the ONLY weapon out of existence', { tag: '@nodata' }, () => {
  // The first cut of the toll ran a lone rifle below zero across the map
  // and the brain passed forever; a sliver of the worth survives any walk
  // (FAR_FLOOR).
  const option = priceKit(world({ foes: [foe({ z: 20000 })] }))
  expect(option).not.toBeNull()
  expect(option!.kind).toBe('gun')
  expect(option!.score).toBeGreaterThan(0)
})

test('DISTANCE is the DUMB pig\'s problem, and the CLOCK is the smart one\'s', { tag: '@nodata' }, () => {
  // Play's rule, 2026-08-24: "тупые смотрят на ближайшую цель; а умные
  // оценивают лучший результат независимо от расстояния и учитывают
  // таймер." So the same far foe is priced two different ways.
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const far = foe({ z: 12_000 })
  const worth = damageOf(SKILL.RIFLE)
  // At the TOP of the dial, with the whole clock: the toll is gone and the
  // option is worth what the shot is worth.
  const sharp = priceKit(world({ carrying: kit, foes: [far], wits: 1, timeLeft: 90 }))!
  expect(sharp.score).toBeCloseTo(worth, 5)
  // At the BOTTOM, the same option is taxed for every tile of the hike.
  const dull = priceKit(world({ carrying: kit, foes: [far], wits: 0, timeLeft: 90 }))!
  expect(dull.score).toBeLessThan(sharp.score)
  // …and the smart pig's own brake is the TIMER, not the distance: the same
  // far foe with seconds on the clock is discounted, where the dumb pig —
  // who cannot read a clock — prices it exactly as before.
  const hurried = priceKit(world({ carrying: kit, foes: [far], wits: 1, timeLeft: 3 }))!
  expect(hurried.score).toBeLessThan(sharp.score)
  const dullHurried = priceKit(world({ carrying: kit, foes: [far], wits: 0, timeLeft: 3 }))!
  expect(dullHurried.score).toBeCloseTo(dull.score, 5)
})

test('a foe already in REACH is never discounted for the clock', { tag: '@nodata' }, () => {
  // The clock is asked about the WALK. A pig standing in range with three
  // seconds left does what it can with them, and a brain that discounted
  // that would talk itself out of the only move on the board.
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const near = foe({ z: 800 })
  const whole = priceKit(world({ carrying: kit, foes: [near], wits: 1, timeLeft: 90 }))!
  const hurried = priceKit(world({ carrying: kit, foes: [near], wits: 1, timeLeft: 3 }))!
  expect(hurried.score).toBeCloseTo(whole.score, 5)
})

test('a shot the ground would swallow scores nothing, and the grenade takes over', { tag: '@nodata' }, () => {
  // Play: "третий свин стрельнул через гору - пуля попала в землю". A hill
  // between the pigs (Y-DOWN: the ground ABOVE them is a smaller y) blanks
  // the rifle; the grenade lobs over it and wins the election.
  const hill: AiWorld['groundAt'] = (_x, z) => (z > 500 && z < 1000 ? -800 : 0)
  const kit = [
    { skill: SKILL.RIFLE, amount: UNLIMITED },
    { skill: SKILL.GRENADE, amount: 3 }
  ]
  const option = priceKit(world({ carrying: kit, foes: [foe({ z: 1500 })], groundAt: hill }))!
  expect(option.kind).toBe('lob')
  expect(option.skill).toBe(SKILL.GRENADE)
  // …and with only the rifle, the blocked shot is not taken at all.
  const rifled = priceKit(
    world({ carrying: [{ skill: SKILL.RIFLE, amount: UNLIMITED }], foes: [foe({ z: 1500 })], groundAt: hill })
  )
  expect(rifled).toBeNull()
})

test('a RIDGE in the arc: the smart pig pitches over it, the dumb one cannot throw', { tag: '@nodata' }, () => {
  // Play's order (2026-08-24): pitch tuning for the smart alone. A
  // 1200-high ridge across z 1000..2000 kills the 45° arc on its near face
  // (the full flat-out throw dies at ~z 1000), so at wits 0 the foe at
  // z 3000 is out of the arc — no charge, walk closer. At wits 1 the
  // ladder finds a steeper come-up whose arc clears the ridge and lands on
  // him: the option carries the tuned aim and its solved charge.
  const ridge: AiWorld['groundAt'] = (_x, z) => (z > 1000 && z < 2000 ? -1200 : 0)
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  const target = foe({ z: 3000 })
  const sharp = priceKit(world({ carrying: kit, foes: [target], wits: 1, groundAt: ridge }))!
  expect(sharp.kind).toBe('lob')
  expect(sharp.aim).toBeGreaterThan(512)
  expect(sharp.charge).toBeDefined()
  const dull = priceKit(world({ carrying: kit, foes: [target], wits: 0, groundAt: ridge }))!
  expect(dull.kind).toBe('lob')
  expect(dull.aim).toBeUndefined()
  expect(dull.charge).toBeUndefined()
})

test('flat ground needs no tuning: a smart lob keeps the 45° start', { tag: '@nodata' }, () => {
  // The ladder stops at the first rung that lands within the slack, so an
  // unobstructed throw never climbs and the option carries no aim at all.
  const sharp = priceKit(
    world({ carrying: [{ skill: SKILL.GRENADE, amount: 3 }], foes: [foe({ z: 1500 })], wits: 1 })
  )!
  expect(sharp.kind).toBe('lob')
  expect(sharp.aim).toBeUndefined()
  expect(sharp.charge).toBeDefined()
})