// PHASE 002 (domain) — down the SIGHTS: the zoom, and the tremor it scales.
//
// The ZOOM is the exe's: 0x20 a frame to a cap of 0x1000, for skills 11 and 64
// only, and the aim STEP is divided by `(0x1000 - zoom) >> 12` on the way out of
// `[game+0x300]` so the sights get finer as they close in (0x495ecc, 0x495bc1).
//
// The TREMOR is not that quantity and must not take that divisor: the accumulator
// is the player's own aiming step — control sensitivity, which a scope wants fine —
// while the tremor is what the player fights. Play settled it in three passes: no
// scaling read as "при зуме дёрганье не масштабируется"; the divisor read as
// "сделал в обратную сторону, чем ближе тем меньше"; and the sampled version read
// as "держишь его в радиусе центра, а надо чтобы прицел уезжал". So it WALKS — the
// engine's own tremor shape, 0x49e056 — and the zoom scales how far it travels,
// not how wide it goes.

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../../src/lib/game/zoom'
import { createWobble, updateWobble, wobblePitch, wobbleYaw } from '../../src/lib/game/wobble'
import { layerFires, layerSights, weaponLayer } from '../../src/lib/game/controls'
import { SKILL } from '../../src/lib/game/skills'

/** A fixed "stick": the top of the step range, so a walk is repeatable. */
const hard = (): number => 1

/** How far the sights TRAVEL over `frames` engine frames at this zoom — the sum
 * of every step, not the distance from the middle. */
const travelled = (zoom: number, frames = 60): number => {
  const wobble = createWobble()
  let was = wobblePitch(wobble)
  let along = 0
  for (let frame = 0; frame < frames; frame++) {
    updateWobble(wobble, 1, true, zoom, hard)
    along += Math.abs(wobblePitch(wobble) - was)
    was = wobblePitch(wobble)
  }
  return along
}

/** …and the furthest it ever gets from the middle. */
const reach = (zoom: number, frames = 240): number => {
  const wobble = createWobble()
  let most = 0
  for (let frame = 0; frame < frames; frame++) {
    updateWobble(wobble, 1, true, zoom, hard)
    most = Math.max(most, Math.abs(wobblePitch(wobble)), Math.abs(wobbleYaw(wobble)))
  }
  return most
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

test('the sights WANDER — the crosshair travels, it does not rattle in place', () => {
  // Play, on the version that sampled and eased: "ты держишь его в радиусе центра,
  // а надо чтобы прицел уезжал." A walk with a direction per axis, reversing only
  // at the stops (the engine's own tremor, 0x49e056), so it crosses.
  const wobble = createWobble()
  const seen: number[] = []
  for (let frame = 0; frame < 240; frame++) {
    updateWobble(wobble, 1, true, 0, hard)
    seen.push(wobblePitch(wobble))
  }
  // It reaches both stops, which a bounded rattle round the middle never does…
  expect(Math.max(...seen)).toBeGreaterThan(20)
  expect(Math.min(...seen)).toBeLessThan(-20)
  // …and it gets there by walking: every step is small against the range it
  // covers, so consecutive frames are neighbours rather than fresh samples.
  const steps = seen.slice(1).map((one, i) => Math.abs(one - seen[i]))
  expect(Math.max(...steps)).toBeLessThan(4)
  // The two axes are not the same line: they start opposed and reverse at their
  // own times, which is what makes it wander in every direction.
  expect(wobbleYaw(wobble)).not.toBeCloseTo(wobblePitch(wobble), 3)
})

test('CLOSER TRAVELS FURTHER, and the radius stays put', () => {
  // The correction play asked for twice: not a wider jitter, more ground covered.
  // "чем ближе, тем больше расстояния проходит, а не тем шире радиус дёрганья."
  const open = travelled(0)
  const shut = travelled(1)
  expect(shut).toBeGreaterThan(open * 1.5)
  // …and the bound does NOT move with the zoom.
  expect(reach(1)).toBeCloseTo(reach(0), 6)
})

test('nothing at all when the sights are not up', () => {
  const wobble = createWobble()
  updateWobble(wobble, 1, true, 0, hard)
  expect(Math.abs(wobblePitch(wobble))).toBeGreaterThan(0)
  updateWobble(wobble, 1, false, 0, hard)
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
