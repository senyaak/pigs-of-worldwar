// PHASE 002 — A BLAST MOVES ITS VICTIM. The whole real chain, end to end:
// a grenade thrown by the acting pig, the parabola, the bounces and the
// downhill roll, the fuse, the burst, the share, the fling and the flight —
// and at the end of it the victim's BODY IS SOMEWHERE ELSE.
//
// Play ordered this spec after two reports the pure specs could not catch
// ("он на месте катился... яж сказал сделай тесты. на движение после
// взрыва"): unit/blast.spec.ts pins the launch GEOMETRY and unit/fling.spec.ts
// the flight, but nothing asserted that a real grenade against a real pig on
// a real hillside ends with displacement. This does, on ESTU's own hill —
// the slope of the first mission, where both reports came from.
//
// Headless on the real map data, engine-headless style: no app, no renderer.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine, STEP_SECONDS } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'
import { bodyExtent } from '../../src/lib/game/body'
import { give } from '../../src/lib/game/inventory'

/** Skill 19 — the plain grenade (lib/game/grenade.ts). */
const GRENADE = 19

test('a grenade bursting at a hillside pig SENDS IT FLYING — displacement, not just damage', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  const maps = path.join(GAME_DIR, 'Maps')
  const chars = path.join(GAME_DIR, 'Chars')
  const terrain = await loadTerrain(path.join(maps, 'ESTU.PMG'))
  const loaded = await loadMapObjects(path.join(maps, 'ESTU.POG'))
  const clips = await loadClips(chars)
  const teams = nations(await loadGameText(GAME_DIR, 'fetext'))
  const art = await loadModel(path.join(chars, 'british.mad'), 'pcgru_me')
  const objects = fielded(loaded.objects)
  const query = buildQuery(terrain.blocks, terrain.textures)
  const game = musterGame({
    squads: mapSquads(objects, teams, []),
    map: 'ESTU',
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })
  const bus = createBus()
  const heard: BattleEvent[] = []
  bus.on((event) => heard.push(event))
  const engine = createEngine({
    world: {
      game,
      blocks: terrain.blocks,
      terrainArt: terrain.textures,
      objects,
      clips,
      skeleton: art.skeleton,
      map: 'ESTU',
      parachutes: false
    },
    query,
    seed: 7,
    onChanged: () => {},
    bus
  })
  while (engine.dropIn.running()) engine.update(STEP_SECONDS)
  game.cutTurnStart()

  const thrower = game.currentPig
  const victim = game.players.flatMap((player) => player.pigs).find((pig) => pig !== thrower)!
  give(thrower.carrying, GRENADE, 99)
  thrower.holding = GRENADE
  engine.battle.warp(6400, -8600, 0)
  for (let frame = 0; frame < 60; frame++) engine.update(STEP_SECONDS)

  // The hillside FUNNELS a thrown grenade to the dip at about (7909, -8090)
  // — measured, and exactly the shape of play's report: the grenade comes to
  // rest AT the pig standing there. The victim is planted at growing uphill
  // offsets from that spot; the throws are identical, so which rounds damage
  // is the seeded stream's business — what is pinned is that EVERY round
  // that hurt the victim also MOVED it.
  const spots = [0, 50, 100, 150, 250]
  let landed = 0
  for (const offset of spots) {
    const vx = 7909 - 0.98 * offset
    const vz = -8090 - 0.2 * offset
    victim.position = { x: vx, y: query.height(vx, vz), z: vz }
    victim.health = 100
    const before = { x: vx, z: vz }
    heard.length = 0
    expect(engine.grenades.throwOne(thrower, 0, 0.5), 'the throw left the hand').toBe(true)
    let frames = 0
    while ((engine.grenades.live() > 0 || engine.tumbles.live() > 0) && frames < 1200) {
      engine.update(STEP_SECONDS)
      frames++
    }
    const hurt = heard.some(
      (event) => event.kind === 'damaged' && (event as { pig?: number }).pig === victim.id
    )
    if (!hurt) continue
    landed++
    const moved = Math.hypot(victim.position.x - before.x, victim.position.z - before.z)
    // The flight alone is worth over a thousand at a grenade's core damage;
    // 400 is the floor that still catches every way this has failed — the
    // settle discarding the horizontal, a near-vertical launch, a blocked
    // flight — while leaving room for rim hits.
    expect(moved, `a burst that hurt the pig at offset ${offset} moved it`).toBeGreaterThan(400)
  }
  // The sweep must actually test something: with seed 7 three of the five
  // rounds burst within reach, and a stream change that sends every grenade
  // astray should fail loudly rather than pass an empty loop.
  expect(landed, 'enough bursts reached the victim to prove anything').toBeGreaterThanOrEqual(2)
})
