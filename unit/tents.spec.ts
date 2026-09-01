// PHASE 002 (domain) — the HOSPITAL TENTS. Pure.
//
// A pig that spends its turn inside one wakes up better off, and there are two
// of them: the MEDIC tent gives fifty points back, the MASH tent gives the lot.
// Read out of the exe 2026-09-01 — `Pig::PerTurn` (0x4703A0) calls 0x470340 for
// a pig inside a BUILDING, and that arm asks the building itself through
// 0x43F930, a six-way jump on kind − 1. `damage/notes.md` in the disasm repo
// carried the manual's word for it and the open question of which model was
// which; this is the answer.
//
// The third mission's tents are `TENT_S`, and they are NOT one of the two.

import { test, expect } from '@playwright/test'

import { Game } from '../src/lib/game/game'
import { createIndoors } from '../src/lib/game/indoors'
import { TENT_BOOST, buildingHeal, buildingKind, buildingRoom } from '../src/lib/game/buildings'
import { maxHealthFor } from '../src/lib/game/health'
import type { MapObject } from '../src/lib/formats/pog'
import type { BattleEvent } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'

/** One building of this model at the origin, big enough to walk into. */
const mapWith = (name: string): MapObject[] => [
  {
    id: 1,
    name,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    box: { x: 512, y: 512, z: 512 },
    contents: null
  } as unknown as MapObject
]

/** A SURGEON — class 13, 120 health, so a fifty-point boost is visibly not the
 * whole of it. */
const HURT = 13

const field = (
  name: string,
  health: number
): { pig: Pig; indoors: ReturnType<typeof createIndoors>; events: BattleEvent[] } => {
  const events: BattleEvent[] = []
  const game = new Game({
    players: [{ name: 'A', pigNames: ['one'] }],
    spawns: [{ x: 0, z: 0, heading: 0, pigClass: HURT }]
  })
  const pig = game.players[0].pigs[0]
  pig.health = health
  const indoors = createIndoors(mapWith(name), (event) => events.push(event))
  return { pig, indoors, events }
}

test('the table is the exe jump: only the two M_TENTs pay', { tag: '@nodata' }, () => {
  expect(buildingHeal(buildingKind('M_TENT1')!)).toBe('boost')
  expect(buildingHeal(buildingKind('M_TENT2')!)).toBe('full')
  for (const name of ['BIG_GUN', 'PILLBOX', 'SHELTER', 'TENT_S'])
    expect(buildingHeal(buildingKind(name)!), name).toBe('none')
  // Fifty points — `cmp esi, 0x1900` at 0x47037C.
  expect(TENT_BOOST).toBe(50)
})

test('a MEDIC tent gives fifty back, and no more', { tag: '@nodata' }, () => {
  const { pig, indoors, events } = field('M_TENT1', 10)
  indoors.enter(pig, { x: 0, y: 0, z: 0, heading: 0 } as never)
  indoors.turnStarted(pig)
  expect(pig.health).toBe(60)
  expect(events.filter((one) => one.kind === 'healed')).toHaveLength(1)
})

test('…and a MASH tent gives the whole of it', { tag: '@nodata' }, () => {
  const { pig, indoors } = field('M_TENT2', 10)
  indoors.enter(pig, { x: 0, y: 0, z: 0, heading: 0 } as never)
  indoors.turnStarted(pig)
  expect(pig.health).toBe(maxHealthFor(HURT))
})

test('a MEDIC tent never OVERFILLS — the deficit is the ceiling', { tag: '@nodata' }, () => {
  // Ninety of a hundred and twenty: thirty missing, fifty on offer.
  const { pig, indoors } = field('M_TENT1', 90)
  indoors.enter(pig, { x: 0, y: 0, z: 0, heading: 0 } as never)
  indoors.turnStarted(pig)
  expect(pig.health).toBe(maxHealthFor(HURT))
})

test('a pig already topped up is healed by nothing, and says nothing', { tag: '@nodata' }, () => {
  const { pig, indoors, events } = field('M_TENT2', maxHealthFor(HURT))
  indoors.enter(pig, { x: 0, y: 0, z: 0, heading: 0 } as never)
  indoors.turnStarted(pig)
  expect(pig.health).toBe(maxHealthFor(HURT))
  expect(events.some((one) => one.kind === 'healed')).toBe(false)
})

test('TENT_S IS NOT A HOSPITAL — the tent a player meets first pays nothing', { tag: '@nodata' }, () => {
  // Two of them stand on TRENCH, the third mission, and in the original they
  // are cover and nothing else: kind 6 takes the SHELTER's arm of the jump.
  const { pig, indoors, events } = field('TENT_S', 10)
  indoors.enter(pig, { x: 0, y: 0, z: 0, heading: 0 } as never)
  indoors.turnStarted(pig)
  expect(pig.health).toBe(10)
  expect(events.some((one) => one.kind === 'healed')).toBe(false)
  // …and only ONE pig fits in it, against the MASH tent's four.
  expect(buildingRoom(buildingKind('TENT_S')!)).toBe(1)
  expect(buildingRoom(buildingKind('M_TENT2')!)).toBe(4)
})

test('a pig standing OUTSIDE the tent gets nothing from it', { tag: '@nodata' }, () => {
  const { pig, indoors } = field('M_TENT2', 10)
  // Never entered: the heal is for whoever is IN, which is what `[pig+0x2EC]`
  // being 4 means in the exe.
  indoors.turnStarted(pig)
  expect(pig.health).toBe(10)
})
