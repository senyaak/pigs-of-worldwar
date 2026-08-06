// PHASE 002 — the game's own sounds.
//
// The install ships two numbered banks (`.srl`, plain CRLF text): 99 effects
// for the battle and 27 for the frontend. The exe refers to a sound by
// INDEX, so the bank is what will turn any decoded call site into a file —
// and meanwhile it is what the remake plays by name.
//
// WHICH sound belongs to which moment is not decoded for the pig noises.
// The spec pins the plumbing — a bank that parses, a sound that reaches the
// mixer when the pig does the thing — and leaves the choice of sound to
// play, where it can be corrected.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { parseSrl } from '../../src/lib/formats/srl'
import { BATTLE_SOUNDS } from '../../src/renderer/src/audio/battle'
import { press, release, tap, warp } from '../controller'

const bank = (relPath: string): ReturnType<typeof parseSrl> =>
  parseSrl(readFileSync(path.join(GAME_DIR, relPath)))

test('the sound banks are numbered lists of files', () => {
  const battle = bank('Audio/sfxday.srl')
  expect(battle.name).toBe('AUDIO\\SFXDAY')
  expect(battle.entries).toHaveLength(99)
  // The ids are the file's own, and they run without a gap.
  expect(battle.entries.map((entry) => entry.id)).toEqual(
    battle.entries.map((_, index) => index)
  )

  // The thirteen footsteps sit together, one per surface material.
  const steps = battle.entries.filter((entry) => entry.name.startsWith('FT_'))
  expect(steps.map((entry) => entry.name)).toEqual([
    'FT_GRASS',
    'FT_ICE',
    'FT_LAVA',
    'FT_METAL',
    'FT_MUD',
    'FT_QUAG',
    'FT_ROCK',
    'FT_SAND',
    'FT_SNOW',
    'FT_STONE',
    'FT_SWIM',
    'FT_WATER',
    'FT_WOOD'
  ])
  expect(steps.map((entry) => entry.id)).toEqual([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26])

  // Everything the battle asks for by name is really in there.
  const names = new Set(battle.entries.map((entry) => entry.name))
  for (const sound of Object.values(BATTLE_SOUNDS)) expect(names.has(sound), sound).toBe(true)

  // The night bank ships too and is the same list — the PC release has no
  // separate night set, whatever the two file names promise.
  expect(bank('Audio/sfxnight.srl').entries).toEqual(battle.entries)

  const frontend = bank('FESounds/Fesounds.srl')
  expect(frontend.entries).toHaveLength(27)
  expect(frontend.entries.map((entry) => entry.name)).toContain('CLICK5')
})

test('the pig is heard jumping and landing', async ({ app }) => {
  const { page } = app
  await page.locator('#menu-new-game').click()
  await expect(page.locator('#battle')).toBeVisible()

  const heard = (): Promise<string[]> => page.evaluate(() => window.pow!.debug!.sounds())
  // The bank loads beside the scene, so the first sounds may be silence.
  await expect.poll(async () => (await heard()) !== null).toBe(true)

  // Somewhere flat, so the jump is a jump and not a fall.
  await warp(page, -4352, 8448, 0)
  await tap(page, 'jump')
  await expect
    .poll(heard, { message: 'the jump and the landing' })
    .toEqual(expect.arrayContaining([BATTLE_SOUNDS.jump, BATTLE_SOUNDS.land]))

  // And walking on flat dry ground says nothing — footsteps are not wired
  // yet, and nothing else may fire on every frame.
  const before = (await heard()).length
  await press(page, 'walkForward')
  await page.waitForTimeout(700)
  await release(page, 'walkForward')
  expect((await heard()).length).toBe(before)

  expect(app.errors()).toEqual([])
})
