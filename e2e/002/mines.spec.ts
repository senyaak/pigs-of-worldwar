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
import { debugState, hold, hud, warp } from '../controller'
import { startGame } from '../menu'
import { parsePmg, TILE_MINE, TILE_STEP } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import {
  DETECT_TILES,
  MINE_BLAST,
  MINE_DAMAGE,
  MINE_FUSE_FRAMES,
  createMines,
  detectsMines
} from '../../src/lib/game/mines'
import { FUSE_JITTER, fuseSeconds, isPlanted, lobOf } from '../../src/lib/game/grenade'
import { EXE_FRAME_SECONDS, fromExeFrames } from '../../src/lib/game/ballistics'
import { layerFires, layerSights, weaponLayer } from '../../src/lib/game/controls'
import { PLANTED_SECONDS, endsTurn, hurryFor } from '../../src/lib/game/spend'
import { DAMAGE_UNIT } from '../../src/lib/game/projectile'
import { PIG_RADIUS } from '../../src/lib/game/obstacles'
import { LOB_EFFECT_ID, MINE_EFFECT_ID } from '../../src/lib/game/blast'
import { BLAST_EFFECT, MINE_EFFECT } from '../../src/lib/game/effects'
import { createEffectField } from '../../src/lib/game/effectField'
import { SPAWNED_MODELS, TRIPPED_MINE_MODEL } from '../../src/lib/game/ammo'
import { WEAPON_MODEL } from '../../src/lib/game/weapons'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseModel } from '../../src/lib/formats/model'
import { Game } from '../../src/lib/game/game'
import { NO_BODY } from '../../src/lib/game/body'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'

const TNT = 37
/** Clip 77 of `Chars/mcap.mad` — the record's attack clip for all four planted
 * skills, and the archive's own "Lay Mine" (lib/game/grenade.ts). */
const LAY_CLIP = 77
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
  // Twelve frames and no jitter with this roll. **The bound is in FRAMES**, and
  // the exe is where it comes from: rows 40 and 41 of 0x4c2030 carry arming 0
  // and fuse 12 (re-read 2026-08-29, both rows, `weapons/mines.md`). This line
  // used to say "under 0.7 s" and went red the day `EXE_FRAME_SECONDS` became
  // 1/25 and made nineteen frames 0.76 — it was measuring the clock knob, not
  // the mine. Nineteen frames is under a second at any rate this repo has run,
  // and that is the whole claim: the click before the bang, not a delay before
  // anything is decided.
  expect(mines.at()[0].fuse).toBeCloseTo(fromExeFrames(MINE_FUSE_FRAMES), 5)
  expect(MINE_FUSE_FRAMES + FUSE_JITTER, 'the row reads fuse 12, jittered by rand & 7').toBe(19)
  expect(fromExeFrames(MINE_FUSE_FRAMES + FUSE_JITTER)).toBeLessThan(1)

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
  // …and it does NOT look like a grenade. The mine's destructor names effect
  // 0x4c, and the announcement carries it so the picture can be its own.
  expect(blast[0]).toMatchObject({ effect: MINE_EFFECT_ID })
  expect(MINE_EFFECT_ID).not.toBe(LOB_EFFECT_ID)
})

test('a MINE goes off on parameter row 14, and a grenade on row 0', () => {
  // The two mine flavours differ in one field, their effect id — 0x4c against
  // 0x55 — and both ids reach the same arm (`byte [0x489680 + id − 1]` gives
  // slot 51 and slot 56, and both slots hold 0x488fb8, which is
  // `push 0xE; call 0x48ccc0`). So a mine is ROW 14 and never row 0.
  expect(MINE_EFFECT.kind).toBe(14)
  expect(BLAST_EFFECT.kind).toBe(0)
  expect(MINE_EFFECT.id).toBe(0x4c)

  // Row 14 is a different picture in every part of it, and all of it on frame 1
  // where a grenade's is staged over three.
  expect(MINE_EFFECT.clouds, 'one fireball, not two').toHaveLength(1)
  expect(BLAST_EFFECT.clouds).toHaveLength(2)
  expect(MINE_EFFECT.clouds![0]).toMatchObject({
    at: 1,
    count: 70,
    colour: [5, 2, 0],
    up: 3,
    out: 2,
    gravity: 30
  })
  // A grenade throws no ring at all; a mine throws one, and it SLOWS — the only
  // other row in the game with a negative drift is the sword's.
  expect(BLAST_EFFECT.rings).toHaveLength(0)
  expect(MINE_EFFECT.rings).toHaveLength(1)
  expect(MINE_EFFECT.rings[0]).toMatchObject({ at: 1, growth: 95, drift: -2, step: 8 })
  expect(MINE_EFFECT.rings[0].colour).toEqual([13, 10, 4])
  // …and its smoke goes STRAIGHT UP, which is what a buried charge does: out 0
  // against a grenade's 10, and eighteen puffs on frame 1 rather than fourteen
  // over frames 2 and 3.
  const puffs = MINE_EFFECT.bursts!
  expect(puffs).toHaveLength(2)
  expect(puffs.every((one) => one.at === 1)).toBe(true)
  expect(puffs.every((one) => one.out === 0 && one.up === 60)).toBe(true)
  expect(puffs.reduce((n, one) => n + one.count, 0)).toBe(18)
  expect(BLAST_EFFECT.bursts!.every((one) => one.out === 10)).toBe(true)

  // …and the field hands out the right one for each id.
  const field = createEffectField(() => 0)
  field.blast({ x: 0, y: 0, z: 0 }, MINE_EFFECT_ID)
  field.update(EXE_FRAME_SECONDS)
  expect(field.rings(), 'the mine threw no ring').toBe(1)
  field.clear()
  field.blast({ x: 0, y: 0, z: 0 }, LOB_EFFECT_ID)
  field.update(EXE_FRAME_SECONDS)
  expect(field.rings(), 'a grenade threw a ring').toBe(0)
})

test("a TRODDEN mine wears the ENGINE's own model, out of the MAP's archive", () => {
  // Name table 0x4d9680, `START_OF_AMMO` at 387, so a projectile row's id indexes
  // it: 428 and 429 — the two mines a foot sets off — are both `WE_APMIN`. Which
  // is NOT the `WE_MINE` a pig carries, and is not in `Chars/WEAPONS.MAD` at all.
  expect(TRIPPED_MINE_MODEL).toBe('WE_APMIN')
  expect(WEAPON_MODEL[20]).toBe('WE_MINE')
  expect(SPAWNED_MODELS, 'the map loader has to be told').toContain(TRIPPED_MINE_MODEL)

  const weapons = readFileSync(path.join(GAME_DIR, 'Chars', 'WEAPONS.MAD'))
  const inHand = parseArchive(weapons).entries.map((one) => one.name.toUpperCase())
  expect(inHand, 'the carried mine is in the weapon archive').toContain('WE_MINE.VTX')
  expect(inHand, "…and the ground one is not — that is the whole catch").not.toContain(
    'WE_APMIN.VTX'
  )

  // It IS in every map's own archive, beside the trees.
  const camp = readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.MAD'))
  const { entries } = parseArchive(camp)
  const part = (ext: string): Uint8Array => {
    const one = entries.find((e) => e.name.toUpperCase() === `WE_APMIN.${ext}`)!
    expect(one, `CAMP.MAD has WE_APMIN.${ext}`).toBeTruthy()
    return camp.subarray(one.offset, one.offset + one.size)
  }
  const model = parseModel(part('VTX'), part('NO2'), part('FAC'))
  expect(model.sourceQuads).toBe(22)
  // …and it is a BIGGER object than the carried one, which is why it gets a lift
  // of its own: y −46..44 about its origin.
  let low = -1e9
  let high = 1e9
  for (let i = 1; i < model.positions.length; i += 3) {
    low = Math.max(low, model.positions[i])
    high = Math.min(high, model.positions[i])
  }
  expect(low).toBe(44)
  expect(high).toBe(-46)
})

test('TNT is PLANTED: no gauge, no aim view, and a fuse longer than the run', () => {
  const row = lobOf(TNT)
  expect(row, 'TNT has a row to be thrown with').not.toBeNull()
  // Speed 50 against a grenade's 300 — and with no gauge the charge is 1 in
  // 4096, so it goes down at the pig's own feet rather than anywhere.
  expect(row!.speed).toBe(50)
  expect(row!.damage / DAMAGE_UNIT, 'fifty points kills a grunt outright').toBe(50)
  expect(row!.blast, "twice a grenade's reach").toBe(2048)

  // Fifty frames of arming under a 125-frame fuse — row 53 of 0x4c2030, +0x14
  // and +0x18, read again 2026-08-29. **The assertion is on the FRAMES**, for
  // the same reason the mine's above is: this line said 5.5..6.2 seconds and
  // went red the day the clock became 1/25 and made the same 175 frames seven,
  // which measured the knob and nothing else. What it is really about is the
  // comparison underneath — the charge outlasting the four seconds the turn
  // leaves the pig to get clear — and both sides of that ride the same clock.
  expect(row!.arming + row!.fuse, 'fifty of arming under a 125-frame fuse').toBe(175)
  const fuse = fuseSeconds(row!, () => 0)
  expect(fuse).toBeCloseTo(fromExeFrames(175), 5)
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

test('a mine is HIDDEN, and only a nearby pig of the right class sees it', () => {
  const at = minefield()[0]
  const { game, mines } = fielded(at)
  const pig = game.currentPig
  // The pig standing ON the field is a GRUNT, and a grunt sees nothing at all.
  expect(pig.pigClass).toBe(0)
  expect(detectsMines(0)).toBe(false)
  expect(mines.revealed([pig]), 'a grunt is standing on it and cannot see it').toEqual([])
  // Nor does anybody at all, when nobody is looking.
  expect(mines.revealed([])).toEqual([])

  // The exe's own reveal gate (todo B10, closed 2026-08-26): the COMMANDO,
  // the whole engineer family, and the HERO — `[pig+0x19C]` in {4,5,6,7,0xE}.
  for (const pigClass of [4, 5, 6, 7, 14]) expect(detectsMines(pigClass)).toBe(true)
  for (const pigClass of [0, 1, 2, 3, 8, 9, 10, 11]) {
    expect(detectsMines(pigClass), `class ${pigClass}`).toBe(false)
  }

  const engineer = { ...pig, pigClass: 5 }
  const seen = mines.revealed([engineer])
  expect(seen.length, 'standing on the field it sees its own tile and its neighbours')
    .toBeGreaterThan(0)
  expect(seen.some((one) => one.x === at.x && one.z === at.z), 'its own tile among them').toBe(true)
  // …and nothing outside the exe's own 3×3 of tiles round the detector's:
  // one tile is 512, so a revealed centre is within 1.5 tiles on each axis.
  for (const one of seen) {
    expect(Math.abs(one.x - at.x)).toBeLessThanOrEqual(512 * (DETECT_TILES + 0.5))
    expect(Math.abs(one.z - at.z)).toBeLessThanOrEqual(512 * (DETECT_TILES + 0.5))
  }

  // Walk it well away and the field goes dark again.
  const away = { ...engineer, position: { x: at.x + 8000, y: 0, z: at.z + 8000 } }
  expect(mines.revealed([away])).toEqual([])

  // A mine already SPENT is not revealed either — there is nothing there.
  mines.tread(at.x, at.z)
  expect(mines.revealed([engineer]).some((one) => one.x === at.x && one.z === at.z)).toBe(false)
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
  game.cutTurnStart()
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

const thrown = (page: Page): Promise<{ x: number; y: number; z: number; fuse: number }[]> =>
  page.evaluate(() =>
    (
      window as unknown as {
        pow: { debug: { grenades(): { x: number; y: number; z: number; fuse: number }[] } }
      }
    ).pow.debug.grenades()
  )

const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

const holdingOf = (page: Page): Promise<number | null> =>
  page.evaluate(
    () => (window as unknown as { pow: { debug: { holding(): number | null } } }).pow.debug.holding()
  )

/** How the planted charges are DRAWN — the fuse's direction and the ground under
 * each one (three/grenades.ts). */
const standing = (
  page: Page
): Promise<{ fuse: { x: number; y: number; z: number }; base: number }[]> =>
  page.evaluate(() =>
    (
      window as unknown as {
        pow: {
          debug: { charges(): { fuse: { x: number; y: number; z: number }; base: number }[] }
        }
      }
    ).pow.debug.charges()
  )

/** How many planted charges have a spark on the fuse (three/fuse.ts). */
const burning = (page: Page): Promise<number> =>
  page.evaluate(() =>
    (window as unknown as { pow: { debug: { burning(): number } } }).pow.debug.burning()
  )

/** How many mine markers the scene is drawing for the side whose turn it is. */
const markers = (page: Page): Promise<number> =>
  page.evaluate(() =>
    (window as unknown as { pow: { debug: { mineMarkers(): number } } }).pow.debug.mineMarkers()
  )

/** What the acting pig is WEARING, out of the engine's own sampler. */
const wearing = (page: Page): Promise<number | null> =>
  page.evaluate(
    () =>
      (window as unknown as { pow: { debug: { pose(): { clip: number | null } } } }).pow.debug.pose()
        .clip
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

/** How many TRODDEN mines the scene is drawing, wearing `WE_APMIN`
 * (three/mineArt.ts). */
const trippedShown = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (window as unknown as { pow: { debug: { minesTripped(): number } } }).pow.debug.minesTripped()
  )

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

  // The CLICK first, and a mine counting down.
  await expect.poll(async () => (await counting(page)).length, { timeout: 4000 }).toBe(1)
  expect((await sounds(page)).slice(quiet), 'the trigger was heard').toContain('L_MINETR')
  // …and the mine SHOWS ITSELF, in the engine's own `WE_APMIN` — which comes out
  // of the MAP's archive and not the weapon one, so a loader that failed to pick
  // it up would draw nothing at all and say nothing about it (lib/game/ammo.ts).
  // CAMP's own field has nobody near it who can see a buried mine, so this count
  // is the trodden one and only it.
  expect(await trippedShown(page), 'the trodden mine was not drawn').toBe(1)

  // …and then it goes off: the same E_1 a grenade plays, and twenty points off a
  // grunt standing on the thing.
  await expect.poll(async () => (await counting(page)).length, { timeout: 4000 }).toBe(0)
  expect((await sounds(page)).slice(quiet)).toContain('E_1')
  await expect.poll(async () => (await hud(page)).health, { timeout: 4000 }).toBe(30)

  // **AND IT IS THROWN OFF THE SPOT.** Play: "мины не отбрасывают — как и тнт",
  // and then "это общая проблемма." The acting pig takes its flight on the state
  // the battle is already driving, the same one a jump uses (lib/game/battle.ts
  // `fling`, lib/game/tumble.ts).
  //
  // Whether it is still ON a mine where it lands is not asserted and cannot be:
  // CAMP's field is 99 tiles and a pig thrown across it may well find another,
  // which is what a minefield is for. That a tile is ONE-SHOT is the pure spec's
  // above.
  await expect
    .poll(
      async () => {
        const now = await debugState(page)
        return Math.hypot(now.x - at.x, now.z - at.z)
      },
      { timeout: 5000, message: 'the blast to throw the pig off the tile' }
    )
    .toBeGreaterThan(50)

  // …and NOTHING was ever drawn for the field it walked into: CAMP fields one
  // grunt, and a grunt cannot see a mine even standing on it (lib/game/mines.ts).
  expect(await markers(page), 'a grunt sees no mines').toBe(0)

  // **AND THE TURN IS OVER.** Play asked whether it should be, remembering that
  // it is — and the rule is not the mine's at all: `Pig::TakeDamage`'s second
  // argument, 0 on every weapon path, hands the turn on when the pig it is
  // hurting is the one being played (0x467c56, `turns/notes.md`). So the BLAST
  // ends it, above any death check and on any number of points. Asserted last
  // because it must not cut across the flight above: the handover waits for the
  // quiet like a weapon's does (lib/game/battle.ts, `spent`).
  await expect
    .poll(async () => (await hud(page)).turn, {
      timeout: 20000,
      message: 'the blast to hand the turn on'
    })
    .toBeGreaterThan(before.turn)

  expect(app.errors()).toEqual([])
})

test('TNT goes down IN FRONT of the pig, keeps the turn, and leaves four seconds', async ({ app }) => {
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

  // FIRST THE ANIMATION. Play: "ТНТ ставится на землю — с анимацией", and the
  // clip is not a decoration over the placing — its own key-frame event is what
  // puts the charge down, a third of the way in (lib/game/grenade.ts
  // `PLANT_PHASE` = 1314 of 4096), so the pig is wearing clip 77 for a while
  // before anything exists.
  //
  // **SAMPLED IN THE PAGE, because over a round trip this is a race** — and it
  // was one, flaking for a fortnight (todo.md B12): the spec polled for the
  // clip and then asked, in a second call, whether anything was down, and a
  // poll that landed past the key-frame found a charge already there and called
  // it a failure. A frame-rate sampler inside the page cannot land late: it
  // sees every frame of the clip, and the assertion is on what the SEQUENCE
  // says rather than on one lucky reading of it.
  const laying = await page.evaluate(
    () =>
      new Promise<{ clip: number | null; down: number }[]>((done) => {
        const pow = (
          window as unknown as {
            pow: { debug: { pose(): { clip: number | null }; grenades(): unknown[] } }
          }
        ).pow
        const seen: { clip: number | null; down: number }[] = []
        // Runs to a DEADLINE, not to a frame count. A count was tried first and
        // it went red under a full suite: the window is not in front, the frame
        // loop is throttled with it, and a hundred and eighty ticks stopped
        // short of the key-frame. What the sampler is for is not landing late,
        // and a clock keeps that whatever the frame rate does.
        const until = performance.now() + 10_000
        const tick = (): void => {
          seen.push({ clip: pow.debug.pose().clip, down: pow.debug.grenades().length })
          if (seen[seen.length - 1].down > 0 || performance.now() > until) done(seen)
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
  )
  const bending = laying.filter((one) => one.clip === LAY_CLIP && one.down === 0)
  expect(bending.length, 'the pig bends over with nothing down yet').toBeGreaterThan(4)
  const first = laying.findIndex((one) => one.down > 0)
  expect(first, `and then the charge appears — ${laying.length} frames watched`).toBeGreaterThan(0)
  expect(laying[first].clip, 'on the laying clip, not after it').toBe(LAY_CLIP)

  // It is on the ground, and the pig still has the controls: the turn was NOT
  // spent, it was HURRIED (lib/game/spend.ts).
  await expect.poll(async () => (await thrown(page)).length, { timeout: 4000 }).toBe(1)
  // **IN FRONT OF IT, and by the HAND.** Play: "динамит ставится на месте свина,
  // а не перед ним." It used to go at `pig.position`, the soles. It goes where
  // the laying clip's own hand is now — the same bone the throw leaves from —
  // so the distance is the arm's reach and not a number anybody picked
  // (lib/game/lobs.ts).
  const where = await debugState(page)
  const charge = (await thrown(page))[0]
  const ahead =
    (charge.x - where.x) * Math.sin(where.heading) + (charge.z - where.z) * Math.cos(where.heading)
  const aside =
    (charge.x - where.x) * Math.cos(where.heading) - (charge.z - where.z) * Math.sin(where.heading)
  // Measured: 131 ahead and 16 aside, against a pig 85 in radius — clear of the
  // soles and still within arm's length. The floor is the pig's own radius, so
  // the assertion says "in front of it" rather than pinning a number the pose
  // owns.
  expect(ahead, `the charge went down ${ahead.toFixed(0)} ahead, ${aside.toFixed(0)} aside`)
    .toBeGreaterThan(PIG_RADIUS)
  // …and still the pig's own patch of ground rather than thrown clear: within a
  // body's width of where it stands.
  expect(Math.hypot(charge.x - where.x, charge.z - where.z), 'it was thrown, not laid').toBeLessThan(
    PIG_RADIUS * 2
  )

  // **AND IT STANDS, FUSE UP.** Play: "тнт лежит боком на земле — должна стоять
  // фитилём вверх." The fuse is the model's own −X (the black stub out of the
  // bundle's end, three/grenades.ts), and up is −Y, so pointing straight up is
  // the y of the drawn direction being −1 and nothing left over in the plane.
  const [drawn] = await standing(page)
  expect(drawn, 'the charge is not being drawn at all').toBeTruthy()
  expect(drawn.fuse.y, 'the fuse is not up').toBeCloseTo(-1, 3)
  expect(Math.hypot(drawn.fuse.x, drawn.fuse.z), 'the bundle is lying over').toBeLessThan(0.001)
  // …ON the ground rather than in it: its lowest corner is the surface it was
  // planted on, which lying down it was buried a third into.
  expect(Math.abs(drawn.base - charge.y), 'the bundle is not sitting on the ground').toBeLessThan(1)
  await expect.poll(async () => (await hud(page)).seconds, { timeout: 4000 }).toBeLessThanOrEqual(
    PLANTED_SECONDS
  )
  const planted = await hud(page)
  expect(planted.turn, 'the same turn').toBe(before.turn)
  expect(planted.starting, 'and it is still being played').toBe(false)

  // …but not YET: the animation holds the pig to the end of itself, which play
  // caught — "не дожидается окончания анимации и можно идти в ней в последнюю
  // секунду". A press inside the clip moves nothing.
  await hold(page, 'walkForward', 400)
  const during = await debugState(page)
  expect(Math.hypot(during.x - where.x, during.z - where.z), 'it walked mid-clip').toBeLessThan(1)

  // **AND THEN IT CAN RUN.** Which is the whole point of the four seconds: a charge
  // lying at the pig's feet must not lock it the way a grenade in the air does
  // (lib/game/lobs.ts `thrown`), and the clock does not run inside the clip either
  // — the seconds are for running, not for bending over.
  await expect.poll(async () => wearing(page), { timeout: 5000 }).not.toBe(LAY_CLIP)
  expect((await hud(page)).seconds, 'the four seconds survived the clip').toBeGreaterThan(2)
  await hold(page, 'walkForward', 700)
  const ran = await debugState(page)
  expect(Math.hypot(ran.x - where.x, ran.z - where.z), 'it got away from it').toBeGreaterThan(50)

  // …and the HANDS ARE EMPTY: the charge left them, and the round went with it.
  expect(await holdingOf(page), 'it is still holding the thing it put down').toBeNull()

  // …and it cannot plant a SECOND one: one blow a turn (lib/game/battle.ts).
  await page.evaluate(() => {
    const c = (
      window as unknown as { pow: { controller: { press(a: string): void; release(a: string): void } } }
    ).pow.controller
    c.press('fire')
    c.release('fire')
  })
  await page.waitForTimeout(600)
  expect((await thrown(page)).length, 'a second charge went down').toBe(1)

  // **AND IT BURNS — the ENGINE's own way.** Play: "динамит не горит", and then
  // "горение динамита не из игры", which was fair: the first answer was an
  // invented orange spark. It is decoded now. Kind 53's constructor hangs a
  // PARENTED effect 0x1D on the projectile the same way the grenade's arm hangs
  // 0x15, offset 0x3C up the fuse, and that effect lays four dark puffs a frame
  // (lib/game/trail.ts, `FUSE_TRAIL`). So "alight" is a charge laying its own
  // trail, and there is no flame in it at all.
  expect(await burning(page), 'the charge is not alight').toBe(1)

  // **AND IT STAYS WHERE IT WAS PUT.** Play: "динамит катится по склону." It did:
  // it was stepped like anything else in the air, so gravity pressed it into the
  // ground and the contact carried the whole slope-parallel part of the bounce on
  // (lib/game/lobs.ts). A placed charge is not simulated at all now — only its
  // fuse runs.
  const laid = (await thrown(page))[0]
  await page.waitForTimeout(1500)
  const still = (await thrown(page))[0]
  expect(still, 'it went off early').toBeTruthy()
  expect(Math.hypot(still.x - laid.x, still.y - laid.y, still.z - laid.z), 'it moved').toBeLessThan(
    1
  )

  // Its fuse outlasts the run: the clock goes first, and the beat the turn ends
  // through waits for the charge rather than handing over on top of it
  // (lib/game/walkAway.ts).
  const waiting = await debugState(page)
  await expect.poll(async () => (await thrown(page)).length, { timeout: 15000 }).toBe(0)
  expect((await sounds(page)).slice(quiet), 'it went off').toContain('E_1')
  // …and the smoke stops with it.
  expect(await burning(page), 'a fuse is still alight with nothing to burn').toBe(0)

  // …**AND IT THROWS THE PIG THAT PLANTED IT**, inside that beat. Play: "динамит
  // не толкает" — right, and the charge was never the problem: TNT's six-second
  // fuse runs out after the four the turn hands back, so the blast lands during
  // the beat that ends the turn, and that beat used to drop the flight on the floor
  // (lib/game/battle.ts `flyOn`).
  await expect
    .poll(
      async () => {
        const now = await debugState(page)
        return Math.hypot(now.x - waiting.x, now.z - waiting.z)
      },
      { timeout: 6000, message: 'the charge to throw the pig that planted it' }
    )
    .toBeGreaterThan(100)

  expect(app.errors()).toEqual([])
})
