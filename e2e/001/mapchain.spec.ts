// PHASE 001 — the MISSION CHAIN: the world map, the zoom, the region with
// its flags, and the briefing page that is also the loading screen
// (`pigmap/notes.md` in the disasm repo). The training ground skips the map
// — the exe's own gate — which is why this spec walks the NO path: declining
// the tutorial launches position 1 through the whole chain.

import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { test } from '../app'
import { FIRST_ARMY, TEST_TEAM, choose, nameTeam } from '../menu'
import { tap } from '../controller'

const mapPhase = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { pigMap?: { phase(): string } } }).pow
    if (!pow?.pigMap) throw new Error('pow.pigMap is missing')
    return pow.pigMap.phase()
  })

/** How many of the 25 territories the world map actually laid a tint over. */
const mapPatches = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { pigMap?: { patches(): number } } }).pow
    return pow?.pigMap ? pow.pigMap.patches() : -1
  })

/** How many flags the region page flew in its last frame. */
const mapFlags = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { pigMap?: { flags(): number } } }).pow
    return pow?.pigMap ? pow.pigMap.flags() : -1
  })

const briefingReady = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { briefing?: { ready(): boolean } } }).pow
    return pow?.briefing ? pow.briefing.ready() : false
  })

/** Whether the squad screen is still driving in — nothing takes a key while
 * a screen travels, so every walk through it waits here first. */
const flipping = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } }).pow
    return pow?.playerScreen ? pow.playerScreen.flipping() : true
  })

/** How many distinct colours a canvas is carrying — the same reading the
 * other frontend specs use to tell a drawn screen from a black one. */
const painted = (page: Page, canvasId: string): Promise<number> =>
  page.evaluate((id) => {
    const canvas = document.getElementById(id) as HTMLCanvasElement | null
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return -1
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const seen = new Set<number>()
    for (let i = 0; i < pixels.length; i += 4) {
      seen.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2])
    }
    return seen.size
  }, canvasId)

test('declining the tutorial launches through the map: world, zoom, region, briefing', async ({
  app
}) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()

  // START at position 0 asks the original's question; NO steps past the
  // training ground and launches position 1 — through the MAP.
  await expect
    .poll(() => flipping(page), { message: 'the player screen is still driving in' })
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()
  await choose(page, 'NO', 'askTraining')

  // The world map first, then a key a phase — the exe's own skip.
  await expect(page.locator('#pigmap')).toBeVisible()
  await expect.poll(() => mapPhase(page)).toBe('world')
  // …and it is PAINTED. The art loads through the main process and a miss is
  // only a console warning, so a spec that watched the phases alone would
  // pass over a black screen.
  await expect
    .poll(() => painted(page, 'pigmap-screen'), { message: 'the world map is blank' })
    .toBeGreaterThan(50)
  // …and every territory wears a NATION's colour. This is not the picture
  // test: a map with no tints at all still paints, because BigMap under them
  // is a map. Play saw exactly that — "нет только цветов ... какойто
  // дефолтный коричневый" — when the tint cache was keyed one way and read
  // another.
  await expect
    .poll(() => mapPatches(page), { message: 'the territories took no colour' })
    .toBe(25)
  await tap(page, 'menuSelect')
  await expect.poll(() => mapPhase(page)).toBe('zoom')
  await tap(page, 'menuSelect')
  await expect.poll(() => mapPhase(page)).toBe('region')
  // …and EVERY stand of the region flies one — five for Hogshead, from the
  // campaign's first day, in the colours of the nations holding them. They
  // come up one at a time over the phase's first 700 ms. The exe has no
  // conquest gate on this loop (0x483566 carries no comparison at all) and
  // this repo invented one, so the page showed bare poles and play reported
  // it twice before it was read properly.
  await expect
    .poll(() => mapFlags(page), { message: 'the region page flew no flags' })
    .toBe(5)
  await tap(page, 'menuSelect')

  // The chain always ends on the BRIEFING, which is the loading screen: the
  // bar walks while the level loads, and a key on the loaded page starts.
  await expect(page.locator('#briefing')).toBeVisible()
  await expect
    .poll(() => briefingReady(page), { message: 'the briefing is still loading the level' })
    .toBe(true)
  // AND IT WAITS. The key that left the map must not also answer the page it
  // opened — the briefing IS the loading screen, and play found it skipping
  // itself the moment the region handed over.
  await expect(page.locator('#briefing'), "the briefing answered the map's key").toBeVisible()
  await expect(page.locator('#battle')).toBeHidden()
  // The page itself is the level's own briefing art, with the enemy's
  // portrait composited into position one's.
  await expect
    .poll(() => painted(page, 'briefing-screen'), { message: 'the briefing page is blank' })
    .toBeGreaterThan(50)
  await tap(page, 'menuSelect')
  await expect(page.locator('#battle')).toBeVisible()

  // Walking out is an abort: back to the squad, nothing settled.
  await page.locator('#battle-leave').click()
  await expect(page.locator('#player')).toBeVisible()

  expect(app.errors()).toEqual([])
})

test('the key that leaves the briefing does not cut the squad loose', async ({ app }) => {
  const { page } = app

  // THIS SPEC PRESSES A REAL KEY, and it is the one place in the suite that
  // may. The rule is `controller.tap` (docs/testing.md) because a spec must
  // not test a parallel path — but here the keyboard IS the subject. Play
  // found it: "сломался парашют - начал миссию с падения". One Space was
  // reaching two views. The briefing's `menuSelect` showed the battle inside
  // the same dispatch, and the battle then read the SAME event through its
  // own map, where Space is `jump` — which during the drop-in cuts every
  // canopy at once.
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()
  await expect
    .poll(() => flipping(page), { message: 'the player screen is still driving in' })
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()

  // YES — the training ground, which skips the map and briefs straight away,
  // and whose one pig comes down under a canopy of its own (CAMP flags its
  // single marker, `parachute/notes.md`).
  await choose(page, 'YES', 'askTraining')
  await expect(page.locator('#briefing')).toBeVisible()
  await expect.poll(() => briefingReady(page), { message: 'the level is still loading' }).toBe(true)

  await page.keyboard.press('Space')
  await expect(page.locator('#battle')).toBeVisible()

  // …and the squad is still under silk. The drop is five seconds, so it is
  // running when the mission opens and every pig in it still has a canopy.
  const drop = await page.evaluate(() => {
    const pow = (
      window as unknown as {
        pow?: {
          debug?: {
            dropIn(): { running: boolean; pigs: { canopy: boolean; landed: boolean }[] }
          }
        }
      }
    ).pow
    if (!pow?.debug) throw new Error('pow.debug is missing')
    return pow.debug.dropIn()
  })
  expect(drop.running, 'the drop was over before the mission was even shown').toBe(true)
  expect(drop.pigs.length).toBeGreaterThan(0)
  expect(drop.pigs.filter((pig) => !pig.canopy && !pig.landed)).toEqual([])

  await page.locator('#battle-leave').click()
  await expect(page.locator('#player')).toBeVisible()

  expect(app.errors()).toEqual([])
})

test("the newspaper's three pieces load at the sizes the read gives", async ({ app }) => {
  const { page } = app

  // The paper only prints on a campaign WIN, which no menu spec can reach —
  // so this asks the loader for the three pieces directly. The sizes are the
  // exe's own (`pigmap/notes.md`): a full-screen front page, the story block
  // and the photo, the last two colour-keyed.
  const sizes = await page.evaluate(async () => {
    const api = (
      window as unknown as {
        api: {
          loadLanguageImages(
            folder: string,
            names: string[],
            keyed: string[]
          ): Promise<
            | { ok: true; images: { name: string; width: number; height: number }[] }
            | { ok: false; error: string }
          >
        }
      }
    ).api
    const result = await api.loadLanguageImages(
      'Papers',
      ['british', 'text17', 'pic05'],
      ['text17', 'pic05']
    )
    if (!result.ok) return { error: result.error }
    return {
      sizes: result.images.map((image) => `${image.name} ${image.width}x${image.height}`)
    }
  })
  expect(sizes.error).toBeUndefined()
  expect(sizes.sizes).toEqual(['british 640x480', 'text17 314x204', 'pic05 300x299'])

  expect(app.errors()).toEqual([])
})

test('back on the map skips the whole chain to the briefing', async ({ app }) => {
  const { page } = app
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()
  await expect
    .poll(() => flipping(page), { message: 'the player screen is still driving in' })
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()
  await choose(page, 'NO', 'askTraining')
  await expect(page.locator('#pigmap')).toBeVisible()
  await expect.poll(() => mapPhase(page)).toBe('world')

  // The remake's own shortcut: BACK drops the whole animation.
  await tap(page, 'menuBack')
  await expect(page.locator('#briefing')).toBeVisible()
  await expect
    .poll(() => briefingReady(page), { message: 'the briefing is still loading the level' })
    .toBe(true)
  await expect(page.locator('#briefing'), "the briefing answered the map's key").toBeVisible()
  await tap(page, 'menuSelect')
  await expect(page.locator('#battle')).toBeVisible()
  await page.locator('#battle-leave').click()
  await expect(page.locator('#player')).toBeVisible()

  expect(app.errors()).toEqual([])
})
