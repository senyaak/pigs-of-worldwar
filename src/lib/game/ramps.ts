// The bridge and step pieces — the 94 records that carry collision shape kind
// ONE, which is the exe building mass properties and no collider at all. Two
// things about them live here, and both are measurements off the shipped maps
// rather than reads: which of them are drawn TILTED (below), and which of them
// a pig can WALK on (`isWalkway`, at the end).
//
// The RAMPS first, and the one thing that is special about them: they are
// drawn TILTED half a right angle, and no field in the record says so.
//
// A ramp's art is authored lying down. `BRID2_S` — CAMP's second bridge, the
// one the tutorial raises — is a triangular prism 1451 × 1028 model units
// with a flat face, a 45° face and a third side that carries NO geometry at
// all. Placed as the record reads it, that flat face is horizontal and the
// piece is a slab with a keel hanging under it. Turned **−45° about its own
// z** the flat face becomes the SLOPE, the 45° face becomes the vertical wall
// at the top end, and the unfaced side becomes the bottom — which is why it
// was never modelled: it is under the ground. That last point is also the
// SIGN: at +45° the unfaced side stands up as a wall and a modelled face goes
// underground instead.
//
// **Nothing in the exe has been found that applies this**, and that is worth
// saying twice. `Map::Load` reads field 5 and no other angle — ten sites read
// `[record+0x2A]` and not one reads `+0x28` or `+0x2C`, the stored pitch and
// roll, which are zero on every shipped record anyway — and both the ramps
// and the abutments that must NOT tilt go through the same constructor arm
// (0x4a5987, types 0x1C..0x17B). An object does carry a full 3×3 orientation,
// handed to the library as one (0x45e110), so a tilt is representable; where
// it would be written is not found. `objects/notes.md` has the search.
//
// So the rule is MEASURED, and the measurement that decides it is the
// record's OWN COLLISION BOX — fields 8-10, which the exe reads as the
// collider's extents (0x4a6236). Over every shape-1 record on all 61 maps,
// the box matches one orientation of the art and misses the other by about
// 360 units, and there is no in-between case:
//
//     model      box (x,y,z)   flat art       tilted art     off by
//     BRID2_S    512,512,512   726,365,514    512,514,514    363 / 4
//     M1S_ST01   512,512,256   724,362,256    512,512,256    362 / 0
//     STS_ST01   512,512,256   724,362,256    512,512,256    362 / 0
//     BRR02PPP   512,512,1024  724,407,1056   512,512,1056   349 / 32
//     BRIDGE_S   512,512,512   513,512,512    363,724,512      1 / 361
//     D_BRID     512,512,512   512,512,512    362,724,512      0 / 362
//     STR06PPP   1024,512,2048 1144,516,2080  991,809,2080   156 / 362
//     W1R06PPP   1024,512,2048 1144,516,2080  991,809,2080   156 / 362
//     SNR05PPP   1024,512,1024 1144,516,1056  991,809,1056   156 / 362
//
// The four at the top are the ramps: their box's y extent is the RISE and its
// x extent the RUN, which is what a 45° slope's bounding box is. The five
// below are drawn as they stand — `BRIDGE_S` and `D_BRID` are the flat-topped
// abutments, and the three long ones are ARCH bridges whose deck is at the
// origin with the arch hanging below, which is why their art sits off its own
// centre without being tilted.
//
// Two placements then fit to the unit, and they are what pin the sign:
//
//  - **CAMP's second bridge.** Deck top 2240; the two `BRID2_S` run
//    2240 → 1728 over x 3072..3584 and 1728 → 1216 over 3584..4096, and 1216
//    is the terrain there. The four `M1S_SU03` legs that arrive in the same
//    script group stand 1216..1728 under exactly the first piece's footprint —
//    they are the underside it needs, and nothing else explains them.
//    Untilted the pieces are 725 across a 512 spacing, overlap by 213, and
//    their tops sit 256 BELOW the deck.
//  - **ISLAND's twelve.** Each tops out at its own deck's walking surface,
//    with a footprint butting the deck end, and the yaw picks which way it
//    climbs — 0 climbs +z, 2048 −z, 1024 +x, 3072 −x. At +45° every one of
//    them would climb away from its deck.
//
// `e2e/002/ramp.spec.ts` pins all of it.

/**
 * The turn a ramp piece is drawn with, about the model's OWN z axis, applied
 * INSIDE the yaw: `R_y(modelRotationY(yaw)) · R_z(RAMP_TILT)`.
 *
 * Model space is Y-down like every other model (CLAUDE.md), so this is the
 * turn that lifts the model's +x end — and the model's +x is the HIGH end.
 */
export const RAMP_TILT = -Math.PI / 4

/**
 * The models drawn tilted, by the name a POG record pairs them with.
 *
 * All four are field-11 shape 1 — the bodiless "bridge and step piece" kind —
 * and they are four of that kind's nine names. Which four is the box table
 * above; it is a measurement and not a read, so a name here is a claim about
 * the shipped art rather than about the exe.
 */
const TILTED = new Set([
  // The ▽ prism, 1451 model units across: 512 run × 512 rise once turned.
  'BRID2_S', // CAMP, ISLAND, LAKE, OASIS — 512 deep
  'M1S_ST01', // DEMO2, ICEFLOW, SEPIA1 — 256 deep
  'STS_ST01', // RIDGE — the same piece under another name
  'BRR02PPP' // RUMBLE — the same prism, bevelled, 1024 deep
])

/** Whether this model's art is authored lying down and drawn tilted. */
export const isRamp = (name: string): boolean => TILTED.has(name.toUpperCase())

/**
 * The bodiless pieces a pig can WALK on, by the same kind of measurement.
 *
 * Nothing in the exe puts these in its collision world — kind 1 is no collider
 * — so a remake that wants a bridge walked over has to say which face is the
 * walkway. The record's box is the obvious candidate and it turns out to be
 * exactly right for six of the nine, and exactly wrong for the other three.
 * Per model, the top of the box against the top of the ART, both measured up
 * from the record's own y:
 *
 *     BRID2_S  M1S_ST01  STS_ST01  BRR02PPP  BRIDGE_S  D_BRID    +256 / +256
 *     STR06PPP  W1R06PPP  SNR05PPP                              +57.5 / +256
 *
 * So the six are pieces whose collider IS the surface they draw, and the box
 * can be walked on as it stands — the four ramps with a top that climbs across
 * it (`isRamp`), `BRIDGE_S` and `D_BRID` flat, which is what makes them the
 * ABUTMENTS at a bridge's ends: their top lands within 4 units of the deck
 * sections beside them (CAMP: 1724 and 1733 against 1728).
 *
 * **The three that are left are ARCH bridges and are still fallen through.**
 * Their deck is 198.5 units BELOW the box's own face, so walking them on the
 * box would hold a pig in the air over the arch. What they want is a collider
 * taken off the art rather than off the record, and nobody has played MASHED,
 * BAY or ICEFLOW to say what else is wrong with them first.
 */
const WALKWAYS = new Set([...TILTED, 'BRIDGE_S', 'D_BRID'])

/** Whether this bodiless piece's own box is the surface it draws. */
export const isWalkway = (name: string): boolean => WALKWAYS.has(name.toUpperCase())
