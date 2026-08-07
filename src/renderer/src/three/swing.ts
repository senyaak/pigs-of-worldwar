// The acting pig's hand-to-hand swing, on the map.
//
// The rules are pure and next door (`lib/game/melee.ts`); what this file adds
// is the one thing the domain cannot know — WHERE the blade is. The exe builds
// its strike points off the pose matrix of bone 5, the hand (0x440fb0, and the
// same bone a weapon hangs off, three/heldWeapon.ts), so the point rides
// whatever the animation is doing this frame and nothing else will do.
//
// Everything here is game space (Y-down): the bone's world point comes back
// through the battle's own converted root, so it can be compared with a pig's
// position straight.

import * as THREE from 'three'
import type { Clip } from '../api'
import { advanceSwing, beginSwing, caught, meleeOf, strikeGap, strikeOffsets } from '../../../lib/game/melee'
import type { Point, StrikeGap, SwingState } from '../../../lib/game/melee'
import { amountOf, spend } from '../../../lib/game/inventory'
import { hurt, isDead } from '../../../lib/game/health'
import { ANIM } from '../../../lib/game/locomotion'
import { reached } from '../../../lib/game/targets'
import type { Target } from '../../../lib/game/targets'
import type { DamageNumbers } from './damageNumbers'
import type { Effects } from './effects'
import { clipSeconds } from './clips'
import type { Soldier, Squad } from './squad'
import { BATTLE_SOUNDS } from '../audio/battle'
import type { Bank } from '../audio/bank'

/** The bone the blade hangs off: the hand (exe 0x475a26, dll 0x1000dbd1). */
const HAND = 5

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

export interface Swings {
  /**
   * Swing what the pig is holding. Refused — and says so — when it holds
   * nothing that swings or is already mid-swing, which is the exe's own fire
   * gate (0x467a10 returns false on both).
   */
  begin(soldier: Soldier): boolean
  /** Whether a swing is under way at all, wind-up included. The pig cannot be
   * WALKED for any of it (0x46afd5 refuses on both flags). */
  running(): boolean
  /** Whether the clip itself is playing. The pig cannot be TURNED during it
   * (0x46af43), and it owns the animation while it lasts. */
  swinging(): boolean
  /** One frame of it. */
  update(delta: number, active: Soldier): void
  /** What the last strike measured, or null before there has been one. */
  lastStrike(): StrikeReport | null
  /** Forget any swing — a new turn, or a warp. */
  reset(): void
}

export interface SwingParts {
  squad: Squad
  clips: Clip[]
  /** Asked for rather than held: the bank loads beside the scene. */
  bank: () => Bank
  /** The battle's game-space root — what a bone's world point converts into. */
  root: THREE.Object3D
  /** Whether this is the training ground, where a PIG cannot be killed — the
   * exe floors it at one point (lib/game/health.ts). A dummy has no such
   * mercy: 0x48d990 has no training test in it at all. */
  training: boolean
  /** The map's dummies, as things to knock down (lib/game/targets.ts). */
  targets: Target[]
  /** Whether the map SCRIPT has put this one on the ground yet — most of
   * CAMP's are not there at the start (lib/game/script.ts). */
  present: (id: number) => boolean
  /** Take a broken one off the map and out of the collision world. */
  onBroken: (target: Target) => void
  /** Put the damage up over whatever was hit — the original does, and in
   * POINTS (three/damageNumbers.ts). */
  numbers: DamageNumbers
  /** …and throw the weapon's own rings off it (three/effects.ts). */
  effects: Effects
}

export function createSwings(parts: SwingParts): Swings {
  let state: SwingState | null = null
  /** Who this swing has already caught: the exe sets `[pig+0x1b0]` on a
   * struck pig and clears it on every pig at the last strike (event id 70),
   * so one swing lands on a body once however many frames it sweeps over it. */
  let already = new Set<Soldier>()
  /** The last strike's measurements, for `pow.debug.strike()`. */
  let report: StrikeReport | null = null
  /** The dummies not yet knocked down. Spliced rather than flagged, the same
   * way a collected crate leaves the pickup list. */
  const standing: Target[] = [...parts.targets]

  const at = new THREE.Vector3()

  /** The three points the blade is sampled at, in game space. */
  const points = (soldier: Soldier, skill: number): Point[] => {
    const weapon = meleeOf(skill)
    if (!weapon) return []
    const bone = soldier.mesh.bones[HAND] ?? soldier.mesh.bones[0]
    // The mixer wrote this frame's rotations; three would not fold them into
    // the world matrices until it drew, and the strike happens first.
    bone.updateMatrixWorld(true)
    // The bone carries the whole of it: where the pig stands, which way it
    // faces, and what this frame of the swing has done to its arm. The aim
    // angle is NOT in it, and that is the exe's behaviour, not a gap
    // (lib/game/melee.ts).
    return strikeOffsets(weapon).map((offset) => {
      at.set(offset.x, offset.y, offset.z)
      bone.localToWorld(at)
      parts.root.worldToLocal(at)
      return { x: at.x, y: at.y, z: at.z }
    })
  }

  /** Resolve the blade against everyone standing about, once. */
  const strike = (attacker: Soldier, skill: number): void => {
    const weapon = meleeOf(skill)
    if (!weapon) return
    const blade = points(attacker, skill)
    const from = {
      x: attacker.pig.position.x,
      z: attacker.pig.position.z,
      heading: attacker.pig.heading
    }
    report = {
      blade,
      attacker: { name: attacker.pig.name, ...from },
      candidates: [],
      dummies: []
    }
    for (const target of parts.squad.members) {
      if (target === attacker) continue
      // A pig's body sits at the model's origin — the hip — which is exactly
      // the position the exe compares (three/squad.ts places it there).
      const body = {
        x: target.pig.position.x,
        y: target.node.position.y,
        z: target.pig.position.z
      }
      const gap = strikeGap(blade, from, body)
      // A body already down is not struck again, nor one this swing has
      // caught already — the exe's first test in `Pig::TakeDamage` is the
      // dead state (0x467ac9) and `[pig+0x1b0]` is the once-per-swing guard.
      const hit = caught(gap) && !already.has(target) && !isDead(target.pig)
      report.candidates.push({
        name: target.pig.name,
        gap,
        degrees: (gap.off * 180) / Math.PI,
        hit
      })
      if (!hit) continue
      already.add(target)
      // The domain owns what a hit costs and whether it kills; this only
      // makes the noise and lays the body down.
      const outcome = hurt(target.pig, weapon.damage, parts.training)
      parts.numbers.show(body, weapon.damage)
      // The exe throws the weapon's own effect on every body it catches
      // (0x476187, inside the same loop). WHERE exactly is not pinned — it
      // spawns off a point 0x44e8e0 writes into a stack local, which has not
      // been read — so this puts it on the body, which is where the damage
      // number goes too.
      parts.effects.hit(skill, body)
      parts.bank().play(BATTLE_SOUNDS[weapon.impact])
      if (outcome === 'died' || outcome === 'gibbed') target.playOnce(ANIM.DYING)
    }

    // …and the dummies, through the identical test. The exe runs it as a
    // second pass over its own scenery after the pigs (0x4762e0), and gives
    // the target the same impact noise.
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!parts.present(dummy.id)) continue
      report.dummies.push({
        id: dummy.id,
        gap: strikeGap(blade, from, dummy),
        hit: reached(blade, from, dummy)
      })
      if (!reached(blade, from, dummy)) continue
      // One point, so anything at all flattens it (lib/game/targets.ts).
      hurt(dummy, weapon.damage, false)
      parts.numbers.show(dummy, weapon.damage)
      parts.effects.hit(skill, dummy)
      parts.bank().play(BATTLE_SOUNDS[weapon.impact])
      if (isDead(dummy)) {
        standing.splice(i, 1)
        parts.onBroken(dummy)
      }
    }
  }

  return {
    begin(soldier) {
      if (state) return false
      const skill = soldier.pig.holding
      const weapon = meleeOf(skill)
      if (!weapon || skill === null) return false
      state = beginSwing(skill, clipSeconds(parts.clips[weapon.clip]))
      return state !== null
    },
    running: () => state !== null,
    swinging: () => state !== null && state.waiting <= 0,
    lastStrike: () => report,
    reset() {
      state = null
      already = new Set()
    },
    update(delta, active) {
      const swing = state
      if (!swing) return
      const { skill } = swing
      for (const event of advanceSwing(swing, delta)) {
        if (event === 'start') {
          // `Pig::Attack` spends the round as the clip goes on, not when the
          // button went down (0x46975e) — and unlimited slots, which is the
          // whole training ground, never run down.
          spend(active.pig.carrying, skill)
          already = new Set()
          active.playOnce(swing.clip)
        } else if (event === 'whoosh') {
          parts.bank().play(BATTLE_SOUNDS.whoosh)
        } else if (event === 'strike') {
          strike(active, skill)
        } else if (event === 'release') {
          already = new Set()
        } else if (event === 'done') {
          state = null
          // The last bayonet puts the rifle away: the exe calls
          // `ReadyWeapon(0)` where the rounds in hand have run out (0x46e404).
          if (amountOf(active.pig.carrying, skill) === 0) active.pig.holding = null
        }
      }
    }
  }
}
