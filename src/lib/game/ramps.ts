// The RAMP pieces, and the one thing that is special about them: they are
// drawn TILTED a quarter of a right angle, and the record says nothing about
// it.
//
// A ramp's art is authored lying down. `BRID2_S` — CAMP's second bridge, the
// one the tutorial raises — is a triangular prism 1451 × 1028 model units
// with a flat face, a 45° face and a third face that carries NO geometry at
// all. Placed as the record reads it, that flat face is horizontal and the
// piece is a slab with a keel hanging under it. Turned −45° about its own Z
// the flat face becomes the SLOPE, the 45° face becomes the vertical wall at
// the top end, and the unfaced side becomes the bottom — which is why it was
// never modelled: it is under the ground.
//
// **Nothing in the exe has been found that applies this**, and that is worth
// saying twice. `Map::Load` reads field 5 and no other angle — ten sites read
// `[record+0x2A]` and not one reads `+0x28` or `+0x2C` (the stored pitch and
// roll, zero on every shipped record anyway) — and both the ramps and the
// abutments that must NOT tilt go through the same constructor arm
// (0x4a5987, types 0x1C..0x17B). An object does carry a full 3×3 orientation
// matrix, handed to the library as one (0x45e110), so a tilt is representable;
// where it is written is not found. The rule below is therefore MEASURED off
// the shipped maps, and it is measured four independent ways:
//
//  1. **The family is exactly the models whose art is off its own origin.**
//     Over all 61 map archives, seven models have a vertical extent that does
//     not straddle y = 0 while every other prop's does — and those seven are
//     the list below. `objects/notes.md` established from all 6322 records
//     that the stored y IS the model's centre, so those seven are the only
//     ones drawn in some other orientation. −45° centres every one of them.
//  2. **The sign is pinned by the big three.** `STR06PPP`, `W1R06PPP` and
//     `SNR05PPP` are not symmetric: −45° centres them (y ±809, and 809 is
//     1144/√2), +45° leaves them 141 units off. The symmetric wedges take the
//     same turn.
//  3. **CAMP's second bridge then fits to the unit.** Deck top 2240; ramp one
//     runs 2240 → 1728 across x 3072..3584, ramp two 1728 → 1216 across
//     3584..4096, and 1216 is the ground there. The four `M1S_SU03` legs that
//     arrive with them stand 1216..1728 under exactly the first ramp's
//     footprint — they are the underside it needs and nothing else explains
//     them. Untilted, the pieces are 725 wide against a 512 spacing, overlap
//     each other, and their tops sit 256 BELOW the deck.
//  4. **ISLAND says it again, six more times.** Every ramp there has its high
//     end at elevation 640, which is the deck's own top surface, and a
//     footprint that butts the deck end exactly — with yaw picking which way
//     it climbs, +z at yaw 0 and −z at 2048, at both ends of two bridges.
//
// The high end is the model's own **+x**, before the yaw turns it.

/**
 * The turn a ramp piece is drawn with, about the model's OWN z axis, applied
 * INSIDE the yaw: `R_y(modelRotationY(yaw)) · R_z(RAMP_TILT)`.
 *
 * Model space is Y-down like every other model (CLAUDE.md), so this is the
 * turn that lifts the model's +x end.
 */
export const RAMP_TILT = -Math.PI / 4

/**
 * The models drawn tilted, by the name a POG record pairs them with.
 *
 * Every one is a field-11 shape of 1 — the bodiless "bridge and step piece"
 * kind — and they are seven of that kind's nine names. The two that are NOT
 * here are `BRIDGE_S`, the flat-topped abutment whose top is already level
 * with its deck (CAMP: 1477 + 256 against a deck top of 1728), and `D_BRID`;
 * both are centred on their origin as they stand, so nothing turns them.
 */
const TILTED = new Set([
  // The ▽ prisms, 1451 × 1028 model units — 512 × 512 world once turned.
  'BRID2_S', // CAMP, ISLAND, LAKE, OASIS
  'M1S_ST01', // DEMO2, ICEFLOW, SEPIA1
  'STS_ST01', // RIDGE
  'BRR02PPP', // RUMBLE — the same prism, bevelled
  // The long ones, 2288 wide: 1618 × 1618 world once turned.
  'STR06PPP', // MASHED
  'W1R06PPP', // BAY
  'SNR05PPP' // DEMO2, ICEFLOW
])

/** Whether this model's art is authored lying down and drawn tilted. */
export const isRamp = (name: string): boolean => TILTED.has(name.toUpperCase())
