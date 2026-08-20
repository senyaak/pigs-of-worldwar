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
  otherwise (0x4a58cb). **The count to ask with is the number of PLAYERS, and
  the campaign is ONE** — not the number of sides fielded, which is two.
  Confusing them cost ROAD its whole squad: its five scripted markers carry
  low byte 0x71, the first player bit only, so at two players the player's
  side vanished and the enemy's four-player pair was promoted to ours.
  `PLAYERS` in `lib/game/muster.ts`, pinned in `e2e/002/spawns.spec.ts`. `[exe]`
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
- **The POG stores true world coordinates**, paired to geometry in the map's own
  `.MAD` by NAME, with y an ELEVATION of the model's CENTRE — so props hover
  their own half-height by design. The turn is `phi = yaw − π/2`, pinned to the
  QUARTER (not the sign) by CAMP's iron gate. Every name that fails to resolve
  ends in `_ME`: those are the pig spawn markers, class in `type`.
  `objects/notes.md`. `[exe]`
- **The battle MAP is the library's SCANNER, it is never opened and it is never
  closed.** The exe draws none of it: it loads `chars\top.mad` only to have an
  object to pack two screen coordinates into, and the dispatcher keeps that
  object out of the world and hands the pair to `_d3d.dll`'s `DrawScanner`
  (0x454913/0x4582F0, dll 0x1000485C/0x10009810). It slides in over twenty
  frames when a battle starts and stays: its enable bit has exactly two writers
  in `.text`, a zero in the constructor and a one in the HUD setup, so the
  slide-out is dead code. It sits **110 in from the left and 75 up from the
  bottom**. The library RESIZES it — smaller while a shot charges and while
  the MAP VIEW camera is up, two callers of `afSetScannerSizeSmall` — and
  **`[play]` overrides that: it is always one size.** "Миникарта не должна
  отдаляться вообще." Both numbers stay read and unapplied in
  `lib/game/scanner.ts`. `lib/game/mapView.ts`, `scanner/notes.md`. `[exe]`
  for the widget, `[play]` for the size.
- **The map is TILTED, it does NOT follow the camera, and nothing about it is
  masked.** The board is a square of the WHOLE level seen through a camera
  28.125° above the ground (the library's Euler angles are `(0, 3776, yaw)`
  against a full turn of 4096), with a real ±15% ground-plane recession — 167
  pixels wide at its near edge, 128 at its far one, 70 tall. The camera's
  POSITION cancels out of the vertex arithmetic exactly, so the board only
  TURNS; and there is no clipper, no scissor and no viewport change anywhere on
  the path, so its corners sweep round in the open. `[exe]`
- **The map's picture is one texel a tile, and its colours are the library's.**
  `afInitScanner` locks a 64×64 surface once per battle and writes
  `palette[type & 0x1F] * shade >> 9` into every texel, shade running 64..194
  with the tile's own height across the map's range — then hands it over with
  `afOverwriteTexture`. `lib/game/mapRaster.ts` carries the palette. `[exe]`
- **The shade lights the PEAKS, the channel is five bits, and the WHITE on the
  board is the original's.** `height` is an elevation, positive up — proved
  four ways, of which the plainest is that water sits at the map's MINIMUM
  (`scanner/notes.md`) — so shade 64 is the lowest vertex, where the
  arithmetic is the exact 8→5 bit conversion, and 194 the highest. Each
  channel is then CLAMPED at 31 by the library itself (`cmp ecx,1Fh / jle /
  mov ecx,1Fh`, dll 0x1000A3F4), so any palette row over 82 blows out on high
  ground: row 9 is `100,100,100`, and CAMP's boundary plateau turns the whole
  rim pure white. Play reported that as four white stripes; it is what the exe
  draws, and `unit/scanner.spec.ts` pins both ends of the scale. `[exe]`
- **The board is stretched BILINEARLY**, which was the last open question about
  the widget. The library writes `D3DTSS_MAGFILTER` and `MINFILTER` = LINEAR
  once at start-up (dll 0x10006518/0x1000652C — the only two filter writes in
  its whole `.text`) and `DrawScanner` never touches the state, so the 64×64
  picture is smoothed across its 167 pixels, not point-sampled. `[exe]`
- **An espionage pig is off the map on anybody else's turn, and there is no
  range.** Classes 8, 9 and 10 — SCOUT, SNIPER, SPY — get marker 0xFF whenever
  their team is not the team whose turn it is (0x440C67), and the library drops
  the blip; the same test hides the name over the pig's head. It cuts both ways:
  your own scout is off your own map through the enemy's turn. Only four model
  names get a marker at all — CRATE1, CRATE2, CRATE4, PROPOINT — and DRUM sits
  one place past the window on purpose. `[exe]`
- **A minefield IS on the map — as red GROUND, not as a marker, and only the
  mines that were there when the battle opened.** The same fill loop writes a
  solid red texel wherever the tile's mine bit is set, unconditionally and for
  everybody; the texture is never rebuilt, so a mine laid during play never
  shows. `bomb` in `MAPICONS.MTD` really is dead art — it has no reference in
  the library at all. Separately there is the GROUND reveal: a 3×3 block of
  tiles round a pig of class 4, 5, 6, 7 or 0x0E stamped back through
  `Map::SetTile` (0x4767A0) — a texture swap, three tiles, five classes.
  `lib/game/mines.ts` still carries an invented 1024 and a set of three; see
  `todo.md` B10. `[exe]`

- **A NATION and a SKIN are two different numbers, and the art goes by the
  skin.** SELECT TEAM writes a nation (0 British, 1 French, 2 American,
  3 Russian, 4 Japanese, 5 German, 6 Lard); every archive, hat, colour and
  paper is indexed by the skin (0 British, 1 American, 2 French, 3 German,
  4 Russian, 5 Japanese, 6 Lard). `Team::SkinOf` (0x4508E0) is the one
  converter, `{0,2,1,4,5,3,6}` with anything out of range clamped to Lard.
  `lib/game/nations.ts`. `[exe]`
- **A map's spawn side bit is a SLOT, not a nation.** DEVI carries slots 2 and
  4 and OASIS 1 and 5, with no slot 0 on either, and both are campaign maps.
  Which side is the PLAYER'S is record `+0x58` bit 0, which `Map::Load` tests
  before it looks at the side bits (0x4A5D2A); exactly one side per shipped map
  carries it. `lib/game/spawns.ts`. `[exe]` for the branch, `[measured]` for the
  survey.
- **The enemy's nation comes from the SAVE, not the map.** The whole campaign's
  opponents are rolled once when the army is born — five rounds of five,
  balanced, never the player's own, and position 25 forced to Lard — and the
  boot camp takes `(own + 1) % 6` instead (0x41A409). `lib/game/enemies.ts`,
  `army/skins.md`. `[exe]`
- **Only the heavy-gunner family wears a nation HAT.** `ClassToModel`
  (0x4C2E50) gives model type 2 to classes 1, 2 and 3 alone, and the exe hangs
  a hat off bone 2 when the type is 2 and zeroes the slot otherwise (0x440D71);
  every other class carries its headgear in its own mesh. The hat takes the
  same half turn every attachment gets at load, and `Chars/BRITHATS.MAD` is
  unused — its name is nowhere in the executable. `[exe]`
- **A nation is a REPAINT.** All seven `Chars/*.MTD` hold the same 120 entries
  under the same names at the same sizes, and 105 of the ~110 that differ from
  the British ones differ only in their palette. So one geometry load dresses
  any nation, and `loadModel` takes the archive as an argument. `[measured]`

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
  `assets.ts` loading through the readers, `saves.ts` the campaign saves,
  `ipc.ts` the IPC surface. **A save crosses as TEXT**: the shape is
  `lib/game/save.ts` and neither the main process nor the preload parses one,
  so a new field never reaches either.

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
would still pass. Use `e2e/controller.ts`. The one exception is a spec whose
SUBJECT is the keyboard, and there is exactly one
(`e2e/001/mapchain.spec.ts`); it says so in its own words.

**ONE keydown is ONE action, and one action reaches ONE view.** Every view
binds its own map on the same `window` gated on being the view that is up, and
that gate holds right until a view hands over SYNCHRONOUSLY — which the
briefing does, showing the battle from inside the dispatch. So the same Space
arrived twice: once as the briefing's `menuSelect`, once as the battle's
`jump`, which cut the squad's parachutes on the drop-in's first frame. Two
guards, because the leak has two halves: `bindKeyboard` calls
`stopImmediatePropagation` on any event it consumes, and `MENU_ACTIONS` keeps
the frontend's verbs out of the battle's queue, which no event listener could
have reached. `[play]`, and the exe agrees — its own canopy cut tests the pad
for a FRESH press (0x490c20).

**An action is SPENT the moment it changes the view.** `show()` calls
`controller.stopDispatch()`, which ends that action's delivery to the rest of
the listeners. The two-listener leak above is the keyboard half of this; the
half no event can reach is a view handing over inside one `fired()` pass, and
it bit twice — the battle queueing the briefing's key, then the briefing
taking the map's. Anything new that changes the view goes through `show()`,
which is where the rule lives.

**ESCAPE is the PAUSE, and a pause stops the WORLD while the CAMERA goes
touring.** `ui/battle.ts` owns one flag and each domain reads it in its own
way. The world stops because `running` gates the whole frame in
`three/battle.ts`, so `engine.update` is never reached and the fixed-step
accumulator never sees the time. The sound stops by suspending the one shared
`AudioContext`, which holds a half-spoken line where it was instead of losing
it. The dashboard keeps drawing on a delta of ZERO, so the bar stops scrolling
and the plates stop fading — with the MAP the one exception, because its size
belongs to the camera rather than the world.

**And a paused mission is NOT a still picture — the camera FLIES.** The exe
hands it mode 7, the same MAP VIEW skill 63 enters, whose per-frame handler
advances a bearing six of 4096 EVERY frame and puts the camera at
`x = 11000·cos θ`, `z = 11000·sin 2θ` — the sine's index doubled, so the path
is a FIGURE-EIGHT about the world origin — at the height of the map's own
highest ground. What it looks at is a pig, eased in at a thirteenth a frame,
changing every 126 frames or when the flight comes within 4408 units of it.
`lib/game/mapView.ts` carries every number. So `three/battle.ts` takes a
`paused` predicate BESIDE `running`: the first says the world has stopped, the
second says what to do instead of nothing.

**Switching subject with a still camera is the VICTORY camera, not this one**
(`lib/game/endOfGame.ts`, one survivor every two seconds). That mistake was
built once, off a note that had read only the subject half of mode 7 — and on
a one-pig map it produced a camera that never moved at all.

The menu itself is
`lib/game/pauseMenu.ts` (five rows and no more: the exe's lit row dispatches
through a five-entry jump table) drawn by `ui/pauseMenu.ts` on the HUD canvas,
and it is driven by the battle's own keys because the exe reads one pad. Two
things follow. **Escape is the battle's own action, never `menuBack`** — that
one is in `MENU_ACTIONS`, which the battle deliberately drops. And **the pause
is SINGLE-PLAYER only**: play's rule, "в мп вообще никаких остановок", and a
lockstep battle cannot have one side stop the clock. What it is PRINTED in is
`[play]` and the divergence list carries it: CHARS2, not the `FETEXT\small`
the exe prints every line of this menu with.

**ABORT is a LOSS, and there is no MISSION ABORTED screen.** gtext 189 carries
those words and nothing in the executable reads it; the exe writes −2 into the
outcome word and falls into the same debrief call the ordinary end takes, and
that page only ever asks `outcome == 0`. So the pause's ABORT leaves with the
`lost` verdict and lands on the loss debrief — SPACE RETRY, ESCAPE EDIT SQUAD
— while `aborted` keeps meaning the TOOLBAR's walk-out, which is the remake's
own button and has no original to be faithful to.

**A battle does not step until it is SHOWN.** The scene is built when
`battle.open()` resolves, which is exactly when the briefing's loading bar
fills — so `three/battle.ts` takes a `running` predicate and the frame is a
no-op until the battle is the view. Without it the five-second drop-in runs
under the loading screen and a player who reads the briefing lands before
looking at it.

## Tests

Two suites — `unit/` flat and `e2e/` phased — and the split is spelled out at
the end of this section. Inside `e2e/`, phases are folders: `e2e/000/`
foundation (formats, viewers), `e2e/001/` the menu, `e2e/002/` the battle.
Serial, one worker; within a folder files run alphabetically, so the spec that
creates the phase's state sorts first. Unnumbered specs at the root are
standalone.

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

**A DEBUG READ IS NOT A PAINT CHECK, and this has now cost two play sessions.**
`pow.*` says what a view THINKS; it says nothing about whether a pixel was
laid down. The pig map's flags were computed and never drawn, and the pause
menu answered its keys and made its noises with nothing on the screen — both
passed a suite that only read state. Anything drawn on a canvas needs an
assertion that reads the CANVAS: count the distinct colours (`painted` in
`e2e/001/mapchain.spec.ts`), count a signature colour's pixels (`greenPixels`
in `e2e/002/pause.spec.ts`), or count the blits (`pow.pigMap.flags()`). And
the trap that produced the second one is worth naming: a bare `return` in the
middle of a long `draw` takes everything after it with it. Put the refusable
part in a function of its own.

**A RUN CLEANS UP AFTER ITSELF.** Anything a spec writes outside its own
process — saves, profiles, fabricated installs — is cleared by the suite, not
left for somebody to delete by hand: `e2e/scratch.ts` runs as both
`globalSetup` and `globalTeardown`, taking `_tmp/saves` and `_tmp/profile`
with it at each end, and a spec that makes its own folder removes it in
`afterAll` (`e2e/cli-game-dir.spec.ts`). BEFORE as well as after, because a
killed run and a hand-driven single spec leave state with no teardown to
collect it. It was not tidiness: leftover saves failed `load.spec.ts`, which
asserts a fresh campaign at 0/26 and found one an earlier standalone run had
walked to position 1 — a spec nobody had touched, pointing at the wrong
place. What is NOT cleared is `_tmp/` itself, which is the project's scratch
space, and the phase chain's `.env`, which is the handover between phases.

```bash
npm run typecheck && npm run build && npx playwright test
```

**THE SUITE IS TWO, and the folder is the split.** `unit/` is the engine
stepped directly — no window, no Electron, no installed game — and is what a
build server runs (`npm run test:unit`, `.github/workflows/ci.yml`). `e2e/`
launches the app against the real installation and can only run here. Every
test in `unit/` also carries the tag `@nodata`, because the folder is what a
RUN selects and the tag is what one test claims about itself. **`npm run
boundaries` holds the two together** — a unit spec may not import out of
`e2e/`, every unit test carries the tag, a spec in `e2e/` that needs neither
the app nor `GAME_DIR` belongs in `unit/`, and nothing in `e2e/` may claim the
tag. Write an engine spec in the wrong folder and it says so, with the line
(docs/testing.md).

**A `v*` tag builds
a release** (`.github/workflows/release.yml`, `electron-builder.yml`): a
Windows installer and a zip, carrying no game data. The notes are the matching
section of `CHANGELOG.md` — so a version is written up THERE before it is
tagged, and the workflow refuses if the tag, `package.json` and that file
disagree.

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
| [frontend.md](docs/history/frontend.md) | the menu's machine: what moves on it, what it sounds like, how a screen arrives and leaves |
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
- `[manual]` — the game's own field manual says it in words. `manual.pdf` in
  the install is a SCAN with no text layer; **`manual.txt` beside it is the
  text**, and it is worth opening before calling a rule an inference — it
  settled the roster's in one sentence.
- `[gap]` — the original's behaviour is known and simply not built yet.
- `[deliberate]` — a remake convenience the original never had. Not a bug.
- **`[CHECK — remake]`** — invented here. Nothing was read and nobody ruled it;
  it stands because it made play work. **Verify before building on one of
  these, and say so when a play session touches it.**

- `[play]` **`HEIGHT_SCALE` is 1** though the exe doubles. Answered in play
  twice; the doubling is above.
- `[play]` **The PAUSE menu is printed in CHARS2**, and the exe prints it in
  `FETEXT\small` — read twice, and not in doubt: every line of 0x45A9B0 goes
  through the object at `[0x51BA54]`, thirty-nine times, and the big one at
  `[0x51BA58]` is not touched once. SMALL is twelve pixels tall with a
  four-pixel `I`, and play called it unreadable twice running — "шрифт гавно",
  then "надо другой взять". CHARS2 is sixteen tall and is what every other
  menu in the game is written in. **The volume BAR keeps SMALL**, because its
  width is arithmetic rather than taste: the track is twenty `I ` pairs, `I`
  is 4 wide and a space advances 8, so a cell is 12 and the track is exactly
  240 across a panel of 260. `ui/pauseMenu.ts`.
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

  **The dial's needle points at the lit row**, and that is the exe's: the
  selection handler (0x427C90) aims widget 4 at frames 0, 4, 7 and 11 for the
  four rows, and the widget walks there one frame a tick. Spreading twelve
  frames evenly over the rows gives those four back exactly, which is what
  `needleFrame` does.

  **NOTHING on this screen animates by itself.** Three widgets move and each
  moves because something asked it to: the plates and title turning over, the
  needle, and the lit row's lamp on script 1002 (`light2` 1 tick, `light3`
  10, `light2` 1, `light1` 5, looping). **The cogs are STILL PICTURES** — both
  are built on frame 0 and no call site asks for another. What turns is the
  plates; what is heard is `cog.wav`, one 32 ms tooth a tick, while the screen
  drives in or out.

  **The WORDS have boxes of their own, and the whole frontend is CHARS2.**
  The frontend builds one text object out of CHARS2/L/D and writes every
  screen with it, title included — only screen 3 gets a CHARS3 — and which of
  the three shades a line wears is the MEAN of the colour it is asked for
  (over 100 light, under 50 dark). A line is centred across a box out of
  `.data`, and the boxes ride the entrance: `MENU_TEXT` in `ui/barScreen.ts`
  carries screen 1's, in pixels. **The rows' boxes do NOT carry the plates'
  stagger** — the words stay put and the plate moves under them. And the two
  per-frame numbers the plate widget writes are the words riding the turn: a
  letter is cropped to `100 - |v|` per cent of its height and dropped by what
  it lost, the rows and the title on different tables.

  **A press is never gated and the light WRAPS.** The up and down arms are two
  lines each with no travel to wait out and no click of their own — the click
  a player hears on a move is the needle ARRIVING (`Indu006` at half volume).

  **A screen leaves the way it arrives.** Choosing a bar starts the leave arm,
  not a view swap: the plates turn back the other way (frame 0, walked to 3),
  the machine climbs out of the top under constant acceleration, and only once
  it is gone do the tracks walk out sideways. Same for the arrival, in the
  other order — **the tracks slide in BEFORE the screen falls**, and while
  they are moving the update arm does nothing else at all. `ui/drive.ts`, on
  the three integer routines in `ui/springs.ts`.

  **There is NO carriage on the menu.** The remake ran one — `selcog`, the
  arrow with a cog above and below — up and down the column, and play threw
  it out on sight. The disassembly had said the same first: screen 1 never
  loads `selcog`. Exactly one loader arm does, the one serving screen ids 2,
  3, 4, 11 and 12, which loads `name0..5` beside it — the SELECT TEAM / ENTER
  YOUR NAME family, where it goes when those screens are built. `select.mgl`
  is left out on the same evidence. The lit bar is told apart by its lighter
  letters and by its lamp, which is the original's own way.

  **The TRACKS are read too, and they hang off the screen on purpose**: 64
  wide by 638 tall out of 64×480 art, at x -34 and 681 of a 640-wide screen,
  the right one's WIDTH negated so it is drawn mirrored, and the flush clips
  the rest. Reading them literally had looked wrong; it is not. The same
  reading settles the blitter's convention, which this file used to argue from
  the plate and the lamp abutting: the clipper moves a blit's source rect by
  exactly what it moves the destination, so **x/y is the TOP LEFT corner**.

- `[deliberate]` **A save is REPAIRED at the parser, never downstream.**
  `parse` fills a short enemy table and defaults a missing `tutorial`, so
  nothing after it has to wonder. The rule was bought: a campaign begun before
  the enemies were drawn at birth saved `enemies: []`, which passed every
  check — `every` over nothing is true — and the pig map then painted all 25
  territories the brown "nobody". Play asked how a save could break a screen,
  and the answer is that it should not be able to: a file describing a
  campaign that cannot exist must not get past `parse`. Repairs there are
  SEEDED off the save itself, so they are pure and a file reads the same twice.
- `[exe]` **A territory is a GREY MASK ADDED to the map, not a patch of paint
  laid over it.** The 25 site patches, the region `flag` and the four marker
  parts `ar1..ar4` are greyscale silhouettes; the nation colour is a DIFFUSE
  at 255-neutral (`D3DTSS_COLOROP` is never set, so the stage stays at
  MODULATE), and the world composer blends with SRCBLEND = DESTBLEND = ONE.
  So `screen = bigmap + mask × colour/255`, `ui/pigMap.ts` draws the patches
  with `globalCompositeOperation = 'lighter'`, and the blink is a WHITE FLASH
  rather than a hole. `fpole` and the six region pages are real colour art and
  take no tint. **EVERY stand of a region flies a flag, from the campaign's
  first day** — the region loop (0x483566) carries no comparison at all and
  never reads the campaign position, so there is no "only where we have been"
  and no such thing as a bare pole; what a flag says is who HOLDS that
  mission. The whole model is in `pigmap/notes.md`.
- `[play]` **The DEBRIEF lists only the pigs that FOUGHT** — one after boot
  camp, three after the first mission, five from then on (`fieldedAt`). The
  exe draws five rows always and uses that count only to swap a benched pig's
  portrait for a plain one, its name and badge still printing. What makes this
  play's call rather than a mistake: the exe never shows this page after boot
  camp at all (0x47E61F), so the screen a player meets there is the remake's.
- `[deliberate]` **The debrief SHOWS after the training ground and pays
  nothing for it.** The exe sends CAMP straight to `EndOfMission`; here the
  roll call is wanted, so `paysPoints` gates every token the page draws
  against what `missionReward` actually hands out. The two must never be
  allowed to disagree again — play caught the screen promising two points for
  a mission worth none.
- `[play]` **Sprite TIMs are trimmed of their ALIGNMENT PADDING, and the PC
  original's are not.** A TIM's width is stored in 16-bit units, and four of
  the world map's territory masks plus all ten clock digits ship with a full
  opaque-grey filler column the artist never painted. The PC exe DRAWS it —
  it hands the 2D record a −1 size sentinel and the library substitutes the
  padded width and UVs (`library/notes.md`, read 2026-08-19) — which is the
  white hairlines play reported twice on the world map. Play's memory of the
  original (the PSX's) has none, and play wins: `spritePadding` in
  `lib/formats/tim.ts` measures the filler by a deliberately narrow rule and
  the sprite loader trims it (`main/assets.ts`, `loadTims` only — models and
  terrain map UVs over the full surface and are never trimmed). The rule is
  pinned twice: synthetically in `unit/timPadding.spec.ts` and over the
  shipped archives in `e2e/000/timpadding.spec.ts` — exactly `hog2/sau3/
  sau4/trot2` and `timer0..9`, and nothing else, because `pause5`'s dark rim
  and `fpole`'s solid columns are art an eager rule would eat.
- `[deliberate]` **The roster counts DEATHS, and nothing draws them.** The
  exe has no deaths number at all — a death there is the fall order and the
  slot emptying — and the remake keeps one on the roster pig (`deaths`,
  counted by `regroup` when a pig gets up, so a replay counts nothing and a
  pig gone for good takes its number with it). It was on the `pigpro` board
  as a third pair beside battles and kills, and **play took it off again**:
  "третья иконка не нужна — только сколько битв и сколько убил врагов". The
  board is the original's two counts. `lib/game/roster.ts`,
  `ui/playerScreen.ts`.
- `[play]` **The MOUSE drives every menu screen, and the lit row is told
  apart by its LETTERS.** The original is keyboard and pad (it ships
  `nomouse.com`) and its LOAD screen never recolours a label — the plate
  behind it blinks instead. Both are overridden: `ui/mouseRows.ts` is the one
  hit test (un-letterbox the canvas, hit the rows the screen is drawing with,
  walk the light one row a tick so nothing jumps), and a lit row is written in
  the light shade wherever a row is written at all. A screen the pointer
  cannot drive reads as broken however faithful it is.
- `[deliberate]` **A name is judged and kept TRIMMED.** The exe's ENTER tests
  the buffer's first byte alone (0x42AF50), so a team called one SPACE passes;
  `press` in `lib/game/nameEntry.ts` trims before it refuses and hands the
  trimmed name over. Play's call.
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
- `[play]` **EVERYONE drops in together.** The POG's parachute bit picks out
  one side of a campaign map — the player's, with the enemy standing on the
  ground, which is what the exe builds — and play rules otherwise: "все
  свины падают на парашютах". One flagged marker among the fielded sides
  puts the whole battle under canopies (`mapSquads`, lib/game/muster.ts); a
  map that flags nobody still stands everyone, and the bit itself stays read
  as the exe reads it (`e2e/002/parachute.spec.ts` pins the data).
- `[CHECK — remake]` **The drop face is the 004 pair.** An arriving pig wears
  `eyes004`/`gobs004` out of `Chars/FACES.MTD` — the stare and the scream —
  from `dropOpened` to `dropLanded` (three/faces.ts). The exe loads that
  archive unconditionally (0x486030) but HOW it picks a face is undecoded,
  and which pair is "scared" was judged by looking at the art. Correct it in
  play; an expression is one name there.
- `[play]` **A hillside is walked DOWN, and only a face past WALK_OFF_GRADE
  (60°) is fallen off — and that number is PLAY'S DIAL.** The first build's
  fall test was a slope test at 13.0°, under CAMP's median slope of 14°, so
  most descents were a stutter of launches ("спускаюсь с горки — падаю - иду
  - падаю"). The look-ahead now hunts a CLIFF FACE — ground falling away
  steeper than WALK_OFF_GRADE within one FACE_PROBE — so ordinary grades are
  walked pinned to the ground (the climb has no limit at all) and a real
  wall still launches a walking step ahead. The 60° is not measured from
  anything: a census of every shipped map (`movement/slope-census.mjs`)
  found tile faces run CONTINUOUSLY from flat to ~88° with no gap between
  "hill" and "cliff", 12% of non-wall tiles past 45° — and play walks faces
  past 45° both ways. A walked surface found past 60° in play moves the
  number. `lib/game/movement.ts`; pinned in `unit/movement.spec.ts` and the
  downhill walk in `unit/locomotion.spec.ts`.
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