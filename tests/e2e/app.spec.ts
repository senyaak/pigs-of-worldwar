import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('shows welcome screen when game dir is not set', async () => {
  const emptyDir = mkdtempSync(path.join(tmpdir(), 'pow-empty-'))
  const app = await electron.launch({ args: ['.', `--game-dir=${emptyDir}`] })
  const window = await app.firstWindow()

  await expect(window.locator('h1')).toHaveText('Pigs of Worldwar')
  await expect(window.locator('#select-dir')).toBeVisible()

  await app.close()
})

test('lists game files when a valid game dir is passed via CLI', async () => {
  const gameDir = mkdtempSync(path.join(tmpdir(), 'pow-game-'))
  writeFileSync(path.join(gameDir, 'warhogs_.exe'), 'stub')
  mkdirSync(path.join(gameDir, 'Maps'))
  writeFileSync(path.join(gameDir, 'Maps', 'TEST.MAD'), 'stub-data')

  const app = await electron.launch({ args: ['.', `--game-dir=${gameDir}`] })
  const window = await app.firstWindow()

  await expect(window.locator('#select-dir')).toBeHidden()
  await expect(window.locator('.file-row')).toHaveCount(2)
  await expect(window.locator('#file-list')).toContainText('warhogs_.exe')
  await expect(window.locator('#file-list')).toContainText('Maps/TEST.MAD')

  await app.close()
})
