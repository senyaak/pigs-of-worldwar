# Claiming, branching and opening a PR

Shared by the reader and the developer. The role files say what the work IS;
this says how a piece of work is taken, carried and handed over without two
sessions colliding. Every rule here was bought by a collision in the pcktor
fleet; [LESSONS.md](LESSONS.md) names them.

The sessions are local, so `gh issue` and `gh pr` work; issues live in
`senyaak/pigs-of-worldwar`, disasm PRs in `senyaak/pigs-disasm`.

## Claim

1. **What to take.** An open `changes-requested` PR of your kind beats a new
   issue. Otherwise an open `fleet` + `ready` issue of your kind whose
   `Depends on` issues are all closed. Spread out: worker #n prefers the n-th
   oldest eligible item, wrapping round, so the sessions do not all race for
   the oldest.
2. **Claim it.** Comment `claimed by <your session tag>` on an issue, or `fix
   claimed by <tag> for round <k>` on a PR (`k` from its latest verdict). That
   is the **whole first line**; a branch name goes on the next. **Wait 60
   seconds, then re-read every comment.** The earliest claim wins. A claim on
   an issue counts only if it was posted after the issue last became `ready`;
   on a PR, only if it names the current round and was posted after that
   round's verdict. Yield only to an earlier claim that has not itself
   yielded; if every claim yielded, the earliest claimant takes it.
3. **Only the winner changes labels**, after the wait: issue `ready` →
   `in-progress`, PR `changes-requested` → `fix-in-progress`. A loser comments
   `yielding (<tag>)`, touches no label, and picks something else. Never take
   a PR labelled `fix-in-progress`.
4. **The latest verdict is the whole task.** A PR's current round is its
   newest review whose body starts `Verdict:`. It lists every open point and
   supersedes the earlier rounds.

## Branch

- Branch from fresh `origin/master` in your slot's worktree:
  `fleet/<issue-number>-<short-slug>`, in whichever repo the work is in. A
  build that needs a small read uses the same branch name in both.
- Fixing a PR: work on its branch. Rebasing and `git push
  --force-with-lease=<branch>:<head sha named in the verdict>` is allowed only
  while you hold the fix claim. Re-read the claims right before the first
  push; an earlier non-yielded claim for the same round means you yield.

## Commit

Every commit, a rebase's included:

```bash
GIT_COMMITTER_NAME="Claude <the model actually running>" GIT_COMMITTER_EMAIL="noreply@anthropic.com" git commit -F <message file>
```

The author is the owner's global git config; check that the worktree has no
local `user.name` override. No `Co-Authored-By` trailer. Write the message to a
file and commit with `-F` — a heredoc with quotes or apostrophes breaks in Git
Bash on this machine. Stage only your own files, never `git add -A`.

## Dispatcher and subagent

1. **One subagent at a time, in the slot's worktree.** Parallelism comes from
   the fleet's several sessions, not from subagents sharing a working tree.
2. **The split is fixed**: the subagent writes, runs the checks, commits and
   pushes the branch, then reports. The **dispatcher** owns everything on
   GitHub — claims, labels, opening the PR, waiting for CI.
3. While a subagent works, the dispatcher does not touch the working tree.
4. An action refused by a permission check is reported as a `fleet-process`
   issue. **Never hand a refused action to another agent** to do instead.

## Open the PR

1. Rebase on fresh `origin/master` right before pushing, and re-run the checks
   if master moved.
2. Title it like the issue and write the body **from this issue**, never from
   another PR's text. It holds `Closes senyaak/pigs-of-worldwar#<n>` (the
   same number as the branch), a short summary, the role's required sections,
   and `Pairs with <repo>#<n>` when the work spans both repos. Label it
   `fleet`.
3. If part of the issue was left out, write `Part of` instead of `Closes`, and
   comment on the issue what is still open.
4. **Fixing a PR**: push, wait for CI on the new head, and remove
   `fix-in-progress` only when CI is green. A red run is still your claim.
   Never set `approved` yourself. While waiting, re-fetch the PR's
   `mergeable_state`: GitHub runs no CI on a conflicted PR, so `dirty` means
   master moved — rebase again, push, wait again.

## Hot files

Two PRs that each add one thing must never touch the same lines.

- **An index is one entry per line, sorted by file name within its group.**
  Add yours at its sorted place; never at the end, never on another line,
  never reflow the neighbours. That covers `docs/todo.md`, the indexes under
  `docs/facts/`, `docs/history/` and the disasm `README.md`.
- **A new subject is a new file.** A finding goes into the note that owns its
  subject only when it changes that note's facts; a new subject is a new note
  plus one index line.
- **`CHANGELOG.md` is not touched** by a PR; it is written when a version is
  cut ([../release.md](../release.md)).
- **A code module that two open issues both need is not edited side by side.**
  If your change has to grow a second concern in a module, split the module
  first, in its own commit, and say so in the PR.

## Moving or renaming a file

List the open issues whose body names the old path under `Moved paths` in the
PR body; the orchestrator rewrites them. When master moved a file your branch
edits, re-apply the edit at the new place while rebasing; do not resurrect
the old file.

## Process problems

If the fleet process itself gets in your way, report it; do not silently work
around it. Open a `fleet` + `fleet-process` issue (not `ready`) with what
happened, what it cost, and what rule change would prevent it, then carry on.
A subagent puts process problems in its report and the dispatcher files them.
