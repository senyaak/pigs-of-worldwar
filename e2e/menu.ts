// Driving a frontend screen the way a player does.
//
// The frontend is drawn on a canvas in the game's own art, so there is no
// button to click: a spec moves the lit bar with the controller, exactly as
// the keyboard does, and reads the screen back through `window.pow`.
//
// There is more than one such screen — the main menu and MULTI-PLAYER are the
// same machine wearing different labels (src/renderer/src/ui/barScreen.ts) —
// so every helper takes WHICH, and defaults to the menu.

import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import { beginTurn, landed, tap } from './controller'

/** Which screen's bars to read. The names are the `window.pow` keys. */
export type Screen =
  | 'menu'
  | 'onePlayer'
  | 'loadScreen'
  | 'askTraining'
  | 'debrief'
  | 'teamScreen'
  | 'nameScreen'
  | 'playerScreen'
  | 'multiPlayer'

interface ScreenHooks {
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
}

type PowScreens = { pow?: Partial<Record<Screen, ScreenHooks>> }

/** Which bar is lit. */
export const selection = (page: Page, screen: Screen = 'menu'): Promise<number> =>
  page.evaluate((which) => {
    const hooks = (window as unknown as PowScreens).pow?.[which]
    if (!hooks) throw new Error(`${which} is not up — window.pow.${which} is missing`)
    return hooks.selected()
  }, screen)

/** What the bars say, in order, straight out of fetext. */
export const labels = (page: Page, screen: Screen = 'menu'): Promise<string[]> =>
  page.evaluate((which) => {
    const hooks = (window as unknown as PowScreens).pow?.[which]
    if (!hooks) throw new Error(`${which} is not up — window.pow.${which} is missing`)
    return hooks.labels()
  }, screen)

/** What each bar says on the RIGHT — null where it carries no setting. */
export const values = (page: Page, screen: Screen = 'menu'): Promise<(string | null)[]> =>
  page.evaluate((which) => {
    const hooks = (window as unknown as PowScreens).pow?.[which]
    if (!hooks) throw new Error(`${which} is not up — window.pow.${which} is missing`)
    return hooks.values()
  }, screen)

/**
 * One bar up or down. The press takes at once — nothing on the original's
 * menu gates one — but the screen may not be LISTENING yet, so this presses
 * until the bar moves and fails fast if it never does.
 */
export async function nudge(
  page: Page,
  action: 'menuUp' | 'menuDown',
  screen: Screen = 'menu'
): Promise<void> {
  const from = await selection(page, screen)
  await page.waitForFunction(
    (o) => {
      const pow = (window as unknown as PowScreens & {
        pow?: { controller: { tap(a: string): void } }
      }).pow
      const hooks = pow?.[o.screen as Screen] as ScreenHooks | undefined
      if (!hooks) throw new Error(`${o.screen} is not up — window.pow.${o.screen} is missing`)
      if (hooks.selected() !== o.from) return true
      pow?.controller.tap(o.action)
      return false
    },
    { action, from, screen },
    { polling: 50 }
  )
}

/**
 * Move the lit bar onto the one with this label, and stop there.
 *
 * A SETTING is not chosen, it is nudged left and right, so lighting a bar and
 * choosing it are two different things — and a spec must never assume where
 * the cursor was left: a screen is come back to wherever the last spec put it,
 * and the suite's file order is not fixed (docs/testing.md, worker fixtures).
 */
export async function lightBar(
  page: Page,
  label: string,
  screen: Screen = 'menu'
): Promise<void> {
  // A screen paints before its WORDS arrive: the labels come out of
  // `fetext.bin` through the main process, so a spec that reaches it in the
  // first tenth of a second finds the bars with nothing written on them.
  // Only the first spec in a worker is ever fast enough to see it, which is
  // why it went unnoticed until one was added at the top of a file.
  await expect
    .poll(async () => (await labels(page, screen)).filter((one) => one.length > 0).length, {
      message: `the ${screen} bars are still blank`
    })
    .toBeGreaterThan(0)
  const bars = await labels(page, screen)
  const wanted = bars.indexOf(label)
  if (wanted < 0) throw new Error(`no ${screen} bar says ${label} — it has ${bars.join(', ')}`)
  for (let at = await selection(page, screen); at !== wanted; at = await selection(page, screen)) {
    await nudge(page, wanted > at ? 'menuDown' : 'menuUp', screen)
  }
  // And leave the machine SETTLED: a screen that is still driving in — or
  // still turning its plates over — refuses to be CHOSEN, which is the one
  // thing the original does gate (its leave arm only runs from a standstill).
  await expect
    .poll(
      () =>
        page.evaluate((which) => {
          const hooks = (window as unknown as PowScreens).pow?.[which]
          return hooks ? hooks.flipping() : false
        }, screen),
      { message: 'the bar is still turning over' }
    )
    .toBe(false)
}

/** Light the bar with this label, then choose it. */
export async function choose(
  page: Page,
  label: string,
  screen: Screen = 'menu'
): Promise<void> {
  await lightBar(page, label, screen)
  await tap(page, 'menuSelect')
}

/** The first of the six armies — `fetext` 25, and the one SELECT TEAM opens on. */
export const FIRST_ARMY = "TOMMY'S TROTTERS"

/**
 * The menu to the battle and no further — the walk a spec wants when the drop
 * itself, or the beat at the top of the first turn, is the subject.
 *
 * It is five screens deep now: ONE PLAYER opens the screen of that name, NEW
 * GAME opens SELECT TEAM, an army chosen there opens PLEASE NAME YOUR TEAM,
 * a name accepted raises the squad on the PLAYER screen, and START MISSION
 * there opens the battle.
 */
export async function toBattle(page: Page): Promise<void> {
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, TEST_TEAM)
  await expect(page.locator('#player')).toBeVisible()
  await startMission(page)
  await expect(page.locator('#battle')).toBeVisible()
}

/** What the suite calls its army. Capitals and nothing the alphabet lacks —
 * the original's grid has no lowercase and the fonts have no glyph for one. */
export const TEST_TEAM = 'TEST'

/**
 * Type a name and accept it, the way the remake lets a player do it — the
 * keyboard is `[deliberate]`, the original has only the grid, and the grid is
 * what `nameEntry.spec.ts` covers.
 */
export async function nameTeam(page: Page, name: string): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const hooks = (window as unknown as PowScreens).pow?.nameScreen
          return hooks ? hooks.flipping() : true
        }),
      { message: 'the name screen is still driving in' }
    )
    .toBe(false)
  await page.evaluate((text) => {
    const hooks = (window as unknown as { pow?: { nameScreen?: { type(c: string): void } } }).pow
      ?.nameScreen
    if (!hooks) throw new Error('the name screen is not up')
    for (const character of text) hooks.type(character)
  }, name)
  // ENTER is the last of the three keys past the alphabet's end.
  await page.evaluate(() => {
    const pow = (window as unknown as {
      pow?: { controller: { tap(a: string): void }; nameScreen?: { selected(): number } }
    }).pow
    if (!pow?.nameScreen) throw new Error('the name screen is not up')
    // Walk into the keys' column and down to ENTER.
    for (let i = 0; i < 8 && pow.nameScreen.selected() < 42; i++) pow.controller.tap('menuRight')
    for (let i = 0; i < 3 && pow.nameScreen.selected() !== 44; i++) pow.controller.tap('menuDown')
    pow.controller.tap('menuSelect')
  })
}

/**
 * The training ground — and then the level's opening drop, because CAMP's one
 * marker carries the parachute bit and nothing on the ground moves until its
 * pig is on it (`landed`).
 */
export async function startGame(page: Page): Promise<void> {
  await toBattle(page)
  await landed(page)
  // And past the beat at the top of the turn, which a player presses through
  // — see `beginTurn`. The spec that is about the beat opens the battle by
  // hand instead.
  await beginTurn(page)
}

/** START MISSION on the player screen, which opens on it already lit — and
 * through PLAY TRAINING MISSION?, which a fresh campaign asks first. The
 * suite always answers YES: its battles are the training ground. */
export async function startMission(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const hooks = (window as unknown as PowScreens).pow?.playerScreen
          return hooks ? hooks.flipping() : true
        }),
      { message: 'the player screen is still driving in' }
    )
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()
  await choose(page, 'YES', 'askTraining')
}
