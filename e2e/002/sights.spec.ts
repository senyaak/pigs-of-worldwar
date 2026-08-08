// PHASE 002 (domain) — down the SIGHTS: the zoom, and the tremor it scales.
//
// The ZOOM is the exe's: 0x20 a frame to a cap of 0x1000, for skills 11 and 64
// only, and the aim STEP is divided by `(0x1000 - zoom) >> 12` on the way out of
// `[game+0x300]` so the sights get finer as they close in (0x495ecc, 0x495bc1).
//
// The TREMOR is not that quantity and must not take that divisor: the accumulator
// is the player's own aiming step — control sensitivity, which a scope wants fine —
// while the tremor is what the player fights. Play settled its shape over four
// passes, and the last one is the design: a fast JITTER on a CENTRE THAT WALKS.
// "тебе надо было просто после каждого сдвига обновлять центр — чтобы могло уезжать
// в любую сторону. Раньше было ПРАВИЛЬНО." A pass with only the walk drew one
// ellipse, because two axes sweeping between reflecting stops IS an ellipse.
//
// And the SHOT reads the same offset the view does — see `wobblePitch`.

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../../src/lib/game/zoom'
import { createWobble, resetWobble, updateWobble, wobblePitch, wobbleYaw } from '../../src/lib/game/wobble'
import { layerFires, layerSights, weaponLayer } from '../../src/lib/game/controls'
import { SKILL } from '../../src/lib/game/skills'

/** A deterministic stand-in for `Math.random` — varied, so a walk is a walk, and
 * repeatable, so the numbers below mean something. */
const rolling = (): (() => number) => {
  let seed = 12345
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

/** Run the tremor for `frames` engine frames at this zoom. */
const shaken = (zoom: number, frames = 240): ReturnType<typeof createWobble> => {
  const wobble = createWobble()
  const random = rolling()
  for (let frame = 0; frame < frames; frame++) updateWobble(wobble, 1, zoom, random)
  return wobble
}

/** How far the CENTRE travels over `frames` frames — the sum of its steps, which
 * is what the zoom is meant to change. */
const travelled = (zoom: number, frames = 240): number => {
  const wobble = createWobble()
  const random = rolling()
  let was = wobble.driftPitch
  let along = 0
  for (let frame = 0; frame < frames; frame++) {
    updateWobble(wobble, 1, zoom, random)
    along += Math.abs(wobble.driftPitch - was)
    was = wobble.driftPitch
  }
  return along
}

test('only the two zooming skills zoom, and they creep to the cap', () => {
  expect(zoomsIn(11)).toBe(true)
  expect(zoomsIn(64)).toBe(true)
  expect(zoomsIn(19)).toBe(false)
  expect(zoomsIn(null)).toBe(false)

  const zoom = createZoom()
  updateZoom(zoom, 1, true)
  expect(zoom.value).toBe(ZOOM_STEP)
  // 0x20 a frame to 0x1000 — 128 engine frames, and it stops there.
  updateZoom(zoom, 1000, true)
  expect(zoom.value).toBe(ZOOM_CAP)
  expect(zoomFraction(zoom)).toBe(1)
  // Letting the sights go winds it back out.
  updateZoom(zoom, 1000, false)
  expect(zoom.value).toBe(0)
})

test('the CENTRE walks, so the sights can wander off in any direction', () => {
  // Play's correction, and the whole of it: "после каждого сдвига обновлять
  // центр." A fresh direction every step, so it is a walk and not a sweep.
  const wobble = createWobble()
  const random = rolling()
  const drift: number[] = []
  for (let frame = 0; frame < 240; frame++) {
    updateWobble(wobble, 1, 0, random)
    drift.push(wobble.driftPitch)
  }
  // It gets properly away from the middle — further than the jitter alone could.
  expect(Math.max(...drift.map(Math.abs))).toBeGreaterThan(8)
  // …and it gets there by STEPS: neighbours, not fresh samples.
  const steps = drift.slice(1).map((one, i) => Math.abs(one - drift[i]))
  expect(Math.max(...steps)).toBeLessThan(2)
  // The direction is redrawn every step rather than held to a stop, which is what
  // keeps it off the one ellipse a reflecting sweep drew: the sign of the step
  // changes often.
  const turns = drift
    .slice(2)
    .filter((one, i) => Math.sign(one - drift[i + 1]) !== Math.sign(drift[i + 1] - drift[i])).length
  expect(turns).toBeGreaterThan(40)
  // And the JITTER is still there on top, fast and its own size.
  expect(Math.abs(wobble.jitterPitch)).toBeGreaterThan(0)
  expect(wobblePitch(wobble)).toBeCloseTo(wobble.driftPitch + wobble.jitterPitch, 6)
})

test('CLOSER TRAVELS FURTHER, and the radius stays put', () => {
  // "чем ближе, тем больше расстояния проходит, а не тем шире радиус дёрганья."
  expect(travelled(1)).toBeGreaterThan(travelled(0) * 1.5)
  // The bound is not the zoom's to move: 24 units either way, wide open or shut.
  expect(Math.abs(shaken(1, 600).driftPitch)).toBeLessThanOrEqual(24)
  expect(Math.abs(shaken(1, 600).driftYaw)).toBeLessThanOrEqual(24)
})

test('it FREEZES when it stops being advanced — that is the fuse', () => {
  // `Pig::Aim` is refused from the fire press until the attack and the tremor
  // arrives through it, so the sights stop dead and the bullet leaves along what
  // the player last saw. Resetting instead read as the shot lagging a second.
  const wobble = shaken(0, 60)
  const held = wobblePitch(wobble)
  expect(held).not.toBe(0)
  expect(wobblePitch(wobble)).toBe(held)
  expect(wobbleYaw(wobble)).toBe(wobble.driftYaw + wobble.jitterYaw)
})

test('nothing at all once the sights are lowered for good', () => {
  const wobble = shaken(0, 60)
  expect(Math.abs(wobblePitch(wobble))).toBeGreaterThan(0)
  resetWobble(wobble)
  expect(wobblePitch(wobble)).toBe(0)
  expect(wobbleYaw(wobble)).toBe(0)
})

test('a weapon brings its own LAYER, and only two of them have an aim view', () => {
  // Play's model: "каждое оружие — свой контроллер; можно ведь комбинировать их,
  // movement + melee или movement + gun?" This is that table.
  expect(weaponLayer(3)).toBe('melee')
  expect(weaponLayer(19)).toBe('lob')
  expect(weaponLayer(11)).toBe('gun')
  // An EMPTY hand is the only `none`. SKIP TURN has no weapon behind it and F
  // still uses it, so it is its own layer — play drew that line: "пропуск хода
  // это не none, там есть реакция на f, а без оружия нет!"
  expect(weaponLayer(null)).toBe('none')
  expect(weaponLayer(SKILL.SKIP_TURN)).toBe('skill')
  expect(layerFires('none')).toBe(false)
  for (const layer of ['skill', 'melee', 'gun', 'lob'] as const) {
    expect(layerFires(layer)).toBe(true)
  }
  expect(layerSights('skill')).toBe(false)
  // A BLADE has no aim view, which is the bug play kept hitting: G handed the
  // sights over, a set change drops the driving keys, and the pig stopped for
  // nothing. The exe agrees from the other end — 0x46a891 pins a bayonet's aim
  // angle to zero, so there is nothing for an aim view to show.
  expect(layerSights('melee')).toBe(false)
  expect(layerSights('none')).toBe(false)
  expect(layerSights('gun')).toBe(true)
  expect(layerSights('lob')).toBe(true)
})
