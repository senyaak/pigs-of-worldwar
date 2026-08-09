// The bullets in the air, and what they hit.
//
// `projectile.ts` is one shot's flight; this is the WORLD's worth of them —
// the list, the substepping, and resolving each one against the ground, the
// map's boxes, the pigs and the training ground's dummies. All of it used to
// live in `three/shots.ts` around a pool of meshes, which meant a bullet could
// only exist where there was something to draw it with.
//
// Nothing here draws or makes a noise. What a hit LOOKS like — the number that
// floats off it, the dying clip, the report — is announced through `BulletEvents`
// and belongs to whoever is presenting the battle.
//
// Game space (Y-down) throughout.

import { advanceShot, damageOf, fireShot, projectileOf, spentShot } from './projectile'
import type { Shot } from './projectile'
import { PIG_RADIUS } from './obstacles'
import type { Obstruction } from './obstacles'
import { hurt, isDead } from './health'
import { originY } from './body'
import { HAND_BONE } from './pose'
import type { Point, Pose } from './pose'
import type { Pig } from './game'
import type { Target } from './targets'
import type { TerrainQuery } from './terrain'

/**
 * Where the muzzle sits, per weapon: the row of 0x4d0ee0 the shot's own byte
 * map (0x47cf68) picks. Model units and bone-local, exactly like the melee's
 * reach and for the same reason (`melee.ts` argues it).
 */
const MUZZLE: Record<number, Point> = {
  6: { x: 44, y: 32, z: 230 },
  7: { x: 44, y: 36, z: 350 },
  8: { x: 44, y: 36, z: 350 },
  9: { x: 64, y: 46, z: 356 },
  10: { x: 44, y: 24, z: 650 },
  11: { x: 32, y: 68, z: 450 },
  12: { x: 28, y: 36, z: 376 },
  13: { x: 28, y: 36, z: 376 },
  14: { x: 82, y: 24, z: 470 },
  15: { x: 146, y: -28, z: 256 },
  17: { x: 44, y: 36, z: 350 },
  18: { x: 44, y: 36, z: 350 }
}

/** How near a bullet has to pass. A pig is 320 tall and 320 across, and the
 * exe gives every gun's projectile a collision box of ZERO in its table — so
 * this is the BODY's size, not the bullet's, and it is the remake's reading of
 * a hit rather than a decoded one. */
const HIT_RADIUS = PIG_RADIUS
const HIT_RISE = 320

/** The world a bullet flies through. */
export interface BulletWorld {
  /** Everyone who can be shot — asked for each frame, because a squad outlives
   * any one list of it. */
  pigs: () => Pig[]
  /** The map's dummies, as things to knock down. Spliced in place: the blade
   * shares this exact array, and two copies once let a dummy be killed twice
   * (lib/game/targets.ts). */
  targets: Target[]
  /** Whether the map SCRIPT has placed this dummy yet (lib/game/script.ts). */
  present: (id: number) => boolean
  /** The ground, so a bullet cannot fly through a hill. */
  query: TerrainQuery
  /** The map's boxes, so it cannot fly through a wall either. */
  obstacles: Obstruction
  /** The training ground, where a PIG cannot be killed (lib/game/health.ts). */
  training: boolean
  /** Where the muzzle is (lib/game/pose.ts). */
  pose: Pose
}

/** What a shot does that somebody else has to show. */
export interface BulletEvents {
  /** One left the barrel — the report, per weapon. */
  fired: (skill: number) => void
  /** Something took `amount` points here: the number that floats off it. */
  damaged: (at: Point, amount: number) => void
  /** This pig has just gone down. */
  killed: (pig: Pig) => void
  /** This dummy has just come apart — its script step follows. */
  broken: (target: Target) => void
}

export interface Bullets {
  /**
   * Loose one from this pig, pointed at `aim` — the angle in the engine's
   * 4096-to-the-turn units (lib/game/aim.ts). False when what it holds is not
   * a gun, or when there is no posed hand to fire it from.
   */
  fire(pig: Pig, aim: number): boolean
  /** One frame of every bullet in the air. */
  update(delta: number): void
  /** Every bullet still flying — what a renderer draws and the camera rides. */
  live(): readonly Shot[]
  /** Where the newest one is, for the camera to ride — null when none is up. */
  head(): Shot | null
  clear(): void
}

export function createBullets(world: BulletWorld, events: BulletEvents): Bullets {
  const flying: Shot[] = []
  const standing = world.targets

  /** Whether this bullet is inside that body. */
  const inside = (shot: Shot, body: Point): boolean =>
    Math.abs(shot.x - body.x) < HIT_RADIUS &&
    Math.abs(shot.z - body.z) < HIT_RADIUS &&
    Math.abs(shot.y - body.y) < HIT_RISE

  /** Resolve one bullet where it now is. True if it is spent. */
  const land = (shot: Shot): boolean => {
    // The WORLD first. The exe's projectile update reads the terrain table
    // itself — four sites inside 0x436xxx, the same `[tile] & 0x1F` lookup
    // the walk uses — so a shot is stopped by the ground, and the map's own
    // boxes stop it the same way (lib/game/obstacles.ts).
    if (shot.y >= world.query.height(shot.x, shot.z)) return true
    if (world.obstacles.solid(shot.x, shot.y, shot.z)) return true
    for (const pig of world.pigs()) {
      if (isDead(pig)) continue
      const body = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
      if (!inside(shot, body)) continue
      const amount = damageOf(shot.skill)
      const outcome = hurt(pig, amount, world.training)
      events.damaged(body, amount)
      if (outcome === 'died' || outcome === 'gibbed') events.killed(pig)
      return true
    }
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!world.present(dummy.id)) continue
      if (!inside(shot, dummy)) continue
      const amount = damageOf(shot.skill)
      hurt(dummy, amount, false)
      events.damaged(dummy, amount)
      if (isDead(dummy)) {
        standing.splice(i, 1)
        events.broken(dummy)
      }
      return true
    }
    return false
  }

  return {
    fire(pig, aim) {
      const skill = pig.holding
      if (skill === null || !projectileOf(skill)) return false
      const offset = MUZZLE[skill] ?? { x: 0, y: 0, z: 0 }
      // A gun that cannot find its own barrel does not go off.
      const from = world.pose.boneToWorld(pig, HAND_BONE, offset)
      if (!from) return false
      const shot = fireShot(skill, from, pig.heading, aim)
      if (!shot) return false
      flying.push(shot)
      events.fired(skill)
      return true
    },
    update(delta) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const shot = flying[i]
        // Substep so a slow frame cannot carry a bullet clean THROUGH a body:
        // a rifle covers 4500 units a second and a pig is 320 across.
        const speed = Math.hypot(shot.vx, shot.vy, shot.vz)
        const steps = Math.max(1, Math.ceil((speed * delta) / HIT_RADIUS))
        let done = false
        for (let step = 0; step < steps && !done; step++) {
          advanceShot(shot, delta / steps)
          done = land(shot) || spentShot(shot)
        }
        if (done) flying.splice(i, 1)
      }
    },
    live: () => flying,
    head: () => flying[0] ?? null,
    clear() {
      flying.length = 0
    }
  }
}
