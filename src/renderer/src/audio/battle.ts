// What the battle sounds like: the pig's own noises, fired off the changes
// in its locomotion state rather than on a timer.
//
// A sound is not just a file. The exe plays one through `Sound::Play`
// (0x43A9D0, 222 call sites, `this` at `[0x51BBD4]`) and the first three
// arguments are **index, volume, pitch**, both of the last two on a scale
// where 100 is nominal — `anim/audio-events.md` has the read
// and the whole table. The argument order is pinned by the jump, which asks
// for `90 + (rand() & 15)` on the third: a spread straddling 100 is a pitch
// jitter and nothing else, and the second never exceeds 100 anywhere in the
// binary while the third reaches 163.
//
// So a moment is a CUE, and several of them are now decoded outright rather
// than picked by name. What is still a name pick says so at the field, and
// `pow.sfx` in the console is how those get settled (audio/console.ts).
//
// FOOTSTEPS are at the bottom of this file, and nothing about them is a pick:
// the clip says when a hoof lands (lib/game/footsteps.ts) and the ground says
// what it lands on.

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
  /** …and the other kind of spread: `rand() & duck` taken OFF the VOLUME,
   * which is what the footstep handler does (`45 − (rand & 15)`, 0x4753b3)
   * where the jump jitters its pitch instead. */
  duck?: number
}

/**
 * The moments this module has a sound for.
 *
 * Deliberately mutable: `pow.sfx` rebinds these live in the console so a
 * candidate can be heard in the moment it belongs to rather than guessed at
 * from a file name. Every read goes through this object, so a rebind takes
 * effect on the next event.
 */
/**
 * **THE BANK, IDENTIFIED BY EAR — play, 2026-08-21.**
 *
 * Ninety-nine entries in `Audio/sfxday.srl` and the exe names them by NUMBER,
 * so what a file IS has always been a guess from its name. Play walked every
 * one of the thirty-seven that is neither a footstep (`FT_*`, thirteen, one a
 * surface) nor a pig (`P_*`, forty-nine) and said what it heard. The lengths
 * are measured off the shipped wavs and they matter: a cue is fire-and-forget,
 * so anything repeated must be repeated slower than it lasts.
 *
 * ```
 *  0 AMB_1D   2.17  a falcon
 *  1 AMB_2D   1.64  another bird
 *  2 BATT_L1  4.26  a blast with echo behind it
 *  3 BATT_L2  2.27  rifle fire
 *  4 BATT_L3  2.57  a burst — a machine gun
 *  5 BATT_S1  0.95  a blast or a mortar going off
 *  6 BATT_S2  0.83  …the same, duller
 *  7 BATT_S3  0.83  …duller again
 *  8 BG_GAS   0.38  THE GAS GRENADE
 *  9 BG_PLANE 1.08  (wired: the plane overhead)
 * 10 EN_BIP   1.15  the AIRSHIPS that fly over a map — and we have none
 * 11 EN_TANK  1.34  a stationary machine turning, perhaps
 * 12 E_1      1.48  (wired: the blast)
 * 13 E_1000P  2.05  a blast with echo
 * 27 I_BUILD  0.80  a round hitting a WALL
 * 28 I_BULIT1 0.36  a round hitting MEAT
 * 29 I_METAL  1.11  a blast inside a bunker, a tank, a machine
 * 30 I_PICKUP 0.29  (wired: landing)
 * 31 I_SPLASH 1.80  (wired: water)
 * 32 I_STAB   0.66  into meat
 * 33 I_SWMISS 0.30  a swing that MISSED
 * 34 I_SWORD  0.65  (wired: the blade)
 * 35 L_ARTIL  2.06  a tank or something like it firing
 * 36 L_BAZOO  1.74  (wired: the bazooka)
 * 37 L_FLAME  2.27  napalm going off
 * 38 L_HVYMG  0.65  a gun — a rifle or a pistol
 * 39 L_MGUN   0.72  a pistol
 * 40 L_MINETR 0.23  (wired: the mine, and the fuse running out)
 * 41 L_MORT   1.44  a mortar
 * 42 L_PISTOL 0.87  another pistol
 * 43 L_RIFLE  1.12  (wired: every gun this engine has)
 * 44 L_ROC    1.54  a rocket
 * 45 L_SHOTG  0.81  a shotgun
 * 95 S_CLOCK  1.06  the TURN CLOCK starting to run out
 * 96 S_OPEN   0.83  (wired: the weapon menu)
 * 97 S_SELECT 0.46  (wired: a skill used)
 * 98 S_UNHOLS 0.60  putting a weapon AWAY
 * ```
 *
 * **There is no burning fuse in it**, which is why a charge is heard as its
 * timer alone (`fuseTimer` below).
 *
 * The rest of this is a work list rather than a table: nine of these are
 * placed by ear and wired to nothing — the turn clock's own warning, a round
 * hitting a wall against a round hitting meat, the blast inside a building,
 * the swing that missed, holstering, the battle ambience, the two birds, and
 * the airships nothing on our maps flies. See `docs/todo.md`.
 */
/**
 * **WHAT IS ALREADY PLACED** — by ear, by wiring, or by the exe's own table.
 *
 * `pow.sfx.left()` subtracts this. The runtime "what has sounded" list cannot
 * do the job on its own: it empties every time the app restarts, so an ear
 * three sessions into the bank would be handed the whole ninety-nine again.
 * Play hit exactly that — "там всё ещё то что я тебе уже рассказал!"
 *
 * The thirty-seven play walked on 2026-08-21 are in the table above; the
 * thirteen `FT_*` are one a surface and read out of `Pig::Footstep`
 * (lib/game/footsteps.ts). What is NOT in here is the pig's own forty-odd
 * `P_*`, which is the next ear's job and the biggest pile of name picks left.
 */
const PLACED_BY_EAR = [
  'AMB_1D', 'AMB_2D', 'BATT_L1', 'BATT_L2', 'BATT_L3', 'BATT_S1', 'BATT_S2',
  'BATT_S3', 'BG_GAS', 'BG_PLANE', 'EN_BIP', 'EN_TANK', 'E_1', 'E_1000P',
  'I_BUILD', 'I_BULIT1', 'I_METAL', 'I_PICKUP', 'I_SPLASH', 'I_STAB',
  'I_SWMISS', 'I_SWORD', 'L_ARTIL', 'L_BAZOO', 'L_FLAME', 'L_HVYMG', 'L_MGUN',
  'L_MINETR', 'L_MORT', 'L_PISTOL', 'L_RIFLE', 'L_ROC', 'L_SHOTG', 'S_CLOCK',
  'S_OPEN', 'S_SELECT', 'S_UNHOLS',
  // …and the surfaces, which are read rather than heard.
  'FT_GRASS', 'FT_ICE', 'FT_LAVA', 'FT_METAL', 'FT_MUD', 'FT_QUAG', 'FT_ROCK',
  'FT_SAND', 'FT_SNOW', 'FT_STONE', 'FT_SWIM', 'FT_WATER', 'FT_WOOD'
]

/** Every name whose moment is settled: the list above plus anything the cue
 * table already plays. */
export const placedSounds = (): Set<string> => {
  const out = new Set(PLACED_BY_EAR)
  for (const cue of Object.values(BATTLE_SOUNDS)) out.add(cue.sound)
  return out
}

export const BATTLE_SOUNDS: Record<string, Cue> = {
  /**
   * Leaving the ground under the player's own power. DECODED, and play named
   * it first: the jump's own wrapper (0x4707f0) plays **87 P_SNORT1** at
   * volume 60 and a pitch of `90 + (rand() & 15)`, and its three callers are
   * the jump dispatcher and the launch (0x46b969, 0x46c22f, 0x46e8fa).
   */
  jump: { sound: 'P_SNORT1', volume: 60, pitch: 90, jitter: 15 },
  /**
   * THE TOP OF YOUR OWN TURN. DECODED, and it is the whole of what your own
   * pig says: `Pig::React(7)` splits on the controller (0x4724e5) and the
   * LOCAL HUMAN's arm plays **69 P_HMMM** at volume 0x3C and a pitch of
   * `0x5A + (rand & 0xF)` (0x4725be) — a thinking grunt and no voice line at
   * all. Every OTHER side's pig speaks instead (audio/pigVoice.ts).
   */
  ready: { sound: 'P_HMMM', volume: 60, pitch: 90, jitter: 15 },
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
   * **A BURNING CHARGE MAKES THREE NOISES**, and play named all three: "звук
   * горения фитиля + таймер + звук когда кончается таймер". None of them is
   * decoded — every one of the bank's ninety-nine names was listed looking for
   * a fuse and there is no hiss in it — so all three are `[CHECK — remake]`
   * picks out of what the bank does have, chosen so they can be swapped in one
   * line each through `pow.sfx`.
   *
   * The LENGTHS are what made the picks: a cue is fire-and-forget, so anything
   * repeated has to be shorter than the gap it is repeated at or the copies lie
   * on top of one another — which is exactly what went wrong first time round,
   * `S_CLOCK` being 1.06 s and fired every 0.45.
   */
  /**
   * **THE BURN HAS NO SOUND, and that is now a MEASURED answer rather than a
   * missing one.** Play listened to all thirty-seven of the bank's non-pig,
   * non-footstep entries (the inventory below) and there is no hiss among
   * them: `BG_GAS` is the gas grenade — "газовая граната так делает" — and
   * `L_FLAME` is napalm going off, not something burning steadily. So a
   * charge's fuse is heard as its TIMER and nothing else, and the entry that
   * borrowed the gas is gone rather than left wrong.
   */
  /** The TIMER: `S_CLOCK`, 1.06 s, one a second and no faster. */
  fuseTimer: { sound: 'S_CLOCK', volume: 80, pitch: 100 },
  /** …and the timer RUNNING OUT: `L_MINETR`, 0.23 s, the trigger click that
   * comes just before the blast. */
  fuseOut: { sound: 'L_MINETR', volume: 100, pitch: 100 },
  /**
   * A thrown thing being DOUSED by water. DECODED, mix and all: the projectile's
   * water arm plays index **25** at volume **0x50** with a pitch of
   * `0x5F + (rand & 0x1F)` (0x437cf3), and index 25 of `Audio/sfxday.srl` is
   * **FT_WATER** — which the offset check confirms three other ways (I_PICKUP at
   * 30, I_STAB at 32, L_PISTOL at 42).
   *
   * The same arm sets the projectile's quiet flag, so this is the LAST noise a
   * grenade in water makes — there is no blast after it (lib/game/grenade.ts).
   */
  doused: { sound: 'FT_WATER', volume: 80, pitch: 95, jitter: 31 },
  /**
   * A thrown thing SKIMMING off the water instead of going in. DECODED with its
   * mix: the fast arm plays index **0x12** at volume **0x3C** with a pitch of
   * `0x5A + (rand & 0x3F)` (0x437e99), and index 18 of `Audio/sfxday.srl` is
   * `FT_MUD` — the wet slap of a hoof, which is what skimming water sounds like.
   */
  skim: { sound: 'FT_MUD', volume: 60, pitch: 90, jitter: 63 },
  /**
   * Collecting a crate, and being refused one. These two are DECODED rather
   * than picked by name: `Pig::GiveSkill` plays 0x5E at the pig's own
   * position once the skill is in (0x4759F2, out of 0x475960), and 0x4F on
   * the branch that finds fifteen slots already full (0x465925). Index 94
   * and 79 in `Audio/sfxday.srl` are P_WHOOPE and P_OWW — the pig cheers,
   * or complains (skills/notes.md). Both go out at HALF
   * volume, which is the exe's own mix.
   */
  pickup: { sound: 'P_WHOOPE', volume: 50, pitch: 100 },
  tooMany: { sound: 'P_OWW', volume: 50, pitch: 100 },
  /**
   * Points going back IN — a health crate. DECODED, mix and all: `Pig::Heal`
   * (0x467fd0) ends by playing index **0x53 at volume 100 and pitch 100** at
   * the pig's own position (0x46809f, through the same 0x43A9D0), and index 83
   * of `Audio/sfxday.srl` is **P_SIGH**. The pig sighs with relief; it does not
   * cheer the way collecting a weapon does (damage/notes.md).
   */
  healed: { sound: 'P_SIGH', volume: 100, pitch: 100 },
  /** The skill menu driving in. A name pick, like the movement ones: the
   * bank's own S_OPEN sits beside S_SELECT and S_CLOCK, which is the family
   * of interface noises, and the exe's menu mode is not decoded far enough
   * to say which index it asks for. */
  menuOpen: { sound: 'S_OPEN', volume: 100, pitch: 100 },
  /**
   * A skill being USED confirms itself — at the moment SKIP TURN there was
   * nothing at all, and play noticed: "нет подтверждения хода при пропуске хода."
   *
   * `S_SELECT` out of the same interface family, and it is a NAME PICK like its
   * neighbour above: the exe's menu mode is not decoded far enough to say what it
   * plays when a skill goes off, and skills 63/65/66 are out of range of
   * `Pig::Fire`'s dispatch entirely (it covers 1..62, 0x469408), so there is no
   * arm to read one off. Correct it by ear from `pow.sfx`.
   */
  skillUsed: { sound: 'S_SELECT', volume: 100, pitch: 100 },
  /**
   * A hand-to-hand swing, and what it lands with. All four are DECODED:
   * `Pig::HandToHandStrike` plays 0x21 as the blade goes live (event id 61,
   * 0x474c89) and the weapon's own impact index when it connects (0x476712) —
   * 0x20 for the knife, the bayonet and the cattle prod, 0x22 for the sword,
   * 0x51 for bare trotters and boots. Indices 33, 32, 34 and 81 of
   * `Audio/sfxday.srl` are I_SWMISS, I_STAB, I_SWORD and P_PUNCH: the whoosh
   * and the three ways of connecting (weapons/melee.md).
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
   * skills 6 and 7. `weapons/fire.md`.
   */
  pistol: { sound: 'L_PISTOL', volume: 100, pitch: 100 },
  rifle: { sound: 'L_RIFLE', volume: 100, pitch: 100 },
  // …and which barrel makes which noise. Only the two above are decoded, and
  // they are the two that matter; the rest borrow the rifle's and say so here
  // rather than in the engine, because a sound NAME is this file's business.
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
  blast: { sound: 'E_1', volume: 100, pitch: 100 },
  /**
   * A MINE found by a foot. DECODED, mix and all, and the bank NAMES it: the
   * trigger plays index **0x28 at 100/100** (0x46c072, and the same call from the
   * two other things that set one off), and index 40 of `Audio/sfxday.srl` is
   * **`L_MINETR`** — mine trigger. Which is also what settled the tile bit it
   * hangs off: a note had 0x40 down as water and this file's own splash was the
   * first thing to disagree (lib/game/mines.ts).
   *
   * What goes off afterwards is `blast` above — the mine's own destructor arm
   * funnels into the very same `E_1` a grenade plays (0x433d1a → 0x435375).
   */
  mine: { sound: 'L_MINETR', volume: 100, pitch: 100 },
  /**
   * The BAZOOKA going off. Decoded, mix and all: its fire arm plays index
   * **0x24 at 100/100** (0x47ae9d), and index 36 of `Audio/sfxday.srl` is
   * `L_BAZOO`. Nothing here is a name pick.
   */
  bazooka: { sound: 'L_BAZOO', volume: 100, pitch: 100 }
}

/**
 * Which barrel makes which noise, by skill.
 *
 * The BAZOOKA's is DECODED rather than picked: the per-weapon fire arms hang off
 * one jump table (`0x47cf8c`, indexed by `skill - 6`) and every arm plays a sound
 * the same way, so the whole column can be read off. Skill 29's is
 * `Sound::Play(0x24, 100, 100)` at 0x47ae9d, and index 36 of `Audio/sfxday.srl`
 * is **L_BAZOO**.
 *
 * The rest of the column, read at the same time and NOT wired, because each one
 * would change a noise nobody has asked about: 6 PISTOL 42 `L_PISTOL`, 7 RIFLE
 * 43 `L_RIFLE`, 11 SNIPER 43 at pitch **90**, 19/20 GRENADE 40 `L_MINETR` (the
 * pin, not a blast), 30 GRENADE LAUNCHER 36 like the bazooka, 37 TNT 35
 * `L_ARTIL`. They are one line each the day they are wanted.
 */
export const BARREL_SOUND: Record<number, 'pistol' | 'rifle' | 'bazooka'> = {
  6: 'pistol',
  29: 'bazooka'
  // **37 TNT is deliberately NOT here.** Its own index is read — 35 `L_ARTIL`,
  // off the same column as the bazooka's — and play refused it: a charge being
  // put on the ground is not a weapon going off, and what it makes is a fuse.
}

/**
 * Play a cue the way the exe would: both scales are percentages of nominal,
 * and the jitter is added to the pitch.
 *
 * `random` is injectable so a spec can pin it.
 */
export function playCue(bank: Bank, cue: Cue, random: () => number = Math.random): void {
  const spread = cue.jitter ? Math.floor(random() * (cue.jitter + 1)) : 0
  const off = cue.duck ? Math.floor(random() * (cue.duck + 1)) : 0
  bank.play(cue.sound, {
    gain: Math.max(0, cue.volume - off) / 100,
    rate: (cue.pitch + spread) / 100
  })
}

/**
 * WHAT THE GROUND SOUNDS LIKE — the tile's terrain type to one of the bank's
 * thirteen `FT_*`, and every row of it is DECODED.
 *
 * The footstep handler is `0x475010`, reached from the clip's own key-frame
 * events (lib/game/footsteps.ts). It takes the pig's tile, masks the type byte
 * with `0x1F` — the same low five bits the scramble test and the material
 * lookup take (lib/game/terrain.ts) — and jumps through a twelve-entry table
 * at `0x4754B8`. Each arm loads three registers; the first is the sound index,
 * and the other two are the puff of dust it throws, which is not built here.
 *
 * ```
 *  0  esi=0x0E FT_GRASS      6  -> default
 *  1  esi=0x0E FT_GRASS      7  esi=0x15 FT_SAND
 *  2  esi=0x11 FT_METAL      8  esi=0x0F FT_ICE
 *  3  esi=0x1A FT_WOOD       9  esi=0x16 FT_SNOW
 *  4  esi=0x19 FT_WATER     10  esi=0x19 FT_WATER
 *  5  -> default            11  esi=0x10 FT_LAVA
 * ```
 *
 * The shipped maps agree with it type by type, which is the check that matters
 * more than any single arm: MAZE and both training grounds are wall-to-wall
 * type 1 (grass), OASIS and ZULUS are type 7 (sand), ICE is mostly 9 (snow),
 * ICEFLOW carries the only 8s (ice), ISLAND and LAKE are 4 where the water is,
 * and type 6 — the commonest tile in the game — falls through to stone.
 *
 * Type 11 is the odd one: it is the CLIMBING tile (lib/game/terrain.ts) and it
 * plays lava. That is what the arm says, and ICEFLOW's climbable walls are
 * where it will be heard.
 */
export const SURFACE_SOUNDS: Readonly<Record<number, string>> = {
  0: 'FT_GRASS',
  1: 'FT_GRASS',
  2: 'FT_METAL',
  3: 'FT_WOOD',
  4: 'FT_WATER',
  7: 'FT_SAND',
  8: 'FT_ICE',
  9: 'FT_SNOW',
  10: 'FT_WATER',
  11: 'FT_LAVA'
}

/** Types 5 and 6 jump straight to it, and so does anything past 11 — and
 * anything at all when the pig's feet are not down (`[pig+0x382] != 1`,
 * 0x4750e0). */
export const SURFACE_DEFAULT = 'FT_STONE'

/**
 * …and the layer UNDER every one of them: the handler plays index **0x15
 * FT_SAND** a second time, at the same volume and pitch (0x4753fd), unless the
 * event's own arm asks it not to. Two of the seventy-four ids do; none of the
 * footstep ones do.
 *
 * So a step on stone is stone over sand and a step on sand is sand twice. It
 * reads as a scuff under the material, which is what a hoof on loose ground
 * is — and if play says otherwise it is one line to drop.
 */
export const STEP_UNDERLAY = 'FT_SAND'

/** WHICH hoof, heard: the handler writes the pitch into the slot it plays with
 * — 100 for a whole-body scuff, 92 for foot 1 and 108 for foot 2 (0x475275,
 * 0x4752f6, 0x475374), so the two feet sit 8% either side of nominal. */
export const FOOT_PITCH: Readonly<Record<number, number>> = { 0: 100, 1: 92, 2: 108 }

/** The volume the dispatcher's arms push — 45 for the loud ids, 30 for the
 * quiet ones — and the spread taken off it, `rand() & 15`. */
export const STEP_VOLUME = { loud: 45, soft: 30 }
export const STEP_DUCK = 15

/** The cue a footfall plays: the ground picks the file, the hoof the pitch. */
export const stepCue = (surface: number, foot: number, soft: boolean): Cue => ({
  sound: SURFACE_SOUNDS[surface] ?? SURFACE_DEFAULT,
  volume: soft ? STEP_VOLUME.soft : STEP_VOLUME.loud,
  pitch: FOOT_PITCH[foot] ?? 100,
  duck: STEP_DUCK
})

/** …and the sand under it, at the same mix. */
export const underlayCue = (foot: number, soft: boolean): Cue => ({
  ...stepCue(-1, foot, soft),
  sound: STEP_UNDERLAY
})

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
