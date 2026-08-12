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
import { MAP_SKY, SKY_ARCHIVES, skyArchiveFor, weatherFor } from '../../src/lib/game/sky'
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

test('the weather is the same field, and only two moods draw any', () => {
  // The loader reads snow.mtd for cold and rain.mtd for everything else, but
  // the per-frame dispatcher (0x44F9B0) draws for mood 0 and mood 5 alone. So
  // most of the game loads the rain art and never shows it.
  expect(weatherFor('CAMP')).toBe('snow')
  expect(weatherFor('ICEFLOW')).toBe('snow')
  expect(weatherFor('TRENCH')).toBe('rain')
  expect(weatherFor('FINAL')).toBe('rain')
  expect(weatherFor('ARTGUN')).toBeNull()
  expect(weatherFor('LUNAR1')).toBeNull()
  const maps = Object.keys(MAP_SKY)
  expect(maps.filter((one) => weatherFor(one) === 'snow'), 'the cold ten').toHaveLength(10)
  expect(maps.filter((one) => weatherFor(one) === 'rain'), 'the ominous five').toHaveLength(5)
})

test('four flakes apiece, and both archives ship', () => {
  for (const kind of ['snow', 'rain']) {
    const data = readFileSync(path.join(GAME_DIR, 'Language', 'Tims', `${kind}.mtd`))
    const { entries } = parseArchive(data)
    expect(entries.map((one) => one.name.toLowerCase()), kind).toEqual([
      `${kind}0.tim`,
      `${kind}1.tim`,
      `${kind}2.tim`,
      `${kind}3.tim`
    ])
    // 32×32 at four bits, the same 576 bytes a ground tile's art takes.
    for (const entry of entries) {
      const tim = parseTim(data.subarray(entry.offset, entry.offset + entry.size))
      expect([tim.width, tim.height], `${kind}/${entry.name}`).toEqual([32, 32])
    }
  }
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

interface SkyReading {
  mood: string
  triangles: number
  skins: number
  offEye: number
  radius: number
}

/** What the scene says about its dome (three/debug.ts). */
const skyState = (page: Page): Promise<SkyReading | null> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: { sky(): unknown } } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    return pow.debug.sky() as SkyReading | null
  })

interface WeatherReading {
  kind: string
  flakes: number
  layers: number
  onScreen: number
  fallen: number
}

/** …and about what is falling out of it. */
const weatherState = (page: Page): Promise<WeatherReading | null> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: { weather(): unknown } } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    return pow.debug.weather() as WeatherReading | null
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

  // …and it is snowing on it, which is the training ground's own mood.
  const falling = await weatherState(page)
  expect(falling).toMatchObject({ kind: 'snow', flakes: 128, layers: 8, onScreen: 128 })
  // **AND IT IS ACTUALLY FALLING.** The first pass of this drew a perfectly
  // correct field of flakes that hung still, because the layer that was
  // brightest was also the slowest — a count of sprites says nothing about
  // that and neither does one frame (three/weather.ts).
  await page.waitForTimeout(400)
  const later = await weatherState(page)
  // Virtual pixels DOWN a 480-tall screen, and the sign is the point: handed
  // the camera's pitch bare the whole field rose, which is what a signed
  // measurement catches and a count of sprites never would. The exe's own rate
  // is about a screen every two seconds, so 0.4s owes well over ten.
  expect(later!.fallen - falling!.fallen, 'pixels down in 0.4s').toBeGreaterThan(10)

  // A swap is a fresh battle, and it brings its own mood with it — and ARTGUN's
  // draws no weather at all, which is what most of the game does.
  expect(await swapMap(page, 'ARTGUN')).toBe(true)
  expect((await skyState(page))?.mood).toBe('sunny')
  expect(await weatherState(page)).toBeNull()
  // …and the dome still has not been left behind after a level's worth of
  // camera work.
  await hold(page, 'walkForward', 600)
  expect((await skyState(page))?.offEye).toBe(0)

  // Back to the default for the specs that share this app.
  expect(await swapMap(page, 'CAMP')).toBe(true)
  expect(app.errors()).toEqual([])
})
