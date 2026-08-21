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
}): AiWorld => ({
  timeLeft: 45,
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
  groundAt: () => 0
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

test('a foe the shot would FINISH outbids a nearer healthy one', { tag: '@nodata' }, () => {
  // The seed of the HP differential (docs/ai.md): a kill takes every future
  // turn with it. The wounded pig stands straight ahead — already faced, so
  // choosing it means FIRING, where the nearer healthy one would mean a
  // turn to the side.
  const brain = createGruntBrain()
  const nearHealthy = foe({ x: RANGE * 0.3, z: 0, health: 120 })
  const aheadDying = foe({ health: Math.min(1, damageOf(SKILL.RIFLE)) })
  const order = brain.decide(world({ holding: SKILL.RIFLE, foes: [nearHealthy, aheadDying] }))
  expect(order).toEqual({ kind: 'fire' })
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
