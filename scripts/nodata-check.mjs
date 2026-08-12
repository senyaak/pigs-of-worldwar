// Is the @nodata split still true?
//
// A test tagged `@nodata` claims it needs NO installed copy of the game — no
// window, no `Maps/`, no `Chars/` — and that claim is what a build server runs
// (`npm run test:nodata`, .github/workflows/ci.yml). The tag is written by hand,
// one per test, because only the author knows what a test really touches.
//
// What a machine CAN check is that the claim and the file agree, and it checks
// it both ways round:
//
//   - a tagged test in a spec that takes the `app` fixture or names `GAME_DIR`
//     is WRONG, and would fail on a runner that has neither. Hard error.
//   - an UNTAGGED test in a spec that does neither is a test CI is not running
//     for no reason — the silent half, and the one worth a script. Also an
//     error: tag it, or make the spec say why it is not asset-free.
//
// Run: `npm run nodata`. It names every offender rather than the first.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const E2E = resolve(process.cwd(), 'e2e')
const TAG = '@nodata'

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

/**
 * Does this spec need the real thing? Two markers, and they are the two ways a
 * spec can reach it: the `app` fixture is the running application, and
 * `GAME_DIR` is the installation on disk. A spec that names neither cannot get
 * at either.
 */
const needsTheInstall = (source) =>
  /from '(\.\.\/)+app'/.test(source) || source.includes('GAME_DIR')

const problems = []
let tagged = 0
let checked = 0

for (const file of specs(E2E)) {
  const source = readFileSync(file, 'utf8')
  const where = relative(process.cwd(), file).replaceAll('\\', '/')
  const heavy = needsTheInstall(source)
  checked++

  for (const [index, line] of source.split('\n').entries()) {
    if (!/^test[.(]/.test(line)) continue
    const isTagged = line.includes(TAG)
    if (isTagged) tagged++
    if (heavy && isTagged) {
      problems.push(`${where}:${index + 1} tagged ${TAG}, but this spec needs the app or the game's files`)
    }
    if (!heavy && !isTagged) {
      problems.push(`${where}:${index + 1} needs neither the app nor the game's files — tag it ${TAG}`)
    }
  }
}

if (problems.length) {
  console.error(`${TAG} is out of step in ${problems.length} place(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(`\nThe tag is what CI runs. Either claim is fine — but the file has to agree with it.`)
  process.exit(1)
}

console.log(`${TAG} clean — ${tagged} tests across ${checked} specs, and every claim matches its file`)
