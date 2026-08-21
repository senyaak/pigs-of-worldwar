// PHASE 002 (domain) — the GRUNT brain. Pure, no Electron.
//
// A brain is a function: world in, one order out (lib/game/grunt.ts). So the
// spec is a set of small worlds and the order each one deserves — no engine,
// no clock, no pig. The gun the worlds carry is the RIFLE, and every range
// below is computed from the engine's own table (lib/game/projectile.ts)
// rather than written down, so a rebalanced rifle cannot rot this file.

import { test, expect } from '@playwright/test'

import { createGruntBrain, CLOSE_TO, SIDE_STEP, FRIEND_CLEARANCE } from '../src/lib/game/grunt'
import type { AiWorld, Seen } from '../src/lib/game/ai'
import { SKILL } from '../src/lib/game/skills'
import { UNLIMITED } from '../src/lib/game/inventory'
import { projectileOf, rangeOf } from '../src/lib/game/projectile'

const RANGE = rangeOf(projectileOf(SKILL.RIFLE)!)

const world = (over: {
  holding?: number | null
  carrying?: { skill: number; amount: number }[]
  heading?: number
  foes?: Seen[]
  friends?: Seen[]
  previous?: 'done' | 'blocked' | null
  route?: AiWorld['route']
}): AiWorld => ({
  timeLeft: 45,
  previous: over.previous ?? null,
  acting: {
    x: 0,
    z: 0,
    heading: over.heading ?? 0,
    holding: over.holding ?? null,
    carrying: over.carrying ?? [{ skill: SKILL.RIFLE, amount: UNLIMITED }]
  },
  foes: over.foes ?? [{ x: 0, z: RANGE * 0.5, health: 50 }],
  friends: over.friends ?? [],
  // An open field unless a test says otherwise: the route is the goal.
  route: over.route ?? ((to) => [to])
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

test('too far: walk at the nearest foe, stopping shy of the range', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const foe = { x: 0, z: RANGE * 2, health: 50 }
  const order = brain.decide(world({ holding: SKILL.RIFLE, foes: [foe] }))
  expect(order.kind).toBe('walkTo')
  if (order.kind !== 'walkTo') return
  // On the line to the foe, and short of it by CLOSE_TO's own shy margin.
  expect(order.x).toBeCloseTo(0, 5)
  expect(foe.z - order.z).toBeCloseTo(RANGE * CLOSE_TO * 0.8, 5)
})

test('a bending route is walked by its NEXT corner, not the crow line', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const corner = { x: 600, z: 600 }
  const order = brain.decide(
    world({
      holding: SKILL.RIFLE,
      foes: [{ x: 0, z: RANGE * 2, health: 50 }],
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
    world({ holding: SKILL.RIFLE, foes: [{ x: 0, z: RANGE * 2, health: 50 }], route: () => [] })
  )
  expect(order).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
})

test('in range but facing away: turn onto the bearing first', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  // The foe stands square to the RIGHT (+x): bearing π/2 off heading 0.
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, foes: [{ x: RANGE * 0.5, z: 0, health: 50 }] })
  )
  expect(order.kind).toBe('turnTo')
  if (order.kind !== 'turnTo') return
  expect(order.heading).toBeCloseTo(Math.PI / 2, 5)
})

test('in range and facing: fire', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  expect(brain.decide(world({ holding: SKILL.RIFLE }))).toEqual({ kind: 'fire' })
})

test('of two foes the NEARER one is the target', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const near = { x: RANGE * 0.4, z: 0, health: 50 }
  const far = { x: 0, z: RANGE * 0.5, health: 10 }
  // The far one is straight ahead and weaker — the grunt does not care, it
  // turns to the near one. Weighing health is a bigger brain's game.
  const order = brain.decide(world({ holding: SKILL.RIFLE, foes: [far, near] }))
  expect(order.kind).toBe('turnTo')
  if (order.kind !== 'turnTo') return
  expect(order.heading).toBeCloseTo(Math.PI / 2, 5)
})

test('a friend on the firing line means a step aside, not a shot through him', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({
      holding: SKILL.RIFLE,
      // Halfway to the foe and just inside the lane, leaning +x…
      friends: [{ x: FRIEND_CLEARANCE / 2, z: RANGE * 0.25, health: 50 }]
    })
  )
  // …so the step is to -x, off the line the other way.
  expect(order).toEqual({ kind: 'walkTo', x: -SIDE_STEP, z: 0 })
})

test('a friend BEYOND the foe is not in the way', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({
      holding: SKILL.RIFLE,
      friends: [{ x: 0, z: RANGE * 0.75, health: 50 }]
    })
  )
  expect(order).toEqual({ kind: 'fire' })
})

test('blocked in range: shoot from where it stands', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, previous: 'blocked', foes: [{ x: 0, z: RANGE * 0.9, health: 50 }] })
  )
  expect(order).toEqual({ kind: 'fire' })
})

test('blocked and out of reach: a pass, not a blind volley', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const order = brain.decide(
    world({ holding: SKILL.RIFLE, previous: 'blocked', foes: [{ x: 0, z: RANGE * 2, health: 50 }] })
  )
  expect(order).toEqual({ kind: 'hold', skill: SKILL.SKIP_TURN })
})

test('blocked is REMEMBERED for the turn, and a reset forgets it', { tag: '@nodata' }, () => {
  const brain = createGruntBrain()
  const distant = [{ x: 0, z: RANGE * 2, health: 50 }]
  brain.decide(world({ holding: SKILL.RIFLE, previous: 'blocked', foes: distant }))
  // Asked again with no fresh refusal, it still does not try to walk.
  expect(brain.decide(world({ holding: SKILL.RIFLE, foes: distant }))).toEqual({
    kind: 'hold',
    skill: SKILL.SKIP_TURN
  })
  brain.reset()
  expect(brain.decide(world({ holding: SKILL.RIFLE, foes: distant })).kind).toBe('walkTo')
})
