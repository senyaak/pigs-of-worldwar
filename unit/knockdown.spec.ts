// PHASE 002 (domain) — a BULLET's knockdown is seen at ANY shove.
//
// Play: "выстрелил из дробовика - почти в притык - сняли 27, и свин даже не
// шелохнулся - должен от любого урона отлетать так то." The exe knocks a
// struck pig down UNCONDITIONALLY — state 5 at 0x478AB2, clip 39 at 0x478AC4
// — whatever the shove (6 for the shotgun, 48 for the rest). Here the
// knockdown used to be a side effect of the shove's SIZE: a level 90-a-second
// push landed on the first substep, the get-up lived exactly one step because
// `tumbles` deleted the record on the landing frame, and the next battle
// frame stamped IDLE over it. The record now stays until the get-up has run
// down, and a bullet's fling starts `touched` so the flight wears the
// exe's bounce clip rather than the wall-eject.

import { test, expect } from '@playwright/test'

import { createTumbles } from '../src/lib/game/tumble'
import { ANIM, GET_UP } from '../src/lib/game/locomotion'
import { STEP_SECONDS } from '../src/lib/game/engine'
import { ObstacleField } from '../src/lib/game/obstacles'
import { fromExeSpeed } from '../src/lib/game/ballistics'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const pigAt = (x: number, z: number): Pig =>
  ({
    id: 1,
    name: 'GRUNT',
    index: 0,
    health: 100,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 0,
    gone: false,
    parachutes: false
  }) as unknown as Pig

/** Fling the pig as a bullet does (`struck`), at `shove` exe units a frame
 * level along +z, and run the tumble to its end. */
function struckBy(shove: number): { held: number; clips: { index: number; once: boolean }[] } {
  const flat = terrain(() => 0)
  const pig = pigAt(0, 0)
  const clips: { index: number; once: boolean }[] = []
  const tumbles = createTumbles(
    {
      query: flat,
      pigs: () => [pig],
      obstacles: new ObstacleField([]),
      training: false,
      random: () => 0
    },
    (event: BattleEvent) => {
      if (event.kind === 'clip') clips.push({ index: event.index, once: event.once })
    }
  )
  tumbles.fling(pig, { vx: 0, vy: 0, vz: fromExeSpeed(shove) }, false, true)
  let frames = 0
  while (tumbles.has(pig) && frames < 240) {
    tumbles.update(STEP_SECONDS)
    frames++
  }
  expect(tumbles.has(pig)).toBe(false)
  return { held: frames * STEP_SECONDS, clips }
}

test('even a tiny level push knocks the pig down for the whole get-up', { tag: '@nodata' }, () => {
  const { held, clips } = struckBy(6)
  // Held through the get-up, not one step — this is the line that fails on
  // the delete-at-landing bug (held came out at a single STEP_SECONDS).
  expect(held).toBeGreaterThanOrEqual(GET_UP)
  // …and what plays is the landing's own get-up, committed.
  expect(clips.some((one) => one.index === ANIM.LAND && one.once)).toBe(true)
})

test('a full-shove hit wears the exe’s bounce in flight, then gets up', { tag: '@nodata' }, () => {
  const { held, clips } = struckBy(0x30)
  // Fast and flat skims for a few frames first — and `struck` makes those
  // frames clip 39 (BOUNCE), never the wall-eject 38.
  expect(clips.map((one) => one.index)).toContain(ANIM.BOUNCE)
  expect(clips.map((one) => one.index)).not.toContain(ANIM.EJECTED)
  expect(clips.some((one) => one.index === ANIM.LAND && one.once)).toBe(true)
  expect(held).toBeGreaterThanOrEqual(GET_UP)
})
