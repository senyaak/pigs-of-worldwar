// WEAPONS — the ENGINEER career: SAPPER, ENGINEER, SABOTEUR.
//
// Career 2 of `ranks.ts`'s table. It is the demolition line, and the only one
// whose whole kit is about what a pig LEAVES BEHIND: a shotgun, mines, TNT,
// and from the second step a charge it does not walk away from.

import { test, expect } from '@playwright/test'

import { careerOf, promotionsFrom, stepOf } from '../../src/lib/game/ranks'
import { maxHealthFor } from '../../src/lib/game/health'
import { isPlanted, lobOf } from '../../src/lib/game/grenade'
import { projectileOf } from '../../src/lib/game/projectile'
import { UNLIMITED } from '../../src/lib/game/inventory'
import { endsTurn, hurryFor } from '../../src/lib/game/spend'
import { SACRIFICE_DAMAGE } from '../../src/lib/game/suicide'
import { gainedOver, kitOf, lostOver, routes } from './kit'

const SAPPER = 5
const ENGINEER = 6
const SABOTEUR = 7

test.describe('SAPPER — class 5, engineer step 0', () => {
  test('is the engineer career at its first step, 80 health', { tag: '@nodata' }, () => {
    expect([careerOf(SAPPER), stepOf(SAPPER), maxHealthFor(SAPPER)]).toEqual(['engineer', 0, 80])
    expect(promotionsFrom(SAPPER)).toEqual([{ to: ENGINEER, cost: 2 }])
  })

  test('a shotgun, three mines and one TNT', { tag: '@nodata' }, () => {
    expect(kitOf(SAPPER)).toEqual([
      [1, UNLIMITED],
      [12, UNLIMITED],
      [35, 3],
      [37, 1]
    ])
  })

  test('every skill answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(SAPPER)).toEqual({
      '1 trotter': 'melee',
      '12 rifbell': 'gun',
      // A MINE and TNT are both PLANTED: no gauge to hold, so the press
      // starts the laying clip at once.
      '35 mine': 'lob',
      '37 tnt': 'lob'
    })
  })

  test('and the two it PLANTS are the two that do not end the turn', { tag: '@nodata' }, () => {
    expect([35, 37].every(isPlanted)).toBe(true)
    expect([endsTurn(35), endsTurn(37)]).toEqual([false, false])
    // TNT hands back four seconds to be somewhere else; a mine has its own
    // arm and does not (lib/game/spend.ts).
    expect(hurryFor(37)).toBe(4)
    expect(hurryFor(35)).toBe(0)
  })

  test('its shotgun is a VOLLEY, which is what makes it a shotgun', { tag: '@nodata' }, () => {
    const row = projectileOf(12)!
    expect(row.pellets).toBe(10)
    expect(row.spread).toBe(16)
  })
})

test.describe('ENGINEER — class 6, engineer step 1', () => {
  test('is the engineer career at its second step, 100 health', { tag: '@nodata' }, () => {
    expect([careerOf(ENGINEER), stepOf(ENGINEER), maxHealthFor(ENGINEER)]).toEqual([
      'engineer',
      1,
      100
    ])
    expect(promotionsFrom(ENGINEER)).toEqual([{ to: SABOTEUR, cost: 3 }])
  })

  test('the promotion buys a SUICIDE and three super grenades', { tag: '@nodata' }, () => {
    expect(gainedOver(ENGINEER, SAPPER)).toEqual([51, 27])
    expect(lostOver(ENGINEER, SAPPER)).toEqual([])
    expect(kitOf(ENGINEER)).toEqual([
      [1, UNLIMITED],
      [12, UNLIMITED],
      [35, 3],
      [51, 1],
      // Two TNT where the sapper had one.
      [37, 2],
      [27, 3]
    ])
  })

  test('every skill in the kit answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(ENGINEER)).toEqual({
      '1 trotter': 'melee',
      '12 rifbell': 'gun',
      '35 mine': 'lob',
      // Its own door in the ladder, beside the heal and the disguise: no
      // projectile, no fuse, no gauge (lib/game/suicide.ts).
      '51 suicide': 'sacrifice',
      '37 tnt': 'lob',
      '27 supegren': 'gauge'
    })
  })

  test('the SUICIDE is TNT at the pig own feet, and it pays with the pig', { tag: '@nodata' }, () => {
    // The same fifty points TNT carries — and unlike TNT, nothing to run from
    // and no four seconds to do it in.
    expect(SACRIFICE_DAMAGE).toBe(lobOf(37)!.damage)
    expect(hurryFor(51)).toBe(0)
    expect(endsTurn(51)).toBe(true)
  })
})

test.describe('SABOTEUR — class 7, engineer step 2', () => {
  test('is the top of the career, 120 health, and leads to COMMANDO', { tag: '@nodata' }, () => {
    expect([careerOf(SABOTEUR), stepOf(SABOTEUR), maxHealthFor(SABOTEUR)]).toEqual([
      'engineer',
      2,
      120
    ])
    expect(promotionsFrom(SABOTEUR)).toEqual([{ to: 4, cost: 6 }])
  })

  test('IT GIVES ONE UP: the rifle bell goes for the super rifle', { tag: '@nodata' }, () => {
    // A promotion is not always a superset, and this career is where it shows.
    expect(gainedOver(SABOTEUR, ENGINEER)).toEqual([13])
    expect(lostOver(SABOTEUR, ENGINEER)).toEqual([12])
    expect(kitOf(SABOTEUR)).toEqual([
      [1, UNLIMITED],
      [13, UNLIMITED],
      [35, 3],
      // Three TNT where the engineer had two.
      [37, 3],
      [27, 3],
      [51, 1]
    ])
  })

  test('nothing in this career is inert — it is finished end to end', { tag: '@nodata' }, () => {
    expect(routes(SABOTEUR)).toEqual({
      '1 trotter': 'melee',
      '13 superrif': 'gun',
      '35 mine': 'lob',
      '37 tnt': 'lob',
      '27 supegren': 'gauge',
      '51 suicide': 'sacrifice'
    })
  })

  test('the super rifle is the same volley, harder', { tag: '@nodata' }, () => {
    const plain = projectileOf(12)!
    const super_ = projectileOf(13)!
    expect(super_.pellets).toBe(plain.pellets)
    expect(super_.damage).toBeGreaterThanOrEqual(plain.damage)
  })
})
