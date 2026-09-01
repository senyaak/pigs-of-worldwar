// WEAPONS — the ESPIONAGE career: SCOUT, SNIPER, SPY.
//
// Career 1 of `ranks.ts`'s table. The three that are OFF THE MAP on anybody
// else's turn (CLAUDE.md, the 0x440C67 marker rule) and the three that carry
// the disguise from the first day — the machine's own start every battle
// already hidden.

import { test, expect } from '@playwright/test'

import { careerOf, promotionsFrom, stepOf } from '../../src/lib/game/ranks'
import { maxHealthFor } from '../../src/lib/game/health'
import { startsHidden } from '../../src/lib/game/hide'
import { damageOf, rangeOf, projectileOf } from '../../src/lib/game/projectile'
import { meleeOf } from '../../src/lib/game/melee'
import { UNLIMITED } from '../../src/lib/game/inventory'
import { endsTurn } from '../../src/lib/game/spend'
import { outfit } from '../../src/lib/game/kits'
import { gainedOver, kitOf, lostOver, routes } from './kit'
import type { Pig } from '../../src/lib/game/game'

const SCOUT = 8
const SNIPER = 9
const SPY = 10

/** What `hide.ts` asks of a pig: a machine-side one holding CONCEAL. */
const holder = (pigClass: number): Pig =>
  ({ carrying: outfit(pigClass), pigClass }) as unknown as Pig

test.describe('SCOUT — class 8, espionage step 0', () => {
  test('is the espionage career at its first step, 75 health', { tag: '@nodata' }, () => {
    expect([careerOf(SCOUT), stepOf(SCOUT), maxHealthFor(SCOUT)]).toEqual(['espionage', 0, 75])
    expect(promotionsFrom(SCOUT)).toEqual([{ to: SNIPER, cost: 2 }])
  })

  test('knife, rifle, the disguise, one gas and one theft', { tag: '@nodata' }, () => {
    expect(kitOf(SCOUT)).toEqual([
      [2, UNLIMITED],
      [7, UNLIMITED],
      [55, UNLIMITED],
      [26, 1],
      [54, 1]
    ])
  })

  test('every skill answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(SCOUT)).toEqual({
      '2 knife': 'melee',
      '7 rifle': 'gun',
      '55 conceal': 'hide',
      '26 poisong': 'gauge',
      '54 pickpock': 'steal'
    })
  })

  test('the two that are not blows KEEP the turn', { tag: '@nodata' }, () => {
    // The theft is on the exe's own exception list; the disguise is not.
    expect(endsTurn(54)).toBe(false)
    expect(endsTurn(55)).toBe(true)
  })

  test('and a machine-side one is hidden before the first turn', { tag: '@nodata' }, () => {
    expect(startsHidden(holder(SCOUT), true)).toBe(true)
    // The player's own is not — side 0 is always ours (lib/game/spawns.ts).
    expect(startsHidden(holder(SCOUT), false)).toBe(false)
  })
})

test.describe('SNIPER — class 9, espionage step 1', () => {
  test('is the espionage career at its second step, 90 health', { tag: '@nodata' }, () => {
    expect([careerOf(SNIPER), stepOf(SNIPER), maxHealthFor(SNIPER)]).toEqual(['espionage', 1, 90])
    expect(promotionsFrom(SNIPER)).toEqual([{ to: SPY, cost: 3 }])
  })

  test('the promotion trades the RIFLE for the scope, and adds a suicide', { tag: '@nodata' }, () => {
    expect(gainedOver(SNIPER, SCOUT)).toEqual([11, 51])
    expect(lostOver(SNIPER, SCOUT)).toEqual([7])
    expect(kitOf(SNIPER)).toEqual([
      [2, UNLIMITED],
      [11, UNLIMITED],
      [55, UNLIMITED],
      [26, 1],
      // Two thefts where the scout had one.
      [54, 2],
      [51, 1]
    ])
  })

  test('every skill in the kit answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(SNIPER)).toEqual({
      '2 knife': 'melee',
      '11 tscopic': 'gun',
      '55 conceal': 'hide',
      '26 poisong': 'gauge',
      '54 pickpock': 'steal',
      '51 suicide': 'sacrifice'
    })
  })

  test('the trade is worth it: twice the points over three times the ground', { tag: '@nodata' }, () => {
    expect(damageOf(11)).toBe(40)
    expect(damageOf(7)).toBe(20)
    expect(rangeOf(projectileOf(11)!)).toBeGreaterThan(rangeOf(projectileOf(7)!) * 2)
  })
})

test.describe('SPY — class 10, espionage step 2', () => {
  test('is the top of the career, 120 health, and leads to COMMANDO', { tag: '@nodata' }, () => {
    expect([careerOf(SPY), stepOf(SPY), maxHealthFor(SPY)]).toEqual(['espionage', 2, 120])
    expect(promotionsFrom(SPY)).toEqual([{ to: 4, cost: 6 }])
  })

  test('IT GIVES THE SUICIDE UP — the sniper carries one and the spy does not', { tag: '@nodata' }, () => {
    // The exe's record, and it is the one place in the game where a step UP a
    // career hands back a weapon that is not replaced by a better one.
    expect(gainedOver(SPY, SNIPER)).toEqual([37, 5])
    expect(lostOver(SPY, SNIPER)).toEqual([51])
    expect(kitOf(SPY)).toEqual([
      [2, UNLIMITED],
      [11, UNLIMITED],
      [55, UNLIMITED],
      [26, 1],
      // Three thefts, which is the career's whole ramp: 1, 2, 3.
      [54, 3],
      [37, 1],
      [5, 3]
    ])
  })

  test('nothing in this career is inert — it is finished end to end', { tag: '@nodata' }, () => {
    expect(routes(SPY)).toEqual({
      '2 knife': 'melee',
      '11 tscopic': 'gun',
      '55 conceal': 'hide',
      '26 poisong': 'gauge',
      '54 pickpock': 'steal',
      '37 tnt': 'lob',
      '5 cattlep1': 'melee'
    })
  })

  test('the CATTLE PROD is the hardest knock in the game', { tag: '@nodata' }, () => {
    // 200 of the exe's own knockback ladder, over the sword's 150 and the
    // knife's 125 — which is what "нож сильнее дробовика" is about from the
    // other end (CLAUDE.md).
    expect(meleeOf(5)!.knockback).toBe(200)
    expect(meleeOf(5)!.knockback).toBeGreaterThan(meleeOf(4)!.knockback)
    // …and it borrows the BAYONET's row whole: same reach, same clip.
    expect(meleeOf(5)!.reach).toEqual(meleeOf(3)!.reach)
    expect(meleeOf(5)!.clip).toBe(meleeOf(3)!.clip)
  })
})
