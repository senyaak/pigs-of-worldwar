// Pigs THROWN — the only pigs in this engine that move without being driven.
//
// Play: "мины не отбрасывают — как и тнт", and then "также мины и думаю гранаты
// тоже не отбрасывают — так что это общая проблемма." Right on both counts, and
// the reason was never the blast: the whole engine had exactly ONE locomotion
// state, the acting pig's (lib/game/battle.ts), so there was nowhere to put a
// velocity for anybody else. This module is that somewhere.
//
// It owns no physics of its own. A thrown pig is a pig in the AIR, which
// `updateLocomotion` already knows how to be — the flight, the obstacles, the
// bounce off the ground, the landing and the getting up are all in there
// (lib/game/locomotion.ts `fly`), and the exe agrees that the two are the same
// state: `UpdateMovement` returns at once when the pig's state is 5 (0x46b205),
// so a pig in the air gets no walking and no turning and the physics owns it
// until it lands.
//
// **The ACTING pig is not in here.** It has a locomotion state already and the
// battle drives it; a fling for that one goes straight onto `loco.airborne`,
// which is the same flight a jump takes. Two states for one pig would fight over
// its position, and the one that lost would drag it back to the ground.
//
// Pure, seconds and game space (Y-DOWN) like the rest of lib/game.

import { createLocomotion, updateLocomotion } from './locomotion'
import type { LocomotionState } from './locomotion'
import { chargeLanding } from './falling'
import { fromExeSpeed } from './ballistics'
import { PIG_RADIUS, bodiesOverlap } from './obstacles'
import type { Obstruction } from './obstacles'
import type { Random } from './random'
import { isDead } from './health'
import type { Pig } from './game'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

export interface TumbleWorld {
  query: TerrainQuery
  /** Every pig, so the ones NOT flying can be in the way of the one that is. */
  pigs: () => Pig[]
  /** The map's own objects — a flung pig hits a crate the way a jumping one
   * does. */
  obstacles: Obstruction
  /** The training ground spares a hard landing the way it spares any hit
   * (lib/game/falling.ts → health.ts). */
  training: boolean
  /** The battle's own stream — the barge's bearing jitter is a roll everyone
   * has to agree on (lib/game/random.ts). */
  random: Random
  /**
   * Throw the pig a flying body has just BARGED INTO (`BARGE_SPEED`).
   *
   * Not `fling` above: the pig knocked over may be the ACTING one, whose
   * flight belongs to the battle rather than to this module, so the throw goes
   * out through the same seam a blast's does (lib/game/battle.ts `fling`).
   * OPTIONAL for the reason `BlastWorld.fling` is — a spec about one flight
   * needs nobody to bowl over.
   */
  shove?: (pig: Pig, velocity: Velocity) => void
  /**
   * Whether this pig is ALREADY off the ground — a body in the air is not
   * bowled over again (`BARGE_SPEED`). The flights this module steps it knows
   * about itself; the ACTING pig's is the battle's, which is why this is asked
   * rather than answered here (lib/game/battle.ts `aloft`).
   */
  inTheAir?: (pig: Pig) => boolean
}

/** A throw, as the velocity it starts with — game space, up is −Y. Built by
 * the THROWER: the melee's is `flingVelocity` (the exe's own 45°), a blast's
 * is `hurlVelocity` (the line from the burst to the body's centre). */
export interface Velocity {
  vx: number
  vy: number
  vz: number
}

export interface Tumbles {
  /**
   * Throw this pig with `velocity` — whoever throws says HOW, this only owns
   * the flight. Throwing one that is already in the air REPLACES what it had:
   * a second blast catching a pig mid-flight is the last word on where it goes.
   *
   * `ejected` wears the FLYING clip for the whole arc (a melee hit, a wall's
   * throw-out); `struck` is a BULLET's knockdown — the exe plays clip 39
   * "Bouncing on B-Hind" AT the impact (0x478AC4), so the flight starts
   * already `touched` and wears the bounce from its first frame.
   */
  fling(pig: Pig, velocity: Velocity, ejected?: boolean, struck?: boolean): void
  /** One frame of every flight. */
  update(delta: number): void
  /** How many are in the air — what a turn cannot be handed over through
   * (lib/game/battle.ts `settling`). */
  live(): number
  /** Whether THIS pig is being thrown right now. */
  has(pig: Pig): boolean
  /**
   * A body in the air has moved — knock over whatever it has just run into.
   *
   * Called for this module's own flights by `update`, and by the battle for
   * the ACTING pig, whose flight it drives itself (lib/game/battle.ts
   * `flyOn`). `heading` is the flying body's own, which is what the bearing is
   * measured from.
   */
  barge(pig: Pig, heading: number): void
  /** Where each one is, for a spec to measure — a flight is a thing nothing else
   * can see. */
  at(): { pig: number; y: number; vx: number; vy: number; vz: number }[]
  clear(): void
}

/**
 * **45° UP, along the bearing.** `0x200` of 4096, which is what the engine hands
 * `0x4a9100` at every site that throws a pig about: the melee's knockback
 * (0x4786c1, `weapons/melee.md`), a pig shoved by another body (0x477695,
 * 0x4781cd, 0x4783ff), and the map object at 0x44050c that pushes every pig
 * around it as it goes. Five call sites, one pitch.
 */
export const PITCH = Math.PI / 4

/**
 * **HOW HARD A BODY IN THE AIR KNOCKS OVER THE PIG IT RUNS INTO: 0x40 a
 * frame, 45° up, along its own heading.**
 *
 * The exe's own, and the answer to what a flying body does to a standing one:
 * `Pig::OnHitObject`'s prologue, gated on the OTHER body being type 0x1357 — a
 * pig — and reached from either airborne regime, the plain fall `[pig+0x1FD]`
 * and the FLYING `[pig+0x21C]` (`movement/falling.md`). The call is
 * `0x4A9100(0x40, 0x200, own heading + (rand & 0xFF), 0)` at **0x477842**, and
 * every part of that matters: 0x4A9100 is the SET, not the add, so a body
 * already moving takes the shove whole; 0x200 is the same 45° every knock in
 * this game is thrown at; and the bearing is the FLYER's own heading with a
 * ONE-SIDED jitter of up to `0xFF` of 4096 — 22.4°, never the other way.
 *
 * Do not confuse it with its two siblings in the same prologue: 0x477695 is a
 * PARACHUTIST landing on somebody and its bearing is `rand & 0xFFF`, a whole
 * random turn with no heading in it; 0x47751F is the scripted walk pushing an
 * object. The mask is the tell.
 */
export const BARGE_SPEED = fromExeSpeed(0x40)

/** …and that one-sided jitter, as an angle: `rand & 0xFF` of a 4096 turn. */
export const BARGE_SPREAD = (0xff / 4096) * 2 * Math.PI

/** The velocity a throw of this speed and bearing comes to — spherical, the way
 * `0x4a9100` builds it, and up is −Y. */
export const flingVelocity = (speed: number, bearing: number): Velocity => ({
  // Heading 0 faces +Z and x is its sine, which is the convention the walk and
  // the jump's own push already use (lib/game/locomotion.ts).
  vx: Math.cos(PITCH) * speed * Math.sin(bearing),
  vy: -Math.sin(PITCH) * speed,
  vz: Math.cos(PITCH) * speed * Math.cos(bearing)
})

/**
 * The velocity of a throw off a BLAST, from where the burst stood against
 * the body: `along` is the line from the burst point to the body's own
 * centre of gravity.
 *
 * **The exe's blast throw is READ now — the effect's own PHANTOM SWEEP**
 * (2026-08-26, chased to the end after play corrected two wrong
 * mechanisms in a row: "кидает - как он может не кидать?" and then "газ
 * не толкает вообще"). A combat effect stores RADIUS/FORCE/DAMAGE off
 * its weapon row (+0x14/+0x18/+0x1C — force was the unread field) and
 * fires ONE sweep in its life (0x409EF0): overlap query on a sphere of
 * the radius, two line-of-sight rays (a gas skips them — it reaches
 * around corners), the damage contact queued, and then — gated on the
 * phantom's PUSH flag, which a gas does not carry — a velocity ADD:
 * `normalize(body − burst) × F × (1 − 3d/4R) / mass`, the SAME falloff
 * law as the damage, **with the vertical component DOUBLED** — a blast
 * tosses up — plus a random-signed yaw spin on the pig. Grenade
 * F=2600 R=1024, TNT 6500/5200 R=2048, gases F=0 AND flag off (locked
 * twice), guns F=0 (their knock is `HitByProjectile`'s own add). A
 * pig's mass is 30. `weapons/fire.md`, "the phantom sweep", carries the
 * whole read.
 *
 * So the SHAPE below is the remake's stand-in, kept because play tuned
 * it — and the exe's own formula lands on the same three cases play
 * asked for: a burst under the body throws radially UP (doubled), one
 * above throws DOWN, one beside throws out-and-up. Swapping this for
 * the read formula is now possible whenever play wants it.
 *
 * The SHAPE is three cases, and the boundary between them is the body's
 * own FOOTPRINT (`PIG_RADIUS`):
 *
 * - **Under the body** (the burst inside the trotters' own circle, below
 *   the centre): straight UP — play's "поставить динамит под свина — он
 *   улетит вверх".
 * - **Over the body** (inside the circle, above): straight DOWN — the
 *   knockdown on the spot, "граната прям над свиньёй — падает на жопу".
 * - **Anywhere else: the engine's own 45° knock, at FULL speed along the
 *   flat bearing away from the burst.** Every knock either original ever
 *   throws is pitch 0x200 = 45° — the melee, the shove, the building
 *   blast (PC 0x44050c, PSX 0x800FAC84) — and nothing in either engine
 *   throws steeper. The 45° toss with its bounces and its roll is the
 *   "сдвинута — ещё и по земле откатывает" of play's spec.
 *
 * The first cut of this function interpolated instead — the centre line
 * won whenever it was STEEPER than 45° — and that window is a hundred
 * units wide off a centre 100 over the soles: half a pig. A grenade
 * landing at the trotters, visibly OFFSET, threw at 60..75° with almost
 * no horizontal, went up, came back down beside its crater and read as
 * broken — play, on a hillside: "должно было вверх по горе подвинуть, а
 * он на месте катился". The footprint is the boundary the spec actually
 * drew: под свином is under the PIG, not under a geometric ray.
 */
export const hurlVelocity = (
  speed: number,
  along: { x: number; y: number; z: number },
  /**
   * The unit normal of the ground under the body, game space
   * (`TerrainQuery.normal` — up is NEGATIVE y). Read only when the burst is
   * inside the footprint, and only then because that is the case where the
   * line itself says nothing about which way to go.
   */
  ground?: { x: number; y: number; z: number }
): Velocity => {
  const span = Math.hypot(along.x, along.y, along.z)
  if (span < 1) return { vx: 0, vy: -speed, vz: 0 }
  const flat = Math.hypot(along.x, along.z)
  if (flat < PIG_RADIUS) {
    // Y-DOWN: `along` runs burst → centre, so a burst BELOW the centre has
    // along.y < 0 — up it goes; above, down onto its behind.
    //
    // **AND ON A SLOPE, "UP" IS THE HILL'S UP.** Play, 2026-08-25: "от
    // динамита застрял свин на склоне, а не улетел." The log has the launch:
    // `v 0,-3000,0 flat 0`, and the landing 185 units later — a charge laid
    // under the trotters threw the pig straight into the sky and the same
    // hillside caught it on the way down, which reads as stuck. A body
    // resting on a slope is held by that slope, so what a charge under it
    // does is throw it along the GROUND'S OWN NORMAL: flat ground still
    // gives (0,-1,0) and the straight-up case is untouched, a thirty-degree
    // face throws it thirty degrees down the hill, and the steeper the
    // ground the further it goes.
    if (ground && along.y < 0) {
      return { vx: ground.x * speed, vy: ground.y * speed, vz: ground.z * speed }
    }
    return { vx: 0, vy: along.y < 0 ? -speed : speed, vz: 0 }
  }
  const run = (Math.cos(PITCH) * speed) / flat
  return { vx: along.x * run, vy: -Math.sin(PITCH) * speed, vz: along.z * run }
}

export function createTumbles(world: TumbleWorld, emit: Emit): Tumbles {
  const { query } = world
  /** One locomotion state per pig in the air, by id. */
  const flying = new Map<number, LocomotionState>()

  /**
   * Everything in the way of a body in the AIR: **the map's objects, and only
   * those.**
   *
   * A PIG IS NOT A WALL UP HERE. `withPigs` is the WALKING test — a body you
   * cannot walk into — and the exe has no such thing for a flight: a pig in the
   * air is a rigid body in the physics world (`Pig::StartFalling` pushes it
   * there, 0x4707F0 → 0x4A9720), and what its contact with another pig does is
   * KNOCK THAT ONE OVER (`BARGE_SPEED` — 0x477842). Wearing both, the barge can
   * never fire: the wall stops the flyer at 2·PIG_RADIUS and the contact test
   * is the same distance, so the bodies never meet and a flight into a mate is
   * a pig rising on the spot until it clears his head. That was measured, not
   * reasoned — the barge fired zero times with the wall in.
   *
   * The map's objects keep theirs, and so does the rule that a blocked step is
   * REFUSED rather than paid for (lib/game/locomotion.ts): a crate is a crate.
   */
  const around = (): Obstruction => world.obstacles

  /**
   * Which PAIRS of bodies were touching last frame, so a contact fires ONCE as
   * they meet rather than every frame they overlap.
   *
   * **The key is the pair, not the direction**, and that is load-bearing. The
   * exe's contact pump calls the handler on BOTH sides of a pair (0x4A8B4C),
   * so a shove is symmetrical in principle — but the primitive here is the SET
   * (0x4A9100), and a pig knocked over is a pig in the air, which is the very
   * state that qualifies to shove back. Keyed one way round, a body flung into
   * a mate at 2700 would be shoved back at 960 on the next frame and the
   * blast's own knock would be gone — the bug this whole session was about,
   * rebuilt from the other end.
   *
   * `[CHECK — remake]` on the ONCE. Nothing in the notes puts an
   * already-served mask on this path, and nobody has transcribed the arm
   * (`weapons/fire.md` says so); fired every frame the SET would pin the
   * victim's velocity for as long as the two bodies overlapped, which is a
   * shove lasting as long as the shover takes to pass. Once, on meeting, is
   * the readable half of a fork nobody has read.
   */
  const touching = new Set<string>()
  const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`)

  /** A body in the air has just moved — knock over whatever it has run into. */
  const bargeInto = (flyer: Pig, heading: number): void => {
    const shove = world.shove
    if (!shove) return
    for (const other of world.pigs()) {
      // Never itself, and never a corpse: a dead body is out of the flight's
      // own obstruction list too (`around`), so it is not something this one
      // ran into — it is something it passed through.
      if (other.id === flyer.id || isDead(other)) continue
      // **AND ONLY A BODY ON THE GROUND IS BOWLED OVER.** `[CHECK — remake]`,
      // and the reason is a measurement: with airborne victims in, two pigs
      // caught by ONE blast rob each other. They are thrown the same way at the
      // same instant, they overlap on the way out, and the shove is a SET — so
      // whichever is stepped first cuts the other from 2700 down to 960 and the
      // blast's own knock is gone. `002/knockback.spec.ts` failed on exactly
      // that, 420 units of travel where the arithmetic wanted 486.
      //
      // The exe is no help here and says so: `weapons/fire.md` has never
      // transcribed the prologue arm, and the one hint cuts BOTH ways —
      // 0x4A9100 carries a `[body+0x46] & 0x2000` live-body test that 0x4A9260
      // does not, which either means only bodies already in the physics take
      // the shove (the opposite of this) or that the arm enables the victim's
      // physics first (unrecorded). What is not in doubt is which of the two
      // readings keeps the behaviour play asked for.
      if (flying.has(other.id) || world.inTheAir?.(other) === true) continue
      const pair = pairKey(flyer.id, other.id)
      if (!bodiesOverlap(flyer.position, other.position)) {
        touching.delete(pair)
        continue
      }
      if (touching.has(pair)) continue
      touching.add(pair)
      // The bearing is the FLYER's, jittered one way only — and a pig already
      // in the air takes it too, because the exe's primitive here is the SET
      // and a moving body is exactly what it is written for.
      shove(other, flingVelocity(BARGE_SPEED, heading + world.random() * BARGE_SPREAD))
    }
  }

  return {
    barge: bargeInto,
    fling(pig, velocity, ejected = false, struck = false) {
      // Built where the pig IS, standing on whatever it is standing on — a pig
      // blown off a crate must not be measured from the ground under it
      // (lib/game/locomotion.ts `Footing`).
      const state =
        flying.get(pig.id) ??
        createLocomotion(query, pig.position.x, pig.position.z, pig.heading, {
          y: pig.position.y,
          obstruction: world.obstacles
        })
      state.x = pig.position.x
      state.z = pig.position.z
      state.y = pig.position.y
      const { vx, vy, vz } = velocity
      // `bouncing` is what makes it read as being thrown rather than jumping:
      // the clip is the BOUNCE and the landing bounces on before it settles
      // (lib/game/locomotion.ts). `ejected` swaps that clip for the FLYING
      // one — which is what a MELEE hit wears, the exe putting a struck pig
      // through 0x470c70 and that arm calling for clip 38 (0x470cf5), the
      // same clip a pig thrown out of a wall gets.
      // …and `hurled`: every throw in the exe enters the FLYING state
      // (0x470c70), which is the one the ground can hurt on arrival
      // (lib/game/falling.ts).
      state.airborne = {
        vx,
        vy,
        vz,
        bouncing: true,
        pushIn: null,
        ejected,
        touched: struck,
        hurled: true
      }
      state.getUp = 0
      flying.set(pig.id, state)
      // Nothing is announced HERE: the clip the pig will wear is the one the first
      // frame of the flight picks, and `update` announces it the moment it
      // changes. Saying anything now would only be the standing clip again.
    },
    update(delta) {
      for (const [id, state] of [...flying]) {
        const pig = world.pigs().find((one) => one.id === id)
        if (!pig) {
          flying.delete(id)
          continue
        }
        const was = state.clip
        // Nothing is DRIVEN here: no walk, no turn, no jump. The exe skips the
        // whole movement update for a pig in the air and so does this.
        updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, delta, around())
        pig.position = { x: state.x, y: state.y, z: state.z }
        // …and whoever it has just run into goes over (`BARGE_SPEED`). After
        // the move, because what it has run into is decided by where it now is.
        bargeInto(pig, state.heading)
        // A hard arrival costs its flat four — a thrown pig is FLYING and the
        // ground charges it per qualifying contact (lib/game/falling.ts).
        chargeLanding(pig, state, world.training, emit)
        // A dead pig still flies — it is a body, and the exe throws corpses about
        // as happily as anything else — but it must not be told to stand up out of
        // its own dying clip.
        if (state.clip !== was && !isDead(pig)) {
          emit({ kind: 'clip', pig: pig.id, index: state.clip, once: state.commit })
        }
        // Down for good — but NOT gone until it is back on its feet. The
        // landing hands out `getUp` (lib/game/locomotion.ts `fly`), and the
        // only thing that burns it and HOLDS the get-up clip is `ground()`,
        // which nothing else runs for a pig that is not acting. Deleting on
        // the landing frame was the invisible knockdown play reported ("свин
        // даже не шелохнулся"): the very next battle frame found
        // `tumbles.has(pig)` false and stamped IDLE over a get-up that had
        // lived one step. So the record stays — and both dressing loops keep
        // skipping the pig — until the get-up has run down. A DEAD body keeps
        // none: its dying clip is not a stand-up (the `isDead` guard above),
        // and the corpse flow waits on `tumbling` (lib/game/corpses.ts).
        if (state.airborne === null && (state.getUp <= 0 || isDead(pig))) flying.delete(id)
      }
    },
    live: () => flying.size,
    has: (pig) => flying.has(pig.id),
    at: () =>
      [...flying].map(([pig, state]) => ({
        pig,
        y: state.y,
        vx: state.airborne?.vx ?? 0,
        vy: state.airborne?.vy ?? 0,
        vz: state.airborne?.vz ?? 0
      })),
    clear() {
      flying.clear()
      touching.clear()
    }
  }
}
