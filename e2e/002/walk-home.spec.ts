// PHASE 002 — A THROWN PIG WALKS HOME, AND THE TURN'S END WAITS FOR IT.
//
// The whole chain on ESTU, the campaign's first mission, which builds nothing on its
// edge (`terrain/boundary.md`, so it is where play's line was said): the throw, the
// flight past the line, the fifty frames, the walk, and the handover that does not
// happen until the pig is home. unit/walkHome.spec.ts pins each number; this pins what
// only the battle's own frame can show.
//
// Headless on the real map data, engine-headless style: no app, no renderer.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { bodyExtent } from '../../src/lib/game/body'
import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import { ANIM } from '../../src/lib/game/locomotion'
import { buildQuery, createEngine, STEP_SECONDS } from '../../src/lib/game/engine'
import type { Engine } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import type { Emit } from '../../src/lib/game/events'
import type { Game, Pig } from '../../src/lib/game/game'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { nations } from '../../src/lib/game/teams'
import { WORLD_LIMIT } from '../../src/lib/game/terrain'
import type { TerrainQuery } from '../../src/lib/game/terrain'
import { flingVelocity } from '../../src/lib/game/tumble'
import { homeFrom } from '../../src/lib/game/walkHome'

const EAST = Math.PI / 2
const PER_FRAME = Math.round(FRAME_SECONDS / STEP_SECONDS)

interface Loaded {
  terrain: Awaited<ReturnType<typeof loadTerrain>>
  objects: ReturnType<typeof fielded>
  clips: Awaited<ReturnType<typeof loadClips>>
  teams: ReturnType<typeof nations>
  art: Awaited<ReturnType<typeof loadModel>>
  query: TerrainQuery
}

let loaded: Loaded

test.beforeAll(async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) return
  const maps = path.join(GAME_DIR, 'Maps')
  const chars = path.join(GAME_DIR, 'Chars')
  const terrain = await loadTerrain(path.join(maps, 'ESTU.PMG'))
  const read = await loadMapObjects(path.join(maps, 'ESTU.POG'))
  loaded = {
    terrain,
    objects: fielded(read.objects),
    clips: await loadClips(chars),
    teams: nations(await loadGameText(GAME_DIR, 'fetext')),
    art: await loadModel(path.join(chars, 'british.mad'), 'pcgru_me'),
    query: buildQuery(terrain.blocks, terrain.textures)
  }
})

const battle = (): { engine: Engine; game: Game; emit: Emit; acting: Pig; other: Pig } => {
  const game = musterGame({
    squads: mapSquads(loaded.objects, loaded.teams, []),
    map: 'ESTU',
    ground: loaded.query,
    bodyOf: () => bodyExtent(loaded.art.model.positions)
  })
  const bus = createBus()
  const engine = createEngine({
    world: {
      game,
      blocks: loaded.terrain.blocks,
      terrainArt: loaded.terrain.textures,
      objects: loaded.objects,
      clips: loaded.clips,
      skeleton: loaded.art.skeleton,
      map: 'ESTU',
      parachutes: false
    },
    query: loaded.query,
    seed: 7,
    onChanged: () => {},
    bus
  })
  while (engine.dropIn.running()) engine.update(STEP_SECONDS)
  game.cutTurnStart()
  const acting = game.currentPig
  const other = game.players.flatMap((player) => player.pigs).find((pig) => pig !== acting)
  if (other === undefined) throw new Error('ESTU fields one pig')
  return { engine, game, emit: bus.emit, acting, other }
}

/**
 * A row along the east edge with dry, open ground from just inside the line to well
 * past it, and the shore search finding a tile: measured off the map, not written down.
 */
const openEdge = (): number => {
  const { query } = loaded
  for (let z = -9000; z < 9000; z += 512) {
    let open = true
    for (let x = WORLD_LIMIT - 512; x < WORLD_LIMIT + 2500; x += 64) {
      if (query.isWater(x, z) || !query.walkable(x, z)) open = false
    }
    if (open && homeFrom(query, WORLD_LIMIT + 1000, z, () => true, false) !== null) return z
  }
  throw new Error('ESTU has no open row on its east edge')
}

const place = (pig: Pig, x: number, z: number): void => {
  pig.position = { x, y: loaded.query.height(x, z), z }
}

test('a pig a blast throws past the line stands, walks home, and the turn waits', async () => {
  test.skip(!existsSync(path.join(GAME_DIR, 'warhogs_.exe')), `no game install at ${GAME_DIR}`)
  const { engine, game, acting, other } = battle()
  const z = openEdge()
  place(other, WORLD_LIMIT - 100, z)
  engine.battle.warp(0, 0, 0)
  engine.battle.fling(other, flingVelocity(2400, EAST))

  // [play], 2026-08-26: "взрывом отбросило за проходимую границу".
  let frames = 0
  while (engine.tumbles.aloft(other) && frames++ < 2000) engine.update(STEP_SECONDS)
  expect(Math.abs(other.position.x), 'the throw carried it past the line').toBeGreaterThan(WORLD_LIMIT)
  const landed = { ...other.position }

  // exe: terrain/boundary.md, 0x46CE84 — fifty frames on the spot, from the landing.
  for (let step = 0; step < 50 * PER_FRAME - 2; step++) engine.update(STEP_SECONDS)
  expect(other.position.x, 'still standing where it landed').toBe(landed.x)
  expect(engine.walkHome.walking(other)).toBe(false)
  expect(engine.battle.stageStill(), 'a pig out there is part of the wait').toBe(false)

  for (let step = 0; step < 2 * PER_FRAME; step++) engine.update(STEP_SECONDS)
  expect(engine.walkHome.walking(other), 'the fifty-first frame').toBe(true)

  // The clock runs out now, with the pig still on its way: exe 0x495288, the first
  // test of the wait the turn ends through is [0x537FC0], which the walk raises.
  game.hurryTurn(0.01)
  let home = -1
  let handedOver = -1
  for (let step = 0; step < 60 * 60 && handedOver < 0; step++) {
    engine.update(STEP_SECONDS)
    if (home < 0 && !engine.walkHome.walking(other)) home = step
    if (home < 0) {
      expect(game.currentPig, 'no handover with the pig still out').toBe(acting)
      // exe: terrain/boundary.md, 0x46DEC8 the turn on the spot and 0x46C4A5 the run:
      // nothing stands it back up on the way, in the driving frame or in the beat.
      const clip = engine.anim.wornBy(other).index
      if (clip !== ANIM.TURN) expect(clip, 'it runs home').toBe(ANIM.RUN)
    }
    if (game.currentPig !== acting) handedOver = step
  }
  expect(home, 'it got home').toBeGreaterThanOrEqual(0)
  expect(handedOver, 'the turn did end').toBeGreaterThan(home)
  // exe: 0x46E0CB — out on the first step inside, far short of the tile's centre.
  expect(Math.abs(other.position.x)).toBeLessThanOrEqual(WORLD_LIMIT)
  expect(Math.abs(other.position.x)).toBeGreaterThan(WORLD_LIMIT - 512 / 2)
})

test('the acting pig, thrown by its own blast, goes past and comes home in the beat', async () => {
  test.skip(!existsSync(path.join(GAME_DIR, 'warhogs_.exe')), `no game install at ${GAME_DIR}`)
  const { engine, game, emit, acting, other } = battle()
  const z = openEdge()
  place(other, 0, 0)
  engine.battle.warp(WORLD_LIMIT - 100, z, EAST)
  // exe: terrain/boundary.md, 0x467C6B — a blow on the acting pig ends its turn at once,
  // so the air's clamp is already off (0x46D574). `damaged` then the throw is what a
  // blast sends (lib/game/blast.ts).
  emit({ kind: 'damaged', at: { ...acting.position }, amount: 1, pig: acting.id, blow: true })
  engine.battle.fling(acting, flingVelocity(2400, EAST))

  let furthest = 0
  let walked = false
  let frames = 0
  while (game.currentPig === acting && frames++ < 60 * 60) {
    engine.update(STEP_SECONDS)
    furthest = Math.max(furthest, Math.abs(acting.position.x))
    if (engine.walkHome.walking(acting)) {
      walked = true
      expect(engine.battle.view().walkAway, 'it goes home in mode 13 alone').not.toBeNull()
    }
  }
  expect(furthest).toBeGreaterThan(WORLD_LIMIT)
  expect(walked, 'it walked').toBe(true)
  expect(game.currentPig, 'the turn did end').not.toBe(acting)
  expect(Math.abs(acting.position.x)).toBeLessThanOrEqual(WORLD_LIMIT)
})

test('it runs home through the driving frame too, with nothing standing it back up', async () => {
  test.skip(!existsSync(path.join(GAME_DIR, 'warhogs_.exe')), `no game install at ${GAME_DIR}`)
  const { engine, other } = battle()
  place(other, WORLD_LIMIT + 1500, openEdge())
  const worn = new Set<number | null>()
  // Long enough to get round what ESTU leaves on this row at 8 units a frame.
  for (let step = 0; step < 400 * PER_FRAME; step++) {
    engine.update(STEP_SECONDS)
    if (engine.walkHome.walking(other)) worn.add(engine.anim.wornBy(other).index)
  }
  // exe: terrain/boundary.md, 0x46DEC8 the turn on the spot and 0x46C4A5 the run. The
  // stand is what lib/game/battle/dress.ts would put on it, once a frame.
  expect(worn).toContain(ANIM.RUN)
  expect(worn).not.toContain(ANIM.IDLE)
  expect(Math.abs(other.position.x)).toBeLessThanOrEqual(WORLD_LIMIT)
})

test('a blow on the way home stops the walk, and the wait starts again', async () => {
  test.skip(!existsSync(path.join(GAME_DIR, 'warhogs_.exe')), `no game install at ${GAME_DIR}`)
  const { engine, emit, other } = battle()
  place(other, WORLD_LIMIT + 1500, openEdge())
  for (let step = 0; step < 52 * PER_FRAME; step++) engine.update(STEP_SECONDS)
  expect(engine.walkHome.walking(other)).toBe(true)
  // exe: terrain/boundary.md, 0x467C47..0x467C50 and 0x467BF4. What every weapon sends.
  emit({ kind: 'damaged', at: { ...other.position }, amount: 1, pig: other.id, blow: true })
  expect(engine.walkHome.walking(other)).toBe(false)
  const stood = other.position.x
  for (let step = 0; step < 48 * PER_FRAME; step++) engine.update(STEP_SECONDS)
  expect(other.position.x).toBe(stood)
  for (let step = 0; step < 4 * PER_FRAME; step++) engine.update(STEP_SECONDS)
  expect(engine.walkHome.walking(other)).toBe(true)
})

test('mode 13 holds nobody: a throw in the beat carries the acting pig past', async () => {
  test.skip(!existsSync(path.join(GAME_DIR, 'warhogs_.exe')), `no game install at ${GAME_DIR}`)
  const { engine, game, acting } = battle()
  engine.battle.warp(WORLD_LIMIT - 100, openEdge(), EAST)
  game.hurryTurn(0.01)
  for (let step = 0; step < 4; step++) engine.update(STEP_SECONDS)
  expect(engine.battle.view().walkAway, 'the beat is running').not.toBeNull()
  // No blow here: a body knocking it over sends no damage (0x477842).
  engine.battle.fling(acting, flingVelocity(2400, EAST))
  let furthest = 0
  for (let step = 0; step < 300; step++) {
    engine.update(STEP_SECONDS)
    furthest = Math.max(furthest, Math.abs(acting.position.x))
  }
  // exe: terrain/boundary.md, 0x46D574.
  expect(furthest).toBeGreaterThan(WORLD_LIMIT)
})

test('the acting pig cannot walk or jump past the line', async () => {
  test.skip(!existsSync(path.join(GAME_DIR, 'warhogs_.exe')), `no game install at ${GAME_DIR}`)
  const { engine, acting } = battle()
  const z = openEdge()
  engine.battle.warp(WORLD_LIMIT - 300, z, EAST)
  engine.battle.setIntent(1, 0)
  let furthest = 0
  for (let step = 0; step < 300; step++) {
    if (step % 30 === 0) engine.battle.jump()
    engine.update(STEP_SECONDS)
    furthest = Math.max(furthest, Math.abs(acting.position.x))
  }
  // exe: terrain/boundary.md, 0x478D32 on foot and 0x46D5FB in the air.
  expect(furthest).toBeGreaterThan(WORLD_LIMIT - 100)
  expect(furthest).toBeLessThanOrEqual(WORLD_LIMIT)
})
