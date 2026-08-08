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
 * The five control sets. FRONTEND is the odd one out — the main menu binds its
 * own KEY map (`MENU_BINDINGS`) rather than reinterpreting the battle's actions,
 * so it never reaches this file and is named here only for the record.
 */
export type ControlMode = 'battle' | 'sights' | 'inventory' | 'locked'

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
  /** The skill menu is up. */
  inventory: boolean
  /**
   * The pig has committed to a blow, or is watching what one did. Everything
   * from the FIRE press to the last thing it threw going away, plus the beat
   * after a kill and the beat at the top of a turn.
   */
  locked: boolean
  /** The aim-view key is down and what is in hand can use it. */
  sighting: boolean
}

/**
 * Which set is live. The order is the priority, and it is the order the exe's own
 * tests fall in: a menu beats everything, a committed pig cannot enter the sights,
 * and the sights beat the plain battle.
 */
export function modeOf(situation: Situation): ControlMode {
  if (situation.inventory) return 'inventory'
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
 * The four rows, and every one of them is behaviour that already existed —
 * gathered rather than invented:
 *
 * - **battle**: W/S walk, A/D turn, Q/E point the weapon.
 * - **sights**: W/S POINT rather than walk, because the aim view is where the
 *   original puts the elevation, and A/D still turn the pig — which is what the
 *   exe leaves them doing. Q/E keep working and win over W/S when both are down.
 * - **inventory**: nothing drives the pig; the axes step the CURSOR instead, and
 *   the vertical is inverted because forward is up the list.
 * - **locked**: nothing but FIRE. The fire key has to keep coming through or a
 *   power gauge could not charge while the pig is locked — which it must, since
 *   the press that locked the pig is the press that started the charge — and a
 *   second press is what sets a live grenade off.
 */
export function readControls(mode: ControlMode, held: Held): Intent {
  if (mode === 'inventory') {
    return {
      ...STILL,
      cursor: { x: held.turn, y: held.walk > 0 ? -1 : held.walk < 0 ? 1 : 0 }
    }
  }
  if (mode === 'locked') return { ...STILL, firing: held.firing }
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
export type Verb = 'jump' | 'choose' | 'cutChute' | 'openInventory' | 'closeInventory' | 'endTurn'

export function verbOf(mode: ControlMode, action: string): Verb | null {
  if (mode === 'inventory') {
    // SPACE is the SELECT key here, as it is in the original: it takes the skill
    // under the cursor and puts the menu away. Nothing fires it.
    if (action === 'jump') return 'choose'
    if (action === 'skills') return 'closeInventory'
    return null
  }
  if (mode === 'locked') {
    // The one exception in the whole lock, and it is the level's opening drop:
    // the jump key cuts the canopy and brings the crate down now.
    if (action === 'jump') return 'cutChute'
    return null
  }
  // The aim view takes the jump away and nothing else: the exe reaches no jump
  // from its own input branch while the bit is down (0x4928dc).
  if (action === 'jump') return mode === 'sights' ? null : 'jump'
  if (action === 'skills') return 'openInventory'
  if (action === 'endTurn') return 'endTurn'
  return null
}
