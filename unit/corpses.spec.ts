// PHASE 002 (domain) — what becomes of a body. Pure, no Electron.
//
// The SHAPE is play's ruling (lib/game/corpses.ts): the dying clip runs out,
// the corpse blows up, the boots go down — in the water it sinks first and
// goes off under the surface, and an overkill skips the lot.

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

/** The two calls corpses makes of the clip state, and a hand on the answer. */
function stubAnim(): Anim & { busy: boolean; played: number[] } {
  const stub = {
    busy: false,
    played: [] as number[],
    setClip: () => {},
    playOnce: (_pig: Pig, index: number) => {
      stub.played.push(index)
      stub.busy = true
    },
    overlay: () => {},
    animating: () => stub.busy,
    update: () => {},
    wornBy: () => ({ index: null, once: false, revision: 0, left: 0, elapsed: 0 }),
    overlayOf: () => ({ index: -1, phase: 0 }),
    clear: () => {}
  }
  return stub
}

const pigAt = (x: number, y: number, z: number): Pig =>
  ({
    id: 1,
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
  expect(anim.played).toEqual([ANIM.DYING])
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

test('a death in the water sinks to the bottom and goes off there', { tag: '@nodata' }, () => {
  // A pond: most of the map at elevation 0, a dip of −400 in the middle, and
  // the whole of it water-flagged — the fitted level is the mode of the
  // corners, 0, so the dip is 400 units of open water (lib/game/terrain.ts).
  const deep = (x: number, z: number): boolean => Math.hypot(x, z) < 1024
  const query = terrain(
    (x, z) => (deep(x, z) ? -400 : 0),
    () => ({ type: 0x20 })
  )
  const anim = stubAnim()
  const events: BattleEvent[] = []
  const corpses = createCorpses({ anim, query, tumbling: () => false }, (event) => events.push(event))
  // Soles at the waterline over the dip — a swimming pig's resting height.
  const pig = pigAt(0, 0, 0)
  corpses.claim(pig, false)
  expect(anim.played).toEqual([ANIM.DROWNING])
  anim.busy = false
  // One step sinks one step's worth, straight down.
  corpses.update(STEP_SECONDS)
  expect(pig.position.y).toBeCloseTo(SINK_SPEED * STEP_SECONDS, 5)
  expect(events).toEqual([])
  // …and the bottom ends it: the bang goes off UNDER the surface.
  for (let step = 0; step < 600 && corpses.live() > 0; step++) corpses.update(STEP_SECONDS)
  expect(pig.position.y).toBeCloseTo(query.height(0, 0), 5)
  expect(events.map((one) => one.kind)).toEqual(['blasted', 'remains'])
  const blasted = events[0] as Extract<BattleEvent, { kind: 'blasted' }>
  expect(blasted.at.y).toBeGreaterThan(0)
  expect(pig.gone).toBe(true)
})
