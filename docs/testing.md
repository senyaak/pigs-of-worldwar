# Testing spec

Conventions for the Playwright suite, borrowed from the `homm5-editor`
project. Read this before writing a spec.

## TWO SUITES, and the folder is the split

**`unit/` needs nothing.** The engine is pure (`src/lib/game/`) — parsed data
in, numbers out — so a spec can build a battle, step it and assert what
happened with no window open and no game on disk. Flat folder, one file per
subject, and **every test also carries the tag `@nodata`**:

```ts
test('a low object is a step onto, not a wall', { tag: '@nodata' }, () => {
```

**`e2e/` needs the real thing.** It launches the app and drives it against a
real installation of the original, which is the whole point of it: the specs
assert against the game's own maps, models and text rather than against
fixtures somebody wrote to match the code. It cannot run anywhere else, and a
build server is not asked to.

Two ways of saying one thing — folder and tag — because they answer different
questions. The folder is what a RUN selects (`--project=unit`, which is all CI
can do); the tag is what one test claims about ITSELF, and it shows in the
runner's output and in `--grep`, where a reader who has never heard of the
convention will still see it.

**`npm run boundaries` stops the two from drifting**, and it is run in CI ahead
of the tests. Four rules: a `unit/` spec may not import out of `e2e/` (`app`
and `GAME_DIR` both live there, so that import is the only door to the game);
every test under `unit/` carries the tag; a spec in `e2e/` that names neither
the app fixture nor `GAME_DIR` belongs in `unit/`, because as it stands it is
coverage a build server could have had and silently does not; and nothing in
`e2e/` may claim the tag. Write an engine spec in the wrong place and the check
says so, with the line.

The terrain fixture lives at `unit/fixture.ts` — it is pure, and the two e2e
specs that build a map to order import it from there. That direction is the
only one allowed: `e2e/` may use what `unit/` has, never the reverse.

### …and one SUITE inside `unit/`: `unit/weapons/`

The split above is still two. `unit/weapons/` is a third Playwright PROJECT,
not a third kind of spec: it is `unit/` in every way the rules care about — no
window, no Electron, no installed game, every test tagged — and it is separate
only so it can be run and read on its own.

It is arranged by CLASS, one `test.describe` per class, grouped into a file per
CAREER (`ranks.ts`'s own six), plus `unclaimed.spec.ts` for every skill no
class carries. Each class says what it costs and buys, what its kit holds, and
**which door every skill in that kit goes through when the fire key is
pressed** — through the real `createAttack`, with only its leaves stubbed
(`unit/weapons/kit.ts` says why at length). The failure it exists for is
silent: a skill with no row in any of the four classification tables falls
through the ladder to the melee default and does nothing at all, which is how
28 MORTAR sat in two shipped kits for weeks.

The inert ones are asserted BY NAME rather than merely counted, so building a
weapon turns the suite red and whoever built it deletes a line. That is
deliberate: a test that only counted failures would go quietly green and
nobody would learn the class was finished.

```bash
npm run test:weapons   # the class suite alone
```

`npm run test:unit` names both projects, so a build server still runs the lot.
**Note for anything that parses specs**: this is the first place in the repo to
use `test.describe`, and `scripts/boundaries.mjs` had to learn that a describe
is a GROUP rather than a test before it would stop reporting seven of them as
untagged.

## Phased specs — inside `e2e/`

Tests live in `e2e/` at the repo root. Each **phase is a folder** named by
its number — `e2e/000/`, `e2e/001/`, … — holding every suite that belongs to
that number. Phases run in order (the suite is serial, one worker), and each
phase leaves the world in the state the next phase starts from. A spec that
creates something is written before the spec that uses it. Within a folder,
files run alphabetically — the suite that creates the phase's state must sort
first (`000/foundation.spec.ts` before `000/model-viewer.spec.ts`).

- `000/` is the foundation, all of it: every structural thing the engine
  needs before anything real happens — cold start with no saved state,
  pointing the app at the game, seeing its files, opening archives, and the
  debug model viewer that proves the format pipeline. The app's features
  don't care about any of this, which is exactly why it is phase zero.
- Folders from `001/` up are engine milestones — things a player could point
  at; parsers rendering a debug pig do not count. `001/` is the game's frame:
  the main menu, which IS the original screen — its art, its letters, its
  four labels (ONE PLAYER → the battle, QUIT APPLICATION → quits; the
  phase-000 browsers hang off the remake's own F1, since the original has no
  such screen). `002/` is the first
  battle slice: the Game domain model (players, squads, turn rotation — the
  half of it that needs a real map to read) and the
  battle scene ONE PLAYER opens: squads spawned on standable CAMP ground, the
  original's turn clock (auto end-of-turn on expiry), tank controls — W/S
  walk, A/D turn, Space jumps ballistically — swimming and slope-sliding per
  the tile data, and a chase camera behind the acting pig's back.
- Specs at the `e2e/` root without a number (`cli-game-dir.spec.ts`) are
  standalone utilities: they build their own sandbox and must not depend on
  any phase.

## The bench — a skill against the exe's numbers

`e2e/bench.ts` opens the proving ground with no window (the real map, the real
engine, a fixed seed), puts a skill in the player's pig's hand and presses fire
through `battle.setFiring`, so the ladder, the fuse and the muzzle are the game's
own. `fireAtDummy` reports what one press of a gun came to: its rounds, its reach,
each round's damage and each throw's speed in exe units a frame.

`e2e/000/proving-bench-guns.spec.ts` is one case per gun, every number `// exe:`
cited. A case marked KNOWN SHORT or DIFFERS pins what the remake does today, with
what the exe does and the owning issue beside it, so the build goes red and flips
it. `e2e/000/proving-bench-blades.spec.ts` is one case per blade, swung through the
same door at a dummy stood in front of the pig: its clip, its damage and its throw.
A bench's report lives in its own spec; the next benches use `openBench` and its
verbs.

## A spec LOADS its starting state — it never walks to it

A spec checks that one state goes correctly to the next. The state it starts
from is put in place directly: the code is ours, so `openBattle(page, map)`
(`e2e/load.ts`) opens a battle on the map the spec wants from wherever the app
stands — squads already on their markers, the first turn running — through
`pow.open`, the app's own entry for it. No campaign is behind that battle, so
leaving it lands on the main menu.

The walk from the menu — ONE PLAYER → NEW GAME → army → name → squad →
briefing — and the parachute drop are each the SUBJECT of their own specs and
are walked only there (`startGame` and `toBattle` in `e2e/menu.ts`): the
campaign landing in `002/battle.spec.ts`, the abort's way back to the squad in
`002/pause.spec.ts`, the drop in `002/parachute.spec.ts`. Every other battle
spec walking them first spent most of a 22-minute run re-testing the menus.

`pow.open` is an ACTION (`src/renderer/src/actions/actions.ts`): it ends once,
done or refused or failed, with how long it took, and going over its budget is
an error the spec fails on. The load runs as a `test.step` titled `load …`, and
`e2e/timing.ts` prints after every e2e run how long each spec spent in the
fixture, in its load and in the test itself — slowest load first.

## Fail fast — no waiting out timeouts

The rule: **a test fails the moment something goes wrong, not when a timeout
expires.**

- No `page.waitForTimeout()`, no sleeps, no raised default timeouts on clicks
  and assertions. Web-first assertions (`expect(locator).…`) auto-wait with the
  short default from `playwright.config.ts` — that is the only waiting a
  normal interaction is allowed.
- Every launch goes through `e2e/launch.ts`, which attaches listeners
  **before the page runs**: uncaught renderer errors (`pageerror`),
  `console.error` output, and the main process's stdout/stderr. A dead
  renderer keeps its static markup, so assertions on markup can pass happily —
  the `errors` array is what tells the difference.
- Every test asserts the errors are empty at the end (and after any step it
  suspects) — `expect(app.errors()).toEqual([])`, or `launched.errors` in the
  specs that launch for themselves. `toEqual([])` rather than a length check,
  so a failure prints the actual error messages.
- **The app is launched once for the whole run.** `e2e/app.ts` is a
  worker-scoped fixture: a spec that takes `{ app }` gets a page already back
  on the main menu, and an `errors()` scoped to that spec rather than the
  whole session. A spec must leave the app on a screen the fixture's `toMenu`
  can exit from — that is the price of not restarting.

  Only specs whose subject IS starting or stopping the app call `launchApp`
  themselves: the cold start, the warm start, the fullscreen launch, Exit,
  closing the window, and the `--game-dir` CLI. Everything else was flashing
  a window up and killing it just to reach a menu.

  Playwright groups the specs sharing a worker fixture, so they no longer run
  strictly in phase order. Nothing depends on that beyond `PHASE_ENV` having
  been written by the cold-start spec, and the fixture fails with that
  sentence if it has not.
- A genuinely long operation (unpacking, converting) may wait longer — but
  only through a helper that polls for reported errors and throws the moment
  one appears, instead of waiting out the timeout and reporting a bare
  "timed out" (see `hudSays` in homm5-editor for the shape).

## A debug read is not a paint check

This has cost three play sessions. `pow.*` says what a view THINKS; it says
nothing about whether a pixel was laid down. The pig map's flags were computed
and never drawn, the pause menu answered its keys and made its noises with
nothing on the screen, and a blast-thrown pig flew 1700 units in the ENGINE
while its mesh stood still — `three/battle.ts` placed only corpses from the
snapshot, and every fling spec read the tumbles instead of the node. All three
passed a suite that only read state; the third's paint check is
`e2e/002/flungmesh.spec.ts`, on `pow.debug.nodeAt` — the DRAWN node, which is
the renderer's own word.

Anything drawn on a canvas needs an assertion that reads the CANVAS: count the
distinct colours (`painted` in `e2e/001/mapchain.spec.ts`), count a signature
colour's pixels (`greenPixels` in `e2e/002/pause.spec.ts`), or count the blits
(`pow.pigMap.flags()`). And the trap that produced the second one is worth
naming: a bare `return` in the middle of a long `draw` takes everything after
it with it. Put the refusable part in a function of its own.

## Numbers the game can move are floors

Specs run against the real installation, read-only, with counts asserted as
floors where savegame churn could move them and exactly where it cannot.

**Never size a walk by wall-clock time when the spec depends on where it
ends.** A drive that must reach a place, cross a gap or stop at a wall goes
stale silently the next time a speed moves; size it by the DISTANCE it has to
cover. A walk whose only job is to move at all — `hold(page, 'walkForward',
400)` and then "the pig moved" — may hold for a duration, since no speed
change can make it wrong.

## Drive the game through its controller, not through keys

Player input goes through one place — `src/renderer/src/input/controller.ts`,
which maps physical keys to named actions (`walkForward`, `turnLeft`, `jump`,
`endTurn`, …). Specs drive **that**, via `e2e/controller.ts`:

```ts
await hold(page, 'walkForward', 700)   // press, wait, release
await tap(page, 'endTurn')             // one-shot
const { x, z, heading } = await debugState(page)
```

The menu is the same story. It draws on a canvas, so there is no button to
click: `e2e/menu.ts` moves the lit bar with `menuUp`/`menuDown`/`menuSelect`
and reads the screen back through `window.pow.menu`.

Synthesising key events instead would test a parallel path: a broken
keybinding, a controller regression, or a view that forgot to subscribe would
all still "pass". Going through the controller means a test fails when the
real control path breaks. The keyboard is just one more thing that calls
`press`/`release`, exactly like the on-screen End Turn button.

`window.pow.debug` (present only while a battle scene is up) exposes where the
acting pig actually is, so movement specs assert on the world rather than on
the HUD's description of it.

## Native dialogs are undrivable

Playwright cannot operate OS file pickers. Every flow that opens one must have
a test-reachable alternative:

- The welcome screen has a text input where a path can be pasted — that is
  what tests use to set the game folder.
- The game folder can also come from `--game-dir=<path>` (CLI) or `GAME_DIR`
  in the `.env` file; both are test-reachable.

New features with dialogs follow the same rule: add the input/env path in the
same commit as the dialog.

## Isolation

- `POW_ENV_FILE=<path>` redirects where the app reads/writes its `.env`.
  Every spec points it at a file of its own under `_tmp/`, so tests never read
  or clobber the developer's real `.env`.
- `POW_SAVE_DIR=<path>` redirects where the app keeps its campaign saves.
  `e2e/launch.ts` points every launch at `_tmp/saves` (`SAVE_DIR`), because
  the app's own default is `saves/` at the root of the checkout — a developer's
  real campaign, which a run would autosave over at the end of every mission
  it plays.
- The real game installation is resolved by `e2e/launch.ts` as
  `POW_GAME_DIR`, falling back to the repo's parent folder (this repo lives
  inside the game directory). Specs treat it as **read-only**.
- Fabricated game folders (for negative/CLI tests) and all other scratch state
  go under `_tmp/` or `os.tmpdir()`, and are wiped by the spec that made them.
- **A run clears what a LAUNCH wrote, at both ends** — `e2e/scratch.ts`, hung
  off `globalSetup` and `globalTeardown` in `playwright.config.ts`, removes
  `_tmp/saves` and `_tmp/profile`. Before as well as after, because a killed
  run and a hand-driven single spec both leave state with no teardown to
  collect it. It does NOT touch `_tmp/` itself: that is the project's scratch
  space and most of what is in it was put there on purpose. The phase chain's
  `.env` is left alone too — it is the handover between phases, and keeping it
  is what lets a later phase run warm on its own.

## Running

```bash
npm run test:unit     # unit/ and unit/weapons/ — no game, no window, seconds
npm run test:weapons  # just the per-class weapons suite
npm run test:e2e      # boundaries + build + e2e/, against your own installation
npm run test:all      # everything, unit first
```

**`npx playwright test` on its own does NOT build**, and `e2e/launch.ts`
starts `out/main/index.js` — the bundle, not your sources. So a run after an
edit tests the app as it was at the last build, silently. It cost a whole
wrong conclusion once: a fix was backed out to check the spec would fail, the
spec passed, and the reason was that the binary under it still had the fix in.
Run `npm run build` first, or use `npm run test:e2e`, which does.

**`_tmp/saves` USED to outlive a run**, and it is worth knowing what that cost
because the shape recurs. The campaign specs write real saves into it, so
running one spec on its own left state the next full phase read: `load.spec.ts`
sorts first in `e2e/001` and asserts a campaign at `0/26`, while a mapchain
spec run alone earlier had walked that same team to position 1 — so a run
failed on a spec nobody had touched, pointing at LOAD GAME rather than at the
leftover. `e2e/scratch.ts` clears it now (Isolation, above). **State that
outlives a run is a spec's own junk**: whatever a new spec writes outside its
own process belongs in the same place, not in a comment telling the next
person to delete it by hand.
