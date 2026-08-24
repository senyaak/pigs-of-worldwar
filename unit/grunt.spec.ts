// PHASE 002 (domain) — the GRUNT brain. Pure, no Electron.
//
// A brain is a function: world in, one order out (lib/game/grunt.ts). So the
// spec is a set of small worlds and the order each one deserves — no engine,
// no clock, no pig. The guns the worlds carry are the engine's own, and
// every range and damage below is computed from its tables
// (lib/game/projectile.ts) rather than written down, so a rebalance cannot
// rot this file.

import { test, expect } from '@playwright/test'

import { createGruntBrain, SIDE_STEP, FRIEND_CLEARANCE, PITCH_WITHIN } from '../src/lib/game/grunt'
import { CLOSE_TO } from '../src/lib/game/evaluate'
import { BLAST_CORE } from '../src/lib/game/grenade'
import type { AiWorld, Seen } from '../src/lib/game/ai'
import { SKILL } from '../src/lib/game/skills'
import { UNLIMITED } from '../src/lib/game/inventory'
import { damageOf, projectileOf, rangeOf } from '../src/lib/game/projectile'

const RANGE = rangeOf(projectileOf(SKILL.RIFLE)!)

const foe = (over: Partial<Seen> = {}): Seen => ({ x: 0, y: 0, z: RANGE * 0.5, health: 50, ...over })

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
}): AiWorld => ({
  timeLeft: over.timeLeft ?? 45,
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
    holding: over.holding ?? null,
    carrying: over.carrying ?? [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  },
  foes: over.foes ?? [foe()],
  friends: over.friends ?? [],
  // An open field unless a test says otherwise: the route is the goal.
  route: over.route ?? ((to) => [to]),
  groundAt: () => 0,
  wet: over.wet ?? (() => false),
  swimming: over.swimming ?? false,
  swims: over.swims ?? false,
  thrown: over.thrown ?? null,
  planted: over.planted ?? null,
  crates: over.crates ?? []
})

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
  // On the line to the foe, and short of it by CLOSE_TO's own shy margin.
  expect(order.x).toBeCloseTo(0, 5)
  expect(distant.z - order.z).toBeCloseTo(RANGE * CLOSE_TO * 0.8, 5)
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
        thrown: { x: 0, z: 300, resting: false, rim: 600, speed: 2000 }
      })
    )
  ).toEqual({ kind: 'watch' })
  // Rolled to a stop: the second press, wherever it lies.
  expect(
    brain.decide(
      world({
        carrying: kit,
        holding: SKILL.GRENADE,
        thrown: { x: 0, z: 700, resting: true, rim: 600, speed: 0 }
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
        thrown: { x: 0, z: 750, resting: false, rim: 600, speed: 2000 }
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
        thrown: { x: 0, z: 5000, resting: false, rim: 600, speed: 30 }
      })
    )
  ).toEqual({ kind: 'fire' })
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
      thrown: { x: 0, z: 800 - (BLAST_CORE + 300), resting: false, rim: BLAST_CORE + 400, speed: 2000 }
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
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, previous: 'blocked', foes: [foe({ z: RANGE * 0.9 })] })
  )
  expect(order).toEqual({ kind: 'fire' })
})

test('blocked and out of reach: a pass, not a blind volley', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, previous: 'blocked', foes: [foe({ z: RANGE * 2 })] })
  )
  expect(order).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
})

test('blocked is REMEMBERED for the turn, and a reset forgets it', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const distant = [foe({ z: RANGE * 2 })]
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

test('a crate at the trotters IS the dumb target, over a foe further off', { tag: '@nodata' }, () => {
  // "ящик/свин - что ближе": at wits 0 the adjacent crate wins the election
  // outright WHATEVER it holds - five points of health here, deliberately
  // too little for any judgment to want. The same world at wits 1 goes for
  // the foe: the sharp pig weighs the crate at face, finds five points
  // under the shot, and shoots. (A crate actually WORTH the detour is the
  // sharp pig's too - "ящик конечно же важнее всего для самого умного" -
  // which is why the discriminator has to be a poor one.)
  const scene = {
    foes: [foe({ z: 6000 })],
    crates: [{ x: 0, z: 200, skill: null, amount: 5 }]
  }
  const dumb = createGruntBrain()
  dumb.decide(world({ ...scene, wits: 0 }))
  expect(dumb.explain?.()?.chose?.kind).toBe('crate')
  const sharp = createGruntBrain()
  sharp.decide(world({ ...scene, wits: 1 }))
  expect(sharp.explain?.()?.chose?.kind).toBe('gun')
})