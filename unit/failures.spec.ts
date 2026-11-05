// The kinds of failure and the words of a report (.claude/rules/failures.md,
// the shared rule these behaviours are built from). Pure: no window, no game.

import { expect, test } from '@playwright/test'

import {
  Refusal,
  ReportKind,
  UnknownFailure,
  describeError,
  lineOf,
  reportOf
} from '../src/lib/failures'

test('a report says what was being done, then what went wrong', { tag: '@nodata' }, () => {
  expect(reportOf('reading the save A', new Error('EISDIR'))).toEqual({
    kind: ReportKind.Failure,
    text: 'reading the save A: EISDIR'
  })
})

test('what a catch got need not be an Error', { tag: '@nodata' }, () => {
  expect(describeError('a string')).toBe('a string')
  expect(reportOf('listing the saves', 'saves: EACCES').text).toBe('listing the saves: saves: EACCES')
})

// failures.md, "A refusal is not a failure": shown like one, logged as a refusal.
test('a Refusal is reported as a refusal, not as a failure', { tag: '@nodata' }, () => {
  const report = reportOf('naming the team', new Refusal('That name is taken'))
  expect(report.kind).toBe(ReportKind.Refusal)
  expect(report.text).toBe('naming the team: That name is taken')
  expect(lineOf(report)).toBe('[refusal] naming the team: That name is taken')
})

test('a failure and a refusal say which they are on their one line', { tag: '@nodata' }, () => {
  expect(lineOf(reportOf('x', new Error('y')))).toBe('[failure] x: y')
})

// failures.md, "throw new UnknownFailure(what, e)".
test('an UnknownFailure keeps what was being done and its cause', { tag: '@nodata' }, () => {
  const cause = new Error('bad bytes')
  const failure = new UnknownFailure('reading the map', cause)
  expect(failure.message).toBe('reading the map: bad bytes')
  expect(failure.cause).toBe(cause)
  expect(failure.name).toBe('UnknownFailure')
  expect(reportOf('opening', failure).kind).toBe(ReportKind.Failure)
})
