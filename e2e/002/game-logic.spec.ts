// PHASE 002 (domain) — the Game class, driven directly: no Electron, no
// renderer. Pure-logic specs sit beside the app specs of their phase; they
// are the cheapest place to pin the rules down.

import { test, expect } from '@playwright/test'

import {
  DEFAULT_TURN_SECONDS,
  Game,
  TURN_START_FLOOR_SECONDS,
  TURN_START_SECONDS
} from '../../src/lib/game/game'
import { endsTurn } from '../../src/lib/game/spend'
import { SKILL } from '../../src/lib/game/skills'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { parsePmg } from '../../src/lib/formats/pmg'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GAME_DIR } from '../launch'

const config = {
  players: [
    { name: 'Tommy’s Trotters', pigNames: ['Tommy', 'Wilson', 'Berry', 'Hogsworth'] },
    { name: 'Kaiser’s Grunters', pigNames: ['Hans', 'Fritz', 'Otto', 'Schweinrich'] }
  ],
  spawns: Array.from({ length: 8 }, (_, i) => ({ x: i * 1000, z: 0 }))
}

test('turns rotate players; each squad cycles through its pigs', () => {
  const game = new Game(config)
  expect(game.turn).toBe(1)
  expect(game.currentPlayer.name).toContain('Tommy')
  expect(game.currentPig.name).toBe('Tommy')

  game.endTurn()
  expect(game.currentPlayer.name).toContain('Kaiser')
  expect(game.currentPig.name).toBe('Hans')

  game.endTurn()
  // Back to player 1 — their SECOND pig now; a full rotation bumps the turn.
  expect(game.turn).toBe(2)
  expect(game.currentPig.name).toBe('Wilson')

  // Nine more half-turns land on turn 6's second player: squads of 4 have
  // wrapped once (11 handovers total: P2's pig index = (11-1)/2 % 4 = 1).
  for (let i = 0; i < 9; i++) game.endTurn()
  expect(game.currentPlayer.name).toContain('Kaiser')
  expect(game.currentPig.name).toBe('Fritz')
})

test('the turn does not begin at once — the clock waits out a beat first', () => {
  const game = new Game({ ...config, turnSeconds: 10 })
  // "START OF TURN - Press any key to continue": the clock is full and not
  // running (exe 0x4d8a2c, and the timeout beside it).
  expect(game.starting).toBe(true)
  expect(game.tick(TURN_START_SECONDS / 2)).toBe(false)
  expect(game.starting).toBe(true)
  expect(game.timeLeft, 'the clock has not moved').toBe(10)

  // It runs out on its own...
  game.tick(TURN_START_SECONDS)
  expect(game.starting).toBe(false)
  game.tick(1)
  expect(game.timeLeft).toBe(9)

  // ...and every later turn gets its own, which any input can cut short —
  // but NOT AT ONCE. Play wants the card on screen at least a second before a
  // press moves the game on, so the first second of the beat answers nothing
  // (TURN_START_FLOOR_SECONDS).
  game.endTurn()
  expect(game.starting).toBe(true)
  expect(game.beginTurn(), 'too early: the card has just gone up').toBe(false)
  expect(game.starting, 'so the beat is still running').toBe(true)
  expect(game.timeLeft, 'and the clock has still not moved').toBe(10)

  game.tick(TURN_START_FLOOR_SECONDS)
  expect(game.beginTurn(), 'and now it takes the press').toBe(true)
  expect(game.starting).toBe(false)
  game.tick(2)
  expect(game.timeLeft).toBe(8)

  // The SPECS' own door skips the floor with the beat — nothing a player has.
  game.endTurn()
  expect(game.starting).toBe(true)
  game.cutTurnStart()
  expect(game.starting).toBe(false)
})

test('the turn clock ticks down, expires exactly once, and refills', () => {
  const game = new Game({ ...config, turnSeconds: 10 })
  game.cutTurnStart()
  expect(game.timeLeft).toBe(10)
  expect(game.tick(4)).toBe(false)
  expect(game.timeLeft).toBe(6)

  // Movement is free while the clock runs — the clock IS the limit.
  game.moveCurrentPig(100, -50, 200, Math.PI / 2)
  expect(game.currentPig.position).toEqual({ x: 100, y: -50, z: 200 })
  expect(game.currentPig.heading).toBeCloseTo(Math.PI / 2)
  game.turnCurrentPig(1)
  expect(game.currentPig.heading).toBe(1)

  // Expiry reports true exactly once; endTurn hands the next pig a full clock.
  expect(game.tick(7)).toBe(true)
  expect(game.tick(1)).toBe(false)
  game.endTurn()
  game.cutTurnStart()
  expect(game.timeLeft).toBe(10)

  expect(new Game(config).timeLeft).toBe(DEFAULT_TURN_SECONDS)
})

test('using a weapon ENDS the turn, and thirteen skills are the exception', () => {
  // Everything this engine models is a blow, and a blow spends the turn: the
  // five blades, the twelve guns, the nine grenades (lib/game/spend.ts).
  for (const skill of [1, 2, 3, 4, 5, 6, 7, 11, 17, 19, 24, 27]) {
    expect(endsTurn(skill), `skill ${skill} spends the turn`).toBe(true)
  }
  // SKIP TURN is NOT one of the exceptions, and its record says so — ending the
  // turn is the whole of what it does.
  expect(endsTurn(SKILL.SKIP_TURN)).toBe(true)

  // The exceptions, off the exe's own records: the explosives a pig plants and
  // walks away from, and the skills that are not blows at all.
  for (const skill of [35, 36, 37, 38, 52, 54, 60, 61, 62, 63, 64, 66]) {
    expect(endsTurn(skill), `skill ${skill} leaves the turn alone`).toBe(false)
  }
  // Empty hands spend nothing, and 0 NONE is the same answer by the other route.
  expect(endsTurn(null)).toBe(false)
  expect(endsTurn(SKILL.NONE)).toBe(false)
})

test('a game refuses mismatched spawns, but one player is a game', () => {
  expect(() => new Game({ ...config, spawns: config.spawns.slice(1) })).toThrow(/spawns/)
  // The training ground fields one side of one pig, so a lonely player is
  // the shape a tutorial has: the turn comes back round to the same pig.
  const alone = new Game({ players: [config.players[0]], spawns: config.spawns.slice(0, 4) })
  const first = alone.currentPig
  alone.endTurn()
  expect(alone.currentPlayer).toBe(alone.players[0])
  expect(alone.currentPig).not.toBe(first)
  expect(alone.turn).toBe(2)
})

function campQuery(): { query: TerrainQuery; blocks: ReturnType<typeof parsePmg> } {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  return { query: new TerrainQuery(blocks), blocks }
}

/** World centers of every tile matching `want`, straight from the data. */
function tileCenters(
  blocks: ReturnType<typeof parsePmg>,
  want: (tile: { type: number; slip: number }) => boolean
): { x: number; z: number }[] {
  const centers: { x: number; z: number }[] = []
  for (const block of blocks) {
    block.tiles.forEach((tile, index) => {
      if (!want(tile)) return
      const col = index % 4
      const row = Math.floor(index / 4)
      centers.push({ x: block.x + col * 512 + 256, z: block.z + row * 512 + 256 })
    })
  }
  return centers
}

test('water on CAMP: swimmable — walkable, and wet', () => {
  const { query, blocks } = campQuery()
  const ponds = tileCenters(blocks, (tile) => (tile.type & 0x20) !== 0)
  expect(ponds.length).toBeGreaterThan(50)
  for (const pond of ponds) {
    expect(query.isWater(pond.x, pond.z), `water at ${pond.x},${pond.z}`).toBe(true)
    expect(query.walkable(pond.x, pond.z), 'pigs can swim there').toBe(true)
  }
})

test('a shaped wall tile on CAMP blocks part of itself, not all of it', () => {
  const { query, blocks } = campQuery()
  const plain = tileCenters(blocks, (tile) => (tile.type & 0x80) !== 0 && (tile.slip & 0x0f) === 0)
  const shaped = tileCenters(blocks, (tile) => (tile.type & 0x80) !== 0 && (tile.slip & 0x0f) !== 0)
  expect(plain.length).toBeGreaterThan(10)
  expect(shaped.length).toBeGreaterThan(10)

  // Shape 0 is the whole tile: nowhere inside it is walkable.
  const quarters = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx * 128, sz * 128]))
  for (const at of plain) {
    for (const [dx, dz] of quarters) {
      expect(query.walkable(at.x + dx, at.z + dz), `solid at ${at.x},${at.z}`).toBe(false)
    }
  }

  // Every other shape is half a tile or a diagonal, so a tile has both
  // walkable and blocked quarters — that is the whole point of the byte.
  let split = 0
  for (const at of shaped) {
    const open = quarters.filter(([dx, dz]) => query.walkable(at.x + dx, at.z + dz))
    if (open.length > 0 && open.length < quarters.length) split++
  }
  expect(split, 'shaped wall tiles are part-open').toBeGreaterThan(shaped.length * 0.9)
})
