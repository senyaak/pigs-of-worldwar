// PHASE 002 — the game's own sounds.
//
// The install ships two numbered banks (`.srl`, plain CRLF text): 99 effects
// for the battle and 27 for the frontend. The exe refers to a sound by
// INDEX, so the bank is what will turn any decoded call site into a file —
// and meanwhile it is what the remake plays by name.
//
// WHICH sound belongs to which moment is not decoded for all of the pig
// noises. The spec pins the plumbing — a bank that parses, a sound that
// reaches the mixer when the pig does the thing — and leaves the choice of
// sound to play, where it can be corrected. The FOOTSTEPS are the exception:
// the exe's own switch on the ground picks those, and the spec holds it to it.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { parseSrl } from '../../src/lib/formats/srl'
import {
  BATTLE_SOUNDS,
  STEP_UNDERLAY,
  SURFACE_DEFAULT,
  SURFACE_SOUNDS
} from '../../src/renderer/src/audio/battle'
import { press, release, tap, warp } from '../controller'
import { startGame } from '../menu'

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
  for (const cue of Object.values(BATTLE_SOUNDS)) expect(names.has(cue.sound), cue.sound).toBe(true)
  // …the footsteps included, which are asked for by the GROUND rather than by
  // the moment (audio/battle.ts).
  for (const sound of [...Object.values(SURFACE_SOUNDS), SURFACE_DEFAULT, STEP_UNDERLAY])
    expect(names.has(sound), sound).toBe(true)

  // The night bank ships too and is the same list — the PC release has no
  // separate night set, whatever the two file names promise.
  expect(bank('Audio/sfxnight.srl').entries).toEqual(battle.entries)

  const frontend = bank('FESounds/Fesounds.srl')
  expect(frontend.entries).toHaveLength(27)
  expect(frontend.entries.map((entry) => entry.name)).toContain('CLICK5')
})

test('the pig is heard jumping and landing', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const heard = (): Promise<string[]> => page.evaluate(() => window.pow!.debug!.sounds())
  // The bank loads beside the scene, so the first sounds may be silence.
  await expect.poll(async () => (await heard()) !== null).toBe(true)

  // Somewhere flat, so the jump is a jump and not a fall.
  await warp(page, -4352, 8448, 0)

  // From a BASELINE, not against the whole list: the level opens with a
  // parachute drop that has already made its own noises (002/parachute), and
  // `arrayContaining` over everything heard so far would be satisfied by the
  // drop's landing before this jump had even come down.
  const beforeJump = (await heard()).length
  await tap(page, 'jump')
  await expect
    .poll(async () => (await heard()).slice(beforeJump), { message: 'the jump and the landing' })
    .toEqual([BATTLE_SOUNDS.jump.sound, BATTLE_SOUNDS.land.sound])

  expect(app.errors()).toEqual([])
})

test('a walking pig sounds like the ground it is on', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const heard = (): Promise<string[]> => page.evaluate(() => window.pow!.debug!.sounds())
  await expect.poll(async () => (await heard()) !== null).toBe(true)

  await warp(page, -4352, 8448, 0)
  // What is under the pig right now decides which of the thirteen FT_ files it
  // plays — the exe's own twelve-way switch on the tile's terrain type
  // (audio/battle.ts, `SURFACE_SOUNDS`).
  const surface = await page.evaluate(() => window.pow!.debug!.surface())
  const material = SURFACE_SOUNDS[surface] ?? SURFACE_DEFAULT

  // TURNING on the spot rather than walking off: clip 4 carries two footfalls
  // a lap the way the run cycle does (lib/game/footsteps.ts), and a pig that
  // stays on its own tile cannot walk onto a different material — or, at this
  // end of CAMP, onto the climbing tiles a few steps north, which play no
  // footstep at all because clip 11 carries none.
  const before = (await heard()).length
  await press(page, 'turnLeft')
  await page.waitForTimeout(900)
  await release(page, 'turnLeft')
  const steps = (await heard()).slice(before)

  // Nothing else fires while a pig merely turns, so everything heard is a hoof.
  expect(steps.length, 'the hooves').toBeGreaterThan(2)
  // Each one is the material over the exe's own sand layer, in that order.
  for (let i = 0; i < steps.length; i += 2) {
    expect(steps[i]).toBe(material)
    expect(steps[i + 1]).toBe(STEP_UNDERLAY)
  }

  expect(app.errors()).toEqual([])
})
