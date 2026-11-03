// THE ACTION STREAM: every gesture a spec waits on, from the moment it starts
// to the one end it has — done, refused or failed — with its time
// (.claude/rules/testing.md). One stream, and whoever needs an end reads it
// off here: a spec waits for its own action's end rather than guessing at a
// side effect with a timeout.
//
// Only the gestures are wrapped; the work inside them stays as it is.

import { Subject, filter, firstValueFrom, takeUntil, timer } from 'rxjs'

/** Every action there is. A name is what a budget overrun and a spec's
 * failure report say. */
export enum ActionName {
  /** A battle opened straight onto a map, past the menus (`pow.open`). */
  OpenBattle = 'openBattle'
}

export enum ActionOutcome {
  Done = 'done',
  /** One of the app's own rules said no — a map with no markers, say. */
  Refused = 'refused',
  Failed = 'failed'
}

export interface ActionEnd {
  id: number
  name: ActionName
  outcome: ActionOutcome
  /** Why it was refused or failed; null when it was done. */
  reason: string | null
  /** From the start of the gesture to its end, on the renderer's clock. */
  ms: number
}

/** What the work inside an action answers: done, or the refusal's words. */
export type ActionResult = { done: true } | { done: false; refusal: string }

const ends = new Subject<ActionEnd>()

/** The stream itself — every end, as it happens. */
export const actionEnds = ends.asObservable()

let nextId = 0

/**
 * Run `work` as the action `name`, and resolve with its end.
 *
 * `budgetMs` is how long the person is expected to wait. Going over it is a
 * failure REPORT naming the action — `console.error`, which fails the spec
 * that is running — and the work is not cut off: the person still gets it.
 */
export const runAction = (
  name: ActionName,
  budgetMs: number,
  work: () => Promise<ActionResult>
): Promise<ActionEnd> => {
  const id = nextId++
  const started = performance.now()
  const ended = firstValueFrom(actionEnds.pipe(filter((end) => end.id === id)))
  timer(budgetMs)
    .pipe(takeUntil(ended))
    .subscribe(() => console.error(`${name} is over its ${budgetMs} ms budget`))
  const end = (outcome: ActionOutcome, reason: string | null): void =>
    ends.next({ id, name, outcome, reason, ms: Math.round(performance.now() - started) })
  work().then(
    (result) =>
      result.done
        ? end(ActionOutcome.Done, null)
        : end(ActionOutcome.Refused, result.refusal),
    // Handed on as a value: the end carries the error to whoever waits on it.
    (error: unknown) =>
      end(ActionOutcome.Failed, error instanceof Error ? error.message : String(error))
  )
  return ended
}
