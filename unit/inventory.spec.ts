// The pockets themselves — `give`, `spend` and the two sentinels, stepped
// directly. Pure arithmetic over an array of slots: no map, no app, no install.
//
// It exists because `spend`'s last line had no home. "A slot that reaches zero
// is DROPPED rather than kept at nothing" was asserted only by
// `e2e/002/crate.spec.ts`, which needed a whole battle, a real map and a pig
// standing on a crate to reach it — and then could not reach it at all once
// every pig started spawning with its CLASS KIT, because the spy it used walks
// onto GUNS already carrying a charge and one turn allows one plant. The claim
// is `inventory.ts`'s own, so it belongs here.

import { expect, test } from '@playwright/test'

import { UNLIMITED, amountOf, give, spend } from '../src/lib/game/inventory'
import type { Slot } from '../src/lib/game/inventory'

const TNT = 37
const BAYONET = 3

test('give STACKS onto a slot that is already there', { tag: '@nodata' }, () => {
  const pockets: Slot[] = [{ skill: TNT, amount: 1 }]
  expect(give(pockets, TNT, 1), 'a slot it already has is STACKED, not taken').toBe('stacked')
  expect(pockets).toHaveLength(1)
  expect(amountOf(pockets, TNT)).toBe(2)
})

test('…and appends one that is not', { tag: '@nodata' }, () => {
  const pockets: Slot[] = [{ skill: TNT, amount: 1 }]
  expect(give(pockets, BAYONET, 3)).toBe('taken')
  expect(pockets.map((slot) => slot.skill)).toEqual([TNT, BAYONET])
})

test('spending takes ONE, and a slot that reaches zero is dropped', { tag: '@nodata' }, () => {
  const pockets: Slot[] = [{ skill: TNT, amount: 2 }]
  expect(spend(pockets, TNT)).toBe(true)
  expect(amountOf(pockets, TNT), 'one left').toBe(1)
  expect(spend(pockets, TNT)).toBe(true)
  expect(amountOf(pockets, TNT), 'and then the slot is gone, not sitting at nought').toBe(0)
  expect(pockets).toHaveLength(0)
  expect(spend(pockets, TNT), 'nothing to spend').toBe(false)
})

test('UNLIMITED survives being spent, and never becomes a count', { tag: '@nodata' }, () => {
  const pockets: Slot[] = [{ skill: BAYONET, amount: UNLIMITED }]
  expect(spend(pockets, BAYONET)).toBe(true)
  expect(amountOf(pockets, BAYONET)).toBe(UNLIMITED)
  // …and the training ground handing one over again leaves it unlimited rather
  // than adding to the sentinel (lib/game/pickups.ts `worthOf`): a slot already
  // endless has nothing to add to, which is `give`'s own 'already'.
  expect(give(pockets, BAYONET, UNLIMITED)).toBe('already')
  expect(amountOf(pockets, BAYONET)).toBe(UNLIMITED)
  // …and a COUNT offered to an endless slot cannot turn it into a number.
  expect(give(pockets, BAYONET, 1)).toBe('already')
  expect(amountOf(pockets, BAYONET)).toBe(UNLIMITED)
})
