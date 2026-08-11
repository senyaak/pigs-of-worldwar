// PHASE 002 (domain) — the smoke a grenade leaves. Pure, no Electron.
//
// Play: "там нет шлейфа от гранаты." There is one, and it is in the projectile's
// CONSTRUCTOR rather than its update — both of the update's per-kind dispatches
// send a plain grenade straight to the exit, which is why looking there found
// nothing. `weapons/fire.md`.

import { test, expect } from '@playwright/test'

import {
  FUSE_LIFT,
  FUSE_TRAIL,
  LOB_TRAIL,
  TRAIL_DEAD,
  advanceTrail,
  beginTrail,
  trailRoom,
  trailSpent
} from '../../src/lib/game/trail'

const TRAIL_AGE_STEP = LOB_TRAIL.ageStep
const TRAIL_STEPS = LOB_TRAIL.steps
const TRAIL_ROOM = trailRoom(LOB_TRAIL)

test('the numbers are the engine own', () => {
  // Six a frame (0x48b038), an age step of 0x14 so five frames of life
  // (0x486f9b), and 0x4210 — the setter's own default grey (0x486f8f).
  expect(LOB_TRAIL.steps).toBe(6)
  expect(LOB_TRAIL.ageStep).toBe(0x14)
  expect(LOB_TRAIL.colour).toEqual([16, 16, 16])
  expect(LOB_TRAIL.particle).toBe(0x16)
  expect(LOB_TRAIL.size).toBe(8)
  // …and six a frame for five frames is thirty alive, which is exactly the
  // capacity effect id 0x15 draws from Init's count table. That agreement is the
  // check on the whole read.
  expect(TRAIL_ROOM).toBe(30)
})

test('A CHARGE CARRIES ONE TOO, and its fuse is where it hangs', () => {
  // Play: "горение динамита не из игры." It is now. Kind 53's constructor arm
  // (0x432414) hangs effect 0x1D on the projectile exactly the way the grenade's
  // arm hangs 0x15 — same call, same tail arguments — with two differences that
  // are the whole of what a burning fuse looks like: an offset of 0x3C where the
  // grenade passes zero, and its own update arm (0x48ad9d).
  expect(FUSE_TRAIL.id).toBe(0x1d)
  expect(FUSE_LIFT).toBe(0x3c)
  // FOUR a frame, not six — `sar 2` against the grenade's divide by six.
  expect(FUSE_TRAIL.steps).toBe(4)
  expect(FUSE_TRAIL.ageStep).toBe(LOB_TRAIL.ageStep)
  // …of particle type 0x18, whose setter (0x486f16) gives colour 0x14A5 — five
  // of thirty-one on every channel, so DARK smoke — in puffs of 0x10, twice the
  // grenade's 8.
  expect(FUSE_TRAIL.particle).toBe(0x18)
  expect(FUSE_TRAIL.colour).toEqual([5, 5, 5])
  expect(FUSE_TRAIL.size).toBe(0x10)
  expect(FUSE_TRAIL.colour[0]).toBeLessThan(LOB_TRAIL.colour[0])
  expect(FUSE_TRAIL.size).toBe(LOB_TRAIL.size * 2)
})

test('a charge does not move, so its four pile up where the fuse is', () => {
  // Which is what a burning one looks like: the trail is laid along the segment
  // travelled and a planted charge travels nothing.
  const trail = beginTrail(FUSE_TRAIL)
  const tip = { x: 100, y: -50, z: 200 }
  advanceTrail(trail, tip)
  advanceTrail(trail, tip)
  expect(trail.puffs).toHaveLength(FUSE_TRAIL.steps)
  expect(trail.puffs.every((p) => p.x === tip.x && p.y === tip.y && p.z === tip.z)).toBe(true)
  // …and it holds twenty rather than the grenade's thirty.
  expect(trailRoom(FUSE_TRAIL)).toBe(20)
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
