// WEAPONS — where every career ENDS: COMMANDO, HERO, and the two rows past it.
//
// All four careers converge on the COMMANDO and the COMMANDO becomes a HERO
// (`ranks.ts`, the tree at 0x4D2980), so these are the two classes a campaign
// can actually reach at the top — and 15 and 16 are records the promotion tree
// has no way into at all.
//
// **This is where the unbuilt weapons live.** Classes 0 to 13 answer every
// key they carry bar one airburst; from the COMMANDO up the kits fill with
// things that do nothing, and each is written down here by name so building
// one turns this file red.

import { test, expect } from '@playwright/test'

import { careerOf, promotionsFrom, stepOf, HERO_COST } from '../../src/lib/game/ranks'
import { maxHealthFor } from '../../src/lib/game/health'
import { CLASS_KIT } from '../../src/lib/game/kits'
import { UNLIMITED } from '../../src/lib/game/inventory'
import { gainedOver, kitOf, lostOver, routes, skillsOf } from './kit'

const COMMANDO = 4
const HERO = 14
const BETWEEN = 15
const ACE = 16

test.describe('COMMANDO — class 4, the one every career leads to', () => {
  test('is a career of its own, and costs the same six from all four tops', { tag: '@nodata' }, () => {
    expect([careerOf(COMMANDO), stepOf(COMMANDO), maxHealthFor(COMMANDO)]).toEqual([
      'commando',
      0,
      130
    ])
    for (const top of [3, 7, 10, 13]) expect(promotionsFrom(top)).toEqual([{ to: COMMANDO, cost: 6 }])
    expect(promotionsFrom(COMMANDO)).toEqual([{ to: HERO, cost: 8 }])
    // 1 + 2 + 3 + 6 + 8, whichever way round.
    expect(HERO_COST).toBe(20)
  })

  test('carries eleven skills — a piece of every career at once', { tag: '@nodata' }, () => {
    expect(kitOf(COMMANDO)).toEqual([
      [2, UNLIMITED],
      [29, UNLIMITED],
      [9, 1],
      [11, UNLIMITED],
      [55, UNLIMITED],
      [31, 1],
      [50, 1],
      [20, 1],
      [17, 3],
      [26, 1],
      [37, 1]
    ])
    // The espionage scope and disguise, the medic's dart, the engineer's TNT
    // and the heavy's rocket, in one pig.
    for (const borrowed of [11, 55, 17, 37, 29]) expect(skillsOf(COMMANDO)).toContain(borrowed)
  })

  test('TWO of its eleven are inert — the airburst and the jetpack', { tag: '@nodata' }, () => {
    expect(routes(COMMANDO)).toEqual({
      '2 knife': 'melee',
      '29 bazooka': 'gauge',
      '9 mgun': 'gun',
      '11 tscopic': 'gun',
      '55 conceal': 'hide',
      // **Both are read and not built** (docs/todo.md B18). Delete the line
      // when the weapon lands.
      '31 aburst': 'inert',
      '50 jetpac': 'inert',
      '20 clusgre1': 'gauge',
      '17 mededart': 'gun',
      '26 poisong': 'gauge',
      '37 tnt': 'lob'
    })
  })

  test('and its MACHINE GUN is a worse rifle until the burst is built', { tag: '@nodata' }, () => {
    // Four points a press against the rifle's twenty. The cap that makes it a
    // machine gun (edi=5, first round ×5) is read and not fielded.
    expect(routes(COMMANDO)['9 mgun']).toBe('gun')
  })
})

test.describe('HERO — class 14, the top of the tree', () => {
  test('has nowhere to go and 150 health', { tag: '@nodata' }, () => {
    expect([careerOf(HERO), stepOf(HERO), maxHealthFor(HERO)]).toEqual(['hero', 0, 150])
    expect(promotionsFrom(HERO)).toEqual([])
  })

  test('trades the knife for a SWORD and the mgun for the heavy one', { tag: '@nodata' }, () => {
    expect(gainedOver(HERO, COMMANDO)).toEqual([4, 10, 57, 58, 53])
    expect(lostOver(HERO, COMMANDO)).toEqual([2, 9])
  })

  test('FIVE of its fourteen do nothing at all', { tag: '@nodata' }, () => {
    expect(routes(HERO)).toEqual({
      '4 sword': 'melee',
      '29 bazooka': 'gauge',
      '37 tnt': 'lob',
      '31 aburst': 'inert',
      '50 jetpac': 'inert',
      '20 clusgre1': 'gauge',
      '10 hvmgun': 'gun',
      '11 tscopic': 'gun',
      '55 conceal': 'hide',
      // Nothing has been read for these three at all — no row, no arm, no
      // note. They are not a gap in the BUILD; they are a gap in the READ.
      '57 specops': 'inert',
      '58 plane': 'inert',
      '53 medic1': 'inert',
      '17 mededart': 'gun',
      '26 poisong': 'gauge'
    })
  })
})

test.describe('the two rows past HERO — 15 and ACE', () => {
  test('the promotion tree cannot reach either of them', { tag: '@nodata' }, () => {
    // `TREE` ends at HERO, so nothing in a campaign ever becomes one of these:
    // they are records with a reader and no writer. The AC_ME spawn marker is
    // the one door (lib/game/spawns.ts).
    expect(CLASS_KIT).toHaveLength(17)
    for (const rank of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
      expect(promotionsFrom(rank).some((one) => one.to >= BETWEEN)).toBe(false)
  })

  test('…and `ranks.ts` has no career for them, so they fall back', { tag: '@nodata' }, () => {
    // Worth pinning as a FALLBACK rather than a fact: the exe's table at
    // 0x4D29C0 stops at HERO, and `careerOf` answers 'heavy' for anything
    // past it. A badge drawn off this would be wrong, not missing.
    expect(careerOf(BETWEEN)).toBe('heavy')
    expect(careerOf(ACE)).toBe('heavy')
    expect([maxHealthFor(BETWEEN), maxHealthFor(ACE)]).toEqual([150, 200])
  })

  test('15 gives up the scope, the disguise and the dart for an air strike', { tag: '@nodata' }, () => {
    expect(gainedOver(BETWEEN, HERO)).toEqual([59, 18])
    expect(lostOver(BETWEEN, HERO)).toEqual([11, 55, 17])
    // …and three jetpacks where the hero had one.
    expect(kitOf(BETWEEN).find(([skill]) => skill === 50)).toEqual([50, 3])
  })

  test('SIX of 15 thirteen are inert', { tag: '@nodata' }, () => {
    expect(routes(BETWEEN)).toEqual({
      '4 sword': 'melee',
      '29 bazooka': 'gauge',
      '37 tnt': 'lob',
      '31 aburst': 'inert',
      '50 jetpac': 'inert',
      '20 clusgre1': 'gauge',
      '10 hvmgun': 'gun',
      '57 specops': 'inert',
      '58 plane': 'inert',
      '59 clustair': 'inert',
      '18 trandart': 'gun',
      '26 poisong': 'gauge',
      '53 medic1': 'inert'
    })
  })

  test('ACE is 15 plus an unlimited SHOCKWAVE, and that is inert too', { tag: '@nodata' }, () => {
    expect(gainedOver(ACE, BETWEEN)).toEqual([56])
    expect(lostOver(ACE, BETWEEN)).toEqual([])
    expect(kitOf(ACE).find(([skill]) => skill === 56)).toEqual([56, UNLIMITED])
    expect(routes(ACE)['56 shokwav']).toBe('inert')
  })
})
