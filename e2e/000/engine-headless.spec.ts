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
import { give } from '../../src/lib/game/inventory'
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
const GRUNT = 'pcgru_me'

/** Skill 7, the rifle — and its muzzle is 350 units down the barrel
 * (lib/game/bullets.ts). */
const RIFLE = 7

interface Built {
  engine: Engine
  game: Game
  heard: BattleEvent[]
}

/** Records to leave OFF the map, by model name — how a mission is put into a
 * state the training ground would take the whole tutorial to reach. */
async function buildHeadless(seed?: number, without: string[] = []): Promise<Built> {
  const maps = path.join(GAME_DIR, 'Maps')
  const chars = path.join(GAME_DIR, 'Chars')
  const terrain = await loadTerrain(path.join(maps, `${MAP}.PMG`))
  const loaded = await loadMapObjects(path.join(maps, `${MAP}.POG`))
  const clips = await loadClips(chars)
  const teams = nations(await loadGameText(GAME_DIR, 'fetext'))
  const art = await loadModel(path.join(chars, 'british.mad'), GRUNT)

  const objects = fielded(loaded.objects).filter(
    (one) => !without.includes(one.name.toUpperCase())
  )
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
      skeleton: art.skeleton,
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

test('a gun finds its own barrel — the engine poses the skeleton itself', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const { engine, game, heard } = await buildHeadless()
  while (engine.dropIn.running()) engine.update(FRAME)
  game.beginTurn()

  const pig = game.currentPig
  give(pig.carrying, RIFLE, 5)
  pig.holding = RIFLE
  // Getting it out takes a clip, and nothing fires until it has run.
  for (let frame = 0; frame < 45; frame++) engine.update(FRAME)

  engine.battle.setFiring(true, true)
  engine.update(FRAME)
  engine.battle.setFiring(false, false)

  // THE point of the whole exercise. A shot starts at the MUZZLE, which is an
  // offset in the hand bone's frame — and until the engine could pose a
  // skeleton of its own it had to ask a renderer for it, so a battle nobody
  // was drawing could not fire at all (lib/game/bonePose.ts).
  let up: { x: number; y: number; z: number } | null = null
  for (let frame = 0; frame < 45 && !up; frame++) {
    engine.update(FRAME)
    const flying = engine.shots.live()[0]
    if (flying) up = { x: flying.x, y: flying.y, z: flying.z }
  }
  expect(heard.some((event) => event.kind === 'fired'), 'the gun went off').toBe(true)
  expect(up, 'a bullet is in the air').not.toBeNull()

  // …and it came off a POSED skeleton, not off the pig's own origin: the
  // barrel is 350 units out and a hand's height up, and where that lands
  // depends on what the arm is doing.
  const reach = Math.hypot(up!.x - pig.position.x, up!.z - pig.position.z)
  expect(reach, 'it left from the barrel, not from the hip').toBeGreaterThan(20)
})

/**
 * **THE MISSION ENDS WHEN THERE IS NOTHING LEFT TO KNOCK DOWN.**
 *
 * Play: "убить последний манекен — не заканчивает миссию… очевидно что
 * заканчивает миссию." It is asked at the HANDOVER and nowhere else, which is
 * where the exe asks it (0x48F490 → 0x4966A0, lib/game/endOfGame.ts) — so this
 * runs the clock out, ends the turn, and watches what the handover decides.
 *
 * The training ground's own condition would take the whole tutorial to reach
 * honestly — eleven dummies, each waiting on the crate before it — so the map is
 * built here with its DUMMY records left off. Everything else about it stands,
 * the 85 firs and the eighteen house pieces included: those are breakable and
 * they are not what a mission is measured by.
 */
test('the last dummy ENDS the training mission, and three seconds later it lets go', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const played = await buildHeadless(7)
  const cleared = await buildHeadless(7, ['DUMMY'])

  expect(played.engine.targetsLeft(), 'CAMP carries its eleven dummies').toBe(11)
  expect(cleared.engine.targetsLeft(), 'and none with them taken off').toBe(0)

  /** Run the clock out and take the handover — the only place a mission ends. */
  const handOver = async ({ engine, game }: Built): Promise<void> => {
    while (engine.dropIn.running()) engine.update(FRAME)
    game.beginTurn()
    game.hurryTurn(0.1)
    for (let frame = 0; frame < 10; frame++) engine.update(FRAME)
    // The beat at the END of the turn is not what this is about (walkAway.ts).
    engine.battle.cutTurnBeat()
    engine.update(FRAME)
  }

  await handOver(played)
  expect(played.engine.battle.view().ending, 'a mission with dummies left carries on').toBeNull()

  await handOver(cleared)
  const ending = cleared.engine.battle.view().ending
  expect(ending, 'nothing left to break: the mission is over').not.toBeNull()
  expect(ending!.won).toBe(true)
  expect(ending!.watching, 'the camera is on a pig that is still standing').toBe(
    cleared.game.currentPig.id
  )
  expect(
    cleared.heard.some((event) => event.kind === 'missionOver'),
    'and it announced itself, which is what the sergeant speaks off'
  ).toBe(true)

  // **A key is worth nothing for the first three seconds** (`cmp eax,12Ch`,
  // 0x490FB4) — the finger that broke the last dummy must not skip the ending it
  // earned.
  cleared.engine.battle.leaveMission()
  cleared.engine.update(FRAME)
  expect(cleared.heard.some((event) => event.kind === 'missionEnded')).toBe(false)

  for (let frame = 0; frame < 15 * 3; frame++) cleared.engine.update(FRAME)
  cleared.engine.battle.leaveMission()
  cleared.engine.update(FRAME)
  expect(
    cleared.heard.some((event) => event.kind === 'missionEnded'),
    'past three seconds, any key puts the battle away'
  ).toBe(true)
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
