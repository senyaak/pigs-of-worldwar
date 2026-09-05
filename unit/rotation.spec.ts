// PHASE 002 (domain) — where a side's turn cursor starts. Pure, no Electron.
//
// The exe's team is a linked list in POG-marker order and `Team::NextPig`
// (0x499370) walks it round, dead-skipped — the same round-robin the remake
// runs. What the remake had wrong was the FIRST turn: `NextPig` on an empty
// cursor takes the first living pig and returns the one AFTER it, and only
// the side that opens the game has its cursor seeded (`StartGame`, 0x496918).
// Play, on TRENCH: "должен ходить артиллерист первый, а ходит обычный свин" —
// the gunner is the enemy's second marker. `lib/game/game.ts`, `NO_CURSOR`.
import { test, expect } from '@playwright/test'

import { Game, NO_CURSOR } from '../src/lib/game/game'

const squads = (...sides: string[][]): Game =>
  new Game({
    players: sides.map((names, i) => ({ name: `side ${i}`, pigNames: names })),
    spawns: sides.flat().map((_, i) => ({ x: i * 100, z: 0 }))
  })

test("the opening side starts on its first pig; every other side's first turn is its SECOND", { tag: '@nodata' }, () => {
  const game = squads(['a1', 'a2', 'a3'], ['b1', 'b2', 'b3', 'b4'], ['c1', 'c2'])
  expect(game.players.map((side) => side.activePig)).toEqual([0, NO_CURSOR, NO_CURSOR])
  expect(game.currentPig.name).toBe('a1')
  game.endTurn()
  expect(game.currentPig.name).toBe('b2')
  game.endTurn()
  expect(game.currentPig.name).toBe('c2')
  // …and from there each squad goes round in file order, the first pig last.
  game.endTurn()
  expect(game.currentPig.name).toBe('a2')
  game.endTurn()
  expect(game.currentPig.name).toBe('b3')
  game.endTurn()
  expect(game.currentPig.name).toBe('c1')
  game.endTurn()
  game.endTurn()
  expect(game.currentPig.name).toBe('b4')
  game.endTurn()
  game.endTurn()
  game.endTurn()
  expect(game.currentPig.name).toBe('b1')
})

test('TRENCH: grunt, GUNNER, grunt, grunt in the file — the gunner opens', { tag: '@nodata' }, () => {
  const game = squads(['player'], ['GR', 'HV', 'GR2', 'GR3'])
  game.endTurn()
  expect(game.currentPig.name).toBe('HV')
})

test('a squad of one is seated on that one, and a fallen first pig is stepped past', { tag: '@nodata' }, () => {
  const alone = squads(['a1'], ['only'])
  alone.endTurn()
  expect(alone.currentPig.name).toBe('only')
  // The exe seats on the pig after the first LIVING one: b1 down, the first
  // living is b2, and the seat is the one after that.
  const fallen = squads(['a1'], ['b1', 'b2', 'b3'])
  fallen.players[1].pigs[0].health = 0
  fallen.endTurn()
  expect(fallen.currentPig.name).toBe('b3')
})
