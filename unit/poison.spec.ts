// PHASE 002 (domain) — the POISON bit. Pure, no Electron.
//
// The exe's shape (`weapons/gas.md` in the disasm repo): bit 8 of the status
// word, NO timer — ten points at the start of every one of the pig's own
// turns, for ever, killing under eleven — and any heal takes it off
// (`Pig::Heal` zeroes the word; the engine cures on the `healed` event).

import { test, expect } from '@playwright/test'

import { POISON_PER_TURN, createPoison } from '../src/lib/game/poison'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'

const pigAt = (health: number, id = 1): Pig =>
  ({
    id,
    name: 'SCOUT',
    index: 0,
    health,
    carrying: [],
    holding: null,
    position: { x: 0, y: 0, z: 0 },
    body: NO_BODY,
    heading: 0,
    pigClass: 8,
    gone: false,
    parachutes: false
  }) as unknown as Pig

const field = (): { poison: ReturnType<typeof createPoison>; heard: BattleEvent[] } => {
  const heard: BattleEvent[] = []
  return { poison: createPoison({ training: false }, (event) => heard.push(event)), heard }
}

test('ten points at the pig\'s own turn, for ever — and a fresh bit is announced once', { tag: '@nodata' }, () => {
  const { poison, heard } = field()
  const pig = pigAt(75)
  poison.afflict(pig)
  poison.afflict(pig)
  expect(heard.filter((one) => one.kind === 'poisoned')).toHaveLength(1)
  poison.turnStarted(pig)
  poison.turnStarted(pig)
  expect(pig.health).toBe(75 - 2 * POISON_PER_TURN)
  const bitten = heard.filter((one) => one.kind === 'damaged')
  expect(bitten).toHaveLength(2)
  expect(bitten[0]).toMatchObject({ amount: POISON_PER_TURN, pig: pig.id })
})

test('under eleven it dies the moment it takes its turn', { tag: '@nodata' }, () => {
  const { poison, heard } = field()
  const pig = pigAt(10)
  poison.afflict(pig)
  poison.turnStarted(pig)
  expect(pig.health).toBe(0)
  expect(heard.some((one) => one.kind === 'killed' && one.pig === pig.id)).toBe(true)
})

test('a cure takes it off — the next turn costs nothing', { tag: '@nodata' }, () => {
  const { poison, heard } = field()
  const pig = pigAt(75)
  poison.afflict(pig)
  poison.cure(pig.id)
  expect(poison.poisoned(pig)).toBe(false)
  poison.turnStarted(pig)
  expect(pig.health).toBe(75)
  expect(heard.filter((one) => one.kind === 'damaged')).toHaveLength(0)
  // …and the training ground spares a poisoned pig the way it spares any hit.
  const heardT: BattleEvent[] = []
  const spared = createPoison({ training: true }, (event) => heardT.push(event))
  const trainee = pigAt(5, 2)
  spared.afflict(trainee)
  spared.turnStarted(trainee)
  expect(trainee.health).toBe(1)
  expect(heardT.some((one) => one.kind === 'killed')).toBe(false)
})
