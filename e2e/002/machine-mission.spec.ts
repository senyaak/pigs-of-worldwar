// PHASE 002 (domain) — THE MACHINE PLAYS A WHOLE MISSION, no app, no
// renderer: mission 1 (ESTU) built out of real map data in plain Node, BOTH
// sides handed to the machine, and stepped until the verdict.
//
// This is the "can the first mission be played" question asked of the code
// instead of a feeling: two squads of grunt brains (lib/game/grunt.ts) walk
// the routes, price their kits, shoot, and one of them wipes the other —
// through the same handover, the same beats and the same one place a
// mission can end that a player's battle uses. If a brain ever stalls, the
// turn clock runs the turn out; if the FIGHT stalls, the step cap below
// fails this spec and that is exactly what it is for.

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
import { isDead } from '../../src/lib/game/health'

/** Campaign mission 1 — two sides of three grunts, and seven crates
 * (docs/todo.md; the crate survey is in the AI work's log). */
const MAP = 'ESTU'
const FRAME = 1 / 15
const GRUNT = 'pcgru_me'

test('the machine plays mission 1 against itself to a verdict', async () => {
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
  const squads = mapSquads(objects, teams, [])
  const game = musterGame({
    squads,
    map: MAP,
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })
  expect(game.players.length, 'ESTU fields two sides').toBe(2)

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
      parachutes: true
    },
    query,
    seed: 7,
    onChanged: () => {},
    bus,
    // EVERYBODY is the machine: the mission plays itself.
    computer: () => true
  })

  while (engine.dropIn.running()) engine.update(FRAME)

  // An hour of simulated battle is the stall line — a fight between six
  // grunts is over long before it.
  const CAP = 15 * 3600
  let frames = 0
  while (engine.battle.view().ending === null && frames < CAP) {
    engine.update(FRAME)
    frames++
  }

  const ending = engine.battle.view().ending
  console.log(
    `verdict at ~${Math.round(frames / 15)}s of battle; kills=${heard.filter((e) => e.kind === 'killed').length}; fired=${heard.filter((e) => e.kind === 'fired').length}; survivors=${game.players.map((p) => p.pigs.filter((pig) => !isDead(pig)).length).join('v')}`
  )
  expect(ending, `a verdict inside ${frames} frames (~${Math.round(frames / 15)} s of battle)`).not.toBeNull()

  // …and it was a FIGHT, not a clock dying of old age: shots went off,
  // damage landed, and one whole side is gone.
  expect(heard.some((event) => event.kind === 'fired')).toBe(true)
  expect(heard.some((event) => event.kind === 'damaged')).toBe(true)
  expect(heard.filter((event) => event.kind === 'killed').length).toBeGreaterThanOrEqual(3)
  const wiped = game.players.filter((player) => player.pigs.every((pig) => isDead(pig)))
  expect(wiped.length, 'one side was wiped out').toBeGreaterThanOrEqual(1)
})
