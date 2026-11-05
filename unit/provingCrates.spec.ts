// A TAKEN CRATE IS BACK AT THE START OF THE NEXT TURN — the rule, on the proving
// ground's own records with nothing around it.
//
// `[play]`, 2026-11-02 (docs/facts/proving-ground.md): "one round per crate per
// turn". The whole chain through the handover, on the real map, is
// e2e/000/proving-ground-headless.spec.ts; what is drawn is
// e2e/002/proving-crates.spec.ts.

import { test, expect } from '@playwright/test'

import type { BattleEvent } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'
import { MAX_SLOTS, amountOf, give, spend } from '../src/lib/game/inventory'
import type { Pickup } from '../src/lib/game/pickups'
import { CRATE_ROUNDS, CRATE_SKILLS, provingGroundObjects } from '../src/lib/game/provingGround'
import { createScenery } from '../src/lib/game/scenery'
import type { Scenery } from '../src/lib/game/scenery'
import { SKILL } from '../src/lib/game/skills'

const SKILL_IN_CRATE = SKILL.TNT

const pigAt = (x: number, z: number): Pig =>
  ({
    id: 0,
    health: 50,
    carrying: [],
    holding: null,
    position: { x, y: 0, z }
  }) as unknown as Pig

interface Bench {
  scenery: Scenery
  heard: BattleEvent[]
  crate: Pickup
  /** Standing in the crate, carrying nothing. */
  pig: Pig
}

const bench = (returning: boolean): Bench => {
  const heard: BattleEvent[] = []
  const scenery = createScenery(
    provingGroundObjects(),
    false,
    returning,
    () => {
      throw new Error('no proving-ground crate carries a command that clears the pig')
    },
    () => {
      throw new Error('nothing drops in on the proving ground')
    },
    (event) => heard.push(event)
  )
  const crate = scenery.remaining().find((one) => one.skill === SKILL_IN_CRATE)
  if (!crate) throw new Error(`no crate of skill ${SKILL_IN_CRATE}`)
  return { scenery, heard, crate, pig: pigAt(crate.x, crate.z) }
}

const count = (heard: BattleEvent[], kind: BattleEvent['kind']): number =>
  heard.filter((event) => event.kind === kind).length

const onGround = ({ scenery, crate }: Bench): boolean => scenery.remaining().some((one) => one.id === crate.id)

const goneList = ({ scenery }: Bench): number[] => scenery.obstacles.changes().gone

/** A pig's pockets full of everything but the crate's own skill. */
const fill = (pig: Pig): void => {
  for (const skill of CRATE_SKILLS) {
    if (pig.carrying.length === MAX_SLOTS) return
    if (skill !== SKILL_IN_CRATE) give(pig.carrying, skill, 1)
  }
}

test('a taken crate hands over one round and stays off the ground for the rest of the turn', { tag: '@nodata' }, () => {
  const one = bench(true)
  const { scenery, heard, crate, pig } = one

  expect(scenery.collect(pig)).toBe(SKILL_IN_CRATE)
  expect(count(heard, 'collected')).toBe(1)
  expect(amountOf(pig.carrying, SKILL_IN_CRATE)).toBe(CRATE_ROUNDS)
  expect(onGround(one)).toBe(false)
  expect(goneList(one)).toContain(crate.id)
  // Hidden and not deleted: a crate that returns needs its mesh (three/props.ts).
  expect(heard).toContainEqual({ kind: 'shown', id: crate.id, visible: false })
  expect(count(heard, 'taken')).toBe(0)

  // Stood on, frame after frame: [play] "one round per crate per turn".
  for (let frame = 0; frame < 60; frame++) expect(scenery.collect(pig)).toBeNull()
  expect(count(heard, 'collected')).toBe(1)
  expect(amountOf(pig.carrying, SKILL_IN_CRATE)).toBe(CRATE_ROUNDS)
})

test('at the start of the next turn it is back, drawn and takeable, for a second round', { tag: '@nodata' }, () => {
  const one = bench(true)
  const { scenery, heard, crate, pig } = one
  scenery.collect(pig)

  scenery.turnStarted()
  expect(onGround(one)).toBe(true)
  expect(goneList(one)).not.toContain(crate.id)
  expect(heard.at(-1)).toEqual({ kind: 'shown', id: crate.id, visible: true })

  expect(scenery.collect(pig)).toBe(SKILL_IN_CRATE)
  expect(amountOf(pig.carrying, SKILL_IN_CRATE)).toBe(2 * CRATE_ROUNDS)
  expect(count(heard, 'collected')).toBe(2)

  // A turn start with nothing away announces nothing.
  scenery.turnStarted()
  const said = heard.length
  scenery.turnStarted()
  expect(heard.length).toBe(said)
})

test('a pig with fifteen skills is refused and the crate stays', { tag: '@nodata' }, () => {
  const one = bench(true)
  const { scenery, heard, crate, pig } = one
  fill(pig)
  // exe: 0x465787, the sixteenth skill is refused (lib/game/inventory.ts).
  expect(pig.carrying.length).toBe(MAX_SLOTS)

  expect(scenery.collect(pig)).toBeNull()
  scenery.collect(pig)
  expect(count(heard, 'refused')).toBe(1)
  expect(count(heard, 'collected')).toBe(0)
  expect(onGround(one)).toBe(true)
  expect(goneList(one)).not.toContain(crate.id)
  expect(amountOf(pig.carrying, SKILL_IN_CRATE)).toBe(0)
})

test('a crate that has come back says its refusal anew', { tag: '@nodata' }, () => {
  const { scenery, heard, pig } = bench(true)
  fill(pig)
  scenery.collect(pig)
  expect(count(heard, 'refused')).toBe(1)

  // Room made, the crate taken, and the pockets full again by the time it is back.
  spend(pig.carrying, pig.carrying[0].skill)
  scenery.collect(pig)
  expect(count(heard, 'collected')).toBe(1)
  spend(pig.carrying, SKILL_IN_CRATE)
  fill(pig)
  scenery.turnStarted()

  scenery.collect(pig)
  expect(count(heard, 'refused')).toBe(2)
})

test('control: where crates do not come back, a taken one is gone for good', { tag: '@nodata' }, () => {
  const one = bench(false)
  const { scenery, heard, crate, pig } = one
  scenery.collect(pig)
  expect(heard).toContainEqual({ kind: 'taken', id: crate.id })
  expect(count(heard, 'shown')).toBe(0)

  scenery.turnStarted()
  expect(onGround(one)).toBe(false)
  expect(goneList(one)).toContain(crate.id)
  expect(count(heard, 'shown')).toBe(0)
  expect(scenery.collect(pig)).toBeNull()
  expect(amountOf(pig.carrying, SKILL_IN_CRATE)).toBe(CRATE_ROUNDS)
})
