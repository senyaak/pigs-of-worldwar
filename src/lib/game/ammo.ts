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
// Pure: names only.

/**
 * Models the ENGINE spawns that no map record places, so the map loader would
 * never reach them on its own.
 *
 * Only what is both read out of the name table AND drawn by the remake goes in
 * here — a list of everything in the AMMO run would load 55 models for the two
 * that are used.
 */
export const SPAWNED_MODELS = ['WE_APMIN']

/** The model a mine on the ground wears: rows 428 and 429 of the name table,
 * both `WE_APMIN`, out of the MAP's archive. */
export const TRIPPED_MINE_MODEL = 'WE_APMIN'
