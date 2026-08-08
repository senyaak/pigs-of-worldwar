// What a key MEANS right now, which depends on what the game is doing.
//
// The original does this with modes and says so: `0x4928dc` routes the whole of
// input through a different branch while the aim bit is down, the camera keeps a
// remembered mode and puts it back when the bit goes up, and the skill menu is a
// mode of its own. So a control set that changes with the state is a
// transcription rather than a convention.
//
// It is also the fix for a real bug. The four places that used to decide this —
// `if (hud.skills.open())` in `ui/battle.ts`, the sights' own two lines beside
// it, `committed()` in `three/battle.ts` and the aftermath block below it — meant
// "what does W do" had no single answer to read. Which is how the sights ended up
// inside the fire lock for a commit, and play caught it: "там должен включаться
// другой контрол сет — выключаться должно когда выстрел нажал, не прицел."
//
// Pure. This file knows nothing about keys, three.js or the scene: it takes what
// is HELD and says what it means.

/**
 * The control sets. FRONTEND is a seventh and the odd one out — the main menu
 * binds its own KEY map (`MENU_BINDINGS`) rather than reinterpreting the battle's
 * actions, so it never reaches this file.
 */
export type ControlMode = 'starting' | 'battle' | 'sights' | 'charging' | 'inventory' | 'locked'

/** What the player is holding, already reduced to axes. */
export interface Held {
  /** −1 back, 0, +1 forward. */
  walk: number
  /** −1 left, 0, +1 right. */
  turn: number
  /** −1 down, 0, +1 up — the dedicated aim keys only. */
  aim: number
  /** Whether the aim-view key is down. */
  sighting: boolean
  /** Whether the fire key is down. Held, because that is what the power gauge
   * is (lib/game/gauge.ts). */
  firing: boolean
}

/** What the mode makes of it. */
export interface Intent {
  /** What drives the PIG. */
  walk: number
  turn: number
  /** What points the weapon. */
  aim: number
  /** Whether the scene should be down the sights. */
  sighting: boolean
  /** Whether the scene should treat fire as held. */
  firing: boolean
  /** Where the inventory cursor should step, this change. Zero everywhere but
   * `inventory`, and the caller is the one that de-edges it — a held key must
   * not walk the cursor every frame. */
  cursor: { x: number; y: number }
}

/** What the game is doing, in the only terms this decision needs. */
export interface Situation {
  /** The beat at the top of a turn — "START OF TURN, press any key". */
  starting: boolean
  /** The skill menu is up. */
  inventory: boolean
  /**
   * The pig has committed to a blow, or is watching what one did: from the FIRE
   * press through the swing or the flight to the last thing it threw going away,
   * and on through the beat after a kill.
   */
  locked: boolean
  /** A power gauge is filling — the fire key went down and has not come up. */
  charging: boolean
  /** The aim-view key is down and what is in hand can use it. */
  sighting: boolean
}

/**
 * Which set is live, in priority order.
 *
 * **The two at the top used to be exceptions inside other modes, and play called
 * that out: "там просто другой контроллер!"** They were right, twice:
 *
 * - the beat at the top of a turn was going to be a locked mode with a carve-out
 *   for "any key ends it". It is not — it is a set whose ONLY job is to take any
 *   key at all, and there is nothing to carve;
 * - the power gauge charging was a locked mode that let FIRE through as a special
 *   case. It is not that either: it is a set that reads the button coming UP and
 *   nothing else, which is exactly what the exe's own split does (0x493796 — the
 *   press starts the charge, the release throws).
 *
 * With both named, `locked` becomes what its name says: nothing gets through.
 */
export function modeOf(situation: Situation): ControlMode {
  if (situation.starting) return 'starting'
  if (situation.inventory) return 'inventory'
  if (situation.charging) return 'charging'
  if (situation.locked) return 'locked'
  if (situation.sighting) return 'sights'
  return 'battle'
}

const STILL: Intent = {
  walk: 0,
  turn: 0,
  aim: 0,
  sighting: false,
  firing: false,
  cursor: { x: 0, y: 0 }
}

/**
 * What the held set means in this mode.
 *
 * Every row is behaviour that already existed — gathered rather than invented:
 *
 * - **battle**: W/S walk, A/D turn, Q/E point the weapon.
 * - **sights**: W/S POINT rather than walk, because the aim view is where the
 *   original puts the elevation, and A/D still turn the pig — which is what the
 *   exe leaves them doing. Q/E keep working and win over W/S when both are down.
 * - **charging**: the fire key and NOTHING else. This set exists to watch the
 *   button come UP, which is the whole of what the gauge's own split needs
 *   (0x493796). It is not a lock with a hole in it.
 * - **inventory**: nothing drives the pig; the axes step the CURSOR instead, and
 *   the vertical is inverted because forward is up the list.
 * - **starting**: nothing, because the caller never gets this far — the beat's own
 *   rule is that ANY input starts the turn and is then re-read in the set that
 *   follows, so `starting` is resolved away before the axes are asked for
 *   (`ui/battle.ts`). Held keys never produce a one-shot verb, so a set that
 *   swallowed them could not be ended by them: that is why the rule is
 *   "start and re-read" rather than "consume".
 * - **locked**: nothing at all.
 */
export function readControls(mode: ControlMode, held: Held): Intent {
  if (mode === 'inventory') {
    return {
      ...STILL,
      cursor: { x: held.turn, y: held.walk > 0 ? -1 : held.walk < 0 ? 1 : 0 }
    }
  }
  // The gauge's set: the button, and nothing it could steer with.
  if (mode === 'charging') return { ...STILL, firing: held.firing }
  if (mode === 'locked' || mode === 'starting') return { ...STILL }
  if (mode === 'sights') {
    return {
      walk: 0,
      turn: held.turn,
      aim: held.aim !== 0 ? held.aim : held.walk,
      sighting: true,
      firing: held.firing,
      cursor: { x: 0, y: 0 }
    }
  }
  return {
    walk: held.walk,
    turn: held.turn,
    aim: held.aim,
    sighting: false,
    firing: held.firing,
    cursor: { x: 0, y: 0 }
  }
}

/**
 * What a one-shot key does. Named results rather than the action itself, because
 * the whole point is that the same key is a different verb per mode.
 *
 * `null` is a key that does nothing here, and there are several — a menu swallows
 * the turn key, a locked pig cannot open its inventory.
 */
export type Verb =
  | 'jump'
  | 'choose'
  | 'cutChute'
  | 'openInventory'
  | 'closeInventory'
  | 'beginTurn'
  | 'skipTurn'

export function verbOf(mode: ControlMode, action: string): Verb | null {
  // The beat at the top of a turn: ANY key starts it, whatever the key is. The
  // caller then re-reads the same input in the set that follows, so nothing a
  // player does is swallowed.
  if (mode === 'starting') return 'beginTurn'
  if (mode === 'inventory') {
    // SPACE is the SELECT key here, as it is in the original: it takes the skill
    // under the cursor and puts the menu away. Nothing fires it.
    if (action === 'jump') return 'choose'
    if (action === 'skills') return 'closeInventory'
    return null
  }
  if (mode === 'locked' || mode === 'charging') {
    // The one thing either of them answers, and it is the level's opening drop:
    // the jump key cuts the canopy and brings the crate down now.
    if (action === 'jump') return 'cutChute'
    return null
  }
  // The aim view takes the jump away and nothing else: the exe reaches no jump
  // from its own input branch while the bit is down (0x4928dc).
  if (action === 'jump') return mode === 'sights' ? null : 'jump'
  if (action === 'skills') return 'openInventory'
  /**
   * Ending a turn is a SKILL — 65, SKIP TURN, always in the menu whatever the pig
   * carries (lib/game/skills.ts). Play: "закончить ход вообще можно только через
   * умение." So the key is a shortcut to that skill rather than a path of its own,
   * and whatever the skill grows later — an animation, a noise — the key gets for
   * free.
   */
  if (action === 'endTurn') return 'skipTurn'
  return null
}
