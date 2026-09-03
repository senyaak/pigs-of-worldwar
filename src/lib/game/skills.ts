// The skill list: everything a pig can carry and everything it can do.
//
// The game calls them SKILLS, not weapons — the same list holds the rifle,
// the grenade, the jetpack, MAP VIEW, SKIP TURN and SURRENDER, and a pig's
// inventory is a list of them (lib/game/inventory.ts). The exe's own word,
// out of its debug print at 0x4D02C8: "Giving skill %d (%d)".
//
// Two tables in the exe are the whole of it:
//
// - **0x4CF0D0**, one dword per skill: the `gtext` index of its NAME. That
//   is what fixes the ids — skill 0 is `gtext 96` "NONE", skill 19 is
//   `gtext 115` "GRENADE", and so on to 66, SURRENDER.
// - **0x4D9DC8**, one byte per crate value: what a CRATE's stored byte
//   means. It is not the skill id — the loader reads the crate's byte and
//   looks it up (`movsx edi,[eax+4D9DC8h]` at 0x4A5B7A). Crate byte 18 is
//   skill 19, GRENADE; 27 is 29, BAZOOKA; 34 is 37, TNT. Without it CAMP's
//   crates read one weapon short of what they are — and it is **72 entries
//   long**, which cost the remake a third of the game's crates until play
//   caught it (`CRATE_SKILL`).

/** `gtext` index of each skill's name, by skill id (exe 0x4CF0D0). */
const SKILL_LINE = [
  96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115,
  116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134,
  135, 136, 137, 138, 139, 140, 106, 110, 127, 125, 124, 141, 142, 143, 144, 145, 146, 147, 148,
  149, 150, 151, 152, 153, 154, 155, 156, 157
]

/**
 * What a crate's stored byte hands over, as a skill id (exe 0x4D9DC8).
 *
 * **This was transcribed 46 entries long and the table is 72**, which is not a
 * tidy mistake: the four skills the short version appeared to "skip" —
 * 13 SUPER SHOTGUN, 27 SHRAPNEL GRENADE, 30 GRENADE LAUNCHER and **38 SUPER
 * TNT** — are not skipped at all. They sit at the END, at indices 67..71,
 * after a run that walks 50..66. Play caught it in one line ("это в ящиках
 * находится") against a spec of ours that had just asserted the opposite.
 *
 * What the short table cost: every byte from 46 up answered `undefined`, so
 * **those crates handed over NOTHING**. Measured over the 61 shipped POGs, the
 * bytes actually placed include 51 (twenty-one maps), 58 (eleven), 59 (three),
 * 67 (four) and 70 (one) — a JETPACK crate on a third of the game, both AIR
 * STRIKES, the SUPER TNT and the SHRAPNEL GRENADE, all of them silently empty.
 *
 * Indices 46..50 hand over 68..72, which are past the 67 skills and mean
 * nothing here; no shipped map places one, so they are transcribed as they
 * stand rather than guessed at. Index 72 is 126 and everything after it 255 —
 * the table's own end.
 */
const CRATE_SKILL = [
  // 0..12 — the skills at their own index
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  // 13..25 — 13 SUPER SHOTGUN steps out of line here and reappears at 69
  14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  // 26..45 — and 27, 30 and 38 step out the same way
  28, 29, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  // 46..50 — past the skill list, and no shipped map places one
  68, 69, 70, 71, 72,
  // 51..66 — the late skills and the tools, 55 HIDE stepping out to 68
  50, 51, 52, 53, 54, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66,
  // 67..71 — THE FIVE THAT STEPPED OUT, collected at the end
  38, 55, 13, 27, 30
]

/**
 * The skill menu's icon for each skill, by id — the entry names in
 * `Language/Tims/MENUTIMS.MAD`, which run in the skill list's own order
 * after the frame: entry 1 is skill 1's, entry 66 is skill 66's. Skill 0,
 * NONE, has no icon, and the archive's last entry is the highlight rather
 * than a skill.
 *
 * The pairing checks out on every recognisable name — 11 SNIPER RIFLE is
 * `tscopic`, 19 GRENADE `grenade`, 29 BAZOOKA `bazooka`, 37 TNT `tnt`,
 * 63 MAP VIEW `map`, 65 SKIP TURN `sleep`, 66 SURRENDER `surrend`.
 */
export const SKILL_ICON = [
  '', 'trotter', 'knife', 'bayonet', 'sword', 'cattlep1', 'pistol', 'rifle', 'rfburst', 'mgun',
  'hvmgun', 'tscopic', 'rifbell', 'superrif', 'fthrowr', 'rocket', 'guidedm', 'mededart',
  'trandart', 'grenade', 'clusgre1', 'highexpl', 'rollgren', 'confusg', 'freezeg', 'madnessg',
  'poisong', 'supegren', 'morter', 'bazooka', 'grenlau', 'aburst', 'saburst', 'medeball',
  'homingm', 'mine', 'antipm', 'tnt', 'firecrac', 'artrang', 'cluster', 'artgas', 'artrain',
  'art1000', 'artshoc', 'pillbhmg', 'pillbfla', 'tankairb', 'tankbazo', 'tankmort', 'jetpac',
  'suicide', 'healhand', 'medic1', 'pickpock', 'conceal', 'shokwav', 'specops', 'plane',
  'clustair', 'in-out', 'pbox', 'getout', 'map', 'zoomin', 'sleep', 'surrend'
]

/** How many skills the list names. */
export const SKILL_COUNT = SKILL_LINE.length

/** A few the rest of the game needs by name rather than by number. */
export const SKILL = {
  NONE: 0,
  BAYONET: 3,
  RIFLE: 7,
  SNIPER_RIFLE: 11,
  GRENADE: 19,
  BAZOOKA: 29,
  TNT: 37,
  /** The MEDIC's dart — a rifle-shaped shot that heals whoever it hits
   * (lib/game/projectile.ts, `heal`). */
  MEDIC_DART: 17,
  /** …and their thrown AREA heal, the class's other level-2 skill
   * (lib/game/grenade.ts). */
  MEDICINE_BALL: 33,
  /** The BOMBARDIER's thrown shell, which bursts into three more
   * (lib/game/grenade.ts, `scatter`). */
  MORTAR: 28,
  /** The ENGINEER's, the SABOTEUR's and the SNIPER's last resort: the pig
   * spends itself (lib/game/suicide.ts). */
  SUICIDE: 51,
  /** The medic careers' contact heal (lib/game/healing.ts). */
  HEALING_HANDS: 52,
  /** The espionage careers' theft (lib/game/pickpocket.ts). */
  PICK_POCKET: 54,
  /** …and their disguise — the icon calls it CONCEAL, gtext says HIDE
   * (lib/game/hide.ts). */
  HIDE: 55,
  /** The door of a BUILDING — what a pig uses to get in and out of one, and
   * what the slot beside the dial carries while it is in there
   * (lib/game/buildings.ts; 60 is the VEHICLE's own). */
  BUILDING_INOUT: 61,
  /** Always in the menu, whatever the pig is carrying. */
  SKIP_TURN: 65,
  SURRENDER: 66
}

/** The skill a crate's byte hands over, or null if the byte names none. */
export function skillFromCrate(crateByte: number): number | null {
  const skill = CRATE_SKILL[crateByte]
  return skill === undefined ? null : skill
}

/** A skill's name out of `gtext`, or '' if the install has no strings. */
export function skillName(strings: string[], skill: number): string {
  const line = SKILL_LINE[skill]
  return line === undefined ? '' : (strings[line] ?? '')
}
