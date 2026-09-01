// WEAPONS — the GRUNT, class 0, where every career starts.
//
// It is one sub-suite of its own rather than a line in another file, because
// it is the only class that is not a step in a career: `ranks.ts`'s tree gives
// it FOUR ways out where every other class has one, and its kit is the floor
// the other sixteen are read against.

import { test, expect } from '@playwright/test'

import { Game } from '../../src/lib/game/game'

import { careerOf, promotionsFrom, stepOf } from '../../src/lib/game/ranks'
import { maxHealthFor } from '../../src/lib/game/health'
import { outfit } from '../../src/lib/game/kits'
import { UNLIMITED, amountOf } from '../../src/lib/game/inventory'
import { endsTurn } from '../../src/lib/game/spend'
import { kitOf, routes } from './kit'

const GRUNT = 0

test.describe('GRUNT — class 0', () => {
  test('starts every career and has four ways out of it', { tag: '@nodata' }, () => {
    expect(careerOf(GRUNT)).toBe('heavy')
    expect(stepOf(GRUNT)).toBe(0)
    expect(maxHealthFor(GRUNT)).toBe(50)
    // One per career, all a point apiece — which is why choosing is a screen.
    expect(promotionsFrom(GRUNT).map((one) => one.to)).toEqual([1, 5, 8, 11])
    expect(promotionsFrom(GRUNT).every((one) => one.cost === 1)).toBe(true)
  })

  test('steps onto the field ARMED — a bayonet, a rifle, three grenades', { tag: '@nodata' }, () => {
    expect(kitOf(GRUNT)).toEqual([
      [3, UNLIMITED],
      [7, UNLIMITED],
      [19, 3]
    ])
    // Which is the whole point of `outfit`: the crates are a top-up, not the
    // source (lib/game/kits.ts).
    expect(outfit(GRUNT)).toHaveLength(3)
  })

  test('and all three of them ANSWER the fire key', { tag: '@nodata' }, () => {
    expect(routes(GRUNT)).toEqual({
      '3 bayonet': 'melee',
      '7 rifle': 'gun',
      '19 grenade': 'gauge'
    })
  })

  test('every one of them spends the turn', { tag: '@nodata' }, () => {
    expect([3, 7, 19].map(endsTurn)).toEqual([true, true, true])
  })

  test('a class off the end of the table IS a grunt', { tag: '@nodata' }, () => {
    // The same fallback its health and its art take, so a save carrying
    // nonsense arms a pig rather than emptying its trotters.
    expect(outfit(99)).toEqual(outfit(GRUNT))
    expect(maxHealthFor(99)).toBe(maxHealthFor(GRUNT))
  })
})

// …and the one thing about kits that is not about any single class: that a
// BATTLE hands them out at all. It stood in `unit/kits.spec.ts` with three
// tests this suite now makes per class, and came here whole when they went.
test.describe('what a battle hands out', () => {
  test('a fresh battle arms every pig from its OWN class', { tag: '@nodata' }, () => {
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
    const grunt = game.players[0].pigs[0]
    const gunner = game.players[1].pigs[0]
    expect(amountOf(grunt.carrying, 7)).toBe(UNLIMITED)
    // The gunner's is a different family: no rifle, a bazooka that never
    // runs out.
    expect(amountOf(gunner.carrying, 7)).toBe(0)
    expect(amountOf(gunner.carrying, 29)).toBe(UNLIMITED)
    // Its OWN copy: spending one pig's grenades must not touch the table
    // every other battle reads.
    expect(grunt.carrying).not.toBe(outfit(0))
  })
})
