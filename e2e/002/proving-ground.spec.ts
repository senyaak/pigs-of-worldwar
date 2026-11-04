// PHASE 002 (app) — the PROVING GROUND opens from a running battle.
//
// The remake's own map (docs/facts/proving-ground.md), reached the way every
// other map is reached by hand: the console map selector, `pow.swapMap`. Its
// ground and records are built, its art is the install's own; this is the
// spec that it OPENS — the battle starts on the player's side, the pig walks,
// every record with a model is drawn, and the frame is not blank — and that its
// signposts wear the skill icon of the crate beside them, which no shipped map's
// SIGN does.

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hold, hud, swapMap, warp } from '../controller'
import type { Page } from '@playwright/test'
import { openBattle } from '../load'
import { pickupsOf } from '../../src/lib/game/pickups'
import { CRATE_PITCH, provingGroundObjects, provingGroundSigns } from '../../src/lib/game/provingGround'
import { SKILL_ICON } from '../../src/lib/game/skills'

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
  at: { name: string; x: number; z: number; order: number; maps: string[]; texels: number }[]
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

/** The skill menu's own art: an icon's sum of colour bytes, by entry name —
 * the same read `pow.debug.props()` makes of a drawn board. */
const iconSums = (page: Page): Promise<Map<string, number>> =>
  page
    .evaluate(async () => {
      const api = (window as unknown as {
        api: {
          loadArchiveBmps(path: string): Promise<{
            ok: boolean
            images: { name: string; rgba: Uint8Array }[]
          }>
        }
      }).api
      const loaded = await api.loadArchiveBmps('Language/Tims/MENUTIMS.MAD')
      if (!loaded.ok) throw new Error('MENUTIMS.MAD did not load')
      return loaded.images.map(({ name, rgba }): [string, number] => {
        let sum = 0
        for (let at = 0; at < rgba.length; at += 4) {
          if (rgba[at + 3] > 0) sum += rgba[at] + rgba[at + 1] + rgba[at + 2]
        }
        return [name, sum]
      })
    })
    .then((sums) => new Map(sums))

/**
 * What the canvas shows where a board is, held against an icon's own texels:
 * of the icon's coloured texels, the share the frame agrees with where the icon
 * should be — once the right way round and once mirrored.
 *
 * `greenPixels` in pause.spec.ts counts one colour; a whole icon is its own
 * signature, and only this tells a mirrored one from a straight one.
 */
const iconOnCanvas = (page: Page, id: number, icon: string): Promise<{ straight: number; mirrored: number }> =>
  page.evaluate(
    async ({ id, icon }) => {
      const win = window as unknown as {
        api: {
          loadArchiveBmps(path: string): Promise<{
            ok: boolean
            images: { name: string; width: number; height: number; rgba: Uint8Array }[]
          }>
        }
        pow: {
          debug: {
            boardOnScreen(id: number): { left: number; top: number; right: number; bottom: number } | null
          }
        }
      }
      const loaded = await win.api.loadArchiveBmps('Language/Tims/MENUTIMS.MAD')
      const art = loaded.images.find((one) => one.name === icon)
      const board = win.pow.debug.boardOnScreen(id)
      // The scene's own canvas: the dashboard's sits in the same host, first.
      const canvas = document.querySelector('#battle-canvas canvas:not(#battle-hud)') as HTMLCanvasElement | null
      if (!art || !board || !canvas) return { straight: -1, mirrored: -1 }
      const probe = document.createElement('canvas')
      probe.width = canvas.width
      probe.height = canvas.height
      const ctx = probe.getContext('2d')
      if (!ctx) return { straight: -1, mirrored: -1 }
      ctx.drawImage(canvas, 0, 0)
      const frame = ctx.getImageData(0, 0, probe.width, probe.height).data
      /** How far off a texel the frame may be, over the three channels: the
       * board is minified a little, so a pixel blends its neighbours. */
      const COLOUR_SLACK = 72
      // The icon stands centred on a square board as wide as it is.
      const margin = (art.width - art.height) / 2
      const agrees = (from: number, u: number, v: number): boolean => {
        const px = Math.floor((board.left + u * (board.right - board.left)) * probe.width)
        const py = Math.floor((board.top + v * (board.bottom - board.top)) * probe.height)
        if (px < 0 || py < 0 || px >= probe.width || py >= probe.height) return false
        const to = (py * probe.width + px) * 4
        return (
          Math.abs(frame[to] - art.rgba[from]) +
            Math.abs(frame[to + 1] - art.rgba[from + 1]) +
            Math.abs(frame[to + 2] - art.rgba[from + 2]) <
          COLOUR_SLACK
        )
      }
      let coloured = 0
      let straight = 0
      let mirrored = 0
      for (let y = 0; y < art.height; y++) {
        for (let x = 0; x < art.width; x++) {
          const from = (y * art.width + x) * 4
          if (art.rgba[from + 3] === 0) continue
          // Near-black texels are the outline, and would agree with any dark frame.
          if (art.rgba[from] + art.rgba[from + 1] + art.rgba[from + 2] < 90) continue
          coloured++
          const u = (x + 0.5) / art.width
          const v = (margin + y + 0.5) / art.width
          if (agrees(from, u, v)) straight++
          if (agrees(from, 1 - u, v)) mirrored++
        }
      }
      return { straight: straight / coloured, mirrored: mirrored / coloured }
    },
    { id, icon }
  )

/** Where the chase camera is along the strip. It eases after a warp, so a check
 * of one side of a board waits until the camera is on that side. */
const cameraX = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { pow: { debug: { camera(): { x: number } } } }).pow.debug.camera().x)

/** How many pixels of the frame, inside the board, are the shipped SIGN's red
 * ring (SIGN000.TIM). */
const skullRing = (page: Page, id: number): Promise<number> =>
  page.evaluate((id) => {
    const win = window as unknown as {
      pow: {
        debug: {
          boardOnScreen(id: number): { left: number; top: number; right: number; bottom: number } | null
        }
      }
    }
    const board = win.pow.debug.boardOnScreen(id)
    const canvas = document.querySelector('#battle-canvas canvas:not(#battle-hud)') as HTMLCanvasElement | null
    if (!board || !canvas) return -1
    const probe = document.createElement('canvas')
    probe.width = canvas.width
    probe.height = canvas.height
    const ctx = probe.getContext('2d')
    if (!ctx) return -1
    ctx.drawImage(canvas, 0, 0)
    const left = Math.max(0, Math.floor(board.left * probe.width))
    const top = Math.max(0, Math.floor(board.top * probe.height))
    const right = Math.min(probe.width, Math.ceil(board.right * probe.width))
    const bottom = Math.min(probe.height, Math.ceil(board.bottom * probe.height))
    if (right <= left || bottom <= top) return 0
    const pixels = ctx.getImageData(left, top, right - left, bottom - top).data
    let red = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 100 && pixels[i + 1] < 50 && pixels[i + 2] < 50) red++
    }
    return red
  }, id)

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

test('every signpost is drawn wearing the icon of the skill in the crate beside it', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  expect(await swapMap(page, 'PROVING')).toBe(true)

  const drawn = await drawnProps(page)
  const signs = drawn.at.filter((one) => one.name === 'SIGN')
  expect(signs).toHaveLength(48)
  const crates = pickupsOf(provingGroundObjects())
  const sums = await iconSums(page)

  /** The drawn sign standing nearest the crate of this skill. */
  const signOf = (skill: number): (typeof signs)[number] => {
    const crate = crates.find((one) => one.skill === skill)
    if (!crate) throw new Error(`no crate of skill ${skill}`)
    return signs.reduce((best, one) =>
      Math.hypot(one.x - crate.x, one.z - crate.z) < Math.hypot(best.x - crate.x, best.z - crate.z) ? one : best
    )
  }

  for (const { skill } of crates) {
    if (skill === null) throw new Error('a crate on the proving ground with no skill')
    const sign = signOf(skill)
    const icon = SKILL_ICON[skill]
    // The board's face group is drawn in the icon, the post in its own texture…
    expect(sign.maps, `the sign by skill ${skill}`).toEqual(['SIGN001.TIM', icon])
    // …and the pixels on that material are the menu's own (the black field the
    // board adds sums to nothing).
    expect(sign.texels, `the sign by skill ${skill}`).toBe(sums.get(icon))
  }
  // skills/notes.md § "The menu's art": entry 1 TROTTER is skill 1, entry 11
  // TSCOPIC is skill 11, entry 37 TNT is skill 37.
  expect(signOf(1).maps[1]).toBe('trotter')
  expect(signOf(11).maps[1]).toBe('tscopic')
  expect(signOf(37).maps[1]).toBe('tnt')
  expect(new Set(signs.map((one) => one.maps[1])).size, 'no two signs alike').toBe(48)

  expect(app.errors()).toEqual([])
})

test('a signpost brought into view shows its icon on the canvas, the right way round', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  expect(await swapMap(page, 'PROVING')).toBe(true)

  // 22, `rollgren`: a grenade bouncing away to the right, nothing like its own
  // mirror image.
  const skill = 22
  const icon = SKILL_ICON[skill]
  const sign = provingGroundSigns().find((one) => one.skill === skill)
  if (!sign) throw new Error(`no sign for skill ${skill}`)
  const signAt = provingGroundObjects().find((one) => one.id === sign.id)
  if (!signAt) throw new Error(`no record ${sign.id}`)
  /** Beside it, so the pig himself is not in front of the board. */
  const besideZ = signAt.z - CRATE_PITCH

  // From the crates' side, looking +x along the way the pig walks.
  await warp(page, signAt.x - 600, besideZ, Math.PI / 2)
  await expect.poll(() => cameraX(page), { message: 'the camera on the crates\' side' }).toBeLessThan(signAt.x)
  await expect
    .poll(async () => (await iconOnCanvas(page, sign.id, icon)).straight, { message: 'the icon is on the board' })
    .toBeGreaterThan(0.5)
  const seen = await iconOnCanvas(page, sign.id, icon)
  expect(seen.mirrored, 'the frame agrees with the icon, not its mirror image').toBeLessThan(seen.straight / 2)

  // Round the back, looking −x: still the right way round.
  await warp(page, signAt.x + 600, besideZ, -Math.PI / 2)
  await expect.poll(() => cameraX(page), { message: 'the camera round the back' }).toBeGreaterThan(signAt.x)
  await expect
    .poll(async () => (await iconOnCanvas(page, sign.id, icon)).straight, {
      message: 'the icon is on the back of the board'
    })
    .toBeGreaterThan(0.5)
  const behind = await iconOnCanvas(page, sign.id, icon)
  expect(behind.mirrored, 'the back reads the right way round too').toBeLessThan(behind.straight / 2)

  expect(app.errors()).toEqual([])
})

test('a shipped map draws its SIGN as it always did, with no icon', async ({ app }) => {
  const { page } = app
  await openBattle(page, 'CAMP')

  const drawn = await drawnProps(page)
  const signs = drawn.at.filter((one) => one.name === 'SIGN')
  // CAMP carries two (records 54 and its fellow, lib/game/provingSources.ts).
  expect(signs).toHaveLength(2)
  for (const sign of signs) expect(sign.maps).toEqual(['SIGN001.TIM', 'SIGN000.TIM'])

  // …and the skull's red ring is on the canvas where its board is. A yaw-0 SIGN
  // looks along ±z.
  const [sign] = signs
  await warp(page, sign.x + CRATE_PITCH, sign.z - 560, 0)
  await expect
    .poll(() => skullRing(page, sign.order), { message: "the shipped board's art" })
    .toBeGreaterThan(50)

  expect(app.errors()).toEqual([])
})
