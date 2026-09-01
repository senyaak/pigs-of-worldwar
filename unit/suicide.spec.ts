// PHASE 002 (domain) — SUICIDE, skill 51. Pure.
//
// Read out of the exe 2026-09-01, arm 0x47CBA0: the pig is taken out of the
// world FIRST (0x4A8BA0 / 0x4A9EE0 / 0x4A9E50) and only then is the blast
// spawned — `0x487AD0(x, z, 0x56, 0x800, 1, 0x1450, 0x1900)`, fifty points
// over a field of 2048. So it does not take its own fifty; it simply dies,
// and everybody standing near it pays. lib/game/suicide.ts.

import { test, expect } from '@playwright/test'

import { Game } from '../src/lib/game/game'
import { SACRIFICE_BLAST, SACRIFICE_DAMAGE, createSacrifice } from '../src/lib/game/suicide'
import { SUICIDE_EFFECT_ID } from '../src/lib/game/blast'
import { blastReach } from '../src/lib/game/grenade'
import { isDead } from '../src/lib/game/health'
import { amountOf, give } from '../src/lib/game/inventory'
import { SKILL } from '../src/lib/game/skills'
import { endsTurn } from '../src/lib/game/spend'
import { weaponOf } from '../src/lib/game/weapons'
import type { BattleEvent } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'

/** An ENGINEER at the origin and whoever else the spec stands up beside it. */
const squad = (spawns: { x: number; z: number; pigClass?: number }[]): Pig[] => {
  const others = spawns.slice(1).map((_, i) => `other${i}`)
  const game = new Game({
    players: [
      { name: 'A', pigNames: ['sapper'] },
      // A side with nobody on it is refused, so a lone pig is a one-sided
      // battle — which is all these specs need.
      ...(others.length > 0 ? [{ name: 'B', pigNames: others }] : [])
    ],
    spawns: spawns.map((one) => ({ ...one, heading: 0 }))
  })
  return game.players.flatMap((player) => player.pigs)
}

const field = (
  pigs: Pig[],
  training = false
): { go: ReturnType<typeof createSacrifice>; events: BattleEvent[] } => {
  const events: BattleEvent[] = []
  const go = createSacrifice(
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training,
      // No clip timings: the gesture has no beat to wait for and lands at
      // the press, which is what a bare spec wants and what the exe does
      // anyway (`begin`).
      clips: []
    },
    (event) => events.push(event)
  )
  return { go, events }
}

test('the numbers are the arm literals: fifty over 2048, effect 0x56', { tag: '@nodata' }, () => {
  expect(SACRIFICE_DAMAGE).toBe(6400)
  expect(SACRIFICE_BLAST).toBe(2048)
  expect(SUICIDE_EFFECT_ID).toBe(0x56)
  // The gesture is clip 81, "Hari Kiri" — the record's own attack clip.
  expect(weaponOf(SKILL.SUICIDE).attackClip).toBe(81)
  // …and using it spends the turn, which the general rule already gives.
  expect(endsTurn(SKILL.SUICIDE)).toBe(true)
})

test('the pig DIES, and it does not take its own blast', { tag: '@nodata' }, () => {
  const pigs = squad([{ x: 0, z: 0, pigClass: 6 }])
  const { go, events } = field(pigs)
  // Class 6 ENGINEER carries exactly one out of its own kit (lib/game/kits.ts)
  // — nothing is handed to it here.
  expect(amountOf(pigs[0].carrying, SKILL.SUICIDE)).toBe(1)
  expect(go.begin(pigs[0])).toBe(true)
  expect(isDead(pigs[0])).toBe(true)
  // ONE damage line against it, and it is the whole of its health — not that
  // plus fifty off the burst it is standing in.
  const mine = events.filter((one) => one.kind === 'damaged' && one.pig === pigs[0].id)
  expect(mine).toHaveLength(1)
  expect(events.some((one) => one.kind === 'killed' && one.pig === pigs[0].id)).toBe(true)
  expect(events.some((one) => one.kind === 'blasted' && one.effect === SUICIDE_EFFECT_ID)).toBe(true)
  // …and the charge went with it.
  expect(amountOf(pigs[0].carrying, SKILL.SUICIDE)).toBe(0)
})

test('whoever is standing next to it pays the fifty', { tag: '@nodata' }, () => {
  const pigs = squad([
    { x: 0, z: 0, pigClass: 6 },
    // Inside the core (512), so the full amount.
    { x: 0, z: 300 },
    // …and one well past the rim, which is nothing at all.
    { x: 0, z: blastReach(SACRIFICE_BLAST) + 4096 }
  ])
  const near = pigs[1].health
  const far = pigs[2].health
  const { go } = field(pigs)
  go.begin(pigs[0])
  expect(near - pigs[1].health).toBe(50)
  expect(pigs[2].health).toBe(far)
})

test('a second press while the gesture runs is refused', { tag: '@nodata' }, () => {
  const pigs = squad([{ x: 0, z: 0, pigClass: 6 }])
  const events: BattleEvent[] = []
  // A world WITH a clip to run, so the gesture is actually up for a moment.
  const go = createSacrifice(
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training: false,
      clips: Array.from({ length: 82 }, () => ({ frameCount: 25 }) as never)
    },
    (event) => events.push(event)
  )
  // A second charge on top of the kit's one, so a refusal is about the
  // gesture running rather than about an empty slot.
  give(pigs[0].carrying, SKILL.SUICIDE, 1)
  expect(go.begin(pigs[0])).toBe(true)
  expect(go.running()).toBe(true)
  expect(go.begin(pigs[0])).toBe(false)
  // Still alive while the clip runs, and gone when it is spent.
  expect(isDead(pigs[0])).toBe(false)
  go.update(2)
  expect(isDead(pigs[0])).toBe(true)
  expect(go.running()).toBe(false)
})

test('the TRAINING floor holds — on CAMP the pig walks away from it', { tag: '@nodata' }, () => {
  const pigs = squad([{ x: 0, z: 0, pigClass: 6 }])
  const { go, events } = field(pigs, true)
  go.begin(pigs[0])
  expect(isDead(pigs[0])).toBe(false)
  expect(pigs[0].health).toBe(1)
  // The bang is still real; nobody died in it.
  expect(events.some((one) => one.kind === 'blasted' && one.effect === SUICIDE_EFFECT_ID)).toBe(true)
  expect(events.some((one) => one.kind === 'killed')).toBe(false)
})
