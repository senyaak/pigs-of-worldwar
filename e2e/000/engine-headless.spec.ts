// PHASE 000 (continued) — the ENGINE, stepped with nothing drawing it.
//
// This spec launches no app. It reads a real map with the same loaders the
// main process uses, musters the map's own squad, builds a battle and steps
// it — in plain Node, with no Electron, no Chromium and no three.js anywhere
// in the import graph. That is the whole point: `npm run boundaries` proves
// nothing IMPORTS the renderer, and this proves the rules actually RUN without
// one, which is the difference between a tidy folder and an engine that can be
// hosted in its own process.
//
// It is phase zero because it is structural: no feature depends on it, and
// every feature depends on it being true.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import { bodyExtent } from '../../src/lib/game/body'
import { restingY } from '../../src/lib/game/locomotion'
import type { BattleEvent } from '../../src/lib/game/events'
import type { Engine } from '../../src/lib/game/engine'
import type { Game } from '../../src/lib/game/game'

/** The training ground — one side of one pig, and a script that holds most of
 * its records back (lib/game/scenery.ts). */
const MAP = 'CAMP'
/** The exe's engine frame: fifteen a second (lib/game/ballistics.ts). */
const FRAME = 1 / 15

/** The default dress. WHICH art a class wears is the renderer's table
 * (three/soldiers.ts); all the engine wants is the MEASUREMENT off it. */
const GRUNT = 'pcgru_hi'

interface Built {
  engine: Engine
  game: Game
  heard: BattleEvent[]
}

async function buildHeadless(seed?: number): Promise<Built> {
  const maps = path.join(GAME_DIR, 'Maps')
  const chars = path.join(GAME_DIR, 'Chars')
  const terrain = await loadTerrain(path.join(maps, `${MAP}.PMG`))
  const loaded = await loadMapObjects(path.join(maps, `${MAP}.POG`))
  const clips = await loadClips(chars)
  const teams = nations(await loadGameText(GAME_DIR, 'fetext'))
  const art = await loadModel(path.join(chars, 'british.mad'), GRUNT)

  const objects = fielded(loaded.objects)
  const query = buildQuery(terrain.blocks, terrain.textures)
  const squads = mapSquads(objects, teams)
  expect(squads.length, `${MAP} carries spawn markers`).toBeGreaterThan(0)

  const game = musterGame({
    squads,
    map: MAP,
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })

  // Nobody is listening but the test: no scene, no sound bank. The engine
  // announces anyway, which is what makes a second listener possible at all.
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
      map: MAP,
      parachutes: true
    },
    query,
    seed,
    onChanged: () => {},
    bus
  })
  return { engine, game, heard }
}

/** Everything about the battle that two machines have to agree on. */
const stateOf = ({ engine, game }: Built): string =>
  JSON.stringify({
    pigs: game.players.flatMap((player) =>
      player.pigs.map((pig) => [
        Math.round(pig.position.x),
        Math.round(pig.position.y),
        Math.round(pig.position.z),
        pig.heading.toFixed(6),
        pig.health
      ])
    ),
    waiting: engine.scenery.waiting(),
    falling: engine.airDrops.falling()
  })

test('the rules build a battle out of real map data — no renderer in the graph', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const { engine, game } = await buildHeadless()

  // The squad is standing on the ground its markers sit on, and it knows how
  // big it is — both used to be the mesh's alone (lib/game/body.ts).
  for (const pig of game.players.flatMap((player) => player.pigs)) {
    expect(pig.body.crownRise, 'a pig measured off its art').toBeGreaterThan(0)
    const ground = restingY(engine.query, pig.position.x, pig.position.z)
    // Y-DOWN: a pig that has not dropped in yet is ABOVE its ground, which is
    // a smaller y. Nothing is ever below it.
    expect(pig.position.y).toBeLessThanOrEqual(ground + 1)
  }

  // The map's script is holding records back — the training ground's dummies
  // and most of its crates arrive when something else has been finished off.
  expect(engine.scenery.waiting().length, 'records the script has not placed').toBeGreaterThan(0)
})

/**
 * The same inputs, twice, and both battles must be the same battle.
 *
 * This is what lockstep rests on: the step is a fixed quantum (STEP_SECONDS)
 * and every roll comes out of one seeded stream (lib/game/random.ts), so two
 * machines that agree on the seed and exchange nothing but INPUTS end up
 * holding identical state. Nothing here is networked — this is the property
 * the network would rely on, tested where it actually lives.
 */
function drive(built: Built): void {
  const { engine, game } = built
  while (engine.dropIn.running()) engine.update(FRAME)
  game.beginTurn()
  const script: [number, number][] = [
    [1, 0],
    [1, -1],
    [0, 1],
    [-1, 0],
    [1, 1]
  ]
  for (const [walk, turn] of script) {
    built.engine.battle.setIntent(walk, turn)
    for (let frame = 0; frame < 20; frame++) engine.update(FRAME)
  }
  built.engine.battle.setIntent(0, 0)
  built.engine.battle.jump()
  for (let frame = 0; frame < 30; frame++) engine.update(FRAME)
}

test('the same seed and the same inputs give the same battle — twice over', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const one = await buildHeadless(7)
  const two = await buildHeadless(7)
  drive(one)
  drive(two)
  expect(stateOf(two)).toBe(stateOf(one))

  // …and the seed is doing something. Where it shows is DURING the drop: the
  // stagger is a roll (`rand & 0x1ff` as a fraction, lib/game/dropIn.ts), so
  // two seeds put the squad at two different heights on the same step. Once
  // everyone is down they are down in the same place, which is why the check
  // above is not enough on its own.
  const early = async (seed: number): Promise<number> => {
    const built = await buildHeadless(seed)
    for (let step = 0; step < 6; step++) built.engine.update(FRAME)
    return built.game.currentPig.position.y
  }
  expect(await early(8)).not.toBe(await early(7))
  expect(await early(7), 'and the same seed is the same drop').toBe(await early(7))
})

test('it steps: the drop lands, the clock runs, and the pig walks where it is told', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const { engine, game, heard } = await buildHeadless()
  const { battle } = engine

  // The level opens with the drop. Nothing else in the battle runs while it
  // lasts, so stepping until it is over is stepping the whole opening phase.
  let frames = 0
  while (engine.dropIn.running() && frames < 15 * 30) {
    engine.update(FRAME)
    frames++
  }
  expect(engine.dropIn.running(), 'the squad is down').toBe(false)
  expect(frames, 'the drop took frames, it did not snap').toBeGreaterThan(1)
  expect(
    heard.filter((event) => event.kind === 'dropLanded').length,
    'every arriving pig announced its landing'
  ).toBeGreaterThan(0)

  const pig = game.currentPig
  const ground = restingY(engine.query, pig.position.x, pig.position.z)
  expect(Math.abs(pig.position.y - ground), 'it came down onto the ground').toBeLessThan(2)

  // The turn's beat is the input layer's to end (lib/game/battle.ts), and
  // there is no input layer here.
  game.beginTurn()
  const before = { x: pig.position.x, z: pig.position.z }
  const clockBefore = game.timeLeft

  battle.setIntent(1, 0)
  for (let frame = 0; frame < 15 * 2; frame++) engine.update(FRAME)
  battle.setIntent(0, 0)

  const moved = Math.hypot(pig.position.x - before.x, pig.position.z - before.z)
  expect(moved, 'two seconds of walking moved it').toBeGreaterThan(50)
  expect(game.timeLeft, 'the turn clock ran down').toBeLessThan(clockBefore)
  // …and it is still on the ground it walked over, not sunk into it or flying.
  const under = restingY(engine.query, pig.position.x, pig.position.z)
  expect(Math.abs(battle.view().loco.y - under), 'still standing on the map').toBeLessThan(30)
})
