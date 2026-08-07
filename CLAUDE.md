# Pigs of Worldwar — orientation

A fan remake of Gremlin's *Hogs of War* (2000) in Electron + Three.js +
TypeScript. It reads assets straight out of a legally installed copy; nothing
from the original is redistributed. This repo normally sits **inside** the
game folder, so `..` is the installation.

Start with [README.md](README.md) (how to play and run), then
[docs/testing.md](docs/testing.md) and [docs/formats.md](docs/formats.md).
Reverse-engineering findings live in a separate repo next door,
[`../pigs-disasm`](../pigs-disasm) — notes plus the scripts that prove them.

**Committing is standing permission, in both repos — do not ask.** Finish a
piece of work and commit it, with the attribution the global rules give
(author Senyaak, committer Claude via `GIT_COMMITTER_*`, no `Co-Authored-By`
trailer). Two things still apply: never `git add -A` over a tree you did not
leave — check `git status` first and stage only your own files, because work
in progress from another session lives here regularly — and pushing is a
separate question that is still worth asking.

## Traps that cost real time — do not rediscover these

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
`../pigs-disasm/anim/notes.md`.

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

**`FRAME_SECONDS` is 1/15, and it is the only free number in the speed
chain.** The request is 64, `Pig::Walk` takes `sar eax,4` of it times the
class's 13 for 52 units a frame, and a tile is 512 — all read off the exe.
The rate is not in the disassembly at all. It was 1/30; against a pig at
half scale that walk is a sprint, so it halved. Everything else counts
FRAMES and is untouched. Cost: the jump hangs twice as long in seconds, and
`JUMP_RISE = √MODEL_SCALE` in `locomotion.ts` is the remake's own correction
so a hop stays the same fraction of a pig it always was.

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
contradiction is written up in `../pigs-disasm/movement/notes.md`. There IS
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
`../pigs-disasm/movement/notes.md`.

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
the row. `../pigs-disasm/terrain/mirror.js` is the proof — 0 of 4096 cells
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
with the class in `type`. See `../pigs-disasm/objects/notes.md`.

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
`../pigs-disasm/terrain/turn.js`). A reversal enters somewhere between
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
site that plays it), never off the table. `../pigs-disasm/animations/notes.md`
and `../pigs-disasm/parachute/notes.md`.

## How the code is laid out

- `src/lib/formats/` — one pure reader per format (mad, tim, mgl, bmp, model,
  hir, mcap, pmg, ptg, pog, srl). No fs, no Electron, no three: they take
  bytes.
- `src/lib/game/` — the rules (`Game`, `TerrainQuery`, `movement`,
  `ballistics`). Pure too, so the domain specs drive them directly.
- `src/main/` — `index.ts` lifecycle only, `gameDir.ts` locating the install,
  `assets.ts` loading through the readers, `ipc.ts` the IPC surface.
- `src/renderer/src/` — `ui/` one module per view, `audio/` the sound banks,
  `input/` the controller, `three/` the scene. `main.ts` is composition only.
- `three/battle.ts` is WIRING and the frame's order of events, nothing more.
  The pieces are one file each: `squad.ts` the pigs (mesh, clip, placement,
  name plates), `chase.ts` the camera — the only thing in the battle that
  works in three's Y-up world — `dropIn.ts` the level's opening parachute
  phase, `parachute.ts` the canopy art, `marker.ts` the pointer overhead,
  `debug.ts` the `window.pow.debug` surface the e2e suite looks through, and
  `terrain.ts`/`props.ts`/`pig.ts`/`clips.ts`/`modelMesh.ts` as before.

Keep modules small and single-purpose; that split was an explicit request.
`battle.ts` reached 600 lines doing four jobs and was broken up on sight —
do that again rather than letting one file grow a second concern.

## Input goes through the controller — including tests

`src/renderer/src/input/controller.ts` names what a player can do
(`walkForward`, `turnLeft`, `jump`, `endTurn`). Keys, on-screen buttons and
the e2e suite all call the same `press`/`release`/`tap`. **Never synthesise
key events in a spec** — that tests a parallel path, and a broken keybinding
would still pass. Use `e2e/controller.ts`.

## Tests

Phases are folders: `e2e/000/` foundation (formats, viewers), `e2e/001/` the
menu, `e2e/002/` the battle. Serial, one worker; within a folder files run
alphabetically, so the spec that creates the phase's state sorts first.
Unnumbered specs at the root are standalone.

Fail fast: no sleeps, no raised timeouts. Every launch goes through
`e2e/launch.ts`, which collects renderer errors, `console.error` and process
output *before* the bundle runs; specs assert `expect(errors).toEqual([])`.
A dead renderer keeps its markup, so assertions on markup alone can pass
happily — the error array is what tells the difference.

**One app for the whole run.** `e2e/app.ts` is a worker-scoped fixture: take
`{ app }` and you get a page already back on the menu, plus `app.errors()`
scoped to your spec. Leave the app on a screen `toMenu` can exit from. Only
specs whose subject IS starting or stopping — cold start, warm start,
fullscreen, Exit, closing the window, `--game-dir` — call `launchApp`
themselves. Worker fixtures make Playwright group the specs that use them,
so the phase order no longer holds across the whole run; nothing depends on
it beyond `PHASE_ENV` existing, and the fixture says so if it does not.

Specs run against the **real** installation, read-only, with counts asserted
as floors where savegame churn could move them and exactly where it cannot.

```bash
npm run typecheck && npm run build && npx playwright test
```

## Where it stands

Formats, models, textures, skeleton, 93 animations, terrain, water and the
maps' OBJECTS all parse and render — CAMP draws its 147 props, the training
ground's dummies, crates and bridge among them. **The main menu IS the
original screen**: the backdrop and the machinery out of FEBMP.MAD, the
letters out of the FEText glyph tables, the labels out of fetext.bin — MAIN
MENU over ONE PLAYER, MULTI-PLAYER, OPTIONS, QUIT APPLICATION, drawn on a
640×480 canvas that is scaled whole and unsmoothed. Only ONE PLAYER leads
anywhere (the training ground); the two unbuilt screens wear the font's dark
shade, the way the original greys out what cannot be chosen.

**The battle wears the original's brass too.** What the original keeps on
screen — from play, not from the disassembly:

- the **clock**, bottom right: `clock01..04` out of
  `Language/Tims/dashtims.mad` with a `timer0..9` face in each of its two
  windows;
- the **angle dial and the weapon slot** as ONE widget, top right, always
  there: `ang1` over `ang3` is the beaded arc with the needle's spindle down
  its right edge, `wedge1`/`wedge2` its see-through green face, `angpoint`
  the needle, and `ang2`/`ang4`/`ang5` the slot beside it — empty until a
  weapon is chosen. Which piece is which is play's answer, not the
  archive's; the whole map is in docs/formats.md, `divide1`/`divide2` (the
  needle's stops, which a weapon may move) and the power gauge among them;
- the **map**, bottom left (not built);
- over each pig, its **name and its health beside a heart**, in the BIG
  letters, which hide the moment the player moves and come back after two
  seconds' rest — the heart is `iconhart` out of `MAPICONS.MTD`, which ships
  its markers WHITE for the game to paint;
- the **power gauge**, only when the weapon in hand asks for one.

The dashboard rides on its own canvas over the 3D view, at native
resolution, scaled by the window's height against the 480 the art was drawn
for, and anchored to the view's own edges — a wide window is wider than 640
of those units.

**Every number it is placed by is one live object, `LAYOUT` in `ui/hud.ts`,
and the console is its editor**: `pow.hud.layout.dial.slot.bottom -= 1`
nudges a piece against the real screen and `pow.hud.print()` writes the lot
back out to paste in. Placing this art is eyework — it took four rounds of
"almost, seven pixels up" to seat the weapon slot — so do that in the
console and commit the result, rather than rebuilding per pixel.

**A turn's LENGTH is the level's, and the first three are 99 seconds.** The
exe reads it from a 27-entry table at 0x4d1860 and multiplies by 100 into
the clock (0x4309f1) — 99, 60, 45, 30, 15 as the campaign tightens, which is
also why the dashboard's clock has exactly two digit windows. WHICH level is
which map is NOT decoded (the name comes from its own array on a different
index), so `lib/game/turns.ts` keys only CAMP, the training ground and so
level 0, and says so.

**A turn does not begin when it is handed over.** There is a beat first —
its own mode in the original, with the debug line "START OF TURN - Press any
key to continue" (exe 0x4d8a2c) and three ways out, each of which announces
itself: timed out, digital input, pause button. The timeout is 998 in the
same hundredths the turn clock uses, so about **ten seconds**
(`TURN_START_SECONDS`); the clock does not run during it and the pig cannot
be driven, and the first input both ends it and is acted on in the same
frame. Behind it the original flies its camera to the next pig, which the
remake does not — so if ten seconds of a still screen reads wrong in play,
that is the thing to fix, not the constant. Specs skip it through
`pow.debug.beginTurn()`, the second debug WRITE after `warp`, because every
key a player would press also drives the pig.
`../pigs-disasm/turns/notes.md`.

**A level OPENS with the drop-in.** A marker's flags bit 6 says its pig
arrives by parachute, and on a campaign map that is the player's side of
five while the enemy is already standing there. Those pigs start
`fromExeY(3072)` above their own marker with a `WE_PARA` canopy over them
and come down at the parachute force's terminal — about five seconds — with
the turn clock and walking stopped, because the original's parachute branch
advances the clip and returns. The ONE key it answers is JUMP, which cuts
every canopy at once and hands the squad back to gravity (the exe's handler
walks the whole pig list). `lib/game/parachute.ts` is the descent,
`three/parachute.ts` the canopy, and the whole derivation is
`../pigs-disasm/parachute/notes.md`.

**Some clips are EVENTS, not states — `state.commit` in `locomotion.ts`.**
`Pig::SetAnim`'s third argument is a repeat count, and the exe only
decrements it where the clip's own cursor wraps (0x46e27f..0x46e2cb), so a
count of 1 means "play it through once". Two clips are asked for that way:
the jump's crouch (the launch waits for it, 0x46e8e2) and a landing's get-up
(0x470944, and the parachute's 0x4717f5). `three/clips.ts` plays those with
`LoopOnce` and CLAMPS the last frame.

**And BOTH belong to a pig that is not being driven.** The crouch is the
standing hop's: the dispatcher branches on this frame's walking step
(0x46c220) and a pig moving forward goes straight to `StartFalling` — a
run-up never crouches, and backing away does. The get-up is the same rule
from the other end: nothing guards it, but the animation picker (0x467ec0)
asks for a movement clip whenever the pig has speed, and that request resets
the cursor outright (0x472320), while at a standstill it asks for nothing.
So land running and there is no get-up. The domain owns both — it says WHICH
clip and whether it is committed; `Soldier.setClip` cancels a one-shot the
moment a different clip is asked for, exactly as 0x472320 does.

Two ways this has already gone wrong, so do not repeat either: faking a
one-shot with a timer over a looping player (it put a crouch-and-snap on
every parachute landing and read as a bounce), and giving the crouch to
every jump instead of the standing one. The chase camera leaves room for the
canopy while one is up (`desiredCamera`'s `rise`); without that the canopy
sits off the top of the frame, which is how it looked the first time. Every
e2e entry into a battle waits it out through `landed()` — a spec that drives
before then is driving nothing.

Squads are fielded from the map's OWN spawn markers — position,
facing, side and CLASS, each class dressed from its own model in
`Chars/british.mad` — so LIBERATE puts a saboteur, a hero and three grunts
against four spies and a gunner, exactly where the original did. The NAMES
are the game's own six nations out of `fetext` (TOMMY'S TROTTERS with NOBBY,
GINGER, DEN…), and which two a map fields is the map's own choice: a
marker's side bit indexes that list, so LIBERATE's enemy is French. The battle
scene opens on CAMP — the training ground, so ONE pig — and fields real
squads wherever a map has two sides (console: `pow.swapMap('LIBERATE')` —
see README) with
the original's turn clock, tank controls, jumping, swimming (water by the
art's own translucency, floats at the region's surface, sunk SWIM_SINK),
scrambling on
masked type 11, wall scrabble-and-eject, and ground movement taken from
the exe — see `../pigs-disasm/movement/notes.md` for the derivation of
every constant in `src/lib/game/movement.ts`, `ballistics.ts`,
`locomotion.ts` and `watermask.ts`. The chase camera follows only what
the player drives; flung pigs are watched from a standing camera that
waits half a second past the landing.

What the exe gave up, in short: terrain height never refuses a step; a wall
grants only the step-up envelope, scrapes past it, and a pig inside one
never lands — the wedge counter throws it out downhill; an OBJECT is the
other half of that same dispatch and gets the same envelope, so a low box
is a step onto, a tall one a wall to scrape along, and a raised one is
walked under (`lib/game/obstacles.ts`, and a pig is 640 units on a side
because every spawn marker says so); each terrain type
carries its own friction and restitution, and masked type 11 is the one
that plays the Scramble clip in every band; a landing is binary at an
impact of 25 a frame; a jump is committed, costs 15 frames, and leaves the
ground STRAIGHT UP — the forward half is a separate impulse three frames
later. Falling is not a constant pull either: a pig is body type 0x1357,
which the engine gives a `(320 - v)/32` force a frame, so it starts at the
same 10 a frame squared a plain gravity would and then caps — and the same
32 frames bleed its horizontal away.
The walking SPEEDS are its own too — every input asks for a flat 64 units a
frame, `Pig::Walk` grants the class's thirteen sixteenths of it (52 for a
grunt) and half that backwards, water caps the step at 16 — so the one
number left standing between them and metres is `FRAME_SECONDS`.
The acting pig's whole frame-by-frame state machine is pure
(`lib/game/locomotion.ts`); the battle scene only feeds it intents and
draws what it says.

**Sound is played by NAME out of the game's own bank.** `Audio/sfxday.srl`
is a numbered list of 99 files and `FESounds/Fesounds.srl` 27 more, both
plain text (docs/formats.md). The exe names a sound by INDEX, so anything
decoded later drops straight in — but WHICH sound belongs to which moment is
NOT decoded for the pig noises, and `audio/battle.ts` picks by name and says
so. Correct those in play; the spec pins the plumbing, not the choice.
Footsteps are deliberately not wired: they want the hoof-contact frames
`../pigs-disasm/anim/audio-events.md` derives, and a footstep on a timer
would be a stand-in nobody asked for.

### Known divergences — deliberate, and each written up where it lives

- **`HEIGHT_SCALE` is 1** though the exe doubles. See above.
- **The pig slides, and that stays.** The walking clips carry a body about
  855 units a second at 25 fps; the exe walks 1560, so the feet skate about
  2×. Driving playback off the walking speed to close that (a `gait.ts` that
  scaled the mixer) was built and rejected on sight — the legs whirl, and
  the run clip is not foot-locked to begin with, its two hooves disagreeing
  by 40%. `three/clips.ts` plays everything at a flat 25;
  `../pigs-disasm/movement/stride.js` is the measurement.
- **Contact softening is not modelled.** The original lets a body penetrate
  and pushes it out by a decaying bias (0.2 → 0.02); a landing here pins to
  the ground height, so there is nothing to decay. `BOUNCE_CUTOFF` stands in.
- **The turn ramp is not modelled.** The original accelerates a turn over
  eight frames to the 32/4096-of-a-circle cap that `TURN_SPEED` now is;
  here the cap applies from the first frame. A tenth of a second.
- **The idle CYCLE is not modelled** — a standing pig loops clip 27 and
  nothing else. The 80-byte table at 0x4d7300 that a spent repeat count
  steps into turned out to be per-WEAPON, not per-pig: record 1 and 2 play
  "Sword / Knife", 22 plays "Using Grenade", and record 0 (no weapon) is
  empty, which is why an unarmed pig falls straight through it. So it lands
  with the weapons, not before. What a pig does while it stands about — the
  "Choosing idle anim from scratch" string — is still undecoded.
- **Open water is punched, where the original blends it.** The library
  punches water texels only out of MIXED art (kind 1); a kind-2 tile keeps
  its texture and is drawn translucent over the water. `three/terrain.ts`
  cuts every water texel out of every texture, so open water shows the flat
  sheet colour and reads plainer than the original's. Not chased.
- **Water renders as: flatten + mask + one plain sheet.** Per water REGION
  (flood-fill of water-flagged tiles — the exe's "Fitting water." JOINS)
  a level is fitted (mode of the region's corner heights; 128 on every
  shipped map's main water); render vertices below their region's level
  are raised to it; shore art gets its water texels punched (cutout); one
  OPAQUE sheet of the map's averaged water colour sits a hair under each
  region's level. NO wat01/wat02 pattern on the surface — the shipped
  game's footage shows smooth water, and every patterned attempt read
  wrong. What those two grey TIMs and the DLL's under-landscape 49×49
  water grid are actually FOR is still open (play memory says a sink/kill
  layer, not the visible water).
- **One line about solidity is still the remake's own.** The record says
  most of it — field 11 picks the collision shape and only kind 0 is a box,
  so every bridge and step piece is bodiless in the original too, and a
  crate is a pickup exactly when it carries something. What the data does
  NOT say is whether grass belongs in the collision world at all (0x406bb0,
  the test itself, is still undecoded), so `lib/game/obstacles.ts` draws its
  own line at a box two units across — which drops grass, flowers and the
  swimming fish, each of which carries a box exactly one unit wide.
- **Three numbers on the dashboard are the remake's own**, and each says so
  where it lives: the GREEN the dial's face is filled in (the archive ships
  the beaded RIM and no disc behind it, so the face is a filled ellipse
  matched to play), the PINK the heart is painted (its art is white), and
  the heart's ×2 (the map's marker is 10×11 and stands beside letters 32
  tall). Correct them against play.
- **The power gauge and the weapon icons wait for a weapon.**
  `newpow1..7` and `powg1` are the gauge — which the original shows only
  when the weapon in hand needs one — and `FACETIMS.MAD`, despite the name,
  holds `wepn01..20` with the crosshair and pointers. The slot they go in
  is drawn and deliberately empty.
- **The menu's LAYOUT is the remake's own.** Every piece on it is the
  original's, and where each piece SITS is not: the exe computes its screen
  coordinates in the frontend's draw code rather than storing them, and
  `../pigs-disasm/frontend/notes.md` traces that chain as far as the blitter
  (0x41AFA0, called `draw(x, y, sprite, rect)`) and stops. So `LAYOUT` in
  `ui/menu.ts` is a reading of the art — bars clear of the machine's grille,
  the dial in its housing — and is meant to be corrected against play.
  `select.mgl` is left out for the same reason: its window is 116 wide where
  a bar's face is 144, so it frames something else somewhere else.
- **The mouse works the menu, and the original's does not.** Hovering lights
  a bar, clicking chooses it. The original is keyboard and pad only (it even
  ships `nomouse.com`); this is the remake's convenience, and so is F1 for
  the asset browsers, which are not a screen the original has.
- **A pig cannot get ONTO a bridge, and the ramp is PARKED.** The deck
  sections are boxes and the shape-kind-1 pieces are bodiless, so a pig
  walks clean through the one it should be climbing. Play says plainly that
  it IS a ramp you walk up — and that it only appears partway through the
  tutorial, which is the same script the tagged records belong to. So the
  two questions are one question, and it is deliberately left until the
  tutorial's intro reaches that ramp: whatever raises it is what will say
  how it is walked. Do not "fix" the collision for it before then.
- **The map's SCRIPT is not run, so scripted objects are just there.** Field
  14 is an object kind tag, and CAMP's 23s — eight dummies and the whole
  second bridge — are the ones play remembers appearing partway through the
  tutorial, along with the crates. The remake places everything at once, so
  that bridge stands assembled from the first frame and reads as levitating
  steps: flat slabs at 2208, 1984 and 1472 over four supports, which is
  exactly what the file says and not a rendering fault.
- **Two sides, though a map offers up to six.** The spawn markers name six
  (FINAL uses all of them, the arenas four); the battle fields the first two
  it finds, because there is no AI for the rest. There is no filling in
  either way: CAMP fields ONE side of ONE pig, because that is what the
  training ground carries, and a map with no markers refuses to open.
- **The wall envelope is an inference.** Whether wall geometry sits in the
  exe's collision world is still open (0x406bb0 undecoded); the remake
  builds the play-observed behaviour from the decoded step-up/sidestep
  constants instead.
- **The wall scrabble wears the Scramble clip.** The exe's wedge branch
  never touches the animation — only the eject (0x470c70) does — but a pig
  pushing at a wall visibly scrabbles in play, and clip 11 is what reads as
  it. Deliberate, in `locomotion.ts`.

### Threads left mid-pull

- **A crate is walked THROUGH, where the original is shouldered into.** The
  records say a pickup is solid — shape kind 0, a real 3×3×4 box — and play
  remembers pushing at one before it goes. Making it solid, though, means
  the pig can never be inside it, and this engine's step refuses to END
  inside a box, so the collect-on-overlap test never fires and the crate
  becomes a thing to bump into forever. It is deliberately kept OUT of the
  collision world until the two halves are reconciled (collect off the
  step's target, or a shove that resolves) — `lib/game/obstacles.ts` says so
  where it drops them.
- **A pig carries skills, takes one in hand, aims it, and cannot FIRE it.**
  Crates are collected by walking into them (`three/battle.ts` →
  `lib/game/pickups.ts`), the contents go into fifteen slots with the exe's
  own stacking rules (`lib/game/inventory.ts`), and `R` opens the game's own
  menu over them — `MENUTIMS.MAD`'s frame with an icon per skill and
  `SELECT.BMP` over the cursor, driving in from the right with `S_OPEN`
  behind it (`ui/skillMenu.ts`). `Space` there sets `pig.holding`, and from
  that the scene plays the weapon's getting-it-out clip, hangs its model on
  the pig's forearm bone and holds its aiming pose at the angle `Q`/`E`
  drive (`lib/game/weapons.ts`, `lib/game/aim.ts`, `three/heldWeapon.ts`).
  What is still missing is the shot: the power gauge, the projectile and
  damage. `pigs-disasm/weapons/notes.md` has where to start —
  `[game+0x4e4]` charges 0x50 a frame to 0xfff, and 0x47a2b6 onwards is a
  per-weapon fire dispatcher nobody has read.

  **The bayonet's pin is decoded and deliberately not applied.** 0x46a891
  forces the aim angle to zero for skills 3 BAYONET and 5 CATTLE PROD, so in
  the original those two cannot be aimed at all. The remake lets them aim
  like everything else, by request — the bayonet is the training ground's
  first weapon and tilting it is the whole of what a player does with it
  until firing exists. One `if` in `clampAim` restores it.

  **The aiming pose is a SECOND animation channel, not a clip.** A pig has
  two of them — `Pig::SetAnim` (0x471ef0) writes one block of fields and
  0x471f50 an identical one beside it — and the weapon's clips go on the
  second while running, walking and idling go on underneath. `mcap.mad` has
  no armed run cycle at all; a pig charging with a bayonet is the ordinary
  run with the weapon channel over its arms. `three/clips.ts` does that with
  a bone overlay applied AFTER the mixer.

  Two things there are the remake's own: WHERE a weapon hangs, and which
  bones the overlay takes (spine, head, both arms). The first is play's word
  against the file's — the models' VTX bone field is not an attachment (24 of
  29 put everything on bone 0 and `WE_TELR` splits across two), they only
  agree on reaching along −Z, and play says the pig holds it in the other
  hand, so `three/heldWeapon.ts` mirrors them across z. `Chars/PROPOINT.MAD`
  is where the real attachment points probably live and nothing in the exe
  has been traced to it. The SHAPE of the second is decoded: both channels
  hold six-entry key-frame lists and six is the skeleton's branch count, so
  the split is per branch — but the mask itself is inside `wh32lib.dll`'s
  `afGetKeyFrameList` and is not in the MCAP data.

  Three things in the menu are the remake's own and want play against them:
  where it sits and how it arrives (the exe computes its coordinates rather
  than storing them); that SKIP TURN is what an empty-handed pig always has
  in it, which is play's word and not the exe's; and that twelve cells hold
  fifteen slots, since what the original does with the other three is not
  decoded. Its art is two transparency keys, and those ARE measured — the
  frame keys on magenta and keeps its black (that black is the widget's
  inside), the icons and the highlight key on black (`main/assets.ts`).
- **The tutorial speaks over the drop, over the round, and off every crate.**
  The bar is the exe's own (`ui/briefingBar.ts`: `npro4` caps over four
  `npro3` tiles, the ten-frame drop-in curve, a 206-wide window, the scroll
  at 5 px a frame), the instructor is `Speech/Sku1/Train1` through
  `audio/speech.ts`, and clip N always carries `gtext` 209 + N. The script
  itself turned out to BE the crates — the tutorial dispatcher switches on
  the skill just collected — so collecting is what speaks it
  (`lib/game/tutorial.ts`). Two things still have nothing to fire them: the
  "FOLLOW THE YELLOW PATH" lines, which the exe says when a crate is PLACED
  by the map script, and the dummy.
  `pow.say('…')` puts any line up meanwhile. The font is the game's own:
  the bar's `macfont.bmp` is `FEText/BIG.BMP` pixel for pixel and its metrics
  are read from `BIG.TAB`, so the bar loads `BIG` and kerns a pixel a pair as
  the exe does. One number in it is still unchecked — the 300 ms a line that
  FITS the window is held for, which reads faster than a line can be read.
- **The rest of the battle screen, in the order play asks for it**: the MAP
  bottom left (`MAPICONS.MTD`: `map1` plus the pig, heart, pickup and prop
  markers), and the POWER gauge, which nothing has needed yet. The dial is
  done — the needle turns with the aim angle and the slot beside it carries
  the chosen skill's icon, out of the skill menu's own art.
- **The menu has no entrance.** In the original the pieces DRIVE ON — the
  bars slide in rather than being there from the first frame. Deferred on
  purpose, along with the layout itself; whatever settles the coordinates
  will settle where they come in from.
- **There is no SKY.** The battle renders against a flat clear colour, while
  the original ships `Skys/` — paired `.PTG`/`.PMG` files per mood
  (`CLOUDY1`, `DAWN1`, `CLIMB`, plus `COLD` and `DESERT` folders). Neither
  the format nor which map picks which sky is decoded. Own thread, after the
  tutorial.
- **The drop-in's card and camera are in, and both want a look.** The card
  is the exe's (`gtext 159` + the mission name, centred, y = 160 —
  `ui/titleCard.ts`), but only CAMP is answered: which display name goes
  with which MAP FILE is stored nowhere, so every other map gets no card
  rather than a guessed one. The face-on camera while a canopy is up is the
  remake's own framing (`FACE_BACK`/`FACE_LIFT` in `three/chase.ts`), the
  same way the chase's own distances are.

- `0x406bb0`, 3280 bytes: the collision test itself. Knowing what else lives
  in that world would settle whether objects need their own handling.
- The flag at `+0x3a4` is a bitfield; only bit 3 (terrain type 11) is traced,
  and six other sites write it.
- The tile type's low 5 bits: 0x20 water, 0x80 wall and the twelve material
  rows are known; the rest of the meanings are not.
- POG fields 11, 12, 14-16, 28 and 29. 14-16 look like the interesting ones
  — they are non-zero mostly on crates and spawn markers, which is where a
  crate's contents and a spawn's team would live. Of the flags word (13),
  the side, the player counts, "placed at all" and now bit 6 (the
  parachute) are decoded; the rest of the low byte is not.
