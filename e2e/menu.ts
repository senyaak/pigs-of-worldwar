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
export type Screen = 'menu' | 'multiPlayer'

interface ScreenHooks {
  selected(): number
  labels(): string[]
  values(): (string | null)[]
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
 * One bar up or down. The machine refuses to move again while a bar is still
 * turning, so this presses until the press takes — the same thing a player's
 * finger does, and it fails fast if the bar never moves.
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

/** Light the bar with this label, then choose it. */
export async function choose(
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
  await tap(page, 'menuSelect')
}

/**
 * The training ground — and then the level's opening drop, because CAMP's one
 * marker carries the parachute bit and nothing on the ground moves until its
 * pig is on it (`landed`).
 */
export async function startGame(page: Page): Promise<void> {
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#battle')).toBeVisible()
  await landed(page)
  // And past the beat at the top of the turn, which a player presses through
  // — see `beginTurn`. The spec that is about the beat opens the battle by
  // hand instead.
  await beginTurn(page)
}
