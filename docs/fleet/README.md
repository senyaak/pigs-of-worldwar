# The agent fleet

Autonomous Claude sessions that read the original and build the remake from it
through GitHub issues and pull requests. The owner plays what they build and
answers what only play can answer; everything else is the fleet's.

Adapted from the fleet that builds `senyaak/pcktor`, whose 41 lessons are
folded into the roles here ([LESSONS.md](LESSONS.md) says which and how). The
differences come from two facts:

- **The original game is only on this machine.** The exe the readers
  disassemble and the installation the e2e suite runs against cannot go to a
  cloud session, so every session is LOCAL, and CI can only run the half of
  the suite that needs no game.
- **The remake is public and the reading is private.** `senyaak/pigs-of-worldwar`
  is a public repo; `senyaak/pigs-disasm` is private on purpose. Whatever is
  read out of the exe is discussed and written on the private side.

## Roles

- **Planner** — [.claude/agents/planner.md](../../.claude/agents/planner.md) — turns the work list into small issues, and owner answers into decisions
- **Reader** — [.claude/agents/reader.md](../../.claude/agents/reader.md) — one `read` issue → the exe read → a note in the disasm repo, by PR
- **Developer** — [.claude/agents/developer.md](../../.claude/agents/developer.md) — one `build`, `test` or `bug` issue → one branch → one PR that cites its sources
- **Reviewer** — [.claude/agents/reviewer.md](../../.claude/agents/reviewer.md) — re-reads every cited address itself, runs the specs, labels `approved`
- **Merger** — [.claude/agents/reviewer.md](../../.claude/agents/reviewer.md) § Merger — fast-forwards approved PRs, lowest number first

A run is one local Claude Code session told: *"You are the `<role>`. Follow
`.claude/agents/<role>.md`."*

- [workflow.md](workflow.md) — claiming, branching, committing, opening a PR, hot files: shared by the reader and the developer
- [LESSONS.md](LESSONS.md) — process problems and the rule each one became, pcktor's included

## Which repo carries what

| | `senyaak/pigs-disasm` (private) | `senyaak/pigs-of-worldwar` (public) |
| - | - | - |
| issues | `read`, `needs-owner` | `build`, `test`, `bug`, `fleet-process` |
| pull requests | notes | code, docs |
| may contain | anything read out of the exe: listings, pseudocode, the reasoning | behaviour in words, the numbers the code needs, citations (a disasm path and an address), at most one instruction quoted as evidence |

A `needs-owner` question is private because it usually turns on how the exe
reads. A dependency across the two is written in full,
`senyaak/pigs-disasm#12`, so it links.

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

1. The planner opens an issue per work item, in the repo the table above
   gives its kind: labels `fleet`, the kind and `ready`, or `blocked` when it
   depends on another. The body links the work-list file it came from.
2. A reader or developer claims it (`ready` → `in-progress`) and opens a PR in
   the same repo as the issue. A build that needed a small read has one PR in
   each repo, the code PR naming the disasm one.
3. A reviewer either labels the PR `approved` or posts a verdict and labels it
   `changes-requested`; the next run fixes it on the same branch.
4. The merger fast-forwards an approved PR onto master, closes the issue, and
   labels it **`needs-play`** when the change is something a player can see.
   The owner's play queue is the closed issues carrying that label; the owner
   removes it after looking.
5. A question only the owner can answer goes into a **`needs-owner`** issue in
   the disasm repo (its template, `.github/ISSUE_TEMPLATE/needs-owner.md`).
   The owner answers in a comment, in any language, and labels it `answered`.

Everything written on GitHub — issues, PRs, reviews, comments — is in English.

## Labels

Both repos carry the same set: `fleet`, the kinds `read` / `build` / `test` /
`bug`, `ready`, `in-progress`, `blocked`, `changes-requested`,
`fix-in-progress`, `approved`, `needs-owner`, `answered`, `needs-play`,
`fleet-process`. They are made before the fleet starts; a role that finds one
missing creates it (`gh label create <name> --repo <repo>`).

## Guard rails

1. **CI is a gate, not the whole gate.** CI runs typecheck, boundaries, the
   unit suite and the link check. The e2e suite needs the installed game, so
   the developer runs the specs a change touches and the reviewer runs them
   again; both paste the counts.
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
5. **Nothing read out of the exe goes to the public side** beyond what the
   table above allows. A reviewer treats a listing or pseudocode in a public
   PR as a defect.
6. **Process problems are reported, not worked around.** Any role files a
   `fleet-process` issue; the orchestrator turns it into a rule change and
   records it in [LESSONS.md](LESSONS.md).

## Starting the fleet

**Before the start, by the orchestrator** (the session that prepares the
fleet): push both masters, create the labels in both repos, and make a pair of
worktrees per working slot. The slots sit in the game folder like the main
checkouts, so `..` is the installation for both:

```bash
scripts/fleet-slots.sh 3
```

That makes `pow-fleet-1..3` and `pigs-disasm-fleet-1..3` beside the main
checkouts, detached at `origin/master`, and installs the dependencies.

**Made 2026-11-02: five slots**, and the labels in both repos. Slots 1–3 are
for readers and developers, 4 and 5 for the two reviewers. Slot 1 was checked
end to end: typecheck, boundaries, links, the unit suite, one e2e spec against
the installation at `..`, and `tools/xdis.py` from its disasm worktree. A
slot's detached HEAD does not matter; every piece of work branches from fresh
`origin/master`.

**Then one local Claude Code session per worker**, each opened in its own
slot's code worktree (`pow-fleet-<n>`), except the planner and the merger,
which need no slot and run in the main checkout:

1. **Planner**, first, and wait for its issues:
   `You are the fleet planner. Follow .claude/agents/planner.md. Create the first batch of at most 15 issues.`
2. **Readers and developers**, one session per slot:
   `You are fleet <reader|developer> #<n>. Loop until no ready issue of your kind or changes-requested PR remains: claim one as in docs/fleet/workflow.md § Claim, then spawn the '<role>' subagent with the issue number and branch to do the work, check its report, take the next. Keep this conversation small.`
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
