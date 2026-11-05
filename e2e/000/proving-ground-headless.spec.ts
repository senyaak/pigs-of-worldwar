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
import { isDead, maxHealthFor } from '../../src/lib/game/health'
import { MAX_SLOTS, amountOf, give } from '../../src/lib/game/inventory'
import { outfit } from '../../src/lib/game/kits'
import type { Pickup } from '../../src/lib/game/pickups'
import { POISON_PER_TURN } from '../../src/lib/game/poison'
import { SKILL } from '../../src/lib/game/skills'
import type { MapObject } from '../../src/lib/formats/pog'
import type { TerrainBlock } from '../../src/lib/formats/pmg'
import type { TerrainArt } from '../../src/lib/game/watermask'
import { bodyExtent } from '../../src/lib/game/body'
import { restingY } from '../../src/lib/game/locomotion'
import { WATER_KIND, textureKind } from '../../src/lib/game/watermask'
import { isSpawnMarker } from '../../src/lib/game/spawns'
import { CRATE_ROUNDS, CRATE_SKILLS, PROVING_GROUND } from '../../src/lib/game/provingGround'
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

// THE DUMMIES COME BACK — `[play]`, 2026-11-02, "stand up at full health at the
// start of a turn" (docs/facts/proving-ground.md). The rule alone is
// unit/provingDummies.spec.ts; this is the whole chain, a real charge going off
// on the real map and the handover (lib/game/battle/handover.ts) answering.

const seen = (heard: BattleEvent[], kind: BattleEvent['kind'], pig: number): number =>
  heard.findIndex((event) => event.kind === kind && 'pig' in event && event.pig === pig)

/** The turn's first step: the first card goes up on it (`openingDrop`). */
function intoTheTurn({ engine, game }: Stepped): void {
  while (engine.dropIn.running()) engine.update(FRAME)
  engine.update(FRAME)
  game.cutTurnStart()
}

/**
 * A real charge at the acting pig's feet, with `victims` stood round it — TNT is
 * fifty points and full damage out to 512 (lib/game/grenade.ts, row 37). Each
 * also faces somewhere else, so where it comes back to is not where it was hit.
 * The pig is given the health to outlive its own charge: it is not the subject.
 */
function plantAmong({ engine, game }: Stepped, victims: Pig[], radius: number): void {
  const pig = game.currentPig
  pig.health = 1000
  const { x, z } = pig.position
  victims.forEach((victim, index) => {
    const bearing = (index / victims.length) * 2 * Math.PI
    const at = { x: x + Math.cos(bearing) * radius, z: z + Math.sin(bearing) * radius }
    victim.position = { x: at.x, y: restingY(engine.query, at.x, at.z), z: at.z }
    victim.heading += 1
  })
  give(pig.carrying, SKILL.TNT, 1)
  pig.holding = SKILL.TNT
  engine.update(FRAME)
  while (engine.battle.view().readying > 0) engine.update(FRAME)
  engine.battle.setFiring(true, true)
  engine.update(FRAME)
  engine.battle.setFiring(false, false)
}

/** …and with the health that charge is certain to kill: this is about what
 * comes after the blow, and a class's own health is not. */
function killWithACharge(battle: Stepped, victims: Pig[]): void {
  for (const victim of victims) victim.health = 1
  plantAmong(battle, victims, 300)
}

/** Step to the next turn's card. */
function toNextTurn(battle: Stepped, what: string): void {
  const begun = turnsBegun(battle.heard).length
  stepUntil(battle, () => turnsBegun(battle.heard).length > begun, what)
}

test('a dummy killed by a real blow dies its whole death, and at the next turn it is back as it started', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { game, heard } = battle
  const victim = game.players[1].pigs[0]
  const started = standing(victim)
  intoTheTurn(battle)

  killWithACharge(battle, [victim])
  toNextTurn(battle, 'the turn is handed over')

  // The death is not cut short: the clip, then the bang and the boots
  // (0x46f732, lib/game/corpses.ts), and only then back up, ahead of the card.
  const dying = seen(heard, 'dying', victim.id)
  const remains = seen(heard, 'remains', victim.id)
  const stood = seen(heard, 'stoodUp', victim.id)
  expect(dying, 'the dying played').toBeGreaterThanOrEqual(0)
  expect(remains, 'after it the boots').toBeGreaterThan(dying)
  expect(stood, 'and after them the dummy').toBeGreaterThan(remains)
  expect(heard.lastIndexOf(turnsBegun(heard).at(-1)!), 'before the turn begins').toBeGreaterThan(stood)

  expect(isDead(victim)).toBe(false)
  expect(victim.gone).toBe(false)
  // exe: the class table at 0x4d02e0 (lib/game/health.ts, lib/game/kits.ts).
  expect(victim.health).toBe(maxHealthFor(victim.pigClass))
  expect(victim.carrying).toEqual(outfit(victim.pigClass))
  expect(victim.holding).toBeNull()
  expect(victim.hidden).toBe(false)
  // [play]: the facts' "its own place on the strip", not where the charge left it.
  expect(standing(victim)).toEqual(started)
  expect(heard.filter((event) => event.kind === 'missionOver')).toEqual([])
})

test('all four killed in one turn: the battle carries on, and all four are up at the next turn', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { game, heard } = battle
  const dummies = game.players[1].pigs
  const started = dummies.map(standing)
  intoTheTurn(battle)

  killWithACharge(battle, dummies)
  const killed = (): number => heard.filter((event) => event.kind === 'killed').length
  stepUntil(battle, () => killed() === dummies.length, 'the charge kills all four')
  expect(dummies.every(isDead), 'in the one turn').toBe(true)

  toNextTurn(battle, 'the turn is handed over')
  expect(heard.filter((event) => event.kind === 'missionOver')).toEqual([])
  expect(battle.engine.battle.view().ending).toBeNull()
  expect(dummies.map((dummy) => dummy.health)).toEqual(dummies.map((dummy) => maxHealthFor(dummy.pigClass)))
  expect(dummies.map(standing)).toEqual(started)
  expect(turnsBegun(heard).at(-1), "it is a dummy's turn").toMatchObject({ player: 1, computer: true })
})

test('deaths not finished when a turn starts: nobody is up yet and nothing is won, and they are up at the next one after', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { engine, game, heard } = battle
  const dummies = game.players[1].pigs
  const started = dummies.map(standing)
  intoTheTurn(battle)

  killWithACharge(battle, dummies)
  // The beat waits for every corpse (lib/game/battle/turnEnd.ts), so a turn only
  // starts on top of one through this door: all four down off their flights and
  // still riding out the quiet before the dying (DEATH_QUIET, lib/game/corpses.ts).
  stepUntil(
    battle,
    () => engine.battle.view().walkAway !== null && dummies.every(isDead) && engine.tumbles.live() === 0,
    'the charge has gone off inside the beat, and they have landed'
  )
  expect(dummies.some((dummy) => dummy.gone)).toBe(false)
  const begun = turnsBegun(heard).length
  engine.battle.cutTurnBeat()

  expect(heard.filter((event) => event.kind === 'missionOver')).toEqual([])
  expect(turnsBegun(heard).length).toBe(begun + 1)
  expect(turnsBegun(heard).at(-1), 'a side with nobody up is passed by (`Game.endTurn`)').toMatchObject({ player: 0 })
  expect(dummies.every(isDead), 'and nobody stood up over a death still playing').toBe(true)

  stepUntil(battle, () => dummies.every((dummy) => dummy.gone), 'the deaths finish')
  expect(heard.filter((event) => event.kind === 'stoodUp')).toEqual([])

  passOurTurn(battle)
  stepUntil(battle, () => game.currentPlayer === game.players[1], 'the next turn start')
  expect(dummies.map(isDead)).toEqual(dummies.map(() => false))
  expect(dummies.map(standing)).toEqual(started)
})

test('a dummy that fell poisoned does not take the bite on the turn it comes back', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { engine, game, heard } = battle
  const dummies = game.players[1].pigs
  // Each under the ten points, so the bite kills it the moment its turn comes
  // (0x4703A0, `weapons/gas.md`, lib/game/poison.ts).
  for (const dummy of dummies) {
    dummy.health = POISON_PER_TURN / 2
    engine.poison.afflict(dummy)
  }

  /** One round: our pass, and the dummy's turn played to its end. */
  const round = (): Pig => {
    passOurTurn(battle)
    stepUntil(battle, () => game.currentPlayer === game.players[1], "a dummy's turn")
    const acting = game.currentPig
    stepUntil(battle, () => game.currentPlayer === game.players[0], 'the turn comes back')
    return acting
  }
  const bites = (pig: Pig): number =>
    heard.filter((event) => event.kind === 'damaged' && event.pig === pig.id).length

  const first = round()
  expect(seen(heard, 'killed', first.id), 'the bite killed it').toBeGreaterThanOrEqual(0)
  expect(engine.poison.poisoned(first), 'and it stood up cured').toBe(false)
  expect(bites(first)).toBe(1)
  for (let turn = 1; turn < dummies.length; turn++) round()

  // Round the side and back to it, on its own turn.
  passOurTurn(battle)
  stepUntil(battle, () => game.currentPlayer === game.players[1], 'its turn again')
  expect(game.currentPig).toBe(first)
  expect(bites(first)).toBe(1)
  expect(turnsBegun(heard).at(-1), 'the card reads a full health').toMatchObject({
    player: 1,
    health: maxHealthFor(first.pigClass)
  })
})

test('a dummy only wounded keeps its wounds and stays where the blow left it', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { game, heard } = battle
  const victim = game.players[1].pigs[0]
  const started = standing(victim)
  intoTheTurn(battle)

  // Past the charge's core: a share of its fifty, on a grunt's fifty.
  plantAmong(battle, [victim], 1500)
  let health = victim.health
  let left = standing(victim)
  const begun = turnsBegun(heard).length
  stepUntil(
    battle,
    () => {
      if (turnsBegun(heard).length > begun) return true
      health = victim.health
      left = standing(victim)
      return false
    },
    'the turn is handed over'
  )

  expect(health, 'it was hurt').toBeLessThan(maxHealthFor(victim.pigClass))
  expect(isDead(victim), 'not killed').toBe(false)
  expect(left).not.toEqual(started)
  expect(victim.health, 'over the handover').toBe(health)
  expect(standing(victim)).toEqual(left)
  expect(seen(heard, 'stoodUp', victim.id)).toBe(-1)
})

test("the player's own pig killed still loses the battle", async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { engine, game, heard } = battle
  const ours = game.players[0].pigs[0]
  ours.health = POISON_PER_TURN / 2
  engine.poison.afflict(ours)

  passOurTurn(battle)
  stepUntil(battle, () => game.currentPlayer === game.players[1], "a dummy's turn")
  stepUntil(
    battle,
    () => heard.some((event) => event.kind === 'missionOver'),
    'the bite at the top of our next turn kills our pig, and the handover says so'
  )
  // exe: 0x4966A0, every arm with our side empty is "over, and not won"
  // (lib/game/endOfGame.ts).
  expect(heard).toContainEqual(expect.objectContaining({ kind: 'missionOver', won: false }))
  expect(ours.gone, 'nobody puts the player back').toBe(true)
})

/** ESTU's own squads, through the same path, with the machine on its side. */
async function shippedBattle(): Promise<Stepped> {
  const maps = path.join(GAME_DIR, 'Maps')
  const terrain = await loadTerrain(path.join(maps, 'ESTU.PMG'))
  const records = await loadMapObjects(path.join(maps, 'ESTU.POG'))
  return assemble('ESTU', terrain.blocks, terrain.textures, records.objects)
}

test('control: on a shipped map a fallen pig stays fallen over a handover', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await shippedBattle()
  const { game, heard } = battle
  const victim = game.players[1].pigs[0]
  intoTheTurn(battle)

  killWithACharge(battle, [victim])
  toNextTurn(battle, 'the turn is handed over')

  expect(seen(heard, 'remains', victim.id)).toBeGreaterThanOrEqual(0)
  expect(victim.gone).toBe(true)
  expect(isDead(victim)).toBe(true)
  expect(heard.filter((event) => event.kind === 'stoodUp')).toEqual([])
})

// A TAKEN CRATE IS BACK — `[play]`, 2026-11-02, "one round per crate per turn"
// (docs/facts/proving-ground.md). The rule alone is unit/provingCrates.spec.ts;
// this is the whole chain, the real map and the handover
// (lib/game/battle/handover.ts) answering.

const collections = (heard: BattleEvent[]): number => heard.filter((event) => event.kind === 'collected').length

const crateOf = ({ engine }: Stepped, skill: number): Pickup => {
  const crate = engine.scenery.remaining().find((one) => one.skill === skill)
  if (!crate) throw new Error(`no crate of skill ${skill} on the ground`)
  return crate
}

const onTheGround = ({ engine }: Stepped, crate: Pickup): boolean =>
  engine.scenery.remaining().some((one) => one.id === crate.id)

const goneList = ({ engine }: Stepped): number[] => engine.scenery.obstacles.changes().gone

/** Our pass and the dummy's, to the top of our own next turn. */
function roundToOurs(battle: Stepped): void {
  passOurTurn(battle)
  stepUntil(battle, () => battle.game.currentPlayer === battle.game.players[1], "a dummy's turn")
  stepUntil(battle, () => battle.game.currentPlayer === battle.game.players[0], 'the turn comes back')
  battle.game.cutTurnStart()
}

test('a taken crate gives one round, is back at the next turn, and gives another on a later one', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { engine, game, heard } = battle
  const pig = game.players[0].pigs[0]
  intoTheTurn(battle)
  const crate = crateOf(battle, SKILL.TNT)
  // The grunt's kit holds none (0x4d02e0, lib/game/kits.ts), so what is counted is
  // the crate alone.
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(0)

  engine.battle.warp(crate.x, crate.z, pig.heading)
  stepUntil(battle, () => collections(heard) === 1, 'the pig is on the crate')
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(CRATE_ROUNDS)
  expect(onTheGround(battle, crate)).toBe(false)
  expect(goneList(battle)).toContain(crate.id)

  // Staying on the spot, right through the turn clock running out: one round.
  const begun = turnsBegun(heard).length
  stepUntil(
    battle,
    () => turnsBegun(heard).length > begun,
    'the clock runs out with the pig on the spot',
    () => {
      if (turnsBegun(heard).length > begun) return
      expect(collections(heard)).toBe(1)
      expect(onTheGround(battle, crate)).toBe(false)
    }
  )
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(CRATE_ROUNDS)

  // Back at the next turn's card, whoever's turn that is. It is a dummy's, so the
  // pig standing in it takes nothing yet.
  expect(turnsBegun(heard).at(-1)).toMatchObject({ player: 1 })
  expect(onTheGround(battle, crate)).toBe(true)
  expect(goneList(battle)).not.toContain(crate.id)
  const returned = heard.findIndex((event) => event.kind === 'shown' && event.id === crate.id && event.visible)
  expect(returned, 'it is drawn again').toBeGreaterThanOrEqual(0)
  expect(heard.lastIndexOf(turnsBegun(heard).at(-1)!), 'ahead of the card').toBeGreaterThan(returned)
  expect(collections(heard)).toBe(1)

  // Our next turn, and the pig is still in it: a second round.
  stepUntil(battle, () => game.currentPlayer === game.players[0], 'the dummy passes')
  game.cutTurnStart()
  stepUntil(battle, () => collections(heard) === 2, 'our own next turn')
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(2 * CRATE_ROUNDS)

  // Walked off, it is there for the taking and nothing is handed over from afar…
  engine.battle.warp(crate.x - 600, crate.z, pig.heading)
  engine.update(FRAME)
  roundToOurs(battle)
  expect(onTheGround(battle, crate)).toBe(true)
  engine.update(FRAME)
  expect(collections(heard)).toBe(2)
  // …and a pig that comes back to it on a later turn gets another.
  engine.battle.warp(crate.x, crate.z, pig.heading)
  stepUntil(battle, () => collections(heard) === 3, 'the pig comes back to it')
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(3 * CRATE_ROUNDS)
  expect(heard.filter((event) => event.kind === 'taken')).toEqual([])
})

test('a pig already carrying fifteen skills is refused and the crate stays', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await provingBattle()
  const { engine, game, heard } = battle
  const pig = game.players[0].pigs[0]
  intoTheTurn(battle)
  const crate = crateOf(battle, SKILL.TNT)
  for (const skill of CRATE_SKILLS) {
    if (pig.carrying.length < MAX_SLOTS && skill !== SKILL.TNT) give(pig.carrying, skill, 1)
  }
  // exe: 0x465787, a sixteenth skill is refused (lib/game/inventory.ts).
  expect(pig.carrying.length).toBe(MAX_SLOTS)

  engine.battle.warp(crate.x, crate.z, pig.heading)
  const refusals = (): number => heard.filter((event) => event.kind === 'refused').length
  stepUntil(battle, () => refusals() > 0, 'the pig is on the crate')
  for (let frame = 0; frame < 15; frame++) engine.update(FRAME)

  expect(refusals(), 'said once, not once a frame').toBe(1)
  expect(collections(heard)).toBe(0)
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(0)
  expect(onTheGround(battle, crate)).toBe(true)
  expect(goneList(battle)).not.toContain(crate.id)
})

test('control: on a shipped map a taken crate does not come back over a handover', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const maps = path.join(GAME_DIR, 'Maps')
  const terrain = await loadTerrain(path.join(maps, 'GUNS.PMG'))
  const records = await loadMapObjects(path.join(maps, 'GUNS.POG'))
  const battle = await assemble('GUNS', terrain.blocks, terrain.textures, records.objects)
  const { engine, game, heard } = battle
  intoTheTurn(battle)
  const pig = game.currentPig
  // GUNS carries one TNT crate of one charge (e2e/002/crate.spec.ts).
  const crate = crateOf(battle, SKILL.TNT)
  const carried = amountOf(pig.carrying, SKILL.TNT)
  const held = engine.scenery.waiting()

  engine.battle.warp(crate.x, crate.z, pig.heading)
  stepUntil(battle, () => collections(heard) === 1, 'the pig is on the crate')
  expect(amountOf(pig.carrying, SKILL.TNT)).toBe(carried + crate.amount)
  expect(heard).toContainEqual({ kind: 'taken', id: crate.id })
  // The crate's own command ran (0x464633). The loader builds a crate's with no
  // signal (0x4a6287, lib/game/script.ts), so it places nothing: this is all of it
  // that can be seen.
  expect(engine.scenery.waiting()).toEqual(held)

  passOurTurn(battle)
  stepUntil(battle, () => game.currentPlayer === game.players[1], 'the turn is handed over')
  expect(onTheGround(battle, crate)).toBe(false)
  expect(goneList(battle)).toContain(crate.id)
  expect(heard.filter((event) => event.kind === 'shown' && event.id === crate.id)).toEqual([])
})

test('control: on a shipped map the last enemy down still wins', async () => {
  test.skip(!installed(), `no game install at ${GAME_DIR}`)
  const battle = await shippedBattle()
  const { game, heard } = battle
  intoTheTurn(battle)

  killWithACharge(battle, game.players[1].pigs)
  stepUntil(
    battle,
    () => heard.some((event) => event.kind === 'missionOver'),
    'the handover finds nobody left to knock down'
  )
  // exe: 0x4966A0, ours up and the other side empty (lib/game/endOfGame.ts).
  expect(heard).toContainEqual(expect.objectContaining({ kind: 'missionOver', won: true }))
  expect(heard.filter((event) => event.kind === 'stoodUp')).toEqual([])
})
