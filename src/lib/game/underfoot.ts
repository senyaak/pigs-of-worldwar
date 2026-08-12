// WHAT A PIG IS STANDING ON, when it is not the ground.
//
// A footstep asks the world one question — which of the thirteen `FT_*` files
// to play — and in the exe that question has exactly one answer: the TILE the
// pig is over. `0x475010` masks the tile's type byte with `0x1F` and jumps
// through a twelve-entry table (`SURFACE_SOUNDS` in `audio/battle.ts`), and it
// reads nothing else. There is no object under the hoof anywhere in it.
//
// **So the original walks a bridge to the sound of what is under the bridge**,
// and the shipped data says the same thing twice over (`objects/deck-tiles.js`
// in the disasm repo, both measurements):
//
//   - Under the 1183 tiles the bridge pieces of all 61 maps stand on there is
//     grass, water, stone, sand, snow, ice and lava — and not one tile of
//     type 3. Crossing ISLAND's spans, the exe plays `FT_WATER`.
//   - Type 3 WOOD and type 2 METAL do not occur in ANY shipped map: over all
//     249 856 tiles the histogram is 0, 1, 4, 5, 6, 7, 8, 9 and 11 only. Two
//     of the exe's own twelve arms are unreachable, and `FT_WOOD.wav` (bank
//     index 26) ships without ever being played.
//
// The other end of that thread is closed too. `0x4767a0` / `0x4768c0` — the
// only mechanism seen that writes tile values at runtime — save and restore
// the 3×3 block around a PIG of class 4, 5..7 or 0x0E and end by testing bit
// 0x40 on each of them: that is the MINE reveal, not a prop stamping its own
// material into the map.
//
// **`[CHECK — remake]`: a bridge sounds like WOOD here.** Nothing was read and
// nobody has ruled it; it stands because a wooden deck that splashes is the
// original's own oversight and the bank ships the file for it. The whole of
// the divergence is the table below — one line to drop, and one line to make a
// piece stone instead.
//
// The alphabet is the TILE's, not the bank's: this module answers in terrain
// types, `audio/battle.ts` turns those into a file, and no rule in `lib/game`
// has ever known a sound's name (lib/game/events.ts).

import { isWalkway } from './ramps'

/** Terrain type 3 — `esi=0x1A FT_WOOD`, the arm at 0x475128. */
export const WOOD = 3

/**
 * The DECKS: the flat spans a bridge is walked along, which are ordinary
 * shape-0 boxes and so were in the collision world from the start — the six
 * bodiless pieces `isWalkway` names are only its ramps and abutments
 * (lib/game/ramps.ts).
 *
 * Measured over all 61 maps, and they are decks by their own extents: every
 * one is 64 units thick — a plank — against footprints of 512 or 1024.
 * `BRID2_S2` is the odd name, a 512-cube that carries a collider where its
 * `BRID2_S` twin does not.
 */
const DECKS = new Set([
  'BRIDGE_C',
  'BRIDG_C2',
  'BRID2_C',
  'BRID2_C1',
  'BRID2C3',
  'BRID2_S2'
])

/**
 * What one record's own upper face sounds like, or null for "ask the ground".
 *
 * Null is the honest answer for everything else on a map: a crate, a wall top,
 * a pillbox roof. Each of those is a separate ruling, and none of them was
 * asked for.
 */
export function surfaceOf(name: string): number | null {
  const upper = name.toUpperCase()
  return isWalkway(upper) || DECKS.has(upper) ? WOOD : null
}
