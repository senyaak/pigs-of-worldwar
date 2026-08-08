// PHASE 002 (domain) — the smoke a grenade leaves. Pure, no Electron.
//
// Play: "там нет шлейфа от гранаты." There is one, and it is in the projectile's
// CONSTRUCTOR rather than its update — both of the update's per-kind dispatches
// send a plain grenade straight to the exit, which is why looking there found
// nothing. `../../../pigs-disasm/weapons/fire.md`.

import { test, expect } from '@playwright/test'

import {
  TRAIL_AGE_STEP,
  TRAIL_COLOUR,
  TRAIL_DEAD,
  TRAIL_ROOM,
  TRAIL_STEPS,
  advanceTrail,
  beginTrail,
  trailSpent
} from '../../src/lib/game/trail'

test('the numbers are the engine own', () => {
  // Six a frame (0x48b038), an age step of 0x14 so five frames of life
  // (0x486f9b), and 0x4210 — the setter's own default grey (0x486f8f).
  expect(TRAIL_STEPS).toBe(6)
  expect(TRAIL_AGE_STEP).toBe(0x14)
  expect(TRAIL_COLOUR).toEqual([16, 16, 16])
  // …and six a frame for five frames is thirty alive, which is exactly the
  // capacity effect id 0x15 draws from Init's count table. That agreement is the
  // check on the whole read.
  expect(TRAIL_ROOM).toBe(30)
})

test('the first frame lays nothing — there is no segment yet', () => {
  const trail = beginTrail()
  advanceTrail(trail, { x: 0, y: 0, z: 0 })
  expect(trail.puffs).toHaveLength(0)
})

test('then six a frame, spread ALONG the step and not heaped at the end', () => {
  const trail = beginTrail()
  advanceTrail(trail, { x: 0, y: 0, z: 0 })
  advanceTrail(trail, { x: 600, y: 0, z: 0 })
  expect(trail.puffs).toHaveLength(6)
  // Evenly, one per sixth: this is what keeps the trail whole at throwing speed
  // instead of leaving a bead a frame.
  expect(trail.puffs.map((p) => p.x)).toEqual([100, 200, 300, 400, 500, 600])
})

test('a puff is STILL — type 0x16 carries no velocity and no gravity', () => {
  const trail = beginTrail()
  advanceTrail(trail, { x: 0, y: 0, z: 0 })
  advanceTrail(trail, { x: 600, y: -300, z: 0 })
  const first = { ...trail.puffs[0] }
  advanceTrail(trail, { x: 1200, y: -600, z: 0 })
  const same = trail.puffs.find((p) => p.x === first.x && p.y === first.y)
  expect(same).toBeDefined()
  expect(same!.age).toBe(TRAIL_AGE_STEP * 2)
})

test('it holds thirty at a time and no more', () => {
  const trail = beginTrail()
  for (let frame = 0; frame <= 20; frame++) advanceTrail(trail, { x: frame * 600, y: 0, z: 0 })
  expect(trail.puffs).toHaveLength(TRAIL_ROOM - TRAIL_STEPS)
  expect(trail.puffs.every((p) => p.age < TRAIL_DEAD)).toBe(true)
})

test('once the grenade is gone the last of it fades and then it is done', () => {
  const trail = beginTrail()
  for (let frame = 0; frame <= 10; frame++) advanceTrail(trail, { x: frame * 600, y: 0, z: 0 })
  expect(trailSpent(trail)).toBe(false)
  for (let frame = 0; frame < 5; frame++) advanceTrail(trail, null)
  expect(trailSpent(trail)).toBe(true)
})
