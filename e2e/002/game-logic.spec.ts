// PHASE 002 (domain) — the Game class, driven directly: no Electron, no
// renderer. Pure-logic specs sit beside the app specs of their phase; they
// are the cheapest place to pin the rules down.

import { test, expect } from '@playwright/test'

import { DEFAULT_TURN_SECONDS, Game } from '../../src/lib/game/game'
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

test('the turn clock ticks down, expires exactly once, and refills', () => {
  const game = new Game({ ...config, turnSeconds: 10 })
  expect(game.timeLeft).toBe(10)
  expect(game.tick(4)).toBe(false)
  expect(game.timeLeft).toBe(6)

  // Movement is free while the clock runs — the clock IS the limit.
  game.moveCurrentPig(100, 200, Math.PI / 2)
  expect(game.currentPig.position).toEqual({ x: 100, z: 200 })
  expect(game.currentPig.heading).toBeCloseTo(Math.PI / 2)
  game.turnCurrentPig(1)
  expect(game.currentPig.heading).toBe(1)

  // Expiry reports true exactly once; endTurn hands the next pig a full clock.
  expect(game.tick(7)).toBe(true)
  expect(game.tick(1)).toBe(false)
  game.endTurn()
  expect(game.timeLeft).toBe(10)

  expect(new Game(config).timeLeft).toBe(DEFAULT_TURN_SECONDS)
})

test('a game refuses mismatched spawns or a lonely player', () => {
  expect(() => new Game({ ...config, spawns: config.spawns.slice(1) })).toThrow(/spawns/)
  expect(() => new Game({ players: [config.players[0]], spawns: config.spawns.slice(0, 4) })).toThrow(/two players/)
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

test('water on CAMP: swimmable (walkable but wet), never standable', () => {
  const { query, blocks } = campQuery()
  const ponds = tileCenters(blocks, (tile) => (tile.type & 0x20) !== 0)
  expect(ponds.length).toBeGreaterThan(50)
  for (const pond of ponds) {
    expect(query.isWater(pond.x, pond.z), `water at ${pond.x},${pond.z}`).toBe(true)
    expect(query.walkable(pond.x, pond.z), 'pigs can swim there').toBe(true)
    expect(query.standable(pond.x, pond.z), 'but never spawn there').toBe(false)
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

test('spawns on the real CAMP (the battle map): walkable, apart, split west/east', () => {
  const { query } = campQuery()
  const spawns = query.pickSpawns(8)
  expect(spawns).toHaveLength(8)
  for (const spawn of spawns) {
    expect(query.walkable(spawn.x, spawn.z), `walkable at ${spawn.x},${spawn.z}`).toBe(true)
    // Standing height is a real terrain sample, not the sea of zeros.
    expect(Math.abs(query.height(spawn.x, spawn.z))).toBeGreaterThan(0)
  }
  // The two squads start on opposite halves of the map.
  const west = spawns.slice(0, 4)
  const east = spawns.slice(4)
  const mid = (west[0].x + east[0].x) / 2
  for (const s of west) expect(s.x).toBeLessThan(mid)
  for (const s of east) expect(s.x).toBeGreaterThan(mid)
})
