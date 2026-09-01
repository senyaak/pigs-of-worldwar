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
import { WOOD } from '../../src/lib/game/underfoot'
import {
  beginTurn,
  debugState,
  hold,
  press,
  release,
  releaseAll,
  skipTurn,
  swapMap,
  tap,
  warp
} from '../controller'
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
  //
  // The turn's own grunt has to have landed FIRST. It goes down as the GET
  // READY card does and it WAITS for the bank if the bank is still loading
  // (audio/battleSound.ts), so on a slow load it arrives after the warp and
  // lands inside the slice below.
  await expect.poll(async () => (await heard()).includes(BATTLE_SOUNDS.ready.sound)).toBe(true)
  const beforeJump = (await heard()).length
  await tap(page, 'jump')
  // …and the grunt is taken OUT of the slice as well as waited for, because
  // waiting is not enough: the TURN CLOCK is real time, and a full-suite run
  // under load can spend long enough between the battle opening and this jump
  // that the turn hands over — which starts the next pig's turn and grunts
  // again, inside the slice. Seen once in three full runs, on a slice that came
  // back `[P_HMMM, jump, land]`: the jump and the landing were both there, in
  // order, with a turn boundary sitting in front of them. This spec is about
  // the two, so the third is filtered rather than raced.
  await expect
    .poll(
      async () =>
        (await heard()).slice(beforeJump).filter((sound) => sound !== BATTLE_SOUNDS.ready.sound),
      { message: 'the jump and the landing' }
    )
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
  // The turn's own grunt (P_HMMM) goes down as the GET READY card does, and it
  // WAITS for the bank if the bank is still loading (audio/battleSound.ts) —
  // so it can land after the warp. Wait for it rather than slicing over it, or
  // the footsteps below are read one out of step.
  await expect.poll(async () => (await heard()).includes('P_HMMM')).toBe(true)
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

test('…and on a BRIDGE it sounds like the bridge, not like the ditch', async ({ app }) => {
  // The exe cannot do this: its footstep reads the pig's TILE and nothing else
  // (0x475010), and no shipped map carries a tile of type 3 — over all 61 of
  // them the WOOD and METAL arms of its own switch are unreachable, and
  // `FT_WOOD.wav` ships unplayed. So crossing CAMP's deck the original hears
  // the ditch, and ISLAND's spans splash. This is the remake's line
  // (lib/game/underfoot.ts), and it is one table to correct in play.
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const heard = (): Promise<string[]> => page.evaluate(() => window.pow!.debug!.sounds())
  await expect.poll(async () => (await heard()) !== null).toBe(true)

  // The route 002/ramp.spec.ts walks: from the bank, west onto the near deck
  // of CAMP's first bridge — well onto it and well short of the GAP.
  await warp(page, 800, 7424, -Math.PI / 2)
  await beginTurn(page)
  await hold(page, 'walkForward', 1400)
  expect((await debugState(page)).x, 'it walked onto the bridge').toBeLessThan(256)

  // What a hoof landing here would play — the deck, and not the tile it spans.
  expect(await page.evaluate(() => window.pow!.debug!.surface())).toBe(WOOD)

  // And it is heard. Turning on the spot rather than walking on: clip 4 carries
  // two footfalls a lap (lib/game/footsteps.ts) and the pig stays on the deck.
  // The turn's own grunt (P_HMMM) goes down as the GET READY card does, and it
  // WAITS for the bank if the bank is still loading (audio/battleSound.ts) —
  // so it can land after the warp. Wait for it rather than slicing over it, or
  // the footsteps below are read one out of step.
  await expect.poll(async () => (await heard()).includes('P_HMMM')).toBe(true)
  const before = (await heard()).length
  await press(page, 'turnLeft')
  await page.waitForTimeout(900)
  await release(page, 'turnLeft')
  const steps = (await heard()).slice(before)

  expect(steps.length, 'the hooves').toBeGreaterThan(2)
  for (let i = 0; i < steps.length; i += 2) {
    expect(steps[i]).toBe(SURFACE_SOUNDS[WOOD])
    expect(steps[i + 1]).toBe(STEP_UNDERLAY)
  }

  await releaseAll(page)
  expect(app.errors()).toEqual([])
})

test('a level plays MUSIC, and the TURN is what asks for it', async ({ app }) => {
  // Play: nothing played at all, and nothing in the remake had ever opened the
  // MUSIC folder — so this asserts the whole road rather than one link: the
  // file is found, decoded, and sounding.
  //
  // The exe's own arm is `0x491240`, in the START OF TURN mode and only on the
  // arm the local human's controller takes: `clip = counter + 4·set`, volume
  // 0x46, and then the counter steps 0..3. So a side owns four tracks, they
  // come one A TURN, and a track running out is followed by quiet
  // (audio/music.ts). Which SET a side owns was READ 2026-08-24 — the byte
  // is the pig's LANGUAGE, `Team::SkinOf(nation)` — so the whole arithmetic
  // is the exe's now, and that is what this pins.
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const music = (): Promise<{ clip: number | null; track: string | null; played: number[] }> =>
    page.evaluate(() => window.pow!.music!.now())

  // The track is fetched and decoded before it sounds, so it lands a beat into
  // the turn it belongs to.
  await expect.poll(async () => (await music()).clip !== null, { timeout: 15_000 }).toBe(true)

  const first = await music()
  expect(first.clip, 'a clip of the thirty').toBeGreaterThanOrEqual(0)
  expect(first.clip!).toBeLessThan(30)
  // Clip N is the MCI pair (N+3, N+4), so the file is Track{N+3} — which is
  // what lands the thirty clips on Track03..Track32 (0x43b4c0).
  expect(first.track).toBe(`MUSIC/Track${String(first.clip! + 3).padStart(2, '0')}.ogg`)
  // A side's first turn opens on the first of its four: the exe plays the
  // counter's clip and THEN steps it.
  expect(first.clip! % 4, 'the first of the set').toBe(0)

  // …and the NEXT turn takes the next of the four rather than the same one.
  await skipTurn(page)
  await expect.poll(async () => (await music()).played.length, { timeout: 20_000 }).toBeGreaterThan(1)
  const asked = (await music()).played
  expect(asked[1], 'the second of the set, in order').toBe(asked[0] + 1)

  expect(app.errors()).toEqual([])
})

test('the bank SURVIVES a mission restart — the second battle still sounds', async ({ app }) => {
  // Play: "перезапуск миссии ломает звуки." The bank is ONE promise for the
  // whole app (`sharedBank`, audio/bank.ts) and the first battle's dispose
  // used to flip its `disposed` flag — so every battle after the first got
  // the same silenced object back, and nothing played again until the app
  // was closed. The sergeant already had the rule this pins: BORROWED things
  // are stopped, never disposed.
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const heard = (): Promise<string[]> => page.evaluate(() => window.pow!.debug!.sounds())
  // The first battle sounds — the turn's own grunt proves the bank arrived.
  await expect.poll(async () => (await heard()).includes('P_HMMM')).toBe(true)

  // A RESTART: the same battle torn down and built again, which is what the
  // debrief's RETRY and a step back both do (ui/battle.ts `start`).
  expect(await swapMap(page, 'CAMP')).toBe(true)
  await beginTurn(page)

  // The SECOND battle's own turn grunt — a fresh sound list (the debug
  // surface was rebuilt with the scene), so hearing anything at all is the
  // whole assertion. Before the fix this poll starved: the shared bank came
  // back disposed and every play() returned early.
  await expect.poll(async () => (await heard()).includes('P_HMMM')).toBe(true)

  // …and a driven noise still lands end to end. CONTAINS rather than the
  // first jump test's exact pair: a restarted battle has its own stragglers
  // (a hoof, a late grunt) and which of them shares the slice is not what
  // this spec is about — hearing anything at all is.
  await warp(page, -4352, 8448, 0)
  const before = (await heard()).length
  await tap(page, 'jump')
  await expect
    .poll(async () => (await heard()).slice(before), { message: 'the second battle went quiet' })
    .toEqual(
      expect.arrayContaining([BATTLE_SOUNDS.jump.sound, BATTLE_SOUNDS.land.sound])
    )

  expect(app.errors()).toEqual([])
})

test('moving the highlight in the weapon menu CLICKS', async ({ app }) => {
  // Play: "нет звука когда в инвентаре перемещаешь выделение вообще." The
  // cursor's step now rides the bus (`menuMoved`, input/battleInput.ts) and
  // the cue is a name pick beside menuOpen's (audio/battle.ts `menuMove`).
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  const heard = (): Promise<string[]> => page.evaluate(() => window.pow!.debug!.sounds())
  await expect.poll(async () => (await heard()).includes('P_HMMM')).toBe(true)

  // Open the menu — its own noise — then step the cursor once.
  await press(page, 'skills')
  await expect.poll(async () => (await heard()).includes(BATTLE_SOUNDS.menuOpen.sound)).toBe(true)
  const before = (await heard()).length
  await tap(page, 'turnRight')
  await expect
    .poll(async () => (await heard()).slice(before), { message: 'the cursor moved in silence' })
    .toContain(BATTLE_SOUNDS.menuMove.sound)

  // …and the menu goes back down, so the next spec meets a battle, not a grid.
  await press(page, 'skills')
  expect(app.errors()).toEqual([])
})
