// WEAPONS — the HEAVY career: GUNNER, BOMBARDIER, PYROTECH.
//
// Career 0 of `ranks.ts`'s table (0x4D29C0), three steps. It is the artillery
// line: the pistol and the bazooka from the first day, then a mortar, then the
// flamethrower and an airburst on top.

import { test, expect } from '@playwright/test'

import { careerOf, promotionsFrom, stepOf } from '../../src/lib/game/ranks'
import { maxHealthFor } from '../../src/lib/game/health'
import { lobOf } from '../../src/lib/game/grenade'
import { weaponOf } from '../../src/lib/game/weapons'
import { damageOf } from '../../src/lib/game/projectile'
import { UNLIMITED } from '../../src/lib/game/inventory'
import { gainedOver, kitOf, lostOver, routes } from './kit'

const GUNNER = 1
const BOMBARDIER = 2
const PYROTECH = 3

test.describe('GUNNER — class 1, heavy step 0', () => {
  test('is the heavy career at its first step, 75 health', { tag: '@nodata' }, () => {
    expect([careerOf(GUNNER), stepOf(GUNNER), maxHealthFor(GUNNER)]).toEqual(['heavy', 0, 75])
    expect(promotionsFrom(GUNNER)).toEqual([{ to: BOMBARDIER, cost: 2 }])
  })

  test('trades the grunt kit WHOLE — trotter, pistol, bazooka', { tag: '@nodata' }, () => {
    expect(kitOf(GUNNER)).toEqual([
      [1, UNLIMITED],
      [6, UNLIMITED],
      [29, UNLIMITED]
    ])
    // Nothing of the grunt's survives the first promotion in this career.
    expect(lostOver(GUNNER, 0)).toEqual([3, 7, 19])
  })

  test('all three answer the fire key', { tag: '@nodata' }, () => {
    expect(routes(GUNNER)).toEqual({
      '1 trotter': 'melee',
      '6 pistol': 'gun',
      '29 bazooka': 'gauge'
    })
  })
})

test.describe('BOMBARDIER — class 2, heavy step 1', () => {
  test('is the heavy career at its second step, 90 health', { tag: '@nodata' }, () => {
    expect([careerOf(BOMBARDIER), stepOf(BOMBARDIER), maxHealthFor(BOMBARDIER)]).toEqual([
      'heavy',
      1,
      90
    ])
    expect(promotionsFrom(BOMBARDIER)).toEqual([{ to: PYROTECH, cost: 3 }])
  })

  test('the promotion buys ONE thing, and it is three MORTARS', { tag: '@nodata' }, () => {
    expect(gainedOver(BOMBARDIER, GUNNER)).toEqual([28])
    expect(lostOver(BOMBARDIER, GUNNER)).toEqual([])
    expect(kitOf(BOMBARDIER)).toEqual([
      [1, UNLIMITED],
      [6, UNLIMITED],
      [29, UNLIMITED],
      [28, 3]
    ])
  })

  test('every skill in the kit answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(BOMBARDIER)).toEqual({
      '1 trotter': 'melee',
      '6 pistol': 'gun',
      '29 bazooka': 'gauge',
      // Not `gauge`: the mortar has none, so the press looses it at once
      // (lib/game/attack.ts) and the COME-UP is the whole of the aim.
      '28 morter': 'lob'
    })
  })

  test('…and the mortar is the harder half of what it carries', { tag: '@nodata' }, () => {
    const mortar = lobOf(28)!
    const rocket = lobOf(29)!
    // Fifty points against the rocket's forty, and it bursts into three more.
    expect(mortar.damage).toBeGreaterThan(rocket.damage)
    expect(mortar.scatter?.count).toBe(3)
    expect(rocket.scatter).toBeUndefined()
    // The one that separates it from every other lob in the game.
    expect(weaponOf(28).power).toBe(false)
    expect(weaponOf(29).power).toBe(true)
  })
})

test.describe('PYROTECH — class 3, heavy step 2', () => {
  test('is the top of the career, 120 health, and leads to COMMANDO', { tag: '@nodata' }, () => {
    expect([careerOf(PYROTECH), stepOf(PYROTECH), maxHealthFor(PYROTECH)]).toEqual(['heavy', 2, 120])
    expect(promotionsFrom(PYROTECH)).toEqual([{ to: 4, cost: 6 }])
  })

  test('buys the FLAMETHROWER and an airburst, and more mortars', { tag: '@nodata' }, () => {
    expect(gainedOver(PYROTECH, BOMBARDIER)).toEqual([14, 31])
    expect(lostOver(PYROTECH, BOMBARDIER)).toEqual([])
    expect(kitOf(PYROTECH)).toEqual([
      [1, UNLIMITED],
      [6, UNLIMITED],
      [29, UNLIMITED],
      // Five where the bombardier had three.
      [28, 5],
      [14, 3],
      [31, 1]
    ])
  })

  test('THE AIRBURST IS INERT — the one thing in this career that is not built', { tag: '@nodata' }, () => {
    expect(routes(PYROTECH)).toEqual({
      '1 trotter': 'melee',
      '6 pistol': 'gun',
      '29 bazooka': 'gauge',
      '28 morter': 'lob',
      '14 fthrowr': 'gun',
      // **Delete this line when 31 lands** (docs/todo.md B18). It has no row
      // in any of the four tables, so the press falls through the ladder to
      // the melee default and NOTHING happens: no round, no turn, no sound.
      '31 aburst': 'inert'
    })
  })

  test('…and worse than inert: it draws a gauge that can never fill', { tag: '@nodata' }, () => {
    // `weapons.ts` gives it the heavy weapons' record, gauge and all, but the
    // gauge is only ever STARTED for a lob or a mine (lib/game/attack.ts), so
    // the HUD shows an empty one for as long as it is in the hand.
    expect(weaponOf(31).power).toBe(true)
    expect(lobOf(31)).toBeNull()
  })

  test('the FLAMETHROWER fires as a gun, at six points a lick', { tag: '@nodata' }, () => {
    // Row 14 of the gun table — the whole of what is built for it. `damageOf`
    // answers in POINTS, the row's 128ths already divided out.
    expect(damageOf(14)).toBe(6)
  })
})
