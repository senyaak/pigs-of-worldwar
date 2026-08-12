// PHASE 002 (app) — WHAT A CRATE DOES TO WHAT A PIG IS CARRYING: walk into one
// on the real map, then use what it gave you.
//
// Nothing in `e2e/` asserted on the inventory after a collection at all, which
// is how a rule that emptied the pig on every pickup could be added and nobody
// notice it emptied him at the wrong moment: play blew a WALL instead of CAMP's
// door, took a medkit, and the training ground's own unlimited TNT went with it
// — "туториал багуется… пропал динамит и не появилась базука". The rule is gone
// (lib/game/scenery.ts) and this is the pin play asked for: "спавни ящик прям
// перед свином — путь пройдёт… потом используй, и если бесконечное не пропало,
// если конечное пропало — норм?"
//
// Two halves, because the engine has two answers and they are the exe's:
//
// - on the TRAINING ground every skill arrives UNLIMITED (0x465625), so using
//   it can never take it away;
// - anywhere else a slot carries the crate's own count and `spend` drops it
//   the moment it reaches zero (lib/game/inventory.ts).
//
// The finite half needs a map that is not the training ground AND a weapon that
// does not hand the turn over as it is used — so it is GUNS' own TNT crate, one
// charge, which is planted where you stand and gives four seconds back rather
// than ending anything (lib/game/spend.ts).

import { expect, test } from '../app'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import { beginTurn, chooseSkill, press, release, swapMap, warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { pickupsOf } from '../../src/lib/game/pickups'
import { UNLIMITED } from '../../src/lib/game/inventory'

const mapOf = (name: string): ReturnType<typeof parsePog> =>
  parsePog(readFileSync(path.join(GAME_DIR, 'Maps', `${name}.POG`)))

/** 3 BAYONET — the training ground's first weapon, on its ground from the
 * start (record 6, and it waits on nothing). */
const BAYONET = 3
/** 19 GRENADE — what the pig is holding BEFORE it walks into anything, since
 * no crate on CAMP hands one out (`pow.give`). */
const GRENADE = 19
/** 37 TNT — GUNS carries one crate of ONE charge, which is the whole point of
 * choosing that map. */
const TNT = 37
/** A stride short of the crate: the walk is what `reached` is pinned by. */
const APPROACH = 400

type Page = import('@playwright/test').Page

interface Debug {
  carrying(): { skill: number; amount: number }[]
  holding(): number | null
  swinging(): boolean
}

/** Every slot the acting pig has, skill and count together. */
const slots = (page: Page): Promise<{ skill: number; amount: number }[]> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: Debug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    return pow.debug.carrying()
  })

const skills = async (page: Page): Promise<number[]> =>
  (await slots(page)).map((slot) => slot.skill)

const amountOf = async (page: Page, skill: number): Promise<number | null> =>
  (await slots(page)).find((slot) => slot.skill === skill)?.amount ?? null

const swinging = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const pow = (window as unknown as { pow?: { debug?: Debug } }).pow
    if (!pow?.debug) throw new Error('no battle scene is up')
    return pow.debug.swinging()
  })

/**
 * Press FIRE until it takes, and answer what `signal` says about it.
 *
 * **Not a sleep in disguise — a race the poll is the fix for.** Input is read
 * once a frame, and taking something out of the skill menu changes the control
 * SET; a press that lands on the frame the menu is still up is read by a set
 * that does not carry the fire key, and the latch is cleared with it
 * (lib/game/controls.ts). One frame either way, so the spec that pressed once
 * passed and failed on alternate runs. Pressing again costs nothing: while a
 * blow is running `Pig::MayAct` is false and every further press is dropped,
 * and a turn allows one weapon use whatever the spec does.
 */
const useUntil = (page: Page, signal: () => Promise<boolean>, timeout = 8000): Promise<void> =>
  expect
    .poll(
      async () => {
        await press(page, 'fire')
        await release(page, 'fire')
        return signal()
      },
      { timeout }
    )
    .toBe(true)

/** Put something in the pig's pockets that no crate on this map hands out —
 * the console's own way in, and the only way a GRENADE is reached on CAMP. */
const give = (page: Page, skill: number, amount: number): Promise<boolean> =>
  page.evaluate(
    (what) => {
      const pow = (window as unknown as { pow?: { give?(s: number, a: number): boolean } }).pow
      if (!pow?.give) throw new Error('pow.give is missing — is the battle module loaded?')
      return pow.give(what.skill, what.amount)
    },
    { skill, amount }
  )

test('a crate is walked into, takes nothing away, and on CAMP never runs out', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await beginTurn(page)

  // Something in the pockets first, so that collecting has something it could
  // wrongly take. This is the half play had to report twice.
  expect(await give(page, GRENADE, 5)).toBe(true)
  expect(await skills(page)).toContain(GRENADE)

  const crate = pickupsOf(mapOf('CAMP')).find((pickup) => pickup.skill === BAYONET)
  expect(crate, 'CAMP carries a bayonet crate that waits on nothing').toBeDefined()

  // A stride short of it and facing it — heading 0 walks +z (lib/game/movement.ts)
  // — and then WALKED in, which is the reach test doing its own job.
  await warp(page, crate!.x, crate!.z - APPROACH, 0)
  expect(await skills(page), 'nothing is collected from a stride away').not.toContain(BAYONET)
  await press(page, 'walkForward')
  await expect.poll(() => skills(page), { timeout: 10_000 }).toContain(BAYONET)
  await release(page, 'walkForward')

  // **A COLLECTION TAKES NOTHING.** The exe clears on PLACEMENT alone (0x4aa6cb).
  expect(await skills(page), 'the grenade survived the crate').toContain(GRENADE)
  // …and the training ground hands its weapons out UNLIMITED, whatever the
  // record says the crate holds.
  expect(await amountOf(page, BAYONET)).toBe(UNLIMITED)

  // Use it. A bayonet spends its round as the swing runs (lib/game/strikes.ts).
  expect(await chooseSkill(page, BAYONET)).toBe(true)
  await useUntil(page, () => swinging(page))
  await expect.poll(() => swinging(page), { timeout: 10_000 }).toBe(false)

  // **UNLIMITED SURVIVES BEING USED**, which is the half that keeps the
  // tutorial from dead-ending on a wasted charge.
  expect(await skills(page), 'the bayonet is still there').toContain(BAYONET)
  expect(await amountOf(page, BAYONET)).toBe(UNLIMITED)
})

test('a finite slot is GONE the moment it is spent', async ({ app }) => {
  const { page } = app
  await startGame(page)
  expect(await swapMap(page, 'GUNS'), 'GUNS opens').toBe(true)

  const crate = pickupsOf(mapOf('GUNS')).find((pickup) => pickup.skill === TNT)
  expect(crate, 'GUNS carries a TNT crate').toBeDefined()
  expect(crate!.amount, 'and it holds exactly one charge').toBe(1)

  // Straight onto it here rather than walking: the walk is pinned above, and
  // this map's ground around the crate is nobody's business.
  await warp(page, crate!.x, crate!.z, 0)
  await expect.poll(() => skills(page), { timeout: 10_000 }).toContain(TNT)
  // Off the training ground a crate is worth what the record says.
  expect(await amountOf(page, TNT)).toBe(1)

  expect(await chooseSkill(page, TNT)).toBe(true)

  // The charge goes down on the clip's own frame and the round with it; a slot
  // that reaches zero is dropped rather than kept at nothing.
  await useUntil(page, async () => !(await skills(page)).includes(TNT))
  expect(await amountOf(page, TNT)).toBe(null)

  // The app is left on GUNS deliberately: the fixture hands the next spec a
  // page back on the MENU, and ONE PLAYER always opens the training ground
  // whatever the battle was last (ui/battle.ts `open`). Swapping back would be
  // another whole level's drop-in inside this test's own budget.
})
