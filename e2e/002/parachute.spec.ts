// PHASE 002 (app) — the level's opening drop.
//
// A map's spawn markers say which pigs arrive by parachute (flags bit 6,
// lib/formats/pog.ts): on a campaign map it is the player's side of five and
// the enemy is already standing there, and on the training ground it is the
// one trainee. Those pigs start 3072–3583 exe units above their own marker
// and come down under a canopy while everything else — the turn clock, the
// controls — waits, which is what the original does (0x46ed23 advances the
// clip and returns).
//
// The physics is pinned in the pure part below; the app part is the wiring:
// the pig really is in the air, it really is wearing a canopy, and the
// battle really does not begin until it is down.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR, PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { debugState, hud, landed, peakNodeY, tap } from '../controller'
import { toBattle } from '../menu'
import { parsePog, parachutesIn } from '../../src/lib/formats/pog'
import { mapSpawns, spawnTeams } from '../../src/lib/game/spawns'
import {
  CHUTE_TAU,
  CHUTE_TERMINAL,
  DROP_HEIGHT,
  DROP_SPREAD,
  createDrop,
  cutChute,
  updateDrop
} from '../../src/lib/game/parachute'
import { DRAG_TAU } from '../../src/lib/game/locomotion'

const pog = (name: string): ReturnType<typeof parsePog> =>
  parsePog(readFileSync(path.join(GAME_DIR, 'Maps', `${name}.POG`)))

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test('the marker says who drops in, and on a campaign map that is one side', () => {
  // The training ground's one trainee arrives the way every pig does.
  const camp = mapSpawns(pog('CAMP'))
  expect(camp).toHaveLength(1)
  expect(camp[0].parachutes).toBe(true)

  // LIBERATE is a campaign map: the player's side comes down out of the sky,
  // the French are on the ground waiting.
  const [ours, theirs] = spawnTeams(pog('LIBERATE'))
  expect(ours.filter((at) => at.parachutes)).not.toHaveLength(0)
  expect(theirs.map((at) => at.parachutes)).toEqual(Array(theirs.length).fill(false))

  // A skirmish arena drops everybody — it is four squads arriving at once.
  for (const side of spawnTeams(pog('ARTGUN'))) {
    expect(side.map((at) => at.parachutes)).toEqual(Array(side.length).fill(true))
  }

  // And it is a SPAWN thing: no map plays the bit on scenery in a way
  // anything reads, so nothing but a marker may be asked about it here.
  const markers = pog('CAMP').filter((object) => object.name.endsWith('_ME'))
  expect(markers.filter(parachutesIn)).toHaveLength(1)
})

test('the descent settles at the parachute force, not the falling one', () => {
  // The canopy's own terminal, solved: the force pulls (50 − v)/51 a frame
  // and the integrator drags v/128, so a steady descent is where the two
  // cancel. That is a fifteenth of a free fall's 256 a frame.
  const settled = CHUTE_TERMINAL / (1 + CHUTE_TAU / DRAG_TAU)

  const drop = createDrop(0, 0)
  expect(drop.y).toBeCloseTo(-DROP_HEIGHT)
  // Nothing carries over from before the canopy opened (exe 0x4a9ee0).
  expect(drop.vy).toBe(0)

  let frames = 0
  let fastest = 0
  while (!drop.landed && frames < 60 * 60) {
    updateDrop(drop, 0, 1 / 60)
    fastest = Math.max(fastest, drop.vy)
    frames++
  }
  expect(drop.landed).toBe(true)
  // It approaches the terminal and never passes it. A canopy that ended up
  // at the FALLING force's terminal instead would be four hundred units a
  // second quicker and would sail past this.
  expect(fastest).toBeLessThanOrEqual(settled)
  expect(fastest).toBeGreaterThan(settled * 0.8)
  // So the whole descent is the ideal-speed time plus the ramp, and a
  // first-order ramp costs at most its own time constant — the two forces'
  // in parallel, since they act together.
  const tau = 1 / (1 / CHUTE_TAU + 1 / DRAG_TAU)
  expect(frames / 60).toBeGreaterThan(DROP_HEIGHT / settled)
  expect(frames / 60).toBeLessThan(DROP_HEIGHT / settled + tau)

  // The spread is on top of the height, so a squad arrives over a beat
  // rather than all together.
  expect(createDrop(0, 1).y).toBeCloseTo(-DROP_HEIGHT - DROP_SPREAD)
})

test('cutting the canopy hands the pig back to gravity', () => {
  const settled = CHUTE_TERMINAL / (1 + CHUTE_TAU / DRAG_TAU)
  const run = (cutAfter: number | null): { frames: number; fastest: number } => {
    const drop = createDrop(0, 0)
    let frames = 0
    let fastest = 0
    while (!drop.landed && frames < 60 * 60) {
      if (cutAfter !== null && frames === cutAfter) cutChute(drop)
      updateDrop(drop, 0, 1 / 60)
      fastest = Math.max(fastest, drop.vy)
      frames++
    }
    expect(drop.landed).toBe(true)
    return { frames, fastest }
  }

  // Cut at once and the drop is a fall: the canopy's terminal is no ceiling
  // any more, and the whole thing is over in a fraction of the time.
  const whole = run(null)
  const cut = run(0)
  expect(cut.fastest).toBeGreaterThan(settled)
  expect(cut.frames).toBeLessThan(whole.frames / 2)

  // Cut halfway and it lands somewhere between the two — the swap is a
  // change of force on a body already moving, not a restart.
  const late = run(Math.floor(whole.frames / 2))
  expect(late.frames).toBeGreaterThan(cut.frames)
  expect(late.frames).toBeLessThan(whole.frames)
})

test('the battle opens with the pig in the air and does not begin until it lands', async ({
  app
}) => {
  const { page } = app
  // NOT `startGame`, which waits the drop out — this spec is about the drop.
  await toBattle(page)

  const dropIn = (): Promise<{
    running: boolean
    pigs: { name: string; y: number; landed: boolean; canopy: boolean }[]
  }> => page.evaluate(() => window.pow!.debug!.dropIn())

  const opening = await dropIn()
  expect(opening.running).toBe(true)
  expect(opening.pigs).toHaveLength(1)
  expect(opening.pigs[0]).toMatchObject({ name: 'NOBBY', landed: false, canopy: true })

  const opened = opening.pigs[0].y

  await landed(page)
  const after = await dropIn()
  expect(after.running).toBe(false)
  // The list empties as each pig arrives, which is what ends the phase.
  expect(after.pigs).toEqual([])

  // Game space is Y-down, so being up in the air is a node well BELOW the
  // ground's own value — and the pig came down onto the marker it was always
  // going to stand on. Half the drop is a gap no landed pig could show.
  const ground = (await debugState(page)).nodeY
  expect(opened).toBeLessThan(ground - DROP_HEIGHT / 2)

  // And it STAYS down. A pig that arrives by parachute does not rebound off
  // the ground — the exe holds its landing clip for a single frame before
  // the idle picker takes it, so the crouch-and-spring is never seen. Y-down,
  // so anything above the resting height is a SMALLER number.
  expect(ground - (await peakNodeY(page, -1e9, 600))).toBeLessThan(1)

  // The clock did not run while nobody was on the ground — the turn starts
  // when the squad does.
  expect((await hud(page)).seconds).toBeGreaterThan(44)

  expect(app.errors()).toEqual([])
})

test('the jump key cuts the canopy away and drops the pig the rest', async ({ app }) => {
  const { page } = app
  await toBattle(page)

  const aloft = (): Promise<{ y: number; canopy: boolean } | undefined> =>
    page.evaluate(() => window.pow!.debug!.dropIn().pigs[0])

  const under = await aloft()
  expect(under?.canopy).toBe(true)

  await tap(page, 'jump')
  await expect
    .poll(async () => (await aloft())?.canopy ?? false, { message: 'the canopy to go' })
    .toBe(false)
  // Still up there, and now falling rather than floating.
  const falling = await aloft()
  expect(falling).toBeDefined()

  await landed(page)
  expect(await page.evaluate(() => window.pow!.debug!.dropIn().running)).toBe(false)
  // It still arrived on its own marker, cut chute or not.
  const ground = (await debugState(page)).nodeY
  expect(ground - (await peakNodeY(page, -1e9, 400))).toBeLessThan(1)

  expect(app.errors()).toEqual([])
})
