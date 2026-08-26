// What a skill becomes once it is chosen: a model in the hand, a pose, and
// whether the player may aim it.
//
// The exe keeps one 80-byte record per weapon at 0x4d7300, indexed by
// `[pig+0x2f4]` — the skill id, the same one the menu and the inventory use
// (lib/game/skills.ts). The columns below are lifted from it; the aim rules
// that read them live next door in lib/game/aim.ts.
//
// One thing about that table is worth knowing before trusting the numbers:
// the AIM POSE and GET-IT-OUT clips are read at +0x50 and +0x54, which is
// eight bytes past the end of an 80-byte slot, so each weapon's pair sits in
// the FOLLOWING slot. That is not a misreading to correct — read that way the
// table lines up perfectly (6 PISTOL gets "Aiming Handgun", 7 RIFLE "Aiming
// Rifle", 9 MACHINE GUN "Aiming Machine gun", 29 BAZOOKA "Aiming Heavy
// weapon", every grenade none at all), and read slot-aligned it hands MAP
// VIEW an aiming pose. `weapons/notes.md` has the whole
// derivation.

/**
 * The models a pig can hold, in `Chars/WEAPONS.MAD`'s own order and 1-BASED,
 * because 0 on the pig means empty hands. It is the same numbering the canopy
 * uses — `WE_PARA` is 24, which is what `Pig::StartParachuting` writes
 * (three/parachute.ts).
 *
 * The archive stops at 27 and the table asks for 28 and 29 as well (the
 * rocket, the guided missile, the grenade launcher): those come from
 * somewhere this repo has not found, so a pig holding one holds nothing.
 */
export const WEAPON_MODEL = [
  '',
  'WE_KNIFE',
  'WE_SWORD',
  'WE_PROD',
  'WE_PIS',
  'WE_AUTP',
  'WE_RIF',
  'WE_TELR',
  'WE_MGUN',
  'WE_LEWIS',
  'WE_BLUND',
  'WE_FLAME',
  'WE_GREN',
  'WE_HEG',
  'WE_ROLL',
  'WE_TNT',
  'WE_SMOKE',
  'bazookr',
  'mortr',
  'airbrst',
  'WE_MINE',
  'WE_SPADE',
  'WE_RADIO',
  'WE_TELE',
  'WE_PARA',
  'RPACK',
  'WE_BANG',
  'WE_BALL'
]

export interface Weapon {
  /** Index into WEAPON_MODEL — what goes in the hand. 0 is nothing. */
  model: number
  /**
   * The clip the aim angle scrubs, or 0 for a weapon with no aiming pose.
   * It is not an animation anybody plays: it is one sweep from full up to
   * full down, held at the frame the angle points at (lib/game/aim.ts).
   */
  aimClip: number
  /** Played through once as the weapon comes out. */
  readyClip: number
  /** The swing or the throw, or -1 for a weapon that just fires. */
  attackClip: number
  /** Whether this weapon aims at all (record +0x15). */
  aims: boolean
  /** Whether it charges on a held fire button (record +0x14). */
  power: boolean
}

// model, aimClip, readyClip, attackClip, aims, power — exe 0x4d7300.
/**
 * The 80-byte skill records at 0x4d7300, transcribed: model, aimClip, readyClip,
 * attackClip, aims, power.
 *
 * Exported so a spec can hold a reading to it — the IN/OUT clip was found here
 * after being declared absent somewhere else (lib/game/buildings.ts).
 */
export const WEAPON_TABLE: [number, number, number, number, number, number][] = [
  [0, 0, 0, -1, 0, 0], // 0 NONE
  [0, 0, 17, 21, 0, 0], // 1 TROTTER
  [1, 0, 18, 21, 0, 0], // 2 KNIFE
  [6, 25, 14, 22, 1, 0], // 3 BAYONET
  [2, 0, 18, 21, 0, 0], // 4 SWORD
  [3, 25, 14, 22, 1, 0], // 5 CATTLE PROD
  [4, 23, 12, -1, 1, 0], // 6 PISTOL
  [6, 24, 13, -1, 1, 0], // 7 RIFLE
  [6, 24, 13, -1, 1, 0], // 8 RIFLE BURST
  [8, 25, 14, -1, 1, 0], // 9 MACHINE GUN
  [9, 25, 14, -1, 1, 0], // 10 HEAVY M-GUN
  [7, 24, 13, -1, 1, 0], // 11 SNIPER RIFLE
  [10, 24, 13, -1, 1, 0], // 12 SHOTGUN (gtext 108; the icon's name is "rifbell")
  [10, 24, 13, -1, 1, 0], // 13 SUPER SHOTGUN (gtext 109)
  [11, 25, 14, -1, 1, 0], // 14 FLAME THROWER
  [29, 26, 15, -1, 1, 0], // 15 ROCKET
  [29, 26, 15, -1, 1, 0], // 16 GUIDED MISSILE
  [6, 24, 13, -1, 1, 0], // 17 MEDIC DART
  [6, 24, 13, -1, 1, 0], // 18 TRANQUILLISER DART
  [12, 0, 17, 19, 1, 1], // 19 GRENADE
  [12, 0, 17, 19, 1, 1], // 20 CLUSTER GRENADE
  [12, 0, 17, 19, 1, 1], // 21 HIGH EXPLOSIVE
  [14, 0, 17, 19, 1, 1], // 22 ROLLING GRENADE
  [16, 0, 17, 19, 1, 1], // 23 CONFUSION GAS
  [16, 0, 17, 19, 1, 1], // 24 FREEZE GRENADE
  [16, 0, 17, 19, 1, 1], // 25 MADNESS GAS
  [16, 0, 17, 19, 1, 1], // 26 POISON GAS
  [12, 0, 17, 19, 1, 1], // 27 SUPER GRENADE
  [18, 26, 15, -1, 1, 0], // 28 MORTAR
  [17, 26, 15, -1, 1, 1], // 29 BAZOOKA
  [28, 26, 15, -1, 1, 1], // 30 GRENADE LAUNCHER
  [19, 26, 15, -1, 1, 1], // 31 AIRBURST
  [19, 26, 15, -1, 1, 1], // 32 SUPER AIRBURST
  [27, 0, 17, 19, 1, 1], // 33 MEDICINE BALL
  [29, 26, 15, -1, 1, 1], // 34 HOMING MISSILE
  [20, 0, 17, 77, 0, 0], // 35 MINE
  [20, 0, 17, 77, 0, 0], // 36 ANTI-PERSONNEL MINE
  [15, 0, 17, 77, 0, 0], // 37 TNT
  [26, 0, 17, 77, 0, 0], // 38 FIRECRACKER
  [0, 26, 15, -1, 1, 1], // 39
  [0, 26, 15, -1, 1, 1], // 40
  [0, 26, 15, -1, 1, 1], // 41
  [0, 26, 15, -1, 1, 1], // 42
  [0, 26, 15, -1, 1, 1], // 43
  [0, 26, 15, -1, 1, 1], // 44
  [0, 25, 14, -1, 1, 0], // 45 HEAVY M-GUN (emplaced)
  [0, 25, 14, -1, 1, 0], // 46 FLAME THROWER (emplaced)
  [0, 26, 15, -1, 1, 1], // 47 AIRBURST (emplaced)
  [0, 26, 15, -1, 1, 1], // 48 BAZOOKA (emplaced)
  [0, 26, 15, -1, 1, 0], // 49 MORTAR (emplaced)
  [0, 0, 17, -1, 1, 0], // 50 JETPACK
  [15, 0, 17, 81, 0, 0], // 51 SUICIDE
  [0, 0, 17, 78, 0, 0], // 52 HEALING HANDS
  [0, 0, 17, 81, 0, 0], // 53 MEDIC
  [0, 0, 17, 79, 0, 0], // 54 PICK POCKET
  [0, 0, 17, 81, 0, 0], // 55 CONCEAL
  [0, 0, 17, 81, 0, 0], // 56 SHOCKWAVE
  [0, 0, 17, -1, 0, 0], // 57 SPECIAL OPS
  [0, 0, 17, 80, 0, 0], // 58 AIR STRIKE
  [0, 0, 17, 80, 0, 0], // 59 CLUSTER AIR STRIKE
  [0, 0, 0, 7, 0, 0], // 60 IN-OUT
  [0, 0, 0, 7, 0, 0], // 61 PILL BOX
  [0, 24, 13, -1, 0, 0], // 62 GET OUT
  [0, 0, 0, -1, 0, 0], // 63 MAP VIEW
  [23, 24, 13, -1, 1, 0], // 64 BINOCULARS
  [0, 0, 17, -1, 0, 0], // 65 SKIP TURN
  [0, 0, 0, -1, 0, 0] // 66 SURRENDER
]

const NOTHING: Weapon = {
  model: 0,
  aimClip: 0,
  readyClip: 0,
  attackClip: -1,
  aims: false,
  power: false
}

/** What a skill is, as a weapon. An id off the end reads as empty hands. */
export function weaponOf(skill: number | null): Weapon {
  const row = skill === null ? undefined : WEAPON_TABLE[skill]
  if (!row) return NOTHING
  return {
    model: row[0],
    aimClip: row[1],
    readyClip: row[2],
    attackClip: row[3],
    aims: row[4] === 1,
    power: row[5] === 1
  }
}

/** The `Chars/WEAPONS.MAD` entry a skill puts in the hand, or null. */
export function weaponModelName(skill: number | null): string | null {
  return WEAPON_MODEL[weaponOf(skill).model] || null
}
