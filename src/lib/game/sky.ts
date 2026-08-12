// Which sky a map wears, and what the original hangs it on.
//
// Not a rule — a TABLE, and the exe's own. It sits in `lib/` because all three
// sides need it: `main/assets.ts` to know which archive to read, `three/sky.ts`
// to draw it, `ui/battle.ts` to ask for it.
//
// **The sky is a MODEL, not the `Skys/` folder.** That folder ships paired
// `.PMG`/`.PTG` per mood and nothing in `warhogs_.exe` names it — the PC build
// draws `Chars/SKYDOME.MAD`, a 32-segment hemisphere of radius 15778 in eight
// rings, and a second copy of it mirrored below the horizon (`skydomeu`). The
// loader is 0x4866B0: it reads `chars\<mood>.mad` for the four 250×250 TIMs
// that skin it, looks `chars\skydome.mad` up in the map archive, builds one
// object off each 72-byte record (three archive entries: VTX, NO2, FAC), sets
// both at the origin and scales them (0x100000, 0x80000, 0x100000) against
// `afScaleObj`'s unity of 4096 — 256× across and 128× up, so the dome is
// authored round and drawn SQUASHED to half height.
//
// Everything here is `[exe]`. The disasm repo's `sky/notes.md` carries the
// addresses and the fog table that comes with it.

/** The eleven `chars\<name>.mad` archives the sky index picks between, in the
 * exe's own order (the stack table built at 0x4866B0). Indices 2, 3 and 4 are
 * all `night1`, and 9/10 (`toy`, `space`) have no folder under `Skys/`. */
export const SKY_ARCHIVES = [
  'coldsky',
  'desert',
  'night1',
  'night1',
  'night1',
  'ominous',
  'sunny',
  'sunrise',
  'sunset',
  'toy',
  'space'
] as const

/**
 * Every map's sky index.
 *
 * Two parallel tables in the exe say it: the map NAMES at 0x4D1990 and the
 * 53 mission records at 0x4D5210, 60 bytes each, whose first dword is the
 * index — `Map::Load` is handed the record's address (0x4854A8) and the
 * battle's setup reads field 0 out of it for the sky, the fog and the
 * weather alike (0x485577 onward). The campaign indexes the record table by
 * the same id as the name table (0x41A552); a skirmish searches it for the
 * first record carrying the sky the player picked (0x41A51D), which is what
 * makes field 0 a KEY as well as a value.
 *
 * The six `GEN*` maps run past the end of the record table and have no entry.
 */
export const MAP_SKY: Record<string, number> = {
  ROAD: 6,
  TRENCH: 5,
  RUMBLE: 6,
  DEVI: 1,
  TWIN: 7,
  ZULUS: 7,
  SNIPER: 8,
  GUNS: 1,
  OASIS: 8,
  MASHED: 6,
  CAMP: 0,
  LIBERATE: 7,
  MEDIX: 5,
  FJORDS: 0,
  EYRIE: 8,
  BRIDGE: 6,
  BAY: 2,
  DESVAL: 1,
  SNAKE: 0,
  EMPLACE: 5,
  KEEP: 0,
  SUPLINE: 6,
  TESTER: 1,
  FOOT: 0,
  FINAL: 5,
  ESTU: 6,
  DEMO: 1,
  BOOM: 1,
  BHILL: 7,
  LECPROD: 0,
  DVAL: 6,
  ICE: 0,
  BUTE: 10,
  MAZE: 6,
  SEPIA1: 6,
  DBOWL: 1,
  MLAKE: 0,
  CMASS: 10,
  ARTGUN: 6,
  DVAL2: 5,
  HELL3: 1,
  HELL2: 1,
  LUNAR1: 10,
  CREEPY2: 2,
  PLAY1: 9,
  PLAY2: 9,
  ICEFLOW: 0,
  RIDGE: 8,
  ARCHI: 8,
  DEMO2: 0,
  ISLAND: 7,
  LAKE: 7,
  ONEWAY: 1
}

/**
 * The sky archive a map wears — `sunny` for anything the table does not name,
 * which is the `GEN*` six and any file a player points the remake at.
 *
 * The exe has no such fallback: a map with no record simply cannot be reached
 * from its menus. Sunny is the remake's own pick and nothing rests on it.
 */
export function skyArchiveFor(map: string): string {
  const index = MAP_SKY[map.toUpperCase()]
  return SKY_ARCHIVES[index ?? 6]
}
