// The name plates' stacking: bounded, and deaf to NaN. Pure, no DOM.
import { test, expect } from '@playwright/test'

import { stackPlates } from '../src/renderer/src/ui/plateStack'
import type { PlateBlock } from '../src/renderer/src/ui/plateStack'

const block = (top: number, left = 0, width = 100, height = 20): PlateBlock => ({
  x: left + width / 2,
  top,
  left,
  width,
  height
})

test('a later plate climbs over the one it lands on, and only upward', { tag: '@nodata' }, () => {
  const placed = stackPlates([block(100), block(110)], 4)
  expect(placed).toHaveLength(2)
  expect(placed[0].top).toBe(100)
  expect(placed[1].top).toBe(100 - 20 - 4)
  // Plates that do not touch stay where they are.
  const apart = stackPlates([block(100), block(100, 200)], 4)
  expect(apart.map((one) => one.top)).toEqual([100, 100])
})

test('a plate with NaN for a place is dropped, and the rest still stack in bounded time', { tag: '@nodata' }, () => {
  // The old in-place loop ran for ever on this input: a NaN top placed first
  // is never "apart" from anything, and the next plate bumps against it
  // without end.
  const placed = stackPlates([block(Number.NaN), block(100), block(105), block(Number.POSITIVE_INFINITY, 0)], 4)
  expect(placed.map((one) => one.top)).toEqual([100, 76])
})

test('a column of plates on one spot takes at most one move per plate placed', { tag: '@nodata' }, () => {
  const placed = stackPlates(Array.from({ length: 12 }, () => block(300)), 4)
  const tops = placed.map((one) => one.top)
  expect(tops).toEqual(Array.from({ length: 12 }, (_, i) => 300 - i * 24))
})
