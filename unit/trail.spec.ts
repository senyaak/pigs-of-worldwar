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
  ROCKET_TRAIL,
  TRAIL_DEAD,
  advanceTrail,
  beginTrail,
  trailRoom,
  trailSpent
} from '../src/lib/game/trail'

const TRAIL_AGE_STEP = LOB_TRAIL.ageStep
const TRAIL_STEPS = LOB_TRAIL.steps
const TRAIL_ROOM = trailRoom(LOB_TRAIL)

test('the numbers are the engine own', { tag: '@nodata' }, () => {
  // THREE a frame, and that is a correction: `0x48B024`, the ÷6 arm this repo
  // used to quote, belongs to effect id **0x14** — the map is
  // `[0x48BF90 + id − 1]` into `[0x48BF24 + slot*4]`, and 0x15 lands on 0x48B0F5
  // instead, whose magic is the ÷3 one and whose particle is 0x19.
  expect(LOB_TRAIL.id).toBe(0x15)
  expect(LOB_TRAIL.steps).toBe(3)
  expect(LOB_TRAIL.particle).toBe(0x19)
  // …and both particle types share one setter (0x486F8D, the table at 0x4871D0):
  // an age step of 0x14 so five frames of life, 0x4210 — the setter's own default
  // grey — and size 8.
  expect(LOB_TRAIL.ageStep).toBe(0x14)
  expect(LOB_TRAIL.colour).toEqual([16, 16, 16])
  expect(LOB_TRAIL.size).toBe(8)
  expect(TRAIL_ROOM).toBe(15)
})

test('A ROCKET carries one too, and it is the ENGINE that lays it', { tag: '@nodata' }, () => {
  // Play: "нет белого густого дыма за снарядом базуки", and then "ВРЁШЬ" at a
  // first pass that said the exe hangs nothing on a bazooka. It does — from the
  // projectile update's SECOND per-kind dispatch, which that pass never read:
  // 0x436596 sends every kind outside 26..28 to 0x436727, where the map at
  // 0x436D68 is indexed by the KIND straight and kind 10 lands on 0x43676D —
  // `new(0xE4); push 14h; push esi; 0x487620(…)`, the same parented-effect call
  // the grenade's constructor makes with 0x15.
  expect(ROCKET_TRAIL.id).toBe(0x14)
  // …and 0x14's update arm is the ÷6 one, so a rocket lays TWICE what a grenade
  // does. That is the "густой" half, and it is read.
  expect(ROCKET_TRAIL.steps).toBe(6)
  expect(ROCKET_TRAIL.steps).toBe(LOB_TRAIL.steps * 2)
  expect(ROCKET_TRAIL.particle).toBe(0x16)
  expect(ROCKET_TRAIL.ageStep).toBe(LOB_TRAIL.ageStep)
  // …and NOTHING here is picked. Both particle types share one setter, so the
  // rocket's puff is the same grey at the same size as a grenade's and the COUNT
  // is the only difference between the two rows. A first pass shipped a white,
  // double-size row off play's "белый густой дым"; play's answer was "давай
  // делаем как в движке — в этом же и суть".
  expect(ROCKET_TRAIL.colour).toEqual(LOB_TRAIL.colour)
  expect(ROCKET_TRAIL.size).toBe(LOB_TRAIL.size)
})

test('A CHARGE CARRIES ONE TOO, and its fuse is where it hangs', { tag: '@nodata' }, () => {
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

test('a charge does not move, so its four pile up where the fuse is', { tag: '@nodata' }, () => {
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

test('the first frame lays nothing — there is no segment yet', { tag: '@nodata' }, () => {
  const trail = beginTrail()
  advanceTrail(trail, { x: 0, y: 0, z: 0 })
  expect(trail.puffs).toHaveLength(0)
})

test('then a frame’s worth, spread ALONG the step and not heaped at the end', { tag: '@nodata' }, () => {
  const trail = beginTrail()
  advanceTrail(trail, { x: 0, y: 0, z: 0 })
  advanceTrail(trail, { x: 600, y: 0, z: 0 })
  // A grenade's three, evenly — this is what keeps the trail whole at throwing
  // speed instead of leaving a bead a frame.
  expect(trail.puffs).toHaveLength(3)
  expect(trail.puffs.map((p) => p.x)).toEqual([200, 400, 600])
  // …and a ROCKET's six over the same step, which is the engine's own difference
  // between the two arms and the whole of "густой".
  const rocket = beginTrail(ROCKET_TRAIL)
  advanceTrail(rocket, { x: 0, y: 0, z: 0 })
  advanceTrail(rocket, { x: 600, y: 0, z: 0 })
  expect(rocket.puffs.map((p) => p.x)).toEqual([100, 200, 300, 400, 500, 600])
})

test('a puff is STILL — type 0x16 carries no velocity and no gravity', { tag: '@nodata' }, () => {
  const trail = beginTrail()
  advanceTrail(trail, { x: 0, y: 0, z: 0 })
  advanceTrail(trail, { x: 600, y: -300, z: 0 })
  const first = { ...trail.puffs[0] }
  advanceTrail(trail, { x: 1200, y: -600, z: 0 })
  const same = trail.puffs.find((p) => p.x === first.x && p.y === first.y)
  expect(same).toBeDefined()
  expect(same!.age).toBe(TRAIL_AGE_STEP * 2)
})

test('it holds thirty at a time and no more', { tag: '@nodata' }, () => {
  const trail = beginTrail()
  for (let frame = 0; frame <= 20; frame++) advanceTrail(trail, { x: frame * 600, y: 0, z: 0 })
  expect(trail.puffs).toHaveLength(TRAIL_ROOM - TRAIL_STEPS)
  expect(trail.puffs.every((p) => p.age < TRAIL_DEAD)).toBe(true)
})

test('once the grenade is gone the last of it fades and then it is done', { tag: '@nodata' }, () => {
  const trail = beginTrail()
  for (let frame = 0; frame <= 10; frame++) advanceTrail(trail, { x: frame * 600, y: 0, z: 0 })
  expect(trailSpent(trail)).toBe(false)
  for (let frame = 0; frame < 5; frame++) advanceTrail(trail, null)
  expect(trailSpent(trail)).toBe(true)
})
