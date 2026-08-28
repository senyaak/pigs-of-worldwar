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
  bounceLob,
  douseInWater,
  lob,
  lobBounce,
  isPlanted,
  lobOf,
  sinkLob,
  skipOffWater,
  skipsOnWater,
  sunkAway
} from './grenade'
import type { Lobbed } from './grenade'
import { burst, mend } from './blast'
import type { Gas } from './gas'
import type { Mines } from './mines'
import type { BlastWorld } from './blast'
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

/** The world a grenade bounces around in — everything a BLAST needs (the pigs,
 * the dummies and the training rule, lib/game/blast.ts) plus the ground it
 * bounces off on the way there. */
export interface LobWorld extends BlastWorld {
  query: TerrainQuery
  obstacles: Obstruction
  /** What is buried in the ground: a thrown thing sets a mine off the same way a
   * foot does (lib/game/mines.ts). */
  mines: Mines
  /** The poison canister's stream (lib/game/gas.ts). Optional the way `fling`
   * is: a bare spec that throws no gas needs none. */
  gas?: Gas
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
  /**
   * PUT one down instead: at the pig's own feet, on the ground, not moving.
   *
   * A charge is not a throw with the gauge left alone — it leaves the pig at a
   * different PLACE. The exe gets there by arithmetic (`speed * charge >> 12` of
   * 50 and a charge of one is nothing) and by the laying clip's own event, and
   * both come out as "it is where the pig is standing" (lib/game/grenade.ts).
   * False when what it holds is not something a pig plants.
   */
  plant(pig: Pig): boolean
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
   * cannot hurt anybody, and it must not hold the turn: this is what keeps the
   * shot sequence open and what the end of a turn waits for.
   */
  live(): number
  /**
   * …and how many of those were THROWN rather than planted.
   *
   * The difference is the whole of "plant it and run": a grenade in the air holds
   * the pig still and turns the fire key into a detonator, and a charge lying at
   * its feet must do neither, or the four seconds the turn hands back are four
   * seconds of standing next to it (lib/game/spend.ts).
   */
  thrown(): number
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
  /** Named in the order they were thrown (lib/game/bullets.ts). */
  let named = 0

  /** Everything within reach takes its share (lib/game/blast.ts). */
  const detonate = (shot: Lobbed): void => {
    const row = lobOf(shot.skill)
    // No row and there is nothing to announce either: a lob without one cannot
    // have been thrown in the first place (`throwOne` refuses).
    if (!row) return
    // A GAS canister does not burst: its destructor is one last cloud and a
    // pop, with no 0x54 and no push — the exe's own shape (lib/game/gas.ts).
    if (row.gas) {
      world.gas?.pop(shot)
      return
    }
    // …and the MEDICINE BALL's burst PUTS POINTS ON — same seam, the mirror
    // routine (lib/game/blast.ts `mend`; the row's `heals` is the read).
    if (row.heals) {
      mend(
        { x: shot.x, y: shot.y, z: shot.z },
        { damage: row.damage, reach: blastRange(row) },
        world,
        emit
      )
      return
    }
    burst(
      { x: shot.x, y: shot.y, z: shot.z },
      { damage: row.damage, reach: blastRange(row) },
      world,
      emit,
      shot.owner
    )
  }

  /**
   * What a contact did to the thing that made it.
   *
   * `'burst'` is the rocket's: state 2 goes straight to state 6 on a landscape
   * contact and the destructor is where the blast is (lib/game/grenade.ts,
   * `Lob.contact`). Everything else either bounced, skipped or sank, and the
   * caller has nothing more to do about it.
   */
  type Landing = 'none' | 'settled' | 'burst'

  const settle = (shot: Lobbed, wasY: number): Landing => {
    const ground = world.query.height(shot.x, shot.z)
    // Its own row's physics material — the surface multiplies its half in.
    const row = lobOf(shot.skill)
    if (!row) return 'none'
    // WATER FIRST, and it is ONE contact — the surface and the bed are the same
    // plane. `Projectile::OnHitLandscape` (0x4377d0) splits on the contact scalar:
    // under 150 it douses (0x437bfb, gated on the water test `0x4A6FA0`), over it
    // the thing is kicked up and skips (0x437e5d). The shipped maps' water is 0 to
    // 48 units deep, so where the water is and where the ground is are the same
    // place. (The `Sound::Play(0x28)` this used to name here belongs to the
    // MINEFIELD arm of the same handler — see the correction in `grenade.ts`.)
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
      // **A ROCKET SKIPS LIKE ANYTHING ELSE.** A first pass read play's "важно в
      // воде не взрывается, а тонет" as "a rocket never skims" and made it a
      // divergence; play corrected it on sight — "ракеты скачат! как и гранаты! я
      // про потонуть когда нельзя скакать!" The rule was the exe's all along and
      // there is no special case: fast along the surface it skips, and when it
      // cannot skip it goes DOWN without going off.
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
        return 'settled'
      }
      // …or it goes in and DOWN, and it does not go off. The quiet flag is the
      // engine's (0x437d34) — play remembered it before the binary said so,
      // "по-моему даже не взрываться" — and the couple of seconds of sinking are
      // the remake's, because there is nothing on these maps to sink through.
      // …and a ROCKET goes the same way. Play, and the exe: the water test comes
      // FIRST in the handler (0x437c74) and the douse sets the quiet flag the
      // destructor reads before anything else (0x4328c9), so nothing that goes
      // in the water goes off — contact weapon or not.
      douseInWater(shot)
      emit({ kind: 'doused', at: on })
      return 'settled'
    }
    if (shot.y >= ground) {
      // A MINEFIELD is set off by anything that touches it, not only by a foot:
      // the projectile's landscape handler tests the same tile bit the pig's
      // ground update does and spawns the same blast (0x437a50, lib/game/mines.ts).
      // On CONTACT rather than at rest — a grenade that bounces once on a mine
      // and rolls off has still trodden on it.
      if (world.mines.tread(shot.x, shot.z)) {
        emit({ kind: 'mineTripped', at: { x: shot.x, y: ground, z: shot.z } })
      }
      // A ROCKET does not bounce: it is stopped where it touched, and the caller
      // sets it off there. Checked BEFORE the bounce, or the blast would land at
      // the reflected point rather than at the impact.
      if (row.contact) {
        shot.y = ground
        return 'burst'
      }
      bounceLob(
        shot,
        ground,
        world.query.normal(shot.x, shot.z),
        world.query.tileType(shot.x, shot.z),
        !world.query.walkable(shot.x, shot.z),
        lobBounce(row)
      )
      return 'settled'
    }
    // A box is a flat stop rather than a surface: the map's obstacles carry no
    // normal, so a grenade that goes into one is put back where it came from
    // and bounced off the vertical. Crude, and the same crudeness a bullet's
    // `solid` test has.
    if (world.obstacles.solid(shot.x, shot.y, shot.z)) {
      if (row.contact) {
        shot.y = wasY
        return 'burst'
      }
      bounceLob(shot, wasY, { x: 0, y: -1, z: 0 }, 0, true, lobBounce(row))
      return 'settled'
    }
    return 'none'
  }

  return {
    throwOne(pig, aim, charge) {
      const skill = pig.holding
      if (skill === null || !lobOf(skill)) return false
      const from = world.pose.boneToWorld(pig, HAND_BONE, THROW_FROM)
      if (!from) return false
      const shot = lob(skill, from, pig.heading, aim, charge, world.random)
      if (!shot) return false
      shot.id = named++
      shot.owner = pig.id
      flying.push(shot)
      // …and the barrel is heard. Every weapon's fire arm plays a sound of its
      // own — the bazooka's is decoded (audio/battle.ts) — and a lob whose sound
      // nobody has read simply makes none.
      emit({ kind: 'fired', skill })
      return true
    },
    plant(pig) {
      const skill = pig.holding
      if (skill === null || !isPlanted(skill) || !lobOf(skill)) return false
      // **IN FRONT, and by the HAND rather than by a number.** Play: "динамит
      // ставится на месте свина, а не перед ним." It was at `pig.position` — the
      // soles — on the reading that clip 77's own event fires with the pig bent
      // over its trotters, and play's word goes in front of that reading.
      //
      // Where it goes instead is not an invented distance: it is the same hand
      // the throw leaves from (`HAND_BONE`, lib/game/pose.ts), which at the
      // laying clip's event is reaching out and down — so the charge is put
      // where the pig actually puts it, and the arm's own reach is the offset.
      //
      // Only the PLAN comes from the hand. The height stays the pig's own feet,
      // because a charge rests on what the pig is standing on and the hand is
      // holding it above that — and a pig on a bridge must not lay one in the
      // ditch. A battle nobody is drawing has no hand to ask (`NO_POSE`), and
      // then it is the feet as before.
      const hand = world.pose.boneToWorld(pig, HAND_BONE, THROW_FROM)
      const at = hand ? { x: hand.x, y: pig.position.y, z: hand.z } : pig.position
      const shot = lob(skill, at, pig.heading, 0, 0, world.random)
      if (!shot) return false
      shot.id = named++
      shot.owner = pig.id
      // It is DOWN, not landing: nothing has to fall for a charge to be placed,
      // and a resting lob is what the renderer draws lying still.
      shot.resting = true
      flying.push(shot)
      // **AND IT IS NOT A WEAPON FIRING.** `fired` was emitted here for one
      // commit and play threw it out on sight — "какой ещё файред на динамит".
      // Right: nothing is loosed, nothing reports, and the noise a charge makes
      // is its FUSE rather than its going down (audio/battleAudio.ts).
      return true
    },
    update(delta) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const shot = flying[i]
        shot.age += delta
        // DOUSED: it is under the water and on its way down. Nothing steps it but
        // the sink — not the fuse, not the ground, not a bounce — and when its
        // couple of seconds are up it is simply gone. The engine's quiet flag is
        // the first thing the destructor tests and that branch spawns no effect
        // and plays no sound (0x4328c9), so there is no blast to hold back.
        if (shot.doused) {
          // …and a gas canister's valve is CLOSED by the water — the quiet
          // flag's own arm (0x437d3b): no stream, and never a pop.
          world.gas?.quench(shot)
          sinkLob(shot, delta)
          if (sunkAway(shot)) flying.splice(i, 1)
          continue
        }
        // A live canister STREAMS — from frame 15 of the flight, rolling or
        // flying alike, so the plume follows wherever it goes (lib/game/gas.ts).
        if (lobOf(shot.skill)?.gas) world.gas?.stream(shot)
        // **A PLACED CHARGE DOES NOT MOVE.** Play: "динамит катится по склону."
        // It did, and stepping it at all was the mistake: gravity pulled it into
        // the hillside, the contact reflected the normal part away and — by the
        // rule this file already got right for grenades — carried the whole
        // slope-parallel part on, so a bundle standing on a slope slid down it for
        // as long as its fuse lasted.
        //
        // Nothing has to fall for a charge to be PUT somewhere (`plant` above), so
        // its fuse is the only thing about it that runs. The exe has a REST state
        // for a body and it is not decoded (`movement/notes.md`); this is that
        // state for the one thing that is born in it.
        if (shot.resting) {
          shot.fuse -= delta
          if (shot.fuse <= 0) {
            detonate(shot)
            flying.splice(i, 1)
          }
          continue
        }
        const speed = Math.hypot(shot.vx, shot.vy, shot.vz)
        const steps = Math.max(1, Math.ceil((speed * delta) / LOB_STEP))
        let spent = false
        for (let step = 0; step < steps && !spent && !shot.doused; step++) {
          const wasY = shot.y
          spent = advanceLob(shot, delta / steps)
          if (settle(shot, wasY) === 'burst') spent = true
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
        // **A CONTACT ROCKET HAS NO FUSE TO CUT SHORT.** Play, twice: "всё ещё
        // при нажатии огонь снаряд базуки взрывается до касания с чем-то." Right,
        // and it is the exe's own shape rather than a rule of ours: row +0x14
        // nil is the contact class, and such a projectile starts in state 2 —
        // one of the two update arms that do nothing at all — with nothing
        // counting it down. What ends it is touching something (0x437F2C). A
        // hand-detonator is the FUSE being cut, and this one has none.
        if (lobOf(flying[i].skill)?.contact) continue
        detonate(flying[i])
        flying.splice(i, 1)
      }
    },
    live: () => flying.filter((one) => !one.doused).length,
    thrown: () => flying.filter((one) => !one.doused && !isPlanted(one.skill)).length,
    all: () => flying,
    at: () => flying.map((one) => ({ x: one.x, y: one.y, z: one.z, fuse: one.fuse })),
    head: () => flying[0] ?? null,
    clear() {
      flying.length = 0
    }
  }
}
