// The training ground's script: what the instructor says, and what makes him
// say it.
//
// The whole of it is in `tutorial/notes.md`. Two
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
// The other dispatcher (0x465AB0) fires from 0x4AA6B7 when a crate is PUT
// on the map rather than collected — those are the "FOLLOW THE YELLOW PATH
// AND COLLECT THE CRATE" lines. That is the half that makes the script MOVE:
// a crate's own collection signals nothing (its field 15 is the contents, so
// `signals` is always 0 — lib/game/script.ts), so every step after the first
// opens when a DUMMY falls and the next crate is placed. Without it the
// sergeant explains each weapon and never once says where to go.
//
// **And nothing hangs on a building.** That was the open question — which
// step the original ties to the shelter — and the answer is none of them:
// the two building lines are an ordinary crate pair. "USE BACKSPACE BUTTON
// TO ENTER AND EXIT BUILDINGS OR VEHICLES" is the health×25 crate being
// COLLECTED, and "ENTER THE BUILDING AND COLLECT THE CRATE" is the BAZOOKA
// crate being PLACED — inside it. Walking in is never a trigger; collecting
// what is in there is the next one.

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

/**
 * What he says when the script PUTS a crate on the map — the switch at
 * 0x465AB0, read off its own jump table rather than its lines: the byte map
 * at 0x465C88 is `[skill - 7]` into six targets at 0x465C70, and only five
 * skills have one. Each arm pushes a `gtext` index and then its clip, and
 * every pair is 209 apart, as everywhere else in the script.
 *
 * These are the WHERE-TO-GO lines, and the step they open is the crate they
 * are about.
 */
const CLIP_FOR_PLACED: Record<number, number> = {
  7: 6, // RIFLE        (0x465ad2) -> "FOLLOW THE YELLOW PATH AND COLLECT THE CRATE."
  11: 10, // SNIPER RIFLE (0x465b06) -> "COLLECT THE CRATE."
  29: 22, // BAZOOKA      (0x465c0a) -> "ENTER THE BUILDING AND COLLECT THE CRATE."
  37: 17 // TNT          (0x465bd9) -> "FOLLOW THE PURPLE PATH AND CLIMB OVER THE GATE."
}

/** The grenade is keyed on the count here too — `cmp ecx,5` / `cmp ecx,0Ah`
 * at 0x465b3f and 0x465b72, and any other count says nothing. Five opens the
 * RED path, ten the BLUE. */
const CLIP_FOR_GRENADE_PLACED: Record<number, number> = { 5: 12, 10: 15 }

/**
 * The clip a newly placed crate speaks, or 0 for one the script ignores.
 *
 * A HEALTH crate never speaks on placement — the call site tests the pickup's
 * kind first (`cmp [esi+80h],1` at 0x4aa6a3, health being 1) and skips the
 * dispatcher outright, which is why the health crates only ever talk on their
 * way INTO a pig.
 */
export function clipForPlacement(skill: number | null, amount: number): number {
  if (skill === null) return 0
  if (skill === SKILL_GRENADE) return CLIP_FOR_GRENADE_PLACED[amount] ?? 0
  return CLIP_FOR_PLACED[skill] ?? 0
}

/** The grenade, whose line depends on the crate's count. */
const SKILL_GRENADE = 19
/** SKIP TURN — the one skill the prompts below refuse outright (`cmp ecx,41h`,
 * 0x4933b6), because it is not a thing anyone needs teaching. */
const SKILL_SKIP_TURN = 65

// ——— the prompts: one COUNTER, armed by the menu and spent by the choice ———
//
// The third dispatcher is not a dispatcher at all. `[gameMode+0x32C]` — the
// object at `[0x537F24]`, whose `+0x329` is this level's copy of the training
// flag — is a small counter, and three sites move it:
//
// - every crate line ZEROES it, both dispatchers, in their shared tails
//   (0x465bb5 and 0x465c4a). A new step starts the count over;
// - opening the skill menu sets it to **1** (0x492b37, the driving handler);
// - and TAKING something out of that menu increments it (0x4933ce, the menu's
//   own select) — but only from 1 upwards, so a menu that was never opened
//   since the last crate line counts nothing.
//
// So the plain course of it is: a crate speaks, you open the menu, you choose,
// and the choice is count TWO — which is the step that says what to do with
// the thing. That is where clip 5, the one line nothing was known to fire,
// lives. Clip 4 is the same block's other half and is NOT built: it hangs on
// `[gameMode+0]` being 3 (0x492af5) and that field is not identified.

/** What he says the moment a weapon comes out of the menu — the arms at
 * 0x4933d8 (bayonet) and 0x493414 (rifle), both on count two. */
const CLIP_FOR_CHOSEN: Record<number, number> = {
  3: 5, // BAYONET -> "PRESS SPACE TO ATTACK THE DUMMY."
  7: 9 // RIFLE    -> "HOLD CTRL BUTTON TO AIM - PRESS SPACE TO FIRE."
}

/**
 * The grenade's prompt is a NAG rather than a step: its arm (0x49344a) asks
 * for a count divisible by five and for the sergeant to be quiet, so it comes
 * back round every fifth time the thing is taken in hand and never on the
 * first. Clip 13 is what the crate itself said; this is the reminder.
 */
const GRENADE_NAG_EVERY = 5
const GRENADE_NAG_CLIP = 14

/** Where the counter stands the moment the menu opens (0x492b37). */
export const MENU_ARMED = 1

/**
 * The clip taking `skill` in hand speaks, with the counter at `count` — 0 for
 * a choice the script has nothing to say about, which is most of them.
 *
 * `quiet` is the exe's own guard on the grenade alone: 0x49345b asks the sound
 * manager whether it is still talking and drops the line if it is.
 */
export function clipForChosen(skill: number, count: number, quiet: boolean): number {
  if (skill === SKILL_SKIP_TURN || count < 2) return 0
  if (skill === SKILL_GRENADE) {
    return quiet && count % GRENADE_NAG_EVERY === 0 ? GRENADE_NAG_CLIP : 0
  }
  return count === 2 ? (CLIP_FOR_CHOSEN[skill] ?? 0) : 0
}
