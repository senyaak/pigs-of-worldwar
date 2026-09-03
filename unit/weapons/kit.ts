// The WEAPONS suite's shared harness — one press of the fire key, answered by
// the REAL ladder.
//
// **Why the real one.** The bug this suite exists for is silent: a skill with
// no row in any of the four classification tables falls out of the bottom of
// `attack.ts` into the melee default, which answers `false` for anything
// without a blade — so the fire key does nothing, spends no round, ends no
// turn and says nothing at all. 28 MORTAR sat in two shipped kits like that,
// and 51 SUICIDE in three. A test that re-implemented the ladder would have
// agreed with itself and caught neither, so `createAttack` is built here for
// real and only its LEAVES are stubbed. What each stub records is which door
// the press actually went through.
//
// The one leaf that is not a stub is the blade's: `swings.begin` answers off
// `meleeOf`, which is `melee.ts`'s own table rather than a copy of it, because
// "a skill with no weapon behind it" is exactly the verdict under test.
//
// Pure — no window, no Electron, no installed game, like everything in unit/.

import { Game } from '../../src/lib/game/game'
import { createAttack } from '../../src/lib/game/attack'
import { meleeOf } from '../../src/lib/game/melee'
import { isGun } from '../../src/lib/game/projectile'
import { CLASS_KIT, outfit } from '../../src/lib/game/kits'
import { SKILL_ICON } from '../../src/lib/game/skills'
import { amountOf } from '../../src/lib/game/inventory'
import type { Bullets } from '../../src/lib/game/bullets'
import type { Lobs } from '../../src/lib/game/lobs'
import type { Strikes } from '../../src/lib/game/strikes'
import type { Heals } from '../../src/lib/game/healing'
import type { Sights } from '../../src/lib/game/sights'
import type { Anim } from '../../src/lib/game/anim'
import type { Pig } from '../../src/lib/game/game'

/** The classes, by the name the repo uses for each — 0..16, the whole of
 * `CLASS_KIT`. 15 and 16 are past the fifteen ranks `fetext` names, so they
 * are called what `kits.ts` calls them. */
export const CLASS_NAMES = [
  'GRUNT',
  'GUNNER',
  'BOMBARDIER',
  'PYROTECH',
  'COMMANDO',
  'SAPPER',
  'ENGINEER',
  'SABOTEUR',
  'SCOUT',
  'SNIPER',
  'SPY',
  'ORDERLY',
  'MEDIC',
  'SURGEON',
  'HERO',
  'the one between HERO and ACE',
  'ACE'
]

/** `28 morter`, `51 suicide` — how this suite names a skill in a message, so
 * a failure says WHICH weapon rather than which number. */
export const skillLabel = (skill: number): string => `${skill} ${SKILL_ICON[skill] || '?'}`

/**
 * WHICH DOOR a press went through.
 *
 * Every one but `inert` is an answer; `inert` is the failure mode above and
 * the whole reason for the suite.
 */
export type Route =
  /** A blade — the ladder's own default, and the only one that reaches it. */
  | 'melee'
  /** A gun: the ten-frame fuse was lit. */
  | 'gun'
  /** Thrown or planted and loosed AT ONCE — no gauge to hold (a charge at the
   * feet, or the mortar, which has none). */
  | 'lob'
  /** …and the same family with a gauge: the press started it FILLING, and the
   * throw comes on the release. */
  | 'gauge'
  /** The four that answer the press themselves. */
  | 'heal'
  | 'steal'
  | 'hide'
  | 'sacrifice'
  /** SKIP TURN, which is always in the hands. */
  | 'skip'
  /** **Nothing happened.** No round, no turn, no sound. */
  | 'inert'

/** A pig of this class, carrying its own kit — `Game` builds it the way a
 * battle does, so the kit is `outfit`'s and not a fixture's invention. */
export function pigOf(pigClass: number): Pig {
  const game = new Game({
    players: [{ name: 'A', pigNames: ['one'] }],
    spawns: [{ x: 0, z: 0, heading: 0, pigClass }]
  })
  return game.players[0].pigs[0]
}

/**
 * Press FIRE with `skill` in hand and answer which door it went through.
 *
 * The pig is a real one of `pigClass` so its own kit is what it holds; a
 * skill it does not carry is put in its hand anyway, because what is under
 * test is the ladder and not the inventory.
 *
 * `seated` puts the pig in a MOUNT — a pillbox, in practice. It is the only
 * thing the emplaced skills 45..49 answer to: their arms bail unless the pig
 * is inside something (lib/game/barrel.ts, `isEmplaced`), so pressing one on
 * foot is `inert` by design rather than by omission.
 */
export function press(pigClass: number, skill: number, seated = false): Route {
  let route: Route | null = null
  const took = (which: Route) => (): boolean => {
    route = which
    return true
  }
  let barked = false
  const attack = createAttack({
    shots: { live: () => [] } as unknown as Bullets,
    // Nothing is in the air: a live grenade answers the button before the
    // ladder does, and that is a different test.
    grenades: { thrown: () => 0 } as unknown as Lobs,
    // NOT a stub: the blade's own table is the verdict under test.
    swings: {
      begin: (pig: Pig) => {
        const blade = meleeOf(pig.holding ?? -1) !== null
        if (blade) route = 'melee'
        return blade
      }
    } as unknown as Strikes,
    heals: { begin: took('heal') } as unknown as Heals,
    pockets: { begin: took('steal') },
    hides: { begin: took('hide') },
    sacrifice: { begin: took('sacrifice') },
    mines: { lay: () => true },
    sights: { refuse: () => {} } as unknown as Sights,
    // A barrel to fire from, when the pig is meant to be sitting at one. The
    // POINT is never used here — the ladder only asks whether there is one.
    mount: () => (seated ? { x: 0, y: 0, z: 0 } : null),
    anim: {} as unknown as Anim,
    clips: [],
    bark: () => {
      barked = true
    }
  })
  const pig = pigOf(pigClass)
  pig.holding = skill
  attack.press()
  const answered = attack.begin(pig, skill)
  if (answered === 'skip') return 'skip'
  if (answered === 'none') return route ?? 'inert'
  if (route) return route
  // Nothing named itself, so it was the gun or the thrown family. A GAUGE is
  // the one that can be seen from outside: the press only starts it filling,
  // and the throw comes on the release. Everything else armed the ten-frame
  // fuse, which is where the pig says its line — the `bark` above.
  if (attack.charging()) return 'gauge'
  if (!barked) return 'inert'
  // Which of the two armed it is a LABEL, not a verdict: the verdict — that
  // the press was answered at all — is already in `answered`.
  return isGun(skill) ? 'gun' : 'lob'
}

/** What a class carries, as `[skill, amount]` — the kit as the exe's record
 * has it, through the inventory's own rules. */
export const kitOf = (pigClass: number): [number, number][] =>
  CLASS_KIT[pigClass].map(([skill]) => [skill, amountOf(outfit(pigClass), skill)])

/** Just the skills, in the record's order. */
export const skillsOf = (pigClass: number): number[] => CLASS_KIT[pigClass].map(([skill]) => skill)

/**
 * What a PROMOTION into this class BUYS: the skills it has that `from` did
 * not, in the new class's own order.
 *
 * **And a promotion can also TAKE — the kits are not cumulative**, which is
 * the thing worth pinning per career. A SABOTEUR gives up the rifle bell for
 * the super rifle, a SNIPER gives up the rifle for the scope, and a SPY gives
 * up the SUICIDE its own predecessor carries. Every one of those is the exe's
 * record, so `lostOver` is beside this rather than an assertion that the list
 * is empty. */
export const gainedOver = (pigClass: number, from: number): number[] =>
  skillsOf(pigClass).filter((skill) => !skillsOf(from).includes(skill))

/** …and what it gives up, in the OLD class's order. */
export const lostOver = (pigClass: number, from: number): number[] =>
  skillsOf(from).filter((skill) => !skillsOf(pigClass).includes(skill))

/** Every skill at least one class carries, ascending. */
export const CARRIED: number[] = [
  ...new Set(CLASS_KIT.flatMap((kit) => kit.map(([skill]) => skill)))
].sort((a, b) => a - b)

/**
 * Every skill this class carries, against the door its press goes through —
 * the whole kit in one object, which is what each class's suite asserts.
 *
 * Asserting the WHOLE map rather than "nothing is inert" is deliberate: an
 * `inert` entry is written down where it happens, so building the weapon
 * turns this red and somebody has to come and delete the line. A test that
 * only counted failures would go quietly green instead, and nobody would
 * learn that the class was finished.
 */
export const routes = (pigClass: number): Record<string, Route> =>
  Object.fromEntries(skillsOf(pigClass).map((skill) => [skillLabel(skill), press(pigClass, skill)]))

