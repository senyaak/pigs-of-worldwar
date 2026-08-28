// PICK POCKET — skill 54, the espionage careers' theft, read end to end
// (`weapons/espionage.md` in the disasm repo, 2026-08-27).
//
// The healing hands' exact cone — nearest pig within 1024, ±45° of the
// thief's facing (0x47C405, the same two numbers 0x47B8CA/0x47BCFE gave the
// heal) — but the exe's victim filter is LOOSER than the heal's: **no team
// test** (an ally can be robbed), no hidden test, and **no dead test** — a
// corpse qualifies. What transfers is a **random WHOLE slot** — the victim's
// entire amount, unlimited included, never one charge — and the victim has
// no reaction at all: no animation, no sound, no camera. The thief plays
// clip 79 ("Pick pocket": two tiptoe footfalls and an innocent whistle) and
// the steal resolves at the END of it, through the same end-of-sequence path
// HIDE takes (0x473600 — the clip carries no event-65 keyframe).
//
// The exe's own two failure exits, both after the clip, both P_OWW: nobody
// in the cone ("Your arms don't reach that far..."), or a victim with
// nothing left ("This pig has nothing left to steal....poor little
// porker."). Either way the charge is spent — the generic Pig::Attack spend
// runs with the clip, unlike the heal's exempt-and-refund bookkeeping.
//
// One trap kept verbatim: the thief's append cap is **14** slots (`cmp
// al,0xE` at 0x47C603) — one LESS than GiveSkill's own 15 — and at the cap
// the loot silently VANISHES while the victim still loses it. The exe's
// off-by-one, kept because it is what the game does.
//
// Keeps the turn (record +0x1C/+0x1D = 0 — lib/game/spend.ts has 54 in its
// keep list) and is not a blow (lib/game/battle.ts exempts it from `struck`
// beside the heal).

import { UNLIMITED, amountOf, spend } from './inventory'
import type { Slot } from './inventory'
import { HEAL_ARC, HEAL_RANGE } from './healing'
import { PHASE_UNITS, turnBetween } from './melee'
import { SKILL } from './skills'
import { weaponOf } from './weapons'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import type { Random } from './random'
import type { Pig } from './game'
import type { Emit } from './events'

/** The reach and the cone — the heal's own numbers, off the pickpocket's own
 * arm (0x47BFED / 0x47C405). */
export const STEAL_RANGE = HEAL_RANGE
export const STEAL_ARC = HEAL_ARC

/** The thief's append cap — the exe's own 14, one less than a crate's 15. */
export const STEAL_SLOT_CAP = 14

/** Where in clip 79 the innocent whistle sits — the clip's own sound
 * keyframe: phase 640, sound 91 P_WHIST1 (`weapons/espionage.md`). */
export const WHISTLE_PHASE = 640

/**
 * The NEAREST pig in the cone, by the exe's loose filter: not the thief, not
 * gone from the field — and NOT screened for team, health or hiding: an
 * ally, a corpse and a bush are all fair game.
 */
export function stealTarget(thief: Pig, pigs: Pig[]): Pig | null {
  let chosen: Pig | null = null
  let nearest = STEAL_RANGE
  for (const other of pigs) {
    if (other === thief || other.gone) continue
    const dx = other.position.x - thief.position.x
    const dz = other.position.z - thief.position.z
    const away = Math.hypot(dx, dz)
    if (away >= nearest) continue
    if (Math.abs(turnBetween(Math.atan2(dx, dz), thief.heading)) >= STEAL_ARC) continue
    nearest = away
    chosen = other
  }
  return chosen
}

export interface PocketWorld {
  pigs: () => Pig[]
  clips: ClipTiming[]
  /** The battle's own stream: WHICH slot is stolen is a roll the whole
   * battle has to agree on (lib/game/random.ts). */
  random: Random
}

export interface Pockets {
  /** The press: the charge goes, the tiptoe clip starts, and the verdict
   * waits for its end. False only while one is already running. */
  begin(pig: Pig): boolean
  /** Whether the clip is still holding the pig. */
  running(): boolean
  /** One frame; `actor` is the thief. */
  update(delta: number, actor: Pig): void
  /** A turn ending or a warp mid-gesture: the verdict lands now — the
   * charge went at the press and the beat must not eat it. */
  reset(actor: Pig): void
}

export function createPockets(world: PocketWorld, emit: Emit): Pockets {
  /** Seconds left of the Pick pocket clip. */
  let playing = 0
  /** Who owes a verdict — the thief, held from the press to the clip's end. */
  let owing: Pig | null = null
  /** Seconds until the clip's whistle keyframe — 0 once fired or none due. */
  let whistleIn = 0

  /** The steal itself — the whole slot, the loose filter, the two refusals. */
  const resolve = (thief: Pig): void => {
    const victim = stealTarget(thief, world.pigs())
    const at = { x: thief.position.x, y: thief.position.y, z: thief.position.z }
    if (!victim) {
      // "Your arms don't reach that far..."
      emit({ kind: 'stealFailed', pig: thief.id, at, reason: 'reach' })
      return
    }
    const stealable = victim.carrying.filter((slot) => slot.amount !== 0)
    if (stealable.length === 0) {
      // "This pig has nothing left to steal....poor little porker."
      emit({ kind: 'stealFailed', pig: thief.id, at, reason: 'nothing' })
      return
    }
    const slot = stealable[Math.floor(world.random() * stealable.length)]
    const index = victim.carrying.indexOf(slot)
    victim.carrying.splice(index, 1)
    take(thief, slot)
    emit({
      kind: 'stole',
      thief: thief.id,
      victim: victim.id,
      skill: slot.skill,
      amount: slot.amount
    })
  }

  /** Merge into a held slot, append under the exe's 14 — or the loot simply
   * vanishes, which is the original's own arithmetic. */
  const take = (thief: Pig, slot: Slot): void => {
    const held = thief.carrying.find((one) => one.skill === slot.skill)
    if (held) {
      if (slot.amount === UNLIMITED || held.amount === UNLIMITED) held.amount = UNLIMITED
      else held.amount += slot.amount
      return
    }
    if (thief.carrying.length < STEAL_SLOT_CAP) thief.carrying.push({ ...slot })
  }

  return {
    begin(pig) {
      if (playing > 0) return false
      // The charge goes at the press — the generic spend, no refund on a
      // whiff (the exe's own bookkeeping; the heal is the exempt one).
      spend(pig.carrying, SKILL.PICK_POCKET)
      const clip = weaponOf(SKILL.PICK_POCKET).attackClip
      emit({ kind: 'clip', pig: pig.id, index: clip, once: true })
      playing = clipSeconds(world.clips[clip])
      // The innocent whistle is the clip's own sound keyframe, not the
      // press's: it rides the clip to phase 640 the way a footfall would.
      whistleIn = (playing * WHISTLE_PHASE) / PHASE_UNITS
      owing = pig
      // A bare spec's world has no clips to time: the verdict lands now.
      if (playing <= 0) {
        owing = null
        resolve(pig)
      }
      return true
    },
    running: () => playing > 0,
    update(delta, actor) {
      if (playing <= 0) return
      if (whistleIn > 0) {
        whistleIn -= delta
        if (whistleIn <= 0) {
          whistleIn = 0
          emit({ kind: 'whistled', pig: actor.id })
        }
      }
      playing -= delta
      if (playing > 0) return
      playing = 0
      owing = null
      resolve(actor)
      // The last charge puts the skill away, the way the last bayonet does.
      if (amountOf(actor.carrying, SKILL.PICK_POCKET) === 0) actor.holding = null
    },
    reset(actor) {
      if (owing !== null) resolve(owing ?? actor)
      owing = null
      playing = 0
      whistleIn = 0
    }
  }
}
