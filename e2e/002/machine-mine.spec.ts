// PHASE 002 — the MACHINE's acting pig is thrown by a mine, and the game
// goes on. Plain Node, no app, no renderer.
//
// Play, TRENCH, 2026-09-05: "свин врага встал на мину и игра зависла." The
// telemetry of that session ends on the mine — `[blast] … effect 0x4c`,
// `[fling] pig 8 … v -1239,-1379,-605 flat 1379` for ABRAHAM, the machine's
// acting pig — with no `[fling-end]`, no `[turn]` and no `[perf]` after it.
// This spec puts that pig in that place with that velocity, during the
// machine's own turn, and asks the one thing the log could not: whether the
// turn ever ends.
import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'
import { bodyExtent } from '../../src/lib/game/body'

const MAP = 'TRENCH'
const FRAME = 1 / 15
const GRUNT = 'pcgru_me'

test('a machine pig thrown by a mine still hands the turn over', async () => {
  test.setTimeout(120_000)
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const maps = path.join(GAME_DIR, 'Maps')
  const chars = path.join(GAME_DIR, 'Chars')
  const terrain = await loadTerrain(path.join(maps, `${MAP}.PMG`))
  const loaded = await loadMapObjects(path.join(maps, `${MAP}.POG`))
  const clips = await loadClips(chars)
  const teams = nations(await loadGameText(GAME_DIR, 'fetext'))
  const art = await loadModel(path.join(chars, 'british.mad'), GRUNT)
  const objects = fielded(loaded.objects)
  const query = buildQuery(terrain.blocks, terrain.textures)
  const game = musterGame({
    squads: mapSquads(objects, teams, []),
    map: MAP,
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const engine = createEngine({
    world: {
      game,
      blocks: terrain.blocks,
      terrainArt: terrain.textures,
      objects,
      clips,
      skeleton: art.skeleton,
      map: MAP,
      parachutes: false
    },
    query,
    seed: 7,
    onChanged: () => {},
    bus,
    computer: () => true
  })
  while (engine.dropIn.running()) engine.update(FRAME)

  // Let the machine's SECOND side start acting: its card, then a few seconds
  // of its brain walking the pig.
  const sideOf = (): number => game.players.indexOf(game.currentPlayer)
  let frames = 0
  while ((sideOf() !== 1 || game.starting) && frames++ < 15 * 120) engine.update(FRAME)
  expect(sideOf(), 'the machine side is up').toBe(1)
  for (let f = 0; f < 15 * 3; f++) engine.update(FRAME)
  expect(sideOf(), 'and still up three seconds in').toBe(1)

  // The mine: the acting pig is put ON the tile the log's blast came from,
  // mid-order, and the tread sweep does the rest — the trip, the fuse, the
  // burst, the throw.
  engine.battle.warp(10496, -6400, 0)
  const before = heard.length
  for (let f = 0; f < 15 * 2 && !heard.slice(before).some((one) => one.kind === 'mineTripped'); f++) {
    engine.update(FRAME)
  }
  expect(heard.slice(before).map((one) => one.kind), 'the mine went off under it').toContain('mineTripped')

  // Sixty seconds of battle is longer than any flight, any get-up and any
  // aftermath beat — the turn must have gone over by then.
  const turned = heard.length
  frames = 0
  while (sideOf() === 1 && frames++ < 15 * 60) engine.update(FRAME)
  const after = heard.slice(turned).map((one) => one.kind)
  expect(sideOf(), `the turn went over (heard: ${[...new Set(after)].join(', ')})`).toBe(0)
})
