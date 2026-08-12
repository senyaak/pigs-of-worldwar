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

/** The mood's index, `sunny` for anything the table does not name — the `GEN*`
 * six and any file a player points the remake at. The exe has no such
 * fallback: a map with no record cannot be reached from its menus. */
const moodOf = (map: string): number => MAP_SKY[map.toUpperCase()] ?? 6

/**
 * The sky archive a map wears.
 */
export function skyArchiveFor(map: string): string {
  return SKY_ARCHIVES[moodOf(map)]
}

export interface SkyFog {
  /** World units from the EYE where the haze starts and where it is total.
   * D3D's `FOGSTART`/`FOGEND` under `FOGTABLEMODE = D3DFOG_LINEAR`, which is
   * three's `Fog` exactly. */
  near: number
  far: number
  /** The colour everything fades into, 0..255. */
  color: readonly [number, number, number]
}

/**
 * The haze each mood hangs over the ground — the `switch` on the same index at
 * 0x4856A6, one arm per mood, through the jump table at 0x485ED4. Each arm
 * writes near to `[+0x4A4]`, far to `[+0x4A8]` and R/G/B to `[+0x498..+0x4A0]`;
 * 0x4859A4 then packs them ARGB and calls `afSetFog(on, near, far, argb)`.
 *
 * **The units are the WORLD's, and it is worth knowing why.** `afSetFog`
 * (`_d3d.dll` 0x100096F0) does four `SetRenderState` calls and nothing else:
 * `0x1C` FOGENABLE, `0x22` FOGCOLOR, `0x23` FOGTABLEMODE = 3 (LINEAR), then
 * `0x24` FOGSTART and `0x25` FOGEND with the caller's floats passed straight
 * through. Values like 238.0 and 4048.0 cannot be device z, which is 0..1, so
 * the fog is eye-relative — and the library's own reset writes 30000.0 into
 * both, which is just past the diagonal of a 16384-unit map. So the original
 * really does bury everything past EIGHT TILES, and that is most of why its
 * screenshots show so much sky over so little ground.
 *
 * `[exe]`. `sky/notes.md` has the table arm by arm.
 */
export const SKY_FOG: readonly SkyFog[] = [
  { near: 238, far: 4524, color: [248, 248, 248] }, // 0 cold — a white-out
  { near: 238, far: 3571, color: [252, 192, 116] }, // 1 desert — sand in the air
  { near: 238, far: 2749, color: [0, 0, 0] }, // 2 night — the dark IS the fog
  { near: 238, far: 2749, color: [0, 0, 0] }, // 3 night
  { near: 238, far: 2749, color: [0, 0, 0] }, // 4 night
  { near: 425, far: 2125, color: [143, 175, 205] }, // 5 ominous — the thickest, and the only one that starts late
  { near: 238, far: 4048, color: [208, 215, 224] }, // 6 sunny
  { near: 238, far: 4048, color: [229, 191, 128] }, // 7 sunrise
  { near: 238, far: 4048, color: [255, 208, 159] }, // 8 sunset
  { near: 238, far: 4048, color: [192, 255, 255] }, // 9 toy
  { near: 238, far: 2749, color: [0, 0, 0] } // 10 space
]

/** The haze a map stands in. */
export function skyFogFor(map: string): SkyFog {
  return SKY_FOG[moodOf(map)]
}
