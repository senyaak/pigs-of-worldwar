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

/**
 * How many CRATES are still DRAWN on the ground. The signal a walk-in used to
 * be asserted by — the skill turning up in the pig's list — stopped being one
 * the day every pig started spawning with its CLASS KIT (lib/game/kits.ts): a
 * grunt's is bayonet, rifle and three grenades, and CAMP's only unscripted
 * crate is the BAYONET's, so the skill is in the list before the pig has moved.
 * The crate LEAVING THE MAP is what the walk actually does, and it is the
 * drawn node that says so rather than anything the engine merely thinks.
 */
const crates = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        window as unknown as { pow: { debug: { props(): { at: { name: string }[] } } } }
      ).pow.debug.props().at.filter((one) => /^CRATE/i.test(one.name)).length
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
  const standing = await crates(page)
  expect(standing, 'CAMP has crates on its ground').toBeGreaterThan(0)
  expect(await crates(page), 'nothing is collected from a stride away').toBe(standing)
  await press(page, 'walkForward')
  await expect.poll(() => crates(page), { timeout: 10_000 }).toBe(standing - 1)
  await release(page, 'walkForward')
  expect(await skills(page), 'and it handed the blade over').toContain(BAYONET)

  // **A COLLECTION TAKES NOTHING.** The exe clears on PLACEMENT alone (0x4aa6cb).
  expect(await skills(page), 'the grenade survived the crate').toContain(GRENADE)
  // …and the training ground hands its weapons out UNLIMITED, whatever the
  // record says the crate holds. The grunt's kit already carries the blade
  // unlimited, so what this catches is the collection turning that slot into a
  // COUNT: `give` merges into an existing slot by adding, and a crate worth its
  // record's one charge would leave a number here.
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

test('a finite crate STACKS onto the kit, and spending takes one off', async ({ app }) => {
  const { page } = app
  await startGame(page)
  expect(await swapMap(page, 'GUNS'), 'GUNS opens').toBe(true)

  const crate = pickupsOf(mapOf('GUNS')).find((pickup) => pickup.skill === TNT)
  expect(crate, 'GUNS carries a TNT crate').toBeDefined()
  expect(crate!.amount, 'and it holds exactly one charge').toBe(1)

  // Straight onto it here rather than walking: the walk is pinned above, and
  // this map's ground around the crate is nobody's business.
  // **GUNS' first pig is a SPY, and a spy's kit already carries one charge**
  // (lib/game/kits.ts, the exe's own record at 0x4d02e0 +0x08). So the crate is
  // read against what the pig walked in with rather than against nothing: off
  // the training ground it is worth what the record says, and `give` STACKS it
  // onto the slot that is already there.
  const before = await amountOf(page, TNT)
  expect(before, 'the spy arrives with a charge of its own').toBe(1)
  await warp(page, crate!.x, crate!.z, 0)
  await expect.poll(() => amountOf(page, TNT), { timeout: 10_000 }).toBe(before! + crate!.amount)

  expect(await chooseSkill(page, TNT)).toBe(true)

  // The charge goes down on the clip's own frame and the round with it. ONE
  // plant is all a turn allows — TNT keeps the turn but takes its one blow
  // (lib/game/battle.ts, `struck`) — so what the app can show is the slot going
  // DOWN by one. That a slot reaching zero is DROPPED rather than kept at
  // nothing is `spend`'s own arithmetic and is pinned where it lives, in
  // `unit/inventory.spec.ts`.
  await useUntil(page, async () => (await amountOf(page, TNT)) === before)
  expect(await amountOf(page, TNT), 'one charge spent, one left').toBe(before)

  // The app is left on GUNS deliberately: the fixture hands the next spec a
  // page back on the MENU, and ONE PLAYER always opens the training ground
  // whatever the battle was last (ui/battle.ts `open`). Swapping back would be
  // another whole level's drop-in inside this test's own budget.
})
