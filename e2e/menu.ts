// Driving the main menu the way a player does.
//
// The frontend is drawn on a canvas in the game's own art, so there is no
// button to click: a spec moves the lit bar with the controller, exactly as
// the keyboard does, and reads the screen back through `window.pow.menu`.

import type { Page } from '@playwright/test'

import { tap } from './controller'

interface MenuHooks {
  selected(): number
  labels(): string[]
}

/** Which bar is lit. */
export const selection = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { menu?: MenuHooks } }).pow
    if (!pow?.menu) throw new Error('the menu is not up — window.pow.menu is missing')
    return pow.menu.selected()
  })

/** What the bars say, in order, straight out of fetext. */
export const labels = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { menu?: MenuHooks } }).pow
    if (!pow?.menu) throw new Error('the menu is not up — window.pow.menu is missing')
    return pow.menu.labels()
  })

/**
 * One bar up or down. The machine refuses to move again while a bar is still
 * turning, so this presses until the press takes — the same thing a player's
 * finger does, and it fails fast if the bar never moves.
 */
export async function nudge(page: Page, action: 'menuUp' | 'menuDown'): Promise<void> {
  const from = await selection(page)
  await page.waitForFunction(
    (o) => {
      const pow = (window as unknown as {
        pow?: { menu?: MenuHooks; controller: { tap(a: string): void } }
      }).pow
      if (!pow?.menu) throw new Error('the menu is not up — window.pow.menu is missing')
      if (pow.menu.selected() !== o.from) return true
      pow.controller.tap(o.action)
      return false
    },
    { action, from },
    { polling: 50 }
  )
}

/** Light the bar with this label, then choose it. */
export async function choose(page: Page, label: string): Promise<void> {
  const bars = await labels(page)
  const wanted = bars.indexOf(label)
  if (wanted < 0) throw new Error(`no menu bar says ${label} — the menu has ${bars.join(', ')}`)
  for (let at = await selection(page); at !== wanted; at = await selection(page)) {
    await nudge(page, wanted > at ? 'menuDown' : 'menuUp')
  }
  await tap(page, 'menuSelect')
}

/** The one bar that leads anywhere yet: the training ground. */
export const startGame = (page: Page): Promise<void> => choose(page, 'ONE PLAYER')
