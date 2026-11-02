# Fleet lessons

Problems the fleet's PROCESS ran into, and the rule change that fixed each.
Agents report them as `fleet-process` issues; the orchestrator changes the
roles and adds a line here. A flaw found in one of the repo's own rules along
the way is fixed in that rule and not recorded here. One line per lesson,
newest at the top; numbers are never reused, because issues cite them.

## This fleet

| # | Problem | Fix | Where |
| - | ------- | --- | ----- |
| L8 | The merger's steps deleted the branch before confirming GitHub had marked the PR merged, which can leave it closed as unmerged; `in-progress` stayed on the closed issue. | Confirm merged, then delete the branch; the merger removes `in-progress`. | `reviewer.md` § Merger |
| L7 | The reviewer had no line between blocking and non-blocking (two errors lived only in the PR body), no rule for a PR back after a verdict, and an approval left no record of what was checked. | Only what lands on master blocks; a returned PR is reviewed on the diff since the last reviewed head; an approval is an `Approved (round k)` comment plus the label. | `reviewer.md` § Pick, § Decide |
| L6 | The planner cut one work-list item into two issues and found no rule for the item's file in between (#1, #2). | Finishing part of an item rewrites its file to what is still open; the last issue deletes it. | `docs/todo.md` |
| L5 | Shell traps cost the first run's agents several retries: Git Bash mangles `git show <rev>:<path>`, `gh issue view --comments` printed nothing, `gh pr view --json` has no `merged`, and re-measuring an index had no sanctioned way to run the repo's TS readers. | Written down with the workaround for each, and where a one-off measurement goes. | `workflow.md` § Commands and waiting |
| L4 | In one slot a unit run beside an e2e run pulled `_tmp/saves` from under the app and failed on the profile (`e2e/scratch.ts` runs for every project); a phase-002 spec run alone failed for want of the `.env` that `e2e/000/foundation.spec.ts` writes (#4). | Unit and e2e one after the other in a slot; foundation first in any e2e list. | `workflow.md` § Commands and waiting |
| L3 | Found before the start, by a review of a sibling fleet: five slots running Electron e2e at once would starve each other into false reds against the suite's short timeouts. | `npm run e2e:locked`, one machine-wide lock in the game folder; tested under contention. | `workflow.md` § Commands and waiting, `developer.md`, `reviewer.md` |
| L2 | Found before the start: only `Bash(...)` was pre-allowed, sessions sit in `pow-fleet-<n>` while the notes and the exe are one level up, and PowerShell or a plain `cd`/`ls` would each stop a session on a prompt. | Each slot gets its own `.claude/settings.local.json` from `fleet-slots.sh`: the game folder as a working directory and a broad Bash list; the roles use Bash only. | `scripts/fleet-slots.sh`, `workflow.md` § Commands and waiting |
| L1 | Found before the start: the claim's "wait 60 seconds" cannot be a `sleep`, which the desktop app refuses; a session would skip the wait and race, or stall. | Fill the minute with the reading the task needs anyway; for the rest, Monitor or a re-read once it is up. The same tools for CI and the merger's idle wait. | `workflow.md` § Commands and waiting, § Claim |

## Inherited from the pcktor fleet

The roles were adapted on 2026-11-02 from the fleet that builds
`senyaak/pcktor`, and its lessons L1–L41 (that repo's `docs/fleet/LESSONS.md`)
are already folded in. What each became here:

| pcktor | What it taught | Here |
| - | - | - |
| L1, L14, L17 | the cloud proxy refuses GraphQL and some REST calls | not needed: the sessions are local, `gh issue` / `gh pr` work |
| L2, L10 | a looping session drags old tasks along; subagents sharing a checkout clobber it | `workflow.md` § Dispatcher and subagent |
| L3 | sessions stalled on permission prompts | `.claude/settings.json`, and each slot's own permissions (this fleet's L2) |
| L4, L9, L15, L16, L24, L39 | claim races on issues and PR fixes | `workflow.md` § Claim and § Branch |
| L5, L37 | parallel PRs took the same next number | nothing in this repo is numbered by count; files are named by subject |
| L6 | friction seen only by chance | every role § Process problems |
| L7, L22, L25 | merges raced; green CI on a stale base | one merger; `reviewer.md` § Merger |
| L8, L41 | hot shared files cost a rebase round per PR | the doc rule in `CLAUDE.md`; `workflow.md` § Hot files |
| L11 | a refused action handed to another agent | `workflow.md` § Dispatcher and subagent 4 |
| L12 | a PR carried another PR's text | `workflow.md` § Open the PR 2 |
| L13 | placeholder issues | `planner.md` § Output, dependencies first |
| L18, L20, L32 | agent comments looked like owner answers; questions the rules already answered | `planner.md` § Owner answers; the `needs-owner` template |
| L19, L35 | `Closes` against a partly done issue; ownerless gaps | `workflow.md` § Open the PR 3 |
| L21, L33 | a missing prerequisite filed as a question; undocumented mechanisms | `developer.md`: no source means a read, small or as its own issue; facts in the same change |
| L23, L26, L31 | rebase-only rounds and who restores `approved` | `reviewer.md` § Merger 1: the merger rebases a clean PR itself and range-diffs it |
| L27, L34, L36 | link and register checks; base fixes going to stacked copies | `npm run links` in CI; no stacking — a dependency is `blocked` until it merges |
| L28, L40 | `mergeable_state` lags, no CI on a conflicted PR | the local `git merge-tree` check; `workflow.md` § Open the PR 4 |
| L29, L30, L38 | reuse hints that did not exist or work; verdicts against newer rules | `planner.md` § What a good issue is 3; `reviewer.md` § Decide |
