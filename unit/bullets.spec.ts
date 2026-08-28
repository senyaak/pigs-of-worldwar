// PHASE 002 (domain) — a bullet SHOVES the body it hits. Pure, no Electron.
//
// Read, not ruled (2026-08-24): `Pig::HitByProjectile` (0x478710) ends every
// bullet path in `0x4A9260(0x30, [proj+0x90], [proj+0x94], 0)` — ADD 48 units
// a frame along the projectile's own pitch and bearing — and knocks the body
// down (state 5, clip 39) unless it is already falling. The one gate is the
// body being GONE (state 8). `SHOT_SHOVE` in lib/game/bullets.ts carries the
// whole derivation.

import { test, expect } from '@playwright/test'

import { createBullets, SHOT_SHOVE } from '../src/lib/game/bullets'
import { fromExeSpeed } from '../src/lib/game/ballistics'
import { ObstacleField } from '../src/lib/game/obstacles'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { Velocity } from '../src/lib/game/tumble'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const RIFLE = 7
const SHOTGUN = 12
const MEDIC_DART = 17

const pigAt = (x: number, z: number, id = 1, health = 100): Pig =>
  ({
    id,
    name: 'GRUNT',
    index: 0,
    health,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 0,
    gone: false,
    parachutes: false
  }) as unknown as Pig

/** A rifleman at the origin, a victim a tile down +z, flat open ground. The
 * muzzle is answered directly — the pose port is a spec's to answer. */
function range(
  victim: Pig,
  onKilled?: (events: BattleEvent[]) => void,
  skill = RIFLE
): { fire: () => void; flung: { pig: number; velocity: Velocity }[]; events: BattleEvent[] } {
  const events: BattleEvent[] = []
  const flung: { pig: number; velocity: Velocity }[] = []
  const shooter = pigAt(0, 0, 99)
  shooter.holding = skill
  const from = { x: 0, y: -160, z: 0 }
  const bullets = createBullets(
    {
      pigs: () => [victim],
      targets: [],
      present: () => true,
      training: false,
      query: terrain(() => 0),
      obstacles: new ObstacleField([]),
      pose: { boneToWorld: () => from },
      // 0.5 rolls a jitter of exactly ZERO (`floor(0.5·32) − 16`), so every
      // pellet flies the sights' own line and the counts below are exact.
      random: () => 0.5,
      fling: (pig, velocity) => flung.push({ pig: pig.id, velocity })
    },
    (event) => {
      events.push(event)
      if (event.kind === 'killed') onKilled?.(events)
    }
  )
  return {
    fire: () => {
      expect(bullets.fire(shooter, 0)).toBe(true)
      for (let step = 0; step < 240 && bullets.live().length > 0; step++) bullets.update(1 / 60)
    },
    flung,
    events
  }
}

test('a hit knocks the body 45° up along the bullet line, at the exe\'s 0x30', { tag: '@nodata' }, () => {
  const victim = pigAt(0, 512)
  const { fire, flung, events } = range(victim)
  fire()
  expect(events.some((one) => one.kind === 'damaged')).toBe(true)
  expect(flung).toHaveLength(1)
  const { vx, vy, vz } = flung[0].velocity
  // The engine's own throw: the exe's level add died on the first substep
  // (play: "отброс сразу же гасится … тупо дёргается на месте"), so the
  // knock is the 45°-up fling every other pig-throw uses, at the exe's
  // speed, pointed along the shot — here +z.
  expect(Math.hypot(vx, vy, vz)).toBeCloseTo(SHOT_SHOVE, 5)
  expect(vz).toBeCloseTo(SHOT_SHOVE * Math.SQRT1_2, 5)
  expect(vy).toBeCloseTo(-SHOT_SHOVE * Math.SQRT1_2, 5)
  expect(Math.abs(vx)).toBeLessThan(SHOT_SHOVE * 0.1)
})

test('the shotgun looses ten pellets — the first prepays five, one report, a soft shove', { tag: '@nodata' }, () => {
  // Skill 12 is the SHOTGUN (gtext 108 — the old "RIFLE BELL" was the
  // icon's name), and every number here is the exe's, re-read TWICE on
  // play's challenges ("точно 1 только летит?", then "а не 15 + 3*5?"):
  // the fire arm at 0x47a776 LOOPS ten `new`+init pairs per press with a
  // ±16 jitter on both angles, and the hit handler's first hit deals ×5
  // (byte map 0x478B18 → `mov edi,5`) PREPAYING pellets 2..5 — absorbed,
  // no damage, still shoving — while pellets 6..10 each pay their own 3
  // (`cmp eax,edi; jl` at 0x478891 skips the damage only while the
  // counter is under five). Point-blank into one pig: 15 + 3×5 = 30.
  const victim = pigAt(0, 512)
  const { fire, flung, events } = range(victim, undefined, SHOTGUN)
  fire()
  const amounts = events.flatMap((one) => (one.kind === 'damaged' ? [one.amount] : []))
  expect(amounts).toEqual([15, 3, 3, 3, 3, 3])
  expect(victim.health).toBe(100 - 30)
  // ONE press is ONE report, however many pellets leave.
  expect(events.filter((one) => one.kind === 'fired')).toHaveLength(1)
  // Every pellet stops in the body and knocks it — the four ABSORBED ones
  // included — and the adds STACK, because the exe's 0x4A9260 is an ADD:
  // each fling carries the volley's running total, 6 a pellet (0x478A99),
  // so the last one leaves the pig with the full 60 — half again a rifle
  // bullet's 48, and still under the knife's 125, which is the exe's own
  // ladder ("нож сильнее чем дробовик" is the read, not a bug).
  expect(flung).toHaveLength(10)
  const first = flung[0].velocity
  expect(Math.hypot(first.vx, first.vy, first.vz)).toBeCloseTo(fromExeSpeed(6), 5)
  const last = flung[9].velocity
  expect(Math.hypot(last.vx, last.vy, last.vz)).toBeCloseTo(fromExeSpeed(60), 5)
  expect(last.vy).toBeLessThan(0)
})

test('a killing hit still shoves — a fresh corpse is a body', { tag: '@nodata' }, () => {
  const victim = pigAt(0, 512, 1, 5)
  const { fire, flung, events } = range(victim)
  fire()
  expect(events.some((one) => one.kind === 'killed')).toBe(true)
  expect(flung).toHaveLength(1)
})

/** A range the spec places the muzzle on itself — the point-blank cases are
 * ABOUT where the round is born, so `range`'s fixed barrel will not do. */
function pointBlank(
  muzzle: { x: number; y: number; z: number },
  victim: Pig
): { shooter: Pig; fire: () => void; events: BattleEvent[] } {
  const events: BattleEvent[] = []
  const shooter = pigAt(0, 0, 99)
  shooter.holding = 6 // PISTOL — the weapon play caught missing point-blank.
  const bullets = createBullets(
    {
      pigs: () => [shooter, victim],
      targets: [],
      present: () => true,
      training: false,
      query: terrain(() => 0),
      obstacles: new ObstacleField([]),
      pose: { boneToWorld: () => muzzle },
      random: () => 0.5
    },
    (event) => events.push(event)
  )
  return {
    shooter,
    fire: () => {
      expect(bullets.fire(shooter, 0)).toBe(true)
      for (let step = 0; step < 240 && bullets.live().length > 0; step++) bullets.update(1 / 60)
    },
    events
  }
}

test('a point-blank shot lands — the muzzle itself is tested', { tag: '@nodata' }, () => {
  // Two pigs body to body: centres 170 apart, the victim's box 85..255 down
  // +z. The pistol's barrel reaches ~155-190 world units past the shooter's
  // centre, so the round is BORN inside the box — and the update's first test
  // used to come only after a first HIT_RADIUS substep, 75+ units on, which
  // for a deep spawn is already past the far wall. Play, mission 2:
  // "пистолет в плотную использованый както мимо стрельнул".
  const victim = pigAt(0, 170)
  const { fire, events } = pointBlank({ x: 0, y: -160, z: 230 }, victim)
  fire()
  expect(events.some((one) => one.kind === 'damaged' && one.pig === victim.id)).toBe(true)
  expect(events.some((one) => one.kind === 'shotLanded' && one.hit === 'flesh')).toBe(true)
})

test('the live muzzle never guns the shooter down', { tag: '@nodata' }, () => {
  // With the spawn point tested, the one body that must never answer it is
  // the shooter's own — a barrel leaned back over the shoulder starts inside
  // it. The victim a tile on still takes the bullet.
  const victim = pigAt(0, 512)
  const { shooter, fire, events } = pointBlank({ x: 0, y: -160, z: 40 }, victim)
  fire()
  expect(events.some((one) => one.kind === 'damaged' && one.pig === shooter.id)).toBe(false)
  expect(events.some((one) => one.kind === 'damaged' && one.pig === victim.id)).toBe(true)
})

test('the medic dart heals its cap of forty — no damage, no shove', { tag: '@nodata' }, () => {
  // Kind 0x24's own arm in `Pig::HitByProjectile` (0x4787D6):
  // `min(deficit, 0x1400)` through `Pig::Heal`, and the kind is on the
  // no-throw list — "MEDICINE DART (heals, no throw)" (`weapons/fire.md`).
  // A grunt at 5 of its 50 is 45 short, so the cap is what lands.
  const victim = pigAt(0, 512, 1, 5)
  const { fire, flung, events } = range(victim, undefined, MEDIC_DART)
  fire()
  const healed = events.flatMap((one) => (one.kind === 'healed' ? [one.amount] : []))
  expect(healed).toEqual([40])
  expect(victim.health).toBe(45)
  expect(events.some((one) => one.kind === 'damaged')).toBe(false)
  expect(flung).toHaveLength(0)
})

test('…and is clamped to the deficit, never past the ceiling', { tag: '@nodata' }, () => {
  const victim = pigAt(0, 512, 1, 45)
  const { fire, events } = range(victim, undefined, MEDIC_DART)
  fire()
  const healed = events.flatMap((one) => (one.kind === 'healed' ? [one.amount] : []))
  expect(healed).toEqual([5])
  expect(victim.health).toBe(50)
})

test('an overkill body has left the world and is not shoved', { tag: '@nodata' }, () => {
  // The exe's one gate (state 8, 0x4789EF): the engine's `killed` listener
  // claims a gibbed pig synchronously and marks it gone (lib/game/engine.ts,
  // lib/game/corpses.ts) — by the time the shove runs there is nothing to
  // throw. The listener here does what that one does.
  const victim = pigAt(0, 512, 1, 5)
  const { fire, flung } = range(victim, () => {
    victim.gone = true
  })
  fire()
  expect(flung).toHaveLength(0)
})
