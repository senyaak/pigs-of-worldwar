// What the battle sounds like: the pig's own noises, fired off the changes
// in its locomotion state rather than on a timer.
//
// A sound is not just a file. The exe plays one through `Sound::Play`
// (0x43A9D0, 222 call sites, `this` at `[0x51BBD4]`) and the first three
// arguments are **index, volume, pitch**, both of the last two on a scale
// where 100 is nominal — `../pigs-disasm/anim/audio-events.md` has the read
// and the whole table. The argument order is pinned by the jump, which asks
// for `90 + (rand() & 15)` on the third: a spread straddling 100 is a pitch
// jitter and nothing else, and the second never exceeds 100 anywhere in the
// binary while the third reaches 163.
//
// So a moment is a CUE, and several of them are now decoded outright rather
// than picked by name. What is still a name pick says so at the field, and
// `pow.sfx` in the console is how those get settled (audio/console.ts).
//
// Footsteps are deliberately absent. They want the hoof-contact frames the
// notes derive from the skeleton, and until they are wired a footstep on a
// timer would be a stand-in nobody asked for.

import type { LocomotionState } from '../../../lib/game/locomotion'
import type { Bank } from './bank'

/** One moment's sound, on the exe's own scales. */
export interface Cue {
  /** Which file, by name — a name survives the bank being reloaded. */
  sound: string
  /** 100 is nominal, and nothing in the exe asks for more. */
  volume: number
  /** 100 is nominal; the exe goes as high as 163. */
  pitch: number
  /** A pitch spread, `rand() & jitter` added — how the exe stops a repeated
   * sound being identical every time. */
  jitter?: number
}

/**
 * The moments this module has a sound for.
 *
 * Deliberately mutable: `pow.sfx` rebinds these live in the console so a
 * candidate can be heard in the moment it belongs to rather than guessed at
 * from a file name. Every read goes through this object, so a rebind takes
 * effect on the next event.
 */
export const BATTLE_SOUNDS: Record<string, Cue> = {
  /**
   * Leaving the ground under the player's own power. DECODED, and play named
   * it first: the jump's own wrapper (0x4707f0) plays **87 P_SNORT1** at
   * volume 60 and a pitch of `90 + (rand() & 15)`, and its three callers are
   * the jump dispatcher and the launch (0x46b969, 0x46c22f, 0x46e8fa).
   */
  jump: { sound: 'P_SNORT1', volume: 60, pitch: 90, jitter: 15 },
  /**
   * Coming to rest after any flight. DECODED, and it is NOT the file called
   * P_LAND1: `Pig::Land` (0x470910) plays **30 I_PICKUP** at volume 40 and
   * pitch 150 (0x470b0c), and the parachute's landing plays the same 30 at
   * `100 + (rand() & 63)` (0x4711aa). The `I_` family is impacts — I_METAL,
   * I_SPLASH, I_STAB — so the name is about what it hits, not about crates.
   *
   * P_LAND1 is a different moment: it belongs to 0x4aa010, which plays it at
   * volume 90 and then calls the body's own `TakeDamage` if it is a pig. That
   * is the impact that HURTS, and this engine does not model fall damage yet,
   * so nothing here plays it.
   */
  land: { sound: 'I_PICKUP', volume: 40, pitch: 150 },
  /**
   * Losing your footing. DECODED: the eject handler (0x470c70) plays **84
   * P_SLIP** at 100/100 when `Map::IsBlocked` says the pig's feet are in a
   * wall tile and it is arriving at under 50 (0x471045, 0x47104d) — which is
   * this engine's wedge counter throwing a pig out downhill. A second caller
   * sits in the impact handler's low-speed branch (0x46d901). Play asked for
   * it by name: "слип для соскальзывания".
   */
  ejected: { sound: 'P_SLIP', volume: 100, pitch: 100 },
  /** Going into the water, and coming out of it. A NAME pick — the mix is
   * the nominal one, which is what most of the binary asks for. */
  splash: { sound: 'I_SPLASH', volume: 100, pitch: 100 },
  /**
   * Collecting a crate, and being refused one. These two are DECODED rather
   * than picked by name: `Pig::GiveSkill` plays 0x5E at the pig's own
   * position once the skill is in (0x4759F2, out of 0x475960), and 0x4F on
   * the branch that finds fifteen slots already full (0x465925). Index 94
   * and 79 in `Audio/sfxday.srl` are P_WHOOPE and P_OWW — the pig cheers,
   * or complains (../pigs-disasm/skills/notes.md). Both go out at HALF
   * volume, which is the exe's own mix.
   */
  pickup: { sound: 'P_WHOOPE', volume: 50, pitch: 100 },
  tooMany: { sound: 'P_OWW', volume: 50, pitch: 100 },
  /** The skill menu driving in. A name pick, like the movement ones: the
   * bank's own S_OPEN sits beside S_SELECT and S_CLOCK, which is the family
   * of interface noises, and the exe's menu mode is not decoded far enough
   * to say which index it asks for. */
  menuOpen: { sound: 'S_OPEN', volume: 100, pitch: 100 },
  /**
   * A hand-to-hand swing, and what it lands with. All four are DECODED:
   * `Pig::HandToHandStrike` plays 0x21 as the blade goes live (event id 61,
   * 0x474c89) and the weapon's own impact index when it connects (0x476712) —
   * 0x20 for the knife, the bayonet and the cattle prod, 0x22 for the sword,
   * 0x51 for bare trotters and boots. Indices 33, 32, 34 and 81 of
   * `Audio/sfxday.srl` are I_SWMISS, I_STAB, I_SWORD and P_PUNCH: the whoosh
   * and the three ways of connecting (../pigs-disasm/weapons/melee.md).
   *
   * The whoosh's mix is the exe's own 100/100. The three impacts take their
   * index out of a register at 0x476712, so their volume and pitch are not
   * immediates and have not been chased; the nominal mix stands in.
   */
  whoosh: { sound: 'I_SWMISS', volume: 100, pitch: 100 },
  stab: { sound: 'I_STAB', volume: 100, pitch: 100 },
  sword: { sound: 'I_SWORD', volume: 100, pitch: 100 },
  punch: { sound: 'P_PUNCH', volume: 100, pitch: 100 },
  /**
   * A gun going off. DECODED, and it is the pair that proves the shot's
   * per-weapon jump table is indexed by `weapon − 6`: its first arm plays
   * **0x2A** and its second **0x2B** (0x47a26d, 0x47a329), and entries 42 and
   * 43 of `Audio/sfxday.srl` are `L_PISTOL` and `L_RIFLE` — which is exactly
   * skills 6 and 7. `../../../pigs-disasm/weapons/fire.md`.
   */
  pistol: { sound: 'L_PISTOL', volume: 100, pitch: 100 },
  rifle: { sound: 'L_RIFLE', volume: 100, pitch: 100 },
  /**
   * A canopy opening. DECODED, and it settles a question this field used to
   * carry: `StartParachuting` calls `Sound::Play` directly at 0x471777 with
   * **53 P_CHUTE** at volume 80. The note that had it going to "an effect
   * spawner", and so being a coincidence, was wrong — it is the play call,
   * and the 0x1e the landing pushes through the same call is the landing
   * sound rather than a collision of numbers.
   */
  chute: { sound: 'P_CHUTE', volume: 80, pitch: 100 },
  /**
   * The aeroplane that brings a crate, heard before the canopy opens. Play
   * named it — "там ещё звук самолёта перед парашютом" — and the bank has
   * exactly one candidate, `BG_PLANE` at index 10. A NAME pick, still: `BG_`
   * is the bank's prefix for background beds and nothing has been traced
   * starting this one.
   */
  plane: { sound: 'BG_PLANE', volume: 100, pitch: 100 },
  /**
   * A grenade going off. DECODED, out of the projectile's own DESTRUCTOR
   * (0x432730, which writes the projectile vtable 0x4BC468 over itself): its
   * kind picks one of forty arms through the 55-entry table at 0x435A6C, and
   * kind 24's — the plain grenade's — ends
   *
   * ```
   * 435393  push 0Ch                ; index 12, E_1
   * 43538f  push 64h ; push 64h     ; volume 100, pitch 100
   * 4353a0  call 0043A9D0h
   * ```
   *
   * Index 12 of `Audio/sfxday.srl` is `E_1`, with `E_1000P` beside it at 13 —
   * `E_` for explosion. A neighbouring arm (kind 25, 0x432998) plays the same
   * 12 with a pitch of `0x54 + (rand & 0x20)`, so some of the family jitter
   * it; kind 24's is flat.
   */
  blast: { sound: 'E_1', volume: 100, pitch: 100 }
}

/**
 * Play a cue the way the exe would: both scales are percentages of nominal,
 * and the jitter is added to the pitch.
 *
 * `random` is injectable so a spec can pin it.
 */
export function playCue(bank: Bank, cue: Cue, random: () => number = Math.random): void {
  const spread = cue.jitter ? Math.floor(random() * (cue.jitter + 1)) : 0
  bank.play(cue.sound, { gain: cue.volume / 100, rate: (cue.pitch + spread) / 100 })
}

export interface BattleSounds {
  /** Call once per frame with the acting pig's state. */
  follow(state: LocomotionState, swimming: boolean): void
  /** Start again on a new pig, without firing anything for the change. */
  reset(): void
}

export function createBattleSounds(bank: Bank): BattleSounds {
  let airborne = false
  let ejected = false
  let wet = false
  let fresh = true

  return {
    reset() {
      fresh = true
    },
    follow(state, swimming) {
      const flying = state.airborne !== null
      const thrown = state.airborne?.ejected === true

      if (fresh) {
        // A new pig starts wherever it starts; only CHANGES make a noise.
        fresh = false
      } else {
        if (thrown && !ejected) playCue(bank, BATTLE_SOUNDS.ejected)
        else if (flying && !airborne) playCue(bank, BATTLE_SOUNDS.jump)
        if (!flying && airborne) playCue(bank, BATTLE_SOUNDS.land)
        if (swimming !== wet) playCue(bank, BATTLE_SOUNDS.splash)
      }

      airborne = flying
      ejected = thrown
      wet = swimming
    }
  }
}
