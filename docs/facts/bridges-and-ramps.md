# Bridges and ramps

- `[measured]` **A RAMP is drawn TILTED 45°, and no record says so.** Its art
  is authored lying down: `BRID2_S` is a triangular prism with a flat face, a
  45° face and a third side carrying no geometry at all. Turned −45° about its
  own z the flat face becomes the SLOPE, the 45° face the wall at the top end,
  and the unfaced side the bottom — which is why it was never modelled. Nothing
  in the exe applies this and the search is written up in `lib/game/ramps.ts`:
  `Map::Load` reads field 5 and no other angle (ten sites read `[record+0x2A]`,
  none `+0x28`/`+0x2C`), and the ramps and the abutments that must NOT tilt
  share one constructor arm. So the rule is MEASURED, and what decides it is
  the record's OWN COLLISION BOX: over every shape-kind-1 record on all 61 maps
  the box's y extent lands within 4 units of one orientation of the art and 105
  or more off the other, with nothing in between. Four models come out tilted —
  `BRID2_S`, `M1S_ST01`, `STS_ST01`, `BRR02PPP` — and for each the box's y IS
  the rise and its x the run, so the collider a ramp wants is that box with a
  sloped top. The five that stay flat are the abutments `BRIDGE_S` and `D_BRID`
  and three ARCH bridges (`STR06PPP`, `W1R06PPP`, `SNR05PPP`), whose deck is at
  the origin with the arch hanging below — which is why "art off its own
  centre" is NOT the test, though it looks like one. The SIGN is the unfaced
  side going underground, and the maps agree twice: CAMP's second bridge runs
  2240 → 1728 → 1216 onto its own ground with its four `M1S_SU03` legs filling
  1216..1728 under exactly the first piece, and ISLAND's twelve ramps each top
  out at their deck's own walking surface with the yaw picking which way they
  climb. Untilted the pieces are 725 across a 512 spacing, overlap by 213, and
  sit 256 BELOW the deck. `e2e/002/ramp.spec.ts` pins all of it.
- `[deliberate]` **A RAMP is WALKED UP, and the SHAPE it is walked on is the
  remake's own — the exe's answer is FOUND (2026-09-15, `objects/notes.md`,
  the field-11 correction).** In the original a field-11 = 1 piece (every
  bridge, every ramp, every step) is an ELLIPSOID body the size of its own
  box, built by `Object::MakeCollider`'s second stage (0x4AAAD4, class
  0x4BC070 — the same class as the pig's own sphere) and swept like any
  object, so the walk climbs it through the step-up. A deck in the original
  is therefore the top of an ellipsoid, not a plane; the remake's
  box-with-a-sloped-top is the smoother stand-in and stays. The 3×3 block of
  TILE values once suspected of letting an object touch the ground is the MINE
  REVEAL (`[obj+0x182]`, `Map::SetTile`, 0x4767a0 / 0x4768c0 / 0x476ba5), not
  this. The remake's shape comes off the record: a ramp joins the collision
  world with the box the record carries and a top that CLIMBS across it,
  `bottom` at the box's local −x end to `top` at its +x (`sloped` in
  `lib/game/obstacles.ts`). The ordinary step-up envelope then walks it, and
  three things had to give first, each of them the same mistake — measuring
  against the ground the pig is over rather than the surface it is ON:
  - **the pig's own radius is not applied to a ramp.** Its body reaches 160
    ahead of its feet and 160 up a 45° slope is 160 higher, so a cylinder both
    stalls it 212 short of the join and pops it up onto a piece it is not over.
    A slope holds a pig up by its FEET.
  - **anything flush with a ramp is not a wall.** Same 160: a support pillar
    and the deck at the top both read as walls from a stride away. The test is
    the surface at the box's own EDGE, where the pig will be standing when it
    touches (`rampLeadsTo`). What it costs is that a pig walks THROUGH the
    pillars under a bridge.
  - **standing on a walkway is open footing, and it is not the ground.** CAMP's
    bridge crosses tiles the map flags WALL — the plateau's own edge — so
    `freeY` measured off the terrain refused the last step onto the plateau,
    the wedge counter threw the pig off the deck after 25 frames, and the
    scrabble clip played the whole way across. ISLAND's spans are all over
    open WATER, so a pig on the deck swam: the swim clip, the 16-a-frame cap
    and the waterline for a resting height, forty feet up. Every one of those
    now asks what the pig is standing on (`standing` in
    `lib/game/locomotion.ts`).

  `e2e/002/ramp.spec.ts` walks CAMP's own bridge end to end, 1216 to 2240,
  and ISLAND's from the beach onto a deck over water.
- `[CHECK — remake]` **A BRIDGE is walked over too**, and the same measurement
  says which pieces carry it. For six of the nine bodiless models the box's
  upper face is exactly the face the ART draws (+256 on both, off by 0.0); for
  the three ARCH bridges the deck is 198.5 units below the box's own face. So
  the six join the collision world on their own box — the four ramps sloped,
  `BRIDGE_S` and `D_BRID` flat, which is what makes them the abutments at a
  bridge's ends (CAMP: tops of 1724 and 1733 against deck sections at 1728).
  Play found this the way it finds everything: "мост который идёт дальше после
  рампы — без коллизии, проваливаюсь под него." Three more things followed, and
  all three were the same mistake once more — asking the LANDSCAPE about a pig
  that is not on it:
  - **the step-up envelope is measured from where the step ENDS**, never lower
    than the pig's own feet. Walking up a bank at something level with the crest
    the two differ by the slope times the pig's radius, and CAMP's abutment came
    out 65 against an envelope of 64 — a wall by one unit.
  - **what holds a pig up is its own BOX resting on something** — the 320 the
    spawn markers give it — so it is held while any part of it is over the edge,
    the way a box on a ledge is. That was tried the other way, by the feet
    alone, and the TUTORIAL says no: the gap is 512, a running jump carries 303,
    and by the feet the step is impossible at any launch the exe gives, while by
    the box it is 512 less 160 either side. The cost is that a pig stands up to
    160 out over a drop before it falls, which is what a box on a ledge does in
    a solver that cannot tip it. A RAMP is still held by the feet — see
    `wallReachOf`.
  - **whether a pig is IN the water is the ENGINE's to say**, not the tile's.
    Two other domains were asking the landscape and both got it wrong the moment
    CAMP's deck crossed the water line: the bank played a SPLASH and the camera
    dropped its subject by `SWIM_SINK` and lurched. `swimming` is one field on
    the locomotion state now, and `three/chase.ts` and `audio/battle.ts` read
    that one number.
  - **the FALL look-ahead is the landscape's**, and it is wrong both ways over a
    bridge, so `step` takes a `supported` predicate now (`lib/game/movement.ts`)
    and the walk-off case is `locomotion`'s. Crossing the ditch the ground falls
    away under every step, and the pig launched itself off a drop it was
    standing over; walking off the far end the ground below reads level, and it
    snapped 650 units down into the water without ever leaving its feet.

    **The launch off the LIP is the one that survived a first pass**, and it is
    worth knowing why: CAMP's abutment tops out at 1724 against a bank crest of
    1722, so a pig stepping off the lip left the ground TWO units under the deck
    — and a body in flight only lands on what is below it, so it sailed over the
    abutment and into the ditch. It also only happens at the ENGINE's step: at
    1/60 a stride is 13 units and at the 1/15 the other locomotion specs drive
    with it is 52, which steps clean over the two-unit window. Every walk in
    `e2e/002/ramp.spec.ts` therefore runs at `STEP_SECONDS`, and the bridge one
    fails without the fix.
- `[CHECK — remake]` **A BRIDGE SOUNDS LIKE WOOD, and the exe has no such
  sound to give.** `Pig::Footstep` (0x475010) reads the pig's TILE and nothing
  else, and measured over the shipped Maps folder there is **no tile of type 3
  or type 2 on any of the 61 maps** — two arms of its own twelve-way switch are
  unreachable and `FT_WOOD` ships unplayed, while the 1183 tiles under the
  bridge pieces are grass, stone, water, sand, snow, lava and ice. So the
  original crosses a deck to the sound of the ditch and splashes over ISLAND's
  spans. Nothing stamps a tile at runtime either: the 3×3 `Map::SetTile` block
  that looked like it might is the MINE REVEAL, on a pig of class 4, 5..7 or
  0x0E. `lib/game/underfoot.ts` is the whole divergence — a name table, and
  `Obstruction.underfoot` asking `standing`'s own question for a material.
  Correct it in play; a piece becomes stone in one line.
- `[gap]` **The three ARCH bridges are still fallen through** — `STR06PPP` on
  MASHED, `W1R06PPP` on BAY, `SNR05PPP` on DEMO2 and ICEFLOW. Their collider is
  198.5 above the deck they draw, so walking them on the box would hold a pig
  in the air; what they want is a surface taken off the ART. Nobody has played
  those maps yet to say what else is wrong with them first.
- `[measured]` **The GAP in CAMP's first bridge is real, stays, and is
  JUMPABLE.** Nothing covers x −1536..−1024 between its two deck sections, so
  the walk ends in the air — which is what the tutorial's own JUMP THE GAP line
  is for (`gtext` clip 18, `tutorial/notes.md`). It has to be taken from the
  lip: the spec walks to −1163, jumps, and lands at −1504 on the far deck.

  **The jump's own numbers are not the problem and were re-read to be sure.**
  The forward impulse fires ONCE, on frame three exactly — `[esi+0x20C]` counts
  the frames of the fall and `cmp eax,3; jne` skips every other one (0x46e93e),
  then `0x4A9260(0x30, 0, heading, 0)` is one kick along the facing. So a
  running jump carries 303 units and a standing one 167, and no reading of the
  exe makes it 512. What makes the gap possible is being held up by the box.
