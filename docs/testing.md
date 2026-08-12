# E2E testing spec

Conventions for the Playwright end-to-end suite, borrowed from the
`homm5-editor` project. Read this before writing a spec.

## Phased specs

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
  battle slice: the Game domain model (players, squads, turn rotation —
  pinned by a pure-logic spec that runs with no Electron at all) and the
  battle scene ONE PLAYER opens: squads spawned on standable CAMP ground, the
  original's turn clock (auto end-of-turn on expiry), tank controls — W/S
  walk, A/D turn, Space jumps ballistically — swimming and slope-sliding per
  the tile data, and a chase camera behind the acting pig's back.
- Specs at the `e2e/` root without a number (`cli-game-dir.spec.ts`) are
  standalone utilities: they build their own sandbox and must not depend on
  any phase.

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
and reads the screen back through `window.pow.menu` — `startGame(page)` is
what every battle spec opens with.

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
- The real game installation is resolved by `e2e/launch.ts` as
  `POW_GAME_DIR`, falling back to the repo's parent folder (this repo lives
  inside the game directory). Specs treat it as **read-only**.
- Fabricated game folders (for negative/CLI tests) and all other scratch state
  go under `_tmp/` or `os.tmpdir()`, and are wiped by the spec that made them.

## Two halves: with the game's files, and without — `@nodata`

**Most of this suite cannot run anywhere but here.** It drives the app against
a real installation of the original, which is the whole point of it: the specs
assert against the game's own maps, models and text rather than against
fixtures somebody wrote to match the code.

The other half never touches either. The engine is pure (`src/lib/game/`) —
parsed data in, numbers out — so a spec can build a battle, step it and assert
what happened with no window open and no game on disk. **Those tests carry the
tag `@nodata`**, one per test, and that tag is what a build server runs:

```ts
test('a low object is a step onto, not a wall', { tag: '@nodata' }, () => {
```

```bash
npm run test:nodata   # playwright test --grep @nodata
npm run nodata        # …and whether that tag is still telling the truth
```

**The tag is a claim, and `npm run nodata` holds it to the file.** A spec that
takes the `app` fixture or names `GAME_DIR` can reach the install; one that
does neither cannot. So a tagged test in the first kind is an error — CI would
fail on it for a confusing reason — and an untagged test in the second kind is
an error too, because it is coverage a build server could have had and did not.
Both are named by `scripts/nodata-check.mjs`, which is run in CI ahead of the
tests themselves. Write a new engine spec and the check will ask for the tag.

## Running

```bash
npm run test:e2e     # electron-vite build + the WHOLE suite, needs the game
npm run test:nodata  # only the half that needs nothing
```
