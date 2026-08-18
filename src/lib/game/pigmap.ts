// THE PIG MAP's data — the world map's sites, the regions, the flag stands.
//
// Every table here is the exe's, read 2026-08-18 (`pigmap/notes.md` in the
// disasm repo): one array at 0x4D3658 rules the map — 25 campaign SITES, six
// region BANNERS, six region PAGES — with the flag stands at 0x4D4AC0, the
// zoom's easing at 0x4D4A40, the marker's bob at 0x4D4B88 and the nation
// colours at 0x4D34E0. Pure: names and numbers, no art and no screen.
//
// A SITE is a campaign POSITION 1..25 — the training ground (position 0) is
// not on the map, and the exe gates the whole sequence off it. Site row i is
// position i+1 throughout.

/** One thing on the world map: its art entry (PMAPTIMS/LANGTIMS) and where
 * it sits on the 640×480 BigMap. */
export interface MapPiece {
  art: string
  x: number
  y: number
}

/** The 25 campaign sites, row i = position i+1 (0x4D3658 rows 0..24). The
 * art is the site's territory patch, tinted by the nation holding it. */
export const SITES: readonly MapPiece[] = [
  { art: 'hog2', x: 92, y: 159 },
  { art: 'hog4', x: 140, y: 256 },
  { art: 'hog3', x: 99, y: 233 },
  { art: 'hog5', x: 155, y: 183 },
  { art: 'hog1', x: 136, y: 113 },
  { art: 'sau4', x: 239, y: 166 },
  { art: 'sau2', x: 248, y: 110 },
  { art: 'sau5', x: 210, y: 189 },
  { art: 'sau1', x: 196, y: 113 },
  { art: 'sau3', x: 266, y: 165 },
  { art: 'trot5', x: 267, y: 256 },
  { art: 'trot1', x: 242, y: 242 },
  { art: 'trot3', x: 198, y: 285 },
  { art: 'trot4', x: 217, y: 326 },
  { art: 'trot2', x: 241, y: 265 },
  { art: 'bel4', x: 370, y: 185 },
  { art: 'bel3', x: 302, y: 198 },
  { art: 'bel2', x: 309, y: 159 },
  { art: 'bel1', x: 312, y: 109 },
  { art: 'bel5', x: 345, y: 94 },
  { art: 'ars4', x: 446, y: 169 },
  { art: 'ars3', x: 426, y: 254 },
  { art: 'ars1', x: 410, y: 168 },
  { art: 'ars2', x: 406, y: 215 },
  { art: 'ios', x: 498, y: 189 }
]

/** The six region name banners (LANGTIMS entries — localized art, which is
 * why they live in Language). Rows 25..30. */
export const BANNERS: readonly MapPiece[] = [
  { art: 'hogshead', x: 129, y: 230 },
  { art: 'saustral', x: 209, y: 170 },
  { art: 'trotsvil', x: 226, y: 284 },
  { art: 'bellyopo', x: 320, y: 148 },
  { art: 'arstria', x: 414, y: 209 },
  { art: 'isleofsw', x: 476, y: 173 }
]

export interface RegionPage extends MapPiece {
  width: number
  height: number
}

/** The six region close-ups: the archive each page lives in (a one-TIM MAD),
 * where the page draws, and its size (rows 31..36 + the pair table
 * 0x4D4A00). The `art` doubles as the archive stem: `<art>.mad` holds
 * `<art>.tim`. */
export const REGION_PAGES: readonly RegionPage[] = [
  { art: 'hogphy', x: 226, y: 81, width: 250, height: 322 },
  { art: 'sauphy', x: 321, y: 84, width: 250, height: 319 },
  { art: 'trophy', x: 330, y: 193, width: 250, height: 250 },
  { art: 'belphy', x: 10, y: 99, width: 294, height: 291 },
  { art: 'arsphy', x: 481, y: 86, width: 150, height: 326 },
  { art: 'iosphy', x: 334, y: 160, width: 150, height: 150 }
]

/** Which region a POSITION belongs to — `(pos−1)/5`, with position 25 alone
 * in the Isle of Swine (the exe's switch at 0x483A00). */
export const regionOf = (position: number): number =>
  position >= 25 ? 5 : Math.floor((position - 1) / 5)

/** The positions a REGION spans, [from, to) — the region view plants a pole
 * for each (0x4833F1). Arstria has FOUR: position 25 stands alone on the
 * Isle of Swine. */
export const regionSpan = (region: number): [number, number] =>
  region === 5 ? [25, 26] : region === 4 ? [21, 25] : [region * 5 + 1, region * 5 + 6]

/** Where a flag STANDS on its region page — (dx,dy) off the page's origin,
 * row i = position i+1 (0x4D4AC0). The flag art draws at (dx−8, dy−62), the
 * pole at the same corner. */
export const FLAG_STANDS: readonly (readonly [number, number])[] = [
  [88, 159], [154, 310], [70, 270], [175, 231], [135, 123],
  [153, 239], [177, 105], [93, 279], [77, 159], [207, 244],
  [203, 128], [155, 55], [69, 168], [104, 219], [145, 147],
  [156, 199], [85, 225], [54, 167], [103, 83], [171, 119],
  [123, 99], [89, 253], [56, 71], [63, 169], [72, 92]
]

/** The zoom's easing, in percent — 32 steps of 50 ms (0x4D4A40). */
export const ZOOM_EASING: readonly number[] = [
  0, 1, 2, 3, 5, 7, 9, 0xb, 0xe, 0x11, 0x14, 0x17, 0x1b, 0x1f, 0x23, 0x27,
  0x2c, 0x31, 0x36, 0x3b, 0x41, 0x47, 0x4d, 0x53, 0x5a, 0x61, 100, 100, 100,
  100, 100, 100
]

/** The current-mission marker's bob, ping-ponged (0x4D4B88). */
export const MARKER_WAVE: readonly number[] = [0, 1, 2, 4, 7, 12]

/**
 * The nation colours, in the exe's ART order (0x4D34E0): england, usa,
 * france, germany, russia, japan, Team Lard, and the brown "nobody". The
 * frontend's nation index goes through `ART_OF` first — the same
 * {0,2,1,4,5,3,6} map 0x4508E0 applies everywhere art is picked by nation.
 */
export const NATION_COLOURS: readonly (readonly [number, number, number])[] = [
  [0x27, 0xaa, 0x69],
  [0x8f, 0xac, 0xd4],
  [0x6e, 0x7d, 0xc3],
  [0x82, 0x82, 0x82],
  [0xd6, 0x7b, 0x85],
  [0xcd, 0xbb, 0x62],
  [0x9e, 0x2e, 0x9e],
  [0x6d, 0x38, 0x20]
]

const ART_OF = [0, 2, 1, 4, 5, 3, 6] as const

/** A nation's map colour — the frontend index in, the tint out. Anything
 * out of range is the brown "nobody". */
export const nationColour = (nation: number): readonly [number, number, number] =>
  NATION_COLOURS[ART_OF[nation] ?? 7] ?? NATION_COLOURS[7]

/** A nation's ART index — what picks `level1n%d.bmp` and every other
 * nation-numbered art (0x4508E0's own map). */
export const nationArt = (nation: number): number => ART_OF[nation] ?? 6
