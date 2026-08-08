// PHASE 002 (domain) — down the SIGHTS: the zoom, and the tremor it scales.
//
// The exe's aim-view arm treats the two the same way. The analogue axes land in
// `[game+0x300]`, which is the very accumulator the digital ramp uses — a stick
// reading under 32 writes `bx >> 4` straight into it (0x495e9f) — and for the two
// zooming skills that accumulator then goes through
// `(0x1000 - zoom) * step >> 12`, floored at ±1 (0x495ecc onwards, and 0x495bc1
// for the ramp). So the sights get finer as they close in AND so does the shake.
//
// Play asked for the second half: "при зуме дёрганье не масштабируется, а должно."

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../../src/lib/game/zoom'
import { createWobble, updateWobble, wobblePitch, wobbleYaw } from '../../src/lib/game/wobble'

/** A fixed "stick": the extremes, so a sample is the amplitude itself. */
const hard = (): number => 1

/** Settle the tremor at one zoom and report how far it reaches. */
const reach = (scale: number): number => {
  const wobble = createWobble()
  let most = 0
  for (let frame = 0; frame < 60; frame++) {
    updateWobble(wobble, 1, true, scale, hard)
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

test('the TREMOR scales with the zoom, and never quite dies', () => {
  const open = reach(1)
  const half = reach(0.5)
  const shut = reach(0)
  expect(open).toBeGreaterThan(1)
  // Half the zoom left, about half the shake — the exe's own multiply.
  expect(half).toBeGreaterThan(open * 0.4)
  expect(half).toBeLessThan(open * 0.6)
  // …and at the cap it is one aim unit, not nothing: the arm floors the step at
  // ±1 and a scope at full magnification still shivers in the original.
  expect(shut).toBeCloseTo(1, 1)
})

test('nothing at all when the sights are not up', () => {
  const wobble = createWobble()
  updateWobble(wobble, 1, true, 1, hard)
  expect(Math.abs(wobblePitch(wobble))).toBeGreaterThan(0)
  updateWobble(wobble, 1, false, 1, hard)
  expect(wobblePitch(wobble)).toBe(0)
  expect(wobbleYaw(wobble)).toBe(0)
})
