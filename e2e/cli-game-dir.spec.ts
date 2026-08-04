// Standalone spec (no phase): the --game-dir CLI argument.
//
// Runs against fabricated installs, not the real one — what is under test is
// the override logic, not the reading of a real installation (that is phase
// 000's job). An explicit CLI argument must win over .env entirely: a bad
// path fails visibly instead of silently falling back to the saved one.

import { test, expect } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { TMP, launchApp } from './launch'

const ROOT = path.join(TMP, 'e2e-cli')
/** A saved .env pointing at a valid fake install — the fallback to beat. */
const ENV_FILE = path.join(ROOT, '.env')
const ENV_GAME = path.join(ROOT, 'env-game')
const CLI_GAME = path.join(ROOT, 'cli-game')

function fakeInstall(dir: string, marker: string): void {
  mkdirSync(path.join(dir, 'Maps'), { recursive: true })
  writeFileSync(path.join(dir, 'warhogs_.exe'), 'stub')
  writeFileSync(path.join(dir, 'Maps', marker), 'stub-data')
}

test.beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  fakeInstall(ENV_GAME, 'FROMENV.MAD')
  fakeInstall(CLI_GAME, 'FROMCLI.MAD')
  writeFileSync(ENV_FILE, `GAME_DIR=${ENV_GAME}\n`)
})

test.afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

test('a valid --game-dir wins over the .env folder', async () => {
  const launched = await launchApp({
    envFile: ENV_FILE,
    args: [`--game-dir=${CLI_GAME}`]
  })
  try {
    await expect(launched.page.locator('#file-list')).toContainText('Maps/FROMCLI.MAD')
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('a bad --game-dir shows welcome — it does not fall back to .env', async () => {
  const launched = await launchApp({
    envFile: ENV_FILE,
    args: [`--game-dir=${path.join(ROOT, 'nowhere')}`]
  })
  try {
    await expect(launched.page.locator('#select-dir')).toBeVisible()
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})
