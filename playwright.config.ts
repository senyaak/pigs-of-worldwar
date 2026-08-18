import { defineConfig } from '@playwright/test'

// Fail-fast suite (docs/testing.md): short assertion timeout, serial order —
// numbered specs are phases that build on one another.
//
// TWO SUITES, and which folder a spec is in IS the split:
//
//   unit/  the engine, stepped directly. No window, no Electron, no game
//          installed — parsed data in, numbers out. This is what a build
//          server runs (.github/workflows/ci.yml).
//   e2e/   the app, driven against a REAL installation of the original. It
//          launches, it reads the player's own Maps/ and Chars/, and it can
//          only run on a machine that has the game.
//
// `npm run test:unit` and `npm run test:e2e` pick one; a bare `playwright test`
// runs both, unit first. `npm run boundaries` is what keeps the split honest —
// a unit spec may not import out of `e2e/`, and a spec that needs neither the
// app nor the game's files does not belong in `e2e/`.
//
// A RUN CLEANS UP AFTER ITSELF, at both ends. `e2e/scratch.ts` removes the
// save slots and the Electron profile a launched app writes — before, because
// a killed run or a hand-driven single spec leaves state with no teardown to
// collect it, and after, so the tree is left as it was found. It never touches
// `_tmp/` itself: that folder is the project's scratch space and most of what
// is in it was put there on purpose.
export default defineConfig({
  globalSetup: './e2e/scratch.ts',
  globalTeardown: './e2e/scratch.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  fullyParallel: false,
  projects: [
    { name: 'unit', testDir: './unit' },
    { name: 'e2e', testDir: './e2e' }
  ]
})
