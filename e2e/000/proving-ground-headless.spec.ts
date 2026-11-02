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
import { loadClips, loadGameText, loadModel } from '../../src/main/assets'
import { loadProvingGround } from '../../src/main/provingGround'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
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
