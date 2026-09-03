// WEAPONS — the skills NO CLASS CARRIES.
//
// Thirty-one of the sixty-seven are in nobody's kit (`CLASS_KIT`), and "not in
// a kit" is NOT the same as "unreachable": a CRATE hands skills over by its own
// byte table (0x4D9DC8, `skillFromCrate`), and that table is wider than every
// kit put together. So this file is where the suite asks the question the
// per-class files cannot — **what can end up in a pig's trotters that the fire
// key does not answer?**
//
// The answer is sixteen things, and they are listed by name below — plus one
// that was in the list until this session and is a weapon now: 38 SUPER TNT.

import { test, expect } from '@playwright/test'

import { SKILL, SKILL_COUNT, skillFromCrate } from '../../src/lib/game/skills'
import { isPlanted, lobOf } from '../../src/lib/game/grenade'
import { DAMAGE_UNIT, isGun } from '../../src/lib/game/projectile'
import { weaponLayer } from '../../src/lib/game/controls'
import { endsTurn } from '../../src/lib/game/spend'
import { CARRIED, press, skillLabel } from './kit'

/** Every skill id no class kit holds, ascending. */
const UNCLAIMED = Array.from({ length: SKILL_COUNT }, (_, skill) => skill).filter(
  (skill) => !CARRIED.includes(skill)
)

/** …and every skill a CRATE's byte can hand over. */
const FROM_CRATE = [
  ...new Set(
    Array.from({ length: 64 }, (_, byte) => skillFromCrate(byte)).filter(
      (skill): skill is number => skill !== null
    )
  )
].sort((a, b) => a - b)

const routeOf = (skill: number): string => press(0, skill)

test.describe('the skills no class carries', () => {
  test('there are thirty-one of them, and the kits hold thirty-six', { tag: '@nodata' }, () => {
    expect(CARRIED).toHaveLength(36)
    expect(UNCLAIMED).toHaveLength(31)
    expect(CARRIED.length + UNCLAIMED.length).toBe(SKILL_COUNT)
  })

  test('the GRENADE family is the biggest piece of it, and every one works', { tag: '@nodata' }, () => {
    // 21..25 have full rows and answer the key; they simply have no career.
    // A crate is the only way to hold one.
    for (const skill of [21, 22, 23, 24, 25]) {
      expect(lobOf(skill), skillLabel(skill)).not.toBeNull()
      expect(routeOf(skill), skillLabel(skill)).toBe('gauge')
      expect(FROM_CRATE).toContain(skill)
    }
  })

  test('…and so do the ROCKET and the ANTI-PERSONNEL MINE', { tag: '@nodata' }, () => {
    expect(isGun(15)).toBe(true)
    expect(routeOf(15)).toBe('gun')
    expect(routeOf(36)).toBe('lob')
    expect(endsTurn(36)).toBe(false)
  })
})

test.describe('THE CRATE HOLE — what a pickup can put in a hand that does nothing', () => {
  // This is the list the per-class files cannot produce: a crate reaches
  // further than any kit, so a skill can be inert AND reachable. Every entry
  // is read-and-not-built rather than unknown — the artillery family (39..44)
  // has no delivery at all, the emplaced weapons (45..49) belong to the
  // pillbox and the vehicle, and 16/32/34 are rows with no arm here.
  const HOLE = [0, 16, 31, 32, 34, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49]

  test('a crate can hand over sixteen things the fire key ignores', { tag: '@nodata' }, () => {
    const inert = FROM_CRATE.filter((skill) => routeOf(skill) === 'inert')
    // Named, not counted: when one is built this fails with the list, and
    // whoever built it deletes a number.
    expect(inert.map(skillLabel)).toEqual(HOLE.map(skillLabel))
  })

  test('…and only ONE of them is also in somebody kit', { tag: '@nodata' }, () => {
    // 31 AIRBURST — PYROTECH, COMMANDO, HERO and up carry it, so it is the
    // one a player meets without a crate (docs/todo.md B18).
    expect(HOLE.filter((skill) => CARRIED.includes(skill))).toEqual([31])
  })

  test('whether a shipped MAP actually places such a crate is not asked here', { tag: '@nodata' }, () => {
    // The byte table says it CAN; which bytes the 61 POGs really carry is a
    // measurement over the installation, which is `e2e/`'s half of the suite
    // and not this one. What is pinned here is the table.
    expect(skillFromCrate(0)).toBe(SKILL.NONE)
    expect(skillFromCrate(18)).toBe(SKILL.GRENADE)
    expect(skillFromCrate(34)).toBe(SKILL.TNT)
  })
})

test.describe('the TOOLS, which are skills and are not weapons', () => {
  test('SKIP TURN is the only one the fire key answers', { tag: '@nodata' }, () => {
    expect(routeOf(SKILL.SKIP_TURN)).toBe('skip')
    // …and it is the one skill always in the hands, whatever the pig carries
    // (ui/skillMenu.ts).
    expect(endsTurn(SKILL.SKIP_TURN)).toBe(true)
  })

  test('the other six answer somewhere else, or not yet at all', { tag: '@nodata' }, () => {
    // 60 the VEHICLE's door and 61 the BUILDING's are the JUMP key's business
    // (lib/game/buildings.ts); 62 GET OUT and 64 BINOCULARS ride the same
    // machinery; 63 MAP VIEW is a camera mode and 66 SURRENDER a menu row.
    // None of them is a fire-key weapon, so `inert` here is correct rather
    // than a hole.
    for (const skill of [60, 61, 62, 63, 64, 66]) {
      expect(routeOf(skill), skillLabel(skill)).toBe('inert')
      expect(endsTurn(skill), skillLabel(skill)).toBe(false)
    }
  })

  test('…and none of the six is in a kit or a crate', { tag: '@nodata' }, () => {
    for (const skill of [60, 61, 62, 63, 64, 65, 66]) {
      expect(CARRIED, skillLabel(skill)).not.toContain(skill)
      expect(FROM_CRATE, skillLabel(skill)).not.toContain(skill)
    }
  })
})

test.describe('38 SUPER TNT — the biggest weapon in the game, and nothing carries it', () => {
  test('it is PLANTED, and it answers the fire key like the TNT it is', { tag: '@nodata' }, () => {
    // It sat INERT for months: `weaponLayer` put it in the charge family
    // through `isPlanted`, but `attack.ts` opens that branch on
    // `isLobbed || isMine` and 38 had no row in `LOBS`. Play named it —
    // "супер тнт — там огромный отброс и урон" — and the row was there all
    // along.
    expect(weaponLayer(38)).toBe('charge')
    expect(isPlanted(38)).toBe(true)
    expect(lobOf(38)).not.toBeNull()
    expect(routeOf(38)).toBe('lob')
    // The same four seconds to get clear, and it keeps the turn to spend them.
    expect(endsTurn(38)).toBe(false)
  })

  test('TWO HUNDRED points and the hardest shove in the table', { tag: '@nodata' }, () => {
    const superTnt = lobOf(38)!
    const tnt = lobOf(37)!
    expect(superTnt.damage).toBe(200 * DAMAGE_UNIT)
    expect(superTnt.force).toBe(6500)
    // Four times TNT's damage, and harder again than its 5200 — the largest
    // of either column in the whole weapon table.
    expect(superTnt.damage).toBe(tnt.damage * 4)
    expect(superTnt.force).toBeGreaterThan(tnt.force)
    // Everything else is TNT's row to the byte: it goes down at the trotters
    // on the same clock.
    expect([superTnt.speed, superTnt.arming, superTnt.fuse, superTnt.blast]).toEqual([
      tnt.speed,
      tnt.arming,
      tnt.fuse,
      tnt.blast
    ])
  })

  test('…and NOBODY can be given one — no kit, no crate byte', { tag: '@nodata' }, () => {
    // The crate table skips it: byte 34 hands over 37 and byte 35 hands over
    // 39. So it is a complete weapon with no door, in the original as much as
    // here, and `pow.give(38)` is the only way to hold one.
    expect(CARRIED).not.toContain(38)
    expect(FROM_CRATE).not.toContain(38)
    expect(skillFromCrate(34)).toBe(37)
    expect(skillFromCrate(35)).toBe(39)
  })
})
