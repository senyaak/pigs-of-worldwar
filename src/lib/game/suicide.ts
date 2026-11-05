// SUICIDE — skill 51, the one thing in the kit that spends the pig.
//
// The ENGINEER, the SABOTEUR and the SNIPER each carry one (lib/game/kits.ts),
// and it is the only skill whose arm never makes a projectile. Read out of the
// exe 2026-09-01, arm **0x47CBA0** off the fire table at 0x47CF8C, and it is
// short enough to quote whole:
//
// ```
// 47cba0  0x43AF30([pig+0x20])                 ; the pig's own sound handle, stopped
// 47cbcd  Sound::Play(0x0D, 100, 100, x, z)    ; index 13 of sfxday.srl -- E_1000P
// 47cbd7  [pig+0x4c] = 0 ; [pig+0x30] = 0      ; ...and the pig is TAKEN OUT:
// 47cbf3  0x4A8BA0 / 0x4A9EE0 / 0x4A9E50       ; unlinked, stilled, undrawn
// 47cc06  0x487AD0(x, z, 0x56, 0x800, 1, 0x1450, 0x1900)
// 47cc4d  0x49EC20(effect) ; 0x49F740(2, 0)    ; the camera on the blast, mode 2
// 47cc72  0x49F6D0(0xFA0)
// 47cc8a  [[pig+0x194]+0x18]++                 ; a counter on its controller
// ```
//
// So: **fifty points over a field of 2048, and a RANGE argument of 5200 — the
// widest thing in the game** — with no row behind any of it. The three
// numbers are literals in the instruction stream, which is why this file
// carries them rather than `grenade.ts`: there is no projectile and therefore
// no row to read them off.
//
// And the pig is gone BEFORE the blast is spawned, in that order, which is
// what settles the question the arm is really asked: it does not take its own
// fifty. It simply dies.
//
// Pure, seconds, game space — like the rest of lib/game.

import { SUICIDE_EFFECT_ID, burst } from './blast'
import { blastReach } from './grenade'
import type { BlastWorld } from './blast'
import { hurtPig, isDead } from './health'
import { originY } from './body'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import { spend } from './inventory'
import { SKILL } from './skills'
import { weaponOf } from './weapons'
import type { Pig } from './game'
import type { Emit } from './events'

/**
 * **Fifty points at the core** — `0x1900` = 6400 in 128ths, the same figure
 * TNT carries. Pushed as `0x487AD0`'s last argument (0x47cc26).
 */
export const SACRIFICE_DAMAGE = 6400

/**
 * …and the field it falls off over, `0x800` = 2048 — argument 4, the one the
 * repo has counted as the RANGE everywhere else (lib/game/grenade.ts,
 * `Lob.blast`). Twice a grenade's, the same as TNT's.
 */
export const SACRIFICE_BLAST = 2048

/**
 * …and how hard it THROWS: `0x1450` = **5200**, argument 6 — the FORCE
 * column, which was written down here as "the field this engine does not
 * read" for one afternoon and is read now (lib/game/blast.ts, `flingSpeed`).
 * TNT's own, which is the right company for a fifty-point charge.
 */
export const SACRIFICE_FORCE = 5200

export interface SacrificeWorld extends BlastWorld {
  /** How long every clip runs — the gesture is timed off clip 81 the way a
   * heal is off 78 (lib/game/clips.ts). */
  clips: ClipTiming[]
}

export interface Sacrifice {
  /** The fire key, with skill 51 in hand. False when one is already running.
   * True STARTS the gesture; the pig is still alive when this returns. */
  begin(pig: Pig): boolean
  /** Whether the gesture is running — the pig is committed for its length. */
  running(): boolean
  /** Count the clip down, and blow up at the end of it. */
  update(delta: number): void
  /** A new turn, or a warp. A gesture cut short still goes off: the charge was
   * spent at the press, the same rule the heal's `reset` follows. */
  reset(): void
}

export function createSacrifice(world: SacrificeWorld, emit: Emit): Sacrifice {
  /** The pig doing it and the seconds of clip left, or null. */
  let pending: { pig: Pig; left: number } | null = null

  /** The pig out of the world, then the bang — the exe's own order, and the
   * order is the whole of why it does not take its own fifty: `burst` passes
   * over anything already dead. */
  const blowUp = (): void => {
    if (!pending) return
    const { pig } = pending
    pending = null
    const at = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
    if (!isDead(pig)) {
      // The training ground's floor keeps a dummy pig at one point, and it
      // applies here as everywhere: on CAMP the gesture goes off and the pig
      // walks away from it (lib/game/health.ts, TRAINING_FLOOR).
      const outcome = hurtPig(pig, pig.health, world.training, emit)
      emit({ kind: 'damaged', at, amount: pig.health, pig: pig.id, blow: true })
      if (outcome === 'died' || outcome === 'gibbed')
        emit({ kind: 'killed', pig: pig.id, by: pig.id, gibbed: outcome === 'gibbed' })
    }
    burst(
      at,
      {
        damage: SACRIFICE_DAMAGE,
        reach: blastReach(SACRIFICE_BLAST),
        effect: SUICIDE_EFFECT_ID,
        force: SACRIFICE_FORCE
      },
      world,
      emit,
      pig.id
    )
  }

  return {
    begin(pig) {
      if (pending) return false
      spend(pig.carrying, SKILL.SUICIDE)
      // Clip **81** is the record's own attack clip for skill 51, and the
      // archive's name for it is "Hari Kiri" (`weapons/mines.md` has the
      // twenty-four-clip offset that reads it). **The exe takes the pig out
      // at the top of the arm, so nobody ever sees the gesture** — the whole
      // of it happens in one frame. Here the clip is played and the blast
      // lands at its END, which is the same call `hide.ts` already makes for
      // the same clip, for the same reason. `[CHECK — remake]`.
      const clip = weaponOf(SKILL.SUICIDE).attackClip
      emit({ kind: 'clip', pig: pig.id, index: clip, once: true })
      pending = { pig, left: clipSeconds(world.clips[clip]) }
      // A world with no clips to time (a bare spec) has no beat to wait for.
      if (pending.left <= 0) blowUp()
      return true
    },
    running: () => pending !== null,
    update(delta) {
      if (!pending) return
      pending.left -= delta
      if (pending.left <= 0) blowUp()
    },
    reset() {
      blowUp()
    }
  }
}
