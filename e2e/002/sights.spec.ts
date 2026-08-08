// PHASE 002 (domain) — down the SIGHTS: the zoom, and the tremor it scales.
//
// The ZOOM is the exe's: 0x20 a frame to a cap of 0x1000, for skills 11 and 64
// only, and the aim STEP is divided by `(0x1000 - zoom) >> 12` on the way out of
// `[game+0x300]` so the sights get finer as they close in (0x495ecc, 0x495bc1).
//
// The TREMOR is not that quantity and must not take that divisor: the accumulator
// is a step that adds into the angle — control sensitivity — while the tremor here
// is an offset on the view. Play settled its direction, twice: no scaling at all
// read as "при зуме дёрганье не масштабируется, а должно", and the divisor read as
// "сделал в обратную сторону, чем ближе тем меньше, а надо наоборот". Closer
// shakes MORE.

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../../src/lib/game/zoom'
import { createWobble, updateWobble, wobblePitch, wobbleYaw } from '../../src/lib/game/wobble'
import { layerSights, weaponLayer } from '../../src/lib/game/controls'
import { SKILL } from '../../src/lib/game/skills'

/** A fixed "stick": the extremes, so a sample is the amplitude itself. */
const hard = (): number => 1

/** Settle the tremor at one zoom (0 wide open, 1 at the cap) and report how far
 * it reaches. */
const reach = (zoom: number): number => {
  const wobble = createWobble()
  let most = 0
  for (let frame = 0; frame < 60; frame++) {
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

test('the TREMOR grows as the sights close in — CLOSER SHAKES MORE', () => {
  const open = reach(0)
  const half = reach(0.5)
  const shut = reach(1)
  expect(open).toBeGreaterThan(0)
  // Monotone, and the direction is the whole point of this test: it shipped
  // backwards once and play caught it in one look.
  expect(half).toBeGreaterThan(open)
  expect(shut).toBeGreaterThan(half)
  // …and it is the same shake wide open as it was before the zoom had any say, so
  // turning the scope on does not change how a rifle without one feels.
  expect(reach(0)).toBeCloseTo(open, 6)
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
  expect(weaponLayer(null)).toBe('none')
  expect(weaponLayer(SKILL.SKIP_TURN)).toBe('none')
  // A BLADE has no aim view, which is the bug play kept hitting: G handed the
  // sights over, a set change drops the driving keys, and the pig stopped for
  // nothing. The exe agrees from the other end — 0x46a891 pins a bayonet's aim
  // angle to zero, so there is nothing for an aim view to show.
  expect(layerSights('melee')).toBe(false)
  expect(layerSights('none')).toBe(false)
  expect(layerSights('gun')).toBe(true)
  expect(layerSights('lob')).toBe(true)
})
