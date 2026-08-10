// The grenades in the air, and what they do when they stop.
//
// `grenade.ts` is one lob's arc, its bounce and its fuse; this is the WORLD's
// worth of them — the list, the substepping, what each contact resolves
// against, and the blast. It lived in `three/grenades.ts` around a pool of
// meshes, which is the same knot the bullets were in: a grenade could only
// exist where there was something to draw it.
//
// Nothing here draws or makes a noise. A splash, a skim, a dousing and a blast
// are ANNOUNCED (`LobEvents`) and whoever is presenting the battle decides what
// they look and sound like.
//
// The BLAST is the part with the least binary behind it, and `grenade.ts` says
// so at every constant. Decoded: the arc, the fuse and the ±0x400 box the
// projectile marks pigs in. Invented: how much it takes off, and the falloff.
//
// Game space (Y-down) throughout.

import {
  advanceLob,
  blastRange,
  blastShare,
  bounceLob,
  douseInWater,
  lob,
  lobBounce,
  lobOf,
  sinkLob,
  skipOffWater,
  skipsOnWater,
  sunkAway
} from './grenade'
import type { Lobbed } from './grenade'
import { DAMAGE_UNIT } from './projectile'
import { hurt, isDead } from './health'
import { originY } from './body'
import { HAND_BONE } from './pose'
import type { Point, Pose } from './pose'
import type { Random } from './random'
import type { Pig } from './game'
import type { Target } from './targets'
import type { Obstruction } from './obstacles'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

/**
 * How far a grenade may move between collision tests, in game units — its own
 * drawn size, so it cannot step over a surface it is smaller than. 35 is what
 * the body factory gives a projectile (`bulletSize`, lib/game/projectile.ts).
 * At full charge it covers 4500 units a second, and a step of 512 walked it
 * clean through a slope.
 */
export const LOB_STEP = 35

/**
 * Where it leaves the hand.
 *
 * The shot's own byte map (0x47cf68) picks a row of 0x4d0ee0 per weapon and
 * the grenade family's rows have NOT been pulled out of it — that table is
 * read for weapons 6..0x26 and the grenades are 19..27, so they are in range
 * and simply not transcribed yet. The bone itself stands in meanwhile, which
 * puts the throw at the trotter rather than a hand's length in front of it.
 */
const THROW_FROM: Point = { x: 0, y: 0, z: 0 }

/** The world a grenade bounces around in. */
export interface LobWorld {
  /** Everyone a blast can catch. */
  pigs: () => Pig[]
  /** The map's dummies — the SAME array the blade and the bullets splice from,
   * or a dummy dies twice (lib/game/targets.ts). */
  targets: Target[]
  /** Whether the map SCRIPT has placed this dummy yet (lib/game/script.ts). */
  present: (id: number) => boolean
  query: TerrainQuery
  obstacles: Obstruction
  training: boolean
  /** Where the hand is (lib/game/pose.ts). */
  pose: Pose
  /** The battle's own stream (lib/game/random.ts). The fuse is thrown with a
   * jitter of up to seven frames and that decides when it goes off, so it is
   * a roll the whole battle has to agree on. */
  random: Random
}

export interface Lobs {
  /** Throw one from this pig at `aim`, with the gauge's `charge` behind it.
   * False if what it holds is not lobbed, or there is no hand to throw from. */
  throwOne(pig: Pig, aim: number, charge: number): boolean
  /** One frame of every grenade in the air or rolling. */
  update(delta: number): void
  /**
   * Set off everything that is live, now.
   *
   * Play's: "при повторном нажатии f граната должна взрываться." Nothing in
   * the exe has been read for it — the fire handler's own branch on a live
   * projectile has not been found — so the trigger is the remake's while the
   * blast it runs is the same one the fuse runs.
   */
  detonateNow(): void
  /**
   * How many are LIVE — which a sinking one is not. It cannot be set off, it
   * cannot hurt anybody, and it must not hold the turn: this count is what says
   * the pig is committed, what keeps the shot sequence open, and what turns the
   * fire key into a detonator.
   */
  live(): number
  /** Every one that exists, sinking ones included — what a renderer draws. */
  all(): readonly Lobbed[]
  /** Where each one is and how long it has left — what a spec measures a miss
   * with, since a grenade that lands short looks exactly like a blast that does
   * not reach. */
  at(): { x: number; y: number; z: number; fuse: number }[]
  /** Where the newest one is, for the camera to ride — null when none is up. */
  head(): Lobbed | null
  clear(): void
}

export function createLobs(world: LobWorld, emit: Emit): Lobs {
  const flying: Lobbed[] = []
  const standing = world.targets

  /** Everything within reach takes its share. */
  const detonate = (shot: Lobbed): void => {
    const where = { x: shot.x, y: shot.y, z: shot.z }
    emit({ kind: 'blasted', at: where })
    const row = lobOf(shot.skill)
    if (!row) return
    /** Points at the core, and the share a body this far out takes. */
    const reach = blastRange(row)
    const took = (dx: number, dy: number, dz: number): number =>
      Math.round((row.damage * blastShare(Math.hypot(dx, dy, dz), reach)) / DAMAGE_UNIT)
    for (const pig of world.pigs()) {
      if (isDead(pig)) continue
      const body = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
      const amount = took(body.x - shot.x, body.y - shot.y, body.z - shot.z)
      if (amount <= 0) continue
      const outcome = hurt(pig, amount, world.training)
      emit({ kind: 'damaged', at: body, amount })
      if (outcome === 'died' || outcome === 'gibbed') emit({ kind: 'killed', pig })
    }
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!world.present(dummy.id)) continue
      const amount = took(dummy.x - shot.x, dummy.y - shot.y, dummy.z - shot.z)
      if (amount <= 0) continue
      hurt(dummy, amount, false)
      emit({ kind: 'damaged', at: dummy, amount })
      if (isDead(dummy)) {
        standing.splice(i, 1)
        emit({ kind: 'broke', target: dummy })
      }
    }
  }

  /** Put it back on whatever it went into. False when it met nothing. */
  const settle = (shot: Lobbed, wasY: number): boolean => {
    const ground = world.query.height(shot.x, shot.z)
    // Its own row's physics material — the surface multiplies its half in.
    const row = lobOf(shot.skill)
    if (!row) return false
    // WATER FIRST, and it is ONE contact — the surface and the bed are the same
    // plane. `Projectile::OnHitLandscape` (0x4377d0) is the whole of it: over a
    // water-flagged tile it puts a splash at the water height and plays sound
    // 0x28 at 100/100, and then the arm splits on the contact scalar — under 150
    // it douses (0x437bfb), over it the thing is kicked up and skips (0x437e5d).
    // The shipped maps' water is 0 to 48 units deep, so where the water is and
    // where the ground is are the same place.
    if (world.query.isWater(shot.x, shot.z) && shot.y >= world.query.surface(shot.x, shot.z)) {
      const level = world.query.surface(shot.x, shot.z)
      const on = { x: shot.x, y: level, z: shot.z }
      // The splash happens either way — the handler does it before it looks at
      // the speed at all.
      emit({ kind: 'splashed', at: on })
      // FAST ALONG THE SURFACE: it SKIPS. The engine resolves the contact with
      // the tile's own material and then kicks the thing up by a fifth of the
      // in-plane speed (0x4A9260 at an angle of 0x400 — a quarter turn, straight
      // up), which is a stone off a pond, and the fifth is paid for out of the
      // travel so the hops run down (lib/game/grenade.ts).
      if (skipsOnWater(shot)) {
        bounceLob(
          shot,
          level,
          { x: 0, y: -1, z: 0 },
          world.query.tileType(shot.x, shot.z),
          false,
          lobBounce(row)
        )
        skipOffWater(shot)
        emit({ kind: 'skimmed', at: on })
        return true
      }
      // …or it goes in and DOWN, and it does not go off. The quiet flag is the
      // engine's (0x437d34) — play remembered it before the binary said so,
      // "по-моему даже не взрываться" — and the couple of seconds of sinking are
      // the remake's, because there is nothing on these maps to sink through.
      douseInWater(shot)
      emit({ kind: 'doused', at: on })
      return true
    }
    if (shot.y >= ground) {
      bounceLob(
        shot,
        ground,
        world.query.normal(shot.x, shot.z),
        world.query.tileType(shot.x, shot.z),
        !world.query.walkable(shot.x, shot.z),
        lobBounce(row)
      )
      return true
    }
    // A box is a flat stop rather than a surface: the map's obstacles carry no
    // normal, so a grenade that goes into one is put back where it came from
    // and bounced off the vertical. Crude, and the same crudeness a bullet's
    // `solid` test has.
    if (world.obstacles.solid(shot.x, shot.y, shot.z)) {
      bounceLob(shot, wasY, { x: 0, y: -1, z: 0 }, 0, true, lobBounce(row))
      return true
    }
    return false
  }

  return {
    throwOne(pig, aim, charge) {
      const skill = pig.holding
      if (skill === null || !lobOf(skill)) return false
      const from = world.pose.boneToWorld(pig, HAND_BONE, THROW_FROM)
      if (!from) return false
      const shot = lob(skill, from, pig.heading, aim, charge, world.random)
      if (!shot) return false
      flying.push(shot)
      return true
    },
    update(delta) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const shot = flying[i]
        // DOUSED: it is under the water and on its way down. Nothing steps it but
        // the sink — not the fuse, not the ground, not a bounce — and when its
        // couple of seconds are up it is simply gone. The engine's quiet flag is
        // the first thing the destructor tests and that branch spawns no effect
        // and plays no sound (0x4328c9), so there is no blast to hold back.
        if (shot.doused) {
          sinkLob(shot, delta)
          if (sunkAway(shot)) flying.splice(i, 1)
          continue
        }
        const speed = Math.hypot(shot.vx, shot.vy, shot.vz)
        const steps = Math.max(1, Math.ceil((speed * delta) / LOB_STEP))
        let spent = false
        for (let step = 0; step < steps && !spent && !shot.doused; step++) {
          const wasY = shot.y
          spent = advanceLob(shot, delta / steps)
          settle(shot, wasY)
          // Whatever happened, it does not END below the ground. A bounce off
          // a slope reflects into the hill as often as out of it, and one
          // sub-step of that is enough to lose the thing.
          const floor = world.query.height(shot.x, shot.z)
          if (!shot.doused && shot.y > floor) shot.y = floor
        }
        if (!spent) continue
        detonate(shot)
        flying.splice(i, 1)
      }
    },
    detonateNow() {
      // A DOUSED one is not set off by anything, ever: the engine's quiet flag is
      // the first thing the destructor tests and that branch has no blast in it
      // (0x4328c9). Play caught the hand-detonate going through it — "взрывать
      // руками когда граната тонет ещё можно" — and it goes on sinking instead.
      for (let i = flying.length - 1; i >= 0; i--) {
        if (flying[i].doused) continue
        detonate(flying[i])
        flying.splice(i, 1)
      }
    },
    live: () => flying.filter((one) => !one.doused).length,
    all: () => flying,
    at: () => flying.map((one) => ({ x: one.x, y: one.y, z: one.z, fuse: one.fuse })),
    head: () => flying[0] ?? null,
    clear() {
      flying.length = 0
    }
  }
}
