# A wall piece and its corner stones

What a map's wall model is made of, and how its joints are drawn. Measured with
one-off scripts over `Maps/CAMP.POG`, `CAMP.MAD` and `camp.mtd`, the survey over
every shipped map's `.POG`, `.MAD` and `.mtd`. The paint check is
`e2e/002/seams.spec.ts`.

- `[measured]` **A wall piece does not overlap its neighbour.** Its outer face runs
  exactly to the joint, and its ends are mitred inward: STW07PWW's outer face ends
  at x = −8704 and STW04_W_'s begins there. Round a corner the two mitres lie in
  one plane, inside the wall, where no eye reaches. The 64 units by which two
  pieces' bounding boxes overlap are not wall: they are the flank of the stones
  below.

- `[measured]` **Each end of a wall piece carries CORNER STONES**, a second quad
  on the wall's own outer plane, overlapping it. On the house they are `ST018` and
  `ST019`, 12×30 texels over 192×512 units. Their keyed texels leave 6 opaque columns
  (`....######..` and its mirror), lying over the wall's last 96 units; the flank
  hangs past the wall's end and paints nothing. The other wall families do the
  same with `BRIC018`/`019` and `MET018`/`019`.

- `[measured]` **A keyed group painted on an opaque one of its own model is a fact
  of the art across the game.** Counting a model once per map that places it, 77 of
  the 673 the shipped maps place have one; counting distinct names, 31 of 142. All
  of them are wall families: `ST`, `BR`, `M1` and `W1`. The models in `Chars/` have
  none. So the rule in `lib/formats/paintLayers.ts` is the art's and the geometry's,
  not a list of names, and not the model's group order: `M1W05PPP` lists its stones
  after its wall on five maps and before it on SEPIA1.

- `[measured]` **Two other kinds of group share a plane and overlap, and the art
  does not say which one the player sees.** Opaque on opaque: 18 of the 673, or 3 of
  the 142 names (`TANK`, `BIG_GUN`, `SWILL2`). Keyed on keyed: 116 of the 673, or 10
  of the 142 (`BUSH2`, `BUSH2H`, `TREEG`, `TREEGH`, `TREEGH1`, `TREEGH2`, `TREEPH`,
  `TREEPH1`, `TREEPH2`, `TREEW`). They get no bias and stay as they were, because a
  bias picks a winner: on OASIS's `TANK`, `TANK1011` over `TANK1001` turns the ends of
  the tracks from a light riveted plate with stipple at its edges to a dark face all
  over, 1 to 5100 pixels across 8 views. Without one, those 8 views match
  `polygonOffset: false` to the pixel. [#170](https://github.com/senyaak/pigs-of-worldwar/issues/170)
  owns them.

- `[play]` "Всё ещё текстуры странно себя ведут на стыках дома." **It was the
  stones against their OWN wall.** The two are different triangles in one plane, so
  each rounds its own depth at a pixel, and the wall's stone came through the corner
  stones in stripes and stipple that moved with the camera. It is worst on a wall
  seen at an angle and barely there on one seen face-on. A fixed draw order between
  records cannot reach this, since both faces are one record. `[measured]`, on a
  house drawn alone from 10 views, settling it changes 66 to 3831 pixels (3831 of
  277182 close at a corner, 878 of 151545 from chase range on the south face). On
  the canvas, of the spots of stones in the paint check's four looks at the joints,
  698 of 4623 showed the wall before and 0 after.

- `[measured]` **The two earlier suspects were measured and are not it.** Swapping
  every record's draw order moves 2 to 235 pixels, all of them the sliver described
  below, and the order is fixed for good, so nothing moves in play. Turning off
  minification's filtering moves no pixel at a joint: the change is on the wall tops,
  seen edge-on, and at close range it is 0 or 1 pixels. There is no atlas for a UV
  edge to bleed across here either: each TIM is its own texture, clamped.

- `[deliberate]` **The fix is a depth bias, ours.** A keyed group painted on an opaque
  one of its model's is pulled one layer toward the eye (`LAYER_DEPTH_STEPS`,
  `three/modelMesh.ts`), wherever the model lists it. Which face wins there is the
  art's own answer, since a texture's holes are there to show what is under it; how
  the original keeps the two apart is not read and need not be.

- `[gap]` **The stones reach about 3 units past the wall's end**, a fin 1 to 2
  pixels wide up the wall's full height, and that is the sliver at a joint where
  two pieces' stones overlap. It is the half texel in `three/modelMesh.ts`: 11
  texels' worth of UV is spread over the 192-unit quad, so the opaque column begins
  61 units along it and the wall ends at 64. How the original maps a prop's UV to
  its texture page has not been read, so the half texel stands.
  [house-stone-fin.md](../todo/house-stone-fin.md).
