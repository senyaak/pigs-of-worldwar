// PHASE 002 (headless) — THE HAND-DETONATOR REACHES THE BOMBLETS.
//
// Play, the day after the cluster was built: "кластерная граната должна при
// разлёте тоже позволять взрывать когда захочешь — а щас разлётные сами только
// могут взорваться по времени." The engine was innocent — `detonateNow` cuts a
// bomblet's fuse like any other lob's, and unit/cluster.spec.ts pins that. What
// the press could not do was ARRIVE: the canister's own burst opens the
// aftermath beat, the five are born inside it, `settling()` counts them so the
// beat cannot end while they fly, and the beat's first act was
// `attack.swallow()`. Six seconds of dead fire key, and no pure spec could see
// it, because the hole is in `battle.ts` between the input and the seam.
//
// So this drives the FIRE BUTTON, and does it headless: `battle.setFiring` is
// the same call the renderer's input layer makes (input/battleInput.ts), and
// stepping the engine by hand takes the wall clock out of it. The app-level
// version of this was written first and thrown away — it has to catch the
// window between the canister bursting and a six-second fuse, with a turn
// handover inside it, and a spec that races the thing it is testing is worse
// than none.
//
// Engine-headless style, on the real map data: no app, no renderer.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine, STEP_SECONDS } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import { bodyExtent } from '../../src/lib/game/body'
import { give } from '../../src/lib/game/inventory'

/** Skill 20 — the CLUSTER GRENADE, the canister that scatters five
 * (lib/game/grenade.ts, `Lob.cluster`). */
const CLUSTER = 20

test('a scattered cluster still answers the fire key', async () => {
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
    bus: createBus()
  })
  while (engine.dropIn.running()) engine.update(STEP_SECONDS)
  game.cutTurnStart()

  const step = (frames: number): void => {
    for (let f = 0; f < frames; f++) engine.update(STEP_SECONDS)
  }
  /** One press of FIRE and the finger off again — `firing` is the hold and
   * `fired` the one-shot, which is the split the input layer polls. */
  const tapFire = (): void => {
    engine.battle.setFiring(true, true)
    engine.update(STEP_SECONDS)
    engine.battle.setFiring(false, false)
    step(3)
  }

  const pig = game.currentPig
  give(pig.carrying, CLUSTER, 99)
  pig.holding = CLUSTER
  // The same hillside `002/knockback.spec.ts` throws down, and far enough that
  // nothing comes back on the thrower's own head.
  engine.battle.warp(6400, -8600, 0)
  step(200)

  // Held to the top, which throws by itself (lib/game/gauge.ts).
  engine.battle.setFiring(true, true)
  for (let f = 0; f < 200; f++) {
    engine.update(STEP_SECONDS)
    engine.battle.setFiring(true, false)
  }
  engine.battle.setFiring(false, false)
  step(5)
  expect(engine.grenades.live(), 'the canister left the hand').toBe(1)
  expect(engine.battle.situation().armed, 'and the fire key is a detonator now').toBe(true)

  // A second press cuts its fuse where it flies: its own blast, and FIVE
  // bomblets in the air (lib/game/lobs.ts, the `cluster` arm).
  tapFire()
  expect(engine.grenades.live(), 'the canister scattered').toBe(5)
  expect(engine.battle.situation().armed, 'the five keep the key armed').toBe(true)

  // …and a THIRD reaches them, which is the whole of this spec: it lands
  // INSIDE the beat the canister's own burst opened.
  tapFire()
  expect(engine.grenades.live(), 'the five went off by hand, not by fuse').toBe(0)
})
