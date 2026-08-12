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
import {
  MINE_LINE,
  WASTED_TURN_LINE,
  armsMineLine,
  clipForMenu,
  clipForPickup,
  clipForPlacement
} from '../../src/lib/game/tutorial'
import { createScript } from '../../src/lib/game/script'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
/** 3 BAYONET, 7 RIFLE, 29 BAZOOKA, 37 TNT — the weapons the script hands out. */
const BAYONET = 3
const RIFLE = 7
const BAZOOKA = 29
const TNT = 37
/** CAMP's own door, `STW04_D2`, and the crate its label brings down. */
const DOOR = 46
const BAZOOKA_CRATE = 19

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

/** What the map script is still holding back (three/debug.ts). */
const script = (page: Page): Promise<{ absent: number[]; falling: number }> =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          pow: { debug: { script(): { absent: number[]; falling: number } } }
        }
      ).pow.debug.script()
  )

/** Put a skill straight in the acting pig's hands — the console's own, since no
 * crate on the way to the door carries TNT (ui/battle.ts). */
const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

/** Where `clip` first appears, or −1 — the order is the whole assertion. */
const at = (heard: number[], clip: number): number => heard.indexOf(clip)

/**
 * The two lines that are NOT steps, and were filed as the mission's closers
 * until they were read (`tutorial/notes.md`). No app: this is the table.
 *
 * The mine line is the interesting one — its flag is the other way up from what
 * it looks. The game object is built with `[gameMode+0x330]` SET, so the
 * sergeant says nothing about mines until one of the two MINEFIELD crates
 * clears it, and speaking sets it back: once per minefield, and only after being
 * told to walk into one.
 */
test('the mine line is armed by the minefield crates and by nothing else', () => {
  expect(MINE_LINE).toBe(21)
  expect(WASTED_TURN_LINE).toBe(26)
  // The two crates that say "FOLLOW THE PATH THROUGH THE MINEFIELD…", by their
  // own amounts — and CAMP ships exactly those two.
  expect(armsMineLine(null, 15)).toBe(true)
  expect(armsMineLine(null, 20)).toBe(true)
  expect(clipForPickup(null, 15)).toBe(19)
  expect(clipForPickup(null, 20)).toBe(23)
  // …and nothing else does: not the other health crates, not a weapon.
  expect(armsMineLine(null, 10)).toBe(false)
  expect(armsMineLine(null, 25)).toBe(false)
  expect(armsMineLine(BAYONET, 15)).toBe(false)
})

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
  //
  // …and OPENING it is a step of its own, which is clip 4 — the line that had
  // nothing to fire it until the field it hangs on was identified as the menu's
  // own first cell (lib/game/tutorial.ts, `clipForMenu`).
  expect(clipForMenu(BAYONET, 0), 'the bayonet is what clip 4 answers to').toBe(4)
  expect(await chooseSkill(page, BAYONET)).toBe(true)
  await expect
    .poll(async () => spoken(page), { timeout: 10_000 })
    .toContain(4) // PRESS SPACE TO SELECT YOUR WEAPON.
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
  expect(at(heard, 3), `out of order: ${heard.join(',')}`).toBeLessThan(at(heard, 4))
  expect(at(heard, 4), `out of order: ${heard.join(',')}`).toBeLessThan(at(heard, 5))
  expect(at(heard, 5), `out of order: ${heard.join(',')}`).toBeLessThan(at(heard, line))
})

test('BLOWING THE DOOR drops the bazooka, and the sergeant says so', async ({ app }) => {
  const { page } = app
  await startGame(page)

  // CAMP's door is record #46, `STW04_D2`, and it is the one object on the map
  // whose command is the guarded opcode 22: it waits on label 89, which nothing
  // else waits on, and signals **7** — which the BAZOOKA crate (#19), the
  // health×25 crate (#56) and two more dummies all wait for. So the whole rest of
  // the tutorial hangs off this one break.
  const door = createScript(CAMP).finish(DOOR).map((one) => one.id)
  expect(door, 'the door places the bazooka crate').toContain(BAZOOKA_CRATE)

  const before = await script(page)
  expect(before.absent, 'the bazooka is held back at load').toContain(BAZOOKA_CRATE)

  // Blow it up. TNT one-shots it — 6400 in 128ths against fifty points.
  const record = CAMP.find((one) => one.id === DOOR)!
  await warp(page, record.x, record.z - 300, 0)
  await beginTurn(page)
  await give(page, TNT)
  await page.waitForTimeout(900) // the getting-it-out clip
  await press(page, 'fire')

  // **THE STEP IS OWED BY THE BATTLE, not by the beat that is running.** TNT's
  // fuse outlasts the four seconds planting hands back, so the door breaks inside
  // the beat at the END of the turn — and that beat used to return before the
  // script step was ever paid, with `focus` clearing the debt on the handover.
  // Play: "когда взрываю дверь — должна базука падать - щас нет."
  await expect
    .poll(async () => (await script(page)).absent, { timeout: 20_000 })
    .not.toContain(BAZOOKA_CRATE)

  // …and the crate coming down is what SPEAKS: clip 22, the placement line for
  // skill 29 (lib/game/tutorial.ts).
  const line = clipForPlacement(BAZOOKA, 0)
  expect(line, 'the placement table has forgotten the bazooka').toBe(22)
  await expect.poll(async () => spoken(page), { timeout: 10_000 }).toContain(line)
})
