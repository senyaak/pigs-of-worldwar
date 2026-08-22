// PHASE 002 (domain) — the machine's hands. Pure, no Electron.
//
// The actuator turns one order into the player's own inputs, frame by frame
// (lib/game/actuator.ts). The bench below is a toy pig that answers those
// inputs the way the engine would — turn at TURN_SPEED, walk at WALK_SPEED
// along the heading, fill a gauge while fire is held — so what is pinned is
// the steering, not the world.

import { test, expect } from '@playwright/test'

import { ARRIVE_WITHIN, AIM_WITHIN, STUCK_SECONDS, createActuator } from '../src/lib/game/actuator'
import type { Order } from '../src/lib/game/orders'
import { TURN_SPEED } from '../src/lib/game/locomotion'
import { WALK_SPEED } from '../src/lib/game/movement'

const STEP = 1 / 60

function bench(
  options: {
    frozen?: boolean
    aimFloor?: number
    gaugeRate?: number
    wet?: (x: number, z: number) => boolean
    swims?: boolean
  } = {}
) {
  const pig = { x: 0, z: 0, heading: 0 }
  let aim = 0
  let gauge: number | null = null
  const last = { walk: 0, turn: 0, aim: 0 }
  const fires: { held: boolean; pressed: boolean }[] = []
  let holding: number | null | 'untouched' = 'untouched'

  const actuator = createActuator({
    at: () => ({ ...pig }),
    wet: options.wet ?? (() => false),
    swims: () => options.swims ?? false,
    aim: () => aim,
    gauge: () => gauge,
    intent(walk, turn) {
      last.walk = walk
      last.turn = turn
    },
    aimStep(direction) {
      last.aim = direction
    },
    fire(held, pressed) {
      fires.push({ held, pressed })
      if (pressed) gauge = 0
      if (!held) gauge = null
    },
    hold(skill) {
      holding = skill
    }
  })

  /** One engine step: the actuator writes, then the toy world answers. */
  const tick = (): void => {
    actuator.step(STEP)
    if (options.frozen) return
    pig.heading += last.turn * TURN_SPEED * STEP
    pig.x += Math.sin(pig.heading) * last.walk * WALK_SPEED * STEP
    pig.z += Math.cos(pig.heading) * last.walk * WALK_SPEED * STEP
    aim = Math.max(options.aimFloor ?? -1023, Math.min(1023, aim + last.aim * 8))
    if (gauge !== null && fires.at(-1)?.held) {
      gauge = Math.min(1, gauge + (options.gaugeRate ?? 0.25))
    }
  }

  const run = (order: Order, atMost = 2000): number => {
    actuator.take(order)
    let ticks = 0
    while (!actuator.idle() && ticks < atMost) {
      tick()
      ticks++
    }
    expect(actuator.idle()).toBe(true)
    return ticks
  }

  return { pig, last, fires, actuator, tick, run, holding: () => holding }
}

test('walkTo turns onto the bearing, walks, and arrives stilled', { tag: '@nodata' }, () => {
  const b = bench()
  // The target is square to the RIGHT (+x), a quarter turn off heading 0 —
  // outside the walking cone, so the first step turns on the spot.
  b.actuator.take({ kind: 'walkTo', x: 500, z: 0 })
  b.tick()
  expect(b.last).toMatchObject({ walk: 0, turn: 1 })
  let ticks = 0
  while (!b.actuator.idle() && ticks++ < 2000) b.tick()
  expect(b.actuator.outcome()).toBe('done')
  expect(Math.hypot(b.pig.x - 500, b.pig.z)).toBeLessThanOrEqual(ARRIVE_WITHIN)
  // Arrival lets go of the controls: nothing keeps walking into the point.
  expect(b.last).toMatchObject({ walk: 0, turn: 0 })
})

test('a walk that stops progressing finishes blocked', { tag: '@nodata' }, () => {
  // The toy world refuses to move the pig at all — a wall by any other name.
  const b = bench({ frozen: true })
  const ticks = b.run({ kind: 'walkTo', x: 0, z: 500 })
  expect(b.actuator.outcome()).toBe('blocked')
  // …and it takes STUCK_SECONDS of no progress to say so, not one frame.
  expect(ticks * STEP).toBeGreaterThanOrEqual(STUCK_SECONDS)
})

test('the walk STOPS at the waterline, blocked — never a stride into it', { tag: '@nodata' }, () => {
  // Water from z=500 on; the order wants z=1000. The guard is the hands',
  // so it holds whatever planned the walk.
  const b = bench({ wet: (_x, z) => z >= 500 })
  b.run({ kind: 'walkTo', x: 0, z: 1000 })
  expect(b.actuator.outcome()).toBe('blocked')
  expect(b.pig.z).toBeLessThan(500)
  expect(b.last).toMatchObject({ walk: 0, turn: 0 })
})

test('a SWIMMER walks straight through — the water guard stands down', { tag: '@nodata' }, () => {
  // Same waterline as above, but the pig's class swims: the stride into
  // the water is a road for it, and the order finishes where it was sent.
  const b = bench({ wet: (_x, z) => z >= 500, swims: true })
  b.run({ kind: 'walkTo', x: 0, z: 1000 })
  expect(b.actuator.outcome()).toBe('done')
  expect(Math.abs(b.pig.z - 1000)).toBeLessThanOrEqual(ARRIVE_WITHIN)
})

test('a pig already IN the water is allowed to walk OUT', { tag: '@nodata' }, () => {
  // Wet up to z=400, the pig starts wet at the origin: the guard only
  // holds a stride FROM dry INTO wet, or it would drown what it protects.
  const b = bench({ wet: (_x, z) => z < 400 })
  b.run({ kind: 'walkTo', x: 0, z: 600 })
  expect(b.actuator.outcome()).toBe('done')
  expect(b.pig.z).toBeGreaterThan(400)
})

test('hold is a one-step order through the skill menu write', { tag: '@nodata' }, () => {
  const b = bench()
  b.run({ kind: 'hold', skill: 7 })
  expect(b.holding()).toBe(7)
})

test('watch touches nothing and is done at once', { tag: '@nodata' }, () => {
  const b = bench()
  const ticks = b.run({ kind: 'watch' })
  expect(ticks).toBe(1)
  expect(b.fires).toEqual([])
  expect(b.actuator.outcome()).toBe('done')
})

test('aimTo pushes the aim key until the pitch is close', { tag: '@nodata' }, () => {
  const b = bench()
  b.run({ kind: 'aimTo', angle: 300 })
  expect(b.actuator.outcome()).toBe('done')
  expect(b.last.aim).toBe(0)
})

test('an aim the clamp refuses finishes blocked', { tag: '@nodata' }, () => {
  // The toy clamp floors the pitch at 512 — a mortar refusing to level out
  // (lib/game/aim.ts). Asking for level gets silence, and silence is blocked.
  const b = bench({ aimFloor: 512 })
  b.run({ kind: 'aimTo', angle: 512 + AIM_WITHIN * 4 })
  expect(b.actuator.outcome()).toBe('done')
  b.run({ kind: 'aimTo', angle: 0 })
  expect(b.actuator.outcome()).toBe('blocked')
})

test('fire presses, holds the gauge to the charge, and lets go', { tag: '@nodata' }, () => {
  const b = bench({ gaugeRate: 0.2 })
  b.run({ kind: 'fire', charge: 0.6 })
  expect(b.fires[0]).toEqual({ held: true, pressed: true })
  expect(b.fires.at(-1)).toEqual({ held: false, pressed: false })
  // Between the press and the release the button was only HELD.
  expect(b.fires.slice(1, -1).every((f) => f.held && !f.pressed)).toBe(true)
  expect(b.fires.length).toBeGreaterThan(2)
})

test('a gun answers the press itself: no gauge, one press, straight out', { tag: '@nodata' }, () => {
  const b = bench()
  // The toy gauge only exists while fire is held AND the bench fills it; a
  // null gauge is the engine saying nothing in hand charges.
  b.fires.length = 0
  // No charge given at all: a gun's press needs none.
  b.actuator.take({ kind: 'fire' })
  b.tick()
  b.tick()
  expect(b.actuator.idle()).toBe(true)
  expect(b.actuator.outcome()).toBe('done')
  expect(b.fires.map((f) => f.pressed)).toEqual([true, false])
})
