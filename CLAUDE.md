# Pigs of Worldwar — orientation

A fan remake of Gremlin's *Hogs of War* (2000) in Electron + Three.js +
TypeScript. It reads assets straight out of a legally installed copy; nothing
from the original is redistributed. This repo normally sits **inside** the
game folder, so `..` is the installation.

Start with [README.md](README.md) (how to play and run), then
[docs/testing.md](docs/testing.md) and [docs/formats.md](docs/formats.md).
**[docs/todo.md](docs/todo.md) is the WORK LIST** — everything open, in the order
it is worth doing, each item carrying what is already measured and what the next
move is. **This file is the RULES**: the traps, the layout, the deliberate
divergences and nothing that merely happened. What happened is in
[docs/history/](docs/history/), one file per subsystem — open the one the task
lands in. That one is the record; `todo.md` is what to pick up next.
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

## The history is in `docs/history/`, one file per subsystem

This file is INSTRUCTIONS — what to do, what never to do again, and what is
deliberate. Everything else this project has learned is a record of work, and a
record does not belong in a file that is read into every session. It sits in
`docs/history/`, chronological within each file, and is worth opening when a
task lands in that subsystem:

| file | what is in it |
| ---- | ------------- |
| [weapons.md](docs/history/weapons.md) | the shot and its sights, all nine grenade passes, the mines, the charges, the blast, the bullet's box, the bazooka |
| [world.md](docs/history/world.md) | water and bridges, the buildings and the way in, the props, everything breakable |
| [pig.md](docs/history/pig.md) | the battle model, a landing on a wall, the draw scale, the footsteps |
| [turns.md](docs/history/turns.md) | the clock and the beats around it, what ends a turn, how input is polled |
| [view.md](docs/history/view.md) | the chase camera, the fades, the thrown weapon's own view, the judder measure |
| [training.md](docs/history/training.md) | CAMP's script, where it can be put, and the dummy that ends the mission |
| [status.md](docs/history/status.md) | where the remake stands, the lists play has given, what is still not read |

Two rules about it. **A finished piece of work is written up THERE, not here** —
this file grows only when a rule, a trap or a deliberate divergence appears.
And what belongs here instead of there is the one-line version: where the code
is, and which behaviours will look like bugs and are not.

## Known divergences — deliberate, and each written up where it lives

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

## Worth not re-deriving

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