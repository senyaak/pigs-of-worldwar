// PHASE 002 (domain) — how FAR a blast reaches, in points at a distance.
// Pure, no Electron.
//
// Play asked for exactly this table (2026-08-27): "на 21 надамажил хотя я
// далеко отбежал — может какой лимитер не прочитали?… тесты у нас есть на
// дальность взрывов?" There were specs on the throw's geometry and none on
// the damage-over-distance, so 21 points could not be told from a bug.
//
// The limiter IS read and IS built, and the two ends meet: the exe's WHO is
// the phantom sweep at the row's own radius (+0x04 — `weapons/fire.md` in the
// disasm repo, the force-column read), and its edge — radius + the body's own
// — lands on the SAME spot as the falloff's quarter-rim, which is the rim
// `blastShare` clamps at (lib/game/grenade.ts). So the numbers below are both
// engines' answer: TNT genuinely deals double digits at three tiles and a
// quarter of its core at four — "standing back helps", all the way to the rim,
// and then nothing.

import { test, expect } from '@playwright/test'

import { burst } from '../src/lib/game/blast'
import { blastReach, blastShare } from '../src/lib/game/grenade'
import { DAMAGE_UNIT } from '../src/lib/game/projectile'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import { createBus } from '../src/lib/game/events'

const pigAt = (x: number, id: number): Pig =>
  ({
    id,
    name: `P${id}`,
    index: 0,
    health: 1000,
    carrying: [],
    holding: null,
    position: { x, y: 0, z: 0 },
    body: NO_BODY,
    heading: 0,
    pigClass: 0,
    gone: false,
    parachutes: false
  }) as unknown as Pig

/** What one blast deals to a pig standing `x` away on the flat. */
const dealt = (charge: { damage: number; reach: number }, x: number): number => {
  const pig = pigAt(x, 1)
  burst(
    { x: 0, y: 0, z: 0 },
    charge,
    { pigs: () => [pig], targets: [], present: () => true, training: false },
    createBus().emit
  )
  return 1000 - pig.health
}

test('TNT over distance: 50 at the core, 21 at three and a half tiles, 13 at the rim, 0 past it', { tag: '@nodata' }, () => {
  // Row 37: 6400 = fifty points over a 2048 field; reach = 2048 + 85 − 512.
  const tnt = { damage: 6400, reach: blastReach(2048) }
  expect(tnt.reach).toBe(1621)
  // Inside the 512 core: the whole fifty.
  expect(dealt(tnt, 512)).toBe(50)
  // Two tiles out: still thirty-eight — TNT is a heavy charge, not a grenade.
  expect(dealt(tnt, 1024)).toBe(38)
  // Three tiles and a half — play's own 21 (2026-08-27, "на 21 надамажил"):
  // that hit means standing 1766 out, no more and no less.
  expect(dealt(tnt, 1766)).toBe(21)
  // The rim, 512 + reach = 2133 — the exe's own sweep edge: a quarter of the
  // core, and the last point the blast can touch at all.
  expect(dealt(tnt, 2133)).toBe(13)
  expect(dealt(tnt, 2140)).toBe(0)
  expect(blastShare(2140, tnt.reach)).toBe(0)
})

test('a GRENADE over distance: 30 at the core, 8 at its own rim of 1109, 0 past', { tag: '@nodata' }, () => {
  const grenade = { damage: 3840, reach: blastReach(1024) }
  expect(grenade.reach).toBe(597)
  expect(dealt(grenade, 512)).toBe(30)
  expect(dealt(grenade, 1109)).toBe(8)
  expect(dealt(grenade, 1115)).toBe(0)
})
