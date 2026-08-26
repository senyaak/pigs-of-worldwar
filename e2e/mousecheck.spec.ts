// STANDALONE — the MOUSE drives the campaign screens end to end, with real
// pointer events through the un-letterboxing and the click queue
// (ui/mouseRows.ts): a menu bar, the squad's REPLAY MISSIONS, a LOAD slot.
//
// Each leg pins a bug play found on 2026-08-26, all three invisible to the
// pow.* state probes because they lived in geometry and in tick order:
// - the squad's option plates are drawn with art TALLER than the rows'
//   pitch, so START's hit box swallowed REPLAY MISSIONS whole and the
//   pointer could never light row 9 (playerScreen.ts clamps the band);
// - a click chosen INSIDE `advance` was undone by the same tick's
//   settled-screen latch — `phase = 'here'` ran right after `choose()` set
//   'leaving', and the LOAD screen's click died without a trace
//   (loadScreen/missionSelect/askTraining now latch from 'arriving' only);
// - and the whole click queue only matters if a parked pointer wakes a
//   screen at all, which is the menu leg.
//
// Standalone with its own env AND ITS OWN SAVE DIR: the campaign it names
// must never land in the shared _tmp/saves, where load.spec asserts a fresh
// one.

import path from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

import { test, expect } from '@playwright/test'

import { GAME_DIR, launchApp, TMP } from './launch'
import { choose, FIRST_ARMY, nameTeam } from './menu'

const ENV_DIR = path.join(TMP, 'mousecheck')

test('the mouse drives menu, squad options and the load slots', async () => {
  test.setTimeout(180_000)
  mkdirSync(ENV_DIR, { recursive: true })
  const envFile = path.join(ENV_DIR, '.env')
  writeFileSync(envFile, '')
  const { app, page, errors } = await launchApp({ envFile, saveDir: path.join(ENV_DIR, 'saves') })
  try {
    await page.locator('#path-input').fill(GAME_DIR)
    await page.locator('#use-path').click()
    await expect(page.locator('#menu')).toBeVisible()

    const point = (canvas: string, ax: number, ay: number): Promise<{ x: number; y: number }> =>
      page.evaluate(
        ([id, x, y]) => {
          const c = document.getElementById(id as string) as HTMLCanvasElement
          const r = c.getBoundingClientRect()
          const s = Math.min(r.width / c.width, r.height / c.height)
          return {
            x: r.left + (r.width - c.width * s) / 2 + (x as number) * s,
            y: r.top + (r.height - c.height * s) / 2 + (y as number) * s
          }
        },
        [canvas, ax, ay]
      )

    // 1. The MENU by mouse alone: ONE PLAYER is the lit top bar.
    await page.waitForTimeout(2500) // the machine drives in
    const bar = await point('menu-screen', 364, 192)
    await page.mouse.move(bar.x - 3, bar.y)
    await page.mouse.move(bar.x, bar.y)
    await page.mouse.click(bar.x, bar.y)
    await expect(page.locator('#oneplayer')).toBeVisible({ timeout: 10_000 })

    // 2. To the squad screen by keys.
    await choose(page, 'NEW GAME', 'onePlayer')
    await expect(page.locator('#team')).toBeVisible()
    await choose(page, FIRST_ARMY, 'teamScreen')
    await nameTeam(page, 'MOUSE')
    await expect(page.locator('#player')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } }).pow
              ?.playerScreen?.flipping() ?? true
        )
      )
      .toBe(false)

    // 3. REPLAY MISSIONS: hover lights row 9, the click opens the list.
    const missions = await point('player-screen', 528, 433)
    await page.mouse.move(missions.x - 3, missions.y)
    await page.mouse.move(missions.x, missions.y)
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { pow: { playerScreen: { selected(): number } } }).pow.playerScreen.selected()
        )
      )
      .toBe(9)
    await page.mouse.click(missions.x, missions.y)
    await expect(page.locator('#missions')).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('#player')).toBeVisible({ timeout: 10_000 })

    // 4. The LOAD screen: the click on the lit occupied slot loads it.
    for (let hop = 0; hop < 6; hop++) {
      if (await page.locator('#menu').isVisible()) break
      await page.keyboard.press('Escape')
      await page.waitForTimeout(900)
    }
    await expect(page.locator('#menu')).toBeVisible()
    await choose(page, 'ONE PLAYER')
    await expect(page.locator('#oneplayer')).toBeVisible()
    await choose(page, 'LOAD GAME', 'onePlayer')
    await expect(page.locator('#load')).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { pow?: { loadScreen?: { flipping(): boolean } } }).pow
              ?.loadScreen?.flipping() ?? true
        )
      )
      .toBe(false)
    const slot = await point('load-screen', 234, 120)
    await page.mouse.move(slot.x - 3, slot.y)
    await page.mouse.move(slot.x, slot.y)
    await page.mouse.click(slot.x, slot.y)
    await expect(page.locator('#player')).toBeVisible({ timeout: 15_000 })

    expect(errors).toEqual([])
  } finally {
    await app.close()
    rmSync(ENV_DIR, { recursive: true, force: true })
  }
})
