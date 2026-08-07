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
import { advanceSwing, beginSwing, meleeOf, strikeOffsets, struck } from '../../../lib/game/melee'
import type { Point, SwingState } from '../../../lib/game/melee'
import { amountOf, spend } from '../../../lib/game/inventory'
import { clipSeconds } from './clips'
import type { Soldier, Squad } from './squad'
import { BATTLE_SOUNDS } from '../audio/battle'
import type { Bank } from '../audio/bank'

/** The bone the blade hangs off: the hand (exe 0x475a26, dll 0x1000dbd1). */
const HAND = 5

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
}

export function createSwings(parts: SwingParts): Swings {
  let state: SwingState | null = null
  /** Who this swing has already caught: the exe sets `[pig+0x1b0]` on a
   * struck pig and clears it on every pig at the last strike (event id 70),
   * so one swing lands on a body once however many frames it sweeps over it. */
  let already = new Set<Soldier>()

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
    for (const target of parts.squad.members) {
      if (target === attacker || already.has(target)) continue
      if (target.pig.health <= 0) continue
      // A pig's body sits at the model's origin — the hip — which is exactly
      // the position the exe compares (three/squad.ts places it there).
      const body = {
        x: target.pig.position.x,
        y: target.node.position.y,
        z: target.pig.position.z
      }
      if (!struck(blade, from, body)) continue
      already.add(target)
      target.pig.health = Math.max(0, target.pig.health - weapon.damage)
      parts.bank().play(BATTLE_SOUNDS[weapon.impact])
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
