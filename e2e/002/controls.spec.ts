// PHASE 002 (domain) — what a key MEANS in each control set. Pure, no Electron.
//
// This is the table that used to be four scattered `if`s, and the scatter is why
// the sights once ended up sharing the fire lock. `lib/game/controls.ts`.

import { test, expect } from '@playwright/test'

import { modeOf, readControls, verbOf } from '../../src/lib/game/controls'
import type { Held } from '../../src/lib/game/controls'

const still: Held = { walk: 0, turn: 0, aim: 0, sighting: false, firing: false }
const driving = (over: Partial<Held> = {}): Held => ({ ...still, walk: 1, turn: 1, ...over })

test('the modes fall in priority order, and a menu beats everything', () => {
  expect(modeOf({ inventory: false, locked: false, sighting: false })).toBe('battle')
  expect(modeOf({ inventory: false, locked: false, sighting: true })).toBe('sights')
  expect(modeOf({ inventory: false, locked: true, sighting: false })).toBe('locked')
  // A committed pig cannot enter the sights…
  expect(modeOf({ inventory: false, locked: true, sighting: true })).toBe('locked')
  // …and the inventory beats the lot.
  expect(modeOf({ inventory: true, locked: true, sighting: true })).toBe('inventory')
})

test('in the BATTLE all three axes drive', () => {
  const intent = readControls('battle', driving({ aim: 1 }))
  expect(intent).toMatchObject({ walk: 1, turn: 1, aim: 1, sighting: false })
})

test('down the SIGHTS the walk POINTS instead, and the turn still turns', () => {
  // The exe leaves A and D turning the pig and puts the elevation on the pad's
  // vertical, which is what W and S are here.
  const intent = readControls('sights', driving())
  expect(intent.walk).toBe(0)
  expect(intent.turn).toBe(1)
  expect(intent.aim).toBe(1)
  expect(intent.sighting).toBe(true)
  // …and the dedicated aim keys win when both are down.
  expect(readControls('sights', driving({ walk: 1, aim: -1 })).aim).toBe(-1)
})

test('in the INVENTORY nothing drives, and the axes step the CURSOR', () => {
  const intent = readControls('inventory', driving())
  expect(intent).toMatchObject({ walk: 0, turn: 0, aim: 0, sighting: false })
  // Forward is UP the list, so the vertical is inverted.
  expect(intent.cursor).toEqual({ x: 1, y: -1 })
  expect(readControls('inventory', driving({ walk: -1, turn: 0 })).cursor).toEqual({ x: 0, y: 1 })
})

test('LOCKED stops everything but the fire key — and that one MUST get through', () => {
  const intent = readControls('locked', driving({ aim: 1, firing: true }))
  expect(intent).toMatchObject({ walk: 0, turn: 0, aim: 0 })
  // The press that locked the pig is the press that started the gauge charging,
  // so cutting fire off here would make a power weapon impossible to throw — and
  // a second press is what sets a live grenade off.
  expect(intent.firing).toBe(true)
})

test('the fire key is held in every mode that has one', () => {
  for (const mode of ['battle', 'sights', 'locked'] as const) {
    expect(readControls(mode, { ...still, firing: true }).firing).toBe(true)
  }
  // …but not in the inventory: nothing fires out of the menu.
  expect(readControls('inventory', { ...still, firing: true }).firing).toBe(false)
})

test('SPACE is a different verb in every mode', () => {
  expect(verbOf('battle', 'jump')).toBe('jump')
  // The aim view reaches no jump from its own input branch (0x4928dc).
  expect(verbOf('sights', 'jump')).toBeNull()
  // In the menu it is the SELECT key, as in the original.
  expect(verbOf('inventory', 'jump')).toBe('choose')
  // …and the one exception in the whole lock: it cuts the canopy.
  expect(verbOf('locked', 'jump')).toBe('cutChute')
})

test('a locked pig cannot open its inventory or end its turn', () => {
  expect(verbOf('locked', 'skills')).toBeNull()
  expect(verbOf('locked', 'endTurn')).toBeNull()
  // …and a menu swallows the turn key too.
  expect(verbOf('inventory', 'endTurn')).toBeNull()
  expect(verbOf('inventory', 'skills')).toBe('closeInventory')
})

test('the sights are NOT a lock — play caught that one', () => {
  // "там должен включаться другой контрол сет — выключаться должно когда выстрел
  // нажал, не прицел."
  const sighted = readControls('sights', driving({ aim: 1 }))
  expect(sighted.turn).not.toBe(0)
  expect(sighted.aim).not.toBe(0)
  expect(verbOf('sights', 'skills')).toBe('openInventory')
  expect(verbOf('sights', 'endTurn')).toBe('endTurn')
})
