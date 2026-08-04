// PHASE 002 (domain) — the Game class, driven directly: no Electron, no
// renderer. Pure-logic specs sit beside the app specs of their phase; they
// are the cheapest place to pin the rules down.

import { test, expect } from '@playwright/test'

import { Game } from '../../src/lib/game/game'
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

test('a game refuses mismatched spawns or a lonely player', () => {
  expect(() => new Game({ ...config, spawns: config.spawns.slice(1) })).toThrow(/spawns/)
  expect(() => new Game({ players: [config.players[0]], spawns: config.spawns.slice(0, 4) })).toThrow(/two players/)
})

test('spawns on the real CAMP (the battle map): walkable, apart, split west/east', () => {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const query = new TerrainQuery(blocks)
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
