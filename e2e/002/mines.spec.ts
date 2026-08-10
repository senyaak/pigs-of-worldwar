// PHASE 002 — MINEFIELDS, and the charges a pig PLANTS.
//
// Play: "мины тут на карте должны быть — а тнт уже берётся с ящика но ничего не
// делает." Both were in the shipped data and neither was read: a minefield is bit
// 6 of a tile's type byte (99 tiles of it on CAMP) and TNT is projectile row 53,
// which had no `Lob` row to be thrown with (lib/game/mines.ts, grenade.ts).
//
// Pure but for the last two, which drive the APP — a minefield is the one thing
// in this engine with nothing to draw and no object behind it, so "is it really
// under the ground the pig walks on" cannot be asked of the rules alone.

import { expect, test } from '../app'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import { hud, warp } from '../controller'
import { startGame } from '../menu'
import { parsePmg, TILE_MINE, TILE_STEP } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import {
  MINE_BLAST,
  MINE_DAMAGE,
  MINE_FUSE_FRAMES,
  createMines
} from '../../src/lib/game/mines'
import { FUSE_JITTER, fuseSeconds, isPlanted, lobOf } from '../../src/lib/game/grenade'
import { fromExeFrames } from '../../src/lib/game/ballistics'
import { layerFires, layerSights, weaponLayer } from '../../src/lib/game/controls'
import { PLANTED_SECONDS, endsTurn, hurryFor } from '../../src/lib/game/spend'
import { DAMAGE_UNIT } from '../../src/lib/game/projectile'
import { Game } from '../../src/lib/game/game'
import { NO_BODY } from '../../src/lib/game/body'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'

const TNT = 37
const MINE = 35
const GRENADE = 19

const campQuery = (): TerrainQuery =>
  new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))

/** Every mine-flagged tile's centre, straight out of the shipped map. */
function minefield(): { x: number; z: number }[] {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const out: { x: number; z: number }[] = []
  for (const block of blocks) {
    block.tiles.forEach((tile, i) => {
      if ((tile.type & TILE_MINE) === 0) return
      out.push({
        x: block.x + (i % 4) * TILE_STEP + TILE_STEP / 2,
        z: block.z + Math.floor(i / 4) * TILE_STEP + TILE_STEP / 2
      })
    })
  }
  return out
}

test('CAMP has a minefield, and the query finds it tile by tile', () => {
  const query = campQuery()
  const field = minefield()
  // 99 tiles, which is what the tutorial's "FOLLOW THE PATH THROUGH THE
  // MINEFIELD" is about (lib/game/tutorial.ts).
  expect(field.length).toBe(99)
  for (const at of field) {
    expect(query.hasMine(at.x, at.z), `a mine at ${at.x},${at.z}`).toBe(true)
    // …and it is the TILE that carries it, so the centre the blast goes off at
    // comes back as the tile's own middle.
    expect(query.tileCentre(at.x, at.z)).toMatchObject({ x: at.x, z: at.z })
  }
  // A tile 512 clear of every one of them is clean ground — the field is patchy,
  // so this is the map saying the bit means something rather than being set
  // everywhere.
  const clean = field.some(
    (at) => !query.hasMine(at.x + 4 * TILE_STEP, at.z) || !query.hasMine(at.x, at.z + 4 * TILE_STEP)
  )
  expect(clean, 'the field has an edge').toBe(true)
})

/** One pig on the training ground, standing on the first mine there is. */
const fielded = (
  at: { x: number; z: number }
): { game: Game; heard: BattleEvent[]; mines: ReturnType<typeof createMines> } => {
  const query = campQuery()
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby'] }],
    spawns: [{ x: at.x, z: at.z, y: query.height(at.x, at.z), body: NO_BODY }]
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const mines = createMines(
    {
      pigs: () => game.players.flatMap((player) => player.pigs),
      targets: [],
      present: () => true,
      training: true,
      query,
      random: () => 0
    },
    bus.emit
  )
  return { game, heard, mines }
}

test('a mine is ONE-SHOT: trodden on it counts down, and the tile is spent', () => {
  const at = minefield()[0]
  const { mines } = fielded(at)

  expect(mines.buried(at.x, at.z), 'the map put one here').toBe(true)
  expect(mines.tread(at.x, at.z), 'and a foot found it').toBe(true)
  expect(mines.live()).toBe(1)
  // Twelve frames and no jitter with this roll — four tenths of a second, which
  // is the click before the bang and not a delay before anything is decided.
  expect(mines.at()[0].fuse).toBeCloseTo(fromExeFrames(MINE_FUSE_FRAMES), 5)
  expect(fromExeFrames(MINE_FUSE_FRAMES + FUSE_JITTER)).toBeLessThan(0.7)

  // The same tile cannot be trodden on twice — the exe clears the bit in the
  // breath it spawns the blast (`Map::SetMine(col, row, 0, 0)`).
  expect(mines.tread(at.x, at.z), 'twice').toBe(false)
  expect(mines.buried(at.x, at.z)).toBe(false)
  expect(mines.live()).toBe(1)
})

test('…and then it goes off where the TILE is, and takes twenty off a grunt', () => {
  const at = minefield()[0]
  const { game, heard, mines } = fielded(at)
  const pig = game.currentPig
  expect(pig.health).toBe(50)

  mines.tread(pig.position.x, pig.position.z)
  // Nothing has happened yet: the fuse is the whole point of the click.
  mines.update(0.1)
  expect(heard.filter((one) => one.kind === 'blasted')).toHaveLength(0)
  expect(pig.health).toBe(50)

  mines.update(1)
  expect(mines.live()).toBe(0)
  const blast = heard.filter((one) => one.kind === 'blasted')
  expect(blast, 'it went off').toHaveLength(1)
  // At the TILE's centre — the exe builds the position out of the tile indices
  // and never looks at the foot that found it.
  expect(blast[0]).toMatchObject({ at: { x: at.x, z: at.z } })
  // 2560 in 128ths is twenty points, and a pig standing on the thing is inside
  // the 512-unit core, so it takes all of them.
  expect(pig.health).toBe(50 - MINE_DAMAGE / DAMAGE_UNIT)
  // …and the blast reaches a tile and a half: 1024 less the 512 the falloff is
  // biased by, which is a quarter of the damage still landing at the rim.
  expect(MINE_BLAST).toBe(1024)
})

test('TNT is PLANTED: no gauge, no aim view, and a fuse longer than the run', () => {
  const row = lobOf(TNT)
  expect(row, 'TNT has a row to be thrown with').not.toBeNull()
  // Speed 50 against a grenade's 300 — and with no gauge the charge is 1 in
  // 4096, so it goes down at the pig's own feet rather than anywhere.
  expect(row!.speed).toBe(50)
  expect(row!.damage / DAMAGE_UNIT, 'fifty points kills a grunt outright').toBe(50)
  expect(row!.blast, "twice a grenade's reach").toBe(2048)

  // Fifty frames of arming under a 125-frame fuse: near enough six seconds,
  // against the FOUR the turn gives the pig to get clear.
  const fuse = fuseSeconds(row!, () => 0)
  expect(fuse).toBeGreaterThan(5.5)
  expect(fuse).toBeLessThan(6.2)
  expect(fuse).toBeGreaterThan(PLANTED_SECONDS)
  // …and a grenade's is unchanged by the row carrying its own arming count now.
  expect(fuseSeconds(lobOf(GRENADE)!, () => 0)).toBeCloseTo(fromExeFrames(153), 5)

  // Its own control layer: the fire key works, the aim view does not exist.
  for (const skill of [MINE, 36, TNT, 38]) {
    expect(isPlanted(skill), `skill ${skill} is planted`).toBe(true)
    expect(weaponLayer(skill)).toBe('charge')
  }
  expect(layerFires('charge')).toBe(true)
  expect(layerSights('charge'), 'nothing to aim').toBe(false)
  expect(weaponLayer(GRENADE), 'a grenade still lobs').toBe('lob')
})

test('planting one keeps the turn and cuts the clock to four seconds', () => {
  // The two halves of "plant it and run", and they are the same record's two
  // fields: no WALK AWAY flag, and a wait of 400 hundredths (lib/game/spend.ts).
  expect(endsTurn(TNT)).toBe(false)
  expect(hurryFor(TNT)).toBe(PLANTED_SECONDS)
  expect(hurryFor(38)).toBe(PLANTED_SECONDS)
  // A MINE has neither: its own arm at 0x4942e6 gives it the four seconds only
  // when the turn is nearly over, and that counter is undecoded.
  expect(hurryFor(MINE)).toBe(0)
  // …and everything that is fired at something is unaffected.
  expect(hurryFor(GRENADE)).toBe(0)
  expect(endsTurn(GRENADE)).toBe(true)

  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby'] }],
    spawns: [{ x: 0, z: 0 }],
    turnSeconds: 99
  })
  game.beginTurn()
  game.tick(1)
  expect(game.timeLeft).toBe(98)
  // A SET, not a bonus: ninety-eight seconds becomes four.
  game.hurryTurn(PLANTED_SECONDS)
  expect(game.timeLeft).toBe(PLANTED_SECONDS)
  expect(game.tick(PLANTED_SECONDS), 'and then the turn ends the ordinary way').toBe(true)
})

// ——— through the app, on the real training ground ———

type Page = import('@playwright/test').Page

const sounds = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as { pow: { debug: { sounds(): string[] } } }).pow.debug.sounds()
  )

const counting = (page: Page): Promise<{ x: number; y: number; z: number; fuse: number }[]> =>
  page.evaluate(() =>
    (
      window as unknown as {
        pow: { debug: { mines(): { x: number; y: number; z: number; fuse: number }[] } }
      }
    ).pow.debug.mines()
  )

const thrown = (page: Page): Promise<{ fuse: number }[]> =>
  page.evaluate(() =>
    (window as unknown as { pow: { debug: { grenades(): { fuse: number }[] } } }).pow.debug.grenades()
  )

const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

/** A mine on CAMP a pig can actually be standing on: dry, and not inside a
 * wall — the flag says nothing about either. */
function walkableMine(): { x: number; z: number } {
  const query = campQuery()
  const at = minefield().find(
    (one) => query.walkable(one.x, one.z) && !query.isWater(one.x, one.z)
  )
  if (!at) throw new Error('CAMP has no minefield tile a pig could stand on')
  return at
}

test('a pig that walks onto a MINE hears it and then loses twenty points', async ({ app }) => {
  const { page } = app
  await startGame(page)
  const before = await hud(page)
  expect(before.health).toBe(50)

  // Onto the field. A warp is a step as far as the ground is concerned: the
  // trigger is asked once a frame of every pig with its feet down
  // (lib/game/battle.ts).
  const at = walkableMine()
  const quiet = (await sounds(page)).length
  await warp(page, at.x, at.z, 0)

  // The CLICK first, and a mine counting down — nothing is drawn for either, so
  // this is the whole of what a player gets before the bang.
  await expect.poll(async () => (await counting(page)).length, { timeout: 4000 }).toBe(1)
  expect((await sounds(page)).slice(quiet), 'the trigger was heard').toContain('L_MINETR')

  // …and then it goes off: the same E_1 a grenade plays, and twenty points off a
  // grunt standing on the thing.
  await expect.poll(async () => (await counting(page)).length, { timeout: 4000 }).toBe(0)
  expect((await sounds(page)).slice(quiet)).toContain('E_1')
  await expect.poll(async () => (await hud(page)).health, { timeout: 4000 }).toBe(30)

  // The tile is spent, so standing on it is now safe — the pig is still there.
  await page.waitForTimeout(600)
  expect((await counting(page)).length, 'it did not go off twice').toBe(0)

  expect(app.errors()).toEqual([])
})

test('TNT goes down at the feet, keeps the turn, and leaves four seconds', async ({ app }) => {
  const { page } = app
  await startGame(page)
  const before = await hud(page)
  expect(before.seconds, 'CAMP gives 99 seconds').toBeGreaterThan(50)

  expect(await give(page, TNT)).toBe(true)
  await page.waitForTimeout(800) // the getting-it-out clip
  const quiet = (await sounds(page)).length

  // One press. There is no gauge to hold and no aim view to enter — the record's
  // +0x14 is nil, so the press fires at a charge of one and `speed * charge >> 12`
  // is nothing at all (lib/game/grenade.ts).
  await page.evaluate(() => {
    const c = (
      window as unknown as { pow: { controller: { press(a: string): void; release(a: string): void } } }
    ).pow.controller
    c.press('fire')
    c.release('fire')
  })

  // It is on the ground, and the pig still has the controls: the turn was NOT
  // spent, it was HURRIED (lib/game/spend.ts).
  await expect.poll(async () => (await thrown(page)).length, { timeout: 4000 }).toBe(1)
  await expect.poll(async () => (await hud(page)).seconds, { timeout: 4000 }).toBeLessThanOrEqual(
    PLANTED_SECONDS
  )
  const planted = await hud(page)
  expect(planted.turn, 'the same turn').toBe(before.turn)
  expect(planted.starting, 'and it is still being played').toBe(false)

  // Its fuse outlasts the run: the clock goes first, and the beat the turn ends
  // through waits for the charge rather than handing over on top of it
  // (lib/game/walkAway.ts).
  await expect.poll(async () => (await thrown(page)).length, { timeout: 15000 }).toBe(0)
  expect((await sounds(page)).slice(quiet), 'it went off').toContain('E_1')

  expect(app.errors()).toEqual([])
})
