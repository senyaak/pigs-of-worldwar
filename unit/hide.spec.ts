// PHASE 002 (domain) — HIDE: the pig becomes a bush. Pure, no Electron.
//
// The exe's shape (`weapons/espionage.md` in the disasm repo): the disguise
// is a decoy prop — the nearest disguisable model within 8192, CRATE4 when
// nothing is near — the pig stops being drawn and targeted, the cover lasts
// exactly until the pig's own next turn, and damage or a fling sheds it
// early (those reveals ride the engine's bus subscription; the module's own
// `reveal` is what they call).

import { test, expect } from '@playwright/test'

import {
  DECOY_FALLBACK,
  DECOY_REACH,
  createHide,
  nearestDisguise,
  startsHidden
} from '../src/lib/game/hide'
import { UNLIMITED } from '../src/lib/game/inventory'
import { SKILL } from '../src/lib/game/skills'
import { NO_BODY } from '../src/lib/game/body'
import type { MapObject } from '../src/lib/formats/pog'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'

const pigAt = (x: number, z: number, id = 1): Pig =>
  ({
    id,
    name: 'SCOUT',
    index: 0,
    health: 75,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 1.2,
    pigClass: 8,
    gone: false,
    hidden: false,
    parachutes: false
  }) as unknown as Pig

const prop = (name: string, x: number, z: number): MapObject =>
  ({ name, id: 1, type: 0, x, y: 0, z, yaw: 0 }) as unknown as MapObject

test('the disguise is the nearest disguisable prop — and the crate when nothing is near', { tag: '@nodata' }, () => {
  const objects = [
    prop('BUSH2', 1000, 0),
    prop('TREEG', 400, 0),
    // A dummy is not a disguise however close it stands.
    prop('TARGET', 50, 0)
  ]
  expect(nearestDisguise(objects, { x: 0, z: 0 })).toBe('TREEG')
  // Past the reach, nothing counts: the exe's own fallback.
  expect(nearestDisguise(objects, { x: DECOY_REACH + 2000, z: 0 })).toBe(DECOY_FALLBACK)
  expect(nearestDisguise([], { x: 0, z: 0 })).toBe(DECOY_FALLBACK)
})

test('taking it hides the pig and stands the decoy; shedding it does the reverse', { tag: '@nodata' }, () => {
  const scout = pigAt(100, 200)
  scout.carrying.push({ skill: SKILL.HIDE, amount: UNLIMITED })
  const heard: BattleEvent[] = []
  const hides = createHide({ pigs: () => [scout], objects: [prop('BUSH1', 150, 200)] }, (event) =>
    heard.push(event)
  )
  expect(hides.begin(scout)).toBe(true)
  expect(scout.hidden).toBe(true)
  expect(hides.decoys()).toHaveLength(1)
  expect(hides.decoys()[0]).toMatchObject({ pig: scout.id, model: 'BUSH1', x: 100, z: 200, yaw: 1.2 })
  expect(heard.some((one) => one.kind === 'hid')).toBe(true)
  // Hiding twice is refused — one disguise per pig.
  expect(hides.begin(scout)).toBe(false)
  hides.reveal(scout.id)
  expect(scout.hidden).toBe(false)
  expect(hides.decoys()).toHaveLength(0)
  expect(heard.some((one) => one.kind === 'revealed')).toBe(true)
  // …and revealing a pig that was not hiding says nothing.
  const before = heard.length
  hides.reveal(scout.id)
  expect(heard.length).toBe(before)
})

test('the cover lasts one round: the pig\'s own turn starting drops it', { tag: '@nodata' }, () => {
  const scout = pigAt(0, 0)
  const hides = createHide({ pigs: () => [scout], objects: [] }, () => {})
  hides.begin(scout)
  hides.turnStarted(scout)
  expect(scout.hidden).toBe(false)
  expect(hides.decoys()).toHaveLength(0)
})

test('the enemy\'s spies start the battle hidden — the player\'s do not', { tag: '@nodata' }, () => {
  const spy = pigAt(0, 0)
  spy.carrying.push({ skill: SKILL.HIDE, amount: UNLIMITED })
  const grunt = pigAt(0, 0, 2)
  expect(startsHidden(spy, true)).toBe(true)
  expect(startsHidden(spy, false)).toBe(false)
  expect(startsHidden(grunt, true)).toBe(false)
})
