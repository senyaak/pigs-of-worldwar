# The agent fleet

Autonomous Claude sessions that read the original and build the remake from it
through GitHub issues and pull requests. The owner plays what they build and
answers what only play can answer; everything else is the fleet's.

Adapted from the fleet that builds `senyaak/pcktor`, whose 41 lessons are
folded into the roles here ([LESSONS.md](LESSONS.md) says which and how). The
differences come from one fact: **the original game is only on this machine.**
The exe the readers disassemble and the installation the e2e suite runs
against cannot go to a cloud session, so every session here is LOCAL, and CI
can only run the half of the suite that needs no game.

## Roles

- **Planner** — [.claude/agents/planner.md](../../.claude/agents/planner.md) — turns the work list into small issues, and owner answers into decisions
- **Reader** — [.claude/agents/reader.md](../../.claude/agents/reader.md) — one `read` issue → the exe read → a note in the disasm repo, by PR
- **Developer** — [.claude/agents/developer.md](../../.claude/agents/developer.md) — one `build` issue → one branch → one PR that cites its sources
- **Reviewer** — [.claude/agents/reviewer.md](../../.claude/agents/reviewer.md) — re-reads every cited address itself, runs the specs, labels `approved`
- **Merger** — [.claude/agents/reviewer.md](../../.claude/agents/reviewer.md) § Merger — fast-forwards approved PRs, lowest number first

A run is one local Claude Code session told: *"You are the `<role>`. Follow
`.claude/agents/<role>.md`."*

- [workflow.md](workflow.md) — claiming, branching, committing, opening a PR, hot files: shared by the reader and the developer
- [LESSONS.md](LESSONS.md) — process problems and the rule each one became, pcktor's included

## Where the sources of truth are

| what | where |
| - | - |
| the original's behaviour | `warhogs_.exe`, read with `tools/xdis.py` in the disasm repo |
| what has been read | the disasm repo's notes, indexed by its `README.md` |
| what play remembers | `[play]` statements in [../facts/](../facts/README.md), and owner answers on `needs-owner` issues |
| what is true in the remake | [../facts/](../facts/README.md) |
| what is open | [../todo.md](../todo.md), and the issues made from it |

**A behaviour with no source is not built.** A developer who finds the read
missing does not guess: a small read goes into the same work as a disasm PR,
a bigger one becomes a `read` issue that blocks the build.

## Lifecycle

1. The planner opens an issue per work item, always in
   `senyaak/pigs-of-worldwar` so there is one queue: labels `fleet`, a kind
   (`read`, `build`, `test`, `bug`) and `ready`, or `blocked` when it depends
   on another. The body links the work-list file it came from.
2. A reader or developer claims it (`ready` → `in-progress`) and opens a PR:
   a `read` issue's PR is in **`senyaak/pigs-disasm`**, a build's in
   **`senyaak/pigs-of-worldwar`**, and a build that needed a small read has
   one of each, the code PR naming the disasm one.
3. A reviewer either labels the PR `approved` or posts a verdict and labels it
   `changes-requested`; the next developer run fixes it on the same branch.
4. The merger fast-forwards an approved PR onto master, closes the issue, and
   labels the issue **`needs-play`** when the change is something a player can
   see. The owner's play queue is the closed issues carrying that label; the
   owner removes it after looking.
5. A question only the owner can answer goes into a **`needs-owner`** issue
   ([template](../../.github/ISSUE_TEMPLATE/needs-owner.md)). The owner
   answers in a comment, in any language, and labels it `answered`.

Everything written on GitHub — issues, PRs, reviews, comments — is in English.

## Labels

`fleet`, the kinds `read` / `build` / `test` / `bug`, `ready`, `in-progress`,
`blocked`, `changes-requested`, `fix-in-progress`, `approved`, `needs-owner`,
`answered`, `needs-play`, `fleet-process`. They live in
`senyaak/pigs-of-worldwar`, where the issues are; a disasm PR needs only
`fleet`, `approved`, `changes-requested` and `fix-in-progress`. The planner
creates any that are missing (`gh label create <name> --repo <repo>`).

## Guard rails

1. **CI is a gate, not the whole gate.** CI runs typecheck, boundaries, the
   unit suite and the link check. The e2e suite needs the installed game, so
   the developer runs the specs a change touches and the reviewer runs them
   again; both paste the result.
2. **Master stays green.** Anyone who finds master red stops other work and
   opens `[ci] master is red: <step>` (`fleet` + `bug` + `ready`) unless one is
   open.
3. **No direct pushes to master** except the merger's fast-forward of an
   approved PR.
4. **Commits keep the owner's attribution**: author Senyaak (the global git
   config), committer `Claude <model actually running>` through
   `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL=noreply@anthropic.com`, and no
   `Co-Authored-By` trailer — on every commit, a rebase's included. That is
   why the merger fast-forwards instead of letting GitHub squash: a GitHub
   merge commits as GitHub.
5. **Process problems are reported, not worked around.** Any role files a
   `fleet-process` issue; the orchestrator turns it into a rule change and
   records it in [LESSONS.md](LESSONS.md).

## Starting the fleet

**Once, by the owner:** push both masters, then make a pair of worktrees per
working slot. They sit in the game folder like the main checkouts, so `..` is
the installation for both:

```bash
scripts/fleet-slots.sh 3
```

That makes `pow-fleet-1..3` and `pigs-disasm-fleet-1..3` beside the main
checkouts, detached at `origin/master`, and installs the dependencies.

**Then one local Claude Code session per worker**, each opened in its own
slot's code worktree (`pow-fleet-<n>`), except the planner and the merger,
which need no slot and run in the main checkout:

1. **Planner**, first, and wait for its issues:
   `You are the fleet planner. Follow .claude/agents/planner.md. Create the first batch of at most 15 issues.`
2. **Readers and developers**, one session per slot:
   `You are fleet <reader|developer> #<n>. Loop until no ready issue of your kind or changes-requested PR remains: claim one as in .claude/agents/<role>.md § Claim, then spawn the '<role>' subagent with the issue number and branch to do the work, check its report, take the next. Keep this conversation small.`
3. **Reviewers**, two sessions, each in a slot of its own (they run specs):
   `You are fleet reviewer #<n>. Follow .claude/agents/reviewer.md. Loop over open fleet PRs in both repos until none is reviewable. Then report.`
4. **Merger**, exactly one session:
   `You are the fleet merger. Follow .claude/agents/reviewer.md § Merger. Loop until told STOP.`

One subagent per issue gives every task a fresh context: the session stays a
thin dispatcher instead of dragging earlier tasks' history into the next one.
When a worker stops because its queue is empty, nudge it later with `continue`.

## The owner's part

- **Answer `needs-owner` issues** — what the original did, from play's memory.
- **Play the `needs-play` queue**, best on the proving ground
  ([../todo/proving-ground.md](../todo/proving-ground.md)) once it exists,
  and report what is wrong as a comment or a new issue.
- **Decide anything that changes how the fleet works**; the orchestrator
  writes it into the roles.
