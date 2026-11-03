// PHASE 002 (app) — the PROVING GROUND opens from a running battle.
//
// The remake's own map (docs/facts/proving-ground.md), reached the way every
// other map is reached by hand: the console map selector, `pow.swapMap`. Its
// ground and records are built, its art is the install's own; this is the
// spec that it OPENS — the battle starts on the player's side, the pig walks,
// every record with a model is drawn, and the frame is not blank.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hold, hud, swapMap } from '../controller'
import type { Page } from '@playwright/test'
import { openBattle } from '../load'

/** Everything the map places that has art: 48 crates, a sign by each, four
 * vehicles and two emplacements — the five pig markers have none
 * (lib/game/provingGround.ts). */
const DRAWN = 48 + 48 + 4 + 2

const mapName = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { map?(): string } }).pow
    if (!pow?.map) throw new Error('pow.map is missing — is the battle module loaded?')
    return pow.map()
  })

interface Drawn {
  placed: number
  objects: number
  at: { name: string }[]
}

const drawnProps = (page: Page): Promise<Drawn> =>
  page.evaluate(() => (window as unknown as { pow: { debug: { props(): Drawn } } }).pow.debug.props())

/**
 * What the battle canvas has on it: how many pixels are not the scene's
 * clear colour, and how many distinct colours there are — `docs/testing.md`
 * § A debug read is not a paint check. The renderer keeps its drawing buffer
 * (three/scene.ts), so the frame can be read back.
 */
const paint = (page: Page): Promise<{ foreground: number; colours: number }> =>
  page.evaluate(() => {
    const canvas = document.querySelector('#battle-canvas canvas') as HTMLCanvasElement | null
    if (!canvas) return { foreground: -1, colours: -1 }
    const probe = document.createElement('canvas')
    probe.width = canvas.width
    probe.height = canvas.height
    const ctx = probe.getContext('2d')
    if (!ctx) return { foreground: -1, colours: -1 }
    ctx.drawImage(canvas, 0, 0)
    const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
    let foreground = 0
    const seen = new Set<number>()
    for (let i = 0; i < pixels.length; i += 4) {
      seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      if (
        Math.abs(pixels[i] - 0x23) > 32 ||
        Math.abs(pixels[i + 1] - 0x27) > 32 ||
        Math.abs(pixels[i + 2] - 0x1d) > 32
      ) {
        foreground++
      }
    }
    return { foreground, colours: seen.size }
  })

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('pow.swapMap opens the proving ground: a battle, a walking pig, every record drawn', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  await expect(page.locator('#battle')).toBeVisible()

  // The bare call lists it beside the shipping maps.
  const said: string[] = []
  const listen = (message: { text(): string }): void => {
    said.push(message.text())
  }
  page.on('console', listen)
  expect(await swapMap(page)).toBe(false)
  await expect.poll(() => said.some((line) => line.includes('PROVING'))).toBe(true)
  page.off('console', listen)

  expect(await swapMap(page, 'PROVING')).toBe(true)
  expect(await mapName(page)).toBe('PROVING')

  // Turn 1, on the player's side — the side carrying the scripted bit goes
  // first (0x4A5D2A, lib/game/spawns.ts) and opens on its first pig.
  await expect
    .poll(() => hud(page))
    .toMatchObject({ turn: 1, side: "TOMMY'S TROTTERS", pig: 'NOBBY', health: 50 })

  // Walking forward moves it, down the strip.
  const start = await debugState(page)
  await hold(page, 'walkForward', 400)
  const walked = await debugState(page)
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(100)
  expect(walked.x, 'down the strip, +x').toBeGreaterThan(start.x)

  // Every record that has a model has a mesh — the vehicles and emplacements,
  // each out of its own archive, among them.
  const drawn = await drawnProps(page)
  expect(drawn.placed).toBe(DRAWN)
  const names = drawn.at.map((one) => one.name)
  for (const name of ['TANK', 'AM_TANK', 'CARRY', 'AMLAUNCH', 'PILLBOX', 'BIG_GUN']) {
    expect(names.filter((one) => one === name), name).toHaveLength(1)
  }
  expect(names.filter((one) => one === 'CRATE1')).toHaveLength(48)
  expect(names.filter((one) => one === 'SIGN')).toHaveLength(48)

  // …and the frame is not blank: ground, sky and props, not the clear colour.
  await expect
    .poll(async () => (await paint(page)).foreground, { message: 'rendered battle pixels' })
    .toBeGreaterThan(20000)
  expect((await paint(page)).colours, 'a picture, not a fill').toBeGreaterThan(200)

  // Back to the default for the specs that share this app.
  expect(await swapMap(page, 'CAMP')).toBe(true)
  expect(await mapName(page)).toBe('CAMP')

  expect(app.errors()).toEqual([])
})
