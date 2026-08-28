// PHASE 002 (domain) — the MEDICINE BALL's burst puts points ON. Pure.
//
// Read out of the exe 2026-08-28: kind 37's destructor spawns effect 0x60
// with the row's own radius 2048, force 0 and amount 5120, and 0x60's arm in
// `Pig::OnHit` (0x4778C6) is `min(deficit, falloff)` through `Pig::Heal` —
// the same `blastShare` ramp a grenade runs, clamped to what each body is
// missing. Its phantom flags are the GAS group's (Init 0x489A00): no push,
// no line of sight. The gate (0x4778D8) lets a ZERO heal through when the
// status word is set — a full-health poisoned pig in the cloud is cured.
// `mend` in lib/game/blast.ts is the arm; the row is lib/game/grenade.ts.

import { test, expect } from '@playwright/test'

import { mend } from '../src/lib/game/blast'
import { blastRange, lobOf } from '../src/lib/game/grenade'
import { SKILL } from '../src/lib/game/skills'
import { Game } from '../src/lib/game/game'
import type { Velocity } from '../src/lib/game/tumble'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'

const BODY = { footOffset: 100, crownRise: 80 }

/** The ball's own charge, straight off its row — which also pins the row. */
const row = lobOf(SKILL.MEDICINE_BALL)!
const CHARGE = { damage: row.damage, reach: blastRange(row) }

function field(pigs: Pig[], afflicted?: (pig: Pig) => boolean) {
  const events: BattleEvent[] = []
  const flung: { pig: number; velocity: Velocity }[] = []
  mend(
    { x: 0, y: 0, z: 0 },
    CHARGE,
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training: false,
      fling: (pig, velocity) => flung.push({ pig: pig.id, velocity }),
      afflicted
    },
    (event) => events.push(event)
  )
  return { events, flung }
}

function squad(spots: { x: number; z: number }[]): Pig[] {
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: spots.map((_, i) => `Pig${i}`) }],
    spawns: spots.map((spot) => ({ x: spot.x, z: spot.z, y: 0, body: BODY }))
  })
  return game.players[0].pigs
}

test('the ball row is the read: id 425, kind 37, forty over 2048, and it heals', { tag: '@nodata' }, () => {
  expect(row.id).toBe(425)
  expect(row.kind).toBe(37)
  expect(row.damage).toBe(5120)
  expect(row.blast).toBe(2048)
  expect(row.arming).toBe(2)
  expect(row.heals).toBe(true)
})

test('a pig in the core gets the full forty — capped by its own deficit', { tag: '@nodata' }, () => {
  const pigs = squad([{ x: 0, z: 0 }])
  pigs[0].health = 5 // a grunt 45 short: the cap of 40 is what lands
  const { events, flung } = field(pigs)
  const healed = events.flatMap((one) => (one.kind === 'healed' ? [one.amount] : []))
  expect(healed).toEqual([40])
  expect(pigs[0].health).toBe(45)
  // Nothing is hurt, nothing is thrown, nobody dies of being healed.
  expect(events.some((one) => one.kind === 'damaged')).toBe(false)
  expect(events.some((one) => one.kind === 'killed')).toBe(false)
  expect(flung).toHaveLength(0)
})

test('…and never past the ceiling: a pig five short gets five', { tag: '@nodata' }, () => {
  const pigs = squad([{ x: 0, z: 0 }])
  pigs[0].health = 45
  const { events } = field(pigs)
  const healed = events.flatMap((one) => (one.kind === 'healed' ? [one.amount] : []))
  expect(healed).toEqual([5])
  expect(pigs[0].health).toBe(50)
})

test('the falloff rides the same ramp a blast does: farther heals less', { tag: '@nodata' }, () => {
  const pigs = squad([
    { x: 0, z: 0 },
    { x: 900, z: 0 }
  ])
  for (const pig of pigs) pig.health = 1
  const { events } = field(pigs)
  const healed = events.flatMap((one) => (one.kind === 'healed' ? [one.amount] : []))
  expect(healed).toHaveLength(2)
  const near = healed[0]
  const far = healed[1]
  expect(near).toBe(40)
  expect(far).toBeGreaterThan(0)
  expect(far).toBeLessThan(near)
})

test('a body at its ceiling is passed over — unless a status is on it', { tag: '@nodata' }, () => {
  // The arm's own gate (0x4778D8): deficit 0 and a clean status word is a
  // pass; deficit 0 with the word set is a ZERO heal let through, and the
  // `healed` event's cure is what it is for (lib/game/poison.ts).
  const whole = squad([{ x: 0, z: 0 }])
  expect(field(whole).events.some((one) => one.kind === 'healed')).toBe(false)
  const poisoned = squad([{ x: 0, z: 0 }])
  const { events } = field(poisoned, () => true)
  const healed = events.flatMap((one) => (one.kind === 'healed' ? [one.amount] : []))
  expect(healed).toEqual([0])
})

test('a hidden pig gets nothing — a bush does not convalesce', { tag: '@nodata' }, () => {
  // The decoy's contact handler excludes the status band 0x5C..0x61 whole
  // (lib/game/hide.ts), and the medicine ball's 0x60 is in it.
  const pigs = squad([{ x: 0, z: 0 }])
  pigs[0].health = 5
  pigs[0].hidden = true
  const { events } = field(pigs)
  expect(events.some((one) => one.kind === 'healed')).toBe(false)
  expect(pigs[0].health).toBe(5)
})

test('the burst announces itself under the heal effect id 0x60', { tag: '@nodata' }, () => {
  const { events } = field(squad([{ x: 0, z: 0 }]))
  const blasted = events.flatMap((one) => (one.kind === 'blasted' ? [one.effect] : []))
  expect(blasted).toEqual([0x60])
})
