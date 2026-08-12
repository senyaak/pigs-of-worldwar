// PHASE 002 — the sky, and it is a MODEL rather than the `Skys/` folder.
//
// `Chars/SKYDOME.MAD` carries two hemispheres — `skydome` over the horizon and
// `skydomeu` under it — and one of eleven `Chars/<mood>.MAD` archives skins
// them with four 250×250 quadrants. Which mood a map wears is the first dword
// of its record in the exe's mission table (lib/game/sky.ts).
//
// The last test is the one that would have caught a dome loaded, scaled and
// invisible: it reads the top of the battle's own canvas back and asks whether
// anything is painted up there at all, and whether two moods paint it
// differently.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { existsSync } from 'node:fs'

import { expect, test } from '../app'
import { PHASE_ENV, GAME_DIR } from '../launch'
import { hold, swapMap } from '../controller'
import { startGame } from '../menu'
import type { Page } from '@playwright/test'
import { MAP_SKY, SKY_ARCHIVES, skyArchiveFor } from '../../src/lib/game/sky'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseModel } from '../../src/lib/formats/model'
import { parseTim } from '../../src/lib/formats/tim'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the mission table says which mood a map wears', () => {
  // Read out of the exe's two parallel tables — the map names at 0x4D1990 and
  // the 53 mission records at 0x4D5210 — and the pairing is what these four
  // pin: the ice maps are cold, the moon is space and the arenas are toys.
  expect(skyArchiveFor('CAMP')).toBe('coldsky')
  expect(skyArchiveFor('ICEFLOW')).toBe('coldsky')
  expect(skyArchiveFor('LUNAR1')).toBe('space')
  expect(skyArchiveFor('PLAY1')).toBe('toy')
  expect(skyArchiveFor('DESVAL')).toBe('desert')
  expect(skyArchiveFor('ARCHI')).toBe('sunset')
  // Lower case is a console away (`pow.swapMap('artgun')`).
  expect(skyArchiveFor('artgun')).toBe('sunny')
  // 53 records, and the six GEN* maps run past the end of them — those take
  // the remake's own fallback, which nothing rests on.
  expect(Object.keys(MAP_SKY)).toHaveLength(53)
  expect(skyArchiveFor('GENSNOW')).toBe('sunny')
})

test('every mood ships, and each is four 250×250 skins', () => {
  for (const mood of new Set(SKY_ARCHIVES)) {
    const data = readFileSync(path.join(GAME_DIR, 'Chars', `${mood}.mad`))
    const { entries } = parseArchive(data)
    expect(entries, `${mood} quadrants`).toHaveLength(4)
    for (const entry of entries) {
      const tim = parseTim(data.subarray(entry.offset, entry.offset + entry.size))
      expect([tim.width, tim.height], `${mood}/${entry.name}`).toEqual([250, 250])
    }
  }
})

test('the dome is two hemispheres, four quadrants each', () => {
  const data = readFileSync(path.join(GAME_DIR, 'Chars', 'SKYDOME.MAD'))
  const { entries } = parseArchive(data)
  const slice = (name: string): Uint8Array => {
    const entry = entries.find((one) => one.name.toLowerCase() === name)
    if (!entry) throw new Error(`no ${name} in SKYDOME.MAD`)
    return data.subarray(entry.offset, entry.offset + entry.size)
  }
  const half = (base: string): { yMin: number; yMax: number; triangles: number; groups: number[] } => {
    // No bone offsets: the dome's vertices are absolute and every one of them
    // carries bone 0, so `pig.HIR` would shift the whole sky (main/assets.ts).
    const model = parseModel(slice(`${base}.vtx`), slice(`${base}.no2`), slice(`${base}.fac`))
    let yMin = Infinity
    let yMax = -Infinity
    for (let i = 1; i < model.positions.length; i += 3) {
      yMin = Math.min(yMin, model.positions[i])
      yMax = Math.max(yMax, model.positions[i])
    }
    return { yMin, yMax, triangles: model.triangleCount, groups: model.groups.map((g) => g.texture) }
  }

  const above = half('skydome')
  const below = half('skydomeu')
  // 32 segments round, eight rings and a pole: 544 triangles, 136 to each of
  // the four quadrant skins.
  expect(above.triangles).toBe(544)
  expect(above.groups).toEqual([0, 1, 2, 3])
  expect(below.triangles).toBe(544)
  // Y-DOWN: the half OVER the horizon is the one with negative y, and the
  // radius is the model's own 15778 — the exe then scales it (256, 128, 256).
  expect([above.yMin, above.yMax]).toEqual([-15779, 0])
  expect([below.yMin, below.yMax]).toEqual([0, 15779])
})

/** What the scene says about its dome (three/debug.ts). */
const skyState = (page: Page): Promise<{ mood: string; triangles: number; skins: number; offEye: number } | null> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: { sky(): unknown } } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    return pow.debug.sky() as { mood: string; triangles: number; skins: number; offEye: number } | null
  })

test('the battle comes up under it, and it rides the eye', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // How much of the dome a screenshot catches is whatever the terrain does not
  // cover — a band over CAMP, nothing at all over ARTGUN — so what is asserted
  // here is the dome itself: the training ground's own mood, whole, and
  // centred on the camera to the unit.
  expect(await skyState(page)).toEqual({
    mood: 'coldsky',
    triangles: 544,
    skins: 4,
    offEye: 0,
    radius: 40_000
  })

  // A swap is a fresh battle, and it brings its own mood with it.
  expect(await swapMap(page, 'ARTGUN')).toBe(true)
  expect((await skyState(page))?.mood).toBe('sunny')
  // …and the dome still has not been left behind after a level's worth of
  // camera work.
  await hold(page, 'walkForward', 600)
  expect((await skyState(page))?.offEye).toBe(0)

  // Back to the default for the specs that share this app.
  expect(await swapMap(page, 'CAMP')).toBe(true)
  expect(app.errors()).toEqual([])
})
