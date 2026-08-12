// PHASE 002 (domain) — what a key MEANS in each control set. Pure, no Electron.
//
// This is the table that used to be four scattered `if`s, and the scatter is why
// the sights once ended up sharing the fire lock. `lib/game/controls.ts`.

import { test, expect } from '@playwright/test'

import { modeOf, readControls, verbOf, wakes } from '../../src/lib/game/controls'
import {
  DEFAULT_BINDINGS,
  DRIVING_ACTIONS,
  HELD_ACTIONS
} from '../../src/renderer/src/input/actions'
import type { Held, Situation } from '../../src/lib/game/controls'

const still: Held = { walk: 0, turn: 0, aim: 0, sighting: false, firing: false, fired: false }
const driving = (over: Partial<Held> = {}): Held => ({ ...still, walk: 1, turn: 1, ...over })

const at = (over: Partial<Situation> = {}): Situation => ({
  ending: false,
  starting: false,
  inventory: false,
  locked: false,
  charging: false,
  armed: false,
  sighting: false,
  ...over
})

test('the modes fall in priority order', { tag: '@nodata' }, () => {
  expect(modeOf(at())).toBe('battle')
  expect(modeOf(at({ sighting: true }))).toBe('sights')
  expect(modeOf(at({ locked: true }))).toBe('locked')
  expect(modeOf(at({ charging: true }))).toBe('charging')
  expect(modeOf(at({ inventory: true }))).toBe('inventory')
  expect(modeOf(at({ starting: true }))).toBe('starting')
  // A committed pig cannot enter the sights…
  expect(modeOf(at({ locked: true, sighting: true }))).toBe('locked')
  // …a filling gauge beats the lock, because it is what set it…
  expect(modeOf(at({ locked: true, charging: true }))).toBe('charging')
  // …a menu beats both…
  expect(modeOf(at({ inventory: true, locked: true, charging: true }))).toBe('inventory')
  // …and the beat at the top of a turn beats the lot.
  expect(modeOf(at({ starting: true, inventory: true, locked: true }))).toBe('starting')
  // …except the MISSION being over, which outlives everything: whatever the pig
  // was in the middle of, it is not doing it any more (lib/game/endOfGame.ts).
  expect(modeOf(at({ ending: true }))).toBe('ending')
  expect(modeOf(at({ ending: true, starting: true, inventory: true }))).toBe('ending')
})

test('the ENDING drives nothing, and any key puts the battle away', { tag: '@nodata' }, () => {
  expect(readControls('ending', driving({ aim: 1, firing: true }))).toMatchObject({
    walk: 0,
    turn: 0,
    aim: 0,
    firing: false
  })
  // Any key at all, which is what the exe's own way out of mode 2 is — and the
  // engine is what refuses one that comes too early (`HOLD_SECONDS`).
  for (const action of HELD_ACTIONS) expect(verbOf('ending', action)).toBe('leaveMission')
  expect(verbOf('ending', 'jump')).toBe('leaveMission')
})

test('in the BATTLE all three axes drive', { tag: '@nodata' }, () => {
  const intent = readControls('battle', driving({ aim: 1 }))
  expect(intent).toMatchObject({ walk: 1, turn: 1, aim: 1, sighting: false })
})

test('down the SIGHTS the walk POINTS instead, and the turn still turns', { tag: '@nodata' }, () => {
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

test('in the INVENTORY nothing drives, and the axes step the CURSOR', { tag: '@nodata' }, () => {
  const intent = readControls('inventory', driving())
  expect(intent).toMatchObject({ walk: 0, turn: 0, aim: 0, sighting: false })
  // Forward is UP the list, so the vertical is inverted.
  expect(intent.cursor).toEqual({ x: 1, y: -1 })
  expect(readControls('inventory', driving({ walk: -1, turn: 0 })).cursor).toEqual({ x: 0, y: 1 })
})

test('LOCKED stops everything, fire included — it is not a lock with a hole', { tag: '@nodata' }, () => {
  const intent = readControls('locked', driving({ aim: 1, firing: true }))
  expect(intent).toMatchObject({ walk: 0, turn: 0, aim: 0, firing: false })
})

test('CHARGING is the fire key and nothing else — play: "там просто другой контроллер"', { tag: '@nodata' }, () => {
  // The gauge's own set. Its whole job is to see the button come UP, which is what
  // the exe's split needs (0x493796: the press charges, the release throws), and
  // it steers with nothing.
  const intent = readControls('charging', driving({ aim: 1, firing: true }))
  expect(intent).toMatchObject({ walk: 0, turn: 0, aim: 0 })
  expect(intent.firing).toBe(true)
})

test('the fire key is held where a mode has one, and dropped where it does not', { tag: '@nodata' }, () => {
  for (const mode of ['battle', 'sights', 'charging'] as const) {
    expect(readControls(mode, { ...still, firing: true }).firing).toBe(true)
  }
  for (const mode of ['inventory', 'locked', 'starting'] as const) {
    expect(readControls(mode, { ...still, firing: true }).firing).toBe(false)
  }
})

test('the PRESS travels beside the hold, and never comes out of it', { tag: '@nodata' }, () => {
  // A mode that reads the fire key gets both; one that does not gets neither.
  for (const mode of ['battle', 'sights', 'charging', 'armed'] as const) {
    expect(readControls(mode, { ...still, firing: true, fired: true }).fired).toBe(true)
  }
  for (const mode of ['inventory', 'locked', 'starting'] as const) {
    expect(readControls(mode, { ...still, firing: true, fired: true }).fired).toBe(false)
  }
  // And the point of carrying it separately: a key that is DOWN without having
  // just gone down is not a press. Leaving a set that reads the key as up — the
  // lock, while a shot is in the air — would otherwise look like one, and the
  // grenade that came out the far side went off the frame it appeared.
  expect(readControls('armed', { ...still, firing: true }).fired).toBe(false)
})

test('STARTING has one rule: any key starts the turn, whatever the key is', { tag: '@nodata' }, () => {
  // And it cannot simply CONSUME the key, which is the trap: a held key never
  // produces a one-shot verb, so a set that swallowed the axes could not be ended
  // by them. The caller starts the turn and then re-reads the same input in the
  // set that follows (`liveMode` in ui/battle.ts).
  for (const action of ['jump', 'fire', 'skills', 'endTurn', 'walkForward']) {
    expect(verbOf('starting', action)).toBe('beginTurn')
  }
})

test('…and the beat needs INPUT to end it, which is what a poll cannot assume', { tag: '@nodata' }, () => {
  // The gate the per-frame poll needs. A poll runs whether the player touched
  // anything or not, so without this `starting` resolves on the first frame of
  // every turn and the beat is never seen — one of the three things the first
  // attempt at polling died on (`input/battleInput.ts`).
  expect(wakes(still, 0)).toBe(false)
  expect(wakes(driving(), 0)).toBe(true)
  // A one-shot press counts even though nothing is HELD — that is the whole
  // point of counting them separately.
  expect(wakes(still, 1)).toBe(true)
  // …and so does every axis on its own, plus both of the held verbs.
  for (const over of [{ walk: -1 }, { turn: 1 }, { aim: -1 }, { firing: true }, { sighting: true }]) {
    expect(wakes({ ...still, ...over }, 0)).toBe(true)
  }
})

test('SPACE is a different verb in every mode', { tag: '@nodata' }, () => {
  expect(verbOf('battle', 'jump')).toBe('jump')
  // The aim view reaches no jump from its own input branch (0x4928dc).
  expect(verbOf('sights', 'jump')).toBeNull()
  // In the menu it is the SELECT key, as in the original.
  expect(verbOf('inventory', 'jump')).toBe('choose')
  // …and the one exception in the whole lock: it cuts the canopy.
  expect(verbOf('locked', 'jump')).toBe('cutChute')
})

test('the DOOR of a building is its own key, and SPACE is not it', { tag: '@nodata' }, () => {
  // Play: "я не говорил по пробелу — там просто анимация входа, запрыгивание;
  // сделай отдельную кнопку, пробел уже прыжок." So `enter` is a verb of its own
  // and the jump key means the same thing standing at a shelter as anywhere else.
  expect(verbOf('battle', 'enter')).toBe('enterBuilding')
  expect(verbOf('battle', 'jump')).toBe('jump')
  // Down the sights it goes with everything else that moves the pig.
  expect(verbOf('sights', 'enter')).toBeNull()
  // …and it is not reachable from a menu, a lock or the gauge either.
  for (const mode of ['inventory', 'locked', 'charging', 'armed'] as const) {
    expect(verbOf(mode, 'enter')).toBeNull()
  }
  // It has a KEY, and it is not one anything else uses.
  expect(DEFAULT_BINDINGS.KeyC).toBe('enter')
  expect(DEFAULT_BINDINGS.Space).toBe('jump')
  expect(Object.values(DEFAULT_BINDINGS).filter((one) => one === 'enter')).toHaveLength(1)
  // …and it is a one-shot: nothing about a door is held.
  expect(HELD_ACTIONS).not.toContain('enter')
  expect(DRIVING_ACTIONS).not.toContain('enter')
})

test('a locked or charging pig cannot open its inventory or end its turn', { tag: '@nodata' }, () => {
  for (const mode of ['locked', 'charging'] as const) {
    expect(verbOf(mode, 'skills')).toBeNull()
    expect(verbOf(mode, 'endTurn')).toBeNull()
    // The one thing either answers: the jump key cuts the opening drop's canopy.
    expect(verbOf(mode, 'jump')).toBe('cutChute')
  }
  // …and a menu swallows the turn key too.
  expect(verbOf('inventory', 'endTurn')).toBeNull()
  expect(verbOf('inventory', 'skills')).toBe('closeInventory')
})

test('ending a turn goes through the SKILL, and only on FIRE', { tag: '@nodata' }, () => {
  // Play, twice: "закончить ход вообще можно только через умение", then "пропуск
  // хода должен применяться на стрелять — а не на выборе". So the verb only takes
  // skill 65 IN HAND; the scene's fire handler is what applies it. There is no key
  // bound to it at all now — the dashboard button is the only thing that gets here.
  expect(verbOf('battle', 'endTurn')).toBe('holdSkipTurn')
})

test('the aim view cannot open the inventory', { tag: '@nodata' }, () => {
  // Play: "инвентарь работает во время прицеливания" — it should not.
  expect(verbOf('sights', 'skills')).toBeNull()
})

test('a live grenade gets its OWN set, or it could never be set off', { tag: '@nodata' }, () => {
  // Play found this the moment `locked` stopped letting fire through: "пока
  // граната летит — не могу взорвать её". `armed` beats the lock and passes the
  // one key that matters.
  expect(modeOf(at({ armed: true, locked: true }))).toBe('armed')
  expect(readControls('armed', driving({ firing: true }))).toMatchObject({
    walk: 0,
    turn: 0,
    aim: 0,
    firing: true
  })
})

test('the sights are NOT a lock — play caught that one', { tag: '@nodata' }, () => {
  // "там должен включаться другой контрол сет — выключаться должно когда выстрел
  // нажал, не прицел."
  const sighted = readControls('sights', driving({ aim: 1 }))
  expect(sighted.turn).not.toBe(0)
  expect(sighted.aim).not.toBe(0)
  expect(verbOf('sights', 'endTurn')).toBe('holdSkipTurn')
})
