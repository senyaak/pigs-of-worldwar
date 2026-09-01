// WEAPONS — the MEDIC career: ORDERLY, MEDIC, SURGEON.
//
// Career 3 of `ranks.ts`'s table, and the one that goes the other way: three
// of its skills PUT POINTS ON. It is also the only career whose kit is purely
// cumulative — every step keeps everything the one below it had.

import { test, expect } from '@playwright/test'

import { careerOf, promotionsFrom, stepOf } from '../../src/lib/game/ranks'
import { maxHealthFor } from '../../src/lib/game/health'
import { lobOf } from '../../src/lib/game/grenade'
import { projectileOf } from '../../src/lib/game/projectile'
import { HEAL_POINTS } from '../../src/lib/game/healing'
import { UNLIMITED } from '../../src/lib/game/inventory'
import { endsTurn } from '../../src/lib/game/spend'
import { gainedOver, kitOf, lostOver, routes } from './kit'

const ORDERLY = 11
const MEDIC = 12
const SURGEON = 13

test.describe('ORDERLY — class 11, medic step 0', () => {
  test('is the medic career at its first step — and the FRAILEST class', { tag: '@nodata' }, () => {
    expect([careerOf(ORDERLY), stepOf(ORDERLY), maxHealthFor(ORDERLY)]).toEqual(['medic', 0, 60])
    // Sixty: less than any other career's first step, and only ten over a
    // grunt's.
    expect(maxHealthFor(ORDERLY)).toBeLessThan(maxHealthFor(1))
    expect(promotionsFrom(ORDERLY)).toEqual([{ to: MEDIC, cost: 2 }])
  })

  test('knife, rifle, three HEALING HANDS and three grenades', { tag: '@nodata' }, () => {
    expect(kitOf(ORDERLY)).toEqual([
      [2, UNLIMITED],
      [7, UNLIMITED],
      [52, 3],
      [19, 3]
    ])
  })

  test('every skill answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(ORDERLY)).toEqual({
      '2 knife': 'melee',
      '7 rifle': 'gun',
      // Its own door: the exe's arm reads the pig list and puts the points
      // back on the spot (lib/game/healing.ts).
      '52 healhand': 'heal',
      '19 grenade': 'gauge'
    })
  })

  test('and the hands do NOT spend the turn', { tag: '@nodata' }, () => {
    // The exe's own exception list — a heal is not a blow (lib/game/spend.ts).
    expect(endsTurn(52)).toBe(false)
    expect(HEAL_POINTS).toBe(20)
  })
})

test.describe('MEDIC — class 12, medic step 1', () => {
  test('is the medic career at its second step, 80 health', { tag: '@nodata' }, () => {
    expect([careerOf(MEDIC), stepOf(MEDIC), maxHealthFor(MEDIC)]).toEqual(['medic', 1, 80])
    expect(promotionsFrom(MEDIC)).toEqual([{ to: SURGEON, cost: 3 }])
  })

  test('the promotion buys the two RANGED heals', { tag: '@nodata' }, () => {
    expect(gainedOver(MEDIC, ORDERLY)).toEqual([17, 33])
    expect(lostOver(MEDIC, ORDERLY)).toEqual([])
    expect(kitOf(MEDIC)).toEqual([
      [2, UNLIMITED],
      [7, UNLIMITED],
      [52, 3],
      [17, 3],
      [33, 3],
      [19, 3]
    ])
  })

  test('every skill in the kit answers the fire key', { tag: '@nodata' }, () => {
    expect(routes(MEDIC)).toEqual({
      '2 knife': 'melee',
      '7 rifle': 'gun',
      '52 healhand': 'heal',
      // The DART is rifle-shaped — a shot that heals whoever it hits.
      '17 mededart': 'gun',
      // …and the BALL is thrown, on the grenade's own gauge.
      '33 medeball': 'gauge',
      '19 grenade': 'gauge'
    })
  })

  test('the two it buys are the only weapons in the game that HURT NOBODY', { tag: '@nodata' }, () => {
    // The dart's zero is the confirmation the whole damage ladder was read
    // against: it heals, so it must not hurt (weapons/fire.md).
    expect(projectileOf(17)!.damage).toBe(0)
    expect(projectileOf(17)!.heal).toBeGreaterThan(0)
    // The ball's burst runs the same falloff every blast does, backwards.
    expect(lobOf(33)!.heals).toBe(true)
  })

  test('…and the healing career is the reason a MEDIC is worth promoting to', { tag: '@nodata' }, () => {
    // Three ways to put points on where the orderly had one, all still three
    // charges apiece.
    const heals = kitOf(MEDIC).filter(([skill]) => [52, 17, 33].includes(skill))
    expect(heals).toEqual([
      [52, 3],
      [17, 3],
      [33, 3]
    ])
  })
})

test.describe('SURGEON — class 13, medic step 2', () => {
  test('is the top of the career, 120 health, and leads to COMMANDO', { tag: '@nodata' }, () => {
    expect([careerOf(SURGEON), stepOf(SURGEON), maxHealthFor(SURGEON)]).toEqual(['medic', 2, 120])
    expect(promotionsFrom(SURGEON)).toEqual([{ to: 4, cost: 6 }])
  })

  test('buys two GUNS, which is the only offence this career ever gains', { tag: '@nodata' }, () => {
    expect(gainedOver(SURGEON, MEDIC)).toEqual([8, 18])
    expect(lostOver(SURGEON, MEDIC)).toEqual([])
    expect(kitOf(SURGEON)).toEqual([
      [2, UNLIMITED],
      [7, UNLIMITED],
      [52, 3],
      [8, 3],
      [17, 3],
      [33, 3],
      [18, 1],
      [19, 3]
    ])
  })

  test('nothing in this career is inert — it is finished end to end', { tag: '@nodata' }, () => {
    expect(routes(SURGEON)).toEqual({
      '2 knife': 'melee',
      '7 rifle': 'gun',
      '52 healhand': 'heal',
      '8 rfburst': 'gun',
      '17 mededart': 'gun',
      '33 medeball': 'gauge',
      '18 trandart': 'gun',
      '19 grenade': 'gauge'
    })
  })

  test('THE TRANQUILLISER IS HALF-BUILT: it flies, and it does not tranquillise', { tag: '@nodata' }, () => {
    // It answers the key and it takes twenty points off, which is a rifle
    // round. What its NAME promises has nothing behind it: the only status
    // this engine models is poison (docs/todo.md B18).
    expect(projectileOf(18)!.damage).toBe(20 * 128)
    expect(projectileOf(18)!.heal).toBeUndefined()
  })

  test('…and so is the RIFLE BURST: one round a press, not a burst', { tag: '@nodata' }, () => {
    // The exe's burst cap (edi=5, first round ×5) is read and not fielded, so
    // 8 looses a single 15-point round (docs/todo.md B18).
    expect(projectileOf(8)!.pellets).toBeUndefined()
    expect(projectileOf(8)!.damage).toBe(15 * 128)
  })
})
