// PHASE 002 (domain) — health, damage and dying. Pure, no Electron.
//
// The numbers are the exe's: a per-class table at 0x4d02e0, death below one
// whole point, a training ground that will not let a pig fall, and a heal
// with no ceiling at all. `damage/notes.md`.

import { test, expect } from '@playwright/test'

import { Game } from '../src/lib/game/game'
import {
  CLASS_HEALTH,
  GIB_BELOW,
  TRAINING_FLOOR,
  heal,
  hurt,
  isDead,
  maxHealthFor
} from '../src/lib/game/health'
import { meleeOf } from '../src/lib/game/melee'

test('a grunt has fifty and a heavy far more — health is the CLASS s', { tag: '@nodata' }, () => {
  expect(maxHealthFor(0)).toBe(50)
  expect(maxHealthFor(4)).toBe(130)
  expect(CLASS_HEALTH).toHaveLength(12)
  // A class off the end of the table dresses as a grunt and lives like one.
  expect(maxHealthFor(99)).toBe(maxHealthFor(0))
})

test('five bayonet swings put a grunt down, and the fifth is the one', { tag: '@nodata' }, () => {
  const bayonet = meleeOf(3)!
  const pig = { health: maxHealthFor(0) }
  for (let swing = 1; swing <= 4; swing++) {
    expect(hurt(pig, bayonet.damage, false)).toBe('hurt')
    expect(isDead(pig)).toBe(false)
  }
  expect(hurt(pig, bayonet.damage, false)).toBe('died')
  expect(isDead(pig)).toBe(true)
  expect(pig.health).toBe(0)
})

test('the training ground will not let a pig fall', { tag: '@nodata' }, () => {
  const pig = { health: 10 }
  expect(hurt(pig, 50, true)).toBe('spared')
  expect(pig.health).toBe(TRAINING_FLOOR)
  expect(isDead(pig)).toBe(false)
})

test('sixty points past dead is a different death', { tag: '@nodata' }, () => {
  // The exe's test is STRICTLY below −0x1e00 (0x467cb1 is a `jge` out), so
  // exactly sixty under is still the ordinary death.
  const edge = { health: 10 }
  expect(hurt(edge, 10 - GIB_BELOW, false)).toBe('died')
  const pig = { health: 10 }
  expect(hurt(pig, 10 - GIB_BELOW + 1, false)).toBe('gibbed')
})

test('healing has no ceiling, because the exe has none', { tag: '@nodata' }, () => {
  const pig = { health: 40 }
  heal(pig, 50)
  expect(pig.health).toBe(90)
  expect(pig.health).toBeGreaterThan(maxHealthFor(0))
  // Nothing happens for nothing.
  heal(pig, 0)
  expect(pig.health).toBe(90)
})

test('the dead are stepped over, by pig and by side', { tag: '@nodata' }, () => {
  const game = new Game({
    players: [
      { name: 'A', pigNames: ['a1', 'a2'] },
      { name: 'B', pigNames: ['b1', 'b2'] }
    ],
    spawns: [0, 1, 2, 3].map(() => ({ x: 0, z: 0 }))
  })
  expect(game.currentPig.name).toBe('a1')
  // B's first pig falls: B's turn should field b2, not a corpse.
  game.players[1].pigs[0].health = 0
  game.endTurn()
  expect(game.currentPlayer.name).toBe('B')
  expect(game.currentPig.name).toBe('b2')
  // And with the whole of B gone, A keeps playing and the battle is not over.
  game.players[1].pigs[1].health = 0
  game.endTurn()
  expect(game.currentPlayer.name).toBe('A')
  expect(game.over).toBe(false)
  // Everyone down is everyone down.
  for (const player of game.players) for (const pig of player.pigs) pig.health = 0
  expect(game.over).toBe(true)
})
