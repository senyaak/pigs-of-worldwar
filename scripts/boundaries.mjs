// Does any domain reach into another one it must not?
//
// TypeScript will not answer this: it checks types, not who takes what from
// whom. Everything below was TRUE at some point in this repo and none of it was
// a compile error — the graphics played every sound in the game, the input
// layer was typed against the renderer, and the rules read the mesh to find out
// how tall a pig was.
//
// It answers a second question too, about the SUITE: does every test still live
// where its kind belongs? `unit/` is the engine with no game and no window and
// is what a build server runs; `e2e/` drives the real installation. Both halves
// of that are below, under "THE TEST FOLDERS".
//
// Run: `npm run boundaries`. It names every offence and the line it is on, so
// the build fails rather than a split quietly rotting.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

/**
 * One rule per domain: files under `dir` may not import anything matching
 * `banned`. `why` is printed on a breach, because a rule nobody understands
 * gets deleted the first time it is inconvenient.
 */
const RULES = [
  {
    dir: 'lib',
    banned: [/^three$/, /^electron$/, /\/renderer\//, /^\.\.\/\.\.\/renderer/],
    why: 'the rules are the ENGINE: no renderer, no Electron, no three.js. A headless battle has to be able to run this.'
  },
  {
    dir: 'renderer/src/three',
    banned: [/\/ui\//, /^\.\.\/ui\//, /^\.\.\/audio\//],
    why: 'graphics draws and nothing else. Sound is its own listener on the battle bus, and the dashboard shares only contracts/overlay.ts — which imports nobody.'
  },
  {
    dir: 'renderer/src/audio',
    banned: [/^\.\.\/three\//, /^\.\.\/ui\//, /^three$/],
    why: 'sound is its own domain: it listens to lib/game/events.ts and knows nothing about what is drawn.'
  },
  {
    dir: 'renderer/src/input',
    banned: [/^\.\.\/three\//, /^\.\.\/audio\//, /^three$/],
    why: 'input drives the ENGINE. A control that reaches for the renderer or plays a sound is in the wrong domain.'
  },
  {
    dir: 'lib/formats',
    banned: [/\/game\//, /^\.\.\/game\//],
    why: 'a format reader takes bytes and gives structures. It cannot know the rules.'
  },
  {
    dir: 'main',
    banned: [/^three$/, /\/renderer\//],
    why: 'the main process has no scene and no DOM.'
  }
]

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) yield path
  }
}

/** Repo-relative and forward-slashed, so the message is clickable. */
const pathOf = (file) => relative(process.cwd(), file).replace(/\\/g, '/')

let broken = 0
const fault = (where, what, why) => {
  console.error(`${where}  ${what}`)
  console.error(`  ${why}\n`)
  broken++
}

for (const rule of RULES) {
  const root = join(SRC, rule.dir)
  for (const file of files(root)) {
    const source = readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(IMPORT)) {
      const banned = rule.banned.find((pattern) => pattern.test(specifier))
      if (!banned) continue
      // Which LINE, so the message is somewhere to go rather than a scolding.
      const line = source.slice(0, source.indexOf(specifier)).split('\n').length
      fault(`${pathOf(file)}:${line}`, `imports '${specifier}'`, `src/${rule.dir} may not: ${rule.why}`)
    }
  }
}

// --------------------------------------------------------- THE TEST FOLDERS
//
// The suite is split in TWO ways on purpose, and the two have to agree:
//
//   - by FOLDER, which is what a run selects — `--project=unit` is the half a
//     build server can run at all, having no game installed
//     (playwright.config.ts);
//   - by TAG, which is what each test claims about itself — `@nodata` shows up
//     in the runner's own output and in `--grep`, so somebody reading one test
//     can see it without knowing the folder convention.
//
// Two ways of saying one thing are worth having only while they cannot drift.
// These four rules are what stops them.
const UNIT = resolve(process.cwd(), 'unit')
const E2E = resolve(process.cwd(), 'e2e')
const TAG = '@nodata'

/** Every `*.spec.ts` under a folder, at any depth. */
function* specsIn(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* specsIn(path)
    else if (entry.name.endsWith('.spec.ts')) yield path
  }
}

/**
 * Can this spec reach the real thing? Two markers, and they are the only two
 * doors: the `app` fixture IS the running application, and `GAME_DIR` (out of
 * `e2e/launch.ts`) is the installation on disk. A spec that names neither
 * cannot get at either, whatever folder it is sitting in.
 */
const needsTheInstall = (source) =>
  /from '(\.\.\/)+app'/.test(source) || source.includes('GAME_DIR')

/** A line that starts a test — `test(`, `test.skip(`, `test.describe(`. */
const startsATest = (line) => /^test[.(]/.test(line)

for (const file of specsIn(UNIT)) {
  const source = readFileSync(file, 'utf8')

  // 1. A unit spec may not reach into the e2e half — and that is not a matter
  //    of taste. `app` and `GAME_DIR` both live over there, so this import is
  //    the only door to the game, and keeping it shut is what makes "unit/
  //    needs no installation" a fact rather than a hope.
  for (const [, specifier] of source.matchAll(IMPORT)) {
    if (!/(^|\/)e2e\//.test(specifier)) continue
    const line = source.slice(0, source.indexOf(specifier)).split('\n').length
    fault(
      `${pathOf(file)}:${line}`,
      `imports '${specifier}'`,
      'unit/ runs with no game and no window; reaching into e2e/ is reaching for both.'
    )
  }

  // 2. …and every test in it says so for itself.
  source.split('\n').forEach((line, index) => {
    if (!startsATest(line) || line.includes(TAG)) return
    fault(
      `${pathOf(file)}:${index + 1}`,
      `is not tagged ${TAG}`,
      `every test under unit/ carries it, so --grep ${TAG} and --project=unit stay the same set.`
    )
  })
}

for (const file of specsIn(E2E)) {
  const source = readFileSync(file, 'utf8')

  // 3. A spec down here that cannot reach the game is coverage a build server
  //    could have had and silently does not. It belongs upstairs.
  if (!needsTheInstall(source) && /^test[.(]/m.test(source)) {
    fault(
      `${pathOf(file)}:1`,
      'needs neither the app nor the game files',
      'move it to unit/, where CI will actually run it.'
    )
  }

  // 4. …and nothing down here may claim otherwise: by rule 3 the file it sits
  //    in reaches the install, so the tag would be a lie the runner believes.
  source.split('\n').forEach((line, index) => {
    if (!startsATest(line) || !line.includes(TAG)) return
    fault(
      `${pathOf(file)}:${index + 1}`,
      `claims ${TAG} from inside e2e/`,
      'this spec drives the real installation. If the test truly needs neither, move it to unit/.'
    )
  })
}

if (broken > 0) {
  console.error(`${broken} ${broken === 1 ? 'breach' : 'breaches'}.`)
  process.exit(1)
}
console.log(`boundaries clean — ${RULES.length} domains, and the unit/e2e split holds`)
