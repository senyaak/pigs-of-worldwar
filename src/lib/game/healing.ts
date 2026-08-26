// HEALING HANDS — the medic careers' contact heal, resolved.
//
// Skill 52 is the one heal a pig lays on by hand: no projectile, no aim view,
// no camera of its own (`weapons/fire.md` files it under "nothing at all").
// The fire dispatcher's arm (0x47b894, off the jump table at 0x47CF8C) walks
// the pig list, keeps the nearest body inside a range and a cone, and puts
// points straight back on it. Read out of the exe on 2026-08-26; every number
// cites its instruction.
//
// One file for both halves where the melee needed two (melee.ts/strikes.ts):
// the rules are three constants and the act is a dozen lines.
//
// What the arm also does and this deliberately does not: clear the status
// bits and their timers off the target (`[pig+0x3A4]`, the tail past
// 0x47bf40) — there are no status effects in this engine yet, so there is
// nothing to clear. The day one lands, a heal takes it off.

import { heal, isDead, maxHealthFor } from './health'
import { originY } from './body'
import { amountOf, spend } from './inventory'
import { turnBetween } from './melee'
import { SKILL } from './skills'
import { weaponOf } from './weapons'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import type { Pig } from './game'
import type { Emit } from './events'

/**
 * How far the hands reach: the search starts its nearest-so-far at 0x100000
 * SQUARE units (0x47b8ca), so a body 1024 away or further is never taken.
 */
export const HEAL_RANGE = 1024

/**
 * …and how far off the healer's facing a body may stand: the bearing test is
 * |diff| < 0x200 of 4096 (0x47bcfe) — 45° either way, two thirds of the
 * melee's own arc (lib/game/melee.ts, STRIKE_ARC).
 */
export const HEAL_ARC = (0x200 / 4096) * 2 * Math.PI

/**
 * What one laying-on restores, at most: `min(missing, 0x14) << 7`
 * (0x47bf1f..0x47bf3a) — twenty points, and never past the missing health.
 * The one CAPPED heal in the game: a crate's has no ceiling at all
 * (lib/game/health.ts) and `Pig::Heal` itself never clamps — the clamp is
 * this arm's own, taken against `[pig+0x3B8] − [pig+0x4C]` rounded UP to a
 * whole point (`+0x7F >> 7`, 0x47bd42). Health here is whole points already,
 * so the rounding has nothing to do.
 */
export const HEAL_POINTS = 20

/** What the hands can put back on this body. Zero is a refusal: a body at
 * its class's own ceiling gives the arm nothing to do. */
export const healableAmount = (target: Pig): number =>
  Math.max(0, Math.min(HEAL_POINTS, maxHealthFor(target.pigClass) - target.health))

/**
 * What the last press measured — the reason a heal that did nothing can be
 * READ rather than guessed at, the same rule the blade's report is
 * (lib/game/strikes.ts, StrikeReport).
 */
export interface HealReport {
  healer: { name: string; x: number; z: number; heading: number }
  /** Every other pig still on the field, measured the same way. */
  candidates: {
    name: string
    distance: number
    /** Degrees off the healer's facing — against 45. */
    degrees: number
    inRange: boolean
    inArc: boolean
  }[]
  /** Who the hands took, or null when nobody stood in the cone. */
  chosen: string | null
  /** What went back on — 0 is a body already at its ceiling, refused. */
  amount: number
}

/**
 * The NEAREST pig inside the range and the cone — and that is the whole
 * test. **No team filter**: the arm compares nothing but distance and
 * bearing, so the nearest body wins whichever side it fights for, an enemy
 * included. The exe skips the healer itself by identity (`cmp edi,esi`,
 * 0x47b910) and pigs in states 8/1/4/3 (0x47b8ec); state 6 — DEAD — is not
 * on its list, and whether a corpse can be picked there is unread. Here a
 * dead or gone body is skipped: a corpse is not healed.
 */
export function healTarget(
  healer: Pig,
  pigs: Pig[]
): { chosen: Pig | null; candidates: HealReport['candidates'] } {
  const candidates: HealReport['candidates'] = []
  let chosen: Pig | null = null
  let nearest = HEAL_RANGE
  for (const other of pigs) {
    if (other === healer) continue
    if (other.gone || isDead(other)) continue
    const dx = other.position.x - healer.position.x
    const dz = other.position.z - healer.position.z
    const distance = Math.hypot(dx, dz)
    // The same bearing every step and swing uses: forward is (sin h, cos h).
    const off = Math.abs(turnBetween(Math.atan2(dx, dz), healer.heading))
    const inArc = off < HEAL_ARC
    candidates.push({
      name: other.name,
      distance,
      degrees: (off * 180) / Math.PI,
      inRange: distance < HEAL_RANGE,
      inArc
    })
    if (distance < nearest && inArc) {
      nearest = distance
      chosen = other
    }
  }
  return { chosen, candidates }
}

export interface HealWorld {
  /** Everyone the hands can reach, the healer included — skipped by
   * identity. */
  pigs: () => Pig[]
  /** How long every clip runs: the Heal clip holds the pig for its length. */
  clips: ClipTiming[]
}

export interface Heals {
  /**
   * Lay the hands on whoever stands in the cone. Refused — and says so —
   * when nobody does, or the nearest body is at its ceiling: the press comes
   * to nothing and the CHARGE STAYS, which is the exe's own bookkeeping (the
   * generic spend skips skill 52 outright, 0x469751, and the arm's own debit
   * sits behind the missing-health test, 0x47bd70).
   */
  begin(pig: Pig): boolean
  /** Whether the Heal clip is still playing. The pig is held for the whole
   * of it, the way `[pig+0x2FF]` holds one through any attack clip. */
  running(): boolean
  /** One frame of it, for the pig doing the healing. */
  update(delta: number, actor: Pig): void
  /** What the last press measured, or null before there has been one. */
  lastAttempt(): HealReport | null
  /** Forget a heal in progress — a new turn, or a warp. */
  reset(): void
}

export function createHealing(world: HealWorld, emit: Emit): Heals {
  /** Seconds left of the Heal clip. */
  let playing = 0
  let report: HealReport | null = null

  return {
    begin(pig) {
      if (playing > 0) return false
      const { chosen, candidates } = healTarget(pig, world.pigs())
      const amount = chosen ? healableAmount(chosen) : 0
      report = {
        healer: {
          name: pig.name,
          x: pig.position.x,
          z: pig.position.z,
          heading: pig.heading
        },
        candidates,
        chosen: chosen?.name ?? null,
        amount
      }
      if (!chosen || amount <= 0) return false
      heal(chosen, amount)
      spend(pig.carrying, SKILL.HEALING_HANDS)
      // The number floats off the body that was healed, exactly where a hit's
      // would — one spawner, one style apart (lib/game/damage.ts).
      emit({
        kind: 'healed',
        at: {
          x: chosen.position.x,
          y: originY(chosen.position.y, chosen.body),
          z: chosen.position.z
        },
        amount,
        pig: chosen.id
      })
      // Clip 78 is "Heal" — the record's own attack clip (lib/game/weapons.ts).
      const clip = weaponOf(SKILL.HEALING_HANDS).attackClip
      emit({ kind: 'clip', pig: pig.id, index: clip, once: true })
      playing = clipSeconds(world.clips[clip])
      return true
    },
    running: () => playing > 0,
    update(delta, actor) {
      if (playing <= 0) return
      playing -= delta
      if (playing > 0) return
      playing = 0
      // The last charge puts the skill away, the way the last bayonet does
      // (lib/game/strikes.ts).
      if (amountOf(actor.carrying, SKILL.HEALING_HANDS) === 0) actor.holding = null
    },
    lastAttempt: () => report,
    reset() {
      playing = 0
    }
  }
}
