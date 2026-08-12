# Pigs of Worldwar — orientation

A fan remake of Gremlin's *Hogs of War* (2000) in Electron + Three.js +
TypeScript. It reads assets straight out of a legally installed copy; nothing
from the original is redistributed. This repo normally sits **inside** the
game folder, so `..` is the installation.

Start with [README.md](README.md) (how to play and run), then
[docs/testing.md](docs/testing.md) and [docs/formats.md](docs/formats.md).
**[docs/todo.md](docs/todo.md) is the WORK LIST** — everything open, in the order
it is worth doing, each item carrying what is already measured and what the next
move is. This file is the reference; that one is what to pick up next.
Reverse-engineering findings live in the **disasm repo** — notes plus the
scripts that prove them. Every bare path below of the form `anim/notes.md`,
`movement/notes.md`, `effects/notes.md` and so on is a file inside it, never
one in this tree. It is deliberately named and not linked: it is checked out
alongside this one and gets a worktree of its own whenever this repo does, so
any relative path written here would be right in one checkout and wrong in
the next.

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
site that plays it), never off the table. `animations/notes.md`
and `parachute/notes.md`.

## How the code is laid out — SEPARATE DOMAINS, and a check that says so

`npm run boundaries` is the authority, not this list: one table of who may not
import whom, run ahead of the e2e build. TypeScript never caught any of this —
every breach the repo has had compiled cleanly.

- `src/lib/formats/` — one pure reader per format (mad, tim, mgl, bmp, model,
  hir, mcap, pmg, ptg, pog, srl). Bytes in, structures out. May not know the
  rules.
- `src/lib/game/` — **the ENGINE**: the rules AND the battle, poses included —
  `clipPose.ts` samples a clip, `skeleton.ts` walks the bone chain and
  `bonePose.ts` answers where the muzzle, the blade and the scope's eye are,
  so nothing has to pose a mesh to find out. `muster.ts` says
  who a map fields and stands them on it; `engine.ts` BUILDS the battle —
  parsed map data in, something that steps with `update(delta)` out — so a
  battle can be assembled with no scene to assemble it in, which
  `e2e/000/engine-headless.spec.ts` runs in plain Node to prove;
  `battle.ts` is one frame's order of events; `attack.ts` the fire button, the gauge and the
  fuse; `sights.ts` the aim, the tremor and the zoom; `bullets.ts`, `lobs.ts`,
  `strikes.ts` the weapons and every verdict about what they hit; `scenery.ts`
  the crates, the map script and the collision world; `airDrop.ts`/`dropIn.ts`
  the descents; `effectField.ts`, `damage.ts`, `anim.ts` the lists the battle
  WAITS on. No three, no Electron, no DOM: it can be stepped headless.
- `src/renderer/src/three/` — **graphics, and only that**. It builds art around
  an engine and reads `battle.view()` once the frame has run. It ticks nothing
  (`engine.update(delta)` is the whole game frame) and it ANIMATES nothing: the
  pose is the engine's and `wear.ts` writes it onto the bones. It may not
  import `ui/` or `audio/` at all.
- `src/renderer/src/audio/` — **sound, and only that**. `battleSound.ts`
  assembles the domain and subscribes it to the bus; it knows nothing about
  what is drawn.
- `src/renderer/src/input/` — drives the ENGINE (`Battle`), never the scene,
  and plays nothing.
- `src/renderer/src/ui/` — one module per view, and `battle.ts` is the
  COMPOSITION ROOT: it builds the bus and hangs the domains off it.
- `src/renderer/src/contracts/` — the shapes two domains share, importing
  nobody: `overlay.ts` what the scene projects for the dashboard, `sound.ts`
  the two polls the scene owes sound.
- `src/main/` — `index.ts` lifecycle only, `gameDir.ts` locating the install,
  `assets.ts` loading through the readers, `ipc.ts` the IPC surface.

**The engine steps in FIXED quanta, and rolls from ONE stream.**
`engine.update(delta)` accumulates real time and runs whole `STEP_SECONDS`
steps, returning how many; `alpha()` is how far into the next one the clock
stands, which is what the scene draws the acting pig between. Chance is a port
like any other — `lib/game/random.ts`, seeded per battle, threaded to the drop's
stagger, the sights' tremor and the smoke. Both together are what lockstep
needs: same seed, same inputs, same battle, proved in
`e2e/000/engine-headless.spec.ts`. Never reach for `Math.random` in `lib/game`.

**The renderer draws a SNAPSHOT, not the engine.** `engine.snapshot()` is one
flat reading of the battle — numbers, strings and arrays of those, nothing live
(`lib/game/snapshot.ts`). Everything with an identity carries an id: pigs,
bullets, grenades, crates. The pose is NOT on it — the four numbers that say
which clip and how far into it are, and `three/wear.ts` works the bones out
with the engine's own sampler. The debug surface still reads the engine
directly; it is test-only and in-process.

**The engine ANNOUNCES; it does not show.** `lib/game/events.ts` is one bus,
and the renderer and the audio bank are independent listeners on it — neither
knows the other exists. Three things are deliberately NOT events, because the
battle waits on them and a wait is a rule: the crate's descent, the pose port
(`lib/game/pose.ts` — where a bone is, answered today by three, tomorrow by
forward kinematics), and the two polls in `contracts/sound.ts`.

Keep modules small and single-purpose; that split was an explicit request.
`battle.ts` reached 1365 lines doing every job in the game and was taken apart
— do that again rather than letting one file grow a second concern.

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
`turns/notes.md`.

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
`parachute/notes.md`.

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
`effects/notes.md` the read.

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
`script/notes.md` the read; `pow.debug.script()` says what is
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
at all. What it has is the BURST: colour 0x4210 — sixteen of thirty-one on
every channel, the exact default the particle setter compares against — fanned
round the horizontal and RISING. So a hit makes rings and a breaking makes
smoke, and they are not the same code path. `onBroken` in `three/battle.ts` is
the hook, the same way the exe hangs it on the object rather than on the blow.

Two things this paragraph used to say are now WRONG and corrected below: it is
not six particles but fourteen over three bursts plus two clouds of seventy,
and the byte the engine subtracts from the y velocity is **gravity**, not
buoyancy — the engine's world is +y UP. Both are settled; see the grenade's
last pass at the end of this file, and `effects/notes.md`.

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
wrong and is gone. `damage/notes.md`.

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
(0x470944, and the parachute's 0x4717f5). `lib/game/clipPose.ts` samples those with
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
the exe — see `movement/notes.md` for the derivation of
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
jitter and nothing else. `anim/audio-events.md` has the full
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

**FOOTSTEPS are decoded end to end** and are not a pick at all — see "A HOOF
KNOWS WHAT IT IS STANDING ON" below. When the hoof lands is a key-frame event
on the clip (`lib/game/footsteps.ts`), what it lands on is the tile's terrain
type through a twelve-way switch (`SURFACE_SOUNDS` in `audio/battle.ts`), and
the mix — 45 or 30 minus `rand()&15`, pitched 92/100/108 by which hoof — is
the exe's own.

### The SHOT, end to end

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
   (`audio/pigVoice.ts`, decoded in `speech/pigs.md`):
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

### The beat after the blow

Play, straight after: "останавливается таймер и показывается как ящик на
парашюте спускается… после попадания пару секунд показывается ещё то место, а
только потом запускается таймер и показывается свин." All of it turned out to
be one wait in the binary and it is now built (`lib/game/aftermath.ts`,
decoded in `turns/aftermath.md`).

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

### The scope is bolted to the HAND

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

### The SIGHTS: the eye is sampled once a frame, the sniper zooms

Play: "дрожание совсем не то — щас плавает, а в оригинале прям дрожит /
прожектайлы летят через стены / снайперский прицел начинает с малого зума и
автоматом увеличивается до предела." All three are done and two of them are
decoded outright.

**The eye is SAMPLED ONCE AN ENGINE FRAME**, and that turned out to matter
more than the tremor did. Measured in play, the scope camera moved on 267 of
289 rendered frames — the mount is on a bone the pose interpolates, so the
breath glided however the drift was shaped. Holding the eye between engine
frames (`three/battle.ts`, `scopeEye`) inverts it: 259 of 290 frames now hold
perfectly still and the rest jump, biggest step 2.16 against a mean of 0.13.
The exe places this camera once a game frame; sampling an interpolated
skeleton at sixty was the bug.

**The camera's own shake is the wrong kind** — 0x49fea0 jitters all three axes and
decays the amplitude every frame (0x4a0002), which is a blast, not something held.
Where the tremor DID come from is at the end of this file.

**The sniper's magnification is the view manager's**, and it closed a question
`fire.md` had carried from the start. `afSetZoom` is a library entry at
`[0x537fd4]`; every caller of the setter passes zero, and the ADDER has one
caller — for skill 11 and skill 64 only, the input handler creeps the zoom in
by **0x20 a frame** toward **0x1000** (0x495e75). The same handler scales the
aim step by `(0x1000 − zoom) >> 12`, floored, so the sights get finer the
closer they look. `lib/game/zoom.ts` has all of it. What 0x1000 does to a
field of view IS read now (2026-08-11, `library/notes.md` in the disasm repo —
the library turned out to be `Data/_d3d.dll`, in the install all along):
`afSetZoom` sets a target of `15 + 45·z/4096` fifteenths of the base focal
length, so full zoom is **exactly ×4** — `SCOPE_MAGNIFY = 4` in
`three/chase.ts` was the original's own number — and the library glides the
live zoom a third of the gap per frame, which the remake does not yet.

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
DAMAGE (`SHOT_DAMAGE = 20` is invented), where a no-gauge weapon's charge
becomes 0xFFF, what bit 0 of a body's `+0x44` means at 0x47a24b, the melee's
own battle cry — the same `0x43af70` call, not yet wired to a swing — and
which mode number the wait above actually is. (The sniper's magnification
used to be on this list; it is read now — exactly ×4, see the zoom paragraph
above.)

### One thing at a time, and the sights hold still

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

**`fire.md` lists every place a dedicated scope tremor is NOT**, so that search is
not run a sixth time: `Pig::Aim`, the shot's angle read, both branches of the rifle
cam, `Camera::Shake`, the engine's terrain-gated random walk, the view manager's
constructor seeding, `0x44E620` and `0x46a960`, and the camera's own accessors.

### The beat has a ceiling, the crate has a voice

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

**The tremor is the analogue STICK.** The aim view's handler ends by unpacking six
signed bytes out of `[game+0x444]` and `[game+0x44C]`, halving them and feeding them on
every frame no direction is held (0x495699 onwards). On the machine this was made for
the sights are wired to a stick and a resting stick reads a few units either way, a
different few every frame; on a keyboard those bytes are zero, which is why the sights
were dead still and every invented substitute felt wrong. Where that reading GOES took
five more passes — see the last section of this file.

### The wait was cutting off the very thing it waited for

Play, again: "всё ещё анимация сброса ящика сильно рано прерывает предыдущую
анимацию." The gate was not the problem — `effects.busy()` is the right test
for the break. The problem was one line further down: the aftermath block put
`ANIM.IDLE` on the pig on every frame of the wait, and **asking for a clip
cancels a committed one** (`lib/game/anim.ts`). A bayonet strikes on frames 11
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

**And a landed crate is put back ON its spot.** Play: "коробки падают но
зависают чуть выше земли", and it was 29.9 units, measured. A descent leaves the
engine's list on the step it lands, so the last frame that DREW it drew it in
the air — at a height tweened between the two steps before it — and nothing
afterwards ever moved that mesh again. `props.restingY` had been carrying the
answer since the descent was built and nobody called it; `airDropArt.land`
does, and `e2e/002/strike.spec.ts` now checks every crate against its record's
own resting place. The record's y is exact, to within a unit of the terrain on
every crate CAMP carries, so there was never anything wrong with the placement.

And **`SETTLE` is half a second, not one**, which is the same fifteen frames.
`FRAME_SECONDS` here is 1/15, deliberately stretched from the engine's rate so
the walk reads right against half-scale models — so every timer taken off the
exe **in frames comes out twice as long as the original ran it**. Fifteen
frames undistorted is 0.5 s, which is exactly what play asked for. Worth
remembering the next time a decoded frame count feels sluggish; the constant is
now written in seconds and says why.

### GRENADES: the gauge, the fuse and the blast's reach

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

**`BLAST_REACH = 0x400` is NOT the blast's reach** — that reading is dead, and
what the flag means is read now (2026-08-11). The last thing a projectile's
update does is walk the pig list at `[0x51EE18]` and set `[pig+0x180]` on
everything inside ±0x400 on all three axes (0x437775); that byte has exactly two
readers and both are in the ANIMATION picker (0x46F457, 0x4721B7), where it puts
clip 0x21 on. **A pig with a live projectile within a tile of it COWERS.** It has
nothing to do with damage, and the note that offered it as a candidate for "who
is caught by a blast" was wrong. What decides that is still open — see the blast
paragraph further down and `weapons/fire.md`.

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

### GRENADES: the arc, the angle, the bounce and the blast

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

### GRENADES: the gauge widget, the skim, the substep

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

### GRENADES: the effect ROW is found

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
much. **DONE the next day**: both spawners are decoded and all five stages are
built. See the fifth pass at the end of this file.

**The bounce MULTIPLIES the surface's material** — see "the BOUNCE was wrong all
along" below for the read, and for the two words this paragraph used to have wrong.

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

### GRENADES: where the energy was going

**`bounceOff` carries a PIG's damping and a grenade must not use it.** Play:
"трение всё ещё съедает энергию — в игре граната всё время хоть чуть-чуть да
катится." Two separate things were wrong and neither was the coefficient:

1. **The `>> 3`.** `bounceOff` returns the normal part as `e * vn / 8`, and that
   eighth is `bounceSpeed`'s — the PIG's impact handler (0x4711d8 → 0x471247),
   which stops a pig ricocheting off its own behind. The SOLVER has no such
   term: `e = restitutionA * restitutionB` and nothing else (0x40f690). A
   projectile never reaches the pig's handler, so it was coming back with an
   eighth of what it arrived with on top of everything else being wrong.
2. **Friction once per CONTACT, not once per SUB-STEP.** The scene walks a
   grenade in steps of its own size and every step that ended below the surface
   took another 12.5% off the tangential. `bounceLob` now resolves nothing when
   the thing is already leaving the surface, which is the exe's own condition.

`bounceLob` does its own solve for exactly those two reasons and says so.

**The blast's range is row +0x04 = 1024, and there is no cap** — the first
reading took it off +0x08 by matching Init's stack slots to `0x487AD0`'s
arguments in ORDER instead of counting the frame. Counted instruction by
instruction (0x487b23..0x487b58): Init's arg 5, the ID, is `0x487AD0`'s arg 3;
Init's arg 7, which becomes `[effect+0x60]`, is arg **4**; Init's arg 10, the
damage, is arg 7. The damage was right all along.

With 1024 the falloff bottoms out on its own at about **1195 units** — full
damage inside one tile, nothing past two and a bit — so the stopgap cap is gone,
and so is the theory that a blast has to GROW to reach anybody. That only
existed to reconcile a 2600 range with a 35-unit effect body (0x4a8f42, reached
by `jmp [eax*4+0x4a90CC]` where `eax = type - 0x1357`). Wrong premise, invented
mechanism. **When a number does not fit, suspect the reading before inventing
machinery to justify it.**

**The gauge's track is the trough END TO END, 104..268.** Insetting it by half
the slider's box was wrong twice: it moved the START, which was never the
complaint, and the box is 24 wide while the art inside it is eight (cols 8..15),
so the art is within four pixels of wherever the slider is put.

**And the blast now HOLDS the camera.** That is why play kept reporting no
explosion: the camera comes off a grenade the frame it stops existing, so the
puffs were happening behind the player. `onBlast` starts the same wait a broken
dummy starts.

### GRENADES: the explosion's LOOK, and +y is UP

Play: "эффект взрыва всё ещё не работает верно". It was not: the remake was
drawing **one stage of five**, and the vertical of the whole effect system was
upside down.

**+y is UP in the engine's world.** Read off the physics rather than argued
from the models: the world builds three force generators and the direction is
`(0,-1,0)` in all three, one of them gravity (`movement/notes.md`
already had this written down), so falling is y DECREASING. The effect table
agrees from four independent directions — a burst's vertical launch is
`rand()%100 * p * 3/100` and cannot be negative; row 15 stacks three shockwave
rings at +100, +300 and +600; a damage number lays its trail at `y + 100` and a
damage number floats up; and row 0's cloud fires in a cone about +y against a
force that decelerates it. So `[+0x1d]` and `[+0x12]` are **gravity**, and the
note that called them buoyancy — which had stood since the melee rings — was
wrong. The remake stays Y-down and flips the sign once, in `lib/game/cloud.ts`.

**Row 0 is five stages, and the two big ones are not particles.** `0x48bff0`
hangs its own array of 20-byte records off `[child+0x70]` — position, velocity,
colour, one byte of gravity — stepped by `0x48a7e0` and drawn one SPRITE each by
`0x489fa0`, both gated on that pointer being non-null. Seventy of them, twice: a
dark red cloud on frame 1 and a near-black one on frame 2, each fired in a 44°
cone with a random 1..2 on the speed, shrinking from twice its final size over
twenty frames. `0x48c160` adds two more four-particle bursts. So a blast is
**140 sprites and 14 puffs** where it used to be six, and it is the same picture
a crate coming apart makes, because both ids resolve to the same arm.

**`0x48c160` also PINNED the burst's argument order**, which had been "assigned
to fit" since the melee pass. The check costs nothing: the parameter a stage is
GATED on is the one that becomes the age step, exactly as a ring is gated on its
own. The three numbers the old note guessed at are not the launch at all — they
are `param(base+9..11)`, still unidentified.

**The effect system now runs at the ENGINE's rate.** It was on `FRAME_SECONDS`,
which is the walk's stretched 1/15 and exists so a pig at half scale does not
sprint; nothing in here counts a stride. At 1/15 every timer came out twice as
long and a twenty-frame fireball took a second and a third to go off.
`EXE_FRAME_SECONDS`, and this is the fourth place to need it — the melee rings
got twice as fast with it, deliberately.

Two scalars are the remake's own and say so at the field: `BLOB_UNIT`, because
a sprite's size is handed to the library and the unit is the library's (the
library is `_d3d.dll`'s `afAdd2dPolyToSortList`, readable since 2026-08-11 —
`library/notes.md`; NOT wh32LIB.DLL, which is the LaserLok copy protection), and
the split where a puff's DRIFT rides `MODEL_SCALE` while the point it started
from does not — same argument as the ring's radius.

### GRENADES: the BOUNCE was wrong all along

Play, in one line each: "не должна прыгать как на батуте", "о сушу прыгает как от
воды", "по воде застревает и не тонет — должен быть эффект лягушки". Three
symptoms, one cause.

**`+0x24`/`+0x28` were never a material pair.** They are two of three
consecutive WORDS — `+0x24`, `+0x26`, `+0x28` — read and written as a group and
copied into three globals together (0x415cc5). A vector, on a record whose other
fields are a segment's start, its end and a squared length: `0x4156d0` is a
segment query and nothing on it is a material. The 0.9998 restitution this repo
carried for four passes came from misreading one word of it.

**And the near-elastic 0.01/0.99 surface is the WALL, pig-only.** `ballistics.ts`
already had it right as `WALL_MATERIAL`; what was missing is that the branch is
gated on the contacting body's owner being type **0x1357** (0x40e964). A thrown
thing never gets it.

**What a projectile brings is row `+0x20`/`+0x22`**, handed to `0x416560` on its
own body in the constructor (0x4323e2): for a plain grenade **0.30 friction, 0.80
restitution**. The solver multiplies the two bodies' pairs, so against grass
(0.40/0.40) it lands on **0.12 and 0.32** — a hop or two, then a long roll. Skill
26's kind is 0.001 on both and does not bounce at all; it sticks.

`WATER_BOUNCE` is deleted: water is one surface among the twelve, and the FROG
falls out of the numbers rather than needing its own pair — a skip needs the
tangential speed to survive, which 0.12 friction does, not the normal one to come
back whole. What kept a grenade standing on a pond was the skip gate testing
TOTAL speed: something sliding across water keeps that for ever. It tests the
DROP now.

**Three visual corrections in the same pass.** The gauge's slider travels its
VISIBLE marker (eight pixels at cols 8..15 of a 24-wide box) rather than the box,
because centring the box put the marker four pixels past the trough. The clouds
are NOT additive — additive light cannot darken, and row 0's second cloud is a
near-black whose whole job is to be smoke ("чёрного дыма нет на взрыве"); the
blend mode lives in the library — `_d3d.dll`, readable since 2026-08-11
(`library/notes.md`), not the wh32LIB this used to blame — so this is the
remake's pick until someone reads it. And a landing CRATE takes row 0's smoke without its fire (`DUST_EFFECT`) —
it was borrowing the whole row, so once the row grew a fireball a crate arriving
set one off ("коробка когда падает — искрит").

### GRENADES: the trail, the water, and Coulomb friction

Play: "давай лучше дизасми — там ведь всё стоит в движке". It did.

**The TRAIL is in the CONSTRUCTOR.** Both of the projectile update's per-kind
dispatches send a plain grenade to the exit, which is why looking there found
nothing. `0x43247b` — the arm the whole grenade family takes — builds a PARENTED
effect of id **0x15** at zero offset before anything else, so it follows the
grenade. That effect has no parameter row at all (its Init arm never calls
`0x48ccc0`, so the twelve-stage tail refuses it), and its update lays **six
particles a frame evenly along the segment travelled** (0x48b024). Particle type
0x16 is grey 0x4210, an age step of 0x14 so five frames, and no velocity, jitter
or gravity. Six a frame for five frames is thirty alive — exactly the capacity id
0x15 draws from Init's count table, which is the check on the whole read.
`lib/game/trail.ts`, `three/lobTrail.ts`. **No fire in it**: play asked for smoke
and fire, and the engine's trail is smoke.

**Water is bit 6 of the tile byte, and a thrown thing goes THROUGH.** The
projectile's own handler (0x437a57) puts a splash projectile at the water height,
plays sound 0x28, and touches its velocity nowhere — no bounce, no material,
nothing to stop it. `SKIPS_ON_WATER` is deleted along with `WATER_BOUNCE`; the
skip play wanted is a LAND behaviour and falls out of the friction below.

**Friction is a Coulomb IMPULSE and this had it as a fraction of the slide.**
The solver normalises the tangential (0x4110c1, after the epsilon test at
0x411084) and passes the friction product in as a scalar (0x40f980); restitution
enters as the standard `(1 + e)` (0x40f6b4, where `[0x4BC1B4]` is −1). A
direction times a scalar is not a fraction of a speed, and that is the whole of
why a grenade would not roll: at rest on flat ground the contact carries only
gravity's own increment, so the friction impulse available each frame is tiny.
The magnitude inside `0x410F70` is not accounted for instruction by instruction —
it is inlined operator overloading — so the remake uses the textbook
`mu * (1 + e) * |vn|`, capped at what would stop the slide, and says which half
is read and which is inferred.

**The blast has NO ground test** — the destructor's arm is unconditional and its
tail (0x4357f9) is camera work. So the clouds blend by their own authored colour
instead: (16,0,0) is light and ADDS, which is the flash; (4,3,0) comes out of the
draw's gain as (25,19,0) and COVERS, which is the black smoke. Additive light
cannot darken, which is exactly why the smoke was missing — and a dark red laid
over the map is what play was reading as thrown dirt.

**And the gauge slider, MEASURED at last.** `powg1`'s transparent colour is
palette index **11** (0x0000), not index 0 (which is a real 0x0421). Per column
the drawn-texel counts are
`0,0,0,0,0,0,0,13,17,19,33,34,34,33,19,17,13,0,0,0,0,0,0,0` — the marker is **ten
pixels wide starting at x = 7**, not eight starting at 8. One pixel each side is
exactly what kept showing.

### GRENADES: water DOUSES it, and the maps have no depth

**A thrown thing that goes quietly into water DOES NOT GO OFF, and play
half-remembered it before the binary said so.** There is ONE water path, not two —
0x437a57 and 0x437bfb are arms of the same `OnHitLandscape` and both happen at the
same contact (the measurement is at the end of this section). The splash (tile bit 6,
0x437a57) goes at the water height, and then
the CONTACT arm (0x437bfb, gated on `0x4A6FA0` — tile bit **5** plus the DLL's own
per-texel mask through `[0x538128]`, the same pair `lib/game/watermask.ts`
builds) is the one that matters. Under **150 a frame** it plays FT_WATER, leaves
effect **0x0E**, and sets `[proj+0x84]`. That byte is the FIRST thing the
destructor tests (`4328c9`), and its branch has no effects and no sound at all.
So: splash, sink, and nothing else. `dousedByWater` in `lib/game/grenade.ts`.

Effect 0x0E is worth its own line: its Init arm writes the water height over its
own y (0x488c19) before reading parameter **row 2**, so the splash is drawn on the
SURFACE however deep the thing sank — which is why the grenade can go out of
sight and the splash still land where it went in. Row 2 is three near-white rings
at a lift of −500, a sixty-sprite cloud and a ten-particle burst; `SPLASH_EFFECT`
carries it and none of it is invented.

**And it no longer stops dead on contact** — play saw that immediately ("на воде
тупо при контакте застрял сразу"). Nothing holds it at the surface: gravity has
the vertical and only the sideways travel is damped, so it sinks to the bed and is
doused there.

**One water handler, not two, and the maps have NO DEPTH.** 0x437a57 and 0x437bfb are
arms of the same `Projectile::OnHitLandscape` (0x4377d0), so a thrown thing is untouched
until it reaches the ground and then gets the splash AND one of the two arms. Measured
over the shipped water — CAMP, BAY, ARCHI — `bed − water line` is **0** at the median
and 48 at the deepest anywhere: the maps author their water flat and the load step
raises everything under it to exactly that, so the surface and the bottom are the same
plane. Which is also why effect 0x0E snaps its own y to the water height.

So a couple of seconds of sinking cannot come from the terrain or the exe — the
world's three force generators are all gravity-flavoured and a projectile gets the
plain one. `WATER_SINK_SPEED`/`WATER_SINK_SECONDS` are the remake's presentation: a
doused thing goes on down THROUGH the bed and is taken away when its two seconds are
up. It never goes off, it cannot be detonated by hand, and it does not hold the turn
open (`grenades.live()` counts only what is not doused). `e2e/002/sink.spec.ts`
measures the whole path — a pig in CAMP's pond, a grenade at its feet, the y only
growing, `FT_WATER` heard and `E_1` never.

**Water is terrain type 4** on every wet sample, which is 0.90/0.10 — the grippiest,
least bouncy row. Against a grenade's own 0.30/0.80 that is 0.27 friction, but Coulomb
friction goes with the NORMAL approach and a flat skim's is a fraction of its travel,
so a hop was losing about **two per cent**: seventeen hops, the width of a pond. So the
fifth that lifts it (`0x4A9260`, read) is PAID FOR out of the travel — the remake's
half of it, and the only reading under which this file's own sentence about the arm
("it decays by five each hop") is true. Four or five hops, each shorter, then a douse.

### Known divergences — deliberate, and each written up where it lives

- **`HEIGHT_SCALE` is 1** though the exe doubles. See above.
- **The pig slides, and that stays.** The walking clips carry a body about
  855 units a second at 25 fps; the exe walks 1560, so the feet skate about
  2×. Driving playback off the walking speed to close that (a `gait.ts` that
  scaled playback) was built and rejected on sight — the legs whirl, and
  the run clip is not foot-locked to begin with, its two hooves disagreeing
  by 40%. `lib/game/clips.ts` plays everything at a flat 25;
  `movement/stride.js` is the measurement.
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
  SEE-THROUGH sheet of the map's averaged water colour sits a hair under each
  region's level (`WATER_ALPHA`, 0.62 — it was opaque and play produced a
  screenshot of the shipped game showing a submerged pig through the
  surface). NO wat01/wat02 pattern on the surface — the shipped
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
- **The menu's LAYOUT is the exe's, bar two pieces.** The exe computes its
  screen coordinates in the draw code rather than storing them, and screen 1's
  arm has been read blit by blit (`frontend/notes.md`), so `LAYOUT` in
  `ui/barScreen.ts` carries the original's numbers with the address each came
  from: the machine at (25, 0), the title at (261, 112), the column at 284
  stepping 40, the lamps flush to its right at 493, the dial at (105, 192), a
  cog at (9, 192) and `cogb` — 96×208, TWO cogs in one sprite — at (539, 160).
  **The frontend widens itself by a global 50 and does it two ways**: a plate
  repeats a band of its own art once, the machine repeats a two-pixel column
  twenty-five times, so the grille GROWS with the column rather than sitting
  behind it. Getting that wrong is what had our plates over the wrong
  recesses, and the machine 128 pixels too low.

  **A widget's frame is a WALK, and the flip is the exe's own.** The original
  never plays a clip: a widget holds one frame, something asks for another,
  and a per-tick pass steps it there one frame at a time, rebuilding the
  sprite each step (`ui/frames.ts`; decoded as 0x512C18 / 0x423E10 / 0x41FEC0
  / 0x41F110). The plates and the title are ONE widget: built on frame 2,
  asked for frame 6 — which wraps back to the first of six — one frame per
  engine tick, and the request is guarded by the widget not already walking
  AND by the entrance having climbed past -50. So the flip lands as the
  machine finishes driving in. Every number there is read; the remake had put
  the flip at that moment already, from play's word alone, and this replaced
  a 0.3-second timer with the mechanism.

  **The dial's needle points at the lit row**, and that is play's word rather
  than the exe's: the widget is built once at frame 0 and nothing found so far
  moves it, so the twelve frames are spread over the rows and the needle
  sweeps with the selection. Flagged at `needle` in `ui/barScreen.ts`.

  **There is NO carriage on the menu.** The remake ran one — `selcog`, the
  arrow with a cog above and below — up and down the column, and play threw
  it out on sight. The disassembly had said the same first: screen 1 never
  loads `selcog`. Exactly one loader arm does, the one serving screen ids 2,
  3, 4, 11 and 12, which loads `name0..5` beside it — the SELECT TEAM / ENTER
  YOUR NAME family, where it goes when those screens are built. `select.mgl`
  is left out on the same evidence. The lit bar is told apart by its lighter
  letters and by its lamp, which is the original's own way.

  Still eyework, and it says so at the field: BOTH TRACKS — the exe blits
  `track` twice through `0x41AF70`, a blitter with an explicit destination
  size whose convention is undecoded and whose two x values read off-screen.

- **The mouse works the menu, and the original's does not.** Hovering lights
  a bar, clicking chooses it. The original is keyboard and pad only (it even
  ships `nomouse.com`); this is the remake's convenience, and so is F1 for
  the asset browsers, which are not a screen the original has.
- **A RAMP is drawn TILTED 45°, and no record says so.** Its art is authored
  lying down: `BRID2_S` is a triangular prism with a flat face, a 45° face
  and a third side carrying no geometry at all. Turned −45° about its own z
  the flat face becomes the SLOPE, the 45° face the wall at the top end, and
  the unfaced side the bottom — which is why it was never modelled. Nothing
  in the exe applies this and the search is written up in
  `lib/game/ramps.ts`: `Map::Load` reads field 5 and no other angle (ten
  sites read `[record+0x2A]`, none `+0x28`/`+0x2C`), and the ramps and the
  abutments that must NOT tilt share one constructor arm. So the rule is
  MEASURED, and what decides it is the record's OWN COLLISION BOX: over every
  shape-kind-1 record on all 61 maps the box's y extent lands within 4 units
  of one orientation of the art and 105 or more off the other, with nothing
  in between. Four models come out tilted — `BRID2_S`, `M1S_ST01`,
  `STS_ST01`, `BRR02PPP` — and for each the box's y IS the rise and its x the
  run, so the collider a ramp wants is that box with a sloped top. The five
  that stay flat are the abutments `BRIDGE_S` and `D_BRID` and three ARCH
  bridges (`STR06PPP`, `W1R06PPP`, `SNR05PPP`), whose deck is at the origin
  with the arch hanging below — which is why "art off its own centre" is NOT
  the test, though it looks like one. The SIGN is the unfaced side going
  underground, and the maps agree twice: CAMP's second bridge runs
  2240 → 1728 → 1216 onto its own ground with its four `M1S_SU03` legs
  filling 1216..1728 under exactly the first piece, and ISLAND's twelve ramps
  each top out at their deck's own walking surface with the yaw picking which
  way they climb. Untilted the pieces are 725 across a 512 spacing, overlap
  by 213, and sit 256 BELOW the deck. `e2e/002/ramp.spec.ts` pins all of it.
- **A RAMP is WALKED UP, and that half is the remake's own.** The exe's answer
  is not found — the only thing seen so far that lets an object touch the
  ground a pig walks on is a 3×3 block of TILE values an object saves at
  `[obj+0x182]` and stamps back through `Map::SetTile` (0x4767a0 saves,
  0x4768c0 and 0x476ba5 stamp, gated on `[obj+0x19C]` being 4, 5..7 or 0x0E),
  and that is a tile TYPE with no height in it. So the shape comes off the
  record instead, where it already is: a ramp joins the collision world with
  the box the record carries and a top that CLIMBS across it, `bottom` at the
  box's local −x end to `top` at its +x (`sloped` in `lib/game/obstacles.ts`).
  The ordinary step-up envelope then walks it, and three things had to give
  first, each of them the same mistake — measuring against the ground the pig
  is over rather than the surface it is ON:
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
- **A BRIDGE is walked over too**, and the same measurement says which pieces
  carry it. For six of the nine bodiless models the box's upper face is exactly
  the face the ART draws (+256 on both, off by 0.0); for the three ARCH bridges
  the deck is 198.5 units below the box's own face. So the six join the
  collision world on their own box — the four ramps sloped, `BRIDGE_S` and
  `D_BRID` flat, which is what makes them the abutments at a bridge's ends
  (CAMP: tops of 1724 and 1733 against deck sections at 1728). Play found this
  the way it finds everything: "мост который идёт дальше после рампы — без
  коллизии, проваливаюсь под него." Three more things followed, and all three
  were the same mistake once more — asking the LANDSCAPE about a pig that is
  not on it:
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
- **The three ARCH bridges are still fallen through** — `STR06PPP` on MASHED,
  `W1R06PPP` on BAY, `SNR05PPP` on DEMO2 and ICEFLOW. Their collider is 198.5
  above the deck they draw, so walking them on the box would hold a pig in the
  air; what they want is a surface taken off the ART. Nobody has played those
  maps yet to say what else is wrong with them first.
- **The GAP in CAMP's first bridge is real, stays, and is JUMPABLE.** Nothing
  covers x −1536..−1024 between its two deck sections, so the walk ends in the
  air — which is what the tutorial's own JUMP THE GAP line is for (`gtext`
  clip 18, `tutorial/notes.md`). It has to be taken from the lip: the spec walks
  to −1163, jumps, and lands at −1504 on the far deck.

  **The jump's own numbers are not the problem and were re-read to be sure.**
  The forward impulse fires ONCE, on frame three exactly — `[esi+0x20C]` counts
  the frames of the fall and `cmp eax,3; jne` skips every other one (0x46e93e),
  then `0x4A9260(0x30, 0, heading, 0)` is one kick along the facing. So a
  running jump carries 303 units and a standing one 167, and no reading of the
  exe makes it 512. What makes the gap possible is being held up by the box.
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

### INPUT: control sets, polled once a frame

**What a key means is one pure table** (`lib/game/controls.ts`): `modeOf` picks a
control SET, `readControls` says what the axes mean in it, `verbOf` says what a
one-shot key IS. The engine does the same and says so — `0x4928dc` routes the whole
of input through a different branch while the aim bit is down, the camera keeps a
remembered mode and restores it when the bit goes up, and the skill menu is a mode.
The sets: **starting / inventory / charging / armed / locked / sights / battle**, in
that priority. The frontend is a set that never reaches this file: the menu binds its
own KEY map instead.

**Two of them exist because play refused an exception.** "ОГОНЬ проходит сквозь
блокировку — а вот и нет! там просто другой контроллер!" A filling gauge is
`charging` (it reads the button coming UP, which is the exe's own split at 0x493796);
the beat at the top of a turn is `starting`. With both named, `locked` means what it
says and there are no carve-outs anywhere.

**A WEAPON is a layer on top of movement**, which is play's model: "каждое оружие —
свой контроллер; можно ведь комбинировать их — movement + melee или movement +
gun?" `weaponLayer` is that table: `melee`, `gun`, `lob`, `skill`, or `none` for an
empty hand. Only `gun` and `lob` have an AIM VIEW — a blade must leave G inert,
because entering a set DROPS the driving keys and G with a bayonet was stopping the
pig for nothing (and 0x46a891 pins a bayonet's aim angle to zero, so there is nothing
to show). Only `none` refuses FIRE: SKIP TURN has no weapon behind it and F still uses
it — "пропуск хода это не none, там есть реакция на f, а без оружия нет."

**A set change drops every DRIVING key** (`DRIVING_ACTIONS`), so a new set starts from
nothing held. The sights already did that and the inventory did not — one rule instead
of two behaviours. Two changes CARRY the keys instead: the first look of a battle
(there is no set to have come from) and leaving the BEAT (its rule is that the same
input is read again in the set that follows). Both cost a failing spec on the way in.

**Input is POLLED, once a frame, in the SCENE's loop** (`input/battleInput.ts`, from
`host.onInput` ahead of `onFrame`). Play asked for it — "onchange вообще плохой
способ в играх" — and it is a bug, not a style: a set changes while nothing on the
keyboard moves, so a listener is never told and the pig walks on under a menu. Three
things a poll needs, all three of which killed the first attempt:

- **a press LATCH** (`controller.tookPress`) — a press and its release both land
  between two frames and `isDown` is false at either end. One-shot actions need none:
  they are announced as they happen and QUEUED, in order, because order is
  load-bearing (R then SPACE opens the inventory and takes what is under the cursor);
- **a gate on the beat** (`wakes`) — a poll runs whether the player touched anything
  or not, and it counts what went DOWN this frame rather than what is down: "press any
  key", and a key still held through a handover is not a press;
- **one loop.** The dashboard's own `requestAnimationFrame` only draws.

**A PRESS cannot be derived from the held state rising.** `Intent` carries `fired`
beside `firing` and `setFiring(held, pressed)` takes both: a set that does not read the
fire key reports it up while the player holds it, so LEAVING that set read as a fresh
press — hold F through a shot and the grenade that came out the far side went off the
frame it appeared.

**A window that loses focus never sees the key come UP**, so `bindKeyboard` drops
everything on `blur` and `visibilitychange`. An alt-tab with G down held the aim view
for ever, and since W POINTS rather than walks down there, the pig could not be driven
again until G was pressed and released. Nothing downstream can recover from a stuck
key.

**Ending a turn is a SKILL** — 65, SKIP TURN, always in the menu. Choosing it takes it
in HAND and FIRE applies it; there is no key bound to it at all. R CANCELS a choice and
puts the weapon away. The `endTurn` action survives as the dashboard button's own path.
`e2e/002/controls.spec.ts` is the table's spec and `e2e/002/battle.spec.ts` drives the
two bugs play found by hand (the inventory stopping the pig, and the blur).

### The TURN's own beats

**"GET READY >S..." is `gtext 168`**, and it is the game's own answer to the beat at
the top of a turn. The beat had been in the domain since the turn clock landed and
nothing ever showed it, so a handover read as instant. A first pass invented a line out
of the exe's debug print; play sent a screenshot of the shipped game instead — big
green letters over the battle — so it is that string, with the SQUAD's name in it, on
the same centred card the mission title uses. **`gtext 167` is ">S MISSES A TURN!"**,
which is what SKIP TURN should say once the bar can be reached from the scene; a sound
cue stands in. **Do not invent a string this game already has**: both were sitting in
gtext four numbers apart, beside the crate lines this repo already used.

**The clock stops at the CHARGE, not at the throw.** Play: "при начинании зарядки
броска таймер останавливается — так как это уже атака началась." Same gate as the
rest: `Pig::MayAct` goes false on the press that starts the gauge, a second and a half
before anything leaves the hand.

**The camera TELEPORTS to a new subject** rather than gliding across the map —
`chase.reset()` clears `snapped` as well as the settle timer, and the end of a flight
calls it. Play asked and the answer is yes: easing is for following one thing about.

**A frame is clamped to a tenth of a second.** `getDelta` is wall-clock and the browser
stops calling `requestAnimationFrame` for a window nobody is looking at, so coming back
from an alt-tab handed the world one step of however long the player was away — a
fuse, a flight and a landing all resolved before anything drew, which play saw as
"2 раза вызвать выстрел, а цель стояла и не было прожектайла". Clamping is not a
pause and does not pretend to be one; a real one is a thread of its own.

### The TREMOR goes in the ENGINE, and the camera just shows it

Five passes kept the scope's tremor BESIDE the aim — on the view's direction, on the
eye, on a mark drawn over the glass — and every one produced the same class of bug.
Play cut through it: "вместо того чтобы трясти прицел — ты тряс камеру?????", then
**"то что у тебя на камере было — должно было уйти в движок, а камера просто всегда
должна отражать то что в движке."**

So there is ONE number. The tremor is a STEP added into `aim.angle` every engine frame,
its other axis into the pig's TURN — which is what the exe does: the aim view's
handler feeds the analogue stick through `Pig::Aim` (0x495cb0 → 0x46A7F0) for one axis
and the turn for the other, and `[pig+0x304]` is the field the CAMERA reads, the field
the SHOT reads (0x47a2b6) and the field the dial shows. Nothing can disagree because
there is nothing to disagree with. Everything asked for falls out of it: the picture
follows the sight; nothing is bounded but the aim's own ±0x3FF; closer travels further
because the step is an angle and a magnified view is fewer degrees across; and one walk
of small steps reads as a rattle frame to frame and a drift over seconds — which is
what a resting stick IS. `AMPLITUDE` is the only knob left.

**Five shapes that are WRONG, and none is to be tried again**: a sine (floats); a
bounded rattle round the centre ("в радиусе центра"); a bounded walk with a direction
kept until the stop (two axes doing that is ONE ELLIPSE); an offset on the EYE; and a
mark that moves over the glass while the camera holds still. The last two share the
fault the first three hid: **a second number the camera and the barrel can read
differently. If the picture and the bullet can ever disagree, the design is wrong —
put it in the engine and let the camera report it.**

### Threads left mid-pull

Seven jobs are open and play named all seven. In the order they were named:

**1. A PIG DOES NOT MOVE while it walks.** Play: "свиньи ещё не двигаются при
ходьбе." Written down and not chased. Worth knowing before starting: the clips
themselves play (`lib/game/clips.ts` runs everything at a flat 25 fps and the walk is
clip 0/3), the pig SLIDES by design and that is its own divergence above, and only
the ACTING pig is driven — every other one is put on `ANIM.IDLE` every frame by the
scene's own loop, which is the first place to look.

**2. The game must not STOP in the background, and a real PAUSE is its own job.**
Play: "на заднем плане отключать игру нельзя, как по мне — это убивает много чего…
в сг проще паузу ставить, в мп вообще никаких остановок." The frame clamp above
stops the damage but is not the feature: singleplayer wants a real pause (the
original has one — the beat at the top of a turn lists the pause button as one of
its three ways out, 0x4d8a2c) and multiplayer wants nothing of the kind. Deliberately
not built yet.

**3. A pig that cannot SWIM goes under, and stays visible down there.** From the
same screenshot: the pig is below the surface with its name plate and health still
up. `SWIM_SINK` puts a swimming pig's eyes at the waterline; a class that cannot
swim should sink past it. WHICH classes is now read, from the other end — the
water's own damage exempts class 4 and 14..16 and nothing else
(`lib/game/drowning.ts`) — but what the exe does to a non-swimmer's HEIGHT is
still not, and the sink is unchanged.

**4. There are no FOOTSTEP sounds.** ~~Deliberate so far~~ **DONE, 2026-08-12** —
and the contact frames turned out not to be needed: the clips carry the footfalls
themselves. "A HOOF KNOWS WHAT IT IS STANDING ON" below.

**5. The SKIP TURN animation is wrong, and it is the VICTORY clip.** Play, at a
glance: "анимация пропуска хода кривая, и она на победу". `ANIM.THINKING = 46` was
play's own pick a pass earlier, off the exe's 59-clip name table — "Thinking" —
and the clip that plays is a celebration. Not chased: play asked for it written
down and left. Whatever replaces it wants the same treatment as every other clip
here, which is to be read off a CALL SITE rather than off the name table (see the
`ANIM` note in `locomotion.ts`), and skills 63/65/66 are out of range of
`Pig::Fire`'s dispatch so there is no site to read.

**6. The WATER SPLASH is in the wrong place and far too big — and it is what reads
as a grenade EXPLODING on contact.** Play reported the blast twice more
("всё ещё при контакте с водой граната взрывается сразу") and it is not the douse:
`e2e/002/sink.spec.ts` stands a pig in CAMP's pond, drops one at its feet and
measures the whole path — the y only grows, it is gone after its couple of seconds,
`FT_WATER` is heard and `E_1` never is. So what is on screen at the moment of contact
is THIS effect, in the air where it should be under the surface, and play has also
asked for its DIRT look to be written down: "есть брызги земли — это потом
запиши."

**6b. The rest of the splash's placement.** Play: "эффект воды —
не там, огромный, и вообще не на воде". `SPLASH_EFFECT` is effect 0x0E / parameter
row 2 and the row is decoded — three rings at a lift of −500, a sixty-sprite cloud,
a ten-particle burst — so what is wrong is the remake's, not the reading. Two
candidates and one is nearly certain: the ring's `lift` of −500 rides no scale while
the ring's RADIUS rides `MODEL_SCALE`, and the SIZE scalars (`BLOB_UNIT`,
`PUFF_SIZE`) were picked against a blast, not a splash. The y handed to
`effects.splash` is `query.surface(x, z)`, which is the water line — check that
first, because "вообще не на воде" points at it.

**And there is now a third candidate, which is probably the whole of it: the ring's
`lift` is carried with the WRONG SIGN.** +y is up in the engine (settled four ways,
`cloud.ts`), and row 15's shockwave stack at +100/+300/+600 goes UP — so row 2's
−500 goes DOWN, under the surface, where a spreading ring belongs, and
`advanceEffect` currently puts it 500 units into the AIR. It was fixed and reverted
in the same session on play's instruction ("ПРИЧЁМ ТУТ ВСПЛЕСК? МЫ НЕ ДЕЛАЕМ
ЕГО ЕЩЁ!"), because moving the splash belongs to this thread and not to a
grenade fix. The flip is one line in `advanceEffect`; the lift should ride
`MODEL_SCALE` the way the ring's radius does at the same time.

**7. The RAMP is wrong** — DONE, both halves play named. It was drawn a −45°
turn out ("модельки отрисованы криво, −45 градусов от нужного", and it was
exactly that, to the unit), and it can be walked up now. Both are written up
among the divergences above. What is NOT done is the first bridge, which is
its own shape of problem and has an entry of its own.

### WATER hurts, a turn ends with a BEAT, and the modes have names

Four of play's reports in one pass, and three of them turned out to be the same
piece of the exe — its MODE MACHINE, which now has a decoded name for every
number (`turns/notes.md`; the table is at 0x4d72b0 and NORMAL landing on 6 pins
it). Two answers fall straight out: **the beat at the top of a turn is mode 4**,
which was an open question since the turn clock landed, and **mode 13 is WALK AWAY
— the beat at the END of one**, which nothing here knew existed.

**Water takes health, and it RAMPS.** `lib/game/drowning.ts`: the bite is the
frame counter itself in 128ths of a point, capped at half a point a frame, so a
grunt's fifty last about nine seconds — and **the pig whose turn it is pays
twice**, except during the beat at the end of a turn, which is the exe's own
exemption. It is deliberately SILENT and invisible: the floating number is gated
above 0x7f and the cap is 0x40, so nothing is drawn and nothing is played, and the
health plate is the whole of the feedback. **Class 4 and 14..16 take nothing at
all** — the commando and the top tier by the spawn markers — and that is gated on
a ONE-PLAYER game, which is what `PLAYERS` in that file says and why it is not
`SIDES_FIELDED`. Two consequences worth knowing: `DEAD_BELOW` in `health.ts` is
now 1 rather than 0 because the exe's death test is "under one whole point" and
water is the first thing that deals fractions, and the name plate floors its
number the way the exe's own does.

**A turn does not hand over on the spot.** `lib/game/walkAway.ts` is mode 13:
control is locked, the clock is stopped, and anyone still in the water makes for
the nearest shore — eight compass rays, sixteen tiles each, nearest by dx²+dz²,
and a pig with nowhere to go drowns where it stands. It holds until they are all
out and the world has been quiet for a second, which is both the exe's fifteen
quiet frames and exactly what play asked for ("хотя бы секунду задержки между
ходами"). The exe calls its shore search for the ACTING pig ONLY in this mode, so
the swim out is a property of the handover and not of being in water.

`pow.debug.cutTurnBeat()` ends it, and `skipTurn` in `e2e/controller.ts` uses that
by default — a spec that ends four turns to get somewhere should not pay four
seconds for a beat it is not testing. `e2e/002/drown.spec.ts` is the one that IS
about it.

**A health crate shows something now.** `Pig::Heal` was read to the end and does
three things: the same floating number a hit does (one spawner, and the fifth
argument is the style — a hit takes the team's colour, a heal a fixed one), sound
0x53 P_SIGH at nominal, and it CLEARS the status bitfield. Only the third is not
built, because nothing here models statuses. `damage/notes.md`.

**A jump no longer walks through a dummy.** The obstacle field was consulted from
the walking branch alone, and `airborne` clamped its step to the world and read
objects only as a roof to land on. In the exe the block is in the PHYSICS layer:
the same sweep the walk uses (0x406AD0) is also called from the library's own
integration of a live body, and a pig in the air is a live body for the whole
flight. Reach is 0 up there, so a box whose top is above the feet is a wall and
one below them is still something to land on.

**And the pig's rump does NOT wag — that one is a measurement, not a fix.** Play
asked for the pelvis to turn while walking. The skeleton is fifteen bones with no
tail among them, the tail geometry hangs off the ROOT bone, and the root's yaw is
exactly zero on every frame of every run cycle (and of the backwards walk). What
swings is bone 1, the torso: ±19.6° of yaw and 22° of roll, which this engine
already wears — and the weapon channel owns bones 0..8, so a pig carrying
something has a still torso by design. The only clip that yaws the rump alone is
27, Standing around, by 4.9°. Full measurement in `animations/notes.md`; there is
nothing in the data to turn on.

### The BATTLE MODEL is `_me`, and a keyframe has a HEAD

Two format-level things behind one report, and play had to make it three times
before the search left the pose and went to the assets: "жёпка так и не вертится…
именно та часть тела не шевелится вообще… должно двигаться вместе с туловищем а не
стоять колом."

**`Chars/british.mad` ships THREE models per class and only two of them are rigged
for the animation.** Measured across all twenty-seven: `pcXXX_hi` (627..668
vertices) hangs 30..35 vertices off bone 0 — the ROOT — and its bone 1 stops short
of the hip, so the whole pelvis is welded to a bone the shipped clips barely move
(4.9° of pitch, no yaw at all). `pcXXX_me` (457..496) and the short `XX_hi`
(168..201) put 6..8 there — the tail — and carry the hip band on bone 1, the
torso, where the run cycle's ±19.6° of swing lives. So on `_hi` the behind cannot
follow the body: it is not attached to it. `three/soldiers.ts` dresses a battle pig
in `_me`, and two things agree on that — a rig that matches the animation, and
`_ME` being the suffix the map's own spawn markers wear (`GR_ME`, `HV_ME`).
`pcXXX_hi` is for whatever shows a pig close up and standing still.

**An MCAP keyframe's first 32 bytes are TWO int32 vec3s, not an u16 and ten s8
triples.** how-doc's reading was wrong and nothing had ever consumed it. The
library settles it (`_d3d.dll` 0x1001228f): after the fifteen bone rotations it
reads dwords at +0x00/+0x04/+0x08 and +0x10/+0x14/+0x18, interpolates each between
the two keyframes as an INTEGER and ftols it into its own root record — two
16-byte slots, three live components each, which is also why the rotations start
at +0x20. The first slot is the body's own offset and its y MOVES: 21 units over
the run cycle's stride, two dips, one per footfall — the BOB. The second is zero
in all 93 shipped clips. `lib/formats/mcap.ts` reads it, `rootAt` samples it, and
it lands on the root of both the engine's skeleton and the drawn one.

Only the VARIATION is applied, against the clip's own first frame, and that half
is the remake's: the constant is about −100 on every clip and the original adds all
of it to a body it places its own way, while this engine stands a pig by the foot
offset measured off the art. Both would double up.

Found on the way and worth knowing: the model struct carries FOUR clip/frame pairs
— current and previous for each of the two channels, 0xFFFF for none — so **the
original CROSSFADES one clip into the next** where this engine cuts. Not modelled.

### A landing on a WALL tile settles, and only the get-up is refused

Play: "соскользнул с подьема и попал в бесконечный цыкл — туда сюда скользит на 1м
месте", with the tile's own address (CAMP 43,17 — type 0x85, a wall over terrain
type 5). The landing had two conditions where the exe has one: its impact handler
compares the ARRIVAL SPEED with 25 a frame (`cmp di,19h`, 0x4711d8) and that alone
picks the bounce (0x471247) or `0x471350`, which zeroes the velocity. What
`Map::IsBlocked` gates is the GETTING UP. Read as "a pig in a wall never lands", a
pig on that tile kept 99% of its slope-parallel speed off `WALL_MATERIAL` every
frame and the wedge counter relaunched it every 25 for ever. `002/wedge.spec.ts`
pins it; `002/locomotion.spec.ts` had the old reading as an assertion while its own
comment described the right rule.

### And a pig ON A BRIDGE is not in the water it crosses — for EVERYTHING

The rule was already written down for the driven pig, and the two things added
this pass — the water's damage and the end-of-turn swim — both asked
`query.isWater(position)` and nothing else. So a pig standing on CAMP's deck when
its turn ended counted as a swimmer and the beat "rescued" it: `restingY` put its
feet on the waterline, which is a drop through the deck. `inWater(query, x, z,
footY)` in `lib/game/locomotion.ts` is the rule for anything that is not driving —
the tile has to be water AND the feet at or below the waterline — and a swimming
pig's feet are on that line by `restingY`'s own definition, so the two cannot
disagree.

**And it came back one pass later, through the OTHER half of the same
question — where the feet are at all.** Play: "если начинаю ход на мосту, нажимаю
любую кнопку и он проваливается." `createLocomotion` took the pig's height off
the landscape, and a turn builds that state fresh for the pig that comes up
(`focus`, `lib/game/battle.ts`), so a turn starting on a deck started 652 units
below it — invisibly, because the scene draws the pig out of its own position
while "press any key" is up and out of the locomotion state once the turn is
being played. The first press was the drop. It now takes an optional `Footing` —
the pig's own y and the obstacles — and keeps the surface it is actually standing
on, `freeY` and `swimming` with it. The frame-by-frame walk had the rule all
along; only the FIRST frame had nothing to measure from.

Two lessons, and the second is the general one:

- **A state built from a POSITION needs the whole position.** `x, z` and the
  landscape is not where a pig is on a map with walkways on it. Anything else
  that rebuilds locomotion from a spot — `warp` today, a save file tomorrow —
  has the same hole, and `warp` is left with it deliberately: it names a spot
  and has no pig to ask.
- **A debug accessor that lies is how a bug family survives being fixed.**
  `pow.debug.hud().swimming` was `query.isWater(pig)`, so the spec written
  against it was told a pig standing on the bridge was in the water — the first
  version of the app test above failed on that and not on the bug. It asks
  `inWater` now. The e2e window is not exempt from the rules the engine keeps.

### USING A WEAPON ends the turn — and the exception list is MEASURED

Play: "использование оружия заканчивает ход — у нас нет." The engine had every
piece of the ending — the beat after a blow, the WALK AWAY beat, the handover —
and nothing that spent the turn but the clock and SKIP TURN, so a pig could empty
a rifle into a yard of dummies on one clock.

The exe does not hang this on the weapon's behaviour at all. It is a byte in the
skill's own 80-byte record at **0x4d7300**: `+0x1c` goes into `[game+0x517]`, and
that flag is the mode machine's "go to WALK AWAY" (`turns/notes.md`). Read off the
shipped exe over all 67 records, `+0x1c` is **1 on everything but thirteen**:

| | |
| - | - |
| 0 | NONE |
| 35, 36 | MINE, ANTI-P MINE |
| 37, 38 | TNT, FIRECRACKER — and these two alone carry `+0x18` = 400, four seconds of ordinary play instead of a handover: plant it and run |
| 52, 54 | HEALING HANDS, PICKPOCKET |
| 60, 61, 62 | the vehicle skills (`in-out`, `pbox`, `getout`) |
| 63, 64 | MAP VIEW, BINOCULARS |
| 66 | SURRENDER |

Two families and nothing else — the explosives a pig PLANTS, and the skills that
are not blows. **65 SKIP TURN is not among them**, which is the check that the
reading is the right way round. `lib/game/spend.ts` is that set and one predicate;
the four-second wait is not modelled, because neither TNT nor the firecracker is a
weapon in this engine yet and a timer nothing can start is a guess with no way to
be wrong.

**The turn ends on the QUIET, not on the press.** The exe reaches mode 13 through
the same wait the beat after a blow is — `0x495316` → `0x494570` → WALK AWAY — so
the bullet flies, the swing plays out, the dummy comes apart and its crate lands
first, and only then does the turn go. In `lib/game/battle.ts` that is one `spent`
flag, cashed below the aftermath block against `!committed() &&
!anim.animating(acting) && !settling()`: the world quiet AND the pig's own clip
finished, which is the exe's own `0x47D800` ("no pig is still busy"). The few
frames between the blow and the handover are LOCKED — they are not a last chance
to walk.

Two things this pass turned up that are worth keeping:

- **`settling()` is now one function.** The same five-term list — effects, shots,
  grenades, damage numbers, falling crates — was written out twice and this rule
  wanted it a third time. All three waits ask the same question; a fourth copy
  would have been the one that drifted.
- **A rule that ends turns rewrites the SPECS' idea of a turn.** `002/shoot.spec.ts`
  broke on the honest thing: it broke a dummy with the bayonet and then waited for
  the pig to walk into the crate that dropped — and nothing is collected in the
  beats between two turns, so it sat there for the whole ten-second "press any
  key". `nextTurn(page)` in `e2e/controller.ts` is the handover a spec now has to
  take, and a spec that fires twice on one clock is a spec that is wrong.

### MINEFIELDS are a TILE BIT, and the sound bank is what proved it

Play: "мины тут на карте должны быть — а тнт уже берётся с ящика но ничего не
делает." Both were sitting in the shipped data.

**A minefield is bit 6 of a tile's type byte** — 99 tiles of it on CAMP, 997 on
BUTE — and there is nothing to draw for one: the tile's own texture is the whole
warning, which is why the training ground can say "FOLLOW THE PATH THROUGH THE
MINEFIELD" about a patch of empty ground. A pig with its feet down on such a tile
plays `L_MINETR`, spawns the blast **at the tile's centre** (the exe builds the
position out of the tile indices and never looks at the foot), and the bit is
CLEARED — one shot per tile, for ever. Twelve frames of fuse, twenty points at the
core over a grenade's own 1024 of reach. `lib/game/mines.ts`, and
`weapons/mines.md` has every address.

**A misreading died here, and it had been load-bearing.** Bit 6 was written down
as WATER two passes ago, with 0x437a50 filed as the splash — `Sound::Play(0x28)`,
"the water HEIGHT", `WATER_SPLASH_SOUND`. Every piece of that is a mine: bit 5 is
water (`IsInWater` 0x4a6fa0 tests 5, and 0x4a7000 tests 7 for the wall, which pins
the byte end to end), 0x4A5140 is `Map::SampleHeight`, and **index 40 of
`Audio/sfxday.srl` is `L_MINETR`**. The story held together for two passes because
"a splash at a height, on a flag next to the water flag" is a plausible thing to
read. The BANK is what broke it — the file has NAMES in it, and a sound index is
worth resolving before a behaviour is built on top of one.

So the rule the engine was missing is not only "walk onto a mine": **anything
thrown sets one off too**, out of the same handler, on contact rather than at rest.
It is six lines in `lobs.ts` because `mines.tread` is the same call the foot makes.

**TNT is a lobbed projectile with no gauge**, which is the distinction the fire
button did not have: `isLobbed` was deciding both "throws an arc" and "charges on a
held key", and the record's +0x14 is what actually decides the second (1 on the
grenades, 0 on TNT). With no gauge the press writes a charge of ONE, and a
constructor speed of `50 * 1 >> 12` is nothing — **that is what "planted" means
mechanically: it goes down at the pig's own feet.** Fifty frames of arming under a
125-frame fuse is near enough six seconds, fifty points at the core, twice a
grenade's reach.

And using one does not spend the turn — it HURRIES it. The skill record's +0x18 is
400 hundredths, which raises `[game+0x516]` and takes the mode machine back to
NORMAL with the turn's deadline re-stamped (0x4945a5): four seconds, as a SET and
not a bonus, so ninety-eight seconds becomes four. The fuse outlasts it on purpose
— the clock runs out first, and the beat the turn ends through waits for the charge
rather than handing over on top of it, because a live lob is in `settling()`.

Three shapes worth keeping:

- **`blast.ts` exists because a mine wanted what a grenade had.** The burst — who
  is inside it, what each takes, the dummies spliced out of the shared array — was
  the body of `lobs.ts`, and the honest way to give a second caller it was to stop
  the grenade owning it. One blast, two callers, and the falloff stays in
  `grenade.ts` beside the exe reading behind it.
- **A layer, not a special case.** TNT gets `weaponLayer` = `charge`: fires, no aim
  view, no gauge. The four planted skills (35, 36, 37, 38) are a real family with
  two witnesses in the exe, and 35/36 answer for it already even though they have
  no row yet — so the control set is right the day laying a mine lands.
- **The mine WEAPON is the same mechanic from the other end** and is deliberately
  not built: skills 35/36 drop a projectile that, on touching the ground, writes the
  map's own bit (`Map::SetMine(col, row, 1, flavour)`, 0x4374cf) and leaves it
  there. `mines.ts` is where it would plant. What is NOT read: whether one mine
  going off sets its neighbours off, and `[game+0x534]`, the counter the mines'
  four-second override tests.

### A charge is PLACED, by its own animation — and a once-clip must play out

Play: "ТНТ ставится на землю — с анимацией." Three things were wrong under that
one sentence.

**The animation was being wiped one frame after it started.** Every weapon's
attack clip goes on through `anim.playOnce`, and the clip chain's last line —
`anim.setClip(acting, loco.clip)` — ran every frame for a pig that was neither
swinging nor mid-jump. `setClip` deliberately does NOT keep a once-clip (the walk
has to be able to interrupt an idle), so it replaced the attack clip on the very
next frame. **The swing survived only because `swings.swinging()` holds it a branch
earlier**, which is why nothing had noticed: the bayonet is the one weapon whose
animation anybody had watched. There is now a branch for "a once-clip is running,
leave the pig alone", which is also the exe's own rule — `[pig+0x2FF]` is up from
`Pig::Attack` until the animation is spent and the picker does not ask for a clip
while it is.

**The charge appears when the pig has BENT OVER, and that is data.** All four
planted skills carry attack clip 77, the archive's "Lay Mine", and the clip's own
key-frame events are in the DLL rather than the exe: `afGetKeyFrameList`,
`_d3d.dll` 0x1002c778 + clip*88, six `(phase, id, id)` triples — the same table
`melee.md` hand-read the bayonet's four strikes out of, which is what confirms the
layout. Clip 77 carries a footstep at 584, **event 65 at phase 1314** and another
footstep at 3796, and event 65's arm is three instructions whose middle one is
`Pig::Shoot`. So `PLANT_PHASE = 1314` of 4096 is where the thing is placed: a third
of the way in, by the animation, not by the press.

**And it goes down at the FEET.** `Lobs.plant` puts it at `pig.position` — the
soles — instead of the hand bone a throw comes off, which falls out of the exe
twice over: `speed * charge >> 12` of 50 and a charge of one is nothing, and the
clip's event fires with the pig bent over its own trotters.

**A planted charge must not lock the pig**, or the four seconds the turn hands back
are four seconds of standing next to it. `grenades.live()` was what said "the pig is
committed" and "the fire key is a detonator", and both of those are about a THROWN
thing: `Lobs.thrown()` is the count without the planted ones, and `live()` stays
what the end of a turn waits for. So a TNT charge cannot be set off by a second
press either — which would otherwise have been one button away from suicide.

### ONE BLOW A TURN, and an animation nobody may walk out of

Play's second pass over the charges, four reports in one line, and three of them
were the same hole: "не дожидается окончания анимации и можно идти в ней в последнюю
секунду", "можно ставить много тнт подряд — а после первого нельзя использовать
оружие", "когда таймер кончился — анимация свина не возвращается обратно в идл",
"тнт ложится в пол — а надо чтобы стояло".

- **The lay clip holds the pig to its END, not to the frame that places the
  charge.** `laying` carries two numbers now: `untilDown` (phase 1314) and
  `untilDone` (the whole clip), and `attack.busy()` is the second one. The clock does
  not run inside it either — a blow in progress stops it — so the four seconds a
  charge gives back are four seconds of RUNNING.
- **One weapon use a turn.** `struck` in `lib/game/battle.ts`, and the fire key is
  swallowed for anything but SKIP TURN once it is up — **except while something the
  pig THREW is still live.** Play caught that one within the hour: "ты сломал
  взрывание гранаты — больше нельзя нажать F чтобы подорвать по желанию." The
  hand-detonator lives inside `attack.begin`, so swallowing the press took the
  grenade's own second use with it. Setting off what is already in the air is the END
  of a blow, not a second one, and `002/grenade.spec.ts` now presses F twice so it
  cannot go quiet again. It is the same rule the turn
  ending already was, seen from the side of the two skills that do not end it: the
  charges kept the turn and so kept the trigger, which meant a pig could carpet its
  own feet in TNT.
- **The turn ending puts everyone back to IDLE.** `endTurnBeat` dresses every pig
  before `beginWalkAway`, which then puts the swimmers into their own clip on top of
  it. The beat only ever dressed the swimmers, so a pig that ran out of clock
  mid-stride kept the run cycle for the whole handover.
- **A planted charge is lifted by its OWN half-height** and not by a grenade's
  radius, and nothing pitches it: it was drawn half-buried, and it has no velocity
  to point along.
- **And the hands are EMPTY afterwards.** Play: "должны быть — а ты ещё держишь
  тнт." A charge is not a weapon a pig keeps: the round is spent as the clip runs
  (the exe does the same at 0x46975e) and the hand is emptied whether the slot ran
  down or not, which on the training ground — where every slot is unlimited — is the
  only way it ever could.

**And the once-clip rule wanted a qualifier the specs caught.** "A committed clip
plays out" on its own broke the walk cycle: a pig that lands on the run was still
getting up, which `002/walkcycle.spec.ts` failed on within the same run. The exe has
the qualifier — the animation picker asks 0x472320 for a gait and that request
zeroes the committed clip outright, so a DRIVEN pig's gait wins and a standing pig's
clip finishes (`animations/notes.md`). The branch is `anim.animating(acting) &&
loco.clip === ANIM.IDLE`, which is both halves in one line.

### A MINE IS HIDDEN, and that part is play's rule

Play: "мины скрыты — текстуры видны только тем кто рядом и то только тем у кого
есть класс специальный — и наверно ещё тем кто поставил."

**The exe has no per-viewer visibility in it at all**, and this pass chased every
reader of the mine bit to be sure: the pig's own trigger, the projectile's, the
AI's passability map, and eight copies of a tile walk that refuse a mined tile.
None is in the renderer. What the ORIGINAL shows is what the map's ART shows, and
the shipped maps disagree on purpose — CAMP paints its 99 mine tiles with four
textures no other tile uses, and BOOM's 628 sit on the same ground as everything
around them. So "hidden" is a design rule and the marker is the remake's own: the
game's own `WE_MINE` model, drawn on the ground by `three/mineArt.ts` for exactly
the mines `mines.revealed(watchers)` returns.

**Which class sees them is DERIVED and not picked.** The 128-byte class record at
0x4d02e0 carries each class's own kit as `(skill, amount)` pairs, and 35 MINE
appears in three of the twelve: 5, 6 and 7, the engineer and its two promotions. A
pig that lays mines for a living knows where one is. The other candidate is the
espionage family (8, 9, 10 — `55 CONCEAL`, `54 PICK POCKET`), and it is one line in
`mines.ts` if play says otherwise; `DETECT_RANGE` of 1024 is invented outright and
says so at the field. "Whoever placed it" is not modelled because laying a mine is
not — there is no owner to remember yet.

The eyes are the caller's: the scene asks with `game.currentPlayer.pigs`, so an
enemy engineer walking past does not light the field up for the player. A mine that
has been TRODDEN on is drawn for everybody — by then it is nobody's secret.

**Play knows more about this than the binary does, and it is written here for the
pass that does it**: "инженеры и командос с героем видят жёлто-чёрные текстуры там
где есть мины", and mines are hidden on the MINIMAP for the enemy. So the original's
reveal is a TEXTURE SWAP on the tile — the hazard stripes CAMP's four mine textures
almost certainly are — for three classes rather than the engineer family alone, and
the range applies to the GROUND and to the map view alike ("к земле тоже"), with the
enemy simply not shown them on the minimap. None of that is built: play said "но ладно это потом", and the marker model stands in meanwhile.
Still to do beside it: the EXCLAMATION MARK over a mine the moment it is trodden on.

### A PLANTED CHARGE STANDS, fuse up — and the model is what says which way

Play: "тнт лежит боком на земле — должна стоять фитилём вверх." Which way is up for
it is the MODEL'S own fact, and it was measured out of `Chars/WEAPONS.MAD` rather
than guessed: `WE_TNT` is forty vertices in two boxes — the bundle from x −64..77
(with its two end caps as flat planes of their own, AMMO002 and AMMO003) and a
thinner stub from x −148..−64 wearing AMMO001. The bundle's texture corners average
rgb 181,82,0 — orange sticks — and the stub's average **0,0,0**. A black stub out of
the end of a bundle of dynamite is the fuse, so **the fuse points along model −X**,
and the whole thing is authored lying down because a hand is what holds it.

Game space is Y-DOWN, so up is −Y and a turn of +π/2 about Z takes model −X there
(`three/grenades.ts` `STAND`). The yaw the pool hands out then only spins it about
the vertical, which is why it can stay. And the LIFT is measured FROM the pose — the
lowest corner of the model as posed — so it cannot drift from it: standing, the
bundle's deepest point is the far end (model x 77) rather than the 32 its half-height
gave it lying down.

`window.pow.debug.charges()` is how a spec sees it: the fuse's world direction and
the y of the lowest corner. Standing on its end is a fact about the MESH, and the
engine's list of lobs cannot answer for it.

### A BLAST THROWS, and a pig NOBODY drives needed somewhere to put a velocity

Play: "мины не отбрасывают — как и тнт", and then the diagnosis in the same
breath — "также мины и думаю гранаты тоже не отбрасывают — так что это общая
проблемма." Exactly right. Nothing was wrong with the blasts: this engine had ONE
locomotion state, the acting pig's, so there was nowhere for anybody else's
velocity to live. `lib/game/tumble.ts` is that somewhere, and it owns no physics —
a thrown pig is a pig in the AIR, which `updateLocomotion` has always known how to
be, down to the bounce, the landing and the get-up. The exe agrees the two are one
state: `UpdateMovement` returns at once when the pig's state is 5 (0x46b205), so a
pig in the air is not driven and the physics owns it.

**The seam is `battle.fling`**: the ACTING pig takes the impulse on the state the
battle already drives (`loco.airborne`, the same flight a jump takes) and everybody
else takes one of their own. Two states over one pig would fight over its position.

The impulse's SHAPE is the exe's, its magnitude is borrowed and its falloff is the
remake's, and `lib/game/blast.ts` says so at the field. Every knock-about in the
original is one call — `0x4a9100(speed, 0x200, bearing, 0)`, and 0x200 of 4096 is
**45° up** — at six sites, five of which use that pitch and speeds of 0x40 or 0x78.
`Pig::OnHit`'s own blast arm (0x477c22) carries **no impulse at all**: it damages,
tallies twice the damage at `[pig+0x1b8]`, raises the reeling counter at
`[pig+0x1b4]` and squeals. So the original's toss comes from the physics — the blast
effect HAS a body, a sphere of radius 35 — and that contact is not decoded. The
whole chase is in `weapons/fire.md`.

A pig in the air does not find a MINE, which is the exe's `[pig+0x382]` gate; and
the turn cannot be handed over while anybody is still up (`settling`).

### EVERYTHING IS BREAKABLE, and a dummy is just the cheapest row

Play: "тнт не дамажит дом." It did not, and a house was never anything in this
engine: `targets.ts` built targets for the one model name the remake had ever seen
break. The original has no special case for a dummy at all — a dummy, a tree and a
house wall are the SAME class (vtable 0x4bd440, ctor 0x48d000, body type 0x135A),
with a different number out of one table.

The loader dispatches on the model NAME through a table of 466 strings at 0x4d9680
that names its own groups, and **every SCENERY record (indices 28..379, less the two
birds) is breakable**, with health at `[0x4d6d18 + (kind - 0x1c) * 4]` in the usual
128ths. `lib/game/breakable.ts` is that table, all 349 names of it, and
`../pigs-disasm/objects/notes.md` has the taxonomy.

What it means in play: CAMP's house is eighteen 60-point pieces of the `ST` set, so
one TNT charge (fifty at the core) leaves a wall standing with ten and the second
brings it down; its 85 firs are eighty each; the dummies keep their one point. A
CRATE is not breakable — CRATE4 is in the table twice and the PICKUPS entry wins.

**A BUILDING still is not.** Indices 1..6 (BIG_GUN, M_TENT1, M_TENT2, PILLBOX,
SHELTER, TENT_S — CAMP has one SHELTER) are a different class, 0x4bc5d0, body type
0x1359, and its own trick is that going off it sweeps up every pig around it and
throws each one at `(0x40, 0x200, bearing)` with a squeal.

### THE HOUSE FLICKERED because the map overlaps its own walls

Play: "дом имеет мерцающие текстуры." Measured rather than guessed: CAMP's house
overlaps its wall pieces at every corner by exactly 64 units — the wall's own
thickness — twelve pairs of them, each a 64×512×64 column, so their big faces are
COPLANAR. (Measured over the AABBs of the placed models, not the collision boxes.)

The original never minded because it has no depth buffer to fight over: a PSX-style
renderer sorts its polygons and the second of two coplanar faces simply lands on the
first. Three.js keeps a z-buffer with `LessEqualDepth`, so the LAST face drawn wins
— and its opaque sort falls back to distance from the camera, which reorders the
pair as the camera moves. That flip, once a frame, is the flicker.

`renderOrder` is the first key of that sort, ahead of the material and the distance,
so `three/props.ts` gives every record its own — the map's own order, fixed for
good. It costs the material batching across props, which for a hundred-odd objects
is nothing.

### THE SECOND PASS over the throw: how hard, and through which BEATS

Play watched the first attempt and named three separate things: "сначала взрыв —
даже 2 мины — а потом толчёк", "толчёк очень мелкий", and "динамит не толкает".
Three causes, and only one of them was the blast.

**1. HOW HARD.** The magnitude was a flat 0x40 borrowed from the building's own
push, and 0x40 is **less than a punch**: the melee's knockbacks are 75 (bayonet),
100 (trotter), 125 (knife), 150 (sword), **200 (cattle prod)**, all through the
same `0x4a9100`. So it scales with the DAMAGE now — four times the points, capped
at the prod's 200 — and the two ends land on the engine's own numbers: a grenade's
thirty come to 120 = 0x78, TNT's fifty to the 200 cap, a mine's twenty to 80. The
falloff is free, because the damage already carries it (`lib/game/blast.ts`
`flingSpeed`). The four and the cap are the remake's.

**2. THE BEATS.** The acting pig's walk lives at the bottom of `battle.update`,
past three branches that return early — the beat after a blow, the beat that ends
the turn, and the turn a weapon has spent. A blast can throw the pig inside any of
them, and the flight was simply not advanced there: frozen for the length of the
beat and finished afterwards ("а потом толчёк"), or dropped outright, which is the
whole of "динамит не толкает" — TNT's six-second fuse runs out AFTER the four
seconds the turn hands back, so its blast always lands inside the end-of-turn beat.
`flyOn` advances it wherever the frame is, and `settling()` now counts the acting
pig's own flight so the beat waits for the landing.

**3. A PLACED CHARGE DOES NOT MOVE.** Play: "динамит катится по склону." It was
stepped like anything else in the air, so gravity pressed it into the hillside and
the contact carried the whole slope-parallel part on — the very rule this engine
got right for grenades. Nothing has to fall for a charge to be PUT somewhere, so
only its fuse runs now (`lib/game/lobs.ts`). The exe has a rest state for a body
and it is not decoded; this is that state for the one thing born in it.

### THE SHELTER: a collider 96 units too wide, and no way in by design

Play: "у бомбоубежища силовое поле — моделька больше чем текстуры — с лицевой
стороны и задней нельзя подойти вплотную." Measured over every shipped map: of the
1113 box-shaped records whose extents ARE their model's own footprint, all but
sixteen match as stored — and **fourteen of those sixteen are the SHELTER**. Every
SHELTER in the game, at all four yaws, carries 832×640 for art that measures
640×832. So the collider hung 96 units past the art on two faces and fell 96 short
on the other two, which is exactly the pair play could walk into.
`TRANSPOSED_BOX` in `lib/game/obstacles.ts` is that one name, and it says why.

**Getting INSIDE is a missing FEATURE, not a bug — and it is BUILT now**, further
down under "THE SHELTER". The model is a closed twelve-triangle box with no
interior to walk into, in the remake and in the original alike; what happens is
that the pig stops being drawn. The skill numbers this paragraph used to carry were
wrong and are corrected there: 60 VEHICLE INOUT, **61 BUILDING INOUT**, 62 EJECT
PIG, and 64 is BINOCULARS.

**And the props are UNLIT at last.** `three/modelMesh.ts` has said since it was
written that a map's props must not be lit — a third of their NO2 entries are
garbage floats and the faces reference them — and no caller ever passed the flag.
`three/props.ts` does now, which puts them on the same footing as the ground.

### THE THIRD PASS: the door, the walls, the pig's own sphere, and the smoke

Play's batch, in the order the answers came.

**"В игре не может быть мусора" — and he was right to push.** The claim that a
third of a prop's normals were garbage floats is corrected where it lived
(`three/modelMesh.ts`): the bytes are **x86 instructions**. STW07PWW's NO2 holds 28
entries, 7 unit-or-zero and 21 reading `5a 59 5b c3` (pop/pop/pop/ret),
`53 51 52 56`, `b8 ff ff ff`, `e8 d4 1e 00` with every fourth dword zero — the
archiver padded with whatever memory it had. The layout is not in doubt
(`british.mad` is 97.5% unit through the same reader), and a quad's four normal
indices ARE its four vertex indices, so the faces point into the code. Which
settles unlit props from the other end: the original cannot be reading that.

**A RECORD'S OWN HEALTH beats the table.** "У дома кажется сильно много хп — с
1-го взрыва дверь ломается." The door says so itself: CAMP's record 46 is
`STW04_D2` and its **field 12 is 50**, exactly TNT's fifty at the core, where every
wall round it leaves the field at 255 and takes the table's sixty. The exe reads it
at 0x4a6179 (`field12 << 7` into `[+0x4c]`, and `[+0xa8]` too for the breakable
class); 5479 of 6322 shipped records say 255, and `lib/game/targets.ts` now honours
the rest.

**A WALL IS THIN, and that is what "дом бестелесен" was.** `MIN_SOLID` asked both
horizontal extents to reach two box units, and every wall piece in the game is ONE
unit thick (STW04PPP 64×512×512, STW07PWW 64×512×2048). The line is on the
FOOTPRINT now — a box stops a pig unless it is a single unit square, which over the
shipped data is exactly the tufts, the fish, a lamp post and a chimney pot.

**The pig's body is READ at last: a sphere of radius 0xAA = 170.** The 160 was half
a spawn marker's 5×5×5, and the loader jumps the box build outright for a pig
(0x4a61ad) — so that marker is not a collider anywhere in the original. What a body
is comes off the type-keyed table at 0x4a90cc: slot 0 is shape kind 2 with
`esi = 0xAA`, and slot 7 gives the blast effect the 35 this engine already draws
with. So the pig keeps a radius, and it is now the game's own number.

**COLLECTING a crate takes NOTHING away — only PLACING one does**, which is the
exe: `Pig::ClearInventory` (0x468f50, unconditional, no training-ground guard in
it) is called from the placement arm at 0x4aa6cb, and only on its PICKUP branch,
the other jumping clean over it at 0x4aa659.

**A rule that took your weapon on every collection stood here for a pass, and
it began as this repo reading play BACKWARDS.** "Тнт не забирается когда аптечку
в доме подбираешь… должен" was taken for a request that it BE taken; it was a
report that the TNT survives a medkit, and that it should. Play settled it in
one line — **"должен оставаться — я сказал"** — and then had the second half
out too: "ящик с оружием при подборе всё ещё забирает то, что несёшь — а вот
это давай сразу почистим." Worth keeping as a shape rather than as a fact: a
sentence of play's describing what the game DOES is not automatically a request
to change it, and the cheap check — asking what the line would BREAK if applied
— was available before the code was written.

What it broke was the training ground, and the arithmetic is all in CAMP's own
records. The DOOR (record 45, `STW04_D2`) is the one piece of the house with a
health of its own — **50, exactly TNT's damage at the core**, where every wall
beside it takes the table's 60 — and the only one carrying a command (opcode 22,
waiting on 89, signalling **7**), which the bazooka crate (18) and the house's
own medkit (55) wait on. So breaking a WALL places nothing, correctly; every
skill on the training ground being UNLIMITED, the player still has the TNT and
can go and blow the door — unless a medkit has emptied their pockets on the way,
there being no second TNT crate (record 52 is the only one, waiting on label 6).

**And the confiscation can only ever happen on CAMP — measured over all 61
shipped POGs.** Only CAMP has crates that WAIT to be placed (eight of them);
every other map's crates stand on their ground from the start, so the pickup
branch that clears is never reached. Eight maps besides it do run script steps
(BHILL, BRIDGE, GENMUD, MASHED, OASIS, SNAKE, SNIPER, TRENCH have waiting
records), but what they hold back is scenery, not pickups. **Not pinned by a
spec** — `docs/todo.md`.

**A steep throw goes IN.** "Если вертикальная скорость выше горизонтальной —
прожектайл тонет." The skip already needed 150 along the surface; it now also needs
to be going along faster than down, which is the same reading of `[contact+0x14]`
the page already argues for, with the case play caught added to it.

**Black smoke, and a bullet that smokes.** A puff was 55 units across in mid grey —
a sixth of a pig, invisible beside a fireball. It takes the fireball's own colour
law now (`cloudChannel(16)` = 100 of 255) at a size where fourteen of them read as
a cloud. And a bullet lays the same trail a grenade does — **which was right by
accident**: the CONSTRUCTOR's dispatch answers kinds 21..53 only, so a bullet is
outside it, and what actually hands one over is the projectile UPDATE's second
per-kind dispatch, where kinds 12..17 push the grenade's own id 0x15.

**Finding that dispatch is the pass worth remembering.** The same reading had been
offered as "the exe hangs nothing on a bazooka either" and play refused it in one
word — "ВРЁШЬ!!!" — and was right. The update has TWO per-kind dispatches; the one
that had never been read (0x436596 → 0x436727, the map at 0x436D68 indexed by the
kind STRAIGHT) hangs effect **0x14** on kind 10 on its second frame. Reading it
also corrected the grenade: the id → update map (`[0x48BF90 + id − 1]`) puts 0x14
on the ÷6 arm and 0x15 on the ÷3 one, so the "six a frame of type 0x16" this repo
called a grenade's trail is the ROCKET's, and a grenade lays **three** of type
0x19.

`lib/game/trail.ts` carries all three rows and **every number in them is the
engine's**. A pass that gave the rocket a white, double-size row off play's
"белый густой дым" was sent back — "давай делаем как в движке, в этом же и суть"
— and the count is where the difference really lives. If a trail reads as nothing
on screen, the thing to fix is the PUFF (our canvas blob against the original's
textured additive particle), not the row.

**The flight ANIMATES.** "Отбрасывание не запускает анимацию полёта. падение не
запускает анимацию подьёма после полёта." Both were one line: the frame dresses
every non-acting pig in IDLE once a frame, which took the bounce clip straight back
off — and the two beats did the same to the acting pig. All three now leave a pig
in the air alone.

### THE PIG IS TWO NUMBERS, and a wall it hides behind FADES

**"Раздутая свинья."** Play: "очень сильно заметно что цепляет всё невидимыми
боками." The 170 read out of the exe is right and the mistake was the units — it is
a MODEL-space length, and every one of those halves in this remake (the bayonet's
460 → 230, `lib/game/melee.ts`). Halved it is **85**, and the pig as DRAWN — bone
offsets resolved, `MODEL_SCALE` applied — is **182 across the shoulders**. The exe's
own body and the visible pig are the same size, which is the check that the halving
is right.

**But one cylinder cannot be a pig**, and the tutorial is what proves it. The drawn
body is 393 nose to tail; the GAP in CAMP's first bridge is 512 and a running jump
carries 303, so nothing narrower than 104 either side can cross it — and the
tutorial's own words are JUMP THE GAP. So the two questions are two numbers:

- **`PIG_RADIUS` = 85** — how near a wall it may stand. Its SIDES.
- **`PIG_HOLD` = 196** — how far past an edge it is still held up. Its LENGTH,
  because a body is supported while any part of it is over the edge.

**A WALL THE PIG HIDES BEHIND FADES.** "Здание не просвечивает когда свинья
внутри", and then "там полупрозрачность — в exe посмотри." Both true, and the exe's
own hook is now written out in `../pigs-disasm/objects/notes.md`: the draw loop
dispatches on body type through a twelve-entry table (0x44e5e8), and the **BUILDING**
arm (0x1359, 0x44e486) calls `afForceTransparencyOff` when `[pig+0x170]` — what a
pig has ENTERED — is the building being drawn. Two things it is not: the PC
wrapper's hook is a stub (three instructions, stores its argument, nothing reads it
back), and the semi-transparency is not in the art (the PSX palette bit is set in 6
of CAMP's 191 textures, none of them the house's).

CAMP's house is not a BUILDING either — it is eighteen scenery pieces — so the
remake does the general version: `lib/game/seeThrough.ts` says which records the
segment from the eye to the pig's middle crosses (a slab test in each box's own
frame, so an oriented box needs no special case) and `three/props.ts` swaps those
meshes onto a cloned see-through material set. Every record of a model shares one
material array, which is why it clones rather than turning the shared one down.

### THE FUSE BURNS, and the throw is six times the damage

The last two off play's list, both of them numbers or art the exe does not give.

**"Динамит не горит."** It does now: a spark on the end the black stub is on, which
is the end that stands up. `three/fuse.ts` — an additive sprite that flickers on the
battle's own clock, so two machines stepping the same battle draw the same flame,
sized off the bundle and placed at model x −148 (the far end of the stub, measured
when the charge was stood up in the first place). **Nothing about it is a reading**
and the file says so at the top: the two mine rows differ only in their effect ids,
0x4c against 0x55, and those two turned out to be the mine's BLAST and not its fuse
(see below), so there is still nothing read behind the spark. `window.pow.debug.burning()`
counts them, because a sprite on a transparent quad is not something a screenshot
can be held to.

**And the throw went from four times the damage to SIX.** Play: "отбрасывание миной
всё ещё кажется слабым (может я не прав)." Not wrong — at four a mine's twenty
points came to 80 a frame, between a bayonet and a trotter. At six the three blasts
in the game land like this, all of it under the cattle prod's 200 which is the
hardest knock the exe hands out:

| blast | points at the core | speed |
| ----- | ------------------ | ----- |
| a MINE | 20 | **120 = 0x78**, the engine's own other decoded knock |
| a GRENADE | 30 | 180 |
| TNT | 50 | 300, held at the 200 cap |

### A MINE does not go off like a GRENADE — it is parameter row 14

The open list said the two mine rows' effect ids, 0x4c and 0x55, were "the likeliest
place the original's mark lives" and that their two-level dispatch had not been
untangled. It is untangled now, and it says something else.

Both ids reach the SAME arm — `byte [0x489680 + id − 1]` gives slot 51 and slot 56,
and the jump table at 0x489574 holds `0x488fb8` for both, which is three
instructions: `push 0xE; call 0x48ccc0`. So the two flavours are identical and both
read **parameter row 14**. The remake had been blowing every charge up with row 0,
which is the grenade's, and that was never read for the mine — only assumed.

**The twelve stages are pinned end to end now**, which is what made row 14 readable
at all. Every one of them is `flag = param(f) == 1`, `when = param(f+1)`,
`base = param(f+2)`, straight off the update loop at 0x48bcaa..0x48bf1b — clouds at
flags 0x00/0x0a, rings at 0x14/0x21/0x2e, bursts at 0x5b/0x66/0x71/0x80, and three
more (0x53 inline, 0x3b and 0x47 through an undecoded spawner). The check that says
the map is right rather than plausible: **run row 0 through it and `ROW_ZERO` comes
back out to the number**, frames and all.

| | a GRENADE (row 0) | a MINE (row 14) |
| - | - | - |
| fireball | TWO clouds, dark red then near-black | **one**, dim (5,2,0), rising less and falling harder |
| ring | none at all | **one**, and it SLOWS — drift −2, warm (13,10,4) |
| smoke | 14 puffs thrown OUTWARD over frames 2 and 3 | **18 thrown straight UP**, `out` 0, all on frame 1 |

A buried charge throws its smoke up and a thrown one throws it out, which is the
whole difference in one line. `MINE_EFFECT` in `lib/game/effects.ts`, and the seam
that carries it is the exe's own shape: a `Charge` names the effect id its
destructor spawns (`LOB_EFFECT_ID` 0x54, `MINE_EFFECT_ID` 0x4c), the `blasted` event
carries it, and `effectField.blast(at, effect)` picks the row. The SOUND is shared —
`0x48ccc0` plays 0x1a whatever the id — which is what the older note's "both funnel
into the same `E_1`" was seeing.

### A trodden mine wears `WE_APMIN`, and it comes off the MAP

The object name table is 466 POINTERS at 0x4d9680 with `START_OF_AMMO` at 387, so a
projectile row's id indexes it — and **rows 428 and 429, the two mines a foot sets
off, are both `WE_APMIN`**. Not the `WE_MINE` a pig carries, which is entry 20 of
`Chars/WEAPONS.MAD`; `WE_APMIN` is not in that archive at all. It is in **every
map's own .MAD**, all 61, beside the trees — along with `WE_GRE2`, `BULL1`,
`WE_BOMB` and the rest of the AMMO run. So a projectile's art loads the way a tree's
does.

Two things had to move for it. `main/assets.ts` walked the .POG for "one model per
placed record" and nothing places `WE_APMIN`, so `lib/game/ammo.ts` names the models
the ENGINE spawns and the loader takes those too; and `three/props.ts` grew
`spawn(name)`, a fresh mesh off the map's own shared geometry. `three/mineArt.ts`
now draws two lists from two models, and the split is the honest one: **the trodden
ones are the engine's art** (`WE_APMIN`, lift 44 — the model runs y −46..44 and
Y-DOWN makes the greatest y its underside, which the art agrees with: the flat plane
at 44 carries `APMIN002` and the red plunger at −46 sits on top), and **the revealed ones are the
remake's own**, still `WE_MINE` standing in until the yellow-and-black ground
texture lands.

`pow.debug.minesTripped()` counts the first kind on its own, and it earns its keep
here rather than being a nicety: if the loader ever stops picking `WE_APMIN` up, the
mine draws NOTHING and nothing else in the suite would notice.

### The pig's DRAW SCALE: the question dissolves

Open item 5 is closed and nothing had to change. The pig's constructor pushes
`0x1000` three times where the loader's building arm pushes `0x800`, and the worry
was that the original draws a pig at full model scale. It does not read either
number: both paths funnel into one base constructor, **`0x4a7db0`**, which is thirty
instructions and ends `ret 0x2c` — eleven dword arguments — and it reads exactly
**two** of them, arguments 1 and 3, into `word [this+0x2c]` and `[this+0x2e]`.
Everything else it writes is a zero or a constant. The scale triple is arguments 7,
8 and 9, and on the pig's path they are dropped twice over: its intermediate
`0x4407e0` ignores the three it was handed and pushes three fresh `0x1000`s, which
`0x4a7db0` then also drops. A dead argument in the engine's object constructor. The
body stands on the two measurements that agree — the shape table's 0xAA halved, and
the drawn shoulders.

### The judder measure is a RATE now, and both bars are back at 0.35

`002/camera-smooth.spec.ts` was scoring the second difference of the view direction
PER FRAME, which asks a frame that took 33 ms to have moved the camera as far as one
that took 16 and calls the difference judder. On a machine running other suites the
frame interval swings by that much, so the number wandered — 0.15 quiet against 0.39
busy, on a bar of 0.35 — and one of the three bars had already been let out to 0.6
to live with it.

Dividing each step by the time it was given fixes it at the root, and the time is the
app's own: `pow.debug.frame()` hands out the very delta `three/battle.ts`'s `onFrame`
was called with. The sampler's own gaps could not do it — its callback runs after the
battle's in the same frame, so those gaps carry the app's work as noise. A view moving
at a steady rate now scores zero however uneven the frames are, and the case the spec
exists for still scores about 1. Measured: 0.162 / 0.039 / 0.131 alone, and
0.156 / 0.039 / 0.077 inside a full run. All three bars are 0.35.

`002/effects.spec.ts:161` was the other one, and it was not flaky either — it was
asserting on blob 0 alone something that is true of most of a cloud and not all of
it. A sprite's in-plane speed is `((trig * sinPitch) >> 11) * out * spread >> 7` with
`trig` at most 256, so a sprite whose pitch rolls under about 2.5° has BOTH
components truncate to zero and goes straight up — about one in sixteen out of a 44°
cone. The claim belongs to the population: 80% of them spread, and the ones that do
not have nothing sideways to move along.

### THE SHELTER: a pig JUMPS IN, and is gone from the picture

Play: "давай бомбоубежище доделаем — свин должен запрыгивать внутрь. И видит
бомбоубежище — в инвентаре скилы только постройки, и у бомбоубежища это только
пропустить ход. И просвечивать должны стены, которые мы взрываем — не
бомбоубежище." Three sentences, and the third turned out to be a consequence of
the first.

**Being inside means NOT BEING DRAWN, and that is the exe's own rule.** Both of
its doors — 0x469f60 in, 0x469b60 out — and the loader's own boarding do the same
two things to the pig: `[body+0x44] |= 1` and **`[pig+0x30] = 0`**. That second
byte is the gate the draw loop tests every object on (0x44e43e) and the base
constructor clears it (0x4a7e1b). So a pig in a shelter is off the screen, and
`lib/game/indoors.ts` does the same through the snapshot's own `sheltered` flag.

Which settles the fade: **a BUILDING is out of `sightBlockers` altogether**. Play
asked for it and the reason is stronger than the request — there is nothing behind
the wall to see. The eighteen pieces of CAMP's house are ordinary breakable scenery
and go on fading, which is the half play asked to keep.

**A building's own row is read**, out of 0x4c2e08 the constructor indexes by
`kind − 1` (`lib/game/buildings.ts`), and it carries two numbers:

| kind | | health | room |
| - | - | - | - |
| 1 | BIG_GUN | 200 | 1 |
| 2 | M_TENT1 | 30 | 2 |
| 3 | M_TENT2 | 40 | 4 |
| 4 | PILLBOX | 100 | 2 |
| 5 | **SHELTER** | **100** | **3** |
| 6 | TENT_S | 25 | 1 |

The second column is a CAPACITY and it is read rather than guessed: 0x46ca50 takes
`[+0xd8] − [+0xe4]` through `neg`/`sbb`/`inc` — the compiler's `== 0` — and turns
the pig away when they are equal, `[+0xe4]` being the occupant count kept beside
the list `Building::AddOccupant` (0x43f7f0) hangs off `[+0x80]`. So three pigs fit
in a shelter and the fourth is refused. The HEALTH is read and deliberately NOT
applied — a building is still not breakable here — and `002/shelter.spec.ts` pins
it so the reading cannot rot.

**The door has a KEY OF ITS OWN — `C` — and that was a correction.** It went in on
the jump key first, off "свин должен запрыгивать внутрь", and play sent it straight
back: "я не говорил по пробелу — там просто анимация входа, запрыгивание; сделай
отдельную кнопку, пробел уже прыжок." Right on both counts. The **запрыгивание** is
the animation the original plays, not the key, and a door sharing the jump means a
pig standing against a shelter cannot hop — one key wearing two meanings, which is
the kind of thing that reads as a hack because it is one. So `enter` is an action
of its own (`input/actions.ts`), `enterBuilding` a verb of its own
(`lib/game/controls.ts`), and `002/controls.spec.ts` pins that SPACE still means
jump in the battle and that nothing else is bound to `C`.

The exe's own door is the SKILL, 61 BUILDING INOUT out of the menu, and that is
still where it belongs the day the other five buildings are worth entering; the key
is the remake's and says so where it is bound. The verb is answered before the
walk, because a pig inside is not driven at all — no walk, no turn, no jump, no
crate collected, no mine trodden on. The FIRE key still reaches it, because SKIP
TURN has to.

**The entry ANIMATION is not built and nothing was found to build it from.** The
exe's enter arm (0x469f21..0x469fb4) calls `0x4a9800`, `0x4734b0`, `0x4a9ee0` and
`0x4a9e50` and **no `Pig::SetAnim` at all** — it clears the draw byte and the pig
is gone. So whatever play remembers hopping in is either one of those four or a
clip the picker asks for elsewhere, and inventing one here would be a stand-in.

**The menu indoors is the BUILDING's list, not the pig's** (`choosableIn`), and a
shelter's is empty — so the menu comes up with the one entry it always adds and
that entry is SKIP TURN, which is exactly what play described. The PILLBOX's own
45 HEAVY M-GUN and 46 FLAME THROWER are read and left out on purpose: neither is
built, and a menu entry that does nothing is the one thing a menu must not have.

Two numbers are the remake's and say so at the field: the reach — the exe's 0x100
applied to the building's own FOOTPRINT, because the pair its own test differences
comes out of an untranscribed call — and where a pig comes back OUT, which is the
doorstep it jumped from rather than anything the exe was seen to compute.
`pow.debug.shelter()` gives the building he is in, the one he could enter, and
whether his model is on the scene at all, because none of it is visible by design.

### A BULLET IS REGISTERED BY THE BOX THAT STOPPED IT

Play: "пуля врезается в манекен и ничего не происходит — там что-то с регистрацией
попаданий", and before that the guess that turned out to be right — "я подозреваю,
твоя обрезка свиней как-то повлияла на манекены?"

It did, through a place that has nothing to do with dummies. A bullet was resolved
world-first: `obstacles.solid()` spent it, and the targets were then looked for by a
POINT test whose window was `HIT_RADIUS` — which was **`PIG_RADIUS`**.

A DUMMY is BOTH things at once: a 128 × 512 × 256 collision box and a target. So
which of the two tests fired first was pure geometry.

| | window on the target | the box's own half-depth | which fires first |
| - | - | - | - |
| `PIG_RADIUS` **170** | 170 | 128 | the TARGET — the hit lands |
| `PIG_RADIUS` **85** | 85 | 128 | the BOX — the bullet is eaten a step early |

Halving the pig was right and stays right: it answers "how near a wall may it
stand", which is what play felt as "цепляет всё невидимыми боками". What it also
did, silently, was pull a bullet's hit window inside the collider of every dummy in
the game.

**The fix is not a number.** `ObstacleField.stopper(x, y, z)` returns WHICH record
stopped the point, and `lib/game/bullets.ts` gives that record the damage if it is
something that breaks. A bullet is stopped by geometry and the geometry's owner
takes the hit — a record's own box is a better hit shape than a radius borrowed from
a pig, and the two numbers can no longer disarm each other. The point test survives
for targets with NO collider, which is what it was always for.

**Why the suite was green through all of it, which is the part worth keeping.**
`002/shoot.spec.ts` shoots the first target the map SCRIPT places — and that one has
no collider, so the point test caught it and the spec passed while the game did not.
The new pin shoots a **DUMMY** and asserts `box.halfZ > PIG_RADIUS` first, so it is
standing on the very geometry the bug lives in. It was checked by reverting the fix:
it fails with "the bullet did nothing at all", which is play's sentence.

Two general lessons, and the second is the one that cost the time:

- **A constant borrowed across concerns is a trap with no compiler behind it.**
  `HIT_RADIUS = PIG_RADIUS` read as tidy and coupled "how near a wall a pig may
  stand" to "whether a bullet hit a dummy".
- **"The suite is green" is not "it works".** Two hundred and fifty tests passed
  over a game where no gun could hit a dummy. What the suite covered was the case
  with no collider; what a player does was uncovered. When play reports something
  the suite says is fine, the suite is what is wrong.

And **I said the wrong thing twice on the way here** — that the entry animation did
not exist (it is clip 7, above), and that the pig-shrink was not the cause. The first
came from reading one arm and stopping; the second from three measurements that all
happened to test melee, which really was fine, while the report was about a bullet.
Neither was a guess presented as a guess, which is the fault.

### PLAY'S OPEN LIST — what is still open (2026-08-11)

Everything play has named over four passes is written up above as its own section:
the charge that stands fuse-up and burns, the blast that throws and how hard, the
house that takes damage and stops flickering and stops being walk-through, the
shelter's collider, the door's own health, the pig that is no longer twice its own
width, the wall that fades when he is behind it, the crate that empties the hands, a
steep throw that goes in the water, black smoke, a bullet's trail, and now the mine
that explodes with its own picture and wears the engine's own model. What is left is
here rather than in a chat that scrolls away.

**PLAY'S NEWEST LIST, straight off testing the shelter (2026-08-11).** Written down
before anything is touched, with what is already known about each — none of it is
done yet.

1. **A wall should go SEE-THROUGH, not vanish.** "Стены должны не пропадать, а
   становиться полупрозрачными." `SEE_THROUGH` in `three/props.ts` is **0.5** now,
   up from 0.25 — half, the one value that cannot be argued in either direction:
   the wall is exactly as present as what is behind it. It is the remake's own
   number and there is nothing in the binary to check it against, so the next move
   on it is play's. The `depthWrite: false` STAYS and is not part of the same
   question: it is there so a faded wall does not go on occluding the pig, which is
   the whole point of fading it, and turning it back on would undo the feature at
   any opacity.
2. ~~**The dynamite's flame is not the game's.**~~ **Done, and it was exactly where
   the guess said to look.** Kind 53's constructor arm (`0x432414`, shared with kind
   52) hangs a PARENTED effect on the projectile the same way the grenade's arm
   (`0x43247b`) hangs id 0x15 — same call, same tail arguments — with id **0x1D**
   and one changed argument: **0x3C** where the grenade passes zero, so the effect
   rides up the FUSE. Its update arm (0x48ad9d) is the trail's shape with its own
   numbers: **four** a frame rather than six, of particle type **0x18**, whose
   setter (0x486f16) gives colour **0x14A5** — five of thirty-one on every channel,
   dark smoke — in puffs of **0x10**, twice a grenade's 8. A planted charge does not
   move, so all four land on the same spot: a column of smoke off the fuse. **There
   is no fire in it.** `lib/game/trail.ts` now carries both rows (`LOB_TRAIL`,
   `FUSE_TRAIL`), `three/lobTrail.ts` draws either, and the invented
   `three/fuse.ts` is deleted. Not carried over: the arm also plays **sound 8** at
   100/100 as the charge goes down (0x43246b), and the particle spawner's own fields
   past what the row quotes.
3. ~~**A charge is planted AT the pig, and should be IN FRONT.**~~ **Done, and by the
   HAND rather than by a number.** `Lobs.plant` now puts it where `HAND_BONE` is —
   the same bone the throw leaves from — with the pig's own feet for the height, so
   a pig on a bridge does not lay one in the ditch, and a battle nobody is drawing
   (`NO_POSE`) falls back to the soles. Measured in play's own path: **131 ahead and
   16 aside**, against a pig 85 in radius. The spec's floor is `PIG_RADIUS`, so it
   asserts "in front of it" without pinning a number the pose owns.
4. **The house's SEAMS still misbehave.** "Всё ещё текстуры странно себя ведут на
   стыках дома." The per-record `renderOrder` fixed the z-fight between the twelve
   COPLANAR pairs; something else is left. Two candidates, neither measured: the
   64-unit overlap itself (the faces are inside each other, not merely touching),
   and texture bleed at the UV edges — the atlas has no padding and the models' UVs
   are in pixels.
5. **A pig thrown by a blast SPINS about its own axis** — and BOTH guesses are now
   measured out. "Летящая свинья вроде ещё крутится вокруг своей оси."
   - *Not the draw path.* `heading` reaches the picture from one place —
     `pigShotOf` copies `pig.heading` (engine.ts), `squad.place` turns the node by
     it — and nothing writes it from a velocity. `tumble.update` writes
     `pig.position` and never `pig.heading`; `updateLocomotion` touches heading in
     exactly two places, the turn key (guarded on `airborne === null`) and the
     wall EJECT.
   - *Not the clip.* BOUNCE is clip 39, twenty frames, and bone 0 does not move at
     all in it — x/y/z spans of 0°, a constant z of 43°. Its root track has a y
     span of **zero**. The biggest thing in it is 44° on bone 10. It is a flail,
     not a somersault.

   What is left unexamined: the wall EJECT (`locomotion.ts`, `state.heading =
   query.downhill(...) ?? state.heading + π`), which a pig landing wedged runs
   every 25 frames — a half turn each time would read as spinning. That is a pig on
   the GROUND, though, not one in the air, so it may not be what play saw.
6. ~~**Going in puts the pig at the building's MIDDLE, and that is not where he
   should be.**~~ **Done, and the middle was right — it was the JUMP CUT that was
   wrong.** Play settled it: "свин прыгает на месте — должен прыгать в центр
   строения и выпрыгивать из центра строения наверх." The door arm writes three
   signed words at `[pig+0x210..0x214]` and the pig's own update ADDS them to the
   body's position every frame the clip runs (0x46e1a1), each being
   `(target − here) / n`. Going IN, all three axes step to the building's own
   transform and the pig stays DRAWN for the whole of it. Coming OUT, **x and z
   are written as zero** (0x46a150, 0x46a15e) and only the vertical is stepped —
   so a pig leaves through the TOP and nowhere else. That also re-reads the old
   "из убежища выпрыгивает на крышу": the destination was never the bug.
   `lib/game/doorway.ts` is the glide, `battle.ts`'s door block drives it, and
   how FAR up is the one number not recovered — `[+0x212]`'s difference runs
   through 0x479690 and two pushes that move the frame under the reads, so the
   remake takes the building's own box top and says so.

   *(What this entry used to say, kept because it is still true and still worth
   not re-deriving: the transposition does NOT move the centre — `TRANSPOSED_BOX`
   swaps `halfX`/`halfZ` and nothing else, so `box.x/z` is the record's own
   position, which IS the transform 0x469fde copies.)*

7. ~~**Coming OUT lands him on the ROOF.**~~ **Answered by the same read as 6: out
   through the top IS the original.** Two measured negatives survive from the pass
   that chased it as a bug, and both are worth keeping. *(a)* `footingAt` does not
   snap to the box: CAMP's SHELTER box runs y −1568 (top) to −1184, the ground at
   its wall is −1216, so the top is **352** above the doorstep — past `WALL_CLIMB`
   128 and past `PIG_HOLD` 196 alike; a footing rebuilt at the doorstep gives
   −1216, one rebuilt at the shelter's own centre gives −1216, and a pig left
   standing at that centre for three seconds neither rises nor wedges. *(b)* Clip
   7 does not clamp him up there either: its root track runs −115 at frame 0,
   −564 at its peak and **−115 again at frame 53**, so a held last frame holds
   nothing. What play was complaining about was the jump cut, and the glide is
   what fixes it. The door still hands back the footing it took
   (`indoors.enter(pig, footing)` / `leave`), because deriving one where a kept
   one exists is guessing — from the box top the rebuild does stick to the box
   top.
8. ~~**Finishing the shelter does not move the TUTORIAL on.**~~ **Done** — and the
   shelter had nothing to do with it. See "THE TRAINING SCRIPT MOVES" below.

1. **A trodden mine wants an EXCLAMATION MARK over it.** "когда наступил — мина
   появляется с восклицательным знаком над ней." The mine itself appears now, in the
   engine's own `WE_APMIN`; the mark is still not found, and this pass ruled out six
   places by measurement rather than by looking: the mine's effect (0x4c/0x55 are the
   BLAST — row 14), the whole tread path (0x46bfd9..0x46c169), the projectile's model,
   `WE_BANG` (a wire and a box — it is skill 40's MINE SHELL), `MAPICONS.MTD`, all 743
   texture names in the install, and every one of `gtext`'s 272 strings. **Where to
   look next:** the battle FONT drawn in world space the way a damage number is —
   effect 0x35 through 0x487b90, and a sibling call passing a character rather than a
   value would be it — and `Language/Tims/fonttims.mad`, which nothing in the exe has
   been traced to. `weapons/mines.md` has the negative results so they are not redone.
2. **The reveal is a TEXTURE SWAP, and for three classes.** "инженеры и командос с
   героем видят жёлто-чёрные текстуры там где есть мины", the range applies to the
   ground AND the map view ("к земле тоже"), and the enemy simply is not shown them
   on the minimap. What is built instead: the `WE_MINE` model for the engineer family
   (5, 6, 7) inside 1024 on the ground. Play, twice: "но ладно это потом" and
   "индикатор мин пока рано — у нас нет инженеров щас". So it waits on the classes.
3. **Walking into a dummy shoulders the pig PAST it.** Measured while hunting the
   bullet: hold W at a dummy and the pig is stopped 149 out, then the wedge counter
   sidesteps it — x moves and z holds for four ticks — and it squeezes round the
   corner and ends up **687 units beyond** the target. Release the key at the moment
   it stops and the swing lands, so this is not the strike; it is that you cannot
   stand still in front of a small box by walking at it. The wedge exists to get a
   pig off a wall, and a dummy is not a wall. **Play confirmed the reading**
   (2026-08-11): "это потому что постепенно сдвиг в бок идёт и обход цели — не
   проход насквозь." So nothing walks THROUGH the dummy and no spec claims one
   does; the collision holds and it is the sidestep that has to stop firing here.
4. **`002/camera-smooth.spec.ts`'s opening drop scores worse near 60 fps.** 0.157 at
   144 fps and 0.355 at 62, which is a hair over the engine's own 60 Hz step — so its
   bar is 0.5 where the other two are 0.35, and the score now reports the frame rate
   it was measured at. The measure itself is sound (it is a rate, not a step). What
   is not answered is why the DESCENT is the one that shows it: the pig is drawn
   between steps like everything else, so the suspect is `dropInArt.riseOver`, handed
   to the chase separately and tweened by nothing.
5. **The rest of getting INSIDE.** The SHELTER is done (above); what is left round
   it is the other five buildings' reasons to be entered. The **PILLBOX** wants its
   own two weapons, **45 HEAVY M-GUN** and **46 FLAME THROWER**, and the taxonomy's
   GUN_BARRELS group beside them (BIGBAR, BUNKGUN, PILLBAR, AMPHGUN, B_GUN, TANBAR);
   `buildingSkills` is the table they go in and it is empty on purpose until they
   exist. **A VEHICLE is the other half** — skill 60 VEHICLE INOUT, `[pig+0x2ec] = 3`,
   body type 0x1358, through `0x49a320` instead of the building's `0x43f7f0` — and
   none of it is built. **And some pigs START inside**: `0x47d4e0` runs once from the
   map loader, walks the object list for every pig whose `[+0x3c0]` is 1, and boards
   the nearest thing within **4096** units; which marker bit fills `[+0x3c0]` is not
   decoded (the loader takes it from a stack table at `[esp + (flags & 0x40) + 0xc8]`,
   0x4a6768). Two more that will matter the day a pillbox is worth entering: the exe
   refuses a building the OTHER SIDE is holding (`0x43f910` against `[+0x194]`), and
   its own reach test differences a pair of words out of `0x44e850` that have not
   been transcribed. `objects/notes.md` has the read.

### THE TRAINING SCRIPT MOVES — and no step is hung on a building

Play: "выполнение задания по убежищу не двигает туториал." The guess in the list
above was that the shelter wanted a trigger of its own. It does not. **Nothing in
the original's training script fires on entering a building**, and the two lines
that mention one are an ordinary pair of crates: "USE BACKSPACE BUTTON TO ENTER
AND EXIT BUILDINGS OR VEHICLES" is the health×25 crate being COLLECTED, and
"ENTER THE BUILDING AND COLLECT THE CRATE" is the bazooka crate being PLACED.
Walking in is never a step; collecting is.

**"— inside it" used to end that sentence and it was never read.** Measured off
CAMP.POG (2026-08-12): the bazooka crate #19 stands in the open at
(−5376, 11008), the nearest building on the map is the SHELTER **5894** units
away, and what stands beside the shelter is the health×25 crate #56, 1305 from
it. The LINE is the game's; where it sends you is undecoded, and the map does not
agree with the obvious guess. One for play.

What was actually missing is the whole other HALF of the script. Everything the
remake could say hung on a crate being collected, and **a collected crate signals
nothing**: field 15's high byte is its contents, so `Command.signals` is always 0
(`lib/game/script.ts`). The chain runs on DUMMIES breaking, and what speaks then
is the second dispatcher, `0x465AB0`, called from the placement arm at
`0x4AA6B7` — guarded by the training flag and by the crate not being a health one
(`cmp [esi+80h],1`). Those are the six "FOLLOW THE … PATH" lines, and without
them the sergeant explains each weapon and never once says where to go.

Its table is read off the jump table rather than off its prose: `[skill - 7]`
into the byte map at `0x465C88`, six targets at `0x465C70`, and each arm pushes a
`gtext` and then its clip 209 apart, as everywhere else in the script.

| placed | clip | line |
| ------ | ---- | ---- |
| 7 RIFLE | 6 | FOLLOW THE YELLOW PATH AND COLLECT THE CRATE. |
| 11 SNIPER RIFLE | 10 | COLLECT THE CRATE. |
| 19 GRENADE ×5 | 12 | FOLLOW THE RED PATH… |
| 19 GRENADE ×10 | 15 | FOLLOW THE BLUE PATH… |
| 29 BAZOOKA | 22 | ENTER THE BUILDING AND COLLECT THE CRATE. |
| 37 TNT | 17 | FOLLOW THE PURPLE PATH AND CLIMB OVER THE GATE. |

**And the third mechanism is a COUNTER, not a dispatcher.** `[gameMode+0x32C]`
— on the object at `[0x537F24]`, whose `+0x329` is the level's copy of the
training flag — is moved by exactly three sites: every crate line ZEROES it in
its shared tail (0x465bb5, 0x465c4a), opening the skill menu sets it to **1**
(0x492b37), and taking something OUT of that menu increments it, but only from 1
upwards (0x4933c5). So the ordinary course is crate → menu → choice, and the
choice is count TWO — which is where clip 5, "PRESS SPACE TO ATTACK THE DUMMY",
lives. That line was the one the notes called untraceable. Clip 9 is the rifle's
same beat; clip 14 is the grenade's NAG, which asks for a count divisible by five
and for the sergeant to be quiet, so it comes back round rather than firing first.

**Clip 4 is the same block's other half, and the field it hangs on is the MENU
ITSELF** — identified 2026-08-11, which is the last line of the script to land.
`[gameMode+0]` is not a vtable slot and not a mode: **the game object's first
0x300 bytes ARE the skill menu**, sixty-four cells of twelve bytes — skill,
amount, and a 1-or-2 flag. `0x492FD0` clears the block in one 4×16 loop and
`0x468BD0` fills it from the pig's own `[+0x84]`/`[+0x88]` arrays and returns how
many, which is exactly why the same `mov eax,[esi]` two instructions earlier
decides whether the cursor is put back: an empty first cell is an empty menu.

So `cmp eax,3` is **the BAYONET sitting in the first cell**, and clip 4 is: the
menu has just been opened, on the training ground, with the counter still at
nought — a crate line has spoken and this is the first menu since — and the
bayonet is the first thing in it. Clip 3 has just said to press RETURN; this says
what to do now that you have. `clipForMenu` in `lib/game/tutorial.ts`, and the
`menuOpened` event carries the first cell because that is the only thing the rule
reads.

`lib/game/tutorial.ts` is the tables, `events.ts` carries `placed` and `chose`,
`ui/battle.ts` holds the counter and is the one listener that speaks, and
`pow.spoken()` is how any of it can be watched — the script runs on SPEECH, and
the briefing bar only ever carries the key press. `e2e/002/tutorial.spec.ts`
drives the first steps on the real map and reads the clips back in order:
3 collected, **4 the menu opened**, 5 chosen, 6 placed.

### …AND THE SCRIPT CAN BE PUT WHERE YOU WANT IT — F11/F12, 2026-08-12

The tutorial is a chain nine dummies long and the thing being fixed is usually
its last link, so `lib/game/training.ts` is a JUMP: **F12 on a step, F11 back
one**, `pow.step(9)` for the bazooka. The remake's own, like `pow.swapMap` and
`pow.give`, and it invents no mechanism — a step opens when something BREAKS
(a crate signals nothing), so a jump breaks exactly what a player would have
broken, in the chain's own order, and then stands the pig ON that step's crate
and lets `Scenery.collect` hand it over. The table is CAMP's own file and
`e2e/002/trainingStep.spec.ts` checks it against the shipped .POG: a step's
crate must wait on the label the last thing it breaks signals, and a GUARDED
group must be broken whole — with the crates left out of the group, because
placing one spends its command where a placed dummy keeps its own.

Three things it costs, each written where it lives. `AirDrops.land()` puts every
canopy down at once (nine descents from 0xC00 is half a minute of sky).
`DEBUG_ACTIONS` in `input/actions.ts` keeps these keys out of the battle's own
poll — a queued verb is what ends the beat at the top of a turn, so F12 would
have started the turn it jumped into. And **`main/index.ts` now sets a menu
without F11 on it**: Electron's default menu binds it to Toggle Full Screen, and
a menu accelerator goes over the page's head — `preventDefault` in a keydown
handler does not stop it. Everything else the default menu carries stays.

Two shapes worth keeping. A jump BACK is a RELOAD, and the want has to be
remembered across it — set before the reload so a second press counts from it,
and paid only once the new battle is up and its squad off its canopies; paying
it into the battle being replaced hands the pig whatever it was already
carrying, since the crate it warps to has already been collected. And a want is
cleared whether the scene takes it or not, or one asked for on a map that has no
such script blocks every jump after it.

### …AND THE LAST DUMMY ENDS IT — the exe's mode 2, 2026-08-11

Play: "убить последний манекен — не заканчивает миссию… очевидно что заканчивает
миссию." Nothing here ended a level at all: `game.over` is "nobody is left" over
the SQUADS, and the training ground fields one pig and no enemy.

**Nothing watches for a win frame by frame.** `Game::NextTurn` (0x48F490) asks
ONE function — 0x4966A0 — before it advances anybody, so a mission ends at the
HANDOVER and never before. That timing is kept and it is worth keeping: the dummy
comes apart, its crate lands, the beat at the end of the turn runs, and only then
does anyone notice there is nothing left to break. `handOver` in
`lib/game/battle.ts` is the one place, and `cutTurnBeat` goes through it too so a
spec cannot skip an ending along with a beat.

**What the training branch counts is the DUMMIES**, and the field it counts them
by is not the one it looks like: it walks the object list for a breakable (body
type 0x135A) whose `[obj+0x84]` is `0x43..0x47` or `0x4B`, and that field is the
object name table's index **minus 0x1C** (`lea eax,[edi-1Ch]`, written at
0x48D076). So the six kinds are TARGET, TARGET2..5 and DUMMY — and NOT
`T_SUP`/`T_SUP2`/`T_SUP3` at 0x48..0x4A, the stands they are mounted on, though
all nine share the one-point health row. CAMP carries eleven DUMMY records and
none of the TARGET family. The test never looks at `[obj+0x30]`, so the eight
records the script holds back count as standing from load — which is the only
reason a mission cannot end on its first frame. **A training level cannot be
LOST**: that branch has no losing answer in it, which agrees with the training
ground flooring a pig at one point. Everything else goes by SIDES.

**The ending is a mode of its own, 2 END OF GAME** (`lib/game/endOfGame.ts`,
`turns/notes.md`): the clock stops, nothing is driven — it is a control set above
every other (`ending` in `lib/game/controls.ts`) — the camera walks the survivors
**one every two seconds**, and past **three seconds** any key, or twenty on its
own, puts the battle away. The exe goes to mode 18 QUIT; here the engine emits
`missionEnded` and `ui/battle.ts` does exactly what its LEAVE button does — on a
microtask, because the event arrives from inside `engine.update` and the rest of
that frame still draws the scene it would dispose.

The sergeant signs off with clip **27** if it took more than twelve turns and
**28** otherwise (`[gameMode+0x40C]`, the handover count, against `cmp eax,0Ch`).
Which of the two is the congratulation is LOCATED and not heard — both lines are
blank, voice only.

**And it SHOWS something**, which play asked for — "при выигрыше не написано
победа, остаётся оружие в руках, он не танцует победный танец". The card is the
game's own and comes out of the same drawer every other card does: `0x45B8B0`
switches on `Game::Mode()` (the table at 0x45BF78), and mode 2's arm is
`gtext` **163 "MISSION ACCOMPLISHED!"** for a one-player side still standing,
**164 "MISSION FAILED!"** when it is not, and 165 "VICTORY TO >S!!" with the
team's name in multiplayer. The empty hands and the DANCE are the remake's — the
exe's mode-2 arm plays no clip and touches no weapon — and the clip is play's own
identification from the other end: 46, which they named as a celebration when
SKIP TURN borrowed it (`ANIM.VICTORY` beside `ANIM.THINKING`).

**Two of the four "closers" are nothing of the kind**, and this file had them
filed wrong. Both are built now, and each turned out to have a rule worth
knowing:

- **clip 21 is the first MINE.** Its call site is the PROJECTILE CONSTRUCTOR,
  gated on the ammo row being 0x28 or 0x29 — the two `WE_APMIN` — so it answers a
  mine trodden on and a mine set off by something thrown alike. Its flag
  `[gameMode+0x330]` is **the other way up from what it looks**: the game object
  is built with it SET, so the sergeant says nothing about mines until one of the
  two MINEFIELD crates CLEARS it as it speaks its own line (0x465D72, 0x465DBD —
  the health×15 and ×20 arms, both of which say "FOLLOW THE PATH THROUGH THE
  MINEFIELD"), and speaking sets it back. **Once per minefield, and only after
  being told to walk into one.**
- **clip 26 is the turn you WASTED**: the clock ran out and no weapon was used
  all turn. `[gameMode+0x334]` counts uses — the fire dispatcher increments it
  (0x493E7A), the handover zeroes it but only from 1 or less (0x48F50C), and the
  line writes **2**, which is exactly the value the reset refuses. So it is once
  a LEVEL, and a turn in which two weapons were used (only the planted charges
  allow it) disarms it just as permanently. An artefact of three lines rather
  than a rule anybody wrote, and it is transcribed as such.

`weaponUses` in `lib/game/battle.ts` is that counter and `turnWasted` the event;
the mine's flag is `ui/battle.ts`'s, beside the script's other one. One half of
the exe's guard is NOT modelled and says so at the field: it drops the
wasted-turn line while the sergeant is talking and lets it come round on a later
turn, where the remake counts it as said.

`e2e/000/engine-headless.spec.ts` drives the whole seam in plain Node on a CAMP
built with its DUMMY records left off — reaching the condition honestly is the
entire tutorial — and `e2e/002/endOfGame.spec.ts` pins the data: which records
the mission is measured by, and which line signs off.

### THE DOOR, THE STEP AND THE SLOT — play's three, 2026-08-11

**The clip CARRIES the pig.** Read in full in `objects/notes.md`, summarised at
item 6 of the list above. `lib/game/doorway.ts` is the pure half — `carryIn`,
`carryOut`, `advanceCarry` — and `battle.ts`'s door block starts it, ticks it
after `updateLocomotion` (the exe's own add comes after the movement update too,
and overrules the ground pin), and ends it when the once-clip does. Two things
had to move with it: a pig going THROUGH a door is not driven but IS moving, so
`game.moveCurrentPig` is now gated on being actually inside rather than on
`sheltered`; and `focus` drops a half-open door the way it drops a half-finished
climb.

**Where the leap OUT ends is the whole of it.** Play, on the first pass:
"выпрыгивание не работает — проваливаюсь обратно сквозь крышу", and with it
"применение — отключает управление пока не завершится действие." Both were one
bug and it is measured. The glide targets the box's TOP, but the clip and the
carry finish a frame apart — the door block asks `anim` before `advanceCarry`
runs — so the rise stopped a few units SHORT: −1562 against a top of −1568. And
`standOn` counts nothing above the feet, so six units under the roof is no
support at all: the pig fell the whole 352 back to the ground **inside** the
shelter, where a solid box holds it still and the controls read as dead. The door
now ends the leap ON the roof plane, builds the footing FROM the roof (so the
step-up envelope is measured off the thing being landed on rather than the ground
below it) and hands the pig to gravity with a still velocity — the ordinary
landing does the rest. `e2e/002/shelter.spec.ts` waits for the rise to stop and
then asserts both halves: he is a shelter's height above the doorstep, and he
walks.

**A SCRIPT STEP IS OWED BY THE BATTLE, not by the beat that is running** — and
this is what had the tutorial stuck. Play: "когда взрываю дверь — должна базука
падать - щас нет." CAMP's door is record #46, `STW04_D2`, the one object on the
map carrying the guarded opcode 22: it waits on label 89, which nothing else
waits on, and signals **7** — which the bazooka crate (#19), the health×25 crate
(#56) and two more dummies all wait for. So everything after the TNT step hangs
off that single break. But TNT's fuse outlasts the four seconds planting hands
back, so the door breaks inside the beat at the END of the turn — and that beat
returns three branches above the block that paid the step, with `focus` clearing
the debt on the handover. `payScriptStep()` is now called before the branches and
the walk-away beat holds while anything is owed. The exe owes no wait at all
(`Object::RunScript` is the last thing the break handler does, 0x48d972); the
wait is the remake's own pacing, and what it must not do is depend on the mode.

**A pig INSIDE holds the door.** Play: "когда прыгаю в здание — в оружии должна
быть иконка запрыгивания во что-то (есть в игре)." Skill **61 BUILDING INOUT**
has an icon like every other (`SKILL_ICON`, and 60 is the VEHICLE's own), so the
slot beside the dial carries it for as long as the pig is in there. A DRAWING
decision and not a rule — `ui/battle.ts` substitutes it into `hud.draw`'s
`holding` and `pig.holding` is untouched, because the fire key acts on that and
the remake's door is a key of its own.

### THE BAZOOKA — a rocket with no fuse, 2026-08-11

Play: "продектайл со своей анимацией итд + звук выстрела + урон при касании —
важно в воде не взрывается, а тонет." Skill 29 was in neither table — not a gun
(it charges) and not among the lob rows — so it could be taken in hand and did
nothing at all. The whole of it is read; `weapons/fire.md` has the derivation.

**Row +0x14 nil is the CONTACT class, and that is the finding.** The projectile
constructor branches on it (0x43200c): non-zero starts the thing in state 0, the
arming count every grenade takes; nil takes `[proj+0xA2]` — row +0x1C's low byte
— through the table at 0x432590, and the bazooka's 0 lands on **state 2**, one of
the two update arms that do nothing at all. It has no fuse and nothing counts it
down. What ends it is the landscape handler turning state 2 into state 6 the
moment it touches anything (0x437f2c), and state 6 is `[proj+0x31] = 1`, which is
the destructor, which is where the blast is.

Its row against the plain grenade's: speed **500** a frame at full charge against
300, damage **5120** — forty points, so a grunt survives on ten — over a blast
field of 2048, TNT's reach rather than a grenade's. `Lob.contact` in
`lib/game/grenade.ts` is that read, `fuseSeconds` returns Infinity for it, and
`lobs.ts` bursts on the first ground or box contact instead of bouncing.

**Water still takes it**, and not as a special case: the water test is FIRST in
the same handler and the douse sets the quiet flag the destructor reads before
anything else. One divergence is flagged at the line — the douse arm wants an
arrival under 150 or one of the bullet kinds, and kind 10 is neither, so the exe
would let a fast rocket SKIP. Play's word is flat against that and the remake
follows play: a rocket never skims.

**The report is decoded, not picked.** Every weapon's fire arm hangs off one jump
table (0x47cf8c, indexed by `skill − 6`) and each plays its own sound: skill 29's
is `Sound::Play(0x24, 100, 100)` and index 36 of `Audio/sfxday.srl` is
**`L_BAZOO`**. The rest of that column is written down in the notes and in
`audio/battle.ts` and is one line each when wanted. `fired` is emitted by
`lobs.throwOne` now as well as by the bullets, and a lob with no cue makes no
report — a grenade leaving the hand is not a gunshot.

**And the ROCKET is not the launcher.** Name-table row 398 is `WE_BAZZ`, out of
the MAP's own archive like `WE_APMIN`; what is in the hand is `bazookr`. Without
the split a fired rocket flew as a second launcher. `lib/game/ammo.ts` is the
table, and `three/grenades.ts` falls back to the map's archive for any name
`Chars/WEAPONS.MAD` has never heard of.

**Two corrections play made on sight, and both are worth keeping.**

*The rocket SKIPS.* A first pass read "важно в воде не взрывается, а тонет" as a
divergence — a rocket never skims — and play was flat: "ракеты скачат! как и
гранаты! я про потонуть когда нельзя скакать!" There is no special case. The
exe's own rule was right: fast along the surface it skips, and what cannot skip
goes down without going off.

*The red indicator is not the power gauge.* It is the **LENS in the weapon
port** — `pcpie4`, the only pie in the whole install, one 32×32 red disc
(palette index 2, rgb 205,0,0) in a brass ring. Play sent a picture of the
original's and the words for it: an ordinary weapon shows a HALF-filled circle,
and the bazooka's is "полностью закрашен — как оружие которое детонирует при
контакте". So how full it is is the weapon's CLASS, not its charge, and
`ui/battle.ts` drives it off `Lob.contact`. One image means the fraction cannot
be frames, so it is clipped; the direction, the half, and where it sits are all
eyework and all live in `LAYOUT.dial.slot.lens` for the console. **TRACED
2026-08-11** (`library/notes.md`, "THE DASHBOARD"): the exe's drawer is
`0x457FB0` and it draws the disc WHOLE, always — no fill mechanic exists —
hidden only while `[0x537F24]+0x458` is 19..26 (the grenade family). So the
half-filled look play remembers is not a fraction the PC exe computes, and the
remake's class-driven clipping stays its own reading of play's screenshot
until play weighs the new evidence.

~~Left open: the record's `+0x28`/`+0x2C`~~ — closed 2026-08-11: the attack
animation steps' repeat count and signed playback rate (`weapons/fire.md`).

### PLAY'S LIST OF 2026-08-11 (the second one) — three done, four open

**Done.**

1. *A RAMP fades and should not.* "Просвечивание включается на рампе — не должно,
   ведь она за свином, не между ним и камерой." A ramp's box is the whole
   triangular prism, so a pig on its LOW end has its middle well below the box's
   top and a camera behind and above looks down THROUGH the slab to reach it.
   `sightBlockers` drops ramps the way it already drops buildings: what you stand
   on is never between you and anything.
2. *Too little of the roof and the walls fades.* One ray fades exactly the pieces
   it skewers and a house is eighteen of them, so the panel in the way went
   see-through while its neighbours stayed solid. Every box is grown by
   `SIGHT_MARGIN` (256, half a tile) before the segment is tested.
3. *Charging in mid-air.* "Можно во время прыжка начать заряжать оружие — баг."
   `Pig::MayAct` refuses outright while the pig's mode is 5, which is being
   airborne — the same value `UpdateMovement` returns on (0x467a28, 0x46b205).
   `setFiring` drops the whole press rather than the hold alone, or a gauge
   already filling would loose on the way up.
4. *The lens is in the wrong widget.* It belongs at the gauge's left end, before
   the scale's zero — "надо в низу левее нуля шкалы, там есть полузалитый круг" —
   not behind the weapon slot. Moved to `LAYOUT.gauge.lens`.

**Open, with what is measured.**

5. **TNT's blast is too big to get clear of.** "Я отхожу задом все 4 секунды — а
   меня всё равно задевает." The arithmetic: the row is 50 points over a blast
   field of 2048, `blastReach` makes that 1536, and the falloff — the exe's own
   `0x48CBA0` — reaches **zero only at 2560** (512 of core plus 4/3 of the reach).
   The fuse is 5.83 s and planting hands back **4**, of which the laying clip eats
   the first stretch; backing away is HALF speed, 520 a second, so about 2000
   units. 2000 against 2560 is exactly play's complaint.
   **Where to look:** the falloff is not what decides WHO is caught. In the exe
   the blast hurts what the EFFECT's own body touches — `Pig::OnHit` off the
   physics contact — and `0x48CBA0` only says how much. The effect body's size has
   not been read, and the remake uses the falloff's extent as the reach instead.
   That is the number to find; nothing here should be tuned by hand first.
6. **The rocket is drawn crooked.** "Прожектайл кривой при выстреле базуки."
   `three/grenades.ts` points a flying lob along its velocity with a yaw and a
   pitch, which assumes the model's nose is +Z. `WE_TNT`'s own long axis turned
   out to be −X (that is what `STAND` is for), so `WE_BAZZ`'s wants measuring the
   same way — off the model's vertices and its textures — rather than guessing.
7. **The blast's picture is the wrong one — and this half IS read.** The
   destructor's per-kind table (0x435A6C) sends kind 10 to `0x433220`, which joins
   the tail at `0x43533E` and pushes effect **0x53**, where the grenade's arm
   pushes 0x54. Both play sound 0x0C (`E_1`). And the id → row map resolves
   0x53 to **parameter ROW 1** against the grenade's row 0 (`byte [0x489680+id-1]`
   → slot 54 → arm 0x488faa → `0x48ccc0(1)`). What is NOT built is row 1 itself:
   it reaches stages D and E of `0x48c410`, which this repo has never decoded and
   which "What is still not read" below already names. `Charge` would have to
   carry the id the way the mine's already does.
8. ~~**Killing the last dummy does not end the mission.**~~ **Done, and read
   rather than invented** — see "…AND THE LAST DUMMY ENDS IT" above. It is asked
   at the HANDOVER, the count is the DUMMY records alone (their stands do not
   count), and the ending is the exe's own mode 2 with its tour, its three-second
   hold and its twenty-second bail.

### THE FADE STOPS GUESSING, AND A THROWN WEAPON GETS ITS OWN CAMERA (2026-08-12)

**What fades is measured against the pig's own SILHOUETTE now, and the margin
is gone.** Play: "всё ещё становятся прозрачными вещи, которые не перекрывают
свина — то есть стоят не между ним и камерой." The cause was `SIGHT_MARGIN`:
every box in the world was grown by 256 — half a tile — before the segment test,
so a dummy at his shoulder, a coil of wire at his heel or a tree beside him
counted as being in front of him, and the three rays could not tell the
difference because they all converge on the same point and a box beside that
line crosses all three. The margin was there for a real want — a box hiding half
of him has to fade even when a ray to his middle misses it — and `silhouetteOf`
(lib/game/seeThrough.ts) is that want done honestly: nine points, three rows up
his body by three columns across it, the columns laid ACROSS the line of sight
so the outline always faces the camera. A box has to cross five of the nine and
is tested at its true size. Same majority rule as before, better question.

**And the grenade and the bazooka have a camera of their own — two of them, and
BOTH are the exe's.** Play: "для гранаты и для базуки отдельная камера — 2
режима: 1 выше, чтобы удобно целиться; 2 при нажатой кнопки из-за спины", and
then, when the first attempt hung the second on the trigger: **"я не говорил про
огонь! там есть отдельная кнопка, которая меняет вид пока держишь (у нас G)… я
сказал, когда в руки берёшь оружие — меняется камера."** Right on both counts,
and the exe has each of them:

- **TAKING IT IN HAND is a camera change, `0x493BB0`.** It runs on every write
  of `[game+0x458]` — the skill in hand — and dispatches on the skill through
  `[0x493DC4 + skill − 1]`. The thrown family (14, 19..33, 35..50, 56, 60, 61,
  63) and the five melee both ask for **mode 4**, and **a GUN asks for nothing**
  (0x493c9d jumps past the block), which is why a rifle only ever moves the view
  on the aim key. What separates the two is `0x49F6F0`, which STAMPS mode 4's own
  row: **3500** for anything thrown against **1500** for a blade — so the
  1500/2000 the shipped file carries is where the last run left it.
- **HOLDING THE VIEW KEY is mode 0x12, "TR cam"** (0x492e7a, name at 0x4d8e7c),
  and this repo had that written down WRONG as "else → the ordinary chase". Its
  handler (0x4a4620) sits **200 out and 400 up** at a nominal 1700, close in over
  his back, with a pitch the player may drive (`[cam+0x76]`, clamped to ±700 of
  4096 by a branch that names this mode alone).

So the two are the exe's own: back and raised while it is out, in over the
shoulder while the key is down. `weapons/fire.md` has both reads and the
correction. **The fire button touches neither** — it did for one commit and that
was a bug, not a feature.

**Mode 4 has no lift of its own**, which is what came of reading its branch to
the end instead of stopping at the first `add`: its arm sets a TARGET and three
springs glide the camera onto it — the distance (`0x4A0960`, which is where the
row's 3500 is really used: current separation minus the row, stepped), the pitch
(toward the SUBJECT's own, `vtable+0x44` being the orientation) and the yaw — and
not one of them carries a height. What holds the camera up is the common tail's
floor: `0x4A0B50` raises it to **ground + 768** whenever it is lower (0x4a0c12),
and **mode 0x12 is exempt by name** (0x4a0bd4), which is what lets the TR cam sit
400 over a pig rather than 768 over the terrain. So the rig's `CLEARANCE` is the
exe's 768 now — the last invented number in it — and the TR cam is the one view
allowed under it.

**And the lift is the exe's after all — COLUMN 1 OF THE MODE TABLE IS THE
CAMERA'S ELEVATION CEILING.** That column had been written down as "looks like a
zoom in 1024ths" since the rifle cam was read, and it is nothing of the kind:
`0x4A0900` is the elevation spring, it biases both angles by 0x400 — which is
LEVEL — and clamps the wanted one into `[0x100, column1]`. **A smaller column is
a higher camera**, and every shipped row reads off at once: the chase 22.5°
above level, the melee and the barrel cam 8.8°, the rifle cam and the TR cam dead
level, and the **MAP VIEW 85.6°**, which is the check — nothing but a real
overhead camera would land there.

So `0x49F6F0` was stamping the height all along, in the same nine instructions
this file already quoted for the distance: a thrown weapon gets **3500 and 692**
— 29.2° above level — and a blade **1500 and 800**, 19.7°. Further back AND
higher for a grenade, closer and lower for a knife, against the chase's 3072 at
22.5°. That is play's "выше, чтобы удобно целиться", read rather than chosen, and
`three/chase.ts` places the lob view by that ANGLE instead of by a lift of its
own. The remake's own rig turns out to be in the same world: `atan(LIFT / BACK)`
is 23.2°, within a degree of the chase's own 22.5°, and those two numbers were
picked by eye years apart.

**A CAMERA LENGTH IS OF THE WORLD AND DOES NOT RIDE `MODEL_SCALE`** — corrected
the same day, after an eyework fudge factor was offered for the distance and
play asked the right question of it: "точно нет? как движок тогда это делает?"
`MODEL_SCALE` is what a MODEL is drawn at and the exe applies it too; the map is
a tile of 512 either way, so **the exe's world and this one are the same world**
and a distance between two of its points is the exe's number outright, exactly as
`WALL_CLIMB`'s 128 is. What halves is a length taken off a MODEL — the bayonet's
460, the body's 0xAA. Two more corrections rode with it: **3500 is the
SEPARATION rather than the horizontal run** (the distance spring differences
`0x44E850`, so the elevation splits it into `3500·cos 29.2°` along the ground
and `3500·sin` up), and **the TR cam's 200 and 400 are its LOOK POINT, not its
camera** — `0x4A0B50(cam, &camera, &target)` takes the vector that handler
builds as its THIRD argument, and the camera is then put at the row's 1700 from
it at that mode's own dead-level ceiling. What this leaves standing is written
up in `docs/todo.md`: the ordinary chase is **2.7× closer than the exe's**
3072 at 22.5°, because `BACK`/`LIFT` are the remake's own eyework and halved
with the models rather than being a decoded number mis-scaled.

**THE LOB VIEW LOOKS 1536 PAST THE PIG, which is why he sits at the bottom of
the frame.** Play: "он поднимается выше и отдаляется — свин у нижней границы
экрана", against a rig that had him dead centre. It is the one thing mode 4's
thrown branch does that its blade branch does not — `0x44E620(0x600,
[cam+0x8C], &dx, &dz)` at 0x4a22f6, 1536 along the camera's own FORWARD yaw
(mode 0 springs that field toward `subjectYaw − column2`, and the chase's column
2 is zero) — **and the PC build then never reads the result**: the target is
stamped from the subject outright. A dead call on the one branch with a reason
to make it, in the build whose PSX sibling play is describing. Applied, the pig
lands 19.1° under a 29.2° axis — seven tenths of the way to the bottom edge of a
45° frame, which is where the original's own screenshot has him.

**And the CHARGE does not take the aim view away.** Play: "она отменяется когда
нажимаешь f — и вот тут должна переживать пока зарядка идёт." A filling gauge is
its own control set and it sits ABOVE the sights in `modeOf`'s priority, so
`readControls` was reporting `sighting: false` for it and the camera fell back the
instant F went down. The exe does not work that way and it is not a special case:
its aim branch is entered on the pad BIT alone (0x4928dc), `Pig::MayAct` going
false only picks a different arm of it, and the remembered camera is not restored
until the bit goes UP. So the `charging` set carries the key through — the VIEW
survives, the AXES do not, which is the exe's own `Pig::Aim` bailing on that same
`MayAct`. `three/chase.ts` carries all of it, the rig's six views are one
table there now, and `pow.debug.view()` is how a spec tells them apart — a camera
POSITION cannot say why it is where it is, and the rig eases between two views so
a reading taken on the frame the view changed is still the last one's.

One seam came with it: `Sights.sighting(holding)` is "the aim view is up at
all", beside `scoped`, which is the first-person half and answers for guns
alone. It is on the snapshot, because the camera is drawn from a snapshot and
nothing else.

### THE FLIGHT: what the camera does once the thing has LEFT (2026-08-12)

Play, watching a throw: "камера не чисто за снарядом, а в бок будто
перемещается", then "для гранат и базук она другая", then "камера следует за
ней!", then "камера там ещё будто едет по кругу вокруг". Four reports, and every
one of them was the binary being read to the wrong depth. `weapons/fire.md` has
the whole chase; the shape:

**Every weapon decides for itself.** They fire through one jump table — `eax =
skill − 6`, `jmp [eax*4 + 0x47CF8C]` (0x47a233) — and each arm tells the camera
its own thing, tails followed (the guns' is 0x47ad71, the thrown family's
0x47b853). **6 PISTOL / 11 SNIPER / 12 / 13 / 15 / 17 / 18 → mode 1**;
**19..27 GRENADES, 28 MORTAR, 29 BAZOOKA, 30..33, 39..44, 47..49 → mode 0x0B**;
34 and 50 JETPACK → mode 0x0A; 51 SUICIDE → mode 2; **7 RIFLE, 8, 9, 10, 14, 16
and the planted charges → nothing at all**. The remake asks the weapon's LAYER
rather than its number, because play's word is that a rifle tracks like a
sniper and the exe's own split is honoured nowhere else in the shot path.

**MODE 1 DOES NOT MOVE THE CAMERA.** Its handler (0x4a11e0) is thirty
instructions: decompose camera-to-subject, aim along it, return. No position, no
spring, and `0x4A0B50` is never called, so its row and the ground floor are not
read either. A gun's shot is watched from where the shot was taken, the camera
only turning. Which also explains an old empty search — `lib/game/sightline.ts`
dodges walls, the exe was found to have no line-of-sight test in its camera code
at all, and a camera that does not move has no wall to dodge.

**NOBODY IS EVER IN MODE 0x0B: `0x49F740` REWRITES IT TO 0x0D on entry**
(`cmp ebp,0Bh` … `mov ebp,0Dh`, 0x49f774..0x49f7a5). That is why 0x0B's handler
is a bare `ret` shared with modes 5, 8 and 0x0C — four empty functions folded
onto one address, unreachable. **Reading behaviour off that stub was the
mistake, twice over**: a `ret` is a missing function, exactly like mode 4's dead
1536. The rewrite also closes three loose ends — 0x0B/0x0C/0x0D share the setup
arm 0x49f912, that arm is the only writer of `[cam+0x7A]` and 0x0D's handler its
only reader, and the setter zeroes `[cam+0x78]` for every mode BUT 0x0D.

**Mode 0x0D (0x4a3a20) swings in behind the thing and then RIDES ROUND it**, in
two phases told apart by `[cam+0x5C]`. First it springs the camera's yaw toward
the subject's own facing and turns the camera ABOUT the subject until the step
is under 1.4°, then stamps the separation into `[cam+0x7A]`. After that, once a
frame: `radius = clamp(⅔ × separation, stamp, 10000)`, `[cam+0x78] -= 10` of
4096 — **0.879° a frame, one way, held within 67.5°** of the bearing it locked
at — and the camera is placed at that bearing and radius. Height is the row's
own ceiling, **column 1 = 824 → 17.6° above level**, plus the tail's 768 floor;
the row's 3000 is not read at all.

So the beat play calls the freeze is the one BEFORE the throw — `Pig::Fire`
plays the battle cry with the camera still in mode 4 — which is also why mode 4
aims 1536 down-range: the view a throw is made from is already looking at where
it will land. `chase.watch` is mode 1, `chase.pursue` is 0x0D, and `chase.ride`
stays what it was for the CRATE (mode 0, 0x4661c2). Mode 0x0A is read and NOT
built — 1024 ahead of the subject's heading, then the usual three springs — and
nothing that reaches it (34, 50 JETPACK) exists here yet.

### A HOOF KNOWS WHAT IT IS STANDING ON — footsteps, 2026-08-12

Play asked for them and asked the right question with it: "насколько помню
зависит от того на какой поверхности они едут?" It does, and everything about
it is authored rather than guessable. The note that stood here for a week — that
footsteps want hoof-contact frames DERIVED from the skeleton — was aiming at the
wrong thing twice over.

**WHEN a hoof lands is a key-frame event on the clip.** The same six-row
`(phase, id, id)` channel the bayonet's strikes, the charge's placing and the
doorway's glide come out of (`_d3d.dll`, `afGetKeyFrameList`, 0x1002c778 +
clip*88). **Ids 1..6 — and 9/10, which are byte-for-byte aliases of 4/5 — all
call one function**, 0x475010, and what the dispatcher's arm pushes is which
hoof (1, 2, or 0 for a whole-body scuff) and how loud (45 for ids 1..3, 30 for
the rest). So the run cycle steps twice a lap, the swim kicks four times
quietly, and a pig laying a charge scuffs going down and coming up. Twenty-two
clips carry them; `anim/key-events.js` dumps the table and
`lib/game/footsteps.ts` holds it. **Scrambling is silent** — clip 11 has no
footfall — and so is standing still, which is the original's own answer to the
worry that a height-based detector would fire four times a swim stroke.

**WHAT it lands on is the tile's terrain type**, masked to its low five bits the
same way the scramble test and the material table take it, and switched
twelve ways at 0x4754B8: grass for 0 and 1, metal 2, wood 3, water 4 and 10,
sand 7, ice 8, snow 9, lava 11, and **stone for 5, 6 and anything else** — 6
being the commonest tile in the game. The shipped maps agree type by type
(MAZE and both training grounds are wall-to-wall grass, OASIS and ZULUS sand,
ICE snow, ICEFLOW the only ice, ISLAND and LAKE water where the water is), which
is a stronger check than any single arm. The odd row is 11: it is the CLIMBING
tile and it plays LAVA.

**The mix is the exe's, including two things nobody would have invented.** The
volume is `45 − (rand() & 15)` — the jitter is on the VOLUME here, where the
jump jitters its pitch, so `Cue.duck` joins `Cue.jitter` in `audio/battle.ts`.
And the pitch says WHICH hoof: the handler writes 92, 108 or 100 into the slot
it plays with (0x475275, 0x4752f6, 0x475374), so the two feet sit 8% either side
of nominal. There is also a SECOND play every step — index 0x15 `FT_SAND` at the
same volume and pitch (0x4753fd), unless the event's arm suppresses it, which no
footstep id does. A step on stone is stone over sand. It reads as a scuff under
the material; if play hears it as doubling, `STEP_UNDERLAY` is one line to drop.

**One correction falls out of this.** `melee.md` and two code comments read the
`0x2d` beside a footstep event as a sound index — index 45 is `L_SHOTG`, which
should have been the tell. It is the VOLUME argument, and the sound comes from
the ground.

Wiring: the domain announces `stepped` on the bus (`lib/game/events.ts`) with
the position, the surface, the hoof and how hard; `audio/battleAudio.ts` is the
only thing that turns that into a file. The cursor lives in `footsteps.ts` and
nowhere else — a footstep is not a rule, and nothing in the battle branches on
it. Held by `e2e/002/audio.spec.ts`, which turns a pig on the spot (clip 4 steps
twice a lap and a turning pig cannot walk onto a different material) and reads
the material and the sand under it, in pairs, against the tile it is standing on.

### What is still not read

**Swept 2026-08-11 — docs/todo.md section D is the live list now**, and most of
what used to sit here is READ (the reads are in the disasm repo):
`[contact+0x14]` is the contacting body's TOTAL speed with a flat-vs-plunge
class byte beside it at `[contact+0x30]` (`weapons/fire.md`); effect 0x0D is a
mud spray, decoded in full; `0x48c410`'s stages D/E are a fan of smoke jets and
stages E and C are enabled in NO shipped row; the skill record's `+0x28`/`+0x2C`
are the attack clip's repeats and its signed playback rate; and PARACHUTE=82
was already settled in `parachute/notes.md` (MCAP ships 93 clips, the name
array stops at 59). The big one: **the render library is `Data/_d3d.dll`, in
the install, 94 named exports, and the exe's whole call-slot table is mapped**
(`library/notes.md`) — `wh32LIB.DLL` is the LaserLok copy protection and every
"lives in wh32LIB, cannot be read" verdict in this file is dead. The second
pass the same day read the DLL side too: a 2D sprite's size is WORLD UNITS at
its own depth (so `BLOB_UNIT` can die for the exe's own formulas), effect
particles are TEXTURED from `expltims.mad` — the `ptp*` puffs, the damage
digits and the pig's shadow live there — and drawn ADDITIVE ONE:ONE, and
`afSetZoom`'s full zoom is exactly ×4 with a thirds-of-the-gap glide. On the
smoke play keeps reporting MISSING: the remake's blob has the wrong art AND
an invented draw law; the fix to try is the real puff textures with the
exe's colours under both blend modes, shown to play ("additive cannot
darken" was the remake's own argument, never play's). The third pass found
**the whole DASHBOARD** (`library/notes.md`): dashtims is `[0x520668+0x400]`
(an earlier one-slot mis-parse hid it), init 0x454578 + frame 0x457840, and
two findings that matter here — **`pcpie4` is drawn WHOLE, no fill mechanic,
hidden for skills 19..26** (the remake's class-driven lens clipping is its
own invention — show play before moving anything), and **the dashboard's
layout is authored DATA in the exe** (0x4CF71C/0x4CF878/0x4CFA54, anchored
to the screen dims), so `LAYOUT`'s eyework in `ui/hud.ts` could be replaced
by the original's own numbers when asked.

### Worth not re-deriving

- **+y is UP in the engine's world.** The exe's physics settles it: the world's
  three force generators all point `(0,-1,0)` and one is gravity
  (`movement/notes.md`), so falling is y DECREASING. Four things in
  the effect table agree — a burst's vertical launch cannot be negative, row 15
  stacks rings at +100/+300/+600, a damage number trails at `y + 100`, and row 0's
  cloud fires about +y against a decelerating force. The remake stays Y-down and
  flips once, on the way in (`lib/game/cloud.ts`). **Any surviving note that
  `[+0x1d]` is "buoyancy, not gravity" is wrong.**
- **An explosion is 140 sprites and 14 puffs, not six.** Row 0 — which both id 0x54
  and id 0x3e resolve to, so a blast and a crate coming apart are the same picture
  — has five live stages. The two big ones go through `0x48bff0`, which is not a
  particle spawner at all: it hangs its own array of 20-byte records off
  `[child+0x70]`, stepped by `0x48a7e0` and drawn one sprite each by `0x489fa0`.
- **An effect's collider is a sphere of radius 35** (0x4a8f42, via
  `jmp [eax*4+0x4a90CC]` at 0x4a8ece where `eax = type - 0x1357`, built by
  `0x407AF0` at 0x4a9044). It does not need to grow — that idea was invented to
  prop up a misread range and is gone.
- **"I could not find it" is never "it is not there".** Twice in one session: the
  grenade's TRAIL was declared absent because both of the projectile update's
  dispatches skip a plain grenade — it is in the CONSTRUCTOR (0x43247b); then the
  water SKIP was declared absent, with a physics argument for why it could not
  exist, and it was the last instruction of an arm that had been skimmed
  (`0x4A9260(scalar/5, 0x400, 0, 0)` — a kick straight up). Read every arm to its
  last instruction before concluding anything about it.

Everything below this line is older, and the shot's own six items are DONE —
see "The SHOT, end to end".

1. **The map SCRIPT — decoded and BUILT.** See below; what is left of it is a
   short list at the end of `script/notes.md`, and none of it
   blocks anything.

Two smaller ones noted in play and not acted on: **a dying pig should come
apart and leave its boots** (the exe already splits the two deaths and so
does `lib/game/health.ts` — `died` and `gibbed` — but both wear clip 47 for
now), and **`THREE.Clock` is deprecated** in favour of `THREE.Timer`.

**Nothing is failing.** `e2e/002/hud.spec.ts:168` was, since 300fc6e, and the
poll fixed one half of it and a measurement fixed the other — see "Input is
POLLED" above.

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
  of them puts the weapon away. `lib/game/melee.ts` is one weapon's reach and
  one swing's timeline, `lib/game/strikes.ts` the swing HAPPENING, and
  `weapons/melee.md` the read.

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
  run with the weapon channel over its arms. `lib/game/clipPose.ts` does that
  with a bone overlay composed into the pose.

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
- **The menu DRIVES ON, and every number in that is read.** It comes down
  from 380 pixels above — the exe's per-screen start table at 0x4C0A18, in
  the frontend's own 1024×820 space — and settles on one shared damped
  spring (0x41FD30) at its own arm's gain 8, damping 17 and cap 80. Ten
  engine frames, with an OVERSHOOT the exe gets by not clamping the step.
  `ui/entrance.ts`, stepped at `EXE_FRAME_SECONDS` rather than at the
  screen's 25 repaints a second. The backdrop does not move with it: the exe
  blits it before the switch that applies the displacement. Only the MAIN
  MENU claims a start — the table has one for every screen, but which id is
  which is only pinned for that one. What is still eyework is the MACHINE
  behind the column; see the layout entry below.
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
