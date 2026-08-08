// Driving the game the way a player does — through the app's own controller
// (src/renderer/src/input/controller.ts), exposed as `window.pow.controller`.
//
// Specs call these instead of synthesising key events: a test then exercises
// the real control path, and a broken keybinding or a controller regression
// shows up as a failing test rather than a passing one that drove a private
// back door (docs/testing.md).

import type { Page } from '@playwright/test'

export type Action =
  | 'walkForward'
  | 'walkBack'
  | 'turnLeft'
  | 'turnRight'
  | 'jump'
  | 'fire'
  | 'aimMode'
  | 'aimUp'
  | 'aimDown'
  | 'skills'
  | 'endTurn'
  | 'menuUp'
  | 'menuDown'
  | 'menuLeft'
  | 'menuRight'
  | 'menuSelect'
  | 'menuBack'
  | 'assets'

/**
 * Drive one method, then WAIT OUT A FRAME before handing control back.
 *
 * The battle reads its controls once a frame now (`input/battleInput.ts`), so a
 * press that returned immediately would let the spec ask the game about a key it
 * had not looked at yet — `chooseSkill` is the sharp case, since it presses and
 * then reads `holding` on the very next round trip. Two frames rather than one
 * because the scene's loop queues its next callback at the top of the current
 * one, so the first frame we see may already be under way.
 */
const call = (page: Page, method: string, action: Action): Promise<void> =>
  page.evaluate(
    async (o) => {
      const pow = (window as unknown as { pow?: { controller: Record<string, (a: string) => void> } }).pow
      if (!pow?.controller) throw new Error('window.pow.controller is missing — is the app built?')
      pow.controller[o.method](o.action)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
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

export interface HudState {
  turn: number
  side: string
  pig: string
  health: number
  seconds: number
  swimming: boolean
  /** Seconds the acting pig has stood still: what the name plates wait for. */
  still: number
  /** Whether the turn has not begun yet (lib/game/game.ts). */
  starting: boolean
}

/**
 * What the dashboard is saying. It says it in brass and in the game's own
 * letters, which no assertion can read, so the STATE comes from here and the
 * pixels are asserted separately (002/hud.spec.ts).
 */
export const hud = (page: Page): Promise<HudState> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: { hud(): HudState } } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    return pow.debug.hud()
  })

/**
 * Watch the acting pig for up to `ms` and return the highest it got —
 * game space is Y-down, so the smallest nodeY — resolving the moment it
 * passes `above`.
 *
 * Sampling happens IN THE PAGE, every animation frame. Polling from the test
 * would miss it: a hop lasts a third of a second and `expect.poll` backs off
 * to one sample a second. Resolving early matters just as much — the caller
 * usually wants to let go of the controls while the pig is still in the air.
 */
export const peakNodeY = (page: Page, above: number, ms: number): Promise<number> =>
  page.evaluate(
    (o) => {
      const pow = (window as unknown as { pow?: { debug?: { currentNodeY(): number } } }).pow
      if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
      return new Promise<number>((resolve) => {
        let peak = Infinity
        const deadline = performance.now() + o.ms
        const sample = (): void => {
          peak = Math.min(peak, pow.debug!.currentNodeY())
          if (peak < o.above || performance.now() >= deadline) resolve(peak)
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    },
    { above, ms }
  )

/**
 * Wait out the level's opening drop, and resolve the frame it ends.
 *
 * A map whose squad parachutes in spends about five seconds with nobody on
 * the ground and the turn clock stopped (lib/game/parachute.ts), so a spec
 * that starts driving before this has resolved is driving nothing. Every
 * entry into a battle goes through here — `startGame` and `swapMap` alike.
 *
 * Watched IN THE PAGE, every animation frame, for the same reason `peakNodeY`
 * is: polling from the test backs off to a sample a second, and this wants to
 * hand control back the moment the last pig stands up. `ms` is a backstop —
 * it rejects rather than carrying on, so a drop that never lands fails the
 * spec instead of quietly making it flaky.
 */
export const landed = (page: Page, ms = 30_000): Promise<void> =>
  page.evaluate(
    (limit) => {
      const pow = (window as unknown as { pow?: { debug?: { dropIn(): { running: boolean } } } }).pow
      if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
      return new Promise<void>((resolve, reject) => {
        const deadline = performance.now() + limit
        const sample = (): void => {
          if (!pow.debug!.dropIn().running) resolve()
          else if (performance.now() >= deadline) reject(new Error('the drop-in never landed'))
          else requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    },
    ms
  )

/**
 * The console map selector (`pow.swapMap`), with the new level's drop waited
 * out — a swap restarts the battle, so it opens the same way New Game does.
 * A refused swap leaves the running battle alone and has nothing to wait for.
 */
export async function swapMap(page: Page, name?: string): Promise<boolean> {
  const swapped = await page.evaluate((wanted) => {
    const pow = (window as unknown as { pow?: { swapMap?(name?: string): Promise<boolean> } }).pow
    if (!pow?.swapMap) throw new Error('pow.swapMap is missing — is the battle module loaded?')
    return pow.swapMap(wanted)
  }, name)
  if (swapped) {
    await landed(page)
    await beginTurn(page)
  }
  return swapped
}

/**
 * Start the turn now, skipping the beat the original waits out at the top of
 * it (lib/game/game.ts). A player skips it by pressing anything; a spec
 * cannot, because every key also drives the pig — and ten seconds a turn,
 * over a suite this size, is a minute and a half of watching nothing.
 *
 * The spec that is ABOUT the beat does not use this (002/battle.spec.ts).
 */
export const beginTurn = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: { beginTurn(): void } } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    pow.debug.beginTurn()
  })

/** Put the acting pig somewhere specific, facing somewhere specific. Not a
 * player move — the scene exposes it purely so a spec can set up a situation
 * (three/battle.ts). */
export const warp = (page: Page, x: number, z: number, heading: number): Promise<void> =>
  page.evaluate(
    (at) => {
      const pow = (
        window as unknown as {
          pow?: { debug?: { warp(x: number, z: number, heading: number): void } }
        }
      ).pow
      if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
      pow.debug.warp(at.x, at.z, at.heading)
    },
    { x, z, heading }
  )

/** What the acting pig has chosen out of the skill menu, or null. */
export const holding = (page: Page): Promise<number | null> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: { holding(): number | null } } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up — window.pow.debug is missing')
    return pow.debug.holding()
  })

/**
 * Take a particular SKILL in hand through the real menu.
 *
 * By skill and not by cell, deliberately. The menu's cells hold whatever the
 * pig is carrying plus SKIP TURN, so which one a fixed number of cursor moves
 * lands on depends on what has been collected — and a spec that assumes a
 * position passes alone and fails in a full run, which is exactly what
 * happened. This opens the menu, takes what is under the cursor, and if it is
 * the wrong thing, moves on and tries again.
 */
export async function chooseSkill(page: Page, skill: number, cells = 12): Promise<boolean> {
  await press(page, 'skills')
  for (let step = 0; step < cells; step++) {
    await press(page, 'jump')
    if ((await holding(page)) === skill) return true
    await press(page, 'skills')
    await tap(page, 'turnRight')
  }
  return false
}

// The renderer declares `window.pow` too (input/controller.ts). These specs
// are compiled in the same project, so re-declaring it would clash — the
// evaluate() callbacks above reach it through a local shape instead.

/**
 * End the acting pig's turn the way a player must: SKIP TURN is a SKILL, taken in
 * hand and then USED with the fire key. There is no key that ends a turn on its
 * own any more — play asked for Enter gone and for the skill to apply on FIRE
 * rather than on being chosen (`lib/game/controls.ts`).
 *
 * The `endTurn` action still exists as the dashboard button's own path, and all it
 * does is put the skill in hand; the press-and-release after it is what applies it.
 */
export async function skipTurn(page: Page): Promise<void> {
  await tap(page, 'endTurn')
  await press(page, 'fire')
  await release(page, 'fire')
}
