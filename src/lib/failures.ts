// The kinds of failure, and what a report of one says (.claude/rules/failures.md).
//
// `lib/` has no reporter: it has no I/O and no person to tell, so a catch in it
// hands the error on, by a throw or a returned value, or is marked `not a
// failure: <why>`. The two reporters that say it are the renderer's
// (renderer/src/failures/report.ts) and the main process's (main/failures.ts);
// these are the words and the classes they share.

/** The app saying no by one of its own rules, worded for the person to act on.
 * Shown like a failure, logged as a refusal, and expected by name in a test. */
export class Refusal extends Error {
  override name = 'Refusal'
}

/** A place still to be decided: it fails loudly until it has a class and a
 * message of its own. `npm run catches` counts them, and the count only goes
 * down. */
export class UnknownFailure extends Error {
  override name = 'UnknownFailure'

  constructor(what: string, cause: unknown) {
    super(`${what}: ${describeError(cause)}`, { cause })
  }
}

/** What went wrong, in the words the error itself has. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export enum ReportKind {
  Failure = 'failure',
  Refusal = 'refusal'
}

/** One report: plain data, because the main process's cross to the page. */
export interface FailureReport {
  kind: ReportKind
  /** What was being done, then what went wrong. */
  text: string
}

export function reportOf(what: string, error: unknown): FailureReport {
  return {
    kind: error instanceof Refusal ? ReportKind.Refusal : ReportKind.Failure,
    text: `${what}: ${describeError(error)}`
  }
}

/** A report as one line, the same in the session log and the console. A spec
 * expects a failure by this text. */
export const lineOf = (report: FailureReport): string => `[${report.kind}] ${report.text}`
