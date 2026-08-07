// The training ground's script: what the instructor says, and what makes him
// say it.
//
// The whole of it is in `../../../../pigs-disasm/tutorial/notes.md`. Two
// facts hold it together:
//
// - there are 28 voice clips, `tr1_en01..28.wav`, and 28 lines, `gtext`
//   210..237, and they are the SAME step offset by 209 — every call site in
//   the exe that speaks clip N also pushes string 209 + N;
// - a step ends on one of three things: killing the dummy, picking up the
//   crate, or reaching somewhere (the gate, the gap, the building).
//
// And the "step ids" that looked unnamed are not steps at all: they are
// SKILL IDS. `Pig::GiveSkill` calls the tutorial at 0x46546A while the
// training flag is up, and the dispatcher it calls (0x465CB0) switches on
// the pickup's own kind and then on what it carried — 3 BAYONET, 7 RIFLE,
// 11 SNIPER RIFLE, 19 GRENADE, 29 BAZOOKA, 37 TNT, exactly what CAMP's
// crates hold, and on a health crate its amount instead. So the script is
// driven by the CRATES, and each line is about the thing just collected.
//
// The other dispatcher (0x465AB0) fires from 0x4AA6B7 when a crate is put
// on the map rather than collected — those are the "FOLLOW THE YELLOW PATH
// AND COLLECT THE CRATE" lines. The remake places every crate at load, so
// it has no moment to say them at yet; that waits on the map script.

/** The map that IS the training ground; the exe reaches it as level 0. */
export const TRAINING_MAP = 'CAMP'

/** Whether a map name is the training ground, however it was spelled. */
export const isTrainingGround = (map: string): boolean =>
  map.toUpperCase() === TRAINING_MAP

/** Clip N speaks `gtext` 209 + N. */
export const LINE_BASE = 209
/** How many clips the training set has. */
export const CLIP_COUNT = 28

/** The line clip N puts through the briefing bar, or '' if the install has
 * no gtext. Several of them ARE a single space: those steps are voice only,
 * and the bar still opens. */
export function lineFor(strings: string[], clip: number): string {
  return strings[LINE_BASE + clip] ?? ''
}

/** The moments the remake can currently tell the script about. */
export type Cue = 'drop' | 'round'

/**
 * Which clip each cue speaks:
 *
 * - `drop` — the level opening, while the squad is still under its canopies.
 *   Clip 1's line is blank, so this one is voice alone.
 * - `round` — the round starting, once everyone is down. "FOLLOW THE GREEN
 *   PATH AND COLLECT THE CRATE."
 */
export const CLIP_FOR: Record<Cue, number> = { drop: 1, round: 2 }

/**
 * What the sergeant says when a crate is COLLECTED — the switch at
 * 0x465E25, keyed on the skill that was in it. Each line is about using
 * the thing just picked up.
 */
const CLIP_FOR_SKILL: Record<number, number> = {
  3: 3, // BAYONET      -> "PRESS RETURN BUTTON FOR SKILL MENU."
  7: 8, // RIFLE        -> "…SKILL MENU AND SPACE TO SELECT YOUR WEAPON."
  11: 11, // SNIPER RIFLE -> "HOLD CTRL BUTTON TO AIM - PRESS SPACE TO FIRE."
  29: 25, // BAZOOKA      -> "HOLD SPACE TO SET POWER AND RELEASE TO FIRE."
  37: 20 // TNT          -> "PRESS SPACE TO SET CHARGE AND THEN STAND CLEAR!"
}

/** The grenade is the one that depends on HOW MANY were in the crate — the
 * exe's `cmp ecx,5` / `cmp ecx,0Ah` at 0x465EE2, and CAMP ships one crate of
 * each. Five teaches throwing, ten teaches the flat aim angle. */
const CLIP_FOR_GRENADE: Record<number, number> = { 5: 13, 10: 16 }

/** A health crate says where to go next, by how much it holds (0x465CD3). */
const CLIP_FOR_HEALTH: Record<number, number> = {
  10: 18, // "USE SHIFT BUTTON TO JUMP THE GAP."
  15: 19, // "FOLLOW THE PATH THROUGH THE MINEFIELD AND COLLECT THE CRATE."
  20: 23, // the same line again, for the second minefield
  25: 24 // "USE BACKSPACE BUTTON TO ENTER AND EXIT BUILDINGS OR VEHICLES."
}

/** The clip a collected crate speaks, or 0 for one the script ignores. */
export function clipForPickup(skill: number | null, amount: number): number {
  if (skill === null) return CLIP_FOR_HEALTH[amount] ?? 0
  if (skill === SKILL_GRENADE) return CLIP_FOR_GRENADE[amount] ?? 0
  return CLIP_FOR_SKILL[skill] ?? 0
}

/** The grenade, whose line depends on the crate's count. */
const SKILL_GRENADE = 19
