#!/usr/bin/env bash
# Make the fleet's working slots: a code worktree and a disasm worktree per
# slot, beside the main checkouts in the game folder, so `..` is the
# installation for both — the e2e suite and tools/xdis.py both rely on that.
#
#   scripts/fleet-slots.sh <count>
#
# Slot n is pow-fleet-<n> and pigs-disasm-fleet-<n>, each detached at
# origin/master; a worker branches from there per issue. The code worktree
# gets its own node_modules. A slot that already exists is left alone, so the
# script is safe to run again to add slots.
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
    (cd "$slot" && npm ci --no-audit --no-fund > /dev/null)
    echo "pow-fleet-$n made"
  fi

  notes="$game/pigs-disasm-fleet-$n"
  if [ -e "$notes" ]; then
    echo "pigs-disasm-fleet-$n exists, left alone"
  else
    git -C "$disasm" worktree add -q --detach "$notes" origin/master
    echo "pigs-disasm-fleet-$n made"
  fi
done
