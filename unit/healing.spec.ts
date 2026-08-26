// PHASE 002 (domain) — the healing hands. Pure, no Electron.
//
// The numbers are the exe's, read 2026-08-26: the nearest pig within 1024
// units and ±45° of the healer's facing gets `min(missing, 20)` points back,
// the charge goes only on a heal that LANDED, and the turn is not spent
// (lib/game/healing.ts, lib/game/spend.ts).

import { test, expect } from '@playwright/test'

import { Game } from '../src/lib/game/game'
import {
  HEAL_POINTS,
  HEAL_RANGE,
  createHealing,
  healTarget,
  healableAmount
} from '../src/lib/game/healing'
import { maxHealthFor } from '../src/lib/game/health'
import { amountOf } from '../src/lib/game/inventory'
import { SKILL } from '../src/lib/game/skills'
import { endsTurn } from '../src/lib/game/spend'
import type { BattleEvent } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'

/** An ORDERLY at the origin facing +z, and whoever else the spec stands up.
 * Both sides in one game, because the hands carry no team filter. */
const field = (spawns: { x: number; z: number; pigClass?: number }[]): Pig[] => {
  const game = new Game({
    players: [
      { name: 'A', pigNames: ['medic'] },
      { name: 'B', pigNames: spawns.slice(1).map((_, i) => `other${i}`) }
    ],
    spawns: spawns.map((one) => ({ ...one, heading: 0 }))
  })
  return game.players.flatMap((player) => player.pigs)
}

test('the nearest pig in the cone is taken, friend or foe', { tag: '@nodata' }, () => {
  // Two bodies ahead, one nearer; the nearer one wins although both qualify.
  const pigs = field([
    { x: 0, z: 0, pigClass: 11 },
    { x: 0, z: 400 },
    { x: 0, z: 200 }
  ])
  const { chosen } = healTarget(pigs[0], pigs)
  expect(chosen).toBe(pigs[2])
})

test('a body out of the arc loses to a farther one in it', { tag: '@nodata' }, () => {
  // One pig at the healer's back and nearer, one ahead: the cone decides, not
  // the distance — |diff| < 45° of the facing (0x47bcfe).
  const pigs = field([
    { x: 0, z: 0, pigClass: 11 },
    { x: 0, z: -100 },
    { x: 0, z: 600 }
  ])
  const { chosen, candidates } = healTarget(pigs[0], pigs)
  expect(chosen).toBe(pigs[2])
  expect(candidates.find((one) => one.name === pigs[1].name)?.inArc).toBe(false)
})

test('past 1024 units nobody is reached, and a corpse never is', { tag: '@nodata' }, () => {
  const pigs = field([
    { x: 0, z: 0, pigClass: 11 },
    { x: 0, z: HEAL_RANGE + 1 },
    { x: 0, z: 300 }
  ])
  // The near one is dead: the far one is out of range, so nobody is taken.
  pigs[2].health = 0
  const { chosen, candidates } = healTarget(pigs[0], pigs)
  expect(chosen).toBeNull()
  expect(candidates.find((one) => one.name === pigs[1].name)?.inRange).toBe(false)
})

test('the hands put back the missing health, twenty at most', { tag: '@nodata' }, () => {
  const pigs = field([
    { x: 0, z: 0, pigClass: 11 },
    { x: 0, z: 200, pigClass: 0 }
  ])
  const grunt = pigs[1]
  grunt.health = 10
  expect(healableAmount(grunt)).toBe(HEAL_POINTS)
  // Five short of the grunt's fifty: the clamp is the MISSING health, not the
  // twenty — the one capped heal in the game (0x47bf1f).
  grunt.health = 45
  expect(healableAmount(grunt)).toBe(5)
  grunt.health = maxHealthFor(0)
  expect(healableAmount(grunt)).toBe(0)
})

test('a heal that lands spends the charge; a refused press spends nothing', { tag: '@nodata' }, () => {
  const pigs = field([
    { x: 0, z: 0, pigClass: 11 },
    { x: 0, z: 200, pigClass: 0 }
  ])
  const [medic, grunt] = [pigs[0], pigs[1]]
  const events: BattleEvent[] = []
  const clips = Array.from({ length: 83 }, () => ({ frameCount: 25 }))
  const heals = createHealing({ pigs: () => pigs, clips }, (event) => events.push(event))

  // A body at its ceiling refuses the press: no points, no charge, and the
  // report says why (exe: the failure exit past 0x47bd42 debits nothing).
  expect(heals.begin(medic)).toBe(false)
  expect(amountOf(medic.carrying, SKILL.HEALING_HANDS)).toBe(3)
  expect(heals.lastAttempt()?.amount).toBe(0)

  grunt.health = 25
  expect(heals.begin(medic)).toBe(true)
  expect(grunt.health).toBe(45)
  expect(amountOf(medic.carrying, SKILL.HEALING_HANDS)).toBe(2)
  // The number floats off the healed body and the healer plays clip 78 —
  // both ANNOUNCED, like everything the engine shows (lib/game/events.ts).
  expect(events).toContainEqual(expect.objectContaining({ kind: 'healed', amount: 20, pig: grunt.id }))
  expect(events).toContainEqual(expect.objectContaining({ kind: 'clip', pig: medic.id, index: 78 }))
  // …and the pig is held while the clip plays: a second press inside it is
  // refused without touching anything.
  expect(heals.running()).toBe(true)
  expect(heals.begin(medic)).toBe(false)
  expect(amountOf(medic.carrying, SKILL.HEALING_HANDS)).toBe(2)
})

test('the last charge puts the hands away, and none of it spends the turn', { tag: '@nodata' }, () => {
  const pigs = field([
    { x: 0, z: 0, pigClass: 11 },
    { x: 0, z: 200, pigClass: 0 }
  ])
  const [medic, grunt] = [pigs[0], pigs[1]]
  medic.holding = SKILL.HEALING_HANDS
  const clips = Array.from({ length: 83 }, () => ({ frameCount: 25 }))
  const heals = createHealing({ pigs: () => pigs, clips }, () => {})
  for (let use = 0; use < 3; use++) {
    grunt.health = 10
    expect(heals.begin(medic)).toBe(true)
    heals.update(2, medic)
  }
  // The rounds ran out as the clip finished: the holster is the last
  // bayonet's (lib/game/strikes.ts).
  expect(amountOf(medic.carrying, SKILL.HEALING_HANDS)).toBe(0)
  expect(medic.holding).toBeNull()
  // HEALING HANDS is on the keeps-the-turn list (lib/game/spend.ts).
  expect(endsTurn(SKILL.HEALING_HANDS)).toBe(false)
})
