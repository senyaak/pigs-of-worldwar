import { defineConfig } from '@playwright/test'

// Fail-fast suite (docs/testing.md): short assertion timeout, serial order —
// numbered specs are phases that build on one another.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  workers: 1,
  fullyParallel: false
})
