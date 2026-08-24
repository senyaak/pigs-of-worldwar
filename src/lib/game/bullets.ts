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
import { fromExeSpeed } from './ballistics'
import type { Velocity } from './tumble'
import { hurt, isDead } from './health'
import { originY } from './body'
import { HAND_BONE } from './pose'
import type { Point, Pose } from './pose'
import type { Pig } from './game'
import type { Target } from './targets'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

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

/**
 * How near a bullet has to pass A PIG. The exe gives every gun's projectile a
 * collision box of ZERO in its table, so this is the BODY's size rather than the
 * bullet's, and it is the remake's reading of a hit rather than a decoded one.
 *
 * It is the pig's own collision radius because a pig is what it is asking about.
 * **It used to be the test for a DUMMY as well, and that is the bug play found**
 * — see `land` below.
 */
const HIT_RADIUS = PIG_RADIUS
const HIT_RISE = 320

/**
 * **A bullet SHOVES the body it hits — read, not ruled.** `Pig::HitByProjectile`
 * (0x478710, disassembled to its last arm 2026-08-24) ends every bullet path
 * in `0x4A9260(0x30, [proj+0x90], [proj+0x94], 0)` at 0x478AA1 — the ADD
 * primitive, 48 units a frame along the projectile's OWN pitch and bearing.
 * The 0x30 is a literal in the instruction stream, not a weapon-table field
 * (the row's only field read there is the damage at +0x0C); the one exception
 * is projectile kind 0x12 — the flame family, not fielded here — which pushes
 * 6. It is the same 0x30 the jump's own push uses (`JUMP_PUSH`).
 *
 * And the body is KNOCKED DOWN with it: unless it is already falling, 0x478AB2
 * calls 0x470C70 — movement state 5 — and 0x478AC4 plays clip 39, "Bouncing on
 * B-Hind", which is exactly the BOUNCE arm `tumbles.fling` wears without the
 * `ejected` flag (the melee's clip 38 is the flag's).
 */
export const SHOT_SHOVE = fromExeSpeed(0x30)

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
  /** Throw the struck pig (SHOT_SHOVE above). OPTIONAL the way `BlastWorld`'s
   * is: a spec about the flight or the damage alone needs no thrower. */
  fling?: (pig: Pig, velocity: Velocity) => void
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

export function createBullets(world: BulletWorld, emit: Emit): Bullets {
  const flying: Shot[] = []
  /** Names them in the order they were fired, which is the same on any machine
   * stepping the same battle. */
  let named = 0
  const standing = world.targets

  /** Take a shot's damage off the target at `at`, and knock it down if that
   * finished it. One place, because two callers reach it now: the box that
   * stopped the bullet, and the point test for a target that has no box. */
  const breakInto = (at: number, skill: number): void => {
    const dummy = standing[at]
    const amount = damageOf(skill)
    hurt(dummy, amount, false)
    emit({ kind: 'damaged', at: dummy, amount, structure: dummy.structure, metal: dummy.metal })
    if (isDead(dummy)) {
      standing.splice(at, 1)
      emit({ kind: 'broke', target: dummy.id, at: { x: dummy.x, y: dummy.y, z: dummy.z } })
    }
  }

  /** Whether this bullet is inside that body. */
  const inside = (shot: Shot, body: Point): boolean =>
    Math.abs(shot.x - body.x) < HIT_RADIUS &&
    Math.abs(shot.z - body.z) < HIT_RADIUS &&
    Math.abs(shot.y - body.y) < HIT_RISE

  /** Resolve one bullet where it now is: WHAT it ended in, or null for
   * still flying — 'flesh' is a pig, 'hard' everything else that stops a
   * round, and the difference is a different impact noise
   * (audio/battleAudio.ts). */
  const land = (shot: Shot): 'flesh' | 'hard' | null => {
    // The WORLD first. The exe's projectile update reads the terrain table
    // itself — four sites inside 0x436xxx, the same `[tile] & 0x1F` lookup
    // the walk uses — so a shot is stopped by the ground, and the map's own
    // boxes stop it the same way (lib/game/obstacles.ts).
    if (shot.y >= world.query.height(shot.x, shot.z)) return 'hard'
    /**
     * **…and whatever BOX stopped it takes the hit, if that box is something
     * that breaks.**
     *
     * Play: "пуля врезается в манекен и ничего не происходит — там что-то с
     * регистрацией попаданий." Exactly right, and the cause is a coupling that
     * had no business existing: this used to be a flat `solid()` that spent the
     * bullet, and the dummy was then looked for by the POINT test below — whose
     * window was `HIT_RADIUS`, which is `PIG_RADIUS`.
     *
     * A DUMMY is BOTH a collision box (128 × 512 × 256) and a target. So which of
     * the two tests fires first is pure geometry: at the old `PIG_RADIUS` of 170
     * the point window was wider than the box's own 128 of half-depth, so a bullet
     * flying at a dummy entered the window a step BEFORE the box and the target
     * loop caught it. Halving the pig to 85 — for a completely different reason,
     * how near a pig may stand to a wall — pulled the window inside the box, and
     * from then on every shot was swallowed by the collider one step before it
     * could ever reach the target. The dummy is hit and nothing happens.
     *
     * Asking the box WHICH record it was removes the coincidence: a bullet is
     * stopped by geometry, and the geometry's owner takes the damage. A record's
     * own box is a better hit shape than a radius borrowed from a pig, and the two
     * numbers can now move without silently disarming each other.
     */
    const stopper = world.obstacles.stopper(shot.x, shot.y, shot.z)
    if (stopper !== null) {
      const at = standing.findIndex((one) => one.id === stopper)
      if (at >= 0 && world.present(stopper)) breakInto(at, shot.skill)
      return 'hard'
    }
    for (const pig of world.pigs()) {
      if (isDead(pig)) continue
      const body = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
      if (!inside(shot, body)) continue
      const amount = damageOf(shot.skill)
      const outcome = hurt(pig, amount, world.training)
      emit({ kind: 'damaged', at: body, amount, pig: pig.id })
      if (outcome === 'died' || outcome === 'gibbed') {
        emit({ kind: 'killed', pig: pig.id, by: shot.owner, gibbed: outcome === 'gibbed' })
      }
      // …and the SHOVE, along the bullet's own line (SHOT_SHOVE above). After
      // the kill is announced, because the exe's one gate on it is the body
      // being GONE (state 8, 0x4789EF) — a fresh corpse is thrown as happily
      // as a live pig, and an overkill's body has already left the world.
      if (!pig.gone) {
        const span = Math.hypot(shot.vx, shot.vy, shot.vz)
        if (span > 0) {
          world.fling?.(pig, {
            vx: (shot.vx / span) * SHOT_SHOVE,
            vy: (shot.vy / span) * SHOT_SHOVE,
            vz: (shot.vz / span) * SHOT_SHOVE
          })
        }
      }
      return 'flesh'
    }
    // …and a target with NO collider at all — a bush, a low prop, anything the
    // solidity rule leaves out — is still shot by the point test. That is what
    // this loop was always for; it simply is not what a dummy needs.
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!world.present(dummy.id)) continue
      if (!inside(shot, dummy)) continue
      breakInto(i, shot.skill)
      return 'hard'
    }
    return null
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
      shot.id = named++
      shot.owner = pig.id
      flying.push(shot)
      emit({ kind: 'fired', skill })
      return true
    },
    update(delta) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const shot = flying[i]
        // Substep so a slow frame cannot carry a bullet clean THROUGH a body:
        // a rifle covers 4500 units a second and a pig is 320 across.
        const speed = Math.hypot(shot.vx, shot.vy, shot.vz)
        const steps = Math.max(1, Math.ceil((speed * delta) / HIT_RADIUS))
        let done: 'flesh' | 'hard' | 'air' | null = null
        for (let step = 0; step < steps && !done; step++) {
          advanceShot(shot, delta / steps)
          done = land(shot) ?? (spentShot(shot) ? 'air' : null)
        }
        if (done) {
          flying.splice(i, 1)
          // Wherever it ended — a body, the ground, a box, thin air — the
          // camera's beat wants the spot, and the EAR wants to know which
          // (lib/game/battle.ts, audio/battleAudio.ts).
          emit({ kind: 'shotLanded', at: { x: shot.x, y: shot.y, z: shot.z }, hit: done })
        }
      }
    },
    live: () => flying,
    head: () => flying[0] ?? null,
    clear() {
      flying.length = 0
    }
  }
}
