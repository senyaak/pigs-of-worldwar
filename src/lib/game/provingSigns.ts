// What a proving-ground signpost wears on its board: a skill's menu icon, on a
// black field the shape of the board.
//
// The original has no proving ground, so the LOOK of the sign is the remake's
// own (docs/facts/proving-ground.md). Two measured facts shape it. The icons are
// 56×34 with their black fields punched out (`punchBlack`, lib/formats/alpha.ts),
// and a board that took them as they are would have holes in it where the alpha
// test cuts the keyed texels, so the field goes back in. The SIGN's board is
// square (376×377 model units, `Maps/CAMP.MAD`) and its faces map a whole
// texture, so the field is square and the icon keeps its proportions in the
// middle of it.
//
// Pure: pixels in, pixels out.

/** The pixels of an image, top row first. */
export interface BoardImage {
  name: string
  width: number
  height: number
  rgba: Uint8Array
}

/** The icon centred on an opaque black square as wide as it is. The art keeps
 * the icon's name, which is what the drawn material answers to. */
export function signBoardArt(icon: BoardImage): BoardImage {
  const side = icon.width
  const rgba = new Uint8Array(side * side * 4)
  for (let at = 3; at < rgba.length; at += 4) rgba[at] = 255
  const top = Math.floor((side - icon.height) / 2)
  for (let y = 0; y < icon.height; y++) {
    for (let x = 0; x < icon.width; x++) {
      const from = (y * icon.width + x) * 4
      if (icon.rgba[from + 3] === 0) continue
      const to = ((top + y) * side + x) * 4
      rgba[to] = icon.rgba[from]
      rgba[to + 1] = icon.rgba[from + 1]
      rgba[to + 2] = icon.rgba[from + 2]
    }
  }
  return { name: icon.name, width: side, height: side, rgba }
}
