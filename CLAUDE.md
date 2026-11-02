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

## Shared rules

The working rules every session follows here — code, commits, docs, failures,
investigating, testing — are the shared ones in `.claude/rules/`, which Claude
Code loads by itself; this file only adds what is this project's. The docs
rule's link check is `npm run links`, and the disasm repo carries its own copy
of the checker. The frozen records under `docs/history/` are left as written.

## Working rules

**Committing is standing permission, in both repos — do not ask**, and so is
pushing (the owner, 2026-11-02); the fleet's roles push their own branches and
only the merger pushes master.

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

**The disasm notes are what is already written**: search them before reading
the exe, and before saying anything is not there. An arm of a routine is read
from its first instruction to its last.

**Play's memory of the original beats an ambiguous reading.** Record it
verbatim and tag it `[play]`. `[deliberate]` and `[CHECK — remake]` are open
questions, not decisions (the legend is in
[docs/facts/](docs/facts/README.md)).

**The mouse works every menu**, however faithful a keyboard-only screen would
be ([docs/facts/menu.md](docs/facts/menu.md)).

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
