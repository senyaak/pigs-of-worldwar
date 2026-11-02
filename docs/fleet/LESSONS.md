# Fleet lessons — this project

Problems this fleet's process ran into, and the rule change that fixed each.
Agents report them as `fleet-process` issues. A fix that every fleet needs is
made in `senyaak/claude-fleet` and recorded in its shared lessons
([../../.claude/fleet/lessons.md](../../.claude/fleet/lessons.md), F1–F27, which
also carry the pcktor fleet's L1–L42); a fix that is this project's own goes
into [project.md](project.md) and gets a line here. A flaw found in one of the
repo's own rules along the way is fixed in that rule and not recorded here.
One line per lesson, newest at the top; numbers are never reused, because
issues cite them.

| # | Problem | Fix | Where |
| - | ------- | --- | ----- |
| L8 | The merger's steps deleted the branch before confirming GitHub had marked the PR merged; `in-progress` stayed on the closed issue. | Shared since fleet v1.0.0. | shared F22 |
| L7 | The reviewer had no line between blocking and non-blocking, no rule for a PR back after a verdict, and an approval left no record of what was checked. | Shared since fleet v1.0.0. | shared F21 |
| L6 | The planner cut one work-list item into two issues and found no rule for the item's file in between (#1, #2). | Shared since fleet v1.0.0. | shared F20; `project.md` § Work list |
| L5 | Shell traps cost the first run's agents several retries: Git Bash mangles `git show <rev>:<path>`, `gh issue view --comments` printed nothing, `gh pr view --json` has no `merged`, and re-measuring an index had no sanctioned way to run the repo's TS readers. | Written down with the workaround for each, and where a one-off measurement goes. | `project.md` § Traps; the `gh` ones shared in `.claude/fleet/workflow.md` § Commands and waiting |
| L4 | In one slot a unit run beside an e2e run pulled `_tmp/saves` from under the app and failed on the profile (`e2e/scratch.ts` runs for every project); a phase-002 spec run alone failed for want of the `.env` that `e2e/000/foundation.spec.ts` writes (#4). | Unit and e2e one after the other in a slot; foundation first in any e2e list. | `project.md` § Verify |
| L3 | Found before the start, by a review of a sibling fleet: five slots running Electron e2e at once would starve each other into false reds against the suite's short timeouts. | `npm run e2e:locked`, one machine-wide lock in the game folder; tested under contention. | `project.md` § Verify; shared F19 |
| L2 | Found before the start: only `Bash(...)` was pre-allowed, sessions sit in `pow-fleet-<n>` while the notes and the exe are one level up, and PowerShell or a plain `cd`/`ls` would each stop a session on a prompt. | Each slot gets its own `.claude/settings.local.json` from `fleet-slots.sh`: the game folder as a working directory and a broad Bash list; the roles use Bash only. | `scripts/fleet-slots.sh`, `project.md` § Slots; shared F3 |
| L1 | Found before the start: the claim's "wait 60 seconds" cannot be a `sleep`, which the desktop app refuses. | Shared since fleet v1.0.0. | shared F18 |
