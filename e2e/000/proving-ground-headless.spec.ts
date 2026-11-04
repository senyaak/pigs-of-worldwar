// PHASE 000 (continued) — the PROVING GROUND, built and stepped with nothing
// drawing it.
//
// The remake's own map (docs/facts/proving-ground.md): its ground and records
// are built in code, and its art comes out of the installed game — CAMP's
// ground textures, each model out of the archive that carries it. This builds
// it the way the app does (main/provingGround.ts), puts it through the same
// `buildQuery` → `musterGame` → `createEngine` path as a shipped map
// (engine-headless.spec.ts beside it), and steps it.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { loadProvingGround } from '../../src/main/provingGround'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine } from '../../src/lib/game/engine'
import type { Engine } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'
import type { BrainPort } from '../../src/lib/game/brainPort'
import type { Game, Pig } from '../../src/lib/game/game'
import { isDead } from '../../src/lib/game/health'
import { POISON_PER_TURN } from '../../src/lib/game/poison'
import { SKILL } from '../../src/lib/game/skills'
import type { MapObject } from '../../src/lib/formats/pog'
import type { TerrainBlock } from '../../src/lib/formats/pmg'
import type { TerrainArt } from '../../src/lib/game/watermask'
import { bodyExtent } from '../../src/lib/game/body'
import { restingY } from '../../src/lib/game/locomotion'
import { WATER_KIND, textureKind } from '../../src/lib/game/watermask'
import { isSpawnMarker } from '../../src/lib/game/spawns'
import { PROVING_GROUND } from '../../src/lib/game/provingGround'
import { POND, STRIP, WATER_TEXTURE } from '../../src/lib/game/provingTerrain'
import { PROVING_ARCHIVES } from '../../src/lib/game/provingSources'
import { TILE_STEP } from '../../src/lib/formats/pmg'

/** The exe's engine frame: fifteen a second (lib/game/ballistics.ts). */
const FRAME = 1 / 15
/** The default dress (three/soldiers.ts); the engine wants the measurement. */
const GRUNT = 'pcgru_me'

const installed = (): boolean => existsSync(path.join(GAME_DIR, 'warhogs_.exe'))

test('the proving ground builds out of the install and steps — no renderer in the graph', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const chars = path.join(GAME_DIR, 'Chars')
  const loaded = await loadProvingGround((relPath) => path.join(GAME_DIR, relPath))
  const clips = await loadClips(chars)
  const teams = nations(await loadGameText(GAME_DIR, 'fetext'))
  const art = await loadModel(path.join(chars, 'british.mad'), GRUNT)

  const { blocks, textures } = loaded.terrain
  const objects = fielded(loaded.objects.objects)
  expect(objects.length, 'every record exists in a one-player game').toBe(loaded.objects.objects.length)

  // The ground wears CAMP.PTG, and the water art is what the work list measured:
  // texture 44's whole palette translucent (dll 0x10007b6c, lib/game/watermask.ts).
  expect(textures.length).toBeGreaterThan(WATER_TEXTURE)
  expect(textureKind(textures[WATER_TEXTURE].palette)).toBe(WATER_KIND)

  // Every record that has art got it, each model in the textures of the
  // archive it came out of — a face indexes its own archive's .mtd.
  const props = new Map(loaded.objects.props.map((prop) => [prop.name.toUpperCase(), prop]))
  for (const one of objects.filter((each) => !isSpawnMarker(each))) {
    expect(props.has(one.name.toUpperCase()), `${one.name} has a model`).toBe(true)
  }
  for (const { archive, models } of PROVING_ARCHIVES) {
    for (const name of models) {
      expect(props.get(name)!.textures.length, `${name} wears ${archive}'s textures`).toBeGreaterThan(0)
    }
  }
  expect(props.get('CARRY')!.textures).not.toBe(props.get('CRATE1')!.textures)
  expect(props.get('TANK')!.textures).toBe(props.get('BIG_GUN')!.textures)

  const query = buildQuery(blocks, textures)
  const squads = mapSquads(objects, teams, [])
  expect(squads.length).toBe(2)
  const game = musterGame({
    squads,
    map: PROVING_GROUND,
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })
  const engine = createEngine({
    world: {
      game,
      blocks,
      terrainArt: textures,
      objects,
      clips,
      skeleton: art.skeleton,
      map: PROVING_GROUND,
      parachutes: true
    },
    query,
    seed: 7,
    onChanged: () => {},
    bus: createBus()
  })

  // Nothing is held back by the script and nothing drops in.
  expect(engine.scenery.waiting()).toEqual([])
  expect(engine.dropIn.running(), 'nobody is coming down').toBe(false)

  // The open water is water to the terrain query — the bit AND the art agree
  // (`Map::IsInWater` 0x4a6fa0, `afIsPointWatery` dll 0x10010210) — and the
  // strip is not.
  for (let x = POND.x0 + TILE_STEP / 2; x < POND.x1; x += TILE_STEP) {
    for (let z = POND.z0 + TILE_STEP / 2; z < POND.z1; z += TILE_STEP) {
      expect(query.isWater(x, z), `(${x}, ${z}) is water`).toBe(true)
    }
  }
  const wetStrip: string[] = []
  for (let x = STRIP.x0; x <= STRIP.x1; x += TILE_STEP) {
    for (const z of [STRIP.z0, 0, STRIP.z1]) if (query.isWater(x, z)) wetStrip.push(`(${x}, ${z})`)
  }
  expect(wetStrip).toEqual([])

  // Some seconds of battle, with the pig walking down the strip.
  game.cutTurnStart()
  engine.battle.setIntent(1, 0)
  for (let frame = 0; frame < 15 * 3; frame++) engine.update(FRAME)
  engine.battle.setIntent(0, 0)
  for (let frame = 0; frame < 15 * 3; frame++) engine.update(FRAME)

  // Every pig stands on the ground.
  for (const pig of game.players.flatMap((player) => player.pigs)) {
    const under = restingY(engine.query, pig.position.x, pig.position.z)
    expect(Math.abs(pig.position.y - under), `${pig.name} on the ground`).toBeLessThan(2)
  }
})

// THE DUMMIES SKIP THEIR TURNS — `[play]`, 2026-11-02, "real enemy pigs that
// skip their turns" (docs/facts/proving-ground.md). The sides are the app's own
// (three/battle.ts): everyone but side 0 is the machine's.
const machineSides = (side: number): boolean => side > 0

/** A turn is given this long in engine frames before the spec calls it stuck:
 * a whole minute of turn clock, which a pass never comes near. */
const TURN_CAP = 15 * 60

interface Stepped {
  engine: Engine
  game: Game
  heard: BattleEvent[]
}

/** The real map through the app's own path, with the machine on `machineSides`. */
async function assemble(
  map: string,
  blocks: TerrainBlock[],
  textures: TerrainArt[],
  records: MapObject[],
  brain?: BrainPort
): Promise<Stepped> {
  const chars = path.join(GAME_DIR, 'Chars')
  const clips = await loadClips(chars)
  const teams = nations(await loadGameText(GAME_DIR, 'fetext'))
  const art = await loadModel(path.join(chars, 'british.mad'), GRUNT)
  const objects = fielded(records)
  const query = buildQuery(blocks, textures)
  const game = musterGame({
    squads: mapSquads(objects, teams, []),
    map,
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const engine = createEngine({
    world: {
      game,
      blocks,
      terrainArt: textures,
      objects,
      clips,
      skeleton: art.skeleton,
      map,
      parachutes: true
    },
    query,
    seed: 7,
    onChanged: () => {},
    bus,
    computer: machineSides,
    brain
  })
  return { engine, game, heard }
}

async function provingBattle(brain?: BrainPort): Promise<Stepped> {
  const loaded = await loadProvingGround((relPath) => path.join(GAME_DIR, relPath))
  return assemble(
    PROVING_GROUND,
    loaded.terrain.blocks,
    loaded.terrain.textures,
    loaded.objects.objects,
    brain
  )
}

/** A brain that only counts: the dummies must never reach it. */
function countingBrain(): { port: BrainPort; asked: () => number } {
  let asks = 0
  return {
    port: {
      ask() {
        asks++
      },
      answer: () => null,
      thinking: () => false,
      drop() {},
      reset() {},
      close() {}
    },
    asked: () => asks
  }
}

/** The player's own pass, the way the keys make it (input/battleInput.ts): the
 * skill in hand and the fire key pressed. */
function passOurTurn({ engine, game }: Stepped): void {
  game.cutTurnStart()
  game.currentPig.holding = SKILL.SKIP_TURN
  engine.battle.setFiring(true, true)
  engine.update(FRAME)
  engine.battle.setFiring(false, false)
}

/** Step until `done`; a turn that never gets there fails here, with `what`. */
function stepUntil({ engine }: Stepped, done: () => boolean, what: string, each: () => void = () => {}): void {
  let frames = 0
  while (!done()) {
    expect(frames++, what).toBeLessThan(TURN_CAP)
    engine.update(FRAME)
    each()
  }
}

const turnsBegun = (heard: BattleEvent[]): Extract<BattleEvent, { kind: 'turnBegan' }>[] =>
  heard.filter((event): event is Extract<BattleEvent, { kind: 'turnBegan' }> => event.kind === 'turnBegan')

const standing = (pig: Pig): { x: number; y: number; z: number; heading: number } => ({
  ...pig.position,
  heading: pig.heading
})

test('the dummies skip their turns: each one comes up and passes, never moved, and the brain is never asked', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const brain = countingBrain()
  const battle = await provingBattle(brain.port)
  const { game, heard } = battle
  const dummies = game.players[1].pigs
  const before = dummies.map(standing)
  const whose = new Set<number>()

  // Four dummies, so four rounds give each of them its own turn.
  for (let round = 0; round < dummies.length; round++) {
    passOurTurn(battle)
    stepUntil(battle, () => game.currentPlayer === game.players[1], 'the dummy side gets its turn')
    expect(turnsBegun(heard).at(-1), 'a dummy turn begins').toMatchObject({ player: 1, computer: true })
    whose.add(game.currentPig.id)

    const usedBefore = heard.filter((event) => event.kind === 'skillUsed').length
    stepUntil(
      battle,
      () => game.currentPlayer === game.players[0],
      'the dummy passes and the turn comes back',
      // Checked on every frame of the turn, every dummy: nothing walks a step.
      () => expect(dummies.map(standing)).toEqual(before)
    )
    // The ordinary pass, SKIP TURN fired once, not the clock running it out.
    expect(heard.filter((event) => event.kind === 'skillUsed').length).toBe(usedBefore + 1)
    expect(turnsBegun(heard).at(-1), "then it is the player's").toMatchObject({ player: 0, computer: false })
  }

  expect(whose.size, 'every dummy had its own turn').toBe(dummies.length)
  expect(heard.filter((event) => event.kind === 'aiDecided')).toEqual([])
  expect(heard.filter((event) => event.kind === 'fired')).toEqual([])
  expect(brain.asked(), 'the brain is never asked').toBe(0)
})

test('control: on a shipped map the same stepping still gets the brain a decision', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const maps = path.join(GAME_DIR, 'Maps')
  const terrain = await loadTerrain(path.join(maps, 'ESTU.PMG'))
  const records = await loadMapObjects(path.join(maps, 'ESTU.POG'))
  const battle = await assemble('ESTU', terrain.blocks, terrain.textures, records.objects)
  const { engine, heard } = battle

  while (engine.dropIn.running()) engine.update(FRAME)
  passOurTurn(battle)
  stepUntil(
    battle,
    () => heard.some((event) => event.kind === 'aiDecided'),
    "the machine decides something on a shipped map's enemy turn"
  )
  expect(turnsBegun(heard).at(-1)).toMatchObject({ player: 1, computer: true })
})

test('a dummy is still hurt on its own turn: the poison bites and the turn ends as anywhere', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const brain = countingBrain()
  const battle = await provingBattle(brain.port)
  const { engine, game, heard } = battle
  const dummies = game.players[1].pigs
  // Poison started on them, as a gas cloud of the player's would have left it.
  for (const dummy of dummies) engine.poison.afflict(dummy)
  const healthy = dummies[0].health

  // The first dummy's turn, whichever the side is seated on (`Game.endTurn`):
  // ten points, on the top of its own turn (0x4703A0, `weapons/gas.md`,
  // lib/game/poison.ts).
  passOurTurn(battle)
  stepUntil(battle, () => game.currentPlayer === game.players[1], "the first dummy's turn")
  const bitten = game.currentPig
  expect(bitten.health).toBe(healthy - POISON_PER_TURN)
  expect(heard).toContainEqual(expect.objectContaining({ kind: 'damaged', pig: bitten.id, amount: POISON_PER_TURN }))
  expect(turnsBegun(heard).at(-1), 'the card reads the health the turn starts on').toMatchObject({
    player: 1,
    health: healthy - POISON_PER_TURN
  })
  // …and its turn ends in the pass.
  stepUntil(battle, () => game.currentPlayer === game.players[0], 'the bitten dummy passes')
  expect(isDead(bitten)).toBe(false)

  // The next one is left under the ten points: the bite kills it the moment its
  // turn comes, and a dead acting pig ends the turn the way it does anywhere
  // (lib/game/battle/turnEnd.ts, `clockBeat`).
  for (const dummy of dummies) if (dummy !== bitten) dummy.health = POISON_PER_TURN / 2
  passOurTurn(battle)
  stepUntil(battle, () => game.currentPlayer === game.players[1], "the second dummy's turn")
  const killed = game.currentPig
  expect(killed).not.toBe(bitten)
  expect(isDead(killed)).toBe(true)
  expect(heard).toContainEqual(expect.objectContaining({ kind: 'killed', pig: killed.id }))
  stepUntil(battle, () => game.currentPlayer === game.players[0], 'the turn comes back past the dead dummy')

  expect(brain.asked(), 'the brain is never asked').toBe(0)
})
