// LOADING A SPEC'S STARTING STATE — put in place directly, never walked to.
//
// A spec checks that one state goes correctly to the next. The state it starts
// from is the app's own to set up: the code is ours, so a battle is opened on
// the map the spec wants, its squads standing and the turn running, without
// ONE PLAYER → NEW GAME → army → name → squad → briefing in front of it every
// time. That chain and the drop are each tested once, by their own specs
// (`e2e/002/battle.spec.ts`, `e2e/002/parachute.spec.ts`).
//
// The load is a `test.step` titled `load …`, so the timing reporter
// (`e2e/timing.ts`) can say how much of a spec was getting there and how much
// was the spec.

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { ActionOutcome } from '../src/renderer/src/actions/actions'
import type { ActionEnd } from '../src/renderer/src/actions/actions'
import { beginTurn } from './controller'
import { LOAD_STEP } from './timing'

/** Which way a battle opens: on its feet, or with the level's own drop. */
export enum Opening {
  /** The squads on their markers and the first turn running — past the drop
   * and past the beat at the top of the turn. What almost every spec wants. */
  Standing = 'standing',
  /** The squads up under their canopies, the drop not yet begun: for the
   * specs whose subject IS the descent. */
  Dropping = 'dropping'
}

/**
 * A battle on `map`, straight from wherever the app stands. No campaign is
 * behind it, so leaving it lands on the main menu, which is where the fixture
 * wants the app anyway.
 */
export async function openBattle(
  page: Page,
  map = 'CAMP',
  opening = Opening.Standing
): Promise<void> {
  await test.step(`${LOAD_STEP}${map}`, async () => {
    const drop = opening === Opening.Dropping
    const end = await page.evaluate(
      (wanted) => {
        const pow = (window as unknown as { pow?: { open?(map: string, drop: boolean): Promise<ActionEnd> } })
          .pow
        if (!pow?.open) throw new Error('pow.open is missing — is the app up?')
        return pow.open(wanted.map, wanted.drop)
      },
      { map, drop }
    )
    expect(end, `opening ${map}`).toMatchObject({ outcome: ActionOutcome.Done })
    test.info().annotations.push({ type: 'load', description: `${map}: ${end.ms} ms in the app` })
    await expect(page.locator('#battle')).toBeVisible()
    if (!drop) await beginTurn(page)
  })
}
