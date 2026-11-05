# Failures that are said, and tests that wait on actions

The shared working rules `.claude/rules/failures.md` and
`.claude/rules/testing.md` (fleet v1.2.0) ask for what the remake does not
have yet:

- **Failures.** The reporters, the guard over every catch and every `{ ok:
  false }` path are done, and the first `Refusal`s are in
  ([../facts/failures.md](../facts/failures.md)). What is left of the shared
  `failures-pass` skill's second pass is the kinds as runs show them: a new
  failure a run hits gets a class and a message of its own, and a `Refusal` where
  the remake says no by its own rules. The guard does not see an `{ ok: false }`
  answer, so a new path that takes one has to be written to the rule by hand.
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

Order: the harness first, since the tests fail on what the reporters say; then
actions, gesture by gesture, with the specs that use them.
