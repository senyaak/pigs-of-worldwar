// PHASE 002 (domain) — WHAT A THING IS MADE OF. Pure: two name tests over
// the breakable table (lib/game/breakable.ts).
//
// Both exist for presentation and both are play's readings, so both are
// name picks that will be corrected by eye and ear rather than by reading
// the exe: `isStructure` decides whether a hit prints a floating damage
// number, `isMetal` decides whether it RINGS.

import { test, expect } from '@playwright/test'

import { breakableHealth, isMetal, isStructure } from '../src/lib/game/breakable'

test('a STRUCTURE is a piece of one of the seven building sets', { tag: '@nodata' }, () => {
  // Play: the damage number belongs over pigs, buildings and vehicles you
  // can climb into — not over every bush a blast catches. The sets share a
  // two-letter prefix and the piece letter follows it.
  expect(isStructure('STW04_D2')).toBe(true) // a stone wall's door
  expect(isStructure('M1R03PPP')).toBe(true) // a mud-brick roof
  expect(isStructure('BRF01PPP')).toBe(true) // a brick floor
  expect(isStructure('S1S_ST01')).toBe(true) // a stair
  // …and the near misses the pattern must not eat: the letter after the
  // prefix is what tells them apart.
  expect(isStructure('STUMP1')).toBe(false)
  expect(isStructure('SNOWB')).toBe(false)
  expect(isStructure('BRIDGE_S')).toBe(false)
  expect(isStructure('CACTUS')).toBe(false)
  expect(isStructure('TREEB')).toBe(false)
})

test('METAL rings: a machine, a drum, a gate — not a tree', { tag: '@nodata' }, () => {
  // Play's re-reading of I_METAL, 2026-08-24: "взрыв по танку, пушке и
  // прочему" — a blast ON metal, where the note had said "inside a bunker".
  expect(isMetal('BARREL')).toBe(true)
  expect(isMetal('MACHI')).toBe(true)
  expect(isMetal('IRONGATE')).toBe(true)
  expect(isMetal('RADAR')).toBe(true)
  // Case is not the map's strong suit, so neither is it ours.
  expect(isMetal('barrel')).toBe(true)
  // Wood, stone and greenery do not.
  expect(isMetal('TREEB')).toBe(false)
  expect(isMetal('STW04PPP')).toBe(false)
  expect(isMetal('BUSH1')).toBe(false)
  expect(isMetal('DUMMY')).toBe(false)
})

test('every metal name is a thing that actually BREAKS', { tag: '@nodata' }, () => {
  // A name that is not in the health table is a name no target is ever
  // built for, so a typo here would be a sound that can never play. This
  // catches it without a running game.
  const metal = [
    'BARREL', 'IRONGATE', 'GATE', 'GATES', 'MACHI', 'PIST', 'RADAR', 'RADAR1',
    'TV', 'WATSTA', 'WATWHE', 'WINDM', 'MONO', 'LAMP', 'CHECKB', 'CHECKP',
    'MAST', 'BARBWIRE', 'BARBWIR2', 'SWILLARM', 'SW2ARM', 'TUN'
  ]
  for (const name of metal) {
    expect(isMetal(name), name).toBe(true)
    expect(breakableHealth(name), `${name} is breakable`).not.toBeNull()
  }
})
