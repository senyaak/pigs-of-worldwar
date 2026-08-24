// PHASE 002 (domain) — the price list. Pure, no Electron.
//
// priceKit is a function: world in, best (item × target) out
// (lib/game/evaluate.ts). The worlds below are tiny and the prices are the
// engine's own tables — rifle 20, sniper 40, grenade 30 at the core — so
// nothing here asserts a number the tables do not carry.

import { test, expect } from '@playwright/test'

import {
  priceKit,
  crateErrand,
  crateFallback,
  BLOW_SPARE,
  CRATE_APPETITE,
  FAR_FLOOR,
  TURN_DISCOUNT
} from '../src/lib/game/evaluate'
import { WALK_SPEED } from '../src/lib/game/movement'
import type { AiWorld, Seen } from '../src/lib/game/ai'
import { SKILL } from '../src/lib/game/skills'
import { UNLIMITED } from '../src/lib/game/inventory'
import { damageOf } from '../src/lib/game/projectile'

const foe = (over: Partial<Seen> = {}): Seen => ({ x: 0, y: 0, z: 800, health: 50, ...over })

/** The spec's stand-in for the battle's FLOOD (lib/game/pathfind.ts): the
 * walk's own length measured along whatever route the world hands out, from
 * the acting pig at the origin. So a world with a bending route costs the
 * bend, exactly as the real one does. */
const legsFrom = (
  at: { x: number; z: number },
  route: (to: { x: number; z: number }) => { x: number; z: number }[] | null
): AiWorld['reach'] =>
  () => ({
    walk: (to) => {
      const corners = route(to)
      // `route`'s own contract: EMPTY is "as close as the ground allows",
      // so a goal still far off is one the legs do not reach at all.
      if (corners === null) return Infinity
      if (corners.length === 0 && Math.hypot(to.x - at.x, to.z - at.z) > 128) return Infinity
      let length = 0
      let from = at
      for (const corner of corners) {
        length += Math.hypot(corner.x - from.x, corner.z - from.z)
        from = corner
      }
      return length + Math.hypot(to.x - from.x, to.z - from.z)
    },
    corners: (to) => {
      const corners = route(to)
      if (corners === null) return null
      return corners.length === 0 && Math.hypot(to.x - at.x, to.z - at.z) > 128 ? null : corners
    },
    cells: 0
  })

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
  turnSeconds?: number
}): AiWorld => ({
  timeLeft: over.timeLeft ?? 45,
  turnSeconds: over.turnSeconds ?? 45,
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
  reach: legsFrom({ x: 0, z: 0 }, (to) => [to]),
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
  // A sniper upgrade two tiles away: (40−20) × appetite 0.25 = 5, against
  // the rifle already in hand at 20 — the gun keeps winning. "Самый тупой
  // комп очень редко берёт ящики."
  const option = priceKit(
    world({ crates: [{ x: 0, z: 1000, skill: SKILL.SNIPER_RIFLE, amount: 2 }] })
  )!
  expect(option.kind).toBe('gun')
  expect(option.skill).toBe(SKILL.RIFLE)
})

test('an UNARMED pig fetches a weapon crate at full worth: necessity is not greed', { tag: '@nodata' }, () => {
  // A crate is no longer a CANDIDATE in the election (see the header): it is
  // an errand on the way to the fight, or the whole job when there is no
  // fight to be had. An unarmed pig is the second case and the appetite does
  // not apply to it — the errand wants it outright.
  const scene = world({ carrying: [], crates: [{ x: 0, z: 2000, skill: SKILL.RIFLE, amount: 2 }] })
  expect(priceKit(scene)).toBeNull()
  const errand = crateErrand(scene)!
  expect(errand.kind).toBe('crate')
  expect(errand.worth).toBeCloseTo(damageOf(SKILL.RIFLE), 5)
})

test('with nobody left to shoot, a health crate is worth the stroll', { tag: '@nodata' }, () => {
  const scene = world({ foes: [], crates: [{ x: 0, z: 1000, skill: null, amount: 50 }] })
  expect(priceKit(scene)).toBeNull()
  expect(crateFallback(scene)!.kind).toBe('crate')
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
  // Read through the ERRAND now, which is where a crate is weighed at all
  // (the election never sees one). What the dial turns is the VALUE: a
  // quarter of the gain at the bottom, all of it at the top.
  const upgrade = {
    foes: [] as Seen[],
    crates: [{ x: 0, z: 1000, skill: null, amount: 200 }]
  }
  const dull = crateErrand(world({ ...upgrade, wits: 0 }))!
  const sharp = crateErrand(world({ ...upgrade, wits: 1 }))!
  expect(dull.kind).toBe('crate')
  expect(sharp.kind).toBe('crate')
  expect(dull.score).toBeCloseTo(sharp.score * CRATE_APPETITE, 5)
  expect(sharp.score).toBeGreaterThan(dull.score * 3)
  // The first cut of the toll ran a lone rifle below zero across the map
  // and the brain passed forever; a sliver of the worth survives any walk
  // (FAR_FLOOR).
  const option = priceKit(world({ foes: [foe({ z: 20000 })] }))
  expect(option).not.toBeNull()
  expect(option!.kind).toBe('gun')
  expect(option!.score).toBeGreaterThan(0)
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

test('DISTANCE is priced in TURNS, CONTINUOUSLY, and the price list has no opinion about wits', { tag: '@nodata' }, () => {
  // Play's correction, 2026-08-24: the cost used to be counted in WHOLE
  // turns, so any walk that fit inside the clock was free — and on the first
  // maps the clock is 99 seconds, which at WALK_SPEED is most of an island.
  // It is a FRACTION of a turn now: a walk that eats 80 % of one costs 0.8.
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const worth = damageOf(SKILL.RIFLE)
  // In reach: no walk at all, and the whole worth, whoever is asking. The
  // foe is inside SHELTER_NEAR, so the smart pig's hugging rule has nothing
  // to add either — the mark it wants is where the pig already stands.
  const near = foe({ z: 200 })
  for (const wits of [0, 0.5, 1]) {
    const priced = priceKit(world({ carrying: kit, foes: [near], wits }))!
    expect(priced.walk).toBe(0)
    expect(priced.score).toBeCloseTo(worth, 5)
  }
  // A walk is charged the fraction of a turn it spends — the option carries
  // the walk the search actually found, so the arithmetic is checkable.
  const far = foe({ z: 12_000 })
  const priced = priceKit(world({ carrying: kit, foes: [far] }))!
  expect(priced.walk).toBeGreaterThan(0)
  const turns = (walk: number, seconds: number): number =>
    (walk / WALK_SPEED + BLOW_SPARE) / seconds
  expect(priced.score).toBeCloseTo(worth * TURN_DISCOUNT ** turns(priced.walk, 45), 5)
  // The CLOCK no longer speaks: what is left of this turn changes when a
  // blow lands, not what it is worth.
  const hurried = priceKit(world({ carrying: kit, foes: [far], timeLeft: 5 }))!
  expect(hurried.score).toBeCloseTo(priced.score, 5)
  // …but the turn's LENGTH does: the same walk is a smaller slice of a
  // longer turn.
  const roomy = priceKit(world({ carrying: kit, foes: [far], turnSeconds: 200 }))!
  expect(roomy.score).toBeGreaterThan(priced.score)
  expect(roomy.score).toBeCloseTo(worth * TURN_DISCOUNT ** turns(roomy.walk, 200), 5)
  // …and the wits change none of it.
  const sharp = priceKit(world({ carrying: kit, foes: [far], wits: 1 }))!
  expect(sharp.score).toBeCloseTo(priced.score, 5)
})
test('a foe already in REACH is never charged for the clock', { tag: '@nodata' }, () => {
  // The turns are counted for the WALK. A pig standing in range with three
  // seconds left does what it can with them, and a brain that discounted
  // that would talk itself out of the only move on the board.
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const near = foe({ z: 800 })
  const whole = priceKit(world({ carrying: kit, foes: [near], timeLeft: 90 }))!
  const hurried = priceKit(world({ carrying: kit, foes: [near], timeLeft: 3 }))!
  expect(hurried.score).toBeCloseTo(whole.score, 5)
})

test('a foe MANY turns off keeps a sliver, so a lone weapon is never argued away', { tag: '@nodata' }, () => {
  // The floor exists because the first cut let the toll run a lone rifle
  // below zero and the brain sat down for the rest of the battle.
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const miles = foe({ z: 300_000 })
  const option = priceKit(world({ carrying: kit, foes: [miles], timeLeft: 5 }))!
  expect(option.score).toBeCloseTo(damageOf(SKILL.RIFLE) * FAR_FLOOR, 5)
  expect(option.score).toBeGreaterThan(0)
})

test('a shot the ground would swallow is taken from SOMEWHERE ELSE', { tag: '@nodata' }, () => {
  // Play: "третий свин стрельнул через гору - пуля попала в землю". A hill
  // between the pigs (Y-DOWN: the ground ABOVE them is a smaller y) blanks
  // the straight line — and play's later correction says what to do about
  // it: the firing mark is SEARCHED FOR, so the answer is a different spot,
  // not a lower score. The grenade still wins the election, because it lobs
  // over the hill from where the pig already stands and costs no walk.
  const hill: AiWorld['groundAt'] = (_x, z) => (z > 500 && z < 1000 ? -800 : 0)
  const kit = [
    { skill: SKILL.RIFLE, amount: UNLIMITED },
    { skill: SKILL.GRENADE, amount: 3 }
  ]
  // Whatever the kit picks, it does NOT strike from where the pig stands:
  // the straight line is blocked and the 45° arc dies on the hill's near
  // face, so both families have to move first. (Before the search existed
  // the lob won here by pricing a throw AS IF it landed on the foe — an
  // optimism the walk was assumed to fix.)
  const option = priceKit(world({ carrying: kit, foes: [foe({ z: 1500 })], groundAt: hill }))!
  expect(option.walk).toBeGreaterThan(0)
  // …and with only the rifle the shot is still taken — from off the line,
  // at the price of the walk round.
  const rifled = priceKit(
    world({ carrying: [{ skill: SKILL.RIFLE, amount: UNLIMITED }], foes: [foe({ z: 1500 })], groundAt: hill })
  )!
  expect(rifled.kind).toBe('gun')
  expect(rifled.walk).toBeGreaterThan(0)
  // The mark is beside the hill, not on the crow line through it.
  expect(Math.abs(rifled.stand.x)).toBeGreaterThan(0)
  expect(rifled.score).toBeLessThan(damageOf(SKILL.RIFLE))
})
test('a RIDGE in the arc: the smart pig pitches over it, the dumb one WALKS round', { tag: '@nodata' }, () => {
  // Play's order (2026-08-24): pitch tuning for the smart alone. A
  // 1200-high ridge across z 1000..2000 kills the 45° arc on its near face,
  // so at wits 0 the foe at z 3000 is out of the throw's whole reach — and
  // the dumb pig now does the dumb thing that WORKS: it walks past the ridge
  // to a mark it can throw from, and throws from there with a solved charge.
  // At wits 1 the ladder finds a steeper come-up whose arc clears the ridge
  // from where the pig stands, so the sharp one never moves.
  const ridge: AiWorld['groundAt'] = (_x, z) => (z > 1000 && z < 2000 ? -1200 : 0)
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  const target = foe({ z: 3000 })
  const sharp = priceKit(world({ carrying: kit, foes: [target], wits: 1, groundAt: ridge }))!
  expect(sharp.kind).toBe('lob')
  expect(sharp.walk).toBe(0)
  expect(sharp.aim).toBeGreaterThan(512)
  expect(sharp.charge).toBeDefined()
  const dull = priceKit(world({ carrying: kit, foes: [target], wits: 0, groundAt: ridge }))!
  expect(dull.kind).toBe('lob')
  expect(dull.aim).toBeUndefined()
  expect(dull.walk).toBeGreaterThan(0)
  // Past the ridge, and near enough to the foe to throw at him.
  expect(dull.stand.z).toBeGreaterThan(2000)
  expect(dull.charge).toBeDefined()
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