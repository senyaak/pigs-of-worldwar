# Pigs of Worldwar — orientation

A fan remake of Gremlin's *Hogs of War* (2000) in Electron + Three.js +
TypeScript. It reads assets straight out of a legally installed copy; nothing
from the original is redistributed. This repo normally sits **inside** the
game folder, so `..` is the installation.

Start with [README.md](README.md) (how to play and run), then
[docs/testing.md](docs/testing.md) and [docs/formats.md](docs/formats.md).
Reverse-engineering findings live in a separate repo next door,
[`../pigs-disasm`](../pigs-disasm) — notes plus the scripts that prove them.

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

**The model faces +X**, hence `PIG_HEADING_OFFSET = -π/2`.

**`HEIGHT_SCALE` is the one vertical knob, and it is 1 against the exe.**
The exe doubles the PMG heights in three places — collision sampler,
`afAdjustMapHeights` in `_d3d.dll`, the map's own bounds — and its loader
copies them in untouched, all verified. But a doubled CAMP plays as a
mountain range and reads as stretched next to the original, so the remaster
renders 1×. Do not "fix" this back from the disassembly alone; the
contradiction is written up in `../pigs-disasm/movement/notes.md` and wants
whatever undoes the doubling to be found first. Vertical constants lifted
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

Two dead ends someone will re-derive. Learning water COLOURS off the map
works by accident and flickers mid-swim. Collapsing the mixed case to
"solid" (on the grounds that its texel probe wants a zero texel, and no
shipped art has one) turns a pond's own RIM into ground and lets a pig walk
out over the water — found in play within the hour. The zeroes must be
written by the surface conversion the DLL does past 0x10007f0a, unread; the
TIM says the same thing without it.

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

**A block's world position is its PLACE in the file, not the offsets it
stores.** `Map::Load` (exe 0x4a5635) overwrites both with `(col - 8) * 2048`
and `(row - 8) * 2048` before anything reads them. The x agrees with the
stored field; the z is its opposite, because the file counts z down where
the game counts it up. Reading the stored z put the whole map back to front
— which is invisible in isolation, since collision and mesh were mirrored
together, and shows up as every asymmetric texture facing the wrong way.
Vertices run +x with the column AND **+z with the row**. This is also why
`WALL_SHAPES` no longer needs the mirror it used to carry.

**`MapTileSlip` is not slip** — it is which half or diagonal of a wall tile
is solid, read by `Map::IsBlocked` and by nothing else.

**The tile's rotate/flip byte is one flip bit and a 0..3 turn COUNT**, bits
1-2, not how-doc's two independent flags, and the flip is applied BEFORE the
turn. The four UVs are a ring round the quad: the byte mirrors ring slots
0↔1 and 2↔3, then each corner takes the slot `rot` places round. Unturned,
the texture lands u along +x and v along +z, v being the texture row.

**The turn's direction is the one thing here measured, not read.** The
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

**Clip indices come from the exe's own name table**, not guesswork:
0 run, 3 walk back, 4 turn on spot, 5 swim, 8-10 jump, 11 scramble,
27/28 idle, 47-50 dying/drowning. See `../pigs-disasm/animations/notes.md`.

## How the code is laid out

- `src/lib/formats/` — one pure reader per format (mad, tim, mgl, bmp, model,
  hir, mcap, pmg, ptg). No fs, no Electron, no three: they take bytes.
- `src/lib/game/` — the rules (`Game`, `TerrainQuery`, `movement`,
  `ballistics`). Pure too, so the domain specs drive them directly.
- `src/main/` — `index.ts` lifecycle only, `gameDir.ts` locating the install,
  `assets.ts` loading through the readers, `ipc.ts` the IPC surface.
- `src/renderer/src/` — `ui/` one module per view, `three/` scene/pig/terrain/
  battle/clips, `input/` the controller. `main.ts` is composition only.

Keep modules small and single-purpose; that split was an explicit request.

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

Formats, models, textures, skeleton, 93 animations, terrain and water all
parse and render. The menu wears the original art. The battle scene puts
two squads on CAMP (console: `pow.swapMap('ARTGUN')` — see README) with
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
never lands — the wedge counter throws it out downhill; each terrain type
carries its own friction and restitution, and masked type 11 is the one
that plays the Scramble clip in every band; a landing is binary at an
impact of 25 a frame; a jump is committed, forward, and costs 15 frames.
The walking SPEEDS are its own too — every input asks for a flat 64 units a
frame, `Pig::Walk` grants the class's thirteen sixteenths of it (52 for a
grunt) and half that backwards, water caps the step at 16 — so the one
number left standing between them and metres is `FRAME_SECONDS`.
The acting pig's whole frame-by-frame state machine is pure
(`lib/game/locomotion.ts`); the battle scene only feeds it intents and
draws what it says.

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
- **Gravity and turn rate are still hand-tuned.** Gravity is behind the
  integrator at `warhogs_.exe` 0x4707f0, unread. The turn rate IS decoded —
  the input handler ramps an accumulator by 4 a frame to a cap of 32/4096 of
  a circle, so 1.473 rad/s at 30 Hz against the 2.6 here — but applying it
  has not been played yet, so `TURN_SPEED` stands until it is.
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
- **The wall envelope is an inference.** Whether wall geometry sits in the
  exe's collision world is still open (0x406bb0 undecoded); the remake
  builds the play-observed behaviour from the decoded step-up/sidestep
  constants instead.
- **The wall scrabble wears the Scramble clip.** The exe's wedge branch
  never touches the animation — only the eject (0x470c70) does — but a pig
  pushing at a wall visibly scrabbles in play, and clip 11 is what reads as
  it. Deliberate, in `locomotion.ts`.

### Threads left mid-pull

- `0x406bb0`, 3280 bytes: the collision test itself. Knowing what else lives
  in that world would settle whether objects need their own handling.
- The flag at `+0x3a4` is a bitfield; only bit 3 (terrain type 11) is traced,
  and six other sites write it.
- The tile type's low 5 bits: 0x20 water, 0x80 wall and the twelve material
  rows are known; the rest of the meanings are not.
