// What a PROJECTILE looks like — the model the engine hangs on the thing in the
// air, which is not the model that was in the hand.
//
// **The object name table settles it.** 0x4d9680 is 466 pointers to names, in
// groups fenced by `START_OF_`/`END_OF_` strings, and `START_OF_AMMO` is at 387:
// so a projectile row's id indexes it directly, which is why row 40 is id
// 0x1AC = 428 (`weapons/mines.md`). Reading the AMMO run off:
//
// ```
// 418 WE_ROLL   422 WE_ROCKT   426 WE_APMIN   430 WE_BAZZ   440 WE_BANG
// 419 WE_ROLL   423 WE_ROCKT   427 WE_APMIN   431 WE_BAZZ   441 WE_TNT2
// 420 WE_GRE2   424 BULL1      428 WE_APMIN   432 BULL1     442 BULL1
// 421 WE_SU_GR  425 WE_BALL    429 WE_APMIN   433 WE_BOMB
// ```
//
// **Rows 428 and 429 — the two mines a foot sets off — are `WE_APMIN`**, an
// anti-personnel mine of its own, and NOT the `WE_MINE` a pig carries. The
// remake drew the carried one because that was the only mine model it had a
// path to.
//
// The catch is where they live: `WE_APMIN`, `WE_GRE2`, `BULL1` and the rest of
// that run are not in `Chars/WEAPONS.MAD` at all — they are in **every map's own
// .MAD**, all 61 of them, beside the scenery. So a projectile's art comes off
// the map the same way a tree does, and `main/assets.ts` has to be told to load
// it: nothing in the .POG names it, so the loader's "one model per placed
// record" pass walks straight past.
//
// Pure: names only (plus the one pseudo-skill key the bomblet brings).

import { BOMBLET } from './grenade'

/**
 * Models the ENGINE spawns that no map record places, so the map loader would
 * never reach them on its own.
 *
 * Only what is both read out of the name table AND drawn by the remake goes in
 * here — a list of everything in the AMMO run would load 55 models for the two
 * that are used.
 */
// …and CRATE4, HIDE's fallback disguise (lib/game/hide.ts): the decoy is
// normally a model a record already placed — safe by construction — but a
// map with nothing disguisable near falls back to the crate, and a map that
// never PLACED one would spawn nothing, which is the exact silent failure
// the BOOTS entry below records.
// …WE_BALL, the MEDICINE BALL in flight (row 425), and WE_SU_GR, the
// cluster's BOMBLET (row 421) — thrown by the engine, placed by no record,
// so they take the same door.
export const SPAWNED_MODELS = ['WE_APMIN', 'WE_BAZZ', 'BOOTS', 'CRATE4', 'WE_BALL', 'WE_SU_GR']

/** What a finished death leaves on the spot (three/remains.ts). In every map's
 * own .MAD and in no .POG — exactly the case this list exists for: without the
 * entry the geometry was never parsed, `spawn('BOOTS')` answered null, and the
 * boots silently never appeared (play, 2026-08-23: "сапогов не осталось"). */
export const REMAINS_MODEL = 'BOOTS'

/**
 * The model a SKILL's projectile wears, by the same table — or null when the
 * remake has nothing better than the thing that was in the hand.
 *
 * Only the ones that are both read AND loaded go in here. The BAZOOKA's rocket
 * is row **398, `WE_BAZZ`**, and it matters twice over: what is in the hand for
 * skill 29 is `bazookr`, the LAUNCHER, so without this a fired rocket flew as a
 * second launcher.
 *
 * The grenade family's own is row 412, **`WE_GRE2`**, and it is deliberately NOT
 * here: it would change how every grenade in the game looks, nothing has asked
 * for it, and it is one line the day something does.
 */
// The MEDICINE BALL's flight is row **425, `WE_BALL`** — what is in the hand
// for skill 33 is its own held mesh (weapons.ts row +0x0C = 27), so without
// this the thrown ball flew as the held model. The BOMBLET (the cluster's
// child, `BOMBLET` in lib/game/grenade.ts) is row **421, `WE_SU_GR`** and has
// no held model at all — nobody ever carries one.
export const PROJECTILE_MODEL: Record<number, string> = {
  29: 'WE_BAZZ',
  33: 'WE_BALL',
  [BOMBLET]: 'WE_SU_GR'
}

/** What flies when this skill is fired, or null to fall back to the held model
 * (lib/game/weapons.ts). */
export const projectileModel = (skill: number | null): string | null =>
  skill === null ? null : (PROJECTILE_MODEL[skill] ?? null)

/** The model a mine on the ground wears: rows 428 and 429 of the name table,
 * both `WE_APMIN`, out of the MAP's archive. */
export const TRIPPED_MINE_MODEL = 'WE_APMIN'
