// PHASE 002 (domain) — what becomes of a body. Pure, no Electron.
//
// The SHAPE is play's ruling (lib/game/corpses.ts): the dying clip runs out,
// the corpse blows up, the boots go down — in the water it SINKS WHILE the
// drowning clip plays and goes off down there, with no floor under it,
// because the shipped beds sit at the waterline. An overkill skips the lot.

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
function stubAnim(): Anim & { busy: boolean; played: number[]; overlays: number[] } {
  const stub = {
    busy: false,
    played: [] as number[],
    overlays: [] as number[],
    setClip: () => {},
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

test('a death on land: the clip, then the bang, then the boots', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const corpses = createCorpses(
    { anim, query: terrain(() => 0), tumbling: () => false },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, false)
  // One of the three FALLS, by the pig's own id — and the aiming arms come
  // down with it: the weapon overlay is cleared on the way.
  expect(anim.played).toEqual([ANIM.DEATHS[1 % ANIM.DEATHS.length]])
  expect(anim.overlays).toEqual([-1])
  // Nothing happens while the clip runs — or while a blast still has the
  // body in the air.
  corpses.update(STEP_SECONDS)
  expect(events).toEqual([])
  anim.busy = false
  corpses.update(STEP_SECONDS)
  expect(events.map((one) => one.kind)).toEqual(['blasted', 'remains'])
  expect(events[0]).toMatchObject({ effect: BLAST_EFFECT.id })
  expect(events[1]).toMatchObject({ pig: 1, at: { x: 0, y: 0, z: 0 }, heading: 0.5 })
  expect(pig.gone).toBe(true)
  expect(corpses.live()).toBe(0)
})

test('three pigs take three different falls — the id picks, deterministically', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const corpses = createCorpses(
    { anim, query: terrain(() => 0), tumbling: () => false },
    () => {}
  )
  corpses.claim(pigAt(0, 0, 0, 3), false)
  corpses.claim(pigAt(100, 0, 0, 4), false)
  corpses.claim(pigAt(200, 0, 0, 5), false)
  expect(new Set(anim.played).size).toBe(3)
  for (const clip of anim.played) expect(ANIM.DEATHS).toContain(clip)
})

test('an overkill skips the clip and the bang — the body simply goes', { tag: '@nodata' }, () => {
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const corpses = createCorpses(
    { anim, query: terrain(() => 0), tumbling: () => false },
    (event) => events.push(event)
  )
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, true)
  expect(anim.played).toEqual([])
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
  const corpses = createCorpses({ anim, query, tumbling: () => false }, (event) => events.push(event))
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, false)
  expect(anim.played).toEqual([ANIM.DROWNING])
  // The body goes under from the FIRST step — clip and descent together.
  corpses.update(STEP_SECONDS)
  expect(pig.position.y).toBeCloseTo(SINK_SPEED * STEP_SECONDS, 5)
  expect(events).toEqual([])
  for (let step = 0; step < 30; step++) corpses.update(STEP_SECONDS)
  const depth = pig.position.y
  expect(depth).toBeGreaterThan(0)
  // …and the clip ending is what sets it off, DOWN where it ended.
  anim.busy = false
  corpses.update(STEP_SECONDS)
  expect(events.map((one) => one.kind)).toEqual(['blasted', 'remains'])
  const blasted = events[0] as Extract<BattleEvent, { kind: 'blasted' }>
  expect(blasted.at.y).toBeGreaterThan(0)
  expect(pig.gone).toBe(true)
})
