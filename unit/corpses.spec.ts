// PHASE 002 (domain) — what becomes of a body. Pure, no Electron.
//
// The SHAPE is play's ruling and the exe's state machine both
// (lib/game/corpses.ts): death is a state change, the body RIDES the blow out
// in the wounded pose, and the dying clip starts only once the stage is still
// — "сначала идёт урон, потом когда все остановились, выплыли из воды — тогда
// только идёт анимация умирания." Then the clip runs out, the corpse blows
// up, the boots go down — in the water it SINKS WHILE the drowning clip plays
// and goes off down there, with no floor under it, because the shipped beds
// sit at the waterline. An overkill skips the lot.

import { test, expect } from '@playwright/test'

import {
  createCorpses,
  DEATH_EFFECT,
  DEATH_QUIET,
  LAND_DEATH_DAMAGE,
  LAND_DEATH_RANGE,
  SINK_SPEED,
  WET_DEATH_DAMAGE,
  WET_DEATH_EFFECT,
  WET_DEATH_RANGE
} from '../src/lib/game/corpses'
import { burst } from '../src/lib/game/blast'
import { blastReach } from '../src/lib/game/grenade'
import type { Charge } from '../src/lib/game/blast'
import { ANIM } from '../src/lib/game/locomotion'
import { NO_BODY } from '../src/lib/game/body'
import { STEP_SECONDS } from '../src/lib/game/engine'
import type { Anim } from '../src/lib/game/anim'
import type { BattleEvent } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'
import { terrain } from './fixture'

/** The calls corpses makes of the clip state, and a hand on the answer. */
function stubAnim(): Anim & {
  busy: boolean
  played: number[]
  worn: number[]
  overlays: number[]
} {
  const stub = {
    busy: false,
    played: [] as number[],
    worn: [] as number[],
    overlays: [] as number[],
    setClip: (_pig: Pig, index: number) => {
      stub.worn.push(index)
    },
    playOnce: (_pig: Pig, index: number) => {
      stub.played.push(index)
      stub.busy = true
    },
    overlay: (_pig: Pig, index: number) => {
      stub.overlays.push(index)
    },
    animating: () => stub.busy,
    update: () => {},
    wornBy: () => ({ index: null, once: false, revision: 0, left: 0, elapsed: 0 }),
    overlayOf: () => ({ index: -1, phase: 0 }),
    clear: () => {}
  }
  return stub
}

/** How many engine steps the DEATH_QUIET is — the last of them releases the
 * dying (quiet reaches exactly zero). */
const QUIET_STEPS = Math.round(DEATH_QUIET / STEP_SECONDS)

const pigAt = (x: number, y: number, z: number, id = 1): Pig =>
  ({
    id,
    name: 'GRUNT',
    index: 0,
    health: 0,
    carrying: [],
    holding: null,
    position: { x, y, z },
    body: NO_BODY,
    heading: 0.5,
    pigClass: 0,
    gone: false,
    parachutes: false
  }) as unknown as Pig

/**
 * The corpse's blast port, wired to the REAL `burst` over an empty world —
 * so the `blasted` picture still comes out of the code that draws it, and the
 * CHARGE the death asked for is recorded beside it. The exe's own numbers are
 * in lib/game/corpses.ts with the addresses they came from.
 */
const blaster = (
  events: BattleEvent[]
): { charges: Charge[]; blast: (at: { x: number; y: number; z: number }, charge: Charge) => void } => {
  const charges: Charge[] = []
  return {
    charges,
    blast: (at, charge) => {
      charges.push(charge)
      burst(at, charge, { pigs: () => [], targets: [], present: () => true, training: false }, (event) =>
        events.push(event)
      )
    }
  }
}

test('a death on land: the ride, THEN the clip, then the bang, then the boots', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const bang = blaster(events)
  let still = false
  const corpses = createCorpses(
    {
      anim,
      query: terrain(() => 0),
      tumbling: () => false,
      cleared: () => still,
      roll: () => 0,
      sideOf: () => 0,
      blast: bang.blast
    },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, false)
  // Death is a STATE CHANGE: no dying clip yet — the body wears the WOUNDED
  // pose — and the aiming arms come down with it: the weapon overlay is
  // cleared on the way.
  expect(anim.played).toEqual([])
  expect(anim.worn).toEqual([ANIM.WOUNDED])
  expect(anim.overlays).toEqual([-1])
  // Nothing happens while the stage is not still — the world is what the
  // dying waits for.
  corpses.update(STEP_SECONDS)
  corpses.update(STEP_SECONDS)
  expect(anim.played).toEqual([])
  expect(events).toEqual([])
  expect(corpses.live()).toBe(1)
  // Nobody's dying clip is on yet, so there is nothing for the camera to
  // watch (the exe's mode 16 starts with the clip).
  expect(corpses.watching()).toBeNull()
  // The stage clears — and the dying still does NOT start: a beat of QUIET
  // sits between the stillness and the clip ("потом секунда"), so the first
  // still step plays nothing.
  still = true
  corpses.update(STEP_SECONDS)
  expect(anim.played).toEqual([])
  // …and an INTERRUPTION starts the count over: half the quiet in, something
  // moves again, and the seconds already counted are forfeit.
  for (let step = 0; step < QUIET_STEPS / 2; step++) corpses.update(STEP_SECONDS)
  still = false
  corpses.update(STEP_SECONDS)
  still = true
  for (let step = 0; step < QUIET_STEPS - 1; step++) corpses.update(STEP_SECONDS)
  expect(anim.played).toEqual([])
  // The full quiet, uninterrupted: the dying starts — one of the SEVENTEEN
  // falls, rolled (a roll of 0 is the first) — and it is announced with the
  // side that fielded the pig, for the death line's voice.
  corpses.update(STEP_SECONDS)
  expect(anim.played).toEqual([ANIM.DEATHS[0]])
  expect(events.map((one) => one.kind)).toEqual(['dying'])
  expect(events[0]).toMatchObject({ pig: 1, player: 0, wet: false })
  // …and from here the camera has a body to watch, where it lies.
  expect(corpses.watching()).toEqual({ x: 0, y: 0, z: 0 })
  // Nothing more while the clip runs.
  corpses.update(STEP_SECONDS)
  expect(events.map((one) => one.kind)).toEqual(['dying'])
  anim.busy = false
  corpses.update(STEP_SECONDS)
  expect(events.map((one) => one.kind)).toEqual(['dying', 'blasted', 'remains'])
  // …and the bang is a REAL one — twenty points at the exe's own range
  // (0x4688ad), not a picture (lib/game/corpses.ts).
  expect(bang.charges).toEqual([
    { damage: LAND_DEATH_DAMAGE, reach: blastReach(LAND_DEATH_RANGE), effect: DEATH_EFFECT }
  ])
  // The picture carries the DEATH's own effect id — 0x56, whose parameter row
  // (7) is not transcribed, so the field falls back on the grenade's row 0.
  expect(events[1]).toMatchObject({ effect: DEATH_EFFECT })
  expect(events[2]).toMatchObject({ pig: 1, at: { x: 0, y: 0, z: 0 }, heading: 0.5 })
  expect(pig.gone).toBe(true)
  expect(corpses.live()).toBe(0)
})

test('the falls are ROLLED off the battle stream — seventeen, exe range', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  // Three rolls, three different bins of the seventeen — the exe's own
  // `rand() % 0x11 + 0x39`, clips 57..73.
  const rolls = [0, 0.5, 0.999]
  let handed = 0
  const corpses = createCorpses(
    {
      anim,
      query: terrain(() => 0),
      tumbling: () => false,
      cleared: () => true,
      roll: () => rolls[handed++ % rolls.length],
      sideOf: () => 0,
      blast: () => {}
    },
    () => {}
  )
  corpses.claim(pigAt(0, 0, 0, 3), false)
  corpses.claim(pigAt(100, 0, 0, 4), false)
  corpses.claim(pigAt(200, 0, 0, 5), false)
  for (let step = 0; step < QUIET_STEPS; step++) corpses.update(STEP_SECONDS)
  expect(new Set(anim.played).size).toBe(3)
  expect(anim.played).toContain(57)
  expect(anim.played).toContain(73)
  for (const clip of anim.played) expect(ANIM.DEATHS).toContain(clip)
})

test('an overkill skips the CLIP — and its bang is wider and weaker', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const bang = blaster(events)
  const corpses = createCorpses(
    {
      anim,
      query: terrain(() => 0),
      tumbling: () => false,
      cleared: () => true,
      roll: () => 0,
      sideOf: () => 0,
      blast: bang.blast
    },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, true)
  expect(anim.played).toEqual([])
  expect(anim.worn).toEqual([])
  // No dying clip, and the body goes at once — but the GIB has a blast of its
  // own (0x468a5f), half a whole body's damage over twice its reach.
  expect(events.map((one) => one.kind)).toEqual(['blasted', 'remains'])
  expect(bang.charges).toEqual([
    { damage: WET_DEATH_DAMAGE, reach: blastReach(WET_DEATH_RANGE), effect: DEATH_EFFECT }
  ])
  expect(pig.gone).toBe(true)
})

test('a death in the water sinks WHILE the clip plays and goes off down there', { tag: '@nodata' }, () => {
  // Flat water at elevation zero — the shipped shape: the bed sits AT the
  // waterline, so the descent deliberately has no floor (lib/game/corpses.ts,
  // SINK_SPEED).
  const query = terrain(
    () => 0,
    () => ({ type: 0x20 })
  )
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const bang = blaster(events)
  const corpses = createCorpses(
    {
      anim,
      query,
      tumbling: () => false,
      cleared: () => true,
      roll: () => 0,
      sideOf: () => 0,
      blast: bang.blast
    },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, false)
  // Where the body ENDED is what it dies in — the wet arm is decided when
  // the dying starts, not at the blow — after the quiet the death owes.
  for (let step = 0; step < QUIET_STEPS; step++) corpses.update(STEP_SECONDS)
  expect(anim.played).toEqual([ANIM.DROWNING])
  expect(events.map((one) => one.kind)).toEqual(['dying'])
  expect(events[0]).toMatchObject({ wet: true })
  // The body goes under from the clip's first step — clip and descent
  // together.
  corpses.update(STEP_SECONDS)
  expect(pig.position.y).toBeCloseTo(SINK_SPEED * STEP_SECONDS, 5)
  for (let step = 0; step < 30; step++) corpses.update(STEP_SECONDS)
  const depth = pig.position.y
  expect(depth).toBeGreaterThan(0)
  // …and the clip ending is what sets it off, DOWN where it ended.
  anim.busy = false
  corpses.update(STEP_SECONDS)
  expect(events.map((one) => one.kind)).toEqual(['dying', 'blasted', 'remains'])
  const blasted = events[1] as Extract<BattleEvent, { kind: 'blasted' }>
  expect(blasted.at.y).toBeGreaterThan(0)
  // A drowned body's bang is the weaker, wider one (0x468927) and wears its
  // own effect id.
  expect(bang.charges).toEqual([
    { damage: WET_DEATH_DAMAGE, reach: blastReach(WET_DEATH_RANGE), effect: WET_DEATH_EFFECT }
  ])
  expect(pig.gone).toBe(true)
})
