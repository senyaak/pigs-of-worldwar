// PHASE 002 (domain) — the GRUNT brain. Pure, no Electron.
//
// A brain is a function: world in, one order out (lib/game/grunt.ts). So the
// spec is a set of small worlds and the order each one deserves — no engine,
// no clock, no pig. The guns the worlds carry are the engine's own, and
// every range and damage below is computed from its tables
// (lib/game/projectile.ts) rather than written down, so a rebalance cannot
// rot this file.

import { test, expect } from '@playwright/test'

import {
  createGruntBrain,
  SIDE_STEP,
  FRIEND_CLEARANCE,
  PITCH_WITHIN
} from '../src/lib/game/grunt'
import { CLOSE_TO, SHELTER_FROM, SHELTER_NEAR, STAND_RINGS } from '../src/lib/game/evaluate'
import { BLAST_CORE } from '../src/lib/game/grenade'
import type { AiWorld, Seen } from '../src/lib/game/ai'
import { SKILL } from '../src/lib/game/skills'
import { UNLIMITED } from '../src/lib/game/inventory'
import { damageOf, projectileOf, rangeOf } from '../src/lib/game/projectile'

const RANGE = rangeOf(projectileOf(SKILL.RIFLE)!)

const foe = (over: Partial<Seen> = {}): Seen => ({ x: 0, y: 0, z: RANGE * 0.5, health: 50, ...over })

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
  holding?: number | null
  carrying?: { skill: number; amount: number }[]
  heading?: number
  aim?: number
  foes?: Seen[]
  friends?: Seen[]
  previous?: 'done' | 'blocked' | null
  route?: AiWorld['route']
  thrown?: AiWorld['thrown']
  planted?: AiWorld['planted']
  crates?: AiWorld['crates']
  wet?: AiWorld['wet']
  swimming?: boolean
  swims?: boolean
  wits?: number
  roll?: AiWorld['roll']
  timeLeft?: number
  maxHealth?: number
}): AiWorld => {
  // An open field unless a test says otherwise: the route is the goal.
  const legs = over.route ?? ((to: { x: number; z: number }) => [to])
  return ({
  timeLeft: over.timeLeft ?? 45,
  turnSeconds: 45,
  wits: over.wits ?? 0,
  // 0.5 is the NEUTRAL roll: a misjudgment factor of exactly 1, so every
  // spec below reads the price list's own arithmetic unless it rigs one.
  roll: over.roll ?? (() => 0.5),
  previous: over.previous ?? null,
  acting: {
    x: 0,
    y: 0,
    z: 0,
    heading: over.heading ?? 0,
    aim: over.aim ?? 0,
    health: 50,
    // Room to heal: what a health crate is worth is what it PUTS BACK.
    maxHealth: over.maxHealth ?? 500,
    holding: over.holding ?? null,
    carrying: over.carrying ?? [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  },
  foes: over.foes ?? [foe()],
  friends: over.friends ?? [],
  route: legs,
  reach: legsFrom({ x: 0, z: 0 }, legs),
  groundAt: () => 0,
  wet: over.wet ?? (() => false),
  swimming: over.swimming ?? false,
  swims: over.swims ?? false,
  thrown: over.thrown ?? null,
  planted: over.planted ?? null,
  crates: over.crates ?? []
})
}

test('no gun is the stub game: SKIP TURN in hand, then the pass', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  expect(brain.decide(world({ carrying: [] }))).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
  expect(brain.decide(world({ carrying: [], holding: SKILL.SKIP_TURN }))).toEqual({ kind: 'fire' })
})

test('no foes left is a pass too', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  expect(brain.decide(world({ foes: [] }))).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
})

test('the gun comes out before anything else', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  expect(brain.decide(world({}))).toEqual({ kind: 'hold', skill: SKILL.RIFLE })
})

test('of two guns the kit holds, the harder-hitting one comes out', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  // Whichever the TABLE says hits harder — computed, not assumed, and the
  // tie goes to the first slot exactly as the brain's own fold breaks it.
  const stronger =
    damageOf(SKILL.SNIPER_RIFLE) > damageOf(SKILL.RIFLE) ? SKILL.SNIPER_RIFLE : SKILL.RIFLE
  const order = brain.decide(
    world({
      carrying: [
        { skill: SKILL.RIFLE, amount: UNLIMITED },
        { skill: SKILL.SNIPER_RIFLE, amount: 3 }
      ]
    })
  )
  expect(order).toEqual({ kind: 'hold', skill: stronger })
})

test('a dumb brain MISJUDGES the kit — once a turn, and held', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const kit = [
    { skill: SKILL.RIFLE, amount: UNLIMITED },
    { skill: SKILL.GRENADE, amount: 3 }
  ]
  // The rifle is judged HIGH (first roll) and the grenade LOW (second): at
  // wits 0 the grenade's exact 30 reads under the rifle's exact 20, and the
  // "wrong" gun comes out — an honest mistake, not a die (lib/game/grunt.ts,
  // MISJUDGE; play: "они всегда выбирали бить свиней гранатами").
  const rolls = [0.99, 0.01]
  let handed = 0
  const rigged = (): ReturnType<typeof world> =>
    world({ carrying: kit, roll: () => rolls[Math.min(handed++, rolls.length - 1)] })
  expect(brain.decide(rigged())).toEqual({ kind: 'hold', skill: SKILL.RIFLE })
  // The judgment is rolled ONCE and held for the turn: the same decision
  // asked again spends no new rolls and picks no new gun — a re-rolled
  // judgment is the rifle-skip-rifle flip-flop by another door.
  const asked = handed
  expect(brain.decide(rigged())).toEqual({ kind: 'hold', skill: SKILL.RIFLE })
  expect(handed).toBe(asked)
  // At full wits the judgment IS the truth, whatever the roll says.
  expect(
    createGruntBrain().decide(world({ carrying: kit, wits: 1, roll: () => 0.99 }))
  ).toEqual({ kind: 'hold', skill: SKILL.GRENADE })
})

test('the crate comes FIRST when the clock affords both — the errand', { tag: '@nodata' }, () => {
  // Play's rule at the top of the wits scale: "если хватает времени взять
  // ящик и ударить после — ящик конечно же важнее всего для самого умного."
  const crates = [{ x: 300, z: 0, skill: null, amount: 25 }]
  const brain = createGruntBrain()
  // Rifle in hand, foe in reach, a health crate a stride away and the whole
  // clock: the walk goes THROUGH the crate before any shot.
  expect(brain.decide(world({ holding: SKILL.RIFLE, wits: 1, crates }))).toEqual({
    kind: 'walkTo',
    x: 300,
    z: 0
  })
  // Collected (gone from the world), the same turn falls through to the
  // fight — no memory needed.
  expect(brain.decide(world({ holding: SKILL.RIFLE, wits: 1 })).kind).toBe('fire')
  // …and with five seconds left there is no time for both: the shot comes
  // first and the crate is let go (ERRAND_SPARE).
  expect(
    createGruntBrain().decide(world({ holding: SKILL.RIFLE, wits: 1, crates, timeLeft: 5 })).kind
  ).toBe('fire')
})

test('too far: walk at the target, stopping shy of the range', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const distant = foe({ z: RANGE * 2 })
  const order = brain.decide(world({ holding: SKILL.RIFLE, foes: [distant] }))
  expect(order.kind).toBe('walkTo')
  if (order.kind !== 'walkTo') return
  // On the line to the foe, and short of it by the outermost ring the
  // firing-mark search looks on (lib/game/evaluate.ts, STAND_RINGS) — over
  // open ground the nearest mark is the one straight back toward the pig.
  expect(order.x).toBeCloseTo(0, 5)
  expect(distant.z - order.z).toBeCloseTo(RANGE * CLOSE_TO * STAND_RINGS[0], 5)
})

test('a bending route is walked by its NEXT corner, not the crow line', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const corner = { x: 600, z: 600 }
  const order = brain.decide(
    world({
      holding: SKILL.RIFLE,
      foes: [foe({ z: RANGE * 2 })],
      route: () => [corner, { x: 0, z: RANGE * 1.2 }]
    })
  )
  expect(order).toEqual({ kind: 'walkTo', ...corner })
})

test('a route already walked out is GROUNDED: no reach, so a pass', { tag: '@nodata' }, () => {
  // The pathfinder answers best-effort with nothing left to walk — the foe
  // is beyond reach across something uncrossable — and the grunt passes
  // rather than volleying into the void.
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, foes: [foe({ z: RANGE * 2 })], route: () => [] })
  )
  expect(order).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
})

test('in range but facing away: turn onto the bearing first', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  // The foe stands square to the RIGHT (+x): bearing π/2 off heading 0.
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, foes: [foe({ x: RANGE * 0.5, z: 0 })] })
  )
  expect(order.kind).toBe('turnTo')
  if (order.kind !== 'turnTo') return
  expect(order.heading).toBeCloseTo(Math.PI / 2, 5)
})

test('in range, facing, flat ground: fire', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  expect(brain.decide(world({ holding: SKILL.RIFLE }))).toEqual({ kind: 'fire' })
})

test('of two foes the NEARER one is the target when the pay is even', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const near = foe({ x: RANGE * 0.4, z: 0 })
  const far = foe()
  // Same health, same worth — the grunt turns to the near one.
  const order = brain.decide(world({ holding: SKILL.RIFLE, foes: [far, near] }))
  expect(order.kind).toBe('turnTo')
  if (order.kind !== 'turnTo') return
  expect(order.heading).toBeCloseTo(Math.PI / 2, 5)
})

test('a foe the shot would FINISH outbids a nearer healthy one — at full wits', { tag: '@nodata' }, () => {
  // The seed of the HP differential (docs/ai.md): a kill takes every future
  // turn with it. The wounded pig stands straight ahead — already faced, so
  // choosing it means FIRING, where the nearer healthy one would mean a
  // turn to the side. Valuing that future is the HORIZON knob: the bonus is
  // weighed by wits (lib/game/evaluate.ts, worthOf), so the pick belongs to
  // the sharp end — a dumb pig just shoots whoever is nearer.
  const brain = createGruntBrain()
  const nearHealthy = foe({ x: RANGE * 0.3, z: 0, health: 120 })
  const aheadDying = foe({ health: Math.min(1, damageOf(SKILL.RIFLE)) })
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, wits: 1, foes: [nearHealthy, aheadDying] })
  )
  expect(order).toEqual({ kind: 'fire' })
  // …and the dumbest brain takes the NEAR one instead: equal damage prices
  // equal without the bonus, and the tie goes to the closer target.
  const dull = createGruntBrain().decide(
    world({ holding: SKILL.RIFLE, foes: [nearHealthy, aheadDying] })
  )
  expect(dull.kind).toBe('turnTo')
})

test('SHELTER: a smart pig ends its turn shoulder to shoulder, a dumb one fires where it stands', { tag: '@nodata' }, () => {
  // Play's ruling on self-preservation (2026-08-24): the move is not to run
  // away, it is to stand so close to one of THEIRS that shelling you costs
  // them their own — "встать к нашему свину — так это только умные должны
  // делать". A foe two tiles off, well inside the rifle's range: the dumb
  // pig simply fires, the smart one closes first.
  const near = foe({ z: 2 * 512 })
  const dull = createGruntBrain().decide(world({ holding: SKILL.RIFLE, foes: [near] }))
  expect(dull.kind).toBe('fire')

  const sharp = createGruntBrain().decide(
    world({ holding: SKILL.RIFLE, wits: 1, foes: [near] })
  )
  expect(sharp.kind).toBe('walkTo')
  if (sharp.kind !== 'walkTo') return
  // …to a spot beside him, not on top of him: SHELTER_NEAR off, and the
  // approach's own shy fraction inside that.
  const gap = Math.hypot(sharp.x - near.x, sharp.z - near.z)
  expect(gap).toBeLessThanOrEqual(SHELTER_NEAR)
  expect(gap).toBeGreaterThan(0)
})

test('SHELTER is BOUNDED: a far foe is shot from the weapon\'s own mark', { tag: '@nodata' }, () => {
  // Unbounded, the rule would march a smart pig across the map — which is
  // what the approach tax exists to stop, so the two would be pulling
  // against each other (SHELTER_FROM).
  // Past the shelter bound but well inside the rifle's own reach: the
  // sharpest brain there is shoots from where it stands rather than walking
  // three tiles to hug him.
  const far = foe({ z: SHELTER_FROM + 1000 })
  expect(far.z).toBeLessThan(RANGE * CLOSE_TO)
  expect(createGruntBrain().decide(world({ holding: SKILL.RIFLE, wits: 1, foes: [far] })).kind).toBe(
    'fire'
  )
})

test('THE RIVER: the walk is costed by the ROUTE, not the crow line', { tag: '@nodata' }, () => {
  // Play, 2026-08-24: "нельзя подойти к берегу реки и кинуть гранату — он
  // это не принимает." A foe across water is a stone's throw by the crow
  // line and a long way round by the legs, and the price list was costing
  // the crow line — so a walk that wants three turns looked free.
  //
  // Two identical worlds, one with an open field between and one with a
  // river: the same foe, the same weapon, and the route is the only
  // difference. The far one has to be worth LESS.
  const far = foe({ z: RANGE * 3 })
  const kit = [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  const open = createGruntBrain()
  open.decide(world({ holding: SKILL.RIFLE, foes: [far], carrying: kit, timeLeft: 20 }))
  const straight = open.explain!()!.candidates[0].score

  // …and the same field with the legs sent the long way round: the route
  // doubles back before it heads out, so the walk is far longer than the
  // line even though the target has not moved.
  const round = createGruntBrain()
  round.decide(
    world({
      holding: SKILL.RIFLE,
      foes: [far],
      carrying: kit,
      timeLeft: 20,
      route: (to) => [
        { x: -RANGE * 3, z: 0 },
        { x: -RANGE * 3, z: to.z },
        to
      ]
    })
  )
  const detour = round.explain!()!.candidates[0].score
  expect(detour).toBeLessThan(straight)
})

test('a friend on the firing line means a step aside, not a shot through him', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({
      holding: SKILL.RIFLE,
      // Halfway to the foe and just inside the lane, leaning +x…
      friends: [foe({ x: FRIEND_CLEARANCE / 2, z: RANGE * 0.25 })]
    })
  )
  // …so the step is to -x, off the line the other way.
  expect(order).toEqual({ kind: 'walkTo', x: -SIDE_STEP, z: 0 })
})

test('a friend BEYOND the foe is not in the way', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, friends: [foe({ z: RANGE * 0.75 })] })
  )
  expect(order).toEqual({ kind: 'fire' })
})

test('higher ground raises the barrel — once, then the shot goes', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  // The foe's soles are 500 ABOVE (Y-DOWN: smaller y), a quarter range out.
  const uphill = world({ holding: SKILL.RIFLE, foes: [foe({ y: -500, z: RANGE * 0.25 })] })
  const order = brain.decide(uphill)
  expect(order.kind).toBe('aimTo')
  if (order.kind !== 'aimTo') return
  expect(order.angle).toBeGreaterThan(PITCH_WITHIN)
  // Asked ONCE: whatever the clamp made of it, the next decision fires.
  expect(brain.decide(uphill)).toEqual({ kind: 'fire' })
})

test('a pitch already close enough is not chased', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const level = world({ holding: SKILL.RIFLE, aim: PITCH_WITHIN / 2 })
  expect(brain.decide(level)).toEqual({ kind: 'fire' })
})

test('a lob is fired WITH its solved charge, facing the target', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  const throwing = world({ carrying: kit, foes: [foe({ z: 800 })] })
  expect(brain.decide(throwing)).toEqual({ kind: 'hold', skill: SKILL.GRENADE })
  const order = brain.decide(world({ carrying: kit, holding: SKILL.GRENADE, foes: [foe({ z: 800 })] }))
  expect(order.kind).toBe('fire')
  if (order.kind !== 'fire') return
  // The charge is the lob's AIM: solved, not defaulted — and no aimTo came
  // first, because a grenade keeps its 45° come-up.
  expect(order.charge).toBeGreaterThan(0)
  expect(order.charge!).toBeLessThanOrEqual(1)
})

test('a grenade in flight is WATCHED; landed or on a foe, DETONATED', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  // Mid-flight, far from anybody: nothing to do this beat.
  expect(
    brain.decide(
      world({
        carrying: kit,
        holding: SKILL.GRENADE,
        thrown: { x: 0, z: 300, resting: false, rim: 600, speed: 2000, age: 0.5 }
      })
    )
  ).toEqual({ kind: 'watch' })
  // Rolled to a stop: the second press, wherever it lies.
  expect(
    brain.decide(
      world({
        carrying: kit,
        holding: SKILL.GRENADE,
        thrown: { x: 0, z: 700, resting: true, rim: 600, speed: 0, age: 2 }
      })
    )
  ).toEqual({ kind: 'fire' })
  // Still moving but INSIDE a foe's core: full damage, no reason to let it
  // roll away again.
  expect(
    brain.decide(
      world({
        carrying: kit,
        holding: SKILL.GRENADE,
        foes: [foe({ z: 800 })],
        thrown: { x: 0, z: 750, resting: false, rim: 600, speed: 2000, age: 1 }
      })
    )
  ).toEqual({ kind: 'fire' })
  // CREEPING far from anybody — under the brain's own SETTLED bar though
  // the draw flag never set: press, don't let the fuse beat you to it
  // (telemetry, GINGER 2026-08-24 — a missed throw rolled six seconds).
  expect(
    brain.decide(
      world({
        carrying: kit,
        holding: SKILL.GRENADE,
        thrown: { x: 0, z: 5000, resting: false, rim: 600, speed: 30, age: 3 }
      })
    )
  ).toEqual({ kind: 'fire' })
})

test('a PRICED throw is pressed on the PLAN, not the sensors', { tag: '@nodata' }, () => {
  // Play: "разбор до нажатия броска идёт — траектория уже должна быть у
  // мозга и он точно должен знать когда нажать." The same brain that fires
  // the throw carries its dry-run flight; the press is a clock.
  const brain = createGruntBrain()
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  // Held, faced, in the arc: the decision is the throw itself.
  const armed = brain.decide(world({ carrying: kit, holding: SKILL.GRENADE, foes: [foe({ z: 1500 })] }))
  expect(armed.kind).toBe('fire')
  // Young and fast and far from the foe: the plan says not yet.
  const flying = (age: number): ReturnType<typeof world> =>
    world({
      carrying: kit,
      holding: SKILL.GRENADE,
      foes: [foe({ z: 1500 })],
      thrown: { x: 0, z: 4000, resting: false, rim: 600, speed: 2000, age }
    })
  expect(brain.decide(flying(0.5))).toEqual({ kind: 'watch' })
  // Past the planned landing (a ~1500-unit lob flies about 1.2 s): press,
  // still rolling or not.
  expect(brain.decide(flying(3))).toEqual({ kind: 'fire' })
})

test('the detonation window is the wits dial: the dumb press at the RIM', { tag: '@nodata' }, () => {
  // Play's spec: "надо в радиусе свина нажимать; тупняк только насколько
  // далеко — на самом краю, что единичку снесёт, или в центре."
  const kit = [{ skill: SKILL.GRENADE, amount: 3 }]
  const rolling = (wits: number): ReturnType<typeof world> =>
    world({
      carrying: kit,
      holding: SKILL.GRENADE,
      wits,
      foes: [foe({ z: 800 })],
      // The grenade grazes the blast's outer edge of the foe: outside the
      // core, inside the rim.
      thrown: { x: 0, z: 800 - (BLAST_CORE + 300), resting: false, rim: BLAST_CORE + 400, speed: 2000, age: 1 }
    })
  expect(createGruntBrain().decide(rolling(0))).toEqual({ kind: 'fire' })
  expect(createGruntBrain().decide(rolling(1))).toEqual({ kind: 'watch' })
})

test('a SWIMMING pig has one thought — the nearest shore', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  // Dry land starts at z=400; everything the price list could want is
  // ignored — the water is killing him.
  const order = brain.decide(
    world({ swimming: true, wet: (_x, z) => z < 400, foes: [foe()] })
  )
  expect(order).toEqual({ kind: 'walkTo', x: 0, z: 450 })
  // …and an ocean with no shore in reach is watched to its end.
  expect(brain.decide(world({ swimming: true, wet: () => true }))).toEqual({ kind: 'watch' })
})

test('a SWIMMER mid-crossing keeps swimming for the foe, not the shore', { tag: '@nodata' }, () => {
  // Water everywhere south of the far bank; the pig is crossing it and the
  // foe stands on dry land beyond rifle reach. Transit only: the order is
  // the walk toward the foe's DRY approach point — never a hold or a fire,
  // because swimming hands are empty.
  const brain = createGruntBrain()
  const bank = RANGE * 1.3
  const order = brain.decide(
    world({
      swims: true,
      swimming: true,
      wet: (_x, z) => z < bank,
      foes: [foe({ z: RANGE * 2 })]
    })
  )
  expect(order.kind).toBe('walkTo')
  if (order.kind !== 'walkTo') return
  // The shy mark itself (z = 2R − 0.8·reach) is already on dry land, so the
  // goal is the same one a dry pig would walk to — and it is dry.
  expect(order.x).toBeCloseTo(0, 5)
  expect(order.z).toBeGreaterThan(bank)
})

test('a SWIMMER never fights from the water — the goal it swims to is DRY', { tag: '@nodata' }, () => {
  // The foe is within reach, but the shy mark falls in the water: the pig
  // presses on toward the target until the ground is dry instead of
  // stopping to fight where its hands are empty.
  const brain = createGruntBrain()
  const wet = (_x: number, z: number): boolean => z < RANGE * 0.45
  const order = brain.decide(
    world({ swims: true, swimming: true, wet, foes: [foe({ z: RANGE * 0.7 })] })
  )
  expect(order.kind).toBe('walkTo')
  if (order.kind !== 'walkTo') return
  expect(wet(order.x, order.z)).toBe(false)
})

test('a SWIMMER with nothing to swim FOR makes for the shore like anybody', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ swims: true, swimming: true, wet: (_x, z) => z < 400, foes: [], carrying: [] })
  )
  expect(order).toEqual({ kind: 'walkTo', x: 0, z: 450 })
})

test('TNT at the feet of a foe: hold it, press, then RUN', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const kit = [{ skill: SKILL.TNT, amount: 1 }]
  // A foe inside the blast of where we stand: the price list says plant.
  expect(brain.decide(world({ carrying: kit, foes: [foe({ z: 300 })] }))).toEqual({
    kind: 'hold',
    skill: SKILL.TNT
  })
  expect(
    brain.decide(world({ carrying: kit, holding: SKILL.TNT, foes: [foe({ z: 300 })] }))
  ).toEqual({ kind: 'fire' })
  // Planted at our own feet, facing the foe (heading 0): the flee runs
  // BACKWARDS, out of the rim.
  const fleeing = brain.decide(
    world({ carrying: [], holding: SKILL.TNT, foes: [foe({ z: 300 })], planted: { x: 0, z: 0 } })
  )
  expect(fleeing.kind).toBe('walkTo')
  if (fleeing.kind !== 'walkTo') return
  expect(fleeing.z).toBeLessThan(-1000)
  // …and far enough out, it just watches the show.
  expect(
    brain.decide(world({ carrying: [], holding: SKILL.TNT, planted: { x: 0, z: 2000 } }))
  ).toEqual({ kind: 'watch' })
})

test('an unarmed pig with no foes walks onto the crate that arms it', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const crated = world({
    carrying: [],
    foes: [],
    crates: [{ x: 0, z: 2000, skill: SKILL.BAZOOKA, amount: 2 }]
  })
  expect(brain.decide(crated)).toEqual({ kind: 'walkTo', x: 0, z: 2000 })
})

test('blocked in range: shoot from where it stands', { tag: '@nodata' }, () => {
  // ONE refusal drops the plan and tries again — a body steps aside where a
  // wall does not, and the second plan is made from where the pig now
  // stands. TWO is the world saying no: stop closing in and fire.
  const brain = createGruntBrain()
  const near = [foe({ z: RANGE * 0.9 })]
  brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: near }))
  const order = brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: near }))
  expect(order).toEqual({ kind: 'fire' })
})
test('blocked and out of reach: a pass, not a blind volley', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const distant = [foe({ z: RANGE * 2 })]
  brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: distant }))
  const order = brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: distant }))
  expect(order).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
})
test('blocked is REMEMBERED for the turn, and a reset forgets it', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const distant = [foe({ z: RANGE * 2 })]
  brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: distant }))
  brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: distant }))
  // Asked again with no fresh refusal, it still does not try to walk.
  expect(brain.decide(world({ holding: SKILL.RIFLE, foes: distant }))).toEqual({
    kind: 'hold',
    skill: SKILL.SKIP_TURN
  })
  brain.reset()
  expect(brain.decide(world({ holding: SKILL.RIFLE, foes: distant })).kind).toBe('walkTo')
})
test('THE DUMB EYE: at wits 0 the nearest thing is the target, at wits 1 the arithmetic is', { tag: '@nodata' }, () => {
  // Play's model, 2026-08-24: "я тупой = что ближе всего - ящик/свин - это
  // моя цель; чем умнее - тем больше свин думает." The near healthy foe
  // outbids the far nearly-dead one at the bottom of the dial (the finish
  // bonus reads ~0 there anyway); at the top the KILL_BONUS pays for the
  // march and the far one wins.
  const near = foe({ z: 2000, health: 50 })
  const far = foe({ z: 12000, health: 10 })
  const dumb = createGruntBrain()
  dumb.decide(world({ foes: [near, far], wits: 0 }))
  expect(dumb.explain?.()?.chose?.target).toBe(near)
  const sharp = createGruntBrain()
  sharp.decide(world({ foes: [near, far], wits: 1 }))
  expect(sharp.explain?.()?.chose?.target).toBe(far)
})

test('NOTHING IN REACH: the dumb pig goes for the crate, and the sharp one weighs it', { tag: '@nodata' }, () => {
  // Play's rule, 2026-08-25: "тупой должен — вижу стреляю; не вижу — вижу
  // ящик — беру ящик." The foe is 6000 off, so nothing can be struck from
  // where the pig stands: the dumb eye then pulls the wits-0 pig onto the
  // thing at its trotters and the walk goes THROUGH it. The wits-1 pig reads
  // five points of health at face, finds them under the errand's own bar,
  // and sets off at the foe instead.
  const scene = {
    foes: [foe({ z: 6000 })],
    crates: [{ x: 0, z: 200, skill: null, amount: 5 }]
  }
  const dumb = createGruntBrain()
  expect(dumb.decide(world({ ...scene, wits: 0 }))).toEqual({ kind: 'walkTo', x: 0, z: 200 })
  expect(dumb.explain?.()?.plan?.errand).toBe(true)
  const sharp = createGruntBrain()
  const order = sharp.decide(world({ ...scene, wits: 1 }))
  expect(sharp.explain?.()?.plan?.errand).toBe(false)
  expect(order.kind).toBe('walkTo')
  if (order.kind !== 'walkTo') return
  expect(order.z).toBeGreaterThan(200)
})
test('A THREE-YEAR-OLD MIGHT TAKE THE CRATE OR MIGHT JUST SHOOT — the roll decides', { tag: '@nodata' }, () => {
  // Play's ruling, 2026-08-25, after two readings of "вижу стреляю" that
  // were both too literal, and then a third correction on top of those: "я б
  // сделал своего рода рандом — тупой может и ящик взять, может и тупо
  // стрельнуть", and "50 очков, но тупой это не различает."
  //
  // So at the bottom of the scale the worth is not read at all — a fifty
  // point health crate and a twenty point shot are the same thing to a
  // three-year-old — and what is left is how NEAR each is, which sets the
  // odds, and the turn's own misjudgment factor, which turns them into an
  // answer. The crate and the foe below are about equally near, so the same
  // world gives two different answers on two different rolls.
  //
  // It is chance off the BATTLE's one seeded stream, never a die: the same
  // rolls give the same battle on both machines, which is what lockstep
  // needs (docs/ai.md).
  const scene = {
    holding: SKILL.RIFLE,
    foes: [foe({ z: 1000 })],
    crates: [{ x: 0, z: 800, skill: null, amount: 50 }]
  }
  /** The battle's stream, handed out in order: the gun is judged first, the
   * crate second (lib/game/evaluate.ts, `elect`). */
  const rolls = (...values: number[]): (() => number) => {
    let i = 0
    return () => values[Math.min(i++, values.length - 1)]
  }
  // The gun believed high and the crate low: it turns onto the foe and
  // shoots — no detour, and the plan carries no errand.
  const shoots = createGruntBrain()
  expect(shoots.decide(world({ ...scene, wits: 0, roll: rolls(1, 0) })).kind).toBe('turnTo')
  expect(shoots.explain?.()?.plan?.errand).toBe(false)
  // The other way about, and the SAME world sends it to the crate.
  const fetches = createGruntBrain()
  expect(fetches.decide(world({ ...scene, wits: 0, roll: rolls(0, 1) }))).toEqual({
    kind: 'walkTo',
    x: 0,
    z: 800
  })
  expect(fetches.explain?.()?.plan?.errand).toBe(true)
  // …and at the TOP of the scale there is no toss at all: the spread closes
  // to nothing, so both rolls answer the same. "Умные всегда оценивают
  // бенефиты."
  const sharpA = createGruntBrain()
  const sharpB = createGruntBrain()
  expect(sharpA.decide(world({ ...scene, wits: 1, roll: rolls(1, 0) }))).toEqual(
    sharpB.decide(world({ ...scene, wits: 1, roll: rolls(0, 1) }))
  )
})
test('A HEALTH CRATE IS WORTH WHAT IT PUTS BACK: a topped-up pig walks past one', { tag: '@nodata' }, () => {
  // Play watched DEN take a crate at hp50, then cross the whole island for a
  // second at hp100 and a third after that. The engine has no ceiling and
  // that stands (lib/game/health.ts); what was wrong is the BRAIN pricing a
  // crate at its face value to a pig with nothing to heal.
  const scene = {
    foes: [foe({ z: 6000 })],
    crates: [{ x: 0, z: 200, skill: null, amount: 50 }]
  }
  const hurt = createGruntBrain()
  hurt.decide(world({ ...scene, wits: 0, maxHealth: 500 }))
  expect(hurt.explain?.()?.plan?.errand).toBe(true)
  const topped = createGruntBrain()
  topped.decide(world({ ...scene, wits: 0, maxHealth: 50 }))
  expect(topped.explain?.()?.plan?.errand).toBe(false)
})
