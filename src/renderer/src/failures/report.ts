// The RENDERER's one reporter (.claude/rules/failures.md).
//
// A report goes on the screen (./strip.ts), into the session log, and into the
// console: `console.error` for a failure, which `e2e/launch.ts` collects and a
// spec fails on, `console.info` for a refusal.

import { ReportKind, lineOf, reportOf } from '../../../lib/failures'
import type { FailureReport } from '../../../lib/failures'
import { showOnStrip } from './strip'

/** The most `telemetry:log` takes as one line (main/ipc.ts). */
const LOG_LINE = 512

function say(report: FailureReport): void {
  showOnStrip(report)
  if (report.kind === ReportKind.Refusal) console.info(lineOf(report))
  else console.error(lineOf(report))
}

/** Say that doing `what` went wrong. */
export function reportFailure(what: string, error: unknown): void {
  const report = reportOf(what, error)
  window.api.logTelemetry(lineOf(report).slice(0, LOG_LINE))
  say(report)
}

/** What no catch took. The console and the harness have it already, as an
 * uncaught error; this gives it to the person and the log. */
function uncaught(error: unknown): void {
  const report = reportOf('uncaught', error)
  window.api.logTelemetry(lineOf(report).slice(0, LOG_LINE))
  showOnStrip(report)
}

/** Hear what the main process reports (it logged it itself), and what nothing
 * caught here. */
export function watchFailures(): void {
  window.api.onFailure(say)
  window.addEventListener('error', (event) => {
    // No error object is the browser's own notice (a ResizeObserver loop, say),
    // not a throw.
    if (event.error !== null && event.error !== undefined) uncaught(event.error)
  })
  window.addEventListener('unhandledrejection', (event) => uncaught(event.reason))
}
