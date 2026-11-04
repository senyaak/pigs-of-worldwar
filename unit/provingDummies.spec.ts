// THE PROVING GROUND'S DUMMIES COME BACK — the rule, with nothing around it.
//
// `[play]`, 2026-11-02 (docs/facts/proving-ground.md): they "stand up at full
// health at the start of a turn". The whole chain through the handover, on the
// real map, is e2e/000/proving-ground-headless.spec.ts.

import { test, expect } from '@playwright/test'

import { createAnim } from '../src/lib/game/anim'
import type { BattleEvent } from '../src/lib/game/events'
import { Game } from '../src/lib/game/game'
import type { Pig } from '../src/lib/game/game'
import { maxHealthFor } from '../src/lib/game/health'
import { outfit } from '../src/lib/game/kits'
import { ANIM } from '../src/lib/game/locomotion'
import { createPoison } from '../src/lib/game/poison'
import { createProvingDummies, isDummySide } from '../src/lib/game/provingDummies'

const GUNNER = 1
const HOME = { x: 1024, y: -8, z: 0 }
const FACING = 1.5

interface Bench {
  ours: Pig
  dummy: Pig
  flying: Set<Pig>
  heard: BattleEvent[]
  poison: ReturnType<typeof createPoison>
  anim: ReturnType<typeof createAnim>
  standUp(): void
}

function bench(): Bench {
  const game = new Game({
    players: [
      { name: 'OURS', pigNames: ['GRUNT'] },
      { name: 'DUMMIES', pigNames: ['DUMMY'] }
    ],
    spawns: [
      { x: 0, z: 0 },
      { ...HOME, heading: FACING, pigClass: GUNNER }
    ]
  })
  const heard: BattleEvent[] = []
  const emit = (event: BattleEvent): void => {
    heard.push(event)
  }
  const flying = new Set<Pig>()
  const poison = createPoison({ training: false }, emit)
  const anim = createAnim([])
  const dummies = createProvingDummies(
    { game, anim, poison, tumbles: { has: (pig) => flying.has(pig) } },
    emit
  )
  return {
    ours: game.players[0].pigs[0],
    dummy: game.players[1].pigs[0],
    flying,
    heard,
    poison,
    anim,
    standUp: dummies.standUp
  }
}

/** What a finished death leaves (lib/game/corpses.ts), somewhere it was thrown,
 * with a stolen kit and a weapon still in hand. */
const lay = (pig: Pig): void => {
  pig.health = -12
  pig.gone = true
  pig.position = { x: 5000, y: 300, z: -700 }
  pig.heading = 0.25
  pig.carrying = []
  pig.holding = 7
}

test('a finished death stands up as it started: its place, its facing, its class', { tag: '@nodata' }, () => {
  const { dummy, heard, poison, anim, standUp } = bench()
  poison.afflict(dummy)
  anim.playOnce(dummy, ANIM.DROWNING)
  lay(dummy)
  heard.length = 0

  standUp()

  expect(dummy.position).toEqual(HOME)
  expect(dummy.heading).toBe(FACING)
  // exe: the class table at 0x4d02e0, lib/game/health.ts and lib/game/kits.ts.
  expect(dummy.health).toBe(maxHealthFor(GUNNER))
  expect(dummy.carrying).toEqual(outfit(GUNNER))
  expect(dummy.holding).toBeNull()
  expect(dummy.gone).toBe(false)
  expect(poison.poisoned(dummy), 'a fall poisoned is not carried back up').toBe(false)
  expect(anim.wornBy(dummy)).toMatchObject({ index: ANIM.IDLE, once: false })
  // Silent on the poison: nothing is healed, so nothing floats (lib/game/poison.ts).
  expect(heard).toEqual([{ kind: 'stoodUp', pig: dummy.id, at: HOME, heading: FACING }])
})

test('one whose death is still playing, or that is still in the air, waits', { tag: '@nodata' }, () => {
  const { dummy, flying, heard, standUp } = bench()
  // Dead and not gone: riding the blow out, or on its dying clip (lib/game/corpses.ts).
  dummy.health = 0
  standUp()
  expect(dummy.health).toBe(0)

  // Gone with a flight still running: an overkill's body (lib/game/tumble.ts).
  dummy.gone = true
  flying.add(dummy)
  standUp()
  expect(dummy.gone).toBe(true)
  expect(heard).toEqual([])

  flying.clear()
  standUp()
  expect(dummy.gone).toBe(false)
})

test('one only wounded is left as it is, and a side that is not the dummies is never touched', { tag: '@nodata' }, () => {
  const { ours, dummy, heard, standUp } = bench()
  dummy.health = 7
  dummy.position = { x: 1500, y: -8, z: 40 }
  lay(ours)
  const fallen = { ...ours.position }

  standUp()

  expect(dummy.health).toBe(7)
  expect(dummy.position).toEqual({ x: 1500, y: -8, z: 40 })
  expect(ours.gone).toBe(true)
  expect(ours.position).toEqual(fallen)
  expect(heard).toEqual([])
  expect([0, 1].map(isDummySide)).toEqual([false, true])
})
