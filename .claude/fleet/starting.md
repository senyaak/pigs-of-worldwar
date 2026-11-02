# Starting the fleet

**Before the start**, the owner's session that prepares it pushes the base
branches, creates the labels ([lifecycle.md](lifecycle.md) § Labels), and
makes the slots: one working directory per worker, named `<name>-fleet-<n>`
so the [guard](guard.md) knows a fleet session, each with permissions that
pre-allow every command a role runs. How this project makes them:
`project.md` § Slots.

**Then one Claude Code session per worker**, each opened in its own slot:

1. **Planner**, first, and wait for its issues:
   `You are the fleet planner. Follow .claude/agents/planner.md. Create the first batch of at most 15 issues.`
2. **Workers**, one session per slot:
   `You are fleet <role> #<n>. Loop until no ready issue of your kind or changes-requested PR remains: claim one as in .claude/fleet/workflow.md § Claim, then spawn the '<role>' subagent with the issue number and branch to do the work, check its report, take the next. Keep this conversation small.`
3. **Reviewers**, two sessions, each in a slot of its own (they run checks):
   `You are fleet reviewer #<n>. Follow .claude/agents/reviewer.md. Loop over open fleet PRs until none is reviewable. Then report.`
4. **Merger**, exactly one session:
   `You are the fleet merger. Follow .claude/agents/reviewer.md § Merger. Loop until told STOP.`

One subagent per issue gives every task a fresh context: the session stays a
thin dispatcher instead of dragging earlier tasks' history into the next.
When a worker stops because its queue is empty, nudge it later with
`continue`.

**How many.** Three to five workers per repo is the useful range. Past that,
the reviewers and the one merger are the limit, not the workers, and
parallel work in one repo starts to collide.
