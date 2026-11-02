#!/usr/bin/env bash
# Make the fleet's working slots: a code worktree and a disasm worktree per
# slot, beside the main checkouts in the game folder, so `..` is the
# installation for both — the e2e suite and tools/xdis.py both rely on that.
#
#   scripts/fleet-slots.sh <count>
#
# Slot n is pow-fleet-<n> and pigs-disasm-fleet-<n>, each detached at
# origin/master; a worker branches from there per issue. The code worktree
# gets its own node_modules. A slot's worktrees that already exist are left
# alone and only its permissions file is rewritten, so the script is safe to
# run again — to add slots, or to change what every slot may do.
set -euo pipefail

count="${1:?usage: scripts/fleet-slots.sh <count>}"
code="$(git rev-parse --show-toplevel)"
game="$(dirname "$code")"
disasm="$game/pigs-disasm"

[ -d "$disasm/.git" ] || { echo "no disasm checkout at $disasm" >&2; exit 1; }

git -C "$code" fetch -q origin
git -C "$disasm" fetch -q origin

for n in $(seq 1 "$count"); do
  slot="$game/pow-fleet-$n"
  if [ -e "$slot" ]; then
    echo "pow-fleet-$n exists, left alone"
  else
    git -C "$code" worktree add -q --detach "$slot" origin/master
    (cd "$slot" && npm ci --no-audit --no-fund --loglevel=error > /dev/null)
    echo "pow-fleet-$n made"
  fi

  # The slot's own permissions, rewritten on every run. A fleet session has no
  # one to answer a prompt, so everything a role does must be pre-allowed: the
  # game folder as a working directory (the disasm worktree, the exe and the
  # e2e lock are all in it), and the Bash commands the roles use. Kept out of
  # git because the path is this machine's.
  mkdir -p "$slot/.claude"
  cat > "$slot/.claude/settings.local.json" <<SETTINGS
{
  "permissions": {
    "additionalDirectories": ["$(cygpath -m "$game" 2>/dev/null || echo "$game")"],
    "allow": [
      "Read", "Edit", "Write", "Glob", "Grep", "Monitor",
      "Bash(gh:*)", "Bash(git:*)", "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)",
      "Bash(python:*)", "Bash(bash scripts/:*)",
      "Bash(cd:*)", "Bash(pwd:*)", "Bash(ls:*)", "Bash(cat:*)", "Bash(head:*)",
      "Bash(tail:*)", "Bash(grep:*)", "Bash(find:*)", "Bash(sed:*)", "Bash(awk:*)",
      "Bash(wc:*)", "Bash(sort:*)", "Bash(uniq:*)", "Bash(diff:*)", "Bash(cut:*)",
      "Bash(tr:*)", "Bash(echo:*)", "Bash(printf:*)", "Bash(date:*)",
      "Bash(test:*)", "Bash(mkdir:*)", "Bash(cp:*)", "Bash(mv:*)",
      "Bash(file:*)", "Bash(du:*)", "Bash(xargs:*)", "Bash(true:*)"
    ]
  }
}
SETTINGS

  notes="$game/pigs-disasm-fleet-$n"
  if [ -e "$notes" ]; then
    echo "pigs-disasm-fleet-$n exists, left alone"
  else
    git -C "$disasm" worktree add -q --detach "$notes" origin/master
    echo "pigs-disasm-fleet-$n made"
  fi
done
