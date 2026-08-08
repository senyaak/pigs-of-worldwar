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
  `swing.ts` the hand-to-hand strike — the one piece that has to read a BONE —
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

**A miss is measured, not guessed at.** `pow.debug.strike()` gives the last
swing's three blade points and, per pig and per dummy, the nearest approach on
each axis — `gap.x`/`gap.z` against 170, `gap.y` against 360, `degrees`
against 67.5. A strike has four separate ways of failing and no way to tell
them apart by eye. It earned its keep on the first miss it was pointed at:
`gap.x` 1.3 and `off` 0 with `gap.y` **3136** said in one line that the
horizontal was perfect and the vertical was in the wrong SPACE — `targetsOf`
had taken a POG record's stored y, which is an up-positive ELEVATION, as if
it were a game-space (Y-down, `HEIGHT_SCALE`) coordinate. Two rounds of
reasoning about bones had got nowhere; the numbers took one.

`e2e/002/strike.spec.ts` is the pin that would have caught it — the whole
path in one spec, collect the crate, take it in hand through the real menu,
walk up and swing. The pure specs around it all passed while the feature did
not work: what was broken lived BETWEEN them.

**The damage FLOATS off what was hit, in points.** It is the original's own
effect, not a flourish: `Pig::TakeDamage` (0x467b5b) and the dummy's
(0x48da5c) both call **0x487b90** with the body's position and `amount >> 7`,
which spawns effect 0x35 with a life of 0x3e8 and the value at `+0xd4` (a
style index per team at `+0xd8`, out of 16-byte records at 0x4cf1e4 — not
used here). `three/damageNumbers.ts` holds them and `ui/hud.ts` draws them in
the game's own letters, OUTSIDE the name plates' rest delay: a hit is exactly
when nobody is standing still, so sharing that delay would hide every one.
How it MOVES is not decoded — the rise and the fade are the remake's own, and
so is reading 0x3e8 as milliseconds rather than the clock's hundredths.

**And a blow throws RINGS — the effect system is decoded and its first piece
is built.** The original has ONE effect class (vtable 0x4bd370, 0xE4 bytes,
body type 0x135E) and every effect in the game is an id into it. `Init`
(0x487ca0) switches the id into a parameter ROW — **143 signed bytes per kind
at 0x4d61e8**, scaled per index by 0x4d6c88 — and the row is twelve timed
STAGES, each of which spawns a CHILD effect of its own on one named frame of
the parent's life. For all five hand-to-hand weapons every live stage spawns
the same child, id 0x18: a **ring**, thirty-two quads in the XZ plane, outer
radius `[+0x86]` and inner `[+0x86] − [+0x8C]`, each with its own growth (and
the sword's with a second difference, so its rings SLOW). The colour is 5
bits a channel out of the row and is divided by the ring's own age, so a hit
is a white flash that collapses into the table's dark blue-purple over about
half a second — which is what play remembers as black smoke. The bayonet
throws two rings, the sword three, the cattle prod three and a particle
burst (not built — the particle half is undecoded past its 40-byte record).
`lib/game/effects.ts` is the rules, `three/effects.ts` the geometry,
`../pigs-disasm/effects/notes.md` the read.

**The map's SCRIPT runs, and the objects ARE the program.** There is no script
file and no interpreter loop: every POG record may carry one command, **field
14 is its opcode**, and the loader hangs it on the object at `+0x48`
(0x4a6287). It runs when the object is FINISHED — a dummy breaking (0x48d972,
the last thing its death handler does) or a crate being collected (0x464633).
A chain of "and then", one link per object.

**Field 15 is a PAIR of labels**, one byte each: the low one is what the object
WAITS for, the high one what it SIGNALS. Except on a crate — field 14 of 19 —
where the high byte is the CONTENTS instead, so a crate waits and never
signals. Field 14 of **21 or 23** takes the object OFF the map at load
(`[obj+0x30] = 0` and the body's no-draw bit, 0x4a62f2), which is what CAMP's
23s are: eight dummies and the whole second bridge, seven records all waiting
on the same label so it arrives assembled.

**A crate comes down under a CANOPY and everything else just switches on**, and
that is the record's own doing rather than a choice: the placer tests the
waiting object's BODY TYPE, and `0x135b` — what the pickup constructor writes
(0x4641bd) — gets lifted **0xC00 above whatever signalled** and falls
(0x4aa64a). 0xC00 is the same 3072 the level's opening drop-in uses, so it is
the same descent, constants and all (`three/airDrop.ts` over
`lib/game/parachute.ts`).

Read off the shipped CAMP, breaking the FIRST dummy places two more dummies and
drops in a crate of **rifles** — which is what play said before any of it was
read, down to the weapon. `lib/game/script.ts` is the rules and
`../pigs-disasm/script/notes.md` the read; `pow.debug.script()` says what is
still held back and what is in the air.

One line in it is inferred rather than read and says so: where a CRATE with a
wait label is hidden. The loader's own hide covers only opcodes 21 and 23, but
it gives such a crate a command all the same and the placer's whole job is to
switch it on — which would be nothing to do if it had never been off.

**A thing BREAKING is a different effect, and that one IS the smoke.** Play
said so — "там ещё чёрный дым в игре при уничтожении чего либо" — and the
binary agrees: the object's own break handler (0x48d750, whose last act is to
run its map-script command) spawns effect **0x3e** at a point jittered ±32
about it, which resolves to parameter row **0**, and row 0 has no rings in it
at all. What it has is the BURST: **six particles**, colour 0x4210 — sixteen
of thirty-one on every channel, the exact default the particle setter
compares against — fanned round the horizontal and RISING, because the byte
the engine subtracts from the y velocity is buoyancy in a Y-down world. So a
hit makes rings and a breaking makes smoke, and they are not the same code
path. `onBroken` in `three/battle.ts` is the hook, the same way the exe hangs
it on the object rather than on the blow.

Row 0 also enables four stages through two spawners the read did not open
(0x48bff0 twice, 0x48c160 twice), so there is MORE to a breaking than the six
puffs. And three of the burst's numbers — the age step, the jitter and the
rise — are assigned to fit rather than pinned: the argument order into
0x486b30 did not come out of the read cleanly. `lib/game/effects.ts` says so
at the field. Correct them against play.

Two numbers in it are the remake's own and say so: a ring's SIZE rides
`MODEL_SCALE`. The exe computes the radius in world units, but in a world
whose pigs are twice the size of these, so an unscaled band would read as
twice the blow. Same argument as the chase camera's distances — a rig around
a BODY halves with the body, and the terrain does not. The other is how big a
puff of SMOKE is drawn and what it is drawn with — a soft blob on a canvas —
since the half of the system that draws a particle (0x48a570) is not read at
all. A spec cannot see a transparent quad, so `pow.debug.effects()` counts the
live rings and `pow.debug.smoke()` the puffs, and `e2e/002/strike.spec.ts`
reads a high-water mark the PAGE keeps once a frame: polling from the test
misses a half-second window outright.

**Health is POINTS, the maximum is the CLASS's, and it is not 100.** The
constructor reads it out of a 128-byte record per class at 0x4d02e0 — the
same record whose `+0x04` is the thirteen `Pig::Walk` grants — so a grunt has
**fifty**, a heavy 120, class 4 has 130. The engine counts 128ths of a point
and every amount arrives shifted left seven; nothing ever produces a
fractional point, so `lib/game/health.ts` counts POINTS and the exe's
thresholds come out exact: death at `<= 0x7f` is "under one whole point",
which over whole points is `<= 0`. Three more rules, all decoded and all
applied: **the training ground floors a pig at one point** (0x467c85 — CAMP
cannot kill, the same flag that makes its skills unlimited), **sixty points
past dead is a different, messier death** (`GIB_BELOW`, strictly below), and
**healing has NO ceiling** — `Pig::Heal` adds and stops, so a 50-point crate
on a 50-point grunt leaves it at ninety and the original allows it. The
`FULL_HEALTH = 100` clamp that used to live in `pickups.ts` was both numbers
wrong and is gone. `../pigs-disasm/damage/notes.md`.

Finding the pig's vtable is the fiddly step and worth not redoing: it is
**0x4bd298** (`+0x34` TakeDamage 0x467ac0, `+0x38` Heal 0x467fd0), and the
pig links itself into the list at 0x51ee18 on `+0x168`. The class at 0x4bd238
looks like it — health at the same `+0x4c`, constructor in the same 0x464xxx
block — and is NOT: it chains through `+0x7c` off 0x51ed90, its heal is a
`ret 4` stub, and it is the TRAINING DUMMY.

**A fallen pig is stepped over, and by two rules.** `Game.endTurn` advances
past the dead in its own squad AND past a side with nobody left — including
the incoming side's own `activePig`, which advances only when its turn ends
and so can be pointing at a body by the time it comes round again (that one
cost a failing spec). The acting pig dying ends the turn on the spot, which
is what the exe does from inside the damage itself (0x467d4f). `game.over`
says nobody is left. The battle skips a corpse in the idle loop, or it would
stand it back up every frame.

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

**A sound is a CUE — index, VOLUME and PITCH — and the pig's own moments are
decoded.** `Sound::Play` is 0x43A9D0, one call with 222 sites, and its first
three arguments are `(index, volume, pitch)` with 100 nominal on both scales.
The order is pinned twice over: argument two never exceeds 100 anywhere in the
binary while argument three reaches 140, and the jump asks for
`90 + (rand() & 15)` on the third — a spread straddling nominal is a pitch
jitter and nothing else. `../pigs-disasm/anim/audio-events.md` has the full
table and `anim/sounds.js` is the tool (wrapper → index, then annotate any
disassembly with it).

Three results are worth stating because they are counter-intuitive, and two of
them were what play heard as wrong:

- **the landing is index 30, `I_PICKUP`**, at volume 40 pitch 150 — `Pig::Land`
  (0x470910, identified by its get-up `SetAnim(10)`) plays it, and so does the
  parachute's landing at a wide random pitch. The `I_` family is IMPACTS
  (I_METAL, I_SPLASH, I_STAB), so the name is about what is hit;
- **`P_LAND1` is the impact that HURTS** — its wrapper calls the body's own
  `TakeDamage` right after playing it. Nothing in the remake plays it, because
  fall damage is not modelled;
- **the slip is `P_SLIP` gated on `Map::IsBlocked`** at the pig's feet plus an
  arrival under 50 (0x471045) — the wall-eject moment, which is what play
  called "соскальзывание".

The jump is **P_SNORT1**, volume 60, pitch 90 + rand(0..15) — play named the
file and the exe confirmed it.

**What is still a name pick is picked BY EAR, from the console.** `pow.sfx` is
the same shape as `pow.hud`: `list()` the bank with indices, `play()` one,
`now()` the table, `set('splash', 'I_SPLASH', {pitch: 120})` to rebind live and
hear it, `print()` to paste back into `audio/battle.ts` (`audio/console.ts`,
README). A name pick cannot be corrected off 99 file names — the sound has to
be heard where it belongs. `BATTLE_SOUNDS` is deliberately mutable so a rebind
takes on the next event.

**Sound is played by NAME out of the game's own bank.** `Audio/sfxday.srl`
is a numbered list of 99 files and `FESounds/Fesounds.srl` 27 more, both
plain text (docs/formats.md). The exe names a sound by INDEX, so anything
decoded later drops straight in — but WHICH sound belongs to which moment is
NOT decoded for the pig noises, and `audio/battle.ts` picks by name and says
so. Correct those in play; the spec pins the plumbing, not the choice.
Footsteps are deliberately not wired: they want the hoof-contact frames
`../pigs-disasm/anim/audio-events.md` derives, and a footstep on a timer
would be a stand-in nobody asked for.

### The SHOT, end to end — the six things play named, 2026-08-07

Aiming and firing landed in this order: the projectile's rules
(`lib/game/projectile.ts`), the aim view on a HELD G, the scope overlay, the
bullet and its hit (`three/shots.ts`). Play named six things wrong with it and
all six are now done. What each turned out to be, because most of them were
not what the list guessed:

1. **The scope's gaps** were rounding at the joins, as suspected. The four
   quadrants now run a pixel past the centre lines and the surround starts a
   pixel inside them (`ui/hud.ts`, `LAYOUT.scope.overlap`). Every join is the
   same solid rgb(8,8,8), so the overlap costs nothing.

2. **The bullet has a body.** `0x4a8ed5` is the only place a projectile's size
   is decided and it reads the KIND: 35 model units for every gun but the
   pistol's 100. `three/shots.ts` draws a sphere of exactly that instead of
   the invisible one-pixel streak. The colour is still the remake's — the
   factory takes it out of a palette at 0x4de9d0 that has not been read.

3. **The sequence is built** (`lib/game/shot.ts`): press → leave the sights →
   the pig says a line → ten frames of fuse → the bullet, the attack clip, and
   the camera riding it (`chase.ride`, mode 1, whose row is the chase's own
   3072) → back to the pig when the air is empty. The turn clock does not run
   for any of it. The **pig voice** is new and its own module
   (`audio/pigVoice.ts`, decoded in `../pigs-disasm/speech/pigs.md`):
   `Speech/Sku1/Pig{NN}/{NN}{LANG}{CC}{VV}.wav`, twelve firing lines walked in
   rotation, and NN belongs to the squad rather than the pig.

4. **The gate is `[pig+0x230]`**, and it needed no new mechanism: the sequence
   itself is the gate. A press while `firing` is set is dropped, which is
   `Pig::MayAct` refusing for the window between the press and the attack
   (0x467a10, listed in full in `fire.md`).

5. **The wobble is entirely the remake's** and `lib/game/wobble.ts` says so at
   the top. Nothing in the binary drifts an aim: `Pig::Aim` adds the input,
   clamps to ±0x3FF and stops, with no RNG anywhere on the path. Two slow
   sines at periods that do not divide each other, applied to the view AND the
   shot together, because the crosshair is fixed at the middle of the screen.

6. **The sniper rifle was the SCRIPT, not the lists** — though the lists were
   wrong too and are fixed (one `targets` array, shared). The real rule is the
   guard at 0x4aa6e7: an object with opcode 22 or 23 places nothing while any
   OTHER object is still waiting on the label it itself waited on. So a group
   raised by one signal is one step, and only the last of it to fall speaks.
   Two dummies wait on 2; both must go down. Reading that also corrected two
   things this repo had backwards: **a placed DUMMY keeps its command** (only
   the pickup branch clears it, 0x4aa659 jumps over the line) — without which
   no chain could run past its first step — and **`Pig::ClearInventory` is
   called only when a CRATE is placed**, not on every placement.

### The beat after the blow, 2026-08-07

Play, straight after: "останавливается таймер и показывается как ящик на
парашюте спускается… после попадания пару секунд показывается ещё то место, а
только потом запускается таймер и показывается свин." All of it turned out to
be one wait in the binary and it is now built (`lib/game/aftermath.ts`,
decoded in `../pigs-disasm/turns/aftermath.md`).

Knocking anything down stops the turn clock and takes the camera off the pig.
It goes to whatever the script just placed — the exe hands the crate to the
camera as its subject and asks for **mode 0**, the ordinary chase row, so the
descent is framed exactly as a pig is (0x4661a0). The turn comes back only
once nothing is still moving AND fifteen quiet frames have gone by on top:
`0x415420` is one global counter that every other bail on the list zeroes, so
the second is measured from the world settling, not from the blow.

**Jump cuts the crate's canopy.** That one is play's guess ("вроде можно
пробел нажать") and `airDrop.ts` says so at the method — a pig cuts its own
with the same key, and nothing in the exe has been read either way.

### The scope is bolted to the HAND, 2026-08-07

Play pushed back on the wobble — "если не нашёл, так надо лучше искать" — and
they were right. The earlier negative result was right about the ANGLE and
wrong about the question.

`0x4a2e30`, the rifle cam, never reads its row of the mode table. It takes
row 14 of the offset table at 0x4d0ee0 — **(44, 32, 230)**, the pistol's own
muzzle point — and puts it through **bone 5** with `0x440fb0`, the same
bone-to-world call the shot and the bayonet use. `[cam+0x60]` is zero for this
mode so there is no smoothing: the camera is where the hand is, this frame.
That also settles what the mode table could not — **the aim view IS first
person**, and its 2048 is simply not read.

So `three/chase.ts` mounts the scope there (`SCOPE_MOUNT`, `SCOPE_BONE`) and
the battle hands it the posed world point. The wobble comes free: measured off
the shipped `mcap.mad`, with the guns' aim pose held on the arm and the idle
clip underneath, that mount travels ~32 model units across, 26 up and 13
forward every 2.4-second breath. The DIRECTION is still built from the pig's
heading and the aim angle, as the exe builds it, so a breathing hand shifts
the view without steering it.

`lib/game/wobble.ts` survives as a declared EXAGGERATION on top — a degree of
breath is not what play wants to feel. Zero its `SCALE` and the scope still
breathes, just quietly.

### The scope jitters, the sniper zooms, and bullets stop at walls, 2026-08-07

Play: "дрожание совсем не то — щас плавает, а в оригинале прям дрожит /
прожектайлы летят через стены / снайперский прицел начинает с малого зума и
автоматом увеличивается до предела." All three are done and two of them are
decoded outright.

**The eye is SAMPLED ONCE AN ENGINE FRAME**, and that turned out to matter
more than the tremor did. Measured in play, the scope camera moved on 267 of
289 rendered frames — the mount is on a bone the mixer interpolates, so the
breath glided however the drift was shaped. Holding the eye between engine
frames (`three/battle.ts`, `scopeEye`) inverts it: 259 of 290 frames now hold
perfectly still and the rest jump, biggest step 2.16 against a mean of 0.13.
The exe places this camera once a game frame; sampling an interpolated
skeleton at sixty was the bug.

**The tremor is a RANDOM WALK, not a sine.** A sine floats, which is exactly
what play saw. The engine's own held tremor is at 0x49e030 — the game puts it
on a body standing on terrain type 4 or 11 — and it is two axes bouncing
between ±0x80 with a fresh step of `8 + (rand() & 7)` every frame, reversing
at the stops. `lib/game/wobble.ts` is now that shape at those numbers, scaled
to a quarter, and **stepped at the engine's fifteen a second**: stepping it
per rendered frame would smooth it straight back into a glide. The camera also
has a shake of its own (0x49fea0) and it is the wrong kind — a decaying
impulse, i.e. a blast.

**The sniper's magnification is the view manager's**, and it closed a question
`fire.md` had carried from the start. `afSetZoom` is a library entry at
`[0x537fd4]`; every caller of the setter passes zero, and the ADDER has one
caller — for skill 11 and skill 64 only, the input handler creeps the zoom in
by **0x20 a frame** toward **0x1000** (0x495e75). The same handler scales the
aim step by `(0x1000 − zoom) >> 12`, floored, so the sights get finer the
closer they look. `lib/game/zoom.ts` has all of it. What 0x1000 does to a
field of view cannot be read — that library is not in the install — so
`SCOPE_MAGNIFY = 4` in `three/chase.ts` is the remake's pick.

**Bullets stop at the world.** `ObstacleField.solid(x, y, z)` is a new POINT
test — `blocks` is shaped like a pig, with feet and a step-up reach, which a
bullet is not — and `three/shots.ts` checks the ground height and that box
before it checks anyone's body. The exe's projectile update reads the terrain
table itself at four sites inside 0x436xxx, so this is the shape of it rather
than an invention.

**Sideways now moves at the same rate as up and down.** That is the remake's
choice and `rampedStep` in `lib/game/aim.ts` says so: the pad gives the aim a
ramp to 0x20 a frame (0x492bf5) and the turn a flat 0x40 the instant the key
goes down (0x492bb8), so in the exe left/right is twice as fast AND instant.
Only the aim view is changed; a pig turning on its feet turns as it always
did.

Left open on this whole thread, and all of it flagged where it lives: a gun's
DAMAGE (`SHOT_DAMAGE = 20` is invented), the sniper's magnification, where a
no-gauge weapon's charge becomes 0xFFF, what bit 0 of a body's `+0x44` means
at 0x47a24b, the melee's own battle cry — the same `0x43af70` call, not yet
wired to a swing — and which mode number the wait above actually is.

### One thing at a time, and the sights hold still, 2026-08-07

Play's list after watching it run, and what each turned out to be.

**The next animation waits for the last one.** "всегда так — ждёшь конца одной
анимации и включаешь другую." Breaking a dummy no longer runs its script
step on the spot: `onBroken` parks it as `pending` and the aftermath only runs
it once the smoke off the dummy is gone (`effects.smoke() === 0`), so the
crate starts down after the dummy has finished coming apart rather than
through it.

**The clock stops for the whole blow**, from the button going down to the end
of showing what it did — a swing, a shot, and the beat after either. One
predicate, `blowInProgress`, and the exe's own gate agrees: `Pig::MayAct` is
false for all of it.

**The sights do not come back on their own.** Firing drops them, and they stay
dropped until G is actually released — `sightingRefused`. Holding the key
through a shot used to snap the scope back over the flight.

**Nothing moves the sights once the trigger is down**, and this one is
decoded: `Pig::Aim` (0x46a7f0) calls `Pig::MayAct` before it does anything and
bails when it is false, which it is from the press until the attack
(`[pig+0x230]`). Without it the bullet left along wherever the sights had
drifted to by the end of the ten-frame fuse — play: "будто секунду в сторону
движения прицела продолжал двигаться".

**No jumping down the sights.** The remake's reading: the exe routes input
through a different branch entirely while the aim bit is held (0x4928dc) and
no jump is reachable from it.

**The tremor moves the EYE, not the aim** — third pass, and this one is the
binary's shape rather than a guess. The shot reads `[pig+0x304]` exactly and
the rifle cam is a POSITION on the hand, so in the original a tremor shifts
the picture and *cannot* steer the bullet. An angular jitter does both, swings
the whole world, and gets worse the further you look; at four times
magnification it is unusable. That was "дрож камеры всё ещё фу".
`lib/game/wobble.ts` now returns offsets in model units, across and up from
wherever the hand has the camera.

**The aim view reads the pad through its OWN arm** — found on the fourth pass
and it settles the sideways-speed question for good. Holding the aim bit hands
input to `0x495690`, which dispatches per camera mode, and mode 0x0E's arm
(0x495b29) has constants of its own: both the turn and the aim accumulate by
**1 a frame to a cap of 16**, against the ordinary handler's 2-to-0x20 and a
flat 0x40. So down the sights both axes are half the speed and were already
identical to each other. The remake had matched them by hand and called that
its own choice; it is the original's, and `SIGHT_RAMP`/`SIGHT_TOP` in
`lib/game/aim.ts` now say so.

**The scope camera's HEIGHT lags the hand by a third a frame** — read off the
rifle cam's short branch instruction by instruction (0x4a304e, scaled by the
double at 0x4bd6c8 = 0.333). X and Z come off the bone outright; the y is
nudged a third of the way and no further. So the picture snaps sideways and
drags vertically, and the two axes are never in step. `three/battle.ts`,
`EYE_LAG`. Closest thing to the tremor found so far.

**The crate waited on the wrong thing.** The gate was `effects.smoke() === 0`,
and the break effect's burst does not fire until its THIRD frame — so the
count was zero on the frame the dummy broke and the parachute started down
through the smoke anyway. `effects.busy()` is the whole effect, stages
included.

**There is no dedicated scope tremor, and `fire.md` now lists every place it
is not** so the search is not run a fifth time: `Pig::Aim`, the shot's angle
read, both branches of the rifle cam, `Camera::Shake` (0x4a0520 — its single
caller is a sound routine armed for two explosion ids, and it is skipped
entirely when `[0x51ABC8]` is set), the engine's terrain-gated random walk,
the view manager's constructor seeding, `0x44E620` (polar to cartesian off the
sin/cos tables), `0x46a960` (returns the aim angle), and the camera's own
yaw/pitch accessors.

### The beat has a ceiling, the crate has a voice, 2026-08-07

**The hold now ends after three seconds whatever is going on.** Play: "надо
думаю ждать 2-3 секунды пока завершится всё", and "без ящика гуд — с ящиком
плохо". The crate was the overrun: the break effect runs about a second, the
canopy takes two and a half more from 0xC00 up, and the exe's second of quiet
on top made four and a half. `AFTERMATH_MAX = 3` in `lib/game/aftermath.ts`
caps it; a crate still in the air keeps coming down behind the ordinary
camera, which costs nothing.

The busy list is play's, as far as this scene can answer it: a projectile in
the air, damage still floating, a body still coming apart, a canopy still up.
**A pig swimming for the shore is on their list and is NOT modelled** —
nothing knocks one into the water yet; when it does, it goes in there.

**The crate's canopy had no sound.** `BATTLE_SOUNDS.chute` was decoded far
enough to name and then only ever played by the level's opening drop
(`three/dropIn.ts`); `three/airDrop.ts` was silent. It plays now, and `land`
on touchdown.

**The reticle is the PC's.** Play thought it wrong and it is not: dumped all
46 entries of `Language/Tims/dashtims.mad` for them to look at, and the answer
came back "на пс1 была другая, но похоже для пк поменяли". `sights` + `target`
stay. The other archives under `Language/Tims` were not dumped.

**A plane, then a canopy.** Play: "там ещё звук самолёта перед парашютом."
`BG_PLANE` (index 10) is the bank's only candidate and `three/airDrop.ts`
plays it on `send`, with `chute` half a second behind it — a NAME pick, like
the rest of `audio/battle.ts`, since nothing has been traced starting that
bed. `CHUTE_DELAY` is the gap.

**The tremor, fifth pass: a STICK THAT NEVER SITS AT ZERO.** The aim view's
own handler ends by unpacking six signed bytes out of `[game+0x444]` and
`[game+0x44C]`, halving them and feeding them to the camera on every frame no
direction is held (0x495699 onwards) — the analogue axes. On the machine this
was made for the sights are wired to a stick, and a resting stick reads a few
units either way and a *different* few every frame: a small, fast, ANGULAR
jitter. On a keyboard those bytes are zero, which is why the remake's sights
were dead still and every invented substitute felt wrong. `lib/game/wobble.ts`
is now an independent sample per engine frame, ±4 of 4096, on the angles —
and play's verdict was "почти хорошо, чуть плавнее, но не сильно", so the
displayed value CHASES each sample at `EASE = 0.65` a frame instead of
snapping to it. Two knobs: `AMPLITUDE` for how far, `EASE` for how hard.
Nothing else in this file is invented — the shape is the exe's.

### The wait was cutting off the very thing it waited for, 2026-08-07

Play, again: "всё ещё анимация сброса ящика сильно рано прерывает предыдущую
анимацию." The gate was not the problem — `effects.busy()` is the right test
for the break. The problem was one line further down: the aftermath block put
`ANIM.IDLE` on the pig on every frame of the wait, and **asking for a clip
cancels a committed one** (`three/clips.ts`). A bayonet strikes on frames 11
to 14 of a 36-frame clip, so the swing was thrown away with most of a second
still to run, and a gun's attack clip was killed the frame after it started.
The wait also never called `swings.update`, so nothing was advancing anyway.

So the blow now plays out INSIDE the wait — `swings.update` runs there, the
IDLE takes the same two guards the normal path uses (`swinging`,
`animating`), and the script's next step waits on all three of the swing, the
pig's own clip and the break. Both are in `settling` too, so the fifteen
quiet frames start after the pig has finished moving.

`AFTERMATH_MAX` stays at three seconds and the blow's animation is inside it,
which leaves the crate roughly the last two — the camera comes off it just
before it lands. That is the trade play asked for.

**Then the ceiling came off again.** With the blow finishing first, play wants
the descent watched to the end: "нужно ждать пока сундук упадёт на землю + там
ещё эффект от падения и только потом через 0.5 с где-то вернуться".
`AFTERMATH_MAX` is gone — it was there to stop a crate that started down
through the smoke of the thing it replaced, and that was the interruption's
fault, not the crate's.

Two things fell out of that. **A crate landing now throws up the BREAK burst**
(effect 0x3e, six rising puffs, no rings) — there was no landing effect at all
and nothing has been read that spawns one for a placed object, so borrowing
the engine's own ground-impact burst is the remake's, flagged at the call.
`airDrop.ts`'s `onLanded` carries the spot for it.

And **`SETTLE` is half a second, not one**, which is the same fifteen frames.
`FRAME_SECONDS` here is 1/15, deliberately stretched from the engine's rate so
the walk reads right against half-scale models — so every timer taken off the
exe **in frames comes out twice as long as the original ran it**. Fifteen
frames undistorted is 0.5 s, which is exactly what play asked for. Worth
remembering the next time a decoded frame count feels sluggish; the constant is
now written in seconds and says why.

**And the tremor went up**, `AMPLITUDE` 4 → 7 ("дрож чутка слабая"). Worth
knowing before the next nudge: the easing eats a chunk of it. Against white
noise a chase at `EASE` settles to `sqrt(EASE / (2 − EASE))` of the sample,
so 0.65 shows about seven tenths of whatever `AMPLITUDE` says. Turn the
amplitude up rather than the ease down, or it goes back to floating.

### GRENADES: the gauge is decoded, the fuse is not, 2026-08-07

**The POWER GAUGE is built and it is the exe's throughout** (`lib/game/gauge.ts`).
A weapon's record byte `+0x14` says whether it has one — already read into
`Weapon.power` — and the fire button splits on it at 0x493796: with a gauge a
fresh press charges `[game+0x4e4]` by **0x50 a frame to 0xfff** and the throw
comes on the RELEASE or when it tops out; without one the press writes 1 and
fires now. The charge rides to `[pig+0x300]`, into the projectile constructor,
and becomes the flight speed as `row.speed * charge >> 12`. Fifty-two frames
to fill, which is three and a half seconds.

**So FIRE is a HELD action now** (`input/actions.ts`), and the scene is told
both edges through `setFiring`. A gun and a blade still go off on the rising
one; only a gauge weapon cares about the rest of the hold. A spec that only
`press`ed fire and never released it was passing by accident and is fixed —
a held action's press is idempotent, so the second one did nothing.

**The ARC is the engine's own number.** `0x4aa0d0` turned out not to be
"expire" at all — this repo had it recorded that way — but the physics world's
attach-a-force call: type 0x1357, the pig, gets the terminal-velocity force
and **everything else gets plain gravity, ten a frame squared**, with the
integrator's linear drag skipped for the projectile type outright. So
`PLAIN_GRAVITY` in `ballistics.ts` is read, not chosen, and a grenade is a
clean parabola. The same reading says a BULLET does not vanish at the end of
its range — it starts falling.

**The FUSE is decoded, and it is not three seconds — play said so and play was
right.** Row **+0x18** is the fuse in frames, not the damage: the projectile's
state machine (0x436938) starts a grenade in state 0, counts row +0x14 = three
frames, dispatches on row +0x1C's low byte to the arm that moves it to state 1
(0x4369e3), and state 1 is `cmp ecx,[esi+0B8h]` → state 6, which sets
`[proj+0x31] = 1` and it is over. `[proj+0xB8]` is row +0x18 plus `rand() & 7`,
written once in the constructor. So **150 frames and a little**, which at the
engine's own rate is a touch over five seconds — `fromExeFrames` in
ballistics.ts is that conversion and the second place to use it.

That was a self-inflicted error worth remembering: the row field was read as
damage "on its distribution" (zero for guns, a ladder for explosives) when
`fire.md` had already recorded, correctly, that it is compared against a
counter. **A distribution is a hint; an instruction is the answer.**

**The blast's REACH is decoded too** — `BLAST_REACH = 0x400`, a half-extent per
axis, from the last thing a projectile's update does: walk the pig list at
`[0x51EE18]` and set `[pig+0x180]` on everything inside ±0x400 on all three
(0x437775). What that flag MEANS is not followed and `grenade.ts` says so.
What is left invented is `BLAST_DAMAGE` — the same gap `SHOT_DAMAGE` has — and
the falloff across the box.

**The gauge shows whenever a weapon that HAS one is in hand**, not only while
it fills — which is what the original does with it. `charging()` returns 0
rather than null for those, and null for everything else.

Its art: `newpow3..7`, five 64×64 tiles laid left to right, measured rather
than guessed (5 and 6 are 61% identical and flat outside rows 9..29 — a
repeating middle), **clipped to their top 30 rows**, because below that every
column is the dashboard's own rgb(8,8,8) and blitting the tiles whole hangs a
black slab under the brass. Where the strip SITS is still eyework:
`pow.hud.layout.gauge`. `newpow1`, `newpow2` and `powg1` ship with them and are
deliberately NOT drawn — what they are has not been settled.

**`pow.give(19)` is how a grenade is reached at all.** No crate on the training
ground carries one — it hands out a bayonet and then a rifle — so the console
puts one in hand, the same way `pow.swapMap` picks a map. The remake's own.

### The grenade, second pass — play's list, 2026-08-07

Eight things, and half of them turned out to be readable.

**The angle was tracking all along and nothing showed it.** `scene.aim()` was
gated on `scrubsPose`, which is about whether there is an aiming CLIP for the
angle to scrub — and every thrown weapon is in that function's exclusion list,
because nothing thrown has one. So the needle went dead and the angle looked
frozen. The right test is the record's own `aims` bit. Two different questions
wearing one predicate.

**A grenade comes up at 45°, which is what the exe writes** — and that is a
process note as much as a constant. A remembered ~70° went in over the decoded
0x200 for one commit and came straight back out: "45 верно — я не так сказал —
сначала проверяем то что находим в движке." **An unambiguous decoded value gets
shipped and LOOKED AT before anything is substituted for it**; a remembered
figure is a reason to go and check the read, not to replace it. Play overrides
inferences — the wall envelope, the water, the clip playback — not clean
transcriptions nobody has seen yet.

**A thrown thing BOUNCES on its own numbers — decoded.** Row +0x10 is 1 for
every gun and 2 for everything lobbed, its only reader is inside the collision
code (0x4157a5), and the lobbed arm writes **0xFFF and 0x200 of 4096** onto the
collision record before resolving: almost perfectly elastic, almost
frictionless. That is play's "как камень отскакивать", and `LOB_BOUNCE` in
`grenade.ts` is it. A bullet's arm has none of it.

**Grenades sink.** Water is not a surface to skip off: `settle` checks
`isWater` and the region's own fitted `surface` before it checks the ground,
and a sunk grenade keeps falling to the bed. The sink rate is the remake's.

**A second F sets a live one off.** Play's, and `grenades.ts` says so at the
method — nothing in the exe's fire handler has been read for it.

**It is drawn as `WE_GREN`**, its own model out of `Chars/WEAPONS.MAD`
(`three/lobArt.ts`), free rather than bone-bound: the hand's copy un-resolves
each vertex against its bone's bind offset and a thing in flight has no bone.
Nothing draws a placeholder while it loads — a sphere kept "until the real one
lands" is a stand-in that outlives its excuse.

**The gauge, corrected twice.** The tile ORDER was right and MEASURED — mean
RGB distance across each seam is 28 / **2** / **2** / 38 for 3|4|5|6|7 against
107..181 for every wrong pairing — but clipping the tiles to their top thirty
rows cut the two ends in half, and there was no need for the clip at all:
index 0 is the TIM's transparent colour, so their black is a hole. And it is
**not a filling bar**: `powg1` is the SLIDER — 24×36 with its art eight pixels
wide and thirty-two tall — and it RUNS along the strip. `LAYOUT.gauge.track` is
where it travels and that is eyework.

**The EXPLOSION is in the projectile's DESTRUCTOR** — 0x432730, which
identifies itself by writing the projectile vtable 0x4BC468 back over the
object on its third instruction. That is why nothing in the update or the
constructor looked like a blast. It switches the kind through a 55-entry table
at 0x435A6C into forty arms, thirteen kilobytes of them, and **kind 24's is
effect `0x54` plus sound `12` (`E_1`) at 100/100** — with the row's +0x04 as
the effect's life and +0x08/+0x0C as its two parameters. No damage in the arm
at all, so the hurt comes from elsewhere.

**And the DAMAGE is decoded too — all of it, guns included.** It is not in the
weapon's record and not in a per-weapon switch; both were searched and both
searches were right. The physics world's contact loop calls the pig's
`vtable+0x54` (`Pig::OnHit`, 0x477390), which switches on the other body's
TYPE, and the arm for an **effect** gates on the effect's id being inside
`0x41..0x63` before asking `0x48CBA0` how much. That function is a **core of
512 units at full damage falling linearly to a QUARTER at the rim** — never to
nothing — and it bails to flat damage when the range is zero, which every gun's
is.

So **row +0x08 is the blast range and row +0x0C is the damage in 128ths**, and
the ladder is unmistakable: pistol and rifle 20 points, **sniper 40**, grenade
30, freeze grenade 60, guided missile 75, and the **medic dart 0** — it heals,
so it must not hurt. `SHOT_DAMAGE = 20` was invented and happened to be right
for two weapons out of thirteen; `damageOf(skill)` replaces it. Two terms of
the exe's range are left out and `grenade.ts` says which.

**The sound is wired** (`BATTLE_SOUNDS.blast`); the VISUAL still borrows the
break burst. `0x48CC90` turned out to be the effect's whole parameter-row
accessor — `0x4D61E8 + row*143 + offset`, scaled by `[0x4D6C88 + offset]`, with
the row index at `[effect+0xDC]` — so the one step left is which ROW id 0x54
takes. Init's id dispatch is spread through 0x487d80..0x4881d0 rather than
being a table.

That read also settles what row +0x04/+0x08/+0x0C are — an effect's life and
its two parameters, used by the every-fifth-frame TRAIL (0x4365f1, ids 0x5D and
0x5F) and by the blast alike — and rules out 0x4323f3, which is the
CONSTRUCTOR's switch and so the launch's noise.

### The grenade, third pass — 2026-08-07

**The gauge widget, measured properly.** Per assembled column the art's
vertical extent is tall and irregular out to x≈100, then **dead constant at
rows 1..37 from x 104 to 268**, then tall again: the flat middle is the TROUGH
and the ends are ornament. So the slider travels 108..264, not across the whole
320 — play saw it ("набор силы идёт по шкале, а не через весь виджет").
`newpow1`/`newpow2` are the missing piece at the top left and are drawn now;
the margin went to 0 to close the gap under it. Everything about WHERE remains
`pow.hud.layout.gauge`.

**A grenade SKIMS water while it has the speed.** The lobbed collision arm is
nearly elastic and the exe does not exempt water from it, so a flat throw skips
a pond exactly as it skips the ground; what sinks it is running out of speed,
and the threshold is `BOUNCE_CUTOFF`, the only figure the engine has for "too
slow to bounce". Play named both halves, one turn apart.

**It no longer falls through slopes.** The substep was the blast's 512 units; a
grenade is 35 across, and at 4500 a second a 512 step walks straight through a
tilted surface. It substeps by its own size now and is clamped above the ground
at the end of every one.

**No jumping behind a grenade.** `jumpRequested` is dropped while `firing` or
anything is in the air, on the same gate the sights use.

**`SWIM_SINK` was 280 against a pig 320 tall** — under to the eyebrows, which
is what play saw. It is eyework with nothing decoded behind it and it predates
the discovery that models are drawn at half size, so it halved with them.

### The grenade, fourth pass — and the effect row is FOUND, 2026-08-07

**The blast is parameter ROW 0 — the same row a thing breaking uses.** The row
comes from a setter, `0x48CCC0`, whose twenty callers are all jump-table arms
inside `Effect::Init`; the dispatch is `slot = [0x489680 + id - 1]`,
`arm = [0x489574 + slot*4]` (0x4881e8). id 0x3e, the break burst, resolves to
row 0 — which is the CHECK, since `effects/notes.md` derived that from the other
end — and **id 0x54, the grenade's blast, is row 0 too**. What separates them is
the id (which is what decides whether it hurts) and the constructor's arguments.

So the missing explosion is not a missing row. It is **row 0's four other
STAGES**, through `0x48bff0` and `0x48c160`, each keyed on a row OFFSET through
`0x48CC90`. The remake draws one stage of five — the six-puff burst — which is
exactly why an explosion and a breaking look the same and neither looks like
much. `fire.md` has `0x48bff0` written out; that is the next job.

**The bounce REPLACES the surface's material, it does not multiply**, and play
felt it as friction eating the throw. Two different fields prove it: a tile's
pair goes onto the LANDSCAPE BODY's `+0x58`/`+0x5c` through `0x416560`, which is
what the solver multiplies; the lobbed arm writes the COLLISION RECORD's
`+0x24`/`+0x28` right before resolving. A grenade bounces at 0.9998 on grass and
on stone alike.

**The gauge fills in 1.7 s, not 3.4** — `EXE_FRAME_SECONDS` again, the third
place to need it. 0x50 a frame to 0xfff is 52 ENGINE frames.

**Is the blast range exact?** Nearly. `[0x4BD3FC]` reads 512.0, the same figure
the core uses, so it cancels against the core's own subtraction and the rim
lands at `row+0x08 + the struck body's own term`. The remake uses `row+0x08`
alone — the shape is exact, the rim is within about ten per cent, and what that
float on the body is has not been read.

**The camera does NOT avoid walls in the original, and that IS decoded.**
`Map::IsBlocked` has ten callers and not one is in the camera code
(0x49e000..0x4a6000); the camera's only world query is `Map::SampleHeight`, at
fifteen sites, keeping itself off the ground. There is no line-of-sight test to
restore, so swinging round an obstacle is the remake's invention. **Built
anyway, by request** — and kept in one file with the whole argument at the top
so it can be deleted in one go: `lib/game/sightline.ts` finds the nearest
heading either side that can SEE the subject, sampling the LINE rather than
just the camera point, and only `chase.ride` uses it. The ordinary chase does
not dodge — a pig you are driving is where you already know it is.

**And the mesh is lifted by the body's own radius.** The point that bounces is
the projectile's CENTRE, so a grenade resting on the ground was half buried and
its downhill half went under a slope.

### The grenade, fifth pass — where the energy was going, 2026-08-07

**`bounceOff` carries a PIG's damping and a grenade must not use it.** Play:
"трение всё ещё съедает энергию — в игре граната всё время хоть чуть-чуть да
катится." Two separate things were wrong and neither was the coefficient:

1. **The `>> 3`.** `bounceOff` returns the normal part as `e * vn / 8`, and that
   eighth is `bounceSpeed`'s — the PIG's impact handler (0x4711d8 → 0x471247),
   which stops a pig ricocheting off its own behind. The SOLVER has no such
   term: `e = restitutionA * restitutionB` and nothing else (0x40f690). A
   projectile never reaches the pig's handler, so at restitution 0.9998 it was
   still coming back with an eighth of what it arrived with.
2. **Friction once per CONTACT, not once per SUB-STEP.** The scene walks a
   grenade in steps of its own size and every step that ended below the surface
   took another 12.5% off the tangential. `bounceLob` now resolves nothing when
   the thing is already leaving the surface, which is the exe's own condition.

`bounceLob` does its own solve for exactly those two reasons and says so.

**Water gets its OWN pair.** At the ground's near-perfect 0xFFF a grenade
skipped on the spot for ever and never sank — "застопорилась о воду и стоит на
поверхности". `WATER_BOUNCE` takes something out of each skip, and `sinkLob` no
longer damps the VERTICAL, because damping the one component gravity works
through is what held it up there. All of it is the remake's outright: water is
ART in this engine, not a body, so nothing in the exe collides with it.

**The blast's rim is capped at the range field**, and the reason it needed a cap
is worth keeping: the exe bounds a blast by the CONTACT, since `Pig::OnHit` only
fires for bodies that touch — and an effect's body is **35 units** to start with
(0x4a8f42, the same as a bullet's, and the type map at 0x4a8ea0 confirms which
arm 0x135E takes). So the exe's blast must GROW to reach anybody, and how far it
grows is in row 0's unread stages. Uncapped the formula alone reaches 3979 units,
which play called too big.

**The gauge's track is the trough END TO END, 104..268.** Insetting it by half
the slider's box was wrong twice: it moved the START, which was never the
complaint, and the box is 24 wide while the art inside it is eight (cols 8..15),
so the art is within four pixels of wherever the slider is put.

**And the blast now HOLDS the camera.** That is why play kept reporting no
explosion: the camera comes off a grenade the frame it stops existing, so the
puffs were happening behind the player. `onBlast` starts the same wait a broken
dummy starts.

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
- **A bridge the script has placed still cannot be WALKED on.** Its pieces are
  shape kind 1 and so bodiless, which is the same parked question the first
  bridge has. The script now raises it at the right moment; climbing it is
  still its own job.
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

**Grenades are built and the next thing they want is PLAY** — the section
above says which numbers are the remake's. The two to correct first are
`FUSE_SECONDS` and `BLAST_RADIUS` in `lib/game/grenade.ts`, and after those the
gauge's own art placement (`pow.hud.layout.gauge`). The thread left mid-pull in
the binary is the projectile's state machine at 0x436938: seven arms on
`[proj+0xB4]`, a per-state timer at `[proj+0xA8]` against row +0x14, and a
second dispatch through row +0x1C. Somewhere in there is the fuse, and with it
what a grenade does when it stops rolling.

Everything below this line is older, and the shot's own six items are DONE —
see "The SHOT, end to end".

1. **The map SCRIPT — decoded and BUILT.** See below; what is left of it is a
   short list at the end of `../pigs-disasm/script/notes.md`, and none of it
   blocks anything.

Two smaller ones noted in play and not acted on: **a dying pig should come
apart and leave its boots** (the exe already splits the two deaths and so
does `lib/game/health.ts` — `died` and `gibbed` — but both wear clip 47 for
now), and **`THREE.Clock` is deprecated** in favour of `THREE.Timer`.

One spec fails and it is NOT from this work: `e2e/002/hud.spec.ts:168`, the
name plate dropping on the move, fails at 300fc6e too — checked by checking
that commit out and running it.

- **A crate is walked THROUGH, where the original is shouldered into.** The
  records say a pickup is solid — shape kind 0, a real 3×3×4 box — and play
  remembers pushing at one before it goes. Making it solid, though, means
  the pig can never be inside it, and this engine's step refuses to END
  inside a box, so the collect-on-overlap test never fires and the crate
  becomes a thing to bump into forever. It is deliberately kept OUT of the
  collision world until the two halves are reconciled (collect off the
  step's target, or a shove that resolves) — `lib/game/obstacles.ts` says so
  where it drops them.
- **A pig carries skills, takes one in hand, aims it, and SWINGS it — but
  only the five that swing.**
  Crates are collected by walking into them (`three/battle.ts` →
  `lib/game/pickups.ts`), the contents go into fifteen slots with the exe's
  own stacking rules (`lib/game/inventory.ts`), and `R` opens the game's own
  menu over them — `MENUTIMS.MAD`'s frame with an icon per skill and
  `SELECT.BMP` over the cursor, driving in from the right with `S_OPEN`
  behind it (`ui/skillMenu.ts`). `Space` there sets `pig.holding`, and from
  that the scene plays the weapon's getting-it-out clip, hangs its model on
  the pig's forearm bone and holds its aiming pose at the angle `Q`/`E`
  drive (`lib/game/weapons.ts`, `lib/game/aim.ts`, `three/heldWeapon.ts`).
  `F` uses it, and the five hand-to-hand skills — 1 TROTTER, 2 KNIFE,
  3 BAYONET, 4 SWORD, 5 CATTLE PROD — are the ones that answer, because the
  original resolves those by CONTACT and the rest by a projectile that is
  still unbuilt.

  **The swing is four ANIMATION EVENTS, not a timer**, and that is the whole
  shape of it. Fire writes a ten-frame fuse (`Pig::Fire` 0x469360); the fuse
  runs out and `Pig::Attack` (0x469610) puts the record's own clip on the
  PRIMARY channel and clears the weapon one — 22 for the bayonet, "Bayonet",
  so a swing is whole-body and the aiming pose comes off for it. That clip
  carries four key-frame events at phases 1243/1356/1469/1582, frames 11 to 14
  of 36, and each one calls `Pig::HandToHandStrike` (0x475a00). Walking is
  refused from the button down to the clip's end and turning for the clip
  (0x46afd5, 0x46af43); the round is spent as the clip goes on, and a pig out
  of them puts the weapon away. `lib/game/melee.ts` is the rules,
  `three/swing.ts` the blade, `../pigs-disasm/weapons/melee.md` the read.

  A strike is THREE points off bone 5, the hand — the weapon's row of the
  table at 0x4d0ee0 in full, halved, and the bone itself — tested per AXIS
  against 170/360/170 and then against a 67.5° cone off the attacker's facing.
  **Whether that offset is model units or world units is the one judgement in
  it**: the exe builds the point off a pose matrix whose scale is not read,
  and taken as world units a bayonet would reach one and a half pigs past a
  blade drawn half that long. So it rides the bone through the mesh's own
  `MODEL_SCALE` and lands where the art is. Written up in `lib/game/melee.ts`.

  **A swing has its own CAMERA, and it is the exe's.** `Pig::Fire` calls
  `0x49f740(0x13, 0)` and mode 19 is asked for by that one site out of 82 —
  its handler (0x4a4940, flag-0 branch) stands the camera at `pigYaw − 612` of
  4096, **53.8° round from straight behind**, where the ordinary chase (mode
  0) adds no offset at all, and at distance **1700** out of the per-mode table
  at 0x4d9528 against the chase's 3072. `three/chase.ts` carries both as
  `MELEE_TURN` and `MELEE_CLOSE` — the swing and the PROPORTION, since the
  rig's own distances are the remake's. **The SIDE is play's and it is the
  exe's sign REVERSED**: read literally the camera goes round to the pig's
  left and the original goes right, so the turn is added. Same shape as the
  tile table's turn direction — a yaw sign that flips somewhere between the
  exe and our pixels and has not been found. The remake holds the view for
  the length of the swing and then glides back, which is its own bracket:
  nothing has been found that ends the mode in the exe. On a HIT the original
  moves again, to mode 2 aimed at the victim (0x4760ab) — not done.

  **The AIM ANGLE has no part in the strike, and that is SETTLED — do not
  re-add it.** `Pig::HandToHandStrike` never reads `[pig+0x304]`, and for the
  only two melee weapons that could carry an angle 0x46a891 pins it to zero,
  so a bayonet strikes level however the player has pointed it. Steering the
  blade with the aim was built once, on the reading that the remake lets those
  two aim and so ought to honour it, and taken straight back out: **the exe
  not reading a value is not an ambiguity to fill in, it IS the behaviour.**
  (It would also have decided almost nothing — `STRIKE_RISE` is 360 against a
  pig 320 tall, so a body within a body-height is caught either way.)

  Two things in it are decoded and deliberately NOT applied: the KNOCKBACK
  (75 for a bayonet, at 45° up along the bearing — only the acting pig has a
  locomotion state, so there is nothing to push) and the BATTLE CRY
  `Pig::Fire` plays out of the squad's own rotating counter. CAMP fields ONE
  pig, so a swing has nothing to hit there — `pow.swapMap('LIBERATE')`.

  **The training DUMMY is a target, and it has ONE point.** Its class is
  vtable **0x4bd440** (constructor 0x48d020, list head `[0x537df0]`), it
  answers the same `[vtbl+0x34]` a pig does, and its health comes from the
  table at 0x4d6d18 by record type: every type the strike answers to —
  0x43/0x44/0x45/0x4b — is 128 of the engine's 128ths, **one whole point**, so
  anything at all flattens it. `lib/game/targets.ts` matches them by MODEL
  NAME and CAMP carries eleven.

  Getting there cost a wrong turn worth not repeating: the class was first
  guessed at 0x4bd238 from the melee's `[+0x84]` field test — thirty points,
  three hits — and play said one ("манекены 1 очко") before the binary did.
  An object identified by a field test is a guess until the code that WRITES
  the list pointer is found. Same lesson as the weapon's bone field.

  **All eleven are live, and THAT is the remake's own.** 0x4762e0 does not
  walk a list; it takes the single object at `[0x537df0]`, so most of CAMP's
  are not the one being struck at any moment, and what moves that pointer is
  the map SCRIPT. Play also says knocking the first one down drops a crate in
  BY PARACHUTE, and the tutorial's step list agrees — a step ends on "killing
  the dummy, picking up the crate, or reaching somewhere". That drop is the
  same script that raises the second bridge, and it is not built.

  What is still missing is the other kind of shot: the power gauge, the
  projectile and its damage. `[game+0x4e4]` charges 0x50 a frame to 0xfff and
  0x47a2b6 onwards is the per-weapon dispatcher, of which only the melee arm
  (0x469415) has been read.

  **The bayonet's pin is decoded and deliberately not applied.** 0x46a891
  forces the aim angle to zero for skills 3 BAYONET and 5 CATTLE PROD, so in
  the original those two cannot be aimed at all. The remake lets them aim
  like everything else, by request — the bayonet is the training ground's
  first weapon and tilting it is the whole of what a player does with it
  until firing exists. One `if` in `clampAim` restores it. **The swing did
  not change that**: the strike is built off the HAND BONE and never reads
  the angle, so tilting a bayonet is cosmetic — it moves the held pose and
  nothing else. Whether to pin it now that the bayonet DOES something is the
  user's call and has not been asked.

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
