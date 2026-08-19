// PHASE 002 (domain) — WHAT ENDS A MISSION, and the beat that shows it.
//
// Pure, no Electron: `lib/game/endOfGame.ts` against the shipped CAMP.POG. The
// whole seam — the handover asking, the ending running, the battle being put
// away — is driven in `e2e/000/engine-headless.spec.ts`; this pins the two
// things that are DATA rather than behaviour, and which would fail silently:
// which records the mission is measured by, and which line the sergeant signs
// off with.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { parsePog } from '../../src/lib/formats/pog'
import {
  HOLD_SECONDS,
  LEAVE_SECONDS,
  advanceEndOfGame,
  beginEndOfGame,
  missionTargetIds,
  outcomeOf
} from '../../src/lib/game/endOfGame'
import { BRISK_TURNS, clipForClosing } from '../../src/lib/game/tutorial'
import { targetsOf } from '../../src/lib/game/targets'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))

test('the mission is measured by the DUMMIES, and by nothing else on the map', () => {
  const ids = missionTargetIds(CAMP)
  // Eleven dummies, every one of them — including the eight the script holds
  // back, because the exe's own test never looks at the placed flag.
  expect(ids.size, 'CAMP carries eleven dummies').toBe(11)
  for (const id of ids) {
    expect(CAMP.find((one) => one.id === id)!.name.toUpperCase()).toBe('DUMMY')
  }
  // …and the rest of what breaks is NOT in it: the 85 firs and the eighteen
  // pieces of the house are the same class in the original and a different kind
  // (lib/game/breakable.ts), so knocking a tree down finishes nothing.
  expect(targetsOf(CAMP).length, 'plenty else breaks').toBeGreaterThan(ids.size)
})

test('a training mission can be won and cannot be lost; a battle knows whose side is ours', () => {
  expect(outcomeOf(true, true, 1, 3)).toBe('playing')
  expect(outcomeOf(true, true, 1, 0)).toBe('won')
  // The training ground floors a pig at one point (lib/game/health.ts), so the
  // exe's own branch has no losing answer in it at all.
  expect(outcomeOf(true, false, 0, 2)).toBe('playing')

  expect(outcomeOf(false, true, 1, 0)).toBe('playing')
  expect(outcomeOf(false, true, 0, 0)).toBe('won')
  // Our whole squad down is a LOSS whoever else is standing — the exe's
  // both-empty case is 2, not 3, and its side-empty case never asks further.
  expect(outcomeOf(false, false, 1, 0)).toBe('lost')
  expect(outcomeOf(false, false, 0, 0)).toBe('lost')
})

test('the ending holds for three seconds, tours the survivors, and bails at twenty', () => {
  const survivors = [4, 5, 6]
  const state = beginEndOfGame(true, survivors)
  expect(state.watching).toBe(4)

  // Two seconds a pig, and the stamp is carried forward rather than reset — the
  // exe adds exactly 0xC8 each time (0x490EFF).
  expect(advanceEndOfGame(state, 2.5, survivors, false)).toBe(false)
  expect(state.watching).toBe(5)
  expect(advanceEndOfGame(state, 0.4, survivors, true), 'too early to skip').toBe(false)
  expect(state.elapsed).toBeLessThan(HOLD_SECONDS)

  // Past the hold, any key at all.
  expect(advanceEndOfGame(state, HOLD_SECONDS, survivors, true)).toBe(true)

  // …and it lets go on its own at twenty, with nobody touching anything.
  const alone = beginEndOfGame(true, survivors)
  let frames = 0
  while (!advanceEndOfGame(alone, 1 / 15, survivors, false) && frames < 15 * 60) frames++
  expect(alone.elapsed).toBeGreaterThanOrEqual(LEAVE_SECONDS)
  expect(alone.elapsed).toBeLessThan(LEAVE_SECONDS + 1)
})

test('the sergeant has two sign-offs, and twelve turns is the line', () => {
  expect(clipForClosing(1)).toBe(28)
  expect(clipForClosing(BRISK_TURNS)).toBe(28)
  expect(clipForClosing(BRISK_TURNS + 1)).toBe(27)
})
