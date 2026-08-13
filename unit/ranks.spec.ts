// PHASE 002 (domain) — the rank a pig wears and where it can be promoted to.
//
// The tables are the exe's (`army/notes.md` in the disasm repo): the badge and
// stripes at 0x4D29C0, the promotion pairs at 0x4D2980 with their counts at
// 0x4D29A8. What they say is what play said first — every career converges on
// COMMANDO and then HERO.

import { test, expect } from '@playwright/test'

import {
  CAREERS,
  HERO_COST,
  RANKS,
  RANK_TEXT,
  careerOf,
  costOf,
  promotionsFrom,
  rankText,
  stepOf
} from '../src/lib/game/ranks'

const GRUNT = 0
const COMMANDO = 4
const HERO = 14

test('there are fifteen ranks, named from fetext 467', { tag: '@nodata' }, () => {
  expect(RANKS).toBe(15)
  expect(RANK_TEXT).toBe(467)
  expect(rankText(GRUNT)).toBe(467)
  expect(rankText(HERO)).toBe(481)
})

test('a class names its career and its step in it', { tag: '@nodata' }, () => {
  expect(CAREERS).toHaveLength(6)
  // The four careers, each three long, and the two summits.
  expect([1, 2, 3].map(careerOf)).toEqual(['heavy', 'heavy', 'heavy'])
  expect([5, 6, 7].map(careerOf)).toEqual(['engineer', 'engineer', 'engineer'])
  expect([8, 9, 10].map(careerOf)).toEqual(['espionage', 'espionage', 'espionage'])
  expect([11, 12, 13].map(careerOf)).toEqual(['medic', 'medic', 'medic'])
  expect(careerOf(COMMANDO)).toBe('commando')
  expect(careerOf(HERO)).toBe('hero')
  // The first step of a career wears no stripes; the two above it wear one each.
  expect([1, 2, 3].map(stepOf)).toEqual([0, 1, 2])
  expect([11, 12, 13].map(stepOf)).toEqual([0, 1, 2])
  expect(stepOf(GRUNT)).toBe(0)
})

test('a GRUNT has four ways out, one per career, all costing one', { tag: '@nodata' }, () => {
  expect(promotionsFrom(GRUNT)).toEqual([
    { to: 1, cost: 1 },
    { to: 5, cost: 1 },
    { to: 8, cost: 1 },
    { to: 11, cost: 1 }
  ])
})

test('every career ends at COMMANDO, and COMMANDO becomes a HERO', { tag: '@nodata' }, () => {
  for (const last of [3, 7, 10, 13]) {
    expect(promotionsFrom(last), `class ${last}`).toEqual([{ to: COMMANDO, cost: 6 }])
  }
  expect(promotionsFrom(COMMANDO)).toEqual([{ to: HERO, cost: 8 }])
  expect(promotionsFrom(HERO)).toEqual([])
})

test('every route to a HERO costs the same twenty points', { tag: '@nodata' }, () => {
  for (const first of [1, 5, 8, 11]) {
    let at = GRUNT
    let spent = 0
    // Walk the one way out at each step until there is none.
    const path = [first]
    spent += costOf(GRUNT, first) ?? 0
    at = first
    while (promotionsFrom(at).length === 1) {
      const [next] = promotionsFrom(at)
      spent += next.cost
      at = next.to
      path.push(at)
    }
    expect(at, `career from ${first}`).toBe(HERO)
    expect(spent, `career from ${first}`).toBe(HERO_COST)
    // GRUNT's step, three of the career, COMMANDO, HERO.
    expect(path).toHaveLength(5)
  }
})

test('a cost is only offered where the tree offers it', { tag: '@nodata' }, () => {
  expect(costOf(GRUNT, 1)).toBe(1)
  expect(costOf(GRUNT, 2)).toBeNull()
  expect(costOf(COMMANDO, HERO)).toBe(8)
  expect(costOf(HERO, 0)).toBeNull()
})
