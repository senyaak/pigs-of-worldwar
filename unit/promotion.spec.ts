// PHASE 002 (domain) — what the pig menu does to a save: promote along the
// exe's tree, rename, swap. Pure, no Electron, no installation.
//
// The promote rule is 0x42BD92's (`army/notes.md`): cost off the pair table,
// tested against the team's points, refused when short, subtracted through.

import { test, expect } from '@playwright/test'

import { newSquad } from '../src/lib/game/roster'
import { newGame } from '../src/lib/game/save'
import { HERO_COST, promotionsFrom } from '../src/lib/game/ranks'
import { PIG_NAME_LENGTH, promote, renamePig, swapPigs } from '../src/lib/game/promotion'

const NAMES = ['JONES', 'DEN', 'BASIL', 'GINGER', 'MONTY', 'SMITH', 'PONSONBY', 'PERCY']
const saveOf = (tokens = 0): ReturnType<typeof newGame> => ({
  ...newGame('TEST', 0, newSquad(NAMES, [8, 2, 4, 1, 3, 7, 5, 6]), '2026-08-18T00:00:00Z'),
  tokens
})

test('a promotion spends the cost and writes the class', { tag: '@nodata' }, () => {
  const save = saveOf(3)
  // A GRUNT into the espionage career — class 8, SCOUT, cost 1.
  const after = promote(save, 2, 8)
  expect(after).not.toBeNull()
  expect(after?.squad[2].rank).toBe(8)
  expect(after?.tokens).toBe(2)
  // Nothing else moved, and the save handed in was not written on.
  expect(after?.squad[0].rank).toBe(0)
  expect(save.squad[2].rank).toBe(0)
  expect(save.tokens).toBe(3)
})

test('a promotion the team cannot afford is refused', { tag: '@nodata' }, () => {
  const save = saveOf(0)
  expect(promote(save, 0, 1)).toBeNull()
})

test('a step the tree does not have is refused', { tag: '@nodata' }, () => {
  const save = saveOf(20)
  // A GRUNT cannot leap to COMMANDO; the tree's four ways out are 1/5/8/11.
  expect(promote(save, 0, 4)).toBeNull()
  expect(promote(save, 9, 0)).toBeNull()
})

test('twenty points walk a GRUNT to HERO down any career', { tag: '@nodata' }, () => {
  let save = saveOf(HERO_COST)
  for (;;) {
    const ways = promotionsFrom(save.squad[0].rank)
    if (ways.length === 0) break
    const next = promote(save, 0, ways[0].to)
    expect(next).not.toBeNull()
    if (!next) return
    save = next
  }
  expect(save.squad[0].rank).toBe(14)
  expect(save.tokens).toBe(0)
})

test('a rename is trimmed to the seven the grid allows', { tag: '@nodata' }, () => {
  const save = saveOf()
  const after = renamePig(save, 1, ' NAPOLEON ')
  expect(after?.squad[1].name).toBe('NAPOLEO')
  expect(after?.squad[1].name.length).toBeLessThanOrEqual(PIG_NAME_LENGTH)
  expect(renamePig(save, 1, '   ')).toBeNull()
  expect(renamePig(save, 9, 'X')).toBeNull()
})

test('a swap moves the whole pig, both ways', { tag: '@nodata' }, () => {
  const save = saveOf()
  const after = swapPigs(save, 0, 7)
  expect(after?.squad[0].name).toBe('PERCY')
  expect(after?.squad[7].name).toBe('JONES')
  expect(after?.squad[0].identity).toBe(6)
  // A slot with itself, or off the end, is a refusal — nothing to write.
  expect(swapPigs(save, 3, 3)).toBeNull()
  expect(swapPigs(save, 0, 8)).toBeNull()
})
