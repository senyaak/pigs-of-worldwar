# Why the numbers are what they are

The reasoning, the false starts and the play sessions behind the constants
CLAUDE.md now states flatly. Kept because a number without its argument gets
"fixed" by the next person who reads the disassembly, and twice it already was.

History, not instructions. This was the "Traps that cost real time" section of
CLAUDE.md until 2026-08-12, when it was cut back to the facts.

## The section as it stood

**Two coordinate systems, and they disagree.** Models (VTX) are **Y-down**.
PMG terrain heights are **elevation, up-positive** — the opposite. The whole
map rendered upside-down for several commits, coherently enough that
auto-framed screenshots hid it; water sitting at the *small* height values is
what gave it away. Everything in the engine works in the game's Y-down space
and converts once, at the top, with a 180° X-rotation on a wrapping group —
never `scale.y = -1`, which mirrors handedness and breaks winding and
animation.

**MCAP rotations**: `local = Rx(-x) · Ry(-y) · Rz(-z)`, parent-relative,
XYZ order. how-doc calls them quaternions; they are not. The negation is the
subtle part — the game's matrices are row-major, the transpose of three's.
Legs look fine either way (their bind direction is already down), so **only
the arms reveal a sign error**. Full derivation with three proof scripts:
`anim/notes.md`.

**A model is drawn at HALF size — `MODEL_SCALE`, and it is a literal pushed
86 times.** The body constructor (exe 0x45de90) stores its last three
arguments at +0x60/+0x64/+0x68 and hands them to the library's `afScaleObj`
(0x45e443); that function's unity is 4096 and eight sites pass it, while 86
— the POG loader and the pig code alike — pass `0x800`. 2048/4096 = 0.5.
The archive says the same without any disassembly: at 1:1 every prop is
buried (DUMMY −259, CRATE1 −94, IRONGATE −380, the STW walls −256), at ½
they land on the ground (−2, +1, +2, 0). Full trail in `lib/game/scale.ts`.
The POG's collision box follows it — its unit is 64 world units, not 128 —
and that unit lives in ONE place (`formats/pog.ts`); a second copy in
`game/obstacles.ts` is what once left a pig radius 320 among halved boxes
and quietly dropped every prop out of the collision world.

**The model faces +X**, hence `PIG_HEADING_OFFSET = -π/2`, and play confirms
it: a driven pig walks the way it is facing, which is what that offset aims.
That matters because a SPAWN MARKER disagrees with it by exactly half a
turn. A marker is a POG record, and the engine turns every record by ONE yaw
about the vertical (exe 0x4a5bd5 pushes field 5 and no other angle), so a
marker should ask for the same `yaw - π/2` a prop does and a spawn heading
should be `yaw` outright — in play the pig then stands backwards. With the
offset settled by the walk, the half turn is the MARKER's own:
`spawns.ts` carries `yaw + π` and a marker's stored yaw simply does not mean
what a prop's does. Not an open question.

**The collision boxes do not work, and that is known.** Parked deliberately,
not overlooked — the size and the turn are right (`formats/pog.ts`,
`game/obstacles.ts`) but the behaviour is not, and it is its own job.

**`FRAME_SECONDS` is 1/15, and moving it is the WRONG lever.** The request is 64, `Pig::Walk` takes `sar eax,4` of it times the
class's 13 for 52 units a frame, and a tile is 512 — all read off the exe.
The rate is not in the disassembly at all: the exe imports `timeGetTime` and
reaches it the same indirect way it reaches the animation library, so no call
site says how long a frame is. It was 1/30 and halved because against a pig at
half scale that walk read as a sprint.

Play then said the walk was slightly slow, and this is where it went wrong: both
1/20 and 1/25 were tried and both came back — "всё таки както быстро", then "и
вообще сама игра будто быстрее стала — это не что надо было". That second line
IS the rule. This number is not the walking speed; it is the rate of everything
counted in frames, so turning it up takes the turn, the jump's hang, the swing's
wind-up, the aim's ramp, the parachute and the wedge counter with it. **A walk
that reads slow is the WALK's own number**, and it has one now: `WALK_SCALE` in
`lib/game/movement.ts`, on the forward and back speeds only, and it is **4/3 —
1040 a second, two tiles**. Play looked at 5/3 (1300, the walk the 1/25
experiment had, once the rest of the game was no longer coming with it) and came
back to 4/3. Both ends have been seen now; do not re-propose either. The
exe's 52 a frame is untouched underneath, and every relation that hangs off the
stride still does — the running jump leaves faster because `Pig::Walk`'s own
`|nDist|/2` says so, and `LOOK_AHEAD` grows with the step because the original
looks one step ahead. If a per-frame DURATION reads wrong, it is that duration's
own number that is wrong. Everything else counts
FRAMES and is untouched. Cost: the jump hangs longer in seconds, and
`JUMP_RISE = √MODEL_SCALE` in `locomotion.ts` is the remake's own correction
so a hop stays the same fraction of a pig it always was.

**Do not write a wall-clock duration into a spec that drives a walk.** Every
figure of the "three seconds, not 1.5" kind goes stale the next time this number
moves, and it goes stale QUIETLY: `e2e/002/obstacles.spec.ts` kept passing a pig
that had already scraped round the corner it was meant to be stopped at. Size a
drive by the DISTANCE it has to cover (`APPROACH`, `AROUND` there).

**25 Hz is an INFERENCE, and this is the whole of it.** Three durations come out
round at 25 and awkward at anything else: the turn clock is authored in
HUNDREDTHS (a table of whole seconds ×100 at 0x4309fb), which wants a per-frame
decrement dividing 100 — 4 at 25 Hz, 3.33 at 30; the crush counter's 250 frames
is exactly ten seconds; the wedge counter's 25 and the jump's own 25-frame bail
(0x46e95d) are exactly one. 25 is also the rate the clips are drawn at and the
PAL field rate halved, this being a PlayStation port. What is NOT read is any
call site: the exe reaches `timeGetTime` the same indirect way it reaches the
animation library.

**Model UVs do NOT flip V.** They used to, "because TIM rows are top-down" —
but the texture uploads with `flipY = false`, so data row 0 is already v = 0
and the flip was a second one on top of nothing. Every model wore its
texture upside down; the map's firs gave it away, being billboards with the
whole tree painted on them, trunk and all.

**`HEIGHT_SCALE` is the one vertical knob, and it is 1 against the exe.**
The exe doubles the PMG heights in three places — collision sampler,
`afAdjustMapHeights` in `_d3d.dll`, the map's own bounds — and its loader
copies them in untouched, all verified. But a doubled CAMP plays as a
mountain range and reads as stretched next to the original, so the remaster
renders 1×. Do not "fix" this back from the disassembly alone; the
contradiction is written up in `movement/notes.md`. There IS
now a candidate for what undoes it — the models are drawn at half size, so
the "reads as stretched" judgement was made against a pig twice the size it
should be, and halved models plus doubled heights would stand a pig four
times smaller against the relief. It is NOT taken, and this is no longer
an untried idea: it was checked in play against the half-scale models and it
still breaks the map. Leave `HEIGHT_SCALE` at 1 and do not re-propose the
doubling — it changes the TERRAIN, which is a separate decision from the
size of a model, and play has already answered it. Vertical constants lifted
from the exe go through `fromExeY`, so they follow the knob.

**Terrain height never refuses a step — and a wall is not a full stop
either.** The exe pins a pig to the landscape however steep; open ground of
any slope is walked. A wall tile gets exactly the step-up ENVELOPE: a pig
may be carried into blocked ground up to 128 exe units above its last free
footing (`WALL_CLIMB`) and no further, then it sidesteps along or stalls
while the wedge counter (25 frames) throws it out DOWNHILL — walls are not
ladders (confirmed against play), but neither are they blockers. Refusing
blocked tiles outright was tried and it walled pigs IN on top of cliffs — a
cliff lip is a wall tile too; the envelope is measured from the pig's own
footing, so the lip is always in reach from above. All of it lives in
`lib/game/locomotion.ts`, pinned by `e2e/002/locomotion.spec.ts`.

**Never compare a tile's type byte whole.** The terrain type is its LOW 5
BITS (`and edx,1Fh`, exe 0x46fde4); the bits above are water/mine/wall
flags. 1857 of the shipped maps' 1865 climbing tiles are 0x2b, not 0x0b —
an unmasked `=== 11` never fires, which is how Scramble went missing. The
water bit is only a PREFILTER too — the verdict comes from the ART
(`afIsPointWatery`), so mud banks with the bit set are LAND. See
`movement/notes.md`.

**Water is art the artist made SEE-THROUGH — palette bit 0x8000, the PSX's
semi-transparency flag.** A texel is water where ITS colour carries the bit,
and `afIsPointWatery` short-cuts that with a per-TEXTURE kind the library
computes at upload (dll 0x10007b6c): all colours translucent → water
outright, none → solid outright, a mix → read the texels. The shipped art
is authored to it — open water carries sixteen translucent colours, a shore
texture splits its palette and paints the water half in the translucent ones
— so the shoreline lives INSIDE its tile and the ice beside a pond is the
opaque art. `lib/game/watermask.ts` is that rule and `three/terrain.ts`
punches its shore cutouts with the same test, so what looks like water
swims. `formats/tim.ts` keeps the raw CLUT and every texel's index for it:
the decoded rgba drops the bit.

The chain is decoded end to end: the CLUT is classified at upload, a MIXED
texture then has its translucent texels punched to zero on the way to the
surface (dll 0x10007d79), and the probe reads those holes back. Two dead
ends someone will re-derive on the way. Learning water COLOURS off the map
works by accident and flickers mid-swim. Collapsing the mixed case to
"solid" — because the probe wants a zero texel and no shipped TIM has one —
turns a pond's own RIM into ground and lets a pig walk out over the water;
the zeroes are in the SURFACE, not the TIM.

**The ground carries its own light, and the engine must not add one.** Each
PMG vertex stores a brightness byte (how-doc: "unknown ≤255") that the
original modulates the tile texture by, Gouraud across the triangle — which
is the whole reason its hills look rounded rather than faceted. It fits a
light pointing straight up with almost no ambient (ARCHI R² 0.81), and
neighbouring blocks store the same value on the vertices they share, so the
gradient is continuous over the whole map. `three/terrain.ts` draws it unlit,
texture × shade, with the shade converted to linear first; lighting those
polygons again — especially with the per-face normals `computeVertexNormals`
gives split vertices — is exactly the faceting it replaces.

**A block's world position is its PLACE in the file, and A FILE ROW RUNS
−z.** `Map::Load` (exe 0x4a5635) overwrites both stored offsets with
`(col - 8) * 2048` and `(row - 8) * 2048`, and the x agrees with everything
downstream — but the z does not mean what it looks like. The two sites that
actually USE a coordinate both count the row the other way and neither
reads that field: `Map::SampleHeight` takes `row = (-z + 0x4000) >> 9`, and
`afSetMap` (dll 0x100024c0) walks the cell array BACKWARD, from one row past
its end, while the z it writes climbs from -16384. Cell row r sits at
`z = 16384 - 512*r`.

Getting that backwards builds the whole world MIRRORED, which hides
perfectly — mesh, collision, props and spawns mirror together, so nothing
internal can tell — and is visible only against the original, where play
says our maps came out the wrong way round. `parsePmg` mirrors the row once
(block `15 - R`, vertex rows `4 - r`, tile rows `3 - r`) so that every
consumer keeps the simple rule: vertices run +x with the column AND +z with
the row. `terrain/mirror.js` is the proof — 0 of 4096 cells
disagree with `SampleHeight` on nine maps, against ~3500 the other way.

Three things follow, and each is the same mirror leaving: the POG's z takes
**no** negation (the 343-unit fit `objects/notes.md` measured for `-z` is
the identical fit for `+z` once the terrain is right — and confirmed by
READING since: the exe pushes the record's x/y/z into the constructor
untouched), and `WALL_SHAPES` is the exe's jump
table read literally, mirror-free.

**A map does not place the same things in every game.** The low byte of a
record's flags word is which player counts it exists in — the loader drops
it otherwise (exe 0x4a58cb) — and BOOM is what that is for: one side reads
as ten pigs until the byte splits them into the campaign's five snipers and
the skirmish's five grunts, standing on the same five spots. The battle
filters by its own number of sides before anything else looks at the list.

**The POG stores true world coordinates.** A map's objects are
paired to geometry in the map's own `.MAD` **by name**, their stored z is
used as it stands (see the block rule above — the negation this once
carried was the mirror), and their
stored y is an ELEVATION of the model's CENTRE — so props hover their own
half-height above the ground by design (and it rides `HEIGHT_SCALE`, like
the ground). The turn is `phi = yaw − π/2`, and **CAMP's iron gate is what
pins it**: two records of the SAME model 1280 apart along z at yaws 1024 and
3072, so a half turn out reads as the two leaves having swapped sides. Note
the gate cannot test the SIGN — 90° and 270° give the same rotation either
way — so it pins the quarter and nothing else. The training dummy is NOT
evidence any more: after the map was un-mirrored it was recalculated from
the mirror hypothesis rather than re-measured, and under the gate's rule it
faces away from its path. Two tests that look decisive are backwards —
walls near a long prop are the ones it CROSSES, and a bridge ramp climbs
over the ditch, so its high end is above the LOW ground. Every name that
fails to resolve ends in `_ME`: those records are the pig SPAWN markers,
with the class in `type`. See `objects/notes.md`.

**`MapTileSlip` is not slip** — it is which half or diagonal of a wall tile
is solid, read by `Map::IsBlocked` and by nothing else.

**The tile's rotate/flip byte is one flip bit and a 0..3 turn COUNT**, bits
1-2, not how-doc's two independent flags, and the flip is applied BEFORE the
turn. The four UVs are a ring round the quad: the byte mirrors ring slots
0↔1 and 2↔3, then each corner takes the slot `rot` places round. Unturned,
the texture lands u along +x and v along +z, v being the texture row.

**The turn's direction is the one thing here measured, not read.** (And
with the map un-mirrored the residual has MOVED: composed against the
reindexed rows the table equals the DLL's forward shift with the texture's
**v** complemented, so the unfound flip is now an ordinary top-down /
bottom-up v convention rather than a reversed rotation — a likelier place
for a real bug in the TIM → page path, and the next thing to look at.) The
disassembly composes to a forward shift; the shipped maps say backward, and
the half-turn settles it — it is its own opposite, so it cannot be got
wrong, and the quarter-turns have to land on its side (883 steep tiles,
`terrain/turn.js`). A reversal enters somewhere between
`0x100010f2` and our pixels and has NOT been found; everything around it
reads clean twice over. So: the table is pinned byte by byte in
`e2e/000/terrain-viewer.spec.ts` — do not tune it by eye, and do not make it
a setting (tried; the engine has one behaviour) — but if the missing flip
ever turns up, that sign is where it lands.

**A tile is two triangles, not a bilinear patch**, split along
(col+1,row)-(col,row+1) — the same diagonal the mesh uses, so collision and
visuals are the same surface. `TerrainQuery.patch` returns that plane, which
is also what gives an exact slide direction; differencing across the crease
gives a direction that is downhill on neither side.

**The animation library is `Data/_d3d.dll`**, not the exe — the exe resolves
`afDrawAnimModel` and friends via `GetProcAddress`. Hunting skeletal maths in
`warhogs_.exe` is a dead end (recorded in the notes).

**Clip indices come from the exe's own CALL SITES**, not from its name
table: 0 run, 3 walk back, 4 turn on spot, 5 swim, 8-10 jump, 11 scramble,
27/28 idle, 47-50 dying/drowning. The debug name table agrees with every one
of those and is still not the authority — it lists 59 names where the code
reaches 83 clips, and its LAST name is wrong: the exe parachutes with clip
**82**, not the 58 it calls "Parachuting". Run the skeleton forward and 82
is the hands-above-the-shoulders hang while 58 ranks 92nd of 93 for it. So
read a clip off `ANIM` in `lib/game/locomotion.ts` (each entry cites the
