// The acting pig's hand-to-hand swing, resolved.
//
// `melee.ts` is one weapon's reach and one swing's timeline; this is the swing
// happening — the blade sampled off the hand, everyone it sweeps over, the
// damage, the once-per-swing guard and the round it spends. It lived in
// `three/swing.ts`, which held a `Set<Soldier>` and played clips directly, so
// a blow could not land without meshes to land on.
//
// Nothing here draws or makes a noise. The clip a swing puts on, the rings it
// throws and the number that floats off a hit are ANNOUNCED (`StrikeEvents`).
//
// Game space (Y-down) throughout.

import { fromExeSpeed } from './ballistics'
import { flingVelocity } from './tumble'
import type { Velocity } from './tumble'
import { advanceSwing, beginSwing, caught, meleeOf, strikeGap, strikeOffsets } from './melee'
import type { StrikeGap, SwingState } from './melee'
import { amountOf, spend } from './inventory'
import { hurt, isDead } from './health'
import { originY } from './body'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import { HAND_BONE } from './pose'
import type { Point, Pose } from './pose'
import { reached } from './targets'
import type { Target } from './targets'
import type { Pig } from './game'
import type { Emit } from './events'

/**
 * What the last strike actually measured — the ONE thing a miss cannot be
 * diagnosed without. The blade is three points off a bone that is halfway
 * through an animation, so "it did not hit" has four separate ways of being
 * true and no way to tell them apart by eye.
 */
export interface StrikeReport {
  /** The blade's sample points, game space: tip, middle, hand. */
  blade: Point[]
  attacker: { name: string; x: number; z: number; heading: number }
  /** Every other pig, whether or not it was caught. */
  candidates: {
    name: string
    /** Nearest approach per axis, against STRIKE_SPREAD / STRIKE_RISE. */
    gap: StrikeGap
    /** How far round the target stands, in degrees — against 67.5. */
    degrees: number
    hit: boolean
  }[]
  /** Every dummy still standing, measured the same way. Empty on a map that
   * carries none, which is every map but the training ground. */
  dummies: { id: number; gap: StrikeGap; hit: boolean }[]
}

export interface StrikeWorld {
  /** Everyone a blade can catch, the attacker included — it is skipped by
   * identity. */
  pigs: () => Pig[]
  /** The map's dummies — the SAME array the bullets and the blast splice from
   * (lib/game/targets.ts). */
  targets: Target[]
  /** Whether the map SCRIPT has put this one on the ground yet: the exe's own
   * strike tests `[obj+0x30]`, the placed flag, before it will hit one
   * (0x476319). */
  present: (id: number) => boolean
  /** Whether this is the training ground, where a PIG cannot be killed — the
   * exe floors it at one point (lib/game/health.ts). A dummy has no such
   * mercy: 0x48d990 has no training test in it at all. */
  training: boolean
  /** Where the blade is (lib/game/pose.ts). */
  pose: Pose
  /** How long each clip runs — indexed as the exe indexes them
   * (lib/game/locomotion.ts, ANIM). */
  clips: ClipTiming[]
  /**
   * Throw a struck pig — the same seam the blast's own toss goes through
   * (lib/game/battle.ts), and the thrower builds the velocity: the melee's
   * is the exe's own 45° along the bearing (`flingVelocity`). OPTIONAL for
   * the same reason `BlastWorld.fling` is: a spec about damage alone needs
   * no bodies to move.
   */
  fling?: (pig: Pig, velocity: Velocity, ejected?: boolean) => void
}

export interface Strikes {
  /**
   * Swing what the pig is holding. Refused — and says so — when it holds
   * nothing that swings or is already mid-swing, which is the exe's own fire
   * gate (0x467a10 returns false on both).
   */
  begin(pig: Pig): boolean
  /** Whether a swing is under way at all, wind-up included. The pig cannot be
   * WALKED for any of it (0x46afd5 refuses on both flags). */
  running(): boolean
  /** Whether the clip itself is playing. The pig cannot be TURNED during it
   * (0x46af43), and it owns the animation while it lasts. */
  swinging(): boolean
  /** One frame of it, for the pig doing the swinging. */
  update(delta: number, actor: Pig): void
  /** What the last strike measured, or null before there has been one. */
  lastStrike(): StrikeReport | null
  /** Forget any swing — a new turn, or a warp. */
  reset(): void
}

export function createStrikes(world: StrikeWorld, emit: Emit): Strikes {
  let state: SwingState | null = null
  /** Who this swing has already caught: the exe sets `[pig+0x1b0]` on a
   * struck pig and clears it on every pig at the last strike (event id 70),
   * so one swing lands on a body once however many frames it sweeps over it. */
  let already = new Set<Pig>()
  /** The last strike's measurements, for `pow.debug.strike()`. */
  let report: StrikeReport | null = null
  const standing = world.targets

  /** The three points the blade is sampled at, in game space. */
  const points = (attacker: Pig, skill: number): Point[] => {
    const weapon = meleeOf(skill)
    if (!weapon) return []
    // The bone carries the whole of it: where the pig stands, which way it
    // faces, and what this frame of the swing has done to its arm. The aim
    // angle is NOT in it, and that is the exe's behaviour, not a gap
    // (lib/game/melee.ts).
    const blade: Point[] = []
    for (const offset of strikeOffsets(weapon)) {
      const at = world.pose.boneToWorld(attacker, HAND_BONE, offset)
      if (at) blade.push(at)
    }
    return blade
  }

  /** Resolve the blade against everyone standing about, once. */
  const strike = (attacker: Pig, skill: number): void => {
    const weapon = meleeOf(skill)
    if (!weapon) return
    const blade = points(attacker, skill)
    const from = { x: attacker.position.x, z: attacker.position.z, heading: attacker.heading }
    report = { blade, attacker: { name: attacker.name, ...from }, candidates: [], dummies: [] }
    for (const target of world.pigs()) {
      if (target === attacker) continue
      // A pig's body sits at the model's origin — the hip — which is exactly
      // the position the exe compares (lib/game/body.ts).
      const body = {
        x: target.position.x,
        y: originY(target.position.y, target.body),
        z: target.position.z
      }
      const gap = strikeGap(blade, from, body)
      // A body already down is not struck again, nor one this swing has
      // caught already — the exe's first test in `Pig::TakeDamage` is the
      // dead state (0x467ac9) and `[pig+0x1b0]` is the once-per-swing guard.
      const hit = caught(gap) && !already.has(target) && !isDead(target)
      report.candidates.push({ name: target.name, gap, degrees: (gap.off * 180) / Math.PI, hit })
      if (!hit) continue
      already.add(target)
      const outcome = hurt(target, weapon.damage, world.training)
      emit({ kind: 'damaged', at: body, amount: weapon.damage, pig: target.id })
      // The exe throws the weapon's own effect on every body it catches
      // (0x476187, inside the same loop). WHERE exactly is not pinned — it
      // spawns off a point 0x44e8e0 writes into a stack local, which has not
      // been read — so this puts it on the body, which is where the damage
      // number goes too.
      emit({ kind: 'struck', skill, at: body })
      // …AND IT THROWS THE BODY. Play: a bayonet moved nothing at all.
      //
      // The exe's melee arm ends on two calls the blast's does not have:
      // `0x4a9100(knockback, 0x200, bearing, 0)` at 0x4786c1, which SETS the
      // velocity — the blast's own toss is not in the exe's damage arm at all
      // and is the physics contact instead (lib/game/blast.ts) — and then
      // 0x470c70, which puts the pig in movement state 5 and calls for clip 38
      // (0x470cf5). So the body flies rather than bounces, and is not driven
      // or turned until it lands. `ejected` is that clip.
      //
      // The bearing is the ATTACKER'S line to the body, which is the same
      // local the 67.5° cone test measures the swing by, so a pig is pushed
      // straight away from whoever hit it — and the same convention the blast
      // uses, atan2 on the difference with the target's own heading as the
      // fallback for a body standing exactly on the point.
      const dx = body.x - from.x
      const dz = body.z - from.z
      const away = Math.hypot(dx, dz) < 1 ? target.heading : Math.atan2(dx, dz)
      world.fling?.(target, flingVelocity(fromExeSpeed(weapon.knockback), away), true)
      if (outcome === 'died' || outcome === 'gibbed') {
        emit({ kind: 'killed', pig: target.id, by: attacker.id, gibbed: outcome === 'gibbed' })
      }
    }

    // …and the dummies, through the identical test. The exe runs it as a
    // second pass over its own scenery after the pigs (0x4762e0), and gives
    // the target the same impact noise.
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!world.present(dummy.id)) continue
      report.dummies.push({
        id: dummy.id,
        gap: strikeGap(blade, from, dummy),
        hit: reached(blade, from, dummy)
      })
      if (!reached(blade, from, dummy)) continue
      // One point, so anything at all flattens it (lib/game/targets.ts).
      hurt(dummy, weapon.damage, false)
      emit({ kind: 'damaged', at: dummy, amount: weapon.damage, structure: dummy.structure })
      emit({ kind: 'struck', skill, at: dummy })
      if (isDead(dummy)) {
        standing.splice(i, 1)
        emit({ kind: 'broke', target: dummy.id, at: { x: dummy.x, y: dummy.y, z: dummy.z } })
      }
    }

    // **AND A SWING THAT CAUGHT NOTHING SAYS SO.** `I_SWMISS` is the sample
    // play placed as the miss (docs/todo.md P2) and it had been wired to the
    // grenade's whoosh alone. Two moments, one sound; this is the other one.
    if (report.candidates.every((one) => !one.hit) && report.dummies.every((one) => !one.hit)) {
      emit({ kind: 'swungWide', at: from })
    }
  }

  return {
    begin(pig) {
      if (state) return false
      const skill = pig.holding
      const weapon = meleeOf(skill)
      if (!weapon || skill === null) return false
      state = beginSwing(skill, clipSeconds(world.clips[weapon.clip]))
      return state !== null
    },
    running: () => state !== null,
    swinging: () => state !== null && state.waiting <= 0,
    lastStrike: () => report,
    reset() {
      state = null
      already = new Set()
    },
    update(delta, actor) {
      const swing = state
      if (!swing) return
      const { skill } = swing
      for (const event of advanceSwing(swing, delta)) {
        if (event === 'start') {
          // `Pig::Attack` spends the round as the clip goes on, not when the
          // button went down (0x46975e) — and unlimited slots, which is the
          // whole training ground, never run down.
          spend(actor.carrying, skill)
          already = new Set()
          emit({ kind: 'clip', pig: actor.id, index: swing.clip, once: true })
        } else if (event === 'whoosh') {
          emit({ kind: 'whoosh' })
        } else if (event === 'strike') {
          strike(actor, skill)
        } else if (event === 'release') {
          already = new Set()
        } else if (event === 'done') {
          state = null
          // The last bayonet puts the rifle away: the exe calls
          // `ReadyWeapon(0)` where the rounds in hand have run out (0x46e404).
          if (amountOf(actor.carrying, skill) === 0) actor.holding = null
        }
      }
    }
  }
}
