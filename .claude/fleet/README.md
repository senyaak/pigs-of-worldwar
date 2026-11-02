# The agent fleet — index

Autonomous Claude Code sessions that take a project's work list through
GitHub issues and pull requests. This folder and the role files in
`.claude/agents/` are a **copy of a version of `senyaak/claude-fleet`**, pinned
in `fleet.lock.json` and never edited here ([updating.md](updating.md)). What
is this project's own is in [docs/fleet/project.md](../../docs/fleet/project.md).

## How it works

- [lifecycle.md](lifecycle.md) — the roles, an issue's way from the work list to the base branch, labels, guard rails
- [starting.md](starting.md) — slots, and the prompt each session is started with
- [strangers.md](strangers.md) — only the owner's account is ever acted on
- [workflow.md](workflow.md) — claiming, waiting, three strikes, branching, committing, opening a PR, hot files

## Roles

- [../agents/developer.md](../agents/developer.md) — one issue → one branch → one PR that cites its sources
- [../agents/planner.md](../agents/planner.md) — the work list → small issues; strangers triaged; owner answers → decisions
- [../agents/reviewer.md](../agents/reviewer.md) — re-checks every cited source, runs the checks, labels `approved`; § Merger lands them

## The copy itself

- [fleet.mjs](fleet.mjs) — `check`, `update`, `verify`: the fleet as a pinned dependency
- [guard.md](guard.md) — the hook that refuses what the rules forbid, and why it is Node
- [lessons.md](lessons.md) — the process problems the shared rules came from
- [updating.md](updating.md) — taking a new version, and where a change to the rules is made
