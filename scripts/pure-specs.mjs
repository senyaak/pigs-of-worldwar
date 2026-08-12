// The specs that can run with NO game installed and no window open.
//
// The suite is written against the real installation on purpose (docs/testing.md):
// most of it launches the app and reads the player's own `Maps/`, which a build
// server has neither of. But a good half of `e2e/002/` is the ENGINE tested
// directly — pure functions in, numbers out — and that half is exactly what a
// CI machine can hold us to.
//
// The list is COMPUTED rather than kept, because a kept one drifts: a spec is
// pure when its source neither takes the `app` fixture nor names `GAME_DIR`.
// Write a new pure spec and it joins the run by itself; make an existing one
// read a map and it drops out on the same rule.
//
//   node scripts/pure-specs.mjs           run them
//   node scripts/pure-specs.mjs --list    just say which

import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const E2E = resolve(process.cwd(), 'e2e')

/** Every `*.spec.ts` under e2e/, at any depth. */
function specs(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) found.push(...specs(full))
    else if (entry.endsWith('.spec.ts')) found.push(full)
  }
  return found
}

/** Needs the app running, or the game's own files, or both. */
function needsTheInstall(file) {
  const source = readFileSync(file, 'utf8')
  return /from '(\.\.\/)+app'/.test(source) || source.includes('GAME_DIR')
}

const pure = specs(E2E)
  .filter((file) => !needsTheInstall(file))
  .map((file) => relative(process.cwd(), file).replaceAll('\\', '/'))
  .sort()

if (process.argv.includes('--list')) {
  for (const file of pure) console.log(file)
  process.exit(0)
}

if (!pure.length) {
  console.error('no pure specs found — has e2e/ moved?')
  process.exit(1)
}

console.log(`running ${pure.length} pure specs (no game install needed)`)
const run = spawnSync('npx', ['playwright', 'test', ...pure], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
process.exit(run.status ?? 1)
