// Does any domain reach into another one it must not?
//
// TypeScript will not answer this: it checks types, not who takes what from
// whom. Everything below was TRUE at some point in this repo and none of it was
// a compile error — the graphics played every sound in the game, the input
// layer was typed against the renderer, and the rules read the mesh to find out
// how tall a pig was.
//
// Run: `npm run boundaries`. It exits non-zero on the first offence and names
// the line, so the build fails rather than the split quietly rotting.

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

let broken = 0
for (const rule of RULES) {
  const root = join(SRC, rule.dir)
  for (const file of files(root)) {
    const source = readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(IMPORT)) {
      const banned = rule.banned.find((pattern) => pattern.test(specifier))
      if (!banned) continue
      // Which LINE, so the message is somewhere to go rather than a scolding.
      const line = source.slice(0, source.indexOf(specifier)).split('\n').length
      const where = relative(process.cwd(), file).replace(/\\/g, '/')
      console.error(`${where}:${line}  imports '${specifier}'`)
      console.error(`  src/${rule.dir} may not: ${rule.why}\n`)
      broken++
    }
  }
}

if (broken > 0) {
  console.error(`${broken} boundary ${broken === 1 ? 'breach' : 'breaches'}.`)
  process.exit(1)
}
console.log(`boundaries clean — ${RULES.length} domains checked`)
