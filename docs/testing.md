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
  the main menu wearing the original frontend art (New Game → the battle,
  Asset Viewer → the phase-000 browsers, Exit → quits). `002/` is the first
  battle slice: the Game domain model (players, squads, turn rotation —
  pinned by a pure-logic spec that runs with no Electron at all) and the
  battle scene New Game opens: squads spawned on standable CAMP ground, the
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
- Every test asserts `expect(launched.errors).toEqual([])` at the end (and
  after any step it suspects). `toEqual([])` rather than a length check, so a
  failure prints the actual error messages.
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

## Running

```bash
npm run test:e2e   # electron-vite build + playwright test
```
