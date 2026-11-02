# Pigs of Worldwar — orientation

A fan remake of Gremlin's *Hogs of War* (2000) in Electron + Three.js +
TypeScript. It reads assets straight out of a legally installed copy; nothing
from the original is redistributed. This repo normally sits **inside** the
game folder, so `..` is the installation.

Reverse-engineering findings live in the **disasm repo**, `pigs-disasm`,
checked out beside this one: notes plus the scripts that prove them. Every bare
path of the form `weapons/fire.md` or `anim/notes.md`, here or in any doc of
this tree, is a file inside it, never one in this tree. It is named and not
linked on purpose: it gets a worktree of its own whenever this repo does, so a
relative path written here would be right in one checkout and wrong in the
next.

## Where things are

- [README.md](README.md) — how to play and run it
- [docs/facts/](docs/facts/README.md) — what is true: the facts the engine is built on and the divergences, one file per subject
- [docs/todo.md](docs/todo.md) — what is open, one file per item
- [docs/testing.md](docs/testing.md) — how specs are written and run
- [docs/formats.md](docs/formats.md) — the original's file formats
- [docs/ai.md](docs/ai.md) — the enemy AI's design
- [docs/netplay.md](docs/netplay.md) — lockstep multiplayer
- [docs/release.md](docs/release.md) — how a version is tagged and built
- [docs/history/](docs/history/README.md) — what happened, by subsystem
- [docs/fleet/](docs/fleet/README.md) — the agent fleet: the shared roles (a pinned copy of `senyaak/claude-fleet` in `.claude/`) and this project's part

## How a doc is shaped

**A markdown file describes ONE thing, or it is an INDEX.** An index is a list
of links, each to a file that describes one thing or to another index, with a
one-line summary per link. Nothing else goes in an index. This file is the
root index plus the working rules.

- **A file that grows a second subject is split**, and the old file becomes the
  index of its pieces at the same path, so every citation of it still lands.
  Past about 500 lines a one-thing file almost always holds two.
- **An index is one entry per line, sorted by file name within its group.** Add
  an entry at its sorted place, never at the end, never on someone else's line,
  and never reflow the neighbours. That is what lets two changes touch one
  index without conflicting.
- **A correction REPLACES the wrong text.** No strike-through and no "~~old~~
  new": a reader skimming takes the struck line for a fact, and git keeps the
  old version. The frozen records under `docs/history/` are left as written.
- **A record of work is a new file, never an append.** Two changes appending to
  one file conflict every time; see [docs/history/](docs/history/README.md).
- **`npm run links` must pass.** It checks every relative link in this repo's
  markdown; CI runs it on every change.

The same rule holds in the disasm repo, which carries its own copy of the
checker.

## Working rules

**Committing is standing permission, in both repos — do not ask.** Finish a
piece of work and commit it, with the attribution the global rules give
(author Senyaak, committer Claude via `GIT_COMMITTER_*`, no `Co-Authored-By`
trailer). Never `git add -A` over a tree you did not leave: check `git status`
first and stage only your own files, because work in progress from another
session lives here regularly. Pushing is allowed too (the owner, 2026-11-02);
the fleet's roles push their own branches and only the merger pushes master.

**This repo is PUBLIC and the disasm repo is PRIVATE, on purpose.** What is
read out of the exe stays in the disasm repo. This repo — its code, docs,
issues, pull requests and reviews — carries the behaviour in words, the
numbers the code needs, and citations (a disasm path and an exe address), and
at most a single instruction quoted as evidence. Never a listing, pseudocode,
a transcribed routine or a dump. A question about how to read the exe is asked
in the disasm repo, not here.

**The original is the spec, and every behaviour cites where it was read.**
`[exe]` cites a disasm note and an exe address, `[measured]` the script,
`[play]` play's own words. A behaviour with no source is not built: the
reading comes first. What the exe gives is what the PLAYER SEES; the mechanism
under it is ours to choose.

**Search the disasm notes before reading the exe, and before saying anything
is not there.** The answer has more than once been written down already.

**"I could not find it" is never "it is not there".** The grenade's trail was
declared absent because both of the projectile update's dispatches skip a plain
grenade, and it is in the CONSTRUCTOR (0x43247b). The water skip was declared
absent with a physics argument for why it could not exist, and it was the last
instruction of an arm that had been skimmed (`0x4A9260(scalar/5, 0x400, 0, 0)`,
a kick straight up). Read every arm from its first instruction to its last
before concluding anything about it. A field in the data means nothing until
code is found reading it.

**Play's memory of the original beats an ambiguous reading.** Record it
verbatim and tag it `[play]`. `[deliberate]` and `[CHECK — remake]` are open
questions, not decisions (the legend is in
[docs/facts/](docs/facts/README.md)).

**No leftovers.** A stand-in is deleted the moment the real thing lands; it is
never kept as a fallback.

**The mouse works every menu.** A screen the pointer cannot drive reads as
broken, however faithful it is ([docs/facts/menu.md](docs/facts/menu.md)).

**Keep modules small and single-purpose.** `battle.ts` reached 1365 lines doing
every job in the game and was taken apart; do that again rather than let one
file grow a second concern.

**In a session with the owner, do not run suites unasked**; run the spec a
change touches when it matters. The fleet's roles say what they run.

## Traps worth knowing before touching the code

- Never `scale.y = -1` to get from one space to the other — [space-and-scale.md](docs/facts/space-and-scale.md)
- Never compare a tile's type byte whole; mask with `0x1f` — [terrain.md](docs/facts/terrain.md)
- Never read a clip index off the exe's name table — [animation.md](docs/facts/animation.md)
- Never add a light to the ground — [terrain.md](docs/facts/terrain.md)
- Never reach for `Math.random` in `lib/game` — [code-layout.md](docs/facts/code-layout.md)
- Never synthesise key events in a spec; drive the controller — [input.md](docs/facts/input.md)
- Do not re-propose `FRAME_SECONDS` at 1/20 or 1/25, or `HEIGHT_SCALE` doubled — [time.md](docs/facts/time.md)
- Do not tune the tile turn table by eye — [terrain.md](docs/facts/terrain.md)
- A debug read is not a paint check — [testing.md](docs/testing.md)
