// The MAIN PROCESS's one reporter (.claude/rules/failures.md).
//
// A report goes to the session log and to stderr, and crosses to the page,
// whose reporter puts it on the screen and into `console.error`, where a spec
// fails on it (renderer/src/failures/report.ts).

import type { WebContents } from 'electron'

import { ReportKind, lineOf, reportOf } from '../lib/failures'
import type { FailureReport } from '../lib/failures'
import { logTelemetry } from './telemetry'

/** The page that said it is listening, once one has. */
let page: WebContents | null = null
/** What was reported before it did. */
const waiting: FailureReport[] = []

const toPage = (report: FailureReport): void => {
  if (page !== null && !page.isDestroyed()) page.send('failure:report', report)
  else waiting.push(report)
}

/** Say that doing `what` went wrong. */
export function reportFailure(what: string, error: unknown): void {
  const report = reportOf(what, error)
  const line = lineOf(report)
  logTelemetry(line)
  if (report.kind === ReportKind.Refusal) console.info(line)
  else console.error(line)
  toPage(report)
}

/** The page is up: it hears everything from here on, and what it missed. */
export function listenForFailures(contents: WebContents): void {
  page = contents
  for (const report of waiting.splice(0)) toPage(report)
}

/** A rejection nobody was waiting on is a failure nobody would hear of. An
 * uncaught throw needs nothing here: Electron puts up its own dialog. */
export function watchFailures(): void {
  process.on('unhandledRejection', (reason) => {
    reportFailure('a promise nobody was waiting on', reason)
  })
}
