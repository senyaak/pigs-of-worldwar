# Failures that are said, and tests that wait on actions

The shared working rules `.claude/rules/failures.md` and
`.claude/rules/testing.md` (fleet v1.2.0) ask for what the remake does not
have yet:

- **Failures.** `src/` holds 61 `catch` blocks (counted 2026-11-02 with
  `grep -rn "catch\s*[({]" src --include=*.ts`). Each must hand the error on,
  report it through its layer's one reporter, or be marked `not a failure:
  <why>`; a guard over every catch keeps it so. The layers here are the
  renderer, the main process and `lib/`, which has no I/O of its own. The
  procedure is the shared `failures-pass` skill: first mechanically,
  `UnknownFailure` where the kind is not clear, then the kinds as runs show
  them — a `Refusal` where the game says no by its own rules.
- **Tests that fail at once.** `e2e/launch.ts` already collects the renderer's
  uncaught errors and `console.error` into `errors`; a spec reads them at its
  end. The rule wants the first unexpected report to end the test with that
  report as the reason, and the main process's failures watched the same way.
- **Actions.** Every gesture a spec touches (a menu bar, a key the controller
  takes, a shot) runs as an action with an end — done, refused or failed —
  and a budget, on one stream the spec waits on instead of a guessed timeout.
  The stream exists (`src/renderer/src/actions/actions.ts`, RxJS) with one
  action on it, opening a battle (`pow.open`); the gestures are still to
  move onto it, each with the specs that wait on it.

Order: the failure reporters and the catch guard first, since the tests fail
on what they report; then the harness; then actions, gesture by gesture, with
the specs that use them.
