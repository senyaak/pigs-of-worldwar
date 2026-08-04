// Driving the game the way a player does — through the app's own controller
// (src/renderer/src/input/controller.ts), exposed as `window.pow.controller`.
//
// Specs call these instead of synthesising key events: a test then exercises
// the real control path, and a broken keybinding or a controller regression
// shows up as a failing test rather than a passing one that drove a private
// back door (docs/testing.md).

import type { Page } from '@playwright/test'

export type Action = 'walkForward' | 'walkBack' | 'turnLeft' | 'turnRight' | 'jump' | 'endTurn'

const call = (page: Page, method: string, action: Action): Promise<void> =>
  page.evaluate(
    (o) => {
      const pow = (window as unknown as { pow?: { controller: Record<string, (a: string) => void> } }).pow
      if (!pow?.controller) throw new Error('window.pow.controller is missing — is the app built?')
      pow.controller[o.method](o.action)
    },
    { method, action }
  )

export const press = (page: Page, action: Action): Promise<void> => call(page, 'press', action)
export const release = (page: Page, action: Action): Promise<void> => call(page, 'release', action)
export const tap = (page: Page, action: Action): Promise<void> => call(page, 'tap', action)

/** Hold an action for `ms`, then release — one player "stroke". */
export async function hold(page: Page, action: Action, ms: number): Promise<void> {
  await press(page, action)
  try {
    await page.waitForTimeout(ms)
  } finally {
    await release(page, action)
  }
}

/** Release everything, so one spec's held keys never leak into the next. */
export const releaseAll = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { controller: { releaseAll(): void } } }).pow
    pow?.controller.releaseAll()
  })

/** Where the acting pig is, straight from the scene (three/battle.ts). */
export const debugState = (
  page: Page
): Promise<{ x: number; z: number; heading: number; nodeY: number }> =>
  page.evaluate(() => {
    const pow = (
      window as unknown as {
        pow?: {
          debug?: {
            currentPig(): { x: number; z: number }
            currentHeading(): number
            currentNodeY(): number
          }
        }
      }
    ).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    const at = pow.debug.currentPig()
    return { x: at.x, z: at.z, heading: pow.debug.currentHeading(), nodeY: pow.debug.currentNodeY() }
  })

// The renderer declares `window.pow` too (input/controller.ts). These specs
// are compiled in the same project, so re-declaring it would clash — the
// evaluate() callbacks above reach it through a local shape instead.
