// PHASE 002 (app) вЂ” the first battle scene: New Game drops two squads onto
// ARCHI, the HUD names whose turn it is, End Turn rotates through players
// and pigs, and the scene actually draws.
//
// The squad rosters here mirror ui/battle.ts; the rotation rules themselves
// are pinned down in game-logic.spec.ts вЂ” this spec checks the wiring.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import {
  beginTurn,
  debugState,
  hold,
  hud,
  landed,
  peakNodeY,
  press,
  release,
  skipTurn,
  tap,
  swapMap,
  warp
} from '../controller'
import { choose, startGame, toBattle } from '../menu'
import { TILE_STEP, TILE_WALL, TILE_WATER, parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery, WORLD_LIMIT } from '../../src/lib/game/terrain'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { GAME_DIR } from '../launch'

/**
 * The center of a whole-tile wall on the battle map with dry open ground due
 * west of it вЂ” read from the shipped map, so it stays true if the map does.
 * Well inside the world limit: a pig clamped at the border is refused for a
 * different reason entirely.
 *
 * Of every such wall it takes the one with the LONGEST fall behind it. A
 * pig thrown off a wall onto rising ground barely goes anywhere; thrown off
 * onto a slope it bounces away down the hill, which is the behaviour worth
 * asserting вЂ” and the one the original is recognisable by.
 */
function wallAboveASlope(): { x: number; z: number; query: TerrainQuery } {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  const query = new TerrainQuery(blocks)
  const clear = (x: number, z: number): boolean =>
    query.walkable(x, z) && !query.isWater(x, z) && query.walkable(x, z - TILE_STEP)
  let best: { x: number; z: number; fall: number } | null = null
  for (const block of blocks) {
    for (let tile = 0; tile < block.tiles.length; tile++) {
      const { type, slip } = block.tiles[tile]
      if ((type & TILE_WALL) === 0 || (slip & 0x0f) !== 0 || (type & TILE_WATER) !== 0) continue
      const x = block.x + (tile % 4) * TILE_STEP + TILE_STEP / 2
      const z = block.z + Math.floor(tile / 4) * TILE_STEP + TILE_STEP / 2
      const room = Math.max(Math.abs(x), Math.abs(z)) < WORLD_LIMIT - 3 * TILE_STEP
      if (!room || !clear(x - TILE_STEP, z) || !clear(x - 2 * TILE_STEP, z)) continue
      if (!clear(x - 3 * TILE_STEP, z)) continue
      // Game space is Y-down, so ground FALLING away west means height grows.
      const fall = query.height(x - 3 * TILE_STEP, z) - query.height(x - TILE_STEP, z)
      if (!best || fall > best.fall) best = { x, z, fall }
    }
  }
  if (!best) throw new Error('no wall with open ground west of it on CAMP')
  return { x: best.x, z: best.z, query }
}

/** A scene reading as the (x, z) pair the terrain query takes. */
const positionOf = (at: { x: number; z: number }): [number, number] => [at.x, at.z]

/** 7 RIFLE — the training ground's second weapon, and a crate's walk away, which
 * is why this spec takes it from the console instead (ui/battle.ts). */
const RIFLE = 7

type Page = import('@playwright/test').Page

const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

const holdingOf = (page: Page): Promise<number | null> =>
  page.evaluate(
    () => (window as unknown as { pow: { debug: { holding(): number | null } } }).pow.debug.holding()
  )

/** Whether the beat at the END of a turn is running — mode 13, WALK AWAY. */
const handingOver = (page: Page): Promise<boolean> =>
  page.evaluate(
    () =>
      (window as unknown as { pow: { debug: { walkAway(): unknown } } }).pow.debug.walkAway() !==
      null
  )

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves вЂ” run the whole suite, not this spec alone')
  }
})

test('New Game: squads on the map, turns rotate, the scene draws', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // Turn 1: first player's first pig, full health, the clock running. Full is
  // FIFTY for a grunt — the maximum is the class's, out of the record at
  // 0x4d02e0, and it is not 100 (lib/game/health.ts).
  await expect
    .poll(() => hud(page))
    .toMatchObject({ turn: 1, side: "TOMMY'S TROTTERS", pig: 'NOBBY', health: 50 })

  // The battle canvas draws something that is not background.
  const foregroundPixels = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.querySelector('#battle-canvas canvas') as HTMLCanvasElement | null
      if (!canvas) return -1
      const probe = document.createElement('canvas')
      probe.width = canvas.width
      probe.height = canvas.height
      const ctx = probe.getContext('2d')
      if (!ctx) return -1
      ctx.drawImage(canvas, 0, 0)
      const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs(pixels[i] - 0x23) > 32 ||
          Math.abs(pixels[i + 1] - 0x27) > 32 ||
          Math.abs(pixels[i + 2] - 0x1d) > 32
        ) {
          count++
        }
      }
      return count
    })
  await expect.poll(foregroundPixels, { message: 'rendered battle pixels' }).toBeGreaterThan(20000)

  // The clock is real: the seconds tick down on their own.
  const secondsLeft = async (): Promise<number> => (await hud(page)).seconds
  const before = await secondsLeft()
  expect(before).toBeGreaterThan(40)
  await expect.poll(secondsLeft, { message: 'turn clock ticking' }).toBeLessThan(before)

  // End the turn the way a player must: SKIP TURN in hand, then FIRE. There is no
  // key for it any more (e2e/controller.ts, lib/game/controls.ts).
  // End Turn through the controller вЂ” the same action the button and the
  // Enter key fire. CAMP is the training ground and fields ONE pig, so the
  // turn comes straight back to it, with the clock reset.
  await skipTurn(page)
  await expect
    .poll(() => hud(page))
    .toMatchObject({ turn: 2, side: "TOMMY'S TROTTERS", pig: 'NOBBY', health: 50 })
  expect(await secondsLeft()).toBeGreaterThan(40)

  // Two sides rotate the way two sides do вЂ” on a map that HAS two.
  expect(await swapMap(page, 'LIBERATE')).toBe(true)
  await expect
    .poll(() => hud(page))
    .toMatchObject({ turn: 1, side: "TOMMY'S TROTTERS", pig: 'NOBBY' })
  await skipTurn(page)
  // The second side is the map's own choice: LIBERATE sets the French bit,
  // so the enemy IS the Garlic Grunts (lib/game/teams.ts).
  await expect
    .poll(() => hud(page))
    .toMatchObject({ turn: 1, side: 'GARLIC GRUNTS', pig: 'BASTILLE' })
  // …and the MACHINE plays them: its brain waits out the card, stands
  // thinking, and passes on its own (lib/game/ai.ts). Nothing is pressed here
  // — pressing would do nothing anyway, because input is muted on the
  // machine's turn (input/battleInput.ts).
  await expect
    .poll(() => hud(page), { timeout: 30_000, message: 'the machine passes its own turn' })
    .toMatchObject({ turn: 2, side: "TOMMY'S TROTTERS", pig: 'GINGER' })
  // Back to the map the rest of the phase warps around on.
  expect(await swapMap(page, 'CAMP')).toBe(true)

  // Leaving lands back on the menu; a fresh New Game starts over at turn 1.
  await page.locator('#battle-leave').click()
  await expect(page.locator('#menu')).toBeVisible()
  await startGame(page)
  await expect
    .poll(() => hud(page))
    .toMatchObject({ turn: 1, side: "TOMMY'S TROTTERS", pig: 'NOBBY', health: 50 })


  expect(app.errors()).toEqual([])
})

test('a turn waits a beat before it starts, and any input cuts it short', async ({ app }) => {
  const { page } = app
  // NOT `startGame`, which lands the drop and then the beat is already
  // running вЂ” this wants to catch it.
  await toBattle(page)
  await landed(page)

  // "START OF TURN": the clock is full and not moving.
  expect((await hud(page)).starting).toBe(true)
  const before = await debugState(page)
  await page.waitForTimeout(150)
  const held = await debugState(page)
  expect(Math.hypot(held.x - before.x, held.z - before.z), 'nothing drives yet').toBeLessThan(1)

  // A press ends it AND is acted on вЂ” nothing a player does is swallowed,
  // which is the whole risk in putting a pause here.
  await hold(page, 'walkForward', 400)
  expect((await hud(page)).starting).toBe(false)
  const walked = await debugState(page)
  expect(Math.hypot(walked.x - before.x, walked.z - before.z), 'and it walked').toBeGreaterThan(50)

  // Every later turn gets its own beat. That it also runs out UNAIDED is
  // pinned in game-logic.spec.ts, where it costs nothing вЂ” here it would be
  // ten seconds of watching a still screen.
  await skipTurn(page)
  await expect.poll(async () => (await hud(page)).starting).toBe(true)

  expect(app.errors()).toEqual([])
})

test('USING A WEAPON ends the turn — one shot and the pig hands over', async ({ app }) => {
  const { page } = app
  await startGame(page)
  const before = await hud(page)
  // The clock is not what ends this turn: CAMP gives 99 seconds and the whole
  // test spends about three (lib/game/turns.ts).
  expect(before.seconds, 'the clock had plenty left').toBeGreaterThan(50)

  expect(await give(page, RIFLE)).toBe(true)
  await expect.poll(async () => holdingOf(page)).toBe(RIFLE)
  // Getting it out is a clip of its own and the pig is held for it, so the shot
  // waits for the rifle to be in the hand rather than on the way to it.
  await page.waitForTimeout(800)

  // ONE press. Play: "использование оружия заканчивает ход — у нас нет."
  await press(page, 'fire')
  await release(page, 'fire')

  // Not on the press — the bullet flies first, and then the turn goes the way
  // every other turn goes: through the beat at the end of one, which is the
  // exe's own route out of a used skill (lib/game/spend.ts).
  await expect.poll(async () => handingOver(page), { timeout: 9000 }).toBe(true)
  await expect.poll(async () => (await hud(page)).turn, { timeout: 9000 }).toBe(before.turn + 1)
  // …and the next turn opens on its own beat, waiting to be started.
  expect((await hud(page)).starting).toBe(true)

  expect(app.errors()).toEqual([])
})

test('the controller drives the pig: walking moves it, turning aims it', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // Walking moves the pig вЂ” position read off the scene, the ground truth
  // the HUD only summarises.
  const start = await debugState(page)
  await hold(page, 'walkForward', 700)
  const walked = await debugState(page)
  const distance = Math.hypot(walked.x - start.x, walked.z - start.z)
  expect(distance, 'walkForward moved the pig').toBeGreaterThan(200)

  // Turning aims it.
  // 800ms, not 400: a turn is 32/4096 of a circle per FRAME and a frame is
  // twice as long as it was (ballistics.ts), so the same rotation takes
  // twice the wall clock. The threshold below is what is being tested.
  await hold(page, 'turnRight', 800)
  const turned = await debugState(page)
  expect(Math.abs(turned.heading - walked.heading), 'turnRight rotated the pig').toBeGreaterThan(0.3)

  // Jump is a one-shot: it must leave the ground. Game space is Y-down, so
  // airborne means a SMALLER y than standing. Back to the spawn first вЂ”
  // that tile is `standable`, where 700ms of walking lands is whatever the
  // map has there, and a pig that walked into the drink cannot jump.
  await warp(page, start.x, start.z, turned.heading)
  await page.waitForTimeout(120)
  const grounded = await debugState(page)
  await tap(page, 'jump')
  // Not on the next frame: the pig crouches for one pass of the wind-up clip
  // and leaves the ground when that finishes (lib/game/locomotion). So watch
  // for the apex rather than sampling at a fixed moment вЂ” game space is
  // Y-down, so airborne is a SMALLER y than standing, and the hop clears
  // about 35 units (JUMP_RISE).
  const apex = await peakNodeY(page, grounded.nodeY - 20, 2000)
  expect(apex, 'jump left the ground').toBeLessThan(grounded.nodeY - 20)
  const airborne = { nodeY: apex }

  // And it recharges. The cooldown once ticked down inside the turn-change
  // block, where the next line reset it вЂ” so a pig could jump exactly once
  // per turn and never again.
  await expect
    .poll(async () => (await debugState(page)).nodeY, { message: 'back on the ground' })
    .toBeGreaterThan(airborne.nodeY + 20)
  await page.waitForTimeout(600)
  const standing = await debugState(page)
  await tap(page, 'jump')
  expect(await peakNodeY(page, standing.nodeY - 20, 2000), 'jumped a second time').toBeLessThan(
    standing.nodeY - 20
  )

  expect(app.errors()).toEqual([])
})

test('opening the inventory STOPS the pig, with the key still down', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // Play's own bug, twice over: "при открытии инвентаря продолжаю идти", and the
  // sights' half of it — "нажимаю прицел, останавливаюсь, и надо снова нажимать
  // w". One rule now serves both: a change of control SET drops every driving
  // key, so the new set starts from nothing held (`input/actions.ts`).
  //
  // It is also what the whole per-frame poll is FOR. Nothing on the keyboard
  // moves when a menu opens, so a controller that only announces changes has
  // nothing to announce and the walk carries on underneath — a listener cannot
  // see this at all (`input/battleInput.ts`).
  await press(page, 'walkForward')
  const start = await debugState(page)
  await page.waitForTimeout(300)
  const walking = await debugState(page)
  expect(Math.hypot(walking.x - start.x, walking.z - start.z), 'it is walking').toBeGreaterThan(50)

  // R, and the key is never let go of.
  await tap(page, 'skills')
  await page.waitForTimeout(300)
  const opened = await debugState(page)
  await page.waitForTimeout(300)
  const later = await debugState(page)
  expect(Math.hypot(later.x - opened.x, later.z - opened.z), 'and it stopped').toBeLessThan(1)

  // …and pressing it again does not walk either, because the menu is what the
  // key means now. Out of the menu and it drives once more.
  await press(page, 'walkForward')
  await page.waitForTimeout(300)
  const inMenu = await debugState(page)
  expect(Math.hypot(inMenu.x - later.x, inMenu.z - later.z), 'the menu has the key').toBeLessThan(1)
  await tap(page, 'skills')
  await press(page, 'walkForward')
  await page.waitForTimeout(300)
  const freed = await debugState(page)
  expect(Math.hypot(freed.x - inMenu.x, freed.z - inMenu.z), 'and it drives again').toBeGreaterThan(
    50
  )
  await release(page, 'walkForward')

  expect(app.errors()).toEqual([])
})

test('G with nothing that points does nothing, and losing focus lets go', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // A pig fresh off the drop holds nothing, so the aim view is not reachable and
  // the key must be inert. It was not: entering the sights hands over a control
  // SET, a set change drops the driving keys, and so G stopped a walking pig for
  // no reason at all. Play: "нажатие g когда нельзя прицеливаться всё ещё
  // отменяет движение — БАГ."
  await press(page, 'walkForward')
  await page.waitForTimeout(200)
  await press(page, 'aimMode')
  const before = await debugState(page)
  await page.waitForTimeout(300)
  const after = await debugState(page)
  expect(
    Math.hypot(after.x - before.x, after.z - before.z),
    'G did not stop the walk'
  ).toBeGreaterThan(50)

  // …and the window losing focus drops every key it is holding. Without it an
  // alt-tab out with a key down leaves it down for ever — no keyup ever arrives —
  // which is how play lost the sights AND the walk in one go: "нажал g, сделал
  // альт-таб, вернулся, прицел не вышел… и кстати поломалась ходьба от этого."
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await page.waitForTimeout(150)
  const dropped = await debugState(page)
  await page.waitForTimeout(300)
  const stopped = await debugState(page)
  expect(
    Math.hypot(stopped.x - dropped.x, stopped.z - dropped.z),
    'the blur let go of the walk'
  ).toBeLessThan(1)
  const held = await page.evaluate(() => {
    const pow = (window as unknown as { pow: { controller: { isDown(a: string): boolean } } }).pow
    return ['walkForward', 'aimMode', 'fire'].filter((a) => pow.controller.isDown(a))
  })
  expect(held, 'nothing is still held').toEqual([])

  expect(app.errors()).toEqual([])
})

test('walk into a wall long enough and the pig is thrown out of it', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // A real wall on the battle map with the ground falling away behind it:
  // the pig starts a tile and a half west of it, facing straight at it.
  const wall = wallAboveASlope()
  const EAST = Math.PI / 2
  await warp(page, wall.x - 768, wall.z, EAST)

  await press(page, 'walkForward')
  let inside = await debugState(page)
  try {
    // Nothing refuses the step, so it walks IN вЂ” and lands on a floor with
    // 0.99 restitution and 0.01 friction, which shakes it about.
    await expect
      .poll(async () => !wall.query.walkable(...positionOf(await debugState(page))), {
        message: 'walked into the wall'
      })
      .toBe(true)
    inside = await debugState(page)
  } finally {
    // Let go before asking whether it got out: held, the key just walks it
    // straight back in after every ejection.
    await release(page, 'walkForward')
  }

  // And it does not stay there. Which way out it takes is the terrain's
  // business вЂ” 0.01 friction slides it off a slope, and the wedge counter
  // throws it clear if the ground is too flat to slide on вЂ” but out it goes,
  // and that is the property worth holding: a pig left in a wall is a pig
  // that cannot be played.
  await expect
    .poll(async () => wall.query.walkable(...positionOf(await debugState(page))), {
      message: 'came back out of the wall',
      timeout: 8000
    })
    .toBe(true)

  // It comes back down rather than sailing off.
  await expect
    .poll(
      async () => {
        const before = await debugState(page)
        await page.waitForTimeout(200)
        const after = await debugState(page)
        return Math.abs(after.nodeY - before.nodeY) < 1
      },
      { message: 'stopped bouncing', timeout: 10000 }
    )
    .toBe(true)

  // And it is OUT: standing where a pig may stand. This is the one that
  // matters вЂ” a pig left inside a wall is a pig that cannot be played.
  const landed = await debugState(page)
  expect(wall.query.walkable(...positionOf(landed)), 'not left inside the wall').toBe(true)

  expect(app.errors()).toEqual([])
})

test('a jump cannot be started from inside a wall, so it is no ladder', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // Riding a jump into a cliff face, landing higher up it and going again is
  // how a pig once climbed over everything and off the map. Walking in is
  // allowed вЂ” the original refuses nothing about the ground вЂ” but the jump
  // is not: "Can't jump from this tile type". So the climb ends on the first
  // landing inside the wall.
  const wall = wallAboveASlope()
  const EAST = Math.PI / 2
  await warp(page, wall.x - 768, wall.z, EAST)

  await press(page, 'walkForward')
  try {
    await expect
      .poll(async () => !wall.query.walkable(...positionOf(await debugState(page))), {
        message: 'walked into the wall'
      })
      .toBe(true)

    const inside = await debugState(page)
    await tap(page, 'jump')
    await page.waitForTimeout(150)
    const after = await debugState(page)
    // It may be shuddering on that near-elastic floor, but not JUMPING: a
    // jump clears far more than the contact does.
    expect(after.nodeY, 'no jump out of a wall').toBeGreaterThan(inside.nodeY - 200)
    expect(Math.abs(after.x)).toBeLessThanOrEqual(WORLD_LIMIT)
    expect(Math.abs(after.z)).toBeLessThanOrEqual(WORLD_LIMIT)
  } finally {
    await release(page, 'walkForward')
  }

  expect(app.errors()).toEqual([])
})


test('NOTHING IS FIRED FROM THE AIR — a jump swallows the fire key', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await beginTurn(page)

  // Something with a GAUGE in hand, so "did it start charging" is a number.
  await page.evaluate(() => {
    ;(window as unknown as { pow: { give(s: number, a?: number): boolean } }).pow.give(19, 5)
  })
  await page.waitForTimeout(900)
  const charging = (): Promise<number | null> =>
    page.evaluate(
      () =>
        (window as unknown as { pow: { debug: { charging(): number | null } } }).pow.debug.charging()
    )

  // On the ground the key FILLS it. The gauge is up for any weapon that has one,
  // so what says "charging" is the number rising rather than the number existing.
  await press(page, 'fire')
  await expect.poll(charging, { timeout: 3000 }).toBeGreaterThan(0)
  await release(page, 'fire')
  await page.waitForTimeout(600)

  // …and in the AIR it does nothing at all. Play: "можно во время прыжка начать
  // заряжать оружие — баг." `Pig::MayAct` refuses outright while the pig's own
  // mode is 5, which is being airborne (0x467a28, and 0x46b205 is the same value
  // the movement update returns on).
  await tap(page, 'jump')
  await page.waitForTimeout(300)
  await press(page, 'fire')
  await page.waitForTimeout(300)
  expect(await charging(), 'it started charging in mid-air').toBe(0)
  await release(page, 'fire')

  expect(app.errors()).toEqual([])
})
