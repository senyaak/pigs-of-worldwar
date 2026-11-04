// PHASE 001 — the game's frame: the main menu, wearing the original
// frontend.
//
// Everything on the screen is the game's own: the backdrop and the machinery
// out of FEBMP.MAD (the MGL compression was reverse-engineered from the
// game's own decompressor for this phase — docs/formats.md), the letters out
// of the FEText glyph tables, the four labels out of fetext.bin. So the spec
// asserts what the DATA says — ONE PLAYER, MULTI-PLAYER, OPTIONS, QUIT
// APPLICATION — and that the screen is really painted.
//
// Only ONE PLAYER leads anywhere yet, and it now opens the screen of that
// name — NEW GAME and LOAD GAME, screen 14 of the exe's own table, and the
// owner's PROVING GROUND under them (ui/onePlayer.ts) — from which NEW GAME
// opens the training ground. The asset browsers are not a menu bar at all — the
// original has no such screen, so they hang off the remake's own F1.

import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'

import { PHASE_ENV, TMP, launchApp, openAssets } from '../launch'
import { expect, leaveBattle, test, toMenu } from '../app'
import { tap } from '../controller'
import { choose, labels, lightBar, nudge, selection, startGame } from '../menu'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the menu is the original screen, in the original letters', async ({ app }) => {
  const { page } = app
  await expect(page.locator('#menu')).toBeVisible()

  // The four bars are fetext 13..16, in the file's own order.
  await expect
    .poll(() => labels(page))
    .toEqual(['ONE PLAYER', 'MULTI-PLAYER', 'OPTIONS', 'QUIT APPLICATION'])

  // The frontend is 640x480 and really painted: a decode failure would leave
  // it blank, where the art alone runs to hundreds of colours.
  const screen = page.locator('#menu-screen')
  await expect(screen).toHaveAttribute('width', '640')
  await expect(screen).toHaveAttribute('height', '480')
  const distinctColors = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('menu-screen') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return seen.size
    })
  await expect.poll(distinctColors, { message: 'the painted frontend' }).toBeGreaterThan(50)

  expect(app.errors()).toEqual([])
})

test('the lit bar moves on every press, and wraps', async ({ app }) => {
  const { page } = app
  // Start from the top DELIBERATELY. A screen is come back to wherever it was
  // left, and the suite's file order is not fixed, so a spec that reaches the
  // menu after one that opened MULTI-PLAYER finds the bar already moved —
  // which is what this line used to assert away.
  await lightBar(page, 'ONE PLAYER')
  expect(await selection(page)).toBe(0)

  // Nothing gates a press. The original's up and down arms are two lines
  // each and neither waits for anything, so two presses on each other's heels
  // move two bars — the machine catching up is the needle's business, not the
  // selection's (frontend/notes.md, 0x42a739 and 0x42a8a9).
  await tap(page, 'menuDown')
  await tap(page, 'menuDown')
  expect(await selection(page), 'both presses took').toBe(2)
  await nudge(page, 'menuUp')
  expect(await selection(page)).toBe(1)

  // Off the top it wraps round.
  await nudge(page, 'menuUp')
  await nudge(page, 'menuUp')
  expect(await selection(page), 'up from the top wraps to the bottom').toBe(3)
  await nudge(page, 'menuDown')
  expect(await selection(page)).toBe(0)
  expect(app.errors()).toEqual([])
})

test('ONE PLAYER is a screen of its own — NEW GAME, LOAD GAME, PROVING GROUND', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await expect(page.locator('#menu')).toBeHidden()

  // fetext 55 and 56, screen 14's own two items, and the owner's third:
  // `[play]`, 2026-11-02, docs/facts/menu.md.
  await expect
    .poll(() => labels(page, 'onePlayer'))
    .toEqual(['NEW GAME', 'LOAD GAME', 'PROVING GROUND'])

  // The arrow keys walk all three, and wrap at both ends.
  await lightBar(page, 'NEW GAME', 'onePlayer')
  await nudge(page, 'menuDown', 'onePlayer')
  expect(await selection(page, 'onePlayer')).toBe(1)
  await nudge(page, 'menuDown', 'onePlayer')
  expect(await selection(page, 'onePlayer')).toBe(2)
  await nudge(page, 'menuDown', 'onePlayer')
  expect(await selection(page, 'onePlayer'), 'down from the bottom wraps to the top').toBe(0)
  await nudge(page, 'menuUp', 'onePlayer')
  expect(await selection(page, 'onePlayer'), 'up from the top wraps to the bottom').toBe(2)
  await nudge(page, 'menuUp', 'onePlayer')
  expect(await selection(page, 'onePlayer')).toBe(1)

  // LOAD GAME opens screen 10 — the slot list (ui/loadScreen.ts) — and its
  // back key returns here.
  await tap(page, 'menuSelect')
  await expect(page.locator('#load')).toBeVisible()
  await tap(page, 'menuBack')
  await expect(page.locator('#oneplayer')).toBeVisible()

  // And the back key is the way out, the way it is on MULTI-PLAYER.
  await tap(page, 'menuBack')
  await expect(page.locator('#menu')).toBeVisible()

  expect(app.errors()).toEqual([])
})

/** A rectangle of ONE PLAYER's canvas, in its own 640×480 pixels. */
interface CanvasBox {
  x: number
  y: number
  width: number
  height: number
}

/** A row's plate comes out this wide: one 160-wide `chose` plus the frontend's
 * global stretch of 50, so the third runs 284..494 (`LAYOUT.bars`,
 * ui/barScreen.ts; exe 0x41c073 and 0x41c0ed, `frontend/notes.md`). */
const PLATE_WIDTH = 210

/**
 * The third row's plate, off the screen's own live layout. The band stops short
 * of the plate's last column, where the row's lamp (flush against the plate, at
 * 493) overlaps it and blinks.
 */
const thirdPlate = (page: Page): Promise<CanvasBox> =>
  page.evaluate(() => {
    const { bars, lamp } = (
      window as unknown as {
        pow: {
          screen: {
            layout: {
              oneplayer: {
                bars: { x: number; y: number; step: number }
                lamp: { x: number }
              }
            }
          }
        }
      }
    ).pow.screen.layout.oneplayer
    return { x: bars.x, y: bars.y + 2 * bars.step, width: lamp.x - bars.x, height: bars.step }
  })

/** A band of ONE PLAYER's canvas as it stands, one number per colour channel. */
const readBand = (page: Page, box: CanvasBox): Promise<number[]> =>
  page.evaluate((band) => {
    const canvas = document.getElementById('op-screen') as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context) throw new Error('#op-screen has no 2d context')
    return Array.from(context.getImageData(band.x, band.y, band.width, band.height).data)
  }, box)

/**
 * The band once it has stopped changing: two reads a poll apart that agree. The
 * screen reports itself settled before its first tick has drawn anything, and
 * its letters are hidden while the plates turn, so only the pixels can say.
 */
async function settledBand(page: Page, box: CanvasBox): Promise<number[]> {
  let last: number[] = []
  await expect
    .poll(
      async () => {
        const now = await readBand(page, box)
        const same = now.length > 0 && now.every((value, i) => value === last[i])
        last = now
        return same
      },
      { message: 'the plate is still turning over' }
    )
    .toBe(true)
  return last
}

/** Where two reads of a band differ: its first and last column, and how many
 * separate runs of columns lie between them. */
function changedColumns(
  before: number[],
  after: number[],
  width: number
): { left: number; right: number; runs: number } {
  const columns = new Set<number>()
  for (let i = 0; i < before.length; i += 4) {
    if (
      before[i] !== after[i] ||
      before[i + 1] !== after[i + 1] ||
      before[i + 2] !== after[i + 2]
    ) {
      columns.add((i / 4) % width)
    }
  }
  const sorted = [...columns].sort((a, b) => a - b)
  const runs = sorted.filter((column, i) => i === 0 || sorted[i - 1] !== column - 1).length
  return { left: sorted[0] ?? -1, right: sorted[sorted.length - 1] ?? -1, runs }
}

test('PROVING GROUND is drawn whole on the third plate', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await expect.poll(() => labels(page, 'onePlayer')).toContain('PROVING GROUND')
  const plate = await thirdPlate(page)

  // The plate's art is the same however the row is lit, and only the letters
  // change shade with the light (CHARS2 to CHARS2L, 0x428DBD). So what differs
  // between the row unlit and lit IS the word as it was drawn.
  await lightBar(page, 'LOAD GAME', 'onePlayer')
  const unlit = await settledBand(page, plate)
  await lightBar(page, 'PROVING GROUND', 'onePlayer')
  const lit = await settledBand(page, plate)
  const word = changedColumns(unlit, lit, plate.width)

  // Every letter of the owner's word stands apart from the next, `[play]`,
  // 2026-11-02: PROVING is seven and GROUND six.
  expect(word.runs, 'all thirteen letters were drawn').toBe(13)
  // Inside the plate at both ends, and centred on it (`centred`, ui/barScreen.ts).
  expect(word.left, 'room to the left of the word').toBeGreaterThan(0)
  const rightMargin = PLATE_WIDTH - 1 - word.right
  expect(rightMargin, 'room to the right of the word').toBeGreaterThan(0)
  // The right margin is the bigger by the pen's 3 past the last letter, the
  // measure counting it (exe 0x4318dd, 0x430c28; `FRONTEND_METRICS`, ui/font.ts).
  expect(Math.abs(rightMargin - word.left - 3), 'centred on its plate').toBeLessThanOrEqual(1)

  // A local picture for a reviewer to look at, under `test-results/`, which is
  // not kept in the repo. The assertions above are the paint check.
  await page.locator('#op-screen').screenshot({ path: test.info().outputPath('one-player.png') })

  expect(app.errors()).toEqual([])
})

test('a real click on PROVING GROUND opens the map, with no save before or after', async () => {
  // A launch of its own, because this is the one state the shared app cannot be
  // in: other specs in the phase raise campaigns in the shared save folder.
  const saveDir = path.join(TMP, 'proving-ground-bar-saves')
  rmSync(saveDir, { recursive: true, force: true })
  const launched = await launchApp({ envFile: PHASE_ENV, saveDir })
  const { page } = launched
  const saves = (): Promise<number> =>
    page.evaluate(async () => {
      const listed = await (
        window as unknown as {
          api: {
            listSaves(): Promise<{ ok: true; saves: unknown[] } | { ok: false; error: string }>
          }
        }
      ).api.listSaves()
      if (!listed.ok) throw new Error(listed.error)
      return listed.saves.length
    })
  try {
    await expect(page.locator('#menu')).toBeVisible()
    await choose(page, 'ONE PLAYER')
    await expect(page.locator('#oneplayer')).toBeVisible()
    await lightBar(page, 'NEW GAME', 'onePlayer')
    expect(await saves(), 'the profile starts with no save').toBe(0)

    /** Where a canvas pixel is on the page: `object-fit: contain` centres the
     * canvas in a box of another shape (ui/mouseRows.ts). */
    const onPage = (x: number, y: number): Promise<{ x: number; y: number }> =>
      page.evaluate(
        (at) => {
          const canvas = document.getElementById('op-screen') as HTMLCanvasElement
          const box = canvas.getBoundingClientRect()
          const scale = Math.min(box.width / canvas.width, box.height / canvas.height)
          return {
            x: box.left + (box.width - canvas.width * scale) / 2 + at.x * scale,
            y: box.top + (box.height - canvas.height * scale) / 2 + at.y * scale
          }
        },
        { x, y }
      )
    const plate = await thirdPlate(page)
    const third = await onPage(plate.x + PLATE_WIDTH / 2, plate.y + plate.height / 2)
    const first = await onPage(plate.x + PLATE_WIDTH / 2, plate.y + plate.height / 2 - 2 * plate.height)

    // Hovering lights it, a bar at a time, the way every row does.
    await page.mouse.move(third.x, third.y)
    await expect.poll(() => selection(page, 'onePlayer'), { message: 'hover on the third' }).toBe(2)
    await page.mouse.move(first.x, first.y)
    await expect.poll(() => selection(page, 'onePlayer'), { message: 'hover on the first' }).toBe(0)

    // The click on an unlit bar walks the light there and lands when it arrives.
    await page.mouse.click(third.x, third.y)
    await expect(page.locator('#battle')).toBeVisible({ timeout: 15_000 })
    const map = await page.evaluate(() => (window as unknown as { pow: { map(): string } }).pow.map())
    expect(map, 'the map pow.swapMap(PROVING) opens').toBe('PROVING')
    expect(await saves(), 'opening it wrote no save').toBe(0)

    // Off the rows first: the main menu comes up under the same pixel, and a
    // parked pointer would pull its light onto OPTIONS.
    await page.mouse.move(0, 0)
    await leaveBattle(page)
    await expect(page.locator('#menu'), 'leaving lands on the main menu').toBeVisible()
    expect(await saves(), 'leaving wrote no save').toBe(0)
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
    rmSync(saveDir, { recursive: true, force: true })
  }
})

test('SELECT TEAM lists the six armies on the other layout', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  // WAIT for the screen to arrive before driving it. A screen that has never
  // been entered reports itself settled — its drive is at rest and its plates
  // are not walking — so `lightBar` lets the next press fly while the screen
  // BEFORE it is still leaving, and that press is dropped by both of them.
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()

  // fetext 25..30 — record 3's own six, and the order the nation index counts
  // them in (lib/game/teams.ts).
  await expect
    .poll(() => labels(page, 'teamScreen'))
    .toEqual([
      "TOMMY'S TROTTERS",
      'GARLIC GRUNTS',
      'UNCLE HAMS HOGS',
      'PIGGYSTROIKA',
      'SUSHI-SWINE',
      'SOW-A-KRAUTS'
    ])

  // It is a different layout, not the machine — but it is really painted, the
  // same way the menu's canvas is checked. POLLED, because the labels arrive
  // with `load()` and the first DRAW is a frontend tick later: reading the
  // canvas straight after them catches it blank.
  const distinctColors = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.getElementById('team-screen') as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) return -1
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<number>()
      for (let i = 0; i < pixels.length; i += 4) {
        seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
      }
      return seen.size
    })
  await expect.poll(distinctColors, { message: 'the painted team screen' }).toBeGreaterThan(50)

  // And the PIG on the turntable, which is a MODEL blitted into that canvas
  // (three/frontendPig.ts). Counted on its OWN canvas rather than in the
  // frontend one: the backdrop behind it is a photograph and would answer for
  // any number of colours on its own. Transparent everywhere the pig is not,
  // which is what lets it composite over the backdrop at all.
  const pigPixels = async (): Promise<number> =>
    page.evaluate(() => {
      const source = document.querySelector('#team-pig canvas') as HTMLCanvasElement | null
      if (!source) return -1
      const copy = document.createElement('canvas')
      copy.width = source.width
      copy.height = source.height
      const context = copy.getContext('2d')
      if (!context) return -1
      context.drawImage(source, 0, 0)
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data
      let opaque = 0
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) opaque++
      return opaque
    })
  await expect.poll(pigPixels, { message: 'the pig on the turntable' }).toBeGreaterThan(2000)

  // The lit row wraps over six, not four.
  await lightBar(page, "TOMMY'S TROTTERS", 'teamScreen')
  await nudge(page, 'menuUp', 'teamScreen')
  expect(await selection(page, 'teamScreen'), 'up from the top wraps to the sixth').toBe(5)

  await tap(page, 'menuBack')
  await expect(page.locator('#oneplayer')).toBeVisible()

  expect(app.errors()).toEqual([])
})

test('NEW GAME opens the battle, and F1 the asset browsers', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()
  await expect(page.locator('#menu')).toBeHidden()
  // Walking out of a campaign battle is an ABORT: it lands on the squad, not
  // the menu — nothing is settled and nothing is written (main.ts).
  await leaveBattle(page)
  await expect(page.locator('#player')).toBeVisible()
  await toMenu(page)
  await expect(page.locator('#menu')).toBeVisible()

  await openAssets(page)
  await expect(page.locator('#file-list')).toBeVisible()
  await page.locator('#browser-menu').click()
  await expect(page.locator('#menu')).toBeVisible()

  expect(app.errors()).toEqual([])
})

/** Resolves with the app process's exit code once it truly terminates. */
function processExit(launched: { app: { process(): { once(e: 'exit', cb: (code: number | null) => void): unknown } } }): Promise<number | null> {
  return new Promise((resolve) => launched.app.process().once('exit', resolve))
}

test('without --windowed the game takes the whole screen, borderless', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV, windowed: false })
  try {
    await expect(launched.page.locator('#menu')).toBeVisible()
    // Asked of the PAGE, not of Electron: what matters is that the game has
    // the whole display with no frame around it, and the page is where that
    // is visible. Going fullscreen is the window manager's business and
    // lands a moment after the window does, so it is polled.
    const shape = (): Promise<string> =>
      launched.page.evaluate(
        () => `${window.innerWidth}x${window.innerHeight} of ${screen.width}x${screen.height}`
      )
    await expect
      .poll(shape, { message: 'a borderless window spanning the display' })
      .toMatch(/^(\d+)x(\d+) of \1x\2$/)
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('QUIT APPLICATION quits cleanly: process gone, exit code 0, no errors', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  const exited = processExit(launched)
  const closed = launched.app.waitForEvent('close')
  await expect(page.locator('#menu')).toBeVisible()
  await expect.poll(() => labels(page)).toContain('QUIT APPLICATION')
  expect(launched.errors).toEqual([])
  // Choosing it quits the app; Playwright may lose the page mid-call and
  // throw "target closed" - that IS the success case here.
  await choose(page, 'QUIT APPLICATION').catch(() => undefined)
  await closed
  expect(await exited, 'the process terminated of its own accord').toBe(0)
})

test('closing the window quits the app cleanly too', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
  const { page } = launched
  const exited = processExit(launched)
  const closed = launched.app.waitForEvent('close')
  await expect(page.locator('#menu')).toBeVisible()
  expect(launched.errors).toEqual([])
  // Same as Quit: the call tears the page down under Playwright's feet, so
  // a "target closed" rejection here IS the success path.
  await page.evaluate(() => window.close()).catch(() => undefined)
  await closed
  expect(await exited, 'window-all-closed shut the app down').toBe(0)
})
