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
import { ObstacleField } from '../src/lib/game/obstacles'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { Velocity } from '../src/lib/game/tumble'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const RIFLE = 7

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
  onKilled?: (events: BattleEvent[]) => void
): { fire: () => void; flung: { pig: number; velocity: Velocity }[]; events: BattleEvent[] } {
  const events: BattleEvent[] = []
  const flung: { pig: number; velocity: Velocity }[] = []
  const shooter = pigAt(0, 0, 99)
  shooter.holding = RIFLE
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

test('a hit shoves the body along the bullet line, at the exe\'s 0x30', { tag: '@nodata' }, () => {
  const victim = pigAt(0, 512)
  const { fire, flung, events } = range(victim)
  fire()
  expect(events.some((one) => one.kind === 'damaged')).toBe(true)
  expect(flung).toHaveLength(1)
  const { vx, vy, vz } = flung[0].velocity
  // Full magnitude, along the flight: the shot flew +z and level-ish, so the
  // push is forward, and its length is exactly the exe's constant.
  expect(Math.hypot(vx, vy, vz)).toBeCloseTo(SHOT_SHOVE, 5)
  expect(vz).toBeGreaterThan(SHOT_SHOVE * 0.9)
  expect(Math.abs(vx)).toBeLessThan(SHOT_SHOVE * 0.1)
})

test('a killing hit still shoves — a fresh corpse is a body', { tag: '@nodata' }, () => {
  const victim = pigAt(0, 512, 1, 5)
  const { fire, flung, events } = range(victim)
  fire()
  expect(events.some((one) => one.kind === 'killed')).toBe(true)
  expect(flung).toHaveLength(1)
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
