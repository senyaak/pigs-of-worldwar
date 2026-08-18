// A nation, and the SKIN it wears — two different numbers, and the game
// converts between them constantly.
//
// **The NATION index** is what SELECT TEAM writes and what the save keeps
// (`team+0x28E`): 0 British, 1 French, 2 American, 3 Russian, 4 Japanese,
// 5 German, 6 Team Lard. It is the order `fetext` names them in
// (lib/game/teams.ts) and the order the frontend's rows sit in.
//
// **The SKIN index** is what every piece of ART is picked by — the uniform
// archive, the hat mesh, the marker colour, the briefing paper: 0 British,
// 1 American, 2 French, 3 German, 4 Russian, 5 Japanese, 6 Lard.
//
// The converter is one function in the exe, `Team::SkinOf` at **0x4508E0**,
// and it builds the same seven bytes on the stack every time it runs. Twenty
// call sites go through it. Anything out of range becomes Lard, which is how
// the `100` an uninitialised team record carries (0x48228D) renders.
//
// Pure: numbers in, numbers out.

/** How many nations a player can be. Team Lard is past them and is not one. */
export const NATIONS = 6
/** Team Lard — the developers' own side, and the last mission's enemy. */
export const LARD = 6

/** `Team::SkinOf`'s own table, 0x4508F6..0x450914. */
const SKIN_OF = [0, 2, 1, 4, 5, 3, 6] as const

/**
 * A nation's skin index. Out of range is Lard, exactly as the exe clamps
 * (`if (n < 0 || n >= 7) n = 6` at 0x450919).
 */
export const skinOf = (nation: number): number => SKIN_OF[nation] ?? LARD

/**
 * The uniform archives, **indexed by SKIN** — the exe's own pointer table at
 * 0x4D51F0, whose one reader is 0x4861D5.
 *
 * All seven hold the same 120 entries under the same names at the same sizes,
 * and 105 of the 110 that differ from the British ones differ only in their
 * CLUT: a nation is a repaint, not a redraw. Measured across the install; only
 * a handful of pieces (the ace's tunic, and some German headgear) are actually
 * drawn again.
 */
export const SKIN_ARCHIVES: readonly string[] = [
  'Chars/british.mtd',
  'Chars/AMERICAN.MTD',
  'Chars/FRENCH.MTD',
  'Chars/GERMAN.MTD',
  'Chars/RUSSIAN.MTD',
  'Chars/JAPANESE.MTD',
  'Chars/TEAMLARD.MTD'
]

/**
 * The hat MESH for each skin, `Chars/FHATS.MAD` in its own archive order —
 * which IS the skin order, and the exe indexes the cached array
 * (0x51BC80..0x51BC9B) by the skin straight (0x440D7F).
 *
 * It only hangs on model type 2, i.e. classes 1, 2 and 3, which is the family
 * the exe gives a bare head to (three/frontendPig.ts carries the same read).
 */
export const SKIN_HATS: readonly string[] = ['br_hat', 'am_h', 'frhelm', 'germh', 'rus_h', 'ja_ban', 'pur_hat']

/**
 * The marker colour a pig's side is drawn in, **indexed by SKIN** — the exe's
 * table at 0x4C2E78, six entries of three `int16`, whose one reader is
 * `Pig::Draw` at 0x440BD8 through `[pig+0x1E4]`, and that field holds the skin.
 *
 * **There are six and there is no Lard colour**; reading a seventh would pull
 * the padding after the table. The library keeps its own copy for the map's
 * blips (`lib/game/scanner.ts`) which agrees hue for hue and differs only in
 * being brighter for British and German.
 */
export const SKIN_COLOURS: readonly (readonly [number, number, number])[] = [
  [0, 128, 0],
  [96, 255, 255],
  [0, 0, 255],
  [128, 128, 128],
  [255, 0, 0],
  [255, 255, 0]
]

/**
 * Who the training ground fields against you.
 *
 * `StartBattle` (0x41A320) special-cases the boot camp before it touches the
 * schedule at all: `if (map == 10) enemy = (own + 1) % 6` (0x41A409). Every
 * other mission takes its enemy from the save's own list (lib/game/enemies.ts).
 */
export const bootCampEnemy = (nation: number): number => (nation + 1) % NATIONS
