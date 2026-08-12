# Pigs of Worldwar — orientation

A fan remake of Gremlin's *Hogs of War* (2000) in Electron + Three.js +
TypeScript. It reads assets straight out of a legally installed copy; nothing
from the original is redistributed. This repo normally sits **inside** the
game folder, so `..` is the installation.

Start with [README.md](README.md) (how to play and run), then
[docs/testing.md](docs/testing.md) and [docs/formats.md](docs/formats.md).
**[docs/todo.md](docs/todo.md) is the WORK LIST** — everything open, in the order
it is worth doing, each item carrying what is already measured and what the next
move is. **This file is the RULES**: the facts the engine is built on, the
layout, the deliberate divergences and nothing that merely happened. Every fact
here says how it is known and every divergence says what it rests on — the ones
tagged `[CHECK — remake]` are inventions nobody has verified. What happened is in
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

## The facts the engine is built on

Statements only, each with where it lives and how it is known. `[exe]` was read
out of the binary or the shipped data, `[measured]` out of the game's own files
by a script, `[play]` is the user's ruling on how the game behaves. The
reasoning, the false starts and the sessions behind them are in
[docs/history/why.md](docs/history/why.md) — a number without its argument gets
"fixed" by the next person who reads the disassembly.

**Space and scale**

- **Models are Y-DOWN; PMG heights are elevation, UP-positive.** The engine
  works in the game's Y-down space and converts once, at the top, with a 180°
  X-rotation on a wrapping group. `lib/game/terrain.ts`, `fromExeY`. `[exe]`
- **MCAP rotations are `local = Rx(−x) · Ry(−y) · Rz(−z)`**, parent-relative,
  XYZ order — not quaternions, whatever how-doc says. The negation is because
  the game's matrices are row-major, the transpose of three's. `anim/notes.md`
  carries three proof scripts. `[exe]`
- **A model is drawn at HALF size.** `MODEL_SCALE = 2048/4096` in
  `lib/game/scale.ts`: the body constructor (0x45de90) hands its scale to
  `afScaleObj` (0x45e443), whose unity is 4096, and the pig and POG paths pass
  0x800. The POG's collision box follows — its unit is 64 world units, and that
  unit lives in `formats/pog.ts` alone. `[exe]`
- **`HEIGHT_SCALE` is 1** in `lib/game/terrain.ts`, though the exe doubles the
  PMG heights in three places. Vertical constants lifted from the exe go through
  `fromExeY`, so they follow the knob. `[exe]` for the doubling, `[play]` for
  the 1.
- **The model faces +X**, so `PIG_HEADING_OFFSET = −π/2` (`lib/game/skeleton.ts`).
  A spawn marker's stored yaw does NOT mean what a prop's does: `spawns.ts`
  carries `yaw + π`. `[play]` for the offset, `[exe]` for the marker being a POG
  record turned by one yaw (0x4a5bd5).

**Time**

- **`FRAME_SECONDS` is 1/15** (`lib/game/ballistics.ts`) and it is the rate of
  everything counted in frames. The walk has its own knob, `WALK_SCALE = 4/3` in
  `lib/game/movement.ts`, on the forward and back speeds only. `[play]`
- **The exe's own step is 52 units a frame** — request 64, `Pig::Walk` takes
  `sar eax,4` of it times the grunt's 13 — against a tile of 512. `[exe]`
- **25 Hz is an INFERENCE.** Three durations come out round at 25 and awkward
  anywhere else (the turn clock's hundredths, the crush counter's 250 frames =
  10 s, the wedge counter's 25 = 1 s), and 25 is the PAL field rate halved. No
  call site says it: the exe reaches `timeGetTime` indirectly. `[exe]`, inferred

**The map**

- **A tile's terrain type is its LOW 5 BITS** (`and edx,1Fh`, 0x46fde4 — checked
  2026-08-12). The bits above are flags: 0x20 water, 0x40 mine, 0x80 wall.
  Measured over the shipped maps the same day: 1865 tiles carry type 11, and
  **not one of them is 0x0b** — 1857 are 0x2b and 8 are 0xab. An unmasked
  `=== 11` matches nothing at all. `[measured]`
- **A block's world position is its PLACE in the file, and a file row runs −z.**
  `parsePmg` mirrors the row once so every consumer keeps "vertices run +x with
  the column and +z with the row". Proof: 0 of 4096 cells disagree with
  `Map::SampleHeight` on nine maps (`terrain/mirror.js`), against ~3500 the
  other way. `[measured]`
- **Water is art the artist made SEE-THROUGH** — palette bit 0x8000, the PSX's
  semi-transparency flag. `afIsPointWatery` short-cuts it with a per-texture
  kind computed at upload (dll 0x10007b6c); MIXED art has its translucent texels
  punched out on the way to the surface (dll 0x10007d79) and the probe reads
  those holes back. The tile's water BIT is only a prefilter. `lib/game/watermask.ts`,
  `formats/tim.ts`. `[exe]`
- **The ground carries its own light.** Each PMG vertex stores a brightness byte
  the original modulates the tile texture by, Gouraud across the triangle; it
  fits a light straight overhead with almost no ambient (ARCHI R² 0.81) and
  neighbouring blocks agree on shared vertices. `three/terrain.ts` draws it
  unlit, texture × shade. `[measured]`
- **A tile is two triangles**, split along (col+1,row)–(col,row+1) — the same
  diagonal the mesh uses, so collision and visuals are one surface.
  `TerrainQuery.patch`. `[exe]`
- **`MapTileSlip` is not slip**: it is which half or diagonal of a wall tile is
  solid, read by `Map::IsBlocked` (0x4a7000) and by no other reader of that
  byte. `[exe]`
- **The tile's rotate/flip byte is one flip bit and a 0..3 turn COUNT** (bits
  1-2), flip applied first. The four UVs are a ring round the quad. The turn's
  DIRECTION is the one thing here measured rather than read — the disassembly
  composes to a forward shift and the shipped maps say backward (883 steep
  tiles, `terrain/turn.js`), and the residual is now an unfound v-convention
  flip in the TIM → page path. `[measured]`
- **Terrain height never refuses a step, and a wall is not a full stop.** Open
  ground of any slope is walked; a wall tile gets the step-up envelope
  `WALL_CLIMB = fromExeY(128)` from the pig's last free footing, then it
  sidesteps or the wedge counter (25 frames) throws it out downhill.
  `lib/game/locomotion.ts`, pinned by `e2e/002/locomotion.spec.ts`. `[exe]` for
  the constants, `[play]` for walls not being ladders.
- **A map does not place the same things in every game.** The low byte of a
  record's flags is which player count it exists in, and the loader drops it
  otherwise (0x4a58cb). `[exe]`
- **The SKY is a MODEL, and the `Skys/` folder is not it.** `Chars/SKYDOME.MAD`
  carries two hemispheres — `skydome` over the horizon, `skydomeu` under it,
  544 triangles each in four quadrants — and one of eleven `Chars/<mood>.MAD`
  archives skins them with four 250×250 TIMs. The loader is 0x4866B0; it puts
  both at the origin and scales them 256× across and 128× up, so a dome
  authored round is drawn SQUASHED to half height. Which mood a map wears is
  the first dword of its 60-byte record in the mission table at 0x4D5210,
  paired to the map names at 0x4D1990 — `lib/game/sky.ts` carries the whole
  table, `three/sky.ts` draws it. The exe's `afSetSky` and `afAddSkyToSortList`
  are resolved and never called. `sky/notes.md`. `[exe]`
- **The mood's FOG is LINEAR and eye-relative, in world units.** `afSetFog`
  (`_d3d.dll` 0x100096F0) is four `SetRenderState` calls — FOGENABLE, FOGCOLOR,
  FOGTABLEMODE = `D3DFOG_LINEAR`, then FOGSTART and FOGEND with the exe's
  floats passed straight through — which is three's `Fog` exactly. `SKY_FOG` in
  `lib/game/sky.ts` carries an arm per mood, 238 out to 2125..4524 against a
  16384-unit map, so the ground is buried inside eight tiles and the acting pig
  is itself lightly hazed. Both are the exe's numbers. `[exe]`
- **The POG stores true world coordinates**, paired to geometry in the map's own
  `.MAD` by NAME, with y an ELEVATION of the model's CENTRE — so props hover
  their own half-height by design. The turn is `phi = yaw − π/2`, pinned to the
  QUARTER (not the sign) by CAMP's iron gate. Every name that fails to resolve
  ends in `_ME`: those are the pig spawn markers, class in `type`.
  `objects/notes.md`. `[exe]`

**Animation**

- **The animation library is `Data/_d3d.dll`**, not the exe — which resolves
  `afDrawAnimModel` and friends through `GetProcAddress`. Skeletal maths is not
  in `warhogs_.exe`. `[exe]`
- **Clip indices come from the exe's CALL SITES**, not from its debug name
  table: 0 run, 3 walk back, 4 turn on spot, 5 swim, 8-10 jump, 11 scramble,
  27/28 idle, 47-50 dying/drowning, 82 parachute. The name table lists 59 names
  where the code reaches 83 clips and its last name is wrong — it calls 58
  "Parachuting" and the exe parachutes with 82. Every entry of `ANIM` in
  `lib/game/locomotion.ts` cites the site that plays it. `[exe]`
- **A clip carries its own EVENTS** — six `(phase, id, id)` rows in the library
  (`afGetKeyFrameList`, 0x1002c778 + clip*88), which is where footsteps, the
  grenade release, the blade's strikes and the doorway's glide all come from.
  `lib/game/footsteps.ts`, `lib/game/melee.ts`. `[exe]`

## Rules that follow from them

- **Never `scale.y = -1`** to get from one space to the other: it mirrors
  handedness and breaks winding and animation. Rotate.
- **Never compare a tile's type byte whole** — mask with `0x1f` first.
- **Never read a clip index off the exe's name table**; take it from `ANIM`.
- **Never add a light to the ground.** Lighting those polygons again — with the
  per-face normals `computeVertexNormals` gives split vertices — is the
  faceting the baked shade replaces.
- **Never write a wall-clock duration into a spec that drives a walk.** It goes
  stale silently the next time a speed moves; size a drive by the DISTANCE it
  has to cover.
- **Do not re-propose `FRAME_SECONDS` at 1/20 or 1/25, or `HEIGHT_SCALE`
  doubled.** Both were built, shown to play and answered — the reasoning is in
  `docs/history/why.md`.
- **Do not tune the tile turn table by eye, and do not make it a setting.** It
  is pinned byte by byte in `e2e/000/terrain-viewer.spec.ts`.
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

Every one is tagged with what it actually rests on, because they are not equal
and the weakest of them were invented here:

- `[exe]` / `[measured]` — read out of the binary or measured over the shipped
  data. The divergence is a deliberate simplification of something known.
- `[play]` — the user ruled it, against the original as they remember it. It
  overrides the disassembly by design; do not "correct" it back.
- `[gap]` — the original's behaviour is known and simply not built yet.
- `[deliberate]` — a remake convenience the original never had. Not a bug.
- **`[CHECK — remake]`** — invented here. Nothing was read and nobody ruled it;
  it stands because it made play work. **Verify before building on one of
  these, and say so when a play session touches it.**

- `[play]` **`HEIGHT_SCALE` is 1** though the exe doubles. Answered in play
  twice; the doubling is above.
- `[play]` **The pig slides, and that stays.** The walking clips carry a body
  about 855 units a second at 25 fps; the exe walks 1560, so the feet skate
  about 2×. Driving playback off the walking speed to close that (a `gait.ts`
  that scaled playback) was built and rejected on sight — the legs whirl, and
  the run clip is not foot-locked to begin with, its two hooves disagreeing by
  40%. `lib/game/clips.ts` plays everything at a flat 25; `movement/stride.js`
  is the measurement.
- `[CHECK — remake]` **Contact softening is not modelled.** The original lets a
  body penetrate and pushes it out by a decaying bias (0.2 → 0.02); a landing
  here pins to the ground height, so there is nothing to decay. `BOUNCE_CUTOFF`
  stands in.
- `[gap]` **The turn ramp is not modelled.** The original accelerates a turn
  over eight frames to the 32/4096-of-a-circle cap that `TURN_SPEED` now is;
  here the cap applies from the first frame. A tenth of a second.
- `[gap]` **The idle CYCLE is not modelled** — a standing pig loops clip 27 and
  nothing else. The 80-byte table at 0x4d7300 that a spent repeat count steps
  into turned out to be per-WEAPON, not per-pig: record 1 and 2 play "Sword /
  Knife", 22 plays "Using Grenade", and record 0 (no weapon) is empty, which is
  why an unarmed pig falls straight through it. So it lands with the weapons,
  not before. What a pig does while it stands about — the "Choosing idle anim
  from scratch" string — is still undecoded.
- `[gap]` **Open water is punched, where the original blends it.** The library
  punches water texels only out of MIXED art (kind 1); a kind-2 tile keeps its
  texture and is drawn translucent over the water. `three/terrain.ts` cuts
  every water texel out of every texture, so open water shows the flat sheet
  colour and reads plainer than the original's. Not chased.
- `[play]` **Water renders as: flatten + mask + one plain sheet.** Per water
  REGION (flood-fill of water-flagged tiles — the exe's "Fitting water." JOINS)
  a level is fitted (mode of the region's corner heights; 128 on every shipped
  map's main water); render vertices below their region's level are raised to
  it; shore art gets its water texels punched (cutout); one SEE-THROUGH sheet
  of the map's averaged water colour sits a hair under each region's level
  (`WATER_ALPHA`, 0.62 — it was opaque and play produced a screenshot of the
  shipped game showing a submerged pig through the surface). NO wat01/wat02
  pattern on the surface — the shipped game's footage shows smooth water, and
  every patterned attempt read wrong. What those two grey TIMs and the DLL's
  under-landscape 49×49 water grid are actually FOR is still open (play memory
  says a sink/kill layer, not the visible water).
- `[CHECK — remake]` **One line about solidity is still the remake's own.** The
  record says most of it — field 11 picks the collision shape and only kind 0
  is a box, so every bridge and step piece is bodiless in the original too, and
  a crate is a pickup exactly when it carries something. What the data does NOT
  say is whether grass belongs in the collision world at all (0x406bb0, the
  test itself, is still undecoded), so `lib/game/obstacles.ts` draws its own
  line at a box two units across — which drops grass, flowers and the swimming
  fish, each of which carries a box exactly one unit wide.
- `[CHECK — remake]` **Three numbers on the dashboard are the remake's own**,
  and each says so where it lives: the GREEN the dial's face is filled in (the
  archive ships the beaded RIM and no disc behind it, so the face is a filled
  ellipse matched to play), the PINK the heart is painted (its art is white),
  and the heart's ×2 (the map's marker is 10×11 and stands beside letters 32
  tall). Correct them against play.
- `[gap]` **The power gauge and the weapon icons wait for a weapon.**
  `newpow1..7` and `powg1` are the gauge — which the original shows only when
  the weapon in hand needs one — and `FACETIMS.MAD`, despite the name, holds
  `wepn01..20` with the crosshair and pointers. The slot they go in is drawn
  and deliberately empty.
- `[exe]` **The menu's LAYOUT is the exe's, bar two pieces.** The exe computes
  its screen coordinates in the draw code rather than storing them, and screen
  1's arm has been read blit by blit (`frontend/notes.md`), so `LAYOUT` in
  `ui/barScreen.ts` carries the original's numbers with the address each came
  from: the machine at (25, 0), the title at (261, 112), the column at 284
  stepping 40, the lamps flush to its right at 493, the dial at (105, 192), a
  cog at (9, 192) and `cogb` — 96×208, TWO cogs in one sprite — at (539, 160).
  **The frontend widens itself by a global 50 and does it two ways**: a plate
  repeats a band of its own art once, the machine repeats a two-pixel column
  twenty-five times, so the grille GROWS with the column rather than sitting
  behind it. Getting that wrong is what had our plates over the wrong recesses,
  and the machine 128 pixels too low.

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

- `[deliberate]` **The mouse works the menu, and the original's does not.**
  Hovering lights a bar, clicking chooses it. The original is keyboard and pad
  only (it even ships `nomouse.com`); this is the remake's convenience, and so
  is F1 for the asset browsers, which are not a screen the original has.
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
- `[CHECK — remake]` **A RAMP is WALKED UP, and that half is the remake's
  own.** The exe's answer is not found — the only thing seen so far that lets
  an object touch the ground a pig walks on is a 3×3 block of TILE values an
  object saves at `[obj+0x182]` and stamps back through `Map::SetTile`
  (0x4767a0 saves, 0x4768c0 and 0x476ba5 stamp, gated on `[obj+0x19C]` being 4,
  5..7 or 0x0E), and that is a tile TYPE with no height in it. So the shape
  comes off the record instead, where it already is: a ramp joins the collision
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
- `[gap]` **Two sides, though a map offers up to six.** The spawn markers name
  six (FINAL uses all of them, the arenas four); the battle fields the first
  two it finds, because there is no AI for the rest. There is no filling in
  either way: CAMP fields ONE side of ONE pig, because that is what the
  training ground carries, and a map with no markers refuses to open.
- `[CHECK — remake]` **The sky dome is SMALL and rides the eye.** The original
  scales it to about four million units across and leaves it at the origin,
  which no depth buffer can draw — the battle's far plane is 100 000 and
  anything past it is clipped. `three/sky.ts` draws the same dome at a radius
  of 40 000, centred on the camera every frame, with depth testing off and the
  first place in the draw order. That is the same picture in the limit and the
  ordinary skybox trick, but the radius is the remake's own number.
- `[gap]` **The mood's SNOW and RAIN are decoded and not built.** The same
  record that picks the dome loads `snow.mtd` for the ten cold maps and
  `rain.mtd` for everything else, and starts one only for cold and ominous
  (0x4854CE). `sky/notes.md`.
- `[CHECK — remake]` **The wall envelope is an inference.** Whether wall
  geometry sits in the exe's collision world is still open (0x406bb0
  undecoded); the remake builds the play-observed behaviour from the decoded
  step-up/sidestep constants instead.
- `[CHECK — remake]` **The wall scrabble wears the Scramble clip.** The exe's
  wedge branch never touches the animation — only the eject (0x470c70) does —
  but a pig pushing at a wall visibly scrabbles in play, and clip 11 is what
  reads as it. Deliberate, in `locomotion.ts`.

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