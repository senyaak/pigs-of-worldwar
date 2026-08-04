// PHASE 001 — inside the archives: MAD/MTD files open into their entries.
//
// Starts from what 000 left: a .env pointing at the real game. Both container
// layouts are exercised on files whose contents are known and stable
// (docs/formats.md, "Verified"): Chars/british.mad is a named archive of 81
// model entries, Chars/mcap.mad is the one raw archive the game ships — 93
// unnamed animations whose every length divides by the 272-byte keyframe.

import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'

import { PHASE_ENV, launchApp } from './launch'
import type { Launched } from './launch'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 001 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

/** Warm-start into the file list and open one archive by its exact path. */
async function openArchive(launched: Launched, relPath: string): Promise<void> {
  const { page } = launched
  await page.locator('#filter').fill(relPath)
  await expect(page.locator('#file-list .file-row')).toHaveCount(1)
  await page.locator('#file-list .file-row').click()
  await expect(launched.page.locator('#archive-view')).toBeVisible()
}

test('a named archive: british.mad opens into its 81 model entries', async () => {
  const launched = await launchApp({ envFile: PHASE_ENV })
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
  const launched = await launchApp({ envFile: PHASE_ENV })
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
