// Standalone spec (no phase): a failure reaches the person
// (.claude/rules/failures.md, "Reports it"; the two reporters are named in
// docs/fleet/project.md § Build rules).
//
// It runs against a fabricated install, because a real install fails at none of
// the catches this drives: every failure below is a real one, of a real catch or
// a real { ok: false } answer, and each test provokes it on purpose and says so by
// the text it expects. What needs the campaign screens or a battle walks them on
// the real install.

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { tap } from './controller'
import { GAME_DIR, TMP, launchApp, openAssets } from './launch'
import type { Launched } from './launch'
import { openBattle } from './load'
import { FIRST_ARMY, choose, nameTeam } from './menu'

const ROOT = path.join(TMP, 'e2e-failures')
const ENV_FILE = path.join(ROOT, '.env')
const FAKE_GAME = path.join(ROOT, 'game')
const SAVES = path.join(ROOT, 'saves')
const LOG_DIR = TMP

/** What the fabricated install costs the main menu, which every launch opens. */
const NO_MENU_ART = /^\[failure\] loading the menu art: /
const NO_SOUND_BANK = /^\[failure\] loading the sound bank: /

const line = (page: Page, text: string | RegExp) =>
  page.locator('#failures .failure-line').filter({ hasText: text })

/** The errors a test did not provoke. */
const others = (launched: Launched, ...expected: RegExp[]): string[] =>
  launched.errors.filter((error) => !expected.some((pattern) => pattern.test(error)))

/** Every session log written since `started`. A log is named by the second its
 * session began, so a name does not say which launch wrote it; the time it was
 * written does. */
const sessionLogs = (started: number): string =>
  readdirSync(LOG_DIR)
    .filter((name) => name.startsWith('telemetry-') && statSync(path.join(LOG_DIR, name)).mtimeMs >= started)
    .map((name) => readFileSync(path.join(LOG_DIR, name), 'utf8'))
    .join('\n')

/** NEW GAME, up to the player screen, with the army and team the walk needs. */
async function raiseCampaign(page: Page, team: string): Promise<void> {
  await choose(page, 'ONE PLAYER')
  await expect(page.locator('#oneplayer')).toBeVisible()
  await choose(page, 'NEW GAME', 'onePlayer')
  await expect(page.locator('#team')).toBeVisible()
  await choose(page, FIRST_ARMY, 'teamScreen')
  await expect(page.locator('#name')).toBeVisible()
  await nameTeam(page, team)
  await expect(page.locator('#player')).toBeVisible()
}

/** The campaign's next write: NO to the training question autosaves, and the map
 * opens only once that write has been answered (campaign.skipTutorial). */
async function declineTraining(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { playerScreen?: { flipping(): boolean } } }).pow
          return pow && pow.playerScreen ? pow.playerScreen.flipping() : true
        }),
      { message: 'the player screen is still driving in' }
    )
    .toBe(false)
  await tap(page, 'menuSelect')
  await expect(page.locator('#ask')).toBeVisible()
  await choose(page, 'NO', 'askTraining')
  await expect(page.locator('#pigmap')).toBeVisible()
}

test.beforeAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(path.join(FAKE_GAME, 'Maps'), { recursive: true })
  writeFileSync(path.join(FAKE_GAME, 'warhogs_.exe'), 'stub')
  writeFileSync(ENV_FILE, `GAME_DIR=${FAKE_GAME}\n`)
})

test.afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

test('a renderer failure is on the screen, in the console and goes away on a click', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  try {
    // ui/barScreen.ts: the main menu has no art on this install.
    const report = line(launched.page, 'loading the menu art')
    await expect(report).toBeVisible()
    await expect.poll(() => launched.errors.filter((e) => NO_MENU_ART.test(e)).length).toBeGreaterThan(0)
    // audio/bank.ts: an { ok: false } answer, and the menu goes on silent.
    await expect(line(launched.page, 'loading the sound bank: FESounds/Fesounds.srl')).toBeVisible()
    expect(others(launched, NO_MENU_ART, NO_SOUND_BANK)).toEqual([])

    // The mouse works every overlay (.claude/rules/code.md), and the app goes on
    // underneath: the file list is still reachable.
    await report.click()
    await expect(report).toBeHidden()
    await openAssets(launched.page)
    await expect(launched.page.locator('#file-list')).toContainText('warhogs_.exe')
  } finally {
    await launched.app.close()
  }
})

test('the same failure twice is one line on the strip', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  try {
    await expect(line(launched.page, 'loading the menu art')).toBeVisible()
    await launched.page.evaluate(() => {
      setTimeout(() => {
        throw new Error('the same one')
      })
      setTimeout(() => {
        throw new Error('the same one')
      })
    })
    await expect.poll(() => launched.errors.filter((e) => e.includes('the same one')).length).toBe(2)
    await expect(line(launched.page, 'the same one')).toHaveCount(1)
  } finally {
    await launched.app.close()
  }
})

test('a main-process failure reaches the screen, the console, stderr and the log', async () => {
  // main/saves.ts: a "save" that is a folder is one the list reports and skips.
  rmSync(SAVES, { recursive: true, force: true })
  mkdirSync(path.join(SAVES, 'BROKEN.json'), { recursive: true })
  writeFileSync(path.join(SAVES, 'GOOD.json'), '{}')
  const started = Math.floor(Date.now() / 1000) * 1000
  const launched = await launchApp({ envFile: ENV_FILE, saveDir: SAVES })
  try {
    const listed = await launched.page.evaluate(() => window.api.listSaves())
    expect(listed.ok && listed.saves.map((save) => save.name)).toEqual(['GOOD'])

    const expected = /^\[failure\] reading the save BROKEN: /
    await expect(line(launched.page, 'reading the save BROKEN')).toBeVisible()
    await expect.poll(() => launched.errors.filter((e) => expected.test(e)).length).toBe(1)
    await expect.poll(() => launched.log.filter((l) => expected.test(l)).length).toBe(1)
    expect(others(launched, NO_MENU_ART, NO_SOUND_BANK, expected)).toEqual([])

    expect(sessionLogs(started)).toContain('[failure] reading the save BROKEN: ')
  } finally {
    await launched.app.close()
  }
})

test('what no catch took is on the screen too', async () => {
  const launched = await launchApp({ envFile: ENV_FILE })
  try {
    await expect(line(launched.page, 'loading the menu art')).toBeVisible()
    await launched.page.evaluate(() => {
      void Promise.reject(new Error('nobody waits on this'))
      setTimeout(() => {
        throw new Error('nobody catches this')
      })
    })
    await expect(line(launched.page, 'uncaught: nobody waits on this')).toBeVisible()
    await expect(line(launched.page, 'uncaught: nobody catches this')).toBeVisible()
    // The harness has them as well, from the page's own errors.
    await expect.poll(() => launched.errors.filter((e) => e.includes('nobody')).length).toBe(2)

    // ...and a rejection nobody waits on in the main process (main/failures.ts).
    await launched.app.evaluate(() => {
      void Promise.reject(new Error('nothing waits in main'))
    })
    await expect(line(launched.page, 'a promise nobody was waiting on: nothing waits in main')).toBeVisible()
  } finally {
    await launched.app.close()
  }
})

test('only "the file is not there" is the empty answer about saves', async () => {
  // failures.md: test for exactly ENOENT; anything else goes on.
  const missing = path.join(ROOT, 'no-such-folder')
  const launched = await launchApp({ envFile: ENV_FILE, saveDir: missing })
  try {
    const answers = await launched.page.evaluate(async () => ({
      list: await window.api.listSaves(),
      read: await window.api.readSave('NOBODY'),
      remove: await window.api.deleteSave('NOBODY')
    }))
    expect(answers).toEqual({
      list: { ok: true, saves: [] },
      read: { ok: true, text: null },
      remove: { ok: true }
    })
    // A name that is no name is not "not there".
    const named = await launched.page.evaluate(() => window.api.readSave('../escape'))
    expect(named.ok).toBe(false)
  } finally {
    await launched.app.close()
  }

  // A "folder" that is a file cannot be listed.
  const file = path.join(ROOT, 'a-file')
  writeFileSync(file, 'not a folder')
  const blocked = await launchApp({ envFile: ENV_FILE, saveDir: file })
  try {
    const list = await blocked.page.evaluate(() => window.api.listSaves())
    expect(list.ok).toBe(false)
  } finally {
    await blocked.app.close()
  }

  // A "save" that is a folder can be neither read nor deleted.
  const folders = path.join(ROOT, 'saves-folder')
  mkdirSync(path.join(folders, 'BROKEN.json'), { recursive: true })
  const stuck = await launchApp({ envFile: ENV_FILE, saveDir: folders })
  try {
    const answers = await stuck.page.evaluate(async () => ({
      read: await window.api.readSave('BROKEN'),
      remove: await window.api.deleteSave('BROKEN')
    }))
    expect(answers.read.ok).toBe(false)
    expect(answers.remove.ok).toBe(false)
  } finally {
    await stuck.app.close()
  }
})

test('a save list that could not be read leaves an existing save untouched', async () => {
  // failures.md, "Where a loop meets a bad item": a read whose failure would be
  // taken for "empty" must not lead the next write over what is there.
  test.setTimeout(60_000)
  const realEnv = path.join(ROOT, 'real.env')
  writeFileSync(realEnv, `GAME_DIR=${GAME_DIR}\n`)
  // A "folder" that is a file cannot be listed, so NEW GAME's listing fails.
  const saves = path.join(ROOT, 'saves-unlistable')
  writeFileSync(saves, 'not a folder')
  const launched = await launchApp({ envFile: realEnv, saveDir: saves })
  try {
    const { page } = launched
    await raiseCampaign(page, 'KEPT')

    // The player is told, and plays on.
    const expected = /^\[failure\] listing the saves, so this campaign is not being saved: /
    await expect(line(page, 'listing the saves, so this campaign is not being saved')).toBeVisible()
    await expect.poll(() => launched.errors.filter((e) => expected.test(e)).length).toBe(1)
    expect(others(launched, expected)).toEqual([])

    // The folder is readable again and holds the save the listing could not
    // see, in the first slot, the one an empty listing would pick.
    rmSync(saves)
    mkdirSync(saves)
    const existing = path.join(saves, 'savearmy0.json')
    writeFileSync(existing, 'an existing save')

    await declineTraining(page)

    expect(readFileSync(existing, 'utf8')).toBe('an existing save')
    expect(readdirSync(saves)).toEqual(['savearmy0.json'])
  } finally {
    await launched.app.close()
  }
})

test('a save that will not write reaches the strip, and the game goes on', async () => {
  // src/renderer/src/campaign.ts, `write`; failures.md, "Reports it". What is
  // being lost here is the player's progress.
  test.setTimeout(60_000)
  const realEnv = path.join(ROOT, 'real.env')
  writeFileSync(realEnv, `GAME_DIR=${GAME_DIR}\n`)
  const saves = path.join(ROOT, 'saves-unwritable')
  mkdirSync(saves)
  const launched = await launchApp({ envFile: realEnv, saveDir: saves })
  try {
    const { page } = launched
    await raiseCampaign(page, 'LOST')
    // The first write went through: this slot is the campaign's.
    expect(readdirSync(saves)).toEqual(['savearmy0.json'])
    await expect(page.locator('#failures .failure-line')).toHaveCount(0)

    // A "folder" that is a file cannot take the next write.
    rmSync(saves, { recursive: true })
    writeFileSync(saves, 'not a folder')
    await declineTraining(page)

    const expected = /^\[failure\] saving the campaign, so your progress is not being kept: /
    await expect(line(page, 'saving the campaign, so your progress is not being kept')).toBeVisible()
    await expect.poll(() => launched.errors.filter((e) => expected.test(e)).length).toBe(1)
    expect(others(launched, expected)).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('a game folder that will not do is a Refusal by name, and goes once it is answered', async () => {
  // failures.md, "A refusal is not a failure": shown like one, logged as a
  // refusal, not an error, and a test expects it by name.
  const started = Math.floor(Date.now() / 1000) * 1000
  const launched = await launchApp({ envFile: path.join(ROOT, 'nothing-saved.env') })
  try {
    const { page } = launched
    const said: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'info') said.push(message.text())
    })
    await expect(page.locator('#select-dir')).toBeVisible()

    const refused = page.locator('#failures .failure-line.refusal')
    const nowhere = path.join(ROOT, 'nowhere')
    await page.locator('#path-input').fill(nowhere)
    await page.locator('#use-path').click()
    const text = `using that game folder: Folder does not exist: ${nowhere}`
    await expect(refused).toHaveText(text)
    await expect.poll(() => said).toContain(`[refusal] ${text}`)
    await expect.poll(() => sessionLogs(started)).toContain(`[refusal] ${text}`)
    expect(launched.errors).toEqual([])

    // A second try answers the first, so the strip holds the one that is true now.
    await page.locator('#path-input').fill(ROOT)
    await page.locator('#use-path').click()
    await expect(refused).toHaveText(`using that game folder: warhogs_.exe not found in: ${ROOT}`)
    await expect(page.locator('#select-dir')).toBeVisible()

    await page.locator('#path-input').fill(FAKE_GAME)
    await page.locator('#use-path').click()
    await expect(page.locator('#select-dir')).toBeHidden()
    await expect(refused).toHaveCount(0)
    expect(launched.errors.filter((error) => error.includes('game folder'))).toEqual([])
  } finally {
    await launched.app.close()
  }
})

test('with no game folder yet nothing is reported, and a cold start still has its sounds', async () => {
  // audio/bank.ts, audio/menuClick.ts: asked for before there was a folder, each
  // load failed and the failure was kept, so a first run's battles and pauses were
  // silent until the next launch.
  test.setTimeout(60_000)
  const envFile = path.join(ROOT, 'cold.env')
  const launched = await launchApp({ envFile })
  try {
    const { page } = launched
    await expect(page.locator('#select-dir')).toBeVisible()
    await expect(page.locator('#failures .failure-line')).toHaveCount(0)
    expect(launched.errors).toEqual([])

    await page.locator('#path-input').fill(GAME_DIR)
    await page.locator('#use-path').click()
    await expect(page.locator('#menu')).toBeVisible()
    await openBattle(page, 'CAMP')
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { pauseClickLoaded?(): boolean } }).pow
          return pow && pow.pauseClickLoaded ? pow.pauseClickLoaded() : false
        })
      )
      .toBe(true)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const pow = (window as unknown as { pow?: { sfx?: { list(): unknown[] } } }).pow
          return pow && pow.sfx ? pow.sfx.list().length : 0
        })
      )
      .toBeGreaterThan(0)
    expect(launched.errors).toEqual([])
  } finally {
    await launched.app.close()
  }
})
