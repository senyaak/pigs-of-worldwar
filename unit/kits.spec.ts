// PHASE 002 (domain) — the class kits. Pure, no Electron.
//
// The rows are the exe's: the class record at 0x4d02e0 carries `(skill,
// amount)` pairs after health and the walk grant, and a pig steps onto the
// field already holding them (lib/game/kits.ts).

import { test, expect } from '@playwright/test'

import { Game } from '../src/lib/game/game'
import { CLASS_KIT, outfit } from '../src/lib/game/kits'
import { UNLIMITED, amountOf } from '../src/lib/game/inventory'
import { SKILL } from '../src/lib/game/skills'

test('a grunt starts with its bayonet, its rifle and three grenades', { tag: '@nodata' }, () => {
  const slots = outfit(0)
  // In the record's own order, because the skill menu shows the slots as
  // they were taken.
  expect(slots.map((slot) => slot.skill)).toEqual([SKILL.BAYONET, SKILL.RIFLE, SKILL.GRENADE])
  expect(amountOf(slots, SKILL.BAYONET)).toBe(UNLIMITED)
  expect(amountOf(slots, SKILL.RIFLE)).toBe(UNLIMITED)
  expect(amountOf(slots, SKILL.GRENADE)).toBe(3)
})

test('the table runs to the ACE, and past its end a class is a grunt', { tag: '@nodata' }, () => {
  // 0..14 the ranks, 15 unnamed, 16 the ACE the AC_ME marker names.
  expect(CLASS_KIT).toHaveLength(17)
  expect(outfit(99)).toEqual(outfit(0))
})

test("the commando's row is the whole record, not the notes' short read", { tag: '@nodata' }, () => {
  // weapons/mines.md stopped this row at the jetpack; the exe carries on to
  // a cluster grenade, medicine darts, a poison gas and a TNT.
  const slots = outfit(4)
  expect(amountOf(slots, SKILL.TNT)).toBe(1)
  expect(amountOf(slots, 20)).toBe(1)
  expect(amountOf(slots, 17)).toBe(3)
})

test('a fresh battle hands every pig its own class kit', { tag: '@nodata' }, () => {
  const game = new Game({
    players: [
      { name: 'A', pigNames: ['a1'] },
      { name: 'B', pigNames: ['b1'] }
    ],
    spawns: [
      { x: 0, z: 0, pigClass: 0 },
      { x: 0, z: 0, pigClass: 1 }
    ]
  })
  expect(amountOf(game.players[0].pigs[0].carrying, SKILL.RIFLE)).toBe(UNLIMITED)
  // The gunner's is a different family: no rifle, a bazooka that never runs
  // out.
  expect(amountOf(game.players[1].pigs[0].carrying, SKILL.RIFLE)).toBe(0)
  expect(amountOf(game.players[1].pigs[0].carrying, SKILL.BAZOOKA)).toBe(UNLIMITED)
  // Its OWN kit: spending one pig's grenades must not touch another battle's.
  expect(game.players[0].pigs[0].carrying).not.toBe(outfit(0))
})
