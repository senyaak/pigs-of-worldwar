// THE PILLBOX — the first thing in the game that has a weapon of its own.
//
// Everything else a pig fires belongs to the pig. These two do not: skills 45
// HEAVY M-GUN and 46 FLAME THROWER carry model **0** and attack clip **-1** in
// their records — nothing in the trotters, no firing animation — and their
// arms open on one test, `[pig+0x170]`, the thing the pig is sitting in
// (`weapons/emplaced.md`). Off a mount they do nothing at all: no round, no
// sound, no refusal.
//
// So this file asks the pair of questions the rest of the suite cannot: what
// the BUILDING offers, and what changes about a pig once it is inside one.

import { test, expect } from '@playwright/test'

import { barrelRange, buildingArmed, buildingSkills } from '../src/lib/game/buildings'
import { BARREL_CLEAR, barrelMuzzle, isEmplaced } from '../src/lib/game/barrel'
import { AIM_LIMIT, clampAim, readyAim } from '../src/lib/game/aim'
import { DAMAGE_UNIT, damageOf, isGun, projectileOf } from '../src/lib/game/projectile'
import { weaponLayer } from '../src/lib/game/controls'
import { skillFromCrate } from '../src/lib/game/skills'
import { endsTurn } from '../src/lib/game/spend'
import { press } from './weapons/kit'
import type { Obstacle } from '../src/lib/game/obstacles'

/** A square pillbox at the origin, 200 a side and 300 tall, unturned. */
const box = (turn = 0): Obstacle => ({
  id: 1,
  x: 0,
  z: 0,
  top: -300,
  bottom: 0,
  halfX: 100,
  halfZ: 100,
  turn,
  sloped: false,
  surface: null
})

test.describe('what the building offers', () => {
  test('the PILLBOX is the only kind with a weapon, and it has two', { tag: '@nodata' }, () => {
    expect(buildingSkills(4)).toEqual([45, 46])
    expect(buildingArmed(4)).toBe(true)
    // The other five offer nothing to do — a shelter's menu is SKIP TURN and
    // nothing else, which is play's own reading of it.
    for (const kind of [1, 2, 3, 5, 6]) {
      expect(buildingSkills(kind), `kind ${kind}`).toEqual([])
      expect(buildingArmed(kind), `kind ${kind}`).toBe(false)
    }
  })

  test('…and the BIG GUN has a barrel that moves and no weapon read', { tag: '@nodata' }, () => {
    // `[gap]`: `Building::ChangeAim` elevates for kind−1 of 0 as well as 3, so
    // the big gun points at something. WHAT it fires is a hint (the AI scores
    // 39 ARTILLERY RANGE differently for a pig inside one, 0x4429c9) and not a
    // reading, so the menu stays empty rather than guessing.
    expect(barrelRange(1)).not.toBeNull()
    expect(buildingSkills(1)).toEqual([])
  })
})

test.describe('the barrel, which belongs to the building and not to the pig', () => {
  test('only TWO kinds elevate, and the exe says so by clamping to zero', { tag: '@nodata' }, () => {
    // 0x440221: kind−1 of 0 gets [0, 0x200], of 3 gets [−0x200, 0x200], and
    // every other kind [0, 0] — the table's way of saying "no gun here".
    expect(barrelRange(1)).toEqual([0, 512])
    expect(barrelRange(4)).toEqual([-512, 512])
    for (const kind of [2, 3, 5, 6]) expect(barrelRange(kind), `kind ${kind}`).toBeNull()
  })

  test('SITTING IN A PILLBOX COSTS HALF THE ELEVATION', { tag: '@nodata' }, () => {
    const barrel = barrelRange(4)
    // On its feet a pig points anywhere in ±1023; at the gun, ±512.
    expect(clampAim(45, 900)).toBe(900)
    expect(clampAim(45, 900, barrel)).toBe(512)
    expect(clampAim(45, -900, barrel)).toBe(-512)
    expect(AIM_LIMIT).toBeGreaterThan(512)
    // …and the BIG GUN cannot depress at all.
    expect(clampAim(45, -300, barrelRange(1))).toBe(0)
  })

  test('the mount clamps AFTER the weapon, the way the exe stacks them', { tag: '@nodata' }, () => {
    // `Pig::ChangeAimAngle` does the pig's clamp and the per-skill floors, then
    // hands the same delta to `Building::ChangeAim` (0x46a8c1). 28 MORTAR
    // cannot point below 45° up — 512 — which is exactly the pillbox's ceiling,
    // so the two rules meet without contradicting.
    expect(clampAim(28, 0)).toBe(512)
    expect(clampAim(28, 0, barrelRange(4))).toBe(512)
  })

  test('both emplaced guns come up LEVEL', { tag: '@nodata' }, () => {
    // `Pig::ReadyWeapon` 0x46912c sends 6..18 and 45 and 46 to zero, where
    // everything else comes up at 45°.
    expect(readyAim(45)).toBe(0)
    expect(readyAim(46)).toBe(0)
    expect(readyAim(19)).toBeGreaterThan(0)
  })
})

test.describe('where the round is born', () => {
  test('OUTSIDE the box, along the way the pig is facing', { tag: '@nodata' }, () => {
    // Heading 0 is +z (forward is `(sin h, cos h)`, lib/game/movement.ts).
    const north = barrelMuzzle(box(), 0)
    expect(north.x).toBeCloseTo(0)
    expect(north.z).toBeCloseTo(100 + BARREL_CLEAR)
    // …and a quarter turn puts it out of the other wall.
    const east = barrelMuzzle(box(), Math.PI / 2)
    expect(east.x).toBeCloseTo(100 + BARREL_CLEAR)
    expect(east.z).toBeCloseTo(0)
  })

  test('…and it clears the wall on the DIAGONAL too', { tag: '@nodata' }, () => {
    // The corner is the case a plain "half-width forward" gets wrong the other
    // way: the ray leaves through a FACE, so the distance out is longer than
    // the half-width, not shorter.
    const corner = barrelMuzzle(box(), Math.PI / 4)
    const out = Math.hypot(corner.x, corner.z)
    expect(out).toBeGreaterThan(100 + BARREL_CLEAR)
    // Never so far that the gun fires from the next field: a square box's
    // longest exit is its own diagonal half.
    expect(out).toBeLessThan(Math.hypot(100, 100) + BARREL_CLEAR + 1)
  })

  test('a TURNED box is left through its own wall, not the world axes', { tag: '@nodata' }, () => {
    // Turn the box 45° and fire along +z: that is now the box's own diagonal,
    // so the round has further to travel than it did through the flat face.
    const turned = barrelMuzzle(box(Math.PI / 4), 0)
    const flat = barrelMuzzle(box(), 0)
    expect(turned.z).toBeGreaterThan(flat.z)
  })

  test('the muzzle is high on the wall, not in the middle of it', { tag: '@nodata' }, () => {
    // Y counts DOWN, so the roof is the smaller number: a slit a quarter of the
    // way down sits above the box's own centre.
    const at = barrelMuzzle(box(), 0)
    expect(at.y).toBeGreaterThan(-300)
    expect(at.y).toBeLessThan(-150)
  })
})

test.describe('the two weapons themselves', () => {
  test('the HMG is the RIFLE at eight points instead of twenty', { tag: '@nodata' }, () => {
    expect(isGun(45)).toBe(true)
    expect(weaponLayer(45)).toBe('gun')
    const hmg = projectileOf(45)!
    const rifle = projectileOf(7)!
    expect(hmg.speed).toBe(rifle.speed)
    expect(damageOf(45)).toBe(8)
    expect(damageOf(7)).toBe(20)
    expect(hmg.damage).toBe(8 * DAMAGE_UNIT)
  })

  test('…and the FLAME THROWER is four, at half the speed', { tag: '@nodata' }, () => {
    const flame = projectileOf(46)!
    expect(flame.speed).toBe(150)
    expect(damageOf(46)).toBe(4)
  })

  test('NEITHER THROWS ANYBODY — row +0x08 is zero on both', { tag: '@nodata' }, () => {
    // Which is the opposite of what the names suggest, and the thing to watch
    // for in play: a pillbox is a cheap position, not a hard-hitting one.
    expect(projectileOf(45)!.blast).toBe(0)
    expect(projectileOf(46)!.blast).toBe(0)
  })

  test('firing one ENDS the turn, like every other gun', { tag: '@nodata' }, () => {
    expect(endsTurn(45)).toBe(true)
    expect(endsTurn(46)).toBe(true)
  })
})

test.describe('THE GATE — off a mount they do nothing at all', () => {
  test('the five emplaced skills are named, and the JETPACK is not one', { tag: '@nodata' }, () => {
    for (const skill of [45, 46, 47, 48, 49]) expect(isEmplaced(skill), `${skill}`).toBe(true)
    // 50 shares the empty model and has no such gate on its arm.
    expect(isEmplaced(50)).toBe(false)
    expect(isEmplaced(7)).toBe(false)
    expect(isEmplaced(null)).toBe(false)
  })

  test('on its feet a pig pressing FIRE with one gets NOTHING', { tag: '@nodata' }, () => {
    // Not a refusal message, not a click — the exe's arm jumps straight to the
    // "nothing happened" tail. And it is reachable: a crate hands both over.
    expect(press(0, 45)).toBe('inert')
    expect(press(0, 46)).toBe('inert')
    expect(skillFromCrate(41)).toBe(45)
    expect(skillFromCrate(42)).toBe(46)
  })

  test('…and from a SEAT the same press arms the gun', { tag: '@nodata' }, () => {
    expect(press(0, 45, true)).toBe('gun')
    expect(press(0, 46, true)).toBe('gun')
  })

  test('a seat does not turn an ordinary weapon into an emplaced one', { tag: '@nodata' }, () => {
    // The gate is on the SKILL, not on the seat: sitting in a pillbox with a
    // rifle is still a rifle.
    expect(press(0, 7, true)).toBe('gun')
    expect(press(0, 7)).toBe('gun')
  })
})
