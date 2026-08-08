// ONE running app for the whole suite (docs/testing.md).
//
// Launching Electron per spec meant a dozen windows flashing up and dying
// during a run, and most of those specs were not testing the launch at all —
// they wanted a menu to click from. This fixture keeps a single app alive for
// the worker and hands each spec a page that is already back on the menu.
//
// Specs that ARE about starting or stopping the app — cold start, warm start,
// fullscreen, Exit, closing the window, the --game-dir CLI — still call
// `launchApp` themselves. They are the reason it stays exported.
//
// The fixture is worker-scoped, so it comes up lazily on the first spec that
// asks for it. That matters: the cold-start spec is what creates PHASE_ENV,
// and it must run before anything can launch warm from it.

import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp } from './launch'
import type { Launched } from './launch'
import { tap } from './controller'
import type { Action } from './controller'

/**
 * Every view the app can be showing, and how to leave it. Most have a button;
 * a FRONTEND screen has none — it is drawn on a canvas in the game's own art
 * and is left the way a player leaves it, on the back key.
 */
const EXITS: [string, { click: string } | { key: Action }][] = [
  ['#battle', { click: '#battle-leave' }],
  ['#viewer', { click: '#viewer-back' }],
  ['#archive-view', { click: '#archive-back' }],
  ['#browser', { click: '#browser-menu' }],
  ['#multiplayer', { key: 'menuBack' }]
]

/**
 * Walk back to the main menu from wherever the last spec finished. Each spec
 * tidies up after itself so the next one starts from a known screen — the
 * price of not restarting the app.
 */
export async function toMenu(page: Page): Promise<void> {
  for (let step = 0; step < EXITS.length + 1; step++) {
    if (await page.locator('#menu').isVisible()) return
    for (const [view, exit] of EXITS) {
      if (await page.locator(view).isVisible()) {
        if ('click' in exit) await page.locator(exit.click).click()
        else await tap(page, exit.key)
        break
      }
    }
  }
  await expect(page.locator('#menu'), 'the previous spec left a view nothing can exit').toBeVisible()
}

export interface App {
  page: Page
  /** Renderer errors from THIS spec only — the app outlives the spec, so the
   * shared array is sliced from where the spec started. */
  errors: () => string[]
}

export const test = base.extend<{ app: App }, { shared: Launched }>({
  shared: [
    async ({}, use) => {
      if (!existsSync(PHASE_ENV)) {
        throw new Error(
          'the shared app launches warm from the .env the cold-start spec saves — run the whole suite'
        )
      }
      const launched = await launchApp({ envFile: PHASE_ENV })
      await use(launched)
      await launched.app.close()
    },
    { scope: 'worker' }
  ],
  app: async ({ shared }, use) => {
    await toMenu(shared.page)
    const from = shared.errors.length
    await use({ page: shared.page, errors: () => shared.errors.slice(from) })
    await toMenu(shared.page)
  }
})

export { expect }
