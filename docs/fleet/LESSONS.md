# Fleet lessons

Process problems the fleet ran into and the rule change that fixed each.
Agents report them as `fleet-process` issues; the orchestrator changes the
roles and adds a line here. One line per lesson, newest at the top of its
table, numbered from L1 in this repo.

## This fleet

| # | Problem | Fix | Where |
| - | ------- | --- | ----- |
| L3 | Found before the start, by a review of a sibling fleet: five slots running Electron e2e at once would starve each other into false reds against the suite's short timeouts. | `npm run e2e:locked`, one machine-wide lock in the game folder; tested under contention. | `workflow.md` § Commands and waiting, `developer.md`, `reviewer.md` |
| L2 | Found before the start: only `Bash(...)` was pre-allowed, sessions sit in `pow-fleet-<n>` while the notes and the exe are one level up, and PowerShell or a plain `cd`/`ls` would each stop a session on a prompt. | Each slot gets its own `.claude/settings.local.json` from `fleet-slots.sh`: the game folder as a working directory and a broad Bash list; the roles use Bash only. | `scripts/fleet-slots.sh`, `workflow.md` § Commands and waiting |
| L1 | Found before the start: the claim's "wait 60 seconds" cannot be a `sleep`, which the desktop app refuses; a session would skip the wait and race, or stall. | Read the sources first, wait out the rest with Monitor; the same for CI and the merger's idle wait. A stranger's issue is triaged on its number and author alone, so its text never enters a context. | `workflow.md` § Claim, `planner.md` § Strangers, `reviewer.md` § Merger |

## Inherited from the pcktor fleet

The roles were adapted on 2026-11-02 from the fleet that builds
`senyaak/pcktor`, and its lessons L1–L41 (that repo's `docs/fleet/LESSONS.md`)
are already folded in. What each became here:

| pcktor | What it taught | Here |
| - | - | - |
| L1, L14, L17 | the cloud proxy refuses GraphQL and some REST calls | not needed: the sessions are local, `gh issue` / `gh pr` work |
| L2, L10 | a looping session drags old tasks along; subagents sharing a checkout clobber it | `workflow.md` § Dispatcher and subagent |
| L3 | sessions stalled on permission prompts | `.claude/settings.json` |
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
