# E2E testing spec

Conventions for the Playwright end-to-end suite, borrowed from the
`homm5-editor` project. Read this before writing a spec.

## Phased specs

Tests live in `e2e/` at the repo root. Specs whose names start with a number —
`000-first-run.spec.ts`, `001-….spec.ts`, … — are **phases**: they run in
order (the suite is serial, one worker), and each phase leaves the world in
the state the next phase starts from. A spec that creates something is written
before the spec that uses it.

- `000` is the foundation, all of it: every structural thing the engine needs
  before anything real happens — cold start with no saved state, pointing the
  app at the game, seeing its files, opening archives. The app's features
  don't care about any of this, which is exactly why it is all phase zero.
- Numbers from `001` up are engine milestones — things a player could point
  at. `001` is the first rendered scene.
- Specs without a number prefix (`cli-game-dir.spec.ts`) are standalone
  utilities: they build their own sandbox and must not depend on any phase.

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
