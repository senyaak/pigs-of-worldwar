// PHASE 000 — the foundation, all of it: everything structural the engine
// needs before anything real happens. Launch from nothing, point the app at
// the game, see its files, open both kinds of archive. The app's features
// don't care about any of this — which is exactly why it is all phase zero;
// the first engine milestone (a rendered scene) is phase 001.
//
// The folder is set by pasting the path into the welcome screen's text input —
// the picker button opens a native dialog no test can drive (docs/testing.md).
//
// The suite runs against the REAL game folder (read-only): the point of the
// app is reading a real installation, and a fabricated one would only prove
// the app can read what the test fabricated. Counts are asserted as floors
// where savegame churn could move them, and exactly where they cannot: the
// archive numbers come from docs/formats.md ("Verified") — british.mad is a
// named archive of 81 model entries, mcap.mad the game's one raw archive,
// 93 unnamed animations.

import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR, PHASE_ENV, TMP, launchApp } from '../launch'
import type { Launched } from '../launch'

/** The phase chain's .env — created by the app HERE, consumed by every later
 * phase (docs/testing.md): this spec runs first and leaves a located game. */
const ENV_FILE = PHASE_ENV

test.beforeAll(() => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    throw new Error(
      `the suite needs a real Hogs of War install — no warhogs_.exe in ${GAME_DIR}` +
        ' (set POW_GAME_DIR if the game lives elsewhere)'
    )
  }
  rmSync(path.dirname(ENV_FILE), { recursive: true, force: true })
  mkdirSync(path.dirname(ENV_FILE), { recursive: true })
})

test('cold start: a pasted path takes the app from welcome to the file list', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  const { page } = launched
  try {
    // Nothing saved, nothing passed — the welcome screen it is.
    await expect(page.locator('h1')).toHaveText('Pigs of Worldwar')
    await expect(page.locator('#select-dir')).toBeVisible()

    // A wrong path is refused with a reason, and the app stays on welcome.
    await page.locator('#path-input').fill(path.join(TMP, 'not-a-game'))
    await page.locator('#use-path').click()
    await expect(page.locator('#path-error')).toContainText('not-a-game')
    await expect(page.locator('#select-dir')).toBeVisible()

    // The real path is accepted and the whole installation is listed.
    await page.locator('#path-input').fill(GAME_DIR)
    await page.locator('#use-path').click()
    await expect(page.locator('#select-dir')).toBeHidden()
    await expect(page.locator('#game-path')).toHaveText(GAME_DIR)

    // The install holds ~2700 files; a floor of 2000 survives savegame churn.
    await expect(page.locator('#stats')).toHaveText(/^\d+ files/)
    const stats = (await page.locator('#stats').textContent()) ?? ''
    expect(parseInt(stats, 10), `file count from "${stats}"`).toBeGreaterThan(2000)

    // Known files by name — the executable and a map archive every install has.
    await page.locator('#filter').fill('warhogs_.exe')
    await expect(page.locator('#file-list .file-row')).toHaveCount(1)
    await page.locator('#filter').fill('Maps/ARCHI')
    await expect(page.locator('#file-list')).toContainText('Maps/ARCHI.MAD')

    // All 96 map archives; a floor of 90 for the same reason as above.
    await page.locator('#filter').fill('.MAD')
    expect(await page.locator('#file-list .file-row').count()).toBeGreaterThan(90)

    // The choice was saved where POW_ENV_FILE pointed.
    expect(readFileSync(ENV_FILE, 'utf8')).toContain(`GAME_DIR=${GAME_DIR}`)

    expect(launched.errors, 'no renderer errors during the whole flow').toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('warm start: the saved .env opens the file list with no questions', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  const { page } = launched
  try {
    await expect(page.locator('#select-dir')).toBeHidden()
    await expect(page.locator('#game-path')).toHaveText(GAME_DIR)
    await expect(page.locator('#stats')).toContainText('files')
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

/** Warm-start into the file list and open one archive by its exact path. */
export async function openArchive(launched: Launched, relPath: string): Promise<void> {
  const { page } = launched
  await page.locator('#filter').fill(relPath)
  await expect(page.locator('#file-list .file-row')).toHaveCount(1)
  await page.locator('#file-list .file-row').click()
  await expect(page.locator('#archive-view')).toBeVisible()
}

test('a named archive: british.mad opens into its 81 model entries', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  const { page } = launched
  try {
    await openArchive(launched, 'Chars/british.mad')
    await expect(page.locator('#archive-title')).toHaveText('Chars/british.mad — 81 entries (named)')

    // The triples a model is made of, by name — first and last of the table.
    await expect(page.locator('#archive-list')).toContainText('pcace_hi.VTX')
    await expect(page.locator('#archive-list')).toContainText('pcace_hi.NO2')
    await expect(page.locator('#archive-list')).toContainText('pcace_hi.FAC')
    await expect(page.locator('#archive-list')).toContainText('sp_hi.FAC')
    await expect(page.locator('#archive-list .file-row')).toHaveCount(81)

    // Back returns to the same filtered list, still one row.
    await page.locator('#archive-back').click()
    await expect(page.locator('#archive-view')).toBeHidden()
    await expect(page.locator('#file-list .file-row')).toHaveCount(1)

    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('the raw archive: mcap.mad opens into 93 unnamed animations', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  const { page } = launched
  try {
    await openArchive(launched, 'Chars/mcap.mad')
    await expect(page.locator('#archive-title')).toHaveText('Chars/mcap.mad — 93 entries (raw)')
    await expect(page.locator('#archive-list')).toContainText('#000')
    await expect(page.locator('#archive-list')).toContainText('#092')
    await expect(page.locator('#archive-list .file-row')).toHaveCount(93)
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})
