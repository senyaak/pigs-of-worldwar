// VEHICLES — the other class a pig climbs into.
//
// A parked tank is a pillbox with a different table behind it, and this file
// pins the table. What it does NOT cover is driving: nothing here moves, rams
// or picks anybody up, and `docs/todo.md` B28 says so in full.
//
// The reading is `weapons/emplaced.md` plus the vehicle table at 0x4D94A0,
// which nothing had opened before 2026-09-03.

import { test, expect } from '@playwright/test'

import {
  VEHICLE_NAMES,
  turretRange,
  vehicleCarries,
  vehicleHealth,
  vehicleKind,
  vehicleRoom,
  vehicleSkills
} from '../src/lib/game/vehicles'
import { mountArmed, mountBarrel, mountHeal, mountRoom, mountSkills } from '../src/lib/game/mounts'
import { barrelRange, buildingKind } from '../src/lib/game/buildings'
import { createIndoors } from '../src/lib/game/indoors'
import { DAMAGE_UNIT } from '../src/lib/game/projectile'
import { lobOf } from '../src/lib/game/grenade'
import { weaponOf } from '../src/lib/game/weapons'
import { press } from './weapons/kit'
import type { MapObject } from '../src/lib/formats/pog'

const mapWith = (name: string): MapObject[] => [
  {
    id: 1,
    name,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    box: { x: 640, y: 384, z: 384 },
    contents: null
  } as unknown as MapObject
]

/** The kinds, by the name the exe's own table gives them. */
const AMLAUNCH = 0
const AM_TANK = 1
const BOAT = 2
const TANK = 3
const CARRY = 4

test.describe('the vehicle table, 0x4D94A0', () => {
  test('seven kinds in the exe order, and the KIND is the offset', { tag: '@nodata' }, () => {
    expect(VEHICLE_NAMES).toHaveLength(7)
    expect(vehicleKind('TANK')).toBe(TANK)
    expect(vehicleKind('CARRY')).toBe(CARRY)
    expect(vehicleKind('AMLAUNCH')).toBe(AMLAUNCH)
    // Not a vehicle, and the two name lists must not overlap — `indoors.ts`
    // asks for a building first and would shadow one that did.
    expect(vehicleKind('PILLBOX')).toBeNull()
    expect(buildingKind('TANK')).toBeNull()
  })

  test('everything on the ground takes a HUNDRED AND FIFTY', { tag: '@nodata' }, () => {
    for (const kind of [AMLAUNCH, AM_TANK, BOAT, TANK, CARRY])
      expect(vehicleHealth(kind) / DAMAGE_UNIT, `kind ${kind}`).toBe(150)
    // …and the two that FLY take one point. They are not scenery: an AIR
    // STRIKE spawns kind 5 to fly the bomb in, which is why it is made of
    // paper and why no map places one.
    expect(vehicleHealth(5) / DAMAGE_UNIT).toBe(1)
    expect(vehicleHealth(6) / DAMAGE_UNIT).toBe(1)
  })

  test('the second column is CAPACITY, and it names the two CARRIERS', { tag: '@nodata' }, () => {
    expect(vehicleRoom(AMLAUNCH)).toBe(10)
    expect(vehicleRoom(CARRY)).toBe(10)
    for (const kind of [AM_TANK, BOAT, TANK]) expect(vehicleRoom(kind), `kind ${kind}`).toBe(1)
    // Which is the same split the ram switch makes (0x478580) and the same one
    // the manual describes: carriers pick chums up, tanks knock them flying.
    expect(vehicleCarries(AMLAUNCH)).toBe(true)
    expect(vehicleCarries(CARRY)).toBe(true)
    expect(vehicleCarries(TANK)).toBe(false)
  })
})

test.describe('the turret, which only two kinds have', () => {
  test('AM_TANK and TANK elevate; a carrier and a boat do not', { tag: '@nodata' }, () => {
    expect(turretRange(AM_TANK)).toEqual([0, 1024])
    expect(turretRange(TANK)).toEqual([0, 1024])
    for (const kind of [AMLAUNCH, BOAT, CARRY, 5, 6])
      expect(turretRange(kind), `kind ${kind}`).toBeNull()
  })

  test('A TURRET REACHES TWICE AS HIGH AS A PILLBOX — AND CANNOT LOOK DOWN', { tag: '@nodata' }, () => {
    const turret = turretRange(TANK)!
    const pillbox = barrelRange(4)!
    expect(turret[1]).toBe(pillbox[1] * 2)
    // The pillbox is the ONLY mount in the game with a negative minimum: a tank
    // cannot depress its gun at all, so nothing below the horizon is a target.
    expect(turret[0]).toBe(0)
    expect(pillbox[0]).toBeLessThan(0)
  })
})

test.describe('a mount is a mount, whichever class it is', () => {
  test('the dispatch takes both, and never crosses the tables', { tag: '@nodata' }, () => {
    // Kind 3 means M_TENT2 to a building and TANK to a vehicle — the bug this
    // dispatch exists to prevent.
    expect(mountSkills('building', 3)).toEqual([])
    expect(mountSkills('vehicle', 3)).toEqual([47, 48, 49])
    expect(mountRoom('building', 3)).toBe(4)
    expect(mountRoom('vehicle', 3)).toBe(1)
    expect(mountBarrel('building', 3)).toBeNull()
    expect(mountBarrel('vehicle', 3)).toEqual([0, 1024])
  })

  test('A VEHICLE NEVER HEALS, whatever it is', { tag: '@nodata' }, () => {
    // `Pig::PerTurn` runs the heal for state 4 alone (0x4703b2), so the tent
    // arm is out of reach from a driving seat.
    for (let kind = 0; kind < 7; kind++)
      expect(mountHeal('vehicle', kind), `kind ${kind}`).toBe('none')
    // …where a building's own table still pays on the two M_TENTs.
    expect(mountHeal('building', 2)).toBe('boost')
    expect(mountHeal('building', 3)).toBe('full')
  })

  test('only the two tanks are ARMED, and a carrier offers nothing yet', { tag: '@nodata' }, () => {
    expect(mountArmed('vehicle', TANK)).toBe(true)
    expect(mountArmed('vehicle', AM_TANK)).toBe(true)
    // `[gap]`, not a reading: the manual gives a carrier the EJECT skill, which
    // is 62 and has no fire arm at all (docs/todo.md B28).
    expect(mountArmed('vehicle', CARRY)).toBe(false)
    expect(mountArmed('vehicle', AMLAUNCH)).toBe(false)
  })
})

test.describe('a vehicle is something to get into', () => {
  test('the loader picks a TANK up the way it picks a shelter up', { tag: '@nodata' }, () => {
    const indoors = createIndoors(mapWith('TANK'), () => {})
    const all = indoors.all()
    expect(all).toHaveLength(1)
    expect(all[0].mount).toBe('vehicle')
    expect(all[0].kind).toBe(TANK)
  })

  test('…and a SHELTER still comes out a building', { tag: '@nodata' }, () => {
    const all = createIndoors(mapWith('SHELTER'), () => {}).all()
    expect(all).toHaveLength(1)
    expect(all[0].mount).toBe('building')
    expect(all[0].kind).toBe(buildingKind('SHELTER'))
  })

  test('a CARRY holds ten where a tank holds one', { tag: '@nodata' }, () => {
    const carrier = createIndoors(mapWith('CARRY'), () => {}).all()[0]
    expect(mountRoom(carrier.mount, carrier.kind)).toBe(10)
  })
})

test.describe("the tank's three weapons", () => {
  test('48 is the BAZOOKA with a softer shove and nothing else changed', { tag: '@nodata' }, () => {
    const tank = lobOf(48)!
    const carried = lobOf(29)!
    expect(tank.damage).toBe(carried.damage)
    expect(tank.blast).toBe(carried.blast)
    expect(tank.speed).toBe(carried.speed)
    expect(tank.force).toBe(2600)
    expect(carried.force).toBe(3900)
  })

  test('49 is the WEAKEST lob in the game, at fifteen points', { tag: '@nodata' }, () => {
    expect(lobOf(49)!.damage / DAMAGE_UNIT).toBe(15)
    expect(lobOf(47)!.damage / DAMAGE_UNIT).toBe(40)
  })

  test('47 and 48 have the GAUGE and 49 does not', { tag: '@nodata' }, () => {
    // Record +0x14, the same byte that puts 28 MORTAR on its pitch alone.
    expect(weaponOf(47).power).toBeTruthy()
    expect(weaponOf(48).power).toBeTruthy()
    expect(weaponOf(49).power).toBeFalsy()
    expect(weaponOf(28).power).toBeFalsy()
  })

  test('47 is the one with a FUSE under it — five seconds', { tag: '@nodata' }, () => {
    expect(lobOf(47)!.fuse).toBe(125)
    expect(lobOf(48)!.fuse).toBe(0)
    expect(lobOf(49)!.fuse).toBe(0)
  })
})

test.describe('THE GATE covers the lob branch too', () => {
  test('all three are silent on foot', { tag: '@nodata' }, () => {
    // The pillbox's pair are guns and the tank's three are lobs, so the ladder
    // answers them on different branches — and the mount test has to be on
    // both or the tank's three would fire out of a pig's trotters.
    for (const skill of [47, 48, 49]) expect(press(0, skill), `${skill}`).toBe('inert')
  })

  test('…and from a seat they answer, each on its own door', { tag: '@nodata' }, () => {
    expect(press(0, 47, true)).toBe('gauge')
    expect(press(0, 48, true)).toBe('gauge')
    // No gauge to fill: the press throws at once, on the pitch alone.
    expect(press(0, 49, true)).toBe('lob')
  })
})
