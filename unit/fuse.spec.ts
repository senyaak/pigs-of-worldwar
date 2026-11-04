// PHASE 002 (domain) — a planted charge's burning fuse, effect 0x1D. Pure.
//
// Every number below is asserted against the reading in the disasm repo's
// `effects/fuse.md` and `effects/cloud.md`, not against what the code came to.

import { test, expect } from '@playwright/test'

import { cloudSize } from '../src/lib/game/cloud'
import { FUSE_LIFT, FUSE_TRAIL, advanceFuse, beginFuse, fuseSpent } from '../src/lib/game/fuse'

/** A fixed roll, so a run is the same run every time. */
const rolling = (): (() => number) => {
  let seed = 12345
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x80000000
  }
}

/** A roll that always comes up the same: yaw, pitch and speed at their least. */
const lowest = (): number => 0

test('the row: the count, the cone and the colour', { tag: '@nodata' }, () => {
  // exe: effects/fuse.md, 0x48B85C — its id, resolved through the update's map.
  expect(FUSE_TRAIL.id).toBe(0x1d)
  // exe: effects/fuse.md, 0x48B85C — wraps its counter on [+0x6E], which is ten
  // (set at 0x489260).
  expect(FUSE_TRAIL.records).toBe(10)
  // exe: effects/fuse.md, 0x48B85C — aims with out 1, up 2 and the narrow cone
  // (0x48B8B1), then divides all three by four (0x48B8C2).
  expect(FUSE_TRAIL.out).toBe(1)
  expect(FUSE_TRAIL.up).toBe(2)
  expect(FUSE_TRAIL.slowed).toBe(4)
  // exe: effects/fuse.md, 0x48B85C — the sprite size and the pinned age.
  expect(FUSE_TRAIL.size).toBe(4)
  expect(FUSE_TRAIL.heldAt).toBe(0x5a)
  // exe: effects/fuse.md, 0x48B85C — the record it renews keeps the gravity and
  // the colour Init gave it (0x4892C8): gravity 2, and the 0x4000 colour, which is
  // red 15, green 0..14, blue nothing (effects/cloud.md, 0x489839).
  expect(FUSE_TRAIL.gravity).toBe(2)
  expect(FUSE_TRAIL.red).toBe(15)
  expect(FUSE_TRAIL.greens).toBe(15)
  expect(FUSE_TRAIL.blue).toBe(0)
  // exe: effects/fuse.md, 0x432442 — hung 0x3C up the charge.
  expect(FUSE_LIFT).toBe(0x3c)
  // play: "в оригинале там не дым а искры когда он горит" — lit, the one ruling
  // on the row (docs/facts/effects.md).
  expect(FUSE_TRAIL.spark).toBe(true)
})

test('every record is its own orange, and keeps it', { tag: '@nodata' }, () => {
  const roll = rolling()
  const fuse = beginFuse(roll)
  expect(fuse.colours).toHaveLength(10)
  const first = fuse.colours.map((one) => [...one])
  for (const [r, g, b] of fuse.colours) {
    // exe: effects/cloud.md, 0x489839 — (rand % 15 + 0x1E0) << 5.
    expect(r).toBe(15)
    expect(g).toBeGreaterThanOrEqual(0)
    expect(g).toBeLessThanOrEqual(14)
    expect(b).toBe(0)
  }
  expect(new Set(fuse.colours.map(([, g]) => g)).size, 'they are not all one colour').toBeGreaterThan(1)
  // exe: effects/fuse.md, 0x48B85C — a renewal writes position and velocity, and
  // nothing of the colour word at +0x10.
  for (let frame = 0; frame < 30; frame++) advanceFuse(fuse, true, roll)
  expect(fuse.colours).toEqual(first)
})

test('one record a frame goes back to the tip, in turn', { tag: '@nodata' }, () => {
  const roll = rolling()
  const fuse = beginFuse(roll)
  // exe: effects/fuse.md, 0x48B85C — the counter [+0x9C] wrapped on ten, and it
  // has already ticked by the time the arm reads it (0x48A5D6), so record 1 is first.
  for (let frame = 1; frame <= 25; frame++) {
    advanceFuse(fuse, true, roll)
    const renewed = fuse.blobs[frame % 10]
    expect({ x: renewed.x, y: renewed.y, z: renewed.z }).toEqual({ x: 0, y: 0, z: 0 })
    // Everything renewed since has flown, this one alone is on the tip.
    if (frame >= 10) {
      const seated = fuse.blobs.filter((one) => one.x === 0 && one.y === 0 && one.z === 0)
      expect(seated).toHaveLength(1)
    }
  }
})

test('it is thrown UP a narrow cone, at a quarter of the speed', { tag: '@nodata' }, () => {
  const roll = rolling()
  const fuse = beginFuse(roll)
  // exe: effects/cloud.md, 0x489890 — the pitch is under 0xC9 of the turn, 44°,
  // and up is twice out here, so a velocity leans at most tan(44°)/2 off the vertical.
  const leanest = Math.tan((44 * Math.PI) / 180) / 2
  const speeds: number[] = []
  for (let frame = 1; frame <= 2000; frame++) {
    advanceFuse(fuse, true, roll)
    const { dx, dy, dz } = fuse.blobs[frame % 10]
    // Y-down: up is negative (lib/game/cloud.ts has the sign).
    expect(dy).toBeLessThan(0)
    // A record's speeds are whole units after the division: one unit of rounding
    // on a vertical of at least eleven is what the slack is for.
    expect(Math.hypot(dx, dz) / -dy).toBeLessThanOrEqual(leanest + 0.15)
    speeds.push(-dy)
  }
  // exe: effects/cloud.md, 0x489890 — 32 · up · f/128 with f 128..255, at the
  // cone's edge cos 44°, then the quarter (effects/fuse.md, 0x48B8C2): 11..31.
  expect(Math.min(...speeds)).toBeGreaterThanOrEqual(11)
  expect(Math.max(...speeds)).toBeLessThanOrEqual(31)
})

test('the frame after it is thrown it has already begun to fall back', { tag: '@nodata' }, () => {
  const fuse = beginFuse(lowest)
  // The lowest roll is straight up at the least speed: 32 · 2 · 128/128 = 64, a
  // quarter of it 16 (effects/cloud.md 0x489890, effects/fuse.md 0x48B8C2).
  advanceFuse(fuse, true, lowest)
  expect(fuse.blobs[1]).toEqual({ x: 0, y: 0, z: 0, dx: 0, dy: -16, dz: 0 })
  // exe: effects/cloud.md, 0x48A7E0 — gravity onto the vertical FIRST, then the
  // whole velocity onto the position. Y-down, so -16 + 2 = -14.
  advanceFuse(fuse, true, lowest)
  expect(fuse.blobs[1]).toEqual({ x: 0, y: -14, z: 0, dx: 0, dy: -14, dz: 0 })
})

test('until a record first comes up it only falls', { tag: '@nodata' }, () => {
  // exe: effects/fuse.md, 0x4892C8 — Init passes an up and an out of nothing, so
  // the ten start with no velocity; the step's gravity is all that moves them.
  const fuse = beginFuse(lowest)
  expect(fuse.blobs[5]).toEqual({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 })
  advanceFuse(fuse, true, lowest)
  expect(fuse.blobs[5]).toEqual({ x: 0, y: 2, z: 0, dx: 0, dy: 2, dz: 0 })
})

test('it never times out, and it does not outlive the charge', { tag: '@nodata' }, () => {
  const fuse = beginFuse(lowest)
  // exe: effects/fuse.md, 0x48B85C — the age pinned at 90 after the step, every
  // frame, for as long as the charge stands: far past a cloud's twenty frames.
  for (let frame = 0; frame < 200; frame++) {
    advanceFuse(fuse, true, lowest)
    expect(fuse.age).toBe(0x5a)
    expect(fuseSpent(fuse)).toBe(false)
  }
  // exe: effects/cloud.md, 0x489FA0 — (200 − age) · 4 · 12.5, at the pinned age.
  expect(cloudSize(fuse)).toBe(5500)
  // exe: 0x48A607 parks the effect when the parent has gone and the arm is gated
  // on that (0x48A9A4), so the step's +5 runs on: 95 still draws (effects/cloud.md,
  // the draw's gate under 100) and 100 does not.
  advanceFuse(fuse, false, lowest)
  expect(fuse.age).toBe(95)
  expect(fuseSpent(fuse)).toBe(false)
  advanceFuse(fuse, false, lowest)
  expect(fuseSpent(fuse)).toBe(true)
})
