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

import { createCorpses, SINK_SPEED } from '../src/lib/game/corpses'
import { ANIM } from '../src/lib/game/locomotion'
import { BLAST_EFFECT } from '../src/lib/game/effects'
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

test('a death on land: the ride, THEN the clip, then the bang, then the boots', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const events: BattleEvent[] = []
  let still = false
  const corpses = createCorpses(
    {
      anim,
      query: terrain(() => 0),
      tumbling: () => false,
      cleared: () => still,
      roll: () => 0,
      sideOf: () => 0
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
  // The stage clears: the dying starts — one of the SEVENTEEN falls, rolled
  // (a roll of 0 is the first) — and it is announced with the side that
  // fielded the pig, for the death line's voice.
  still = true
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
  expect(events[1]).toMatchObject({ effect: BLAST_EFFECT.id })
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
      sideOf: () => 0
    },
    () => {}
  )
  corpses.claim(pigAt(0, 0, 0, 3), false)
  corpses.claim(pigAt(100, 0, 0, 4), false)
  corpses.claim(pigAt(200, 0, 0, 5), false)
  corpses.update(STEP_SECONDS)
  expect(new Set(anim.played).size).toBe(3)
  expect(anim.played).toContain(57)
  expect(anim.played).toContain(73)
  for (const clip of anim.played) expect(ANIM.DEATHS).toContain(clip)
})

test('an overkill skips the clip and the bang — the body simply goes', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const corpses = createCorpses(
    {
      anim,
      query: terrain(() => 0),
      tumbling: () => false,
      cleared: () => true,
      roll: () => 0,
      sideOf: () => 0
    },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, true)
  expect(anim.played).toEqual([])
  expect(anim.worn).toEqual([])
  expect(events.map((one) => one.kind)).toEqual(['remains'])
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
  const corpses = createCorpses(
    { anim, query, tumbling: () => false, cleared: () => true, roll: () => 0, sideOf: () => 0 },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, false)
  // Where the body ENDED is what it dies in — the wet arm is decided when
  // the dying starts, not at the blow.
  corpses.update(STEP_SECONDS)
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
  expect(pig.gone).toBe(true)
})
