// PHASE 002 (app) — THE TRAINING GROUND'S SCRIPT MOVES.
//
// Play: "туториал не двигается". Every line the remake could say was hung on a
// crate being COLLECTED, and a crate signals nothing when it is collected — its
// field 15 is the contents, so `Command.signals` is always 0 (lib/game/script.ts).
// The half that carries the script forward is the other dispatcher, 0x465AB0,
// which fires when the map's script PUTS a crate on the ground: the "FOLLOW THE
// YELLOW PATH" lines. Without it the sergeant explains each weapon and never
// once says where to go.
//
// So this drives the first three steps of the real thing, on the real map, and
// reads what was SPOKEN — the script runs on speech, and the briefing bar only
// carries the key press:
//
//   3  PRESS RETURN BUTTON FOR SKILL MENU.          (the bayonet, collected)
//   5  PRESS SPACE TO ATTACK THE DUMMY.             (the bayonet, taken in hand)
//   6  FOLLOW THE YELLOW PATH AND COLLECT THE CRATE. (the rifle, placed)
//
// The path is `strike.spec.ts`'s, because it is the same path: the tutorial's
// first step IS collect the bayonet and knock a dummy down.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { beginTurn, chooseSkill, press, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { targetsOf } from '../../src/lib/game/targets'
import { pickupsOf } from '../../src/lib/game/pickups'
import { clipForPlacement } from '../../src/lib/game/tutorial'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
/** 3 BAYONET, 7 RIFLE — the training ground's first two weapons. */
const BAYONET = 3
const RIFLE = 7

type Page = import('@playwright/test').Page

/** Every training clip the sergeant has spoken, in order (ui/battle.ts). */
const spoken = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { spoken?(): number[] } }).pow
    if (!pow?.spoken) throw new Error('no battle is up')
    return pow.spoken()
  })

const dummies = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          pow: { debug: { props(): { at: { name: string }[] } } }
        }
      ).pow.debug.props().at.filter((each) => each.name === 'DUMMY').length
  )

/** Where `clip` first appears, or −1 — the order is the whole assertion. */
const at = (heard: number[], clip: number): number => heard.indexOf(clip)

test('the training script moves: collected, chosen, and then PLACED', async ({ app }) => {
  const { page } = app
  await startGame(page)

  // The opening two beats are not an object's doing — the level starting, and
  // the round starting under it (lib/game/tutorial.ts, `CLIP_FOR`).
  await expect.poll(async () => spoken(page), { timeout: 30_000 }).toContain(2)

  // Step one: the bayonet crate, which is the one record on CAMP that is on the
  // ground from the first frame — it carries no wait label, so nothing has to
  // place it.
  const crate = pickupsOf(CAMP).find((pickup) => pickup.skill === BAYONET)
  expect(crate, 'CAMP carries a bayonet crate').toBeDefined()
  await warp(page, crate!.x, crate!.z, 0)
  await expect
    .poll(async () => spoken(page), { timeout: 10_000 })
    .toContain(3) // PRESS RETURN BUTTON FOR SKILL MENU.

  // Step two: take it in hand through the real menu. The prompt is the script's
  // own counter — zeroed by the crate line just heard, armed when the menu
  // opens, and spent by the choice, which is count two.
  expect(await chooseSkill(page, BAYONET)).toBe(true)
  await expect
    .poll(async () => spoken(page), { timeout: 10_000 })
    .toContain(5) // PRESS SPACE TO ATTACK THE DUMMY.

  // Step three: knock the dummy down. Its command places the rifle crate, and
  // THAT is what says where to go next.
  const before = await dummies(page)
  expect(before).toBeGreaterThan(0)
  const dummy = targetsOf(CAMP)[0]
  await warp(page, dummy.x, dummy.z - 220, 0)
  await beginTurn(page)
  await press(page, 'fire')
  await expect.poll(async () => dummies(page), { timeout: 12_000 }).toBe(before - 1)

  // The line the whole spec is for. It is the RIFLE's, because the rifle is
  // what the first dummy's label puts on the map — asserted through the same
  // table the app reads, so the two cannot drift apart.
  const line = clipForPlacement(RIFLE, 0)
  expect(line, 'the placement table has forgotten the rifle').toBe(6)
  await expect
    .poll(async () => spoken(page), { timeout: 15_000 })
    .toContain(line) // FOLLOW THE YELLOW PATH AND COLLECT THE CRATE.

  // …and in that order. A script that says step three before step one is not a
  // script at all.
  const heard = await spoken(page)
  expect(at(heard, 3), `out of order: ${heard.join(',')}`).toBeLessThan(at(heard, 5))
  expect(at(heard, 5), `out of order: ${heard.join(',')}`).toBeLessThan(at(heard, line))
})
