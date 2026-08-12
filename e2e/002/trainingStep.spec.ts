// PHASE 002 (app) — JUMPING THE TRAINING GROUND TO A STEP.
//
// The remake's own convenience, like `pow.swapMap` and `pow.give`: the tutorial
// is a chain nine dummies long and whatever is being fixed is usually the last
// link of it. F12 goes on a step, F11 goes back one, and `pow.step(9)` lands on
// the bazooka (lib/game/training.ts).
//
// Two things are worth pinning and they are different in kind. The TABLE is a
// reading of CAMP's own .POG and can be checked against the file with no app at
// all — a step's crate must wait on the label the last thing that step breaks
// SIGNALS, and a guarded pair must be broken whole or the placement never fires.
// The JUMP itself is three paths, and the two that are not the plain one are
// where it went wrong on the way in: a jump asked for while the squad is still
// under its canopies (there is nowhere to stand a pig), and a jump BACK, which
// is the level starting over and running to the step behind.

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { tap } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { GUARDED_OPCODES, commandOf } from '../../src/lib/game/script'
import { LAST_TRAINING_STEP, TRAINING_STEPS } from '../../src/lib/game/training'
import { SKILL } from '../../src/lib/game/skills'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const record = (id: number): (typeof CAMP)[number] => {
  const one = CAMP.find((each) => each.id === id)
  if (!one) throw new Error(`CAMP carries no record ${id}`)
  return one
}

type Page = import('@playwright/test').Page

interface Pow {
  step(want?: number): Promise<number>
  debug: {
    holding(): number | null
    currentPig(): { x: number; z: number }
    targetsLeft(): number
    script(): { absent: number[]; falling: number }
  }
}
const jump = (page: Page, want: number): Promise<number> =>
  page.evaluate((n) => (window as unknown as { pow: Pow }).pow.step(n), want)

/** What the acting pig has in hand, where it is standing, and what the script
 * has left to place. */
const state = (
  page: Page
): Promise<{ holding: number | null; x: number; z: number; left: number; absent: number[] }> =>
  page.evaluate(() => {
    const debug = (window as unknown as { pow: Pow }).pow.debug
    const at = debug.currentPig()
    return {
      holding: debug.holding(),
      x: at.x,
      z: at.z,
      left: debug.targetsLeft(),
      absent: debug.script().absent
    }
  })

/**
 * How far the pig is from the crate a step hands over — zero once the jump has
 * landed, because standing ON it is how the jump collects one, through the
 * engine's own reach test.
 *
 * It is also what a jump is WAITED for. Nothing else tells the three states
 * apart: a battle reloading for a step back has the pig empty-handed at its
 * spawn, and "empty-handed" is the answer at the shelter's health crate too.
 */
const fromCrate = async (page: Page, crate: number): Promise<number> => {
  const at = await state(page)
  const one = record(crate)
  return Math.hypot(at.x - one.x, at.z - one.z)
}

test('the step table is CAMP\'s own chain', () => {
  expect(TRAINING_STEPS).toHaveLength(LAST_TRAINING_STEP + 1)
  const commands = new Map(CAMP.map((one) => [one.id, commandOf(one)]))

  for (const [index, step] of TRAINING_STEPS.entries()) {
    if (step.crate === null) continue
    const crate = commands.get(step.crate)
    expect(crate, `step ${index} names record ${step.crate}, which carries no command`).toBeTruthy()

    // The LAST thing the step breaks is what puts its crate on the map — and a
    // crate with no wait label is on the ground from the first frame, which is
    // what the bayonet's is.
    const last = step.finishes[step.finishes.length - 1]
    const signalled = last === undefined ? 0 : (commands.get(last)?.signals ?? -1)
    expect(signalled, `step ${index}: record ${last} does not place crate ${step.crate}`).toBe(
      crate!.waits
    )

    // …and a GUARDED group is broken WHOLE. The exe places nothing while anyone
    // else is still waiting on the label the runner waited on (0x4aa6f5), so
    // half a pair is half a step and the crate never comes down.
    //
    // A CRATE waiting on the same label is not part of the group: placing one
    // spends its command outright (`[candidate+0x48] = 0`, 0x4aa6d0), where a
    // placed dummy keeps its own — which is the whole of how the chain runs more
    // than one step deep.
    for (const id of step.finishes) {
      const command = commands.get(id)!
      if (!GUARDED_OPCODES.includes(command.opcode)) continue
      const group = CAMP.map((one) => commands.get(one.id))
        .filter((one): one is NonNullable<typeof one> => Boolean(one))
        .filter((one) => one.waits === command.waits && !one.parachute)
        .map((one) => one.id)
      for (const partner of group) {
        expect(step.finishes, `step ${index} leaves ${partner} standing beside ${id}`).toContain(
          partner
        )
      }
    }
  }
})

test('F12 goes on, pow.step lands on the bazooka, F11 goes back', async ({ app }) => {
  const { page } = app
  await startGame(page)

  // THE KEYS, and pressed straight away — the squad is still coming down, so the
  // jump has to be remembered and paid once the canopies are off. Two presses
  // are two steps: the second counts from the first even though neither has
  // landed yet.
  await tap(page, 'trainingNext')
  await tap(page, 'trainingNext')
  await tap(page, 'trainingBack')
  await expect
    .poll(async () => fromCrate(page, TRAINING_STEPS[1].crate!), { timeout: 30_000 })
    .toBeLessThan(1)
  const first = await state(page)
  expect(first.holding).toBe(SKILL.BAYONET)
  // Nothing has been broken to get here: the bayonet crate is on the ground from
  // the first frame, so step one costs the map nothing.
  expect(first.left, 'step one knocked something down').toBe(11)

  // THE FAR END, in one call. Nine dummies and the house's door are broken in
  // the chain's own order, every crate lands, and the last one is collected off
  // the ground the pig is stood on.
  await jump(page, LAST_TRAINING_STEP)
  await expect
    .poll(async () => fromCrate(page, TRAINING_STEPS[LAST_TRAINING_STEP].crate!), {
      timeout: 20_000
    })
    .toBeLessThan(1)
  const far = await state(page)
  expect(far.holding).toBe(SKILL.BAZOOKA)
  expect(far.absent, 'the script is still holding something back').toEqual([])
  // The two the DOOR placed are all that is left standing — CAMP carries eleven.
  expect(far.left).toBe(2)

  // …AND BACK. The chain runs one way, so this is the level starting over and
  // running to the step behind: the shelter's crate, which is a HEALTH one and
  // leaves the hands empty.
  const shelter = TRAINING_STEPS[LAST_TRAINING_STEP - 1].crate!
  await tap(page, 'trainingBack')
  await expect.poll(async () => fromCrate(page, shelter), { timeout: 40_000 }).toBeLessThan(1)
  const back = await state(page)
  expect(back.holding, 'a health crate hands over nothing to hold').toBeNull()
  // The chain behind it ran again all the same: the same nine dummies and the
  // same door, on a map that was reloaded to get here.
  expect(back.left).toBe(2)
  expect(app.errors()).toEqual([])
})
