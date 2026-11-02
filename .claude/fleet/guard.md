# The guard

[guard.mjs](guard.mjs) is a `PreToolUse` hook on the Bash and PowerShell tools.
It refuses a command that breaks one of the rules below before it runs, and
the refusal's reason tells the session what to do instead. A rule that lives
only in prose holds most of the time; these must hold every time.

The installer registers it in the project's `.claude/settings.json`:

```json
{ "matcher": "Bash|PowerShell",
  "hooks": [{ "type": "command", "command": "node",
              "args": ["${CLAUDE_PROJECT_DIR}/.claude/fleet/guard.mjs"], "timeout": 10 }] }
```

Exec form — `command` plus `args` — starts `node` directly, with no shell in
between, so the hook is the same on Windows and Linux: no shebang, no execute
bit, no Git Bash or `sh` quirks.

## In every session of the project

The owner's commit rules hold wherever the fleet is installed, the owner's
own sessions included:

| refused | why |
| - | - |
| `git add -A`, `--all`, `.`, `:/`, `-u` | other sessions leave work in progress in the tree; stage by name |
| `git commit`, `rebase`, `cherry-pick`, `revert`, `am`, `merge` without `GIT_COMMITTER_NAME="Claude …"` and `GIT_COMMITTER_EMAIL="noreply@anthropic.com"` | Claude is the committer of every commit it writes ([workflow.md](workflow.md) § Commit) |
| a `Co-Authored-By` trailer in `-m` or in the `-F` file | Claude is already the committer |
| `--no-verify`, `git commit -n` | the repo's own checks are fixed, not skipped |
| `gh pr merge` | a GitHub merge commits as GitHub; the merger fast-forwards |

`git merge --ff-only` and `--abort`/`--skip`/`--quit` write no commit and pass.

## In a fleet session

A session is a fleet session when `FLEET_SLOT` is set in its environment, when
it runs in a slot directory (`<name>-fleet-<n>`), or when the hook fires
inside a subagent of a fleet role (`planner`, `developer`, `reviewer`,
`merger`, `reader`). There, also:

| refused | why |
| - | - |
| the PowerShell tool | slots pre-allow Bash only, and PowerShell mangles UTF-8 |
| any push to `master` or `main` but `git push origin <sha>:<base>` | only the merger moves the base, as a fast-forward of an approved head |
| a forced push to the base, `+<sha>:<base>`, deleting it | the base only moves forward |
| a plain `--force` / `-f` push | a fix rewrites its branch with `--force-with-lease=<branch>:<head>` only |
| `--mirror`, `--all` | a session pushes its own branch by name |

## What it cannot see

It reads the command text. A command assembled at run time (`eval`, a script
that runs git) passes unseen, and so does a commit made by a tool other than
git. The rules stay in the roles; the guard is the net under them, not the
whole of them.

A refusal that blocks legitimate work is a `fleet-process` report, and the fix
lands in the fleet repo with a test (`test/guard.test.mjs` there).
