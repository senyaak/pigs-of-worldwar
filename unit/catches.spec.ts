// The guard over the catches (`npm run catches`), run as CI runs it, against
// fixtures. The three outcomes and the count that only goes down are
// .claude/rules/failures.md, "Every catch is one of three" and "Not known yet".

import { expect, test } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

interface Run {
  status: number | null
  out: string
  err: string
}

/** The guard over one file holding `source`, with `ceiling` UnknownFailures allowed. */
function guard(source: string, ceiling = 0): Run {
  const dir = mkdtempSync(path.join(tmpdir(), 'pow-catches-'))
  try {
    writeFileSync(path.join(dir, 'one.ts'), source)
    const run = spawnSync(process.execPath, ['scripts/catches.mjs', dir, String(ceiling)], {
      encoding: 'utf8'
    })
    return { status: run.status, out: run.stdout, err: run.stderr }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const passes = (name: string, source: string, summary: string): void => {
  test(`passes ${name}`, { tag: '@nodata' }, () => {
    const run = guard(source)
    expect(run.err).toBe('')
    expect(run.status).toBe(0)
    expect(run.out).toContain(summary)
  })
}

const fails = (name: string, source: string): void => {
  test(`fails ${name}`, { tag: '@nodata' }, () => {
    const run = guard(source)
    expect(run.status).toBe(1)
    expect(run.err).toContain('one.ts:1')
  })
}

passes('a rethrow', 'try { a() } catch (e) { throw e }', '1 hand on, 0 report, 0 marked')
passes('a wrapped throw', 'try { a() } catch { throw new Error("x") }', '1 hand on')
passes('a reject', 'new Promise((_, reject) => { try { a() } catch (e) { reject(e) } })', '1 hand on')
passes('the error returned as a value', 'try { a() } catch (e) { return fail("x", e) }', '1 hand on')
passes('a handler the caller gave', 'try { a() } catch (e) { onError("x", e) }', '1 hand on')
passes('a promise catch that rethrows', 'a().catch((e) => { throw e })', '1 hand on')
passes('a promise catch given the reject itself', 'a().catch(reject)', '1 hand on')
passes('a report', 'try { a() } catch (e) { reportFailure("x", e) }', '0 hand on, 1 report')
passes('a promise catch that reports', 'a().catch((e) => reportFailure("x", e))', '1 report')
passes('the marker', 'try { a() } catch { /* not a failure: a probe */ }', '1 marked')
passes('the marker on a line comment', 'try { a() } catch {\n// not a failure: a probe\n}', '1 marked')

// What must not be taken for a catch at all.
passes('the word in a comment', '// we catch (e) { nothing } here', '0 hand on, 0 report, 0 marked')
passes('the word in a string', 'const s = "try { a() } catch (e) { }"', '0 hand on, 0 report, 0 marked')
passes('the word in a template', 'const s = `catch (e) { }`', '0 hand on, 0 report, 0 marked')
passes('the word after a regex holding a quote', 'const r = /["\']/\nconst s = "catch {}"', '0 hand on')

fails('an empty catch', 'try { a() } catch { }')
fails('a swallowed error', 'try { a() } catch (e) { b = null }')
fails('a catch that only warns', 'try { a() } catch (e) { console.warn(String(e)) }')
fails('a catch that only logs an error', 'try { a() } catch (e) { console.error(e) }')
fails('a return that drops the error', 'try { a() } catch (e) { return null }')
fails('a marker with no reason', 'try { a() } catch { /* not a failure: */ }')
fails('a marker outside the handler', '/* not a failure: outside */ try { a() } catch { }')
fails('a promise catch that swallows', 'a().catch(() => {})')
fails('a promise catch that only warns', 'a().catch((e) => console.warn(e))')

test('a catch inside a template expression is still found', { tag: '@nodata' }, () => {
  const run = guard('const s = `${(() => { try { a() } catch { } })()}`')
  expect(run.status).toBe(1)
})

test('every offending catch is named with its line', { tag: '@nodata' }, () => {
  const run = guard('try { a() } catch { }\nb()\ntry { c() } catch { }\n')
  expect(run.err).toContain('one.ts:1')
  expect(run.err).toContain('one.ts:3')
})

test('an UnknownFailure over the ceiling fails', { tag: '@nodata' }, () => {
  const run = guard('try { a() } catch (e) { throw new UnknownFailure("x", e) }', 0)
  expect(run.status).toBe(1)
  expect(run.err).toContain('over the ceiling')
})

test('an UnknownFailure at the ceiling passes and is counted', { tag: '@nodata' }, () => {
  const run = guard('try { a() } catch (e) { throw new UnknownFailure("x", e) }', 1)
  expect(run.status).toBe(0)
  expect(run.out).toContain('1 new UnknownFailure')
})

test('under the ceiling fails until the ceiling is lowered', { tag: '@nodata' }, () => {
  const run = guard('const a = 1', 1)
  expect(run.status).toBe(1)
  expect(run.err).toContain('lower CEILING')
})
