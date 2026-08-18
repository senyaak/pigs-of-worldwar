// PHASE 002 — the dashboard: the battle wearing the original's brass.
//
// What the original keeps on screen the whole time, from play: the clock
// bottom right, the weapon and its direction top right, the map bottom left,
// and nothing over the pigs. The clock is the only one the battle can fill
// yet — the weapon panel has no weapon and the map is its own work — so the
// clock is what this pins.
//
// The pure half pins the archive so a mis-decode is caught at the source;
// the app half asserts the dashboard is actually painted and that it says
// what the game says.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { startGame } from '../menu'
import { hud, press, release, tap } from '../controller'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseTim } from '../../src/lib/formats/tim'
import { parseTab } from '../../src/lib/formats/tab'
import { parseBmp } from '../../src/lib/formats/bmp'
import { parseText } from '../../src/lib/formats/text'
import { nations } from '../../src/lib/game/teams'
import { PLATE_DELAY } from '../../src/renderer/src/ui/hud'
import { MAX_TEAMS } from '../../src/lib/game/spawns'

const DASH = path.join(GAME_DIR, 'Language', 'Tims', 'dashtims.mad')

test('the dashboard archive: the clock in four tiles and ten digits', () => {
  const data = readFileSync(DASH)
  const entries = parseArchive(data).entries
  const image = (name: string): { width: number; height: number } => {
    const entry = entries.find((candidate) => candidate.name.toLowerCase() === `${name}.tim`)
    if (!entry) throw new Error(`no ${name} in dashtims.mad`)
    return parseTim(data.subarray(entry.offset, entry.offset + entry.size))
  }

  // The clock is a 128x92 assembly: two 64x28 tiles over two 64x64 ones.
  expect(image('clock01')).toMatchObject({ width: 64, height: 28 })
  expect(image('clock02')).toMatchObject({ width: 64, height: 28 })
  expect(image('clock03')).toMatchObject({ width: 64, height: 64 })
  expect(image('clock04')).toMatchObject({ width: 64, height: 64 })

  // Ten digit faces, all one size — and that size is the width of the two
  // recesses in the clock's face, which is what says they belong to it.
  for (let digit = 0; digit <= 9; digit++) {
    expect(image(`timer${digit}`), `timer${digit}`).toMatchObject({ width: 24, height: 25 })
  }

  // The pieces the battle does NOT draw yet still ship, and are named here
  // so the day a weapon arrives nobody goes looking for them: the power
  // gauge in five tiles, the angle arc, the sights.
  for (const name of ['newpow3', 'newpow7', 'ang1', 'ang5', 'sights', 'target']) {
    expect(image(name).width, name).toBeGreaterThan(0)
  }
})

test('the battle font is GameChars, and it has letters to write with', () => {
  const dir = path.join(GAME_DIR, 'FEText')
  const table = parseTab(readFileSync(path.join(dir, 'GameChars.tab')))
  const atlas = parseBmp(readFileSync(path.join(dir, 'GameChars.bmp')))
  expect(table.glyphs).toHaveLength(98)
  expect(table.height).toBe(12)
  // The boxes are VRAM-relative and the origin is the '!' — subtract it and
  // they tile the atlas exactly, which is the whole decode in one assertion.
  expect(table.origin).toEqual({ x: 960, y: 90 })
  const drawn = table.glyphs.filter((glyph) => glyph.width > 0)
  expect(Math.max(...drawn.map((glyph) => glyph.x + glyph.width))).toBeLessThanOrEqual(atlas.width)
  expect(Math.max(...drawn.map((glyph) => glyph.y + glyph.height))).toBe(atlas.height)
  // 'A' is at code 0x41, so slot 0x41 - 0x1F.
  expect(table.glyphs[0x41 - 0x1f].width).toBeGreaterThan(0)
})

test('the squads are the game\'s own six nations, out of fetext', () => {
  const dir = path.join(GAME_DIR, 'Language', 'Text')
  const teams = nations(
    parseText(readFileSync(path.join(dir, 'fetext.bin')), readFileSync(path.join(dir, 'fetext.ofs')))
  )
  expect(teams.map((team) => team.name)).toEqual([
    "TOMMY'S TROTTERS",
    'GARLIC GRUNTS',
    'UNCLE HAMS HOGS',
    'PIGGYSTROIKA',
    'SUSHI-SWINE',
    'SOW-A-KRAUTS'
  ])
  // Nine pigs a side, and the British are the ones every battle opens with.
  for (const team of teams) expect(team.pigNames, team.name).toHaveLength(9)
  expect(teams[0].pigNames).toEqual([
    'NOBBY', 'GINGER', 'DEN', 'MONTY', 'BASIL', 'PONSONBY', 'PERCY', 'SMITH', 'JONES'
  ])

  // Six blocks for six nations. A marker's side bit does NOT index this list —
  // it is a slot, and who wears what comes off the save (lib/game/nations.ts).
  expect(teams).toHaveLength(MAX_TEAMS)
})

test('the dashboard is painted over the battle, and it counts down', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // The overlay canvas covers the view and is really drawn on: the brass is
  // hundreds of colours, where a failed decode leaves it empty.
  const painted = async (): Promise<{ colors: number; opaque: number }> =>
    page.evaluate(() => {
      const canvas = document.getElementById('battle-hud') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return { colors: -1, opaque: -1 }
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      let opaque = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] === 0) continue
        opaque++
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return { colors: seen.size, opaque }
    })
  await expect
    .poll(async () => (await painted()).colors, { message: 'the dashboard drawn' })
    .toBeGreaterThan(20)

  // The corners the original uses: the clock bottom right, the dial and its
  // weapon slot top right, and nothing bottom left, where the map will go.
  const corners = await page.evaluate(() => {
    const canvas = document.getElementById('battle-hud') as HTMLCanvasElement
    const context = canvas.getContext('2d')!
    const half = { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) }
    const opaqueIn = (x: number, y: number, w: number, h: number): number => {
      const pixels = context.getImageData(x, y, w, h).data
      let count = 0
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 0) count++
      return count
    }
    return {
      topRight: opaqueIn(half.x, 0, canvas.width - half.x, half.y),
      bottomLeft: opaqueIn(0, half.y, half.x, canvas.height - half.y),
      bottomRight: opaqueIn(half.x, half.y, canvas.width - half.x, canvas.height - half.y),
      area: canvas.width * canvas.height
    }
  })
  expect(corners.bottomRight, 'the clock').toBeGreaterThan(1000)
  expect(corners.topRight, 'the angle dial and the weapon slot').toBeGreaterThan(1000)
  expect(corners.bottomLeft, 'the map is not built yet').toBe(0)
  // An overlay, not a curtain: the battle keeps almost all of the view.
  expect(corners.bottomRight + corners.topRight).toBeLessThan(corners.area / 4)

  // What it says is what the game says, and the clock runs down.
  const before = await hud(page)
  // Fifty, not a hundred: health is the pig's CLASS's and NOBBY is a grunt
  // (lib/game/health.ts, out of the table at exe 0x4d02e0).
  expect(before).toMatchObject({ turn: 1, side: "TOMMY'S TROTTERS", pig: 'NOBBY', health: 50 })
  expect(before.seconds).toBeGreaterThan(40)
  await expect
    .poll(async () => (await hud(page)).seconds, { message: 'the clock running down' })
    .toBeLessThan(before.seconds)

  // Ending the turn winds it back up.
  await tap(page, 'endTurn')
  await expect.poll(async () => (await hud(page)).seconds).toBeGreaterThan(40)

  expect(app.errors()).toEqual([])
})

test('a pig wears its name while it rests, and drops it while it walks', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // What is painted BELOW THE BRIEFING BAR, in pixels. The clock and the dial
  // never change size — a digit tile is opaque whichever digit it shows — so
  // anything that moves this number is the name plate coming and going.
  //
  // The top of the canvas is left out because the BAR is up there, and it runs on
  // the tutorial's clock rather than on the pig's: the sergeant's opening line
  // drops in and scrolls while this spec walks, which measured as thousands of
  // pixels appearing out of nowhere. Counted per band, the whole difference was
  // in the top eighth and the plate's own rows matched exactly. The `> NAME`
  // assertion below is what keeps this honest — if the cut ever swallowed the
  // plate itself, that is the line that fails.
  //
  // A FRAME IS WAITED OUT FIRST. The dashboard is drawn on its own loop and the
  // controls are read in the scene's, so the pixels trail the state the specs
  // poll by up to a frame.
  const BAR_BAND = 0.18
  const painted = (): Promise<number> =>
    page.evaluate(async (skip) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
      const canvas = document.getElementById('battle-hud') as HTMLCanvasElement
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      let count = 0
      for (let y = Math.ceil(canvas.height * skip); y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] !== 0) count++
        }
      }
      return count
    }, BAR_BAND)

  // A name in the big letters is worth thousands of pixels; the clock's
  // digits differ by a handful as they tick, so the two never blur.
  const NAME = 1000
  const still = async (): Promise<number> => (await hud(page)).still

  await press(page, 'walkForward')
  await expect.poll(still, { message: 'walking resets the rest' }).toBe(0)
  const walking = await painted()
  await release(page, 'walkForward')

  // It comes back once the pig has stood still for a moment.
  await expect.poll(still, { message: 'the pig settles' }).toBeGreaterThan(PLATE_DELAY)
  const resting = await painted()
  expect(resting - walking, 'the name is up while it rests').toBeGreaterThan(NAME)

  // And goes again the moment it is driven.
  await press(page, 'walkForward')
  await expect.poll(still).toBe(0)
  expect(Math.abs((await painted()) - walking), 'and drops on the move').toBeLessThan(NAME)
  await release(page, 'walkForward')

  expect(app.errors()).toEqual([])
})
