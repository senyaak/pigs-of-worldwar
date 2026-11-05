// Does every catch say what became of the error (.claude/rules/failures.md)?
//
//   node scripts/catches.mjs [root] [ceiling]
//
// A catch hands the error on, reports it through its layer's reporter, or is
// marked `not a failure: <why>` by a comment inside the handler. This names
// every catch that does none of them, and counts the `new UnknownFailure`s
// against CEILING. `root` and `ceiling` are for unit/catches.spec.ts.
//
// TypeScript 7 ships no parser to a script, so strings, comments and regex
// literals are blanked first and the catches are found in what is left.

import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/** How many `new UnknownFailure`s src/ may hold. It only goes down: a change
 * that sorts one out lowers it in the same commit. */
const CEILING = 0

const root = resolve(process.cwd(), process.argv[2] ?? 'src')
const ceiling = process.argv[3] === undefined ? CEILING : Number(process.argv[3])

const WORD_BEFORE_REGEX = /\b(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/

/**
 * The source with every string, comment and regex body replaced by spaces, so
 * offsets and line numbers still hold, and the comments as `{ at, text }`.
 * A template literal's `${…}` stays code.
 */
function blank(source) {
  const out = source.split('')
  const comments = []
  const clear = (from, to) => {
    for (let at = from; at < to; at++) if (out[at] !== '\n') out[at] = ' '
  }
  /** Brace depth of each template's open `${`, innermost last. */
  const templates = []
  let depth = 0
  let at = 0

  const template = () => {
    const from = at
    while (at < source.length) {
      if (source[at] === '\\') at += 2
      else if (source[at] === '`') {
        at++
        clear(from, at)
        return
      } else if (source[at] === '$' && source[at + 1] === '{') {
        clear(from, at)
        at += 2
        templates.push(depth)
        depth++
        return
      } else at++
    }
    clear(from, at)
  }

  /** What the last code before `at` was decides whether a `/` opens a regex. */
  const regexCanStart = () => {
    let back = at - 1
    while (back >= 0 && /\s/.test(out[back])) back--
    if (back < 0) return true
    if (/[(,=:[!&|?{};+\-*%<>~^]/.test(out[back])) return true
    let start = back
    while (start > 0 && /\w/.test(out[start - 1])) start--
    return WORD_BEFORE_REGEX.test(out.slice(start, back + 1).join(''))
  }

  while (at < source.length) {
    const char = source[at]
    const next = source[at + 1]
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', at)
      const to = end < 0 ? source.length : end
      comments.push({ at, text: source.slice(at, to) })
      clear(at, to)
      at = to
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', at + 2)
      const to = end < 0 ? source.length : end + 2
      comments.push({ at, text: source.slice(at, to) })
      clear(at, to)
      at = to
    } else if (char === '"' || char === "'") {
      const from = at
      at++
      while (at < source.length && source[at] !== char && source[at] !== '\n') {
        at += source[at] === '\\' ? 2 : 1
      }
      at++
      clear(from, at)
    } else if (char === '`') {
      at++
      template()
    } else if (char === '/' && regexCanStart()) {
      const from = at
      at++
      let inClass = false
      while (at < source.length && source[at] !== '\n' && (inClass || source[at] !== '/')) {
        if (source[at] === '\\') at++
        else if (source[at] === '[') inClass = true
        else if (source[at] === ']') inClass = false
        at++
      }
      at++
      clear(from, at)
    } else {
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (templates.length > 0 && templates[templates.length - 1] === depth) {
          templates.pop()
          at++
          template()
          continue
        }
      }
      at++
    }
  }
  return { code: out.join(''), comments }
}

/** The offset just past the bracket that closes the one at `open`. */
function closing(code, open) {
  const pairs = { '{': '}', '(': ')' }
  const opener = code[open]
  const closer = pairs[opener]
  let depth = 0
  for (let at = open; at < code.length; at++) {
    if (code[at] === opener) depth++
    else if (code[at] === closer && --depth === 0) return at + 1
  }
  return code.length
}

/** Every catch in the blanked code: where it is, its binding, its handler. */
function catchesIn(code) {
  const found = []
  for (const match of code.matchAll(/(?<![.\w$])catch\s*(?:\(\s*([\w$]+)[^)]*\)\s*)?\{/g)) {
    const open = match.index + match[0].length - 1
    found.push({ at: match.index, binding: match[1] ?? null, from: open, to: closing(code, open) })
  }
  for (const match of code.matchAll(/\.catch\s*\(/g)) {
    const open = match.index + match[0].length - 1
    const to = closing(code, open)
    const inner = code.slice(open + 1, to - 1)
    const binding = /^\s*(?:async\s+)?\(?\s*([\w$]+)/.exec(inner)
    found.push({ at: match.index, binding: binding ? binding[1] : null, from: open, to })
  }
  return found.sort((a, b) => a.at - b.at)
}

/** `hands on`, `reports`, `marked`, or null for a catch that does none. */
function outcomeOf(one, code, comments) {
  const body = code.slice(one.from, one.to)
  if (/\bthrow\b/.test(body) || /\breject\s*\(/.test(body)) return 'hands on'
  if (one.binding !== null) {
    const name = one.binding.replace(/\$/g, '\\$')
    const uses = `[^;\\n]*\\b${name}\\b`
    // Returned or posted as a value, or given to the handler the caller gave.
    if (new RegExp(`\\breturn\\b${uses}`).test(body)) return 'hands on'
    if (new RegExp(`\\b(on[A-Z]\\w*|send|postMessage)\\s*\\(${uses}`).test(body)) return 'hands on'
    // `.catch(reject)` and `.catch(onError)`: the handler is the caller's.
    if (code[one.at] === '.' && /^(reject|on[A-Z]\w*)$/.test(one.binding)) return 'hands on'
  }
  if (/\breportFailure\s*\(/.test(body)) return 'reports'
  const marked = comments.some(
    ({ at, text }) => at >= one.from && at < one.to && /not a failure:\s*[^\s*]/.test(text)
  )
  return marked ? 'marked' : null
}

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* sources(path)
    else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) yield path
  }
}

const tally = { 'hands on': 0, reports: 0, marked: 0 }
let unknown = 0
let broken = 0

for (const file of sources(root)) {
  const source = readFileSync(file, 'utf8')
  const { code, comments } = blank(source)
  unknown += [...code.matchAll(/\bnew\s+UnknownFailure\s*\(/g)].length
  for (const one of catchesIn(code)) {
    const outcome = outcomeOf(one, code, comments)
    if (outcome !== null) {
      tally[outcome]++
      continue
    }
    const line = source.slice(0, one.at).split('\n').length
    const where = relative(process.cwd(), file).replace(/\\/g, '/')
    console.error(`${where}:${line}  a catch that neither hands on, reports nor says why it is none`)
    broken++
  }
}

if (broken > 0) {
  console.error('  Throw it, call reportFailure, or mark it `not a failure: <why>` (.claude/rules/failures.md).\n')
}
if (unknown > ceiling) {
  console.error(`${unknown} new UnknownFailure, over the ceiling of ${ceiling}: the count only goes down.`)
  broken++
}
if (unknown < ceiling) {
  console.error(`${unknown} new UnknownFailure under a ceiling of ${ceiling}: lower CEILING in scripts/catches.mjs.`)
  broken++
}

console.log(
  `catches: ${tally['hands on']} hand on, ${tally.reports} report, ${tally.marked} marked; ${unknown} new UnknownFailure`
)
process.exit(broken > 0 ? 1 : 0)
