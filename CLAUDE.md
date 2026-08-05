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

**Terrain height never blocks a pig, and `MapTileSlip` is not slip.** Both
were got wrong once. The exe treats hitting the landscape as a successful
move and pins the pig to the ground however steep; its step-up and sidestep
belong to the OBJECT collision path, which the remake has no objects for
yet. And the tile byte how-doc names `MapTileSlip` is the wall's shape —
which half or diagonal of a `type & 0x80` tile is solid — read by
`Map::IsBlocked` (0x4a7000) and by nothing else. A pig walks in a straight
line; only a wall, the world edge, or empty air under its feet changes that.

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
- `src/lib/game/` — the rules (`Game`, `TerrainQuery`, `Mover`). Pure too, so
  the domain specs drive them directly.
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

Formats, models, textures, skeleton, 93 animations and terrain all parse and
render. The menu wears the original art. The battle scene puts two squads on
CAMP with the original's turn clock, tank controls, jumping, swimming, and
ground movement taken from the exe: straight lines, sub-tile walls, a fall
off anything more than 32 units below, and — for a pig that keeps shoving at
a wall — two seconds of scrabbling, then being thrown clear of it and
bouncing (`../pigs-disasm/movement/notes.md`, `src/lib/game/movement.ts`,
`src/lib/game/ballistics.ts`).

Next up is weapons — and footstep audio, whose event source is already
settled in `../pigs-disasm/anim/audio-events.md`. Falling still uses
hand-tuned gravity; the original's constants live behind
`warhogs_.exe` 0x4707f0, noted but not yet dug out.
