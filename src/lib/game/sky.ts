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
  /** Distance from the EYE, WORLD units, where the haze starts and where it is
   * total — the exe's own pair times `FOG_SCALE`. */
  near: number
  far: number
  /** The colour everything fades into, 0..255. The exe's, untouched. */
  color: readonly [number, number, number]
}

/**
 * **The exe's fog distances are the LIBRARY's units, not the world's, and the
 * factor between them is not decoded.** This is what stands in for it.
 *
 * The arm at 0x4856A6 hands `afSetFog` 238 out to 2125..4524, and `afSetFog`
 * passes those to D3D as `FOGSTART`/`FOGEND` under `FOGTABLEMODE =
 * D3DFOG_LINEAR` — eye-relative, linear, which is three's `Fog` exactly. Taking
 * them for world units was tried and is WRONG on sight: it buries a
 * 16384-unit map inside eight tiles and hazes the acting pig. What says so
 * besides the picture is the projection `afSetFog` sets in the same breath
 * (`SetTransform(D3DTRANSFORMSTATE_PROJECTION)`, the matrix built at
 * `_d3d.dll` 0x10009660): **zn = 100, zf = 500**, against a map 16384 across.
 * Vertices reach the library already scaled down, so its z is not ours.
 *
 * Eight is `[play]`: the original shows a light haze about half a map out and
 * nothing near the pig, and this is the one number that sets that. The exe's
 * per-mood COLOURS and the ratios between the moods are its own and untouched.
 * If the factor is ever read out of the transform path, this constant is where
 * it goes.
 */
export const FOG_SCALE = 8

const arm = (near: number, far: number, color: readonly [number, number, number]): SkyFog => ({
  near: near * FOG_SCALE,
  far: far * FOG_SCALE,
  color
})

/**
 * The haze each mood hangs over the ground — the `switch` on the same index at
 * 0x4856A6, one arm per mood, through the jump table at 0x485ED4. Each arm
 * writes near to `[+0x4A4]`, far to `[+0x4A8]` and R/G/B to `[+0x498..+0x4A0]`;
 * 0x4859A4 packs them ARGB and calls `afSetFog(on, near, far, argb)`.
 *
 * `[exe]` for every number below, `[play]` for `FOG_SCALE` on the distances.
 * `sky/notes.md` has the table arm by arm.
 */
export const SKY_FOG: readonly SkyFog[] = [
  arm(238, 4524, [248, 248, 248]), // 0 cold — the farthest of the lot
  arm(238, 3571, [252, 192, 116]), // 1 desert — sand in the air
  arm(238, 2749, [0, 0, 0]), // 2 night — the dark IS the fog
  arm(238, 2749, [0, 0, 0]), // 3 night
  arm(238, 2749, [0, 0, 0]), // 4 night
  arm(425, 2125, [143, 175, 205]), // 5 ominous — the thickest, and the only one that starts late
  arm(238, 4048, [208, 215, 224]), // 6 sunny
  arm(238, 4048, [229, 191, 128]), // 7 sunrise
  arm(238, 4048, [255, 208, 159]), // 8 sunset
  arm(238, 4048, [192, 255, 255]), // 9 toy
  arm(238, 2749, [0, 0, 0]) // 10 space
]

/** The haze a map stands in. */
export function skyFogFor(map: string): SkyFog {
  return SKY_FOG[moodOf(map)]
}
