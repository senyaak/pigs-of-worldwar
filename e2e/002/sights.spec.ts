// PHASE 002 (domain) - down the SIGHTS: the zoom, the tremor, and where each half
// of the tremor belongs.
//
// The ZOOM is the exe's: 0x20 a frame to a cap of 0x1000, for skills 11 and 64 only,
// and the aim STEP is divided by `(0x1000 - zoom) >> 12` on the way out of
// `[game+0x300]` so the sights get finer as they close in (0x495ecc, 0x495bc1).
//
// The TREMOR is two things and play settled both, in four passes:
//
//  - a JITTER on the ANGLE, sampled every engine frame and eased towards. Half a
//    degree, and the version play called RIGHT.
//  - a DRIFT on the EYE, a free random walk with no centre and no bound: "ЦЕНТРА
//    ВООБЩЕ НЕ ДОЛЖНО БЫТЬ - мы можем уехать в одном направлении на 10
//    метров если рандо так сделает."
//
// The eye is what keeps the shot honest: an unbounded drift on the ANGLE would point
// the picture where the bullet will not go, and folding it into the bullet was worse
// still - "пуля летела не туда только после твоего фикса".

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../../src/lib/game/zoom'
import {
  createWobble,
  resetWobble,
  updateWobble,
  wobbleAcross,
  wobblePitch,
  wobbleUp,
  wobbleYaw
} from '../../src/lib/game/wobble'
import { layerFires, layerSights, weaponLayer } from '../../src/lib/game/controls'
import { SKILL } from '../../src/lib/game/skills'

/** A deterministic stand-in for `Math.random` - varied, so a walk is a walk, and
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

/** How far the EYE travels over `frames` frames - the sum of its steps, which is
 * what the zoom is meant to change. */
const travelled = (zoom: number, frames = 240): number => {
  const wobble = createWobble()
  const random = rolling()
  let was = wobbleAcross(wobble)
  let along = 0
  for (let frame = 0; frame < frames; frame++) {
    updateWobble(wobble, 1, zoom, random)
    along += Math.abs(wobbleAcross(wobble) - was)
    was = wobbleAcross(wobble)
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

test('the EYE wanders freely - no centre, and nothing pulls it back', () => {
  // Play's correction, twice over: each step moves the eye and there is no radius
  // it orbits. So over time it goes wherever the random took it.
  const wobble = createWobble()
  const random = rolling()
  const drift: number[] = []
  for (let frame = 0; frame < 240; frame++) {
    updateWobble(wobble, 1, 0, random)
    drift.push(wobbleAcross(wobble))
  }
  // It gets properly away - further than any one step, because the steps add up.
  expect(Math.max(...drift.map(Math.abs))).toBeGreaterThan(30)
  // ...by STEPS, so consecutive frames are neighbours rather than fresh samples.
  const steps = drift.slice(1).map((one, i) => Math.abs(one - drift[i]))
  expect(Math.max(...steps)).toBeLessThan(15)
  // ...and the two axes are independent, which is what lets it go in any direction
  // rather than along one line.
  expect(wobbleUp(wobble)).not.toBeCloseTo(wobbleAcross(wobble), 3)
})

test('the ANGLE only ever carries the small JITTER, so the shot stays honest', () => {
  // Half a degree of stick and no drift: what the bullet leaves along is the
  // player's own angle, and the crosshair is not lying about it.
  const wobble = shaken(0, 240)
  expect(Math.abs(wobblePitch(wobble))).toBeLessThan(8)
  expect(Math.abs(wobbleYaw(wobble))).toBeLessThan(8)
  // The eye, by then, is somewhere else entirely.
  expect(Math.abs(wobbleAcross(wobble))).toBeGreaterThan(Math.abs(wobblePitch(wobble)))
})

test('CLOSER TRAVELS FURTHER, and that is all the zoom does', () => {
  expect(travelled(1)).toBeGreaterThan(travelled(0) * 1.5)
})

test('it FREEZES when it stops being advanced - that is the fuse', () => {
  // `Pig::Aim` is refused from the fire press until the attack and the tremor
  // arrives through it, so the sights stop dead and the shot leaves along what the
  // player last saw. Resetting instead read as the shot lagging a second.
  const wobble = shaken(0, 60)
  const eye = wobbleAcross(wobble)
  const angle = wobblePitch(wobble)
  expect(eye).not.toBe(0)
  expect(wobbleAcross(wobble)).toBe(eye)
  expect(wobblePitch(wobble)).toBe(angle)
})

test('nothing at all once the sights are lowered for good', () => {
  const wobble = shaken(0, 60)
  expect(Math.abs(wobbleAcross(wobble))).toBeGreaterThan(0)
  resetWobble(wobble)
  expect(wobblePitch(wobble)).toBe(0)
  expect(wobbleYaw(wobble)).toBe(0)
  expect(wobbleAcross(wobble)).toBe(0)
  expect(wobbleUp(wobble)).toBe(0)
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
