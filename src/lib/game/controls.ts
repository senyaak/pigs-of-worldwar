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

import { meleeOf } from './melee'
import { isLobbed, isPlanted } from './grenade'
import { isGun } from './projectile'

/**
 * The control sets. FRONTEND is a seventh and the odd one out — the main menu
 * binds its own KEY map (`MENU_BINDINGS`) rather than reinterpreting the battle's
 * actions, so it never reaches this file.
 */
export type ControlMode =
  | 'starting'
  | 'battle'
  | 'sights'
  | 'charging'
  | 'armed'
  | 'inventory'
  | 'locked'

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
  /**
   * Whether the fire key went DOWN this frame, which is a separate question from
   * whether it is down — and it has to be asked separately.
   *
   * A gun goes off on the EDGE, and deriving that edge from `firing` rising is
   * wrong once the sets are polled: a mode that does not read the fire key
   * reports it as up while the player is still holding it, so LEAVING that mode
   * looks exactly like a fresh press. Holding F through a shot then set off the
   * next grenade the frame it appeared, which is what caught it.
   */
  fired: boolean
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
  /** Whether the scene should treat fire as having just been PRESSED. Passed
   * wherever `firing` is passed and false everywhere else. */
  fired: boolean
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
  /** Something the pig threw is still LIVE. Its own set, because a second press
   * of the fire key is what sets it off where it lies — and being locked used to
   * swallow that press, so a grenade in the air could not be detonated. */
  armed: boolean
  /** The aim-view key is down and what is in hand can use it. */
  sighting: boolean
}

/**
 * What the WEAPON adds to the movement set — the composition play asked for:
 * "каждое оружие — свой контроллер; можно ведь комбинировать их, скажем movement +
 * melee или movement + gun?" Yes, and this is that table.
 *
 * A pig always has the movement set. On top of it, what is in its hands decides
 * which extra controls exist at all — and the one that matters here is the AIM
 * VIEW, because entering a set drops the driving keys, so a layer that has no aim
 * view must leave the key inert rather than stopping the pig for nothing. Play
 * found the bayonet doing exactly that: "G всё ещё стопорит на оружии штык."
 *
 * The engine agrees about the bayonet from the other end: 0x46a891 forces the aim
 * angle to zero for skills 3 BAYONET and 5 CATTLE PROD, so there is nothing for an
 * aim view to show. A blade is `movement + melee` and no more.
 */
export type WeaponLayer = 'none' | 'skill' | 'melee' | 'gun' | 'lob' | 'charge'

/** Whether this layer has an aim view — a set where the walk POINTS instead. */
export const layerSights = (layer: WeaponLayer): boolean => layer === 'gun' || layer === 'lob'

/**
 * Whether the FIRE key does anything in this layer.
 *
 * `none` is the empty hand and nothing else, and play drew the line there: "пропуск
 * хода это не none — там есть реакция на f, а без оружия нет!" Right. SKIP TURN has
 * no weapon behind it and no aim view, but it is a skill in the hands and F uses it,
 * exactly as F uses anything else in them — so it gets a layer of its own rather
 * than being lumped in with holding nothing.
 */
export const layerFires = (layer: WeaponLayer): boolean => layer !== 'none'

/**
 * Which layer a skill brings. One list per kind, and the kinds are the three
 * tables the game already keys everything else off: the melee record
 * (`lib/game/melee.ts`), the projectile row (`projectile.ts`) and the lobbed row
 * (`grenade.ts`). Anything else — empty hands, SKIP TURN, a skill with no weapon
 * behind it — adds nothing to the movement set.
 */
export function weaponLayer(skill: number | null): WeaponLayer {
  if (skill === null) return 'none'
  if (meleeOf(skill)) return 'melee'
  // A PLANTED charge before a thrown one: TNT is a lobbed projectile in every
  // respect but the two that decide the control set — it has no gauge to hold and
  // no aim view to enter, because it goes at the pig's own feet
  // (lib/game/grenade.ts `isPlanted`). Its own layer is `movement + plant`.
  if (isPlanted(skill)) return 'charge'
  if (isLobbed(skill)) return 'lob'
  if (isGun(skill)) return 'gun'
  // A skill with no weapon behind it is still IN THE HANDS, and F uses it: SKIP
  // TURN is the one the game always offers. Empty hands are the only `none`.
  return 'skill'
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
  if (situation.armed) return 'armed'
  if (situation.locked) return 'locked'
  if (situation.sighting) return 'sights'
  return 'battle'
}

/**
 * Whether this frame's input is ANYTHING at all — which is the whole of what the
 * beat at the top of a turn ends on. The exe's own three ways out of it are a
 * timeout, "digital input" and the pause button (0x4d8a2c): it does not care
 * which key, and neither does this.
 *
 * It exists because input is POLLED now (`input/battleInput.ts`). A poll runs
 * whether the player touched anything or not, so without this gate the beat is
 * resolved on the first frame of every turn and never seen. `verbs` is how many
 * one-shot presses arrived this frame — a held key shows up in `held` instead,
 * and either counts.
 *
 * **What the caller passes is what went DOWN this frame, not what is down** —
 * "press any key", and the press is the operative word. A key still held through
 * the handover of a turn is not a press, and letting one through meant ending a
 * turn with SKIP TURN ate the next pig's beat with the very same finger.
 */
export function wakes(held: Held, verbs: number): boolean {
  return (
    verbs > 0 ||
    held.walk !== 0 ||
    held.turn !== 0 ||
    held.aim !== 0 ||
    held.firing ||
    held.sighting
  )
}

const STILL: Intent = {
  walk: 0,
  turn: 0,
  aim: 0,
  sighting: false,
  firing: false,
  fired: false,
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
 * - **armed**: the fire key and nothing else again, for the other reason — a
 *   second press sets off what is already in the air. Play found this one the
 *   moment `locked` stopped letting fire through: "пока граната летит — не могу
 *   взорвать её."
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
  // The two sets whose only business is the fire button.
  if (mode === 'charging' || mode === 'armed') {
    return { ...STILL, firing: held.firing, fired: held.fired }
  }
  if (mode === 'locked' || mode === 'starting') return { ...STILL }
  if (mode === 'sights') {
    return {
      walk: 0,
      turn: held.turn,
      aim: held.aim !== 0 ? held.aim : held.walk,
      sighting: true,
      firing: held.firing,
      fired: held.fired,
      cursor: { x: 0, y: 0 }
    }
  }
  return {
    walk: held.walk,
    turn: held.turn,
    aim: held.aim,
    sighting: false,
    firing: held.firing,
    fired: held.fired,
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
  | 'holdSkipTurn'

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
  if (mode === 'locked' || mode === 'charging' || mode === 'armed') {
    // The one thing either of them answers, and it is the level's opening drop:
    // the jump key cuts the canopy and brings the crate down now.
    if (action === 'jump') return 'cutChute'
    return null
  }
  // The aim view takes the jump away and nothing else: the exe reaches no jump
  // from its own input branch while the bit is down (0x4928dc).
  if (action === 'jump') return mode === 'sights' ? null : 'jump'
  // The inventory cannot be opened from the aim view — play: "инвентарь работает
  // во время прицеливания", and it should not.
  if (action === 'skills') return mode === 'sights' ? null : 'openInventory'
  /**
   * Ending a turn is a SKILL, and it goes in the pig's HANDS like any other.
   *
   * Play, twice: "закончить ход вообще можно только через умение", then "пропуск
   * хода должен применяться на стрелять — а не на выборе". So choosing 65 SKIP
   * TURN out of the menu only takes it in hand — the pig stands there thinking
   * about it — and the FIRE key is what applies it. Which also gives it a pose
   * like a weapon's, since that is what holding a skill means here.
   *
   * The Enter key is gone with it: nothing but the menu and the dashboard's own
   * button reaches this now.
   */
  if (action === 'endTurn') return 'holdSkipTurn'
  return null
}
