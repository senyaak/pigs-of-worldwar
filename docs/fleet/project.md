# This project's fleet

What the shared roles in `.claude/agents/` and `.claude/fleet/` need to know
about the Hogs of War remake. They cite it as `project.md § <section>`. The
shared part is a pinned version of `senyaak/claude-fleet`
([../../.claude/fleet/README.md](../../.claude/fleet/README.md)); this file is
the project's own.

Two facts shape everything below:

- **The original game is only on this machine.** The exe the readers
  disassemble and the installation the e2e suite runs against cannot go to a
  cloud session, so every session is LOCAL, and CI can only run the half of
  the suite that needs no game.
- **The remake is public and the reading is private.** Whatever is read out
  of the exe is discussed and written on the private side.

## Owner

`senyaak`. Only that account's issues, PRs, comments and labels count.

## Repos

| | `senyaak/pigs-disasm` (private) | `senyaak/pigs-of-worldwar` (public) |
| - | - | - |
| issues | `read`, `needs-owner` | `build`, `test`, `bug`, `fleet-process` |
| pull requests | notes | code, docs |
| may contain | anything read out of the exe: listings, pseudocode, the reasoning | behaviour in words, the numbers the code needs, citations (a disasm path and an address), at most one instruction quoted as evidence |

- A `needs-owner` question goes in `senyaak/pigs-disasm`, from its template
  `.github/ISSUE_TEMPLATE/needs-owner.md`, because it usually turns on how the
  exe reads.
- A dependency across the two is written in full, `senyaak/pigs-disasm#12`,
  so it links. Work that spans both has one PR in each, the code PR saying
  `Pairs with senyaak/pigs-disasm#<n>`.
- **Nothing read out of the exe goes to the public repo** beyond the right
  column: not in code, docs, PR bodies, reviews, comments or commit messages.
  A listing or pseudocode in a public PR is a defect.

## Kinds

| kind | taken by | repo |
| - | - | - |
| `read` — the exe is read and a note written; no remake code | `reader`, this project's own role ([../../.claude/agents/reader.md](../../.claude/agents/reader.md)) | `senyaak/pigs-disasm` |
| `build` — remake code from notes that already exist | `developer` | `senyaak/pigs-of-worldwar` |
| `test` — specs only | `developer` | `senyaak/pigs-of-worldwar` |
| `bug` — a reported misbehaviour, diagnosed before it is fixed | `developer` | `senyaak/pigs-of-worldwar` |

Issue titles are `[<area>] <what>` — `[weapons] 31 AIRBURST`, `[read] who
sends the ambient airship`. In an issue, "what the user sees" is what the
PLAYER sees.

## Sources

**The original is the spec, and every behaviour cites where it was read.**

- `[exe]` — a disasm note and an exe address: `weapons/gas.md`, 0x432d83.
  Bare paths of that form are in the disasm repo, never in this tree.
- `[measured]` — the script that measured the game's files.
- `[play]` — play's own words, quoted in a `docs/facts/` file or a
  `needs-owner` issue.

What the exe gives is what the PLAYER SEES; how the remake produces it is the
developer's to design, inside the code's domains
([../facts/code-layout.md](../facts/code-layout.md)).

**Search the disasm notes first** — grep the whole disasm repo for the
address, the skill, the name — before reading the exe, and before saying
anything is not there. **"I could not find it" is never "it is not there"**
([../../CLAUDE.md](../../CLAUDE.md)).

**A missing source** is established by reading the exe with `python
tools/xdis.py` in the disasm worktree, under the reader's rules
([reader.md](../../.claude/agents/reader.md) § Reading and § Writing the
note): a small read (one routine, a table, an arm or two) as a disasm PR
beside the code PR, on the same branch name; a bigger one as a `read` issue
the build depends on.

**In code and specs**: a spec asserting an exe number says where it was read,
in a comment beside the assertion — `// exe: weapons/gas.md, 0x432d83 — the
pop at half volume`. A `[CHECK — remake]` invention is not allowed in new
work; an existing `[deliberate]` or `[CHECK — remake]` built on is re-read
first, because most of them turned out to be misreadings.

**What only the owner can settle**: how the original LOOKED or FELT when a
reading is ambiguous, or a change to something already ruled `[play]`.
"Follow the exe or keep ours?" is never a question — follow the exe, unless
the remake's behaviour is a `[play]` ruling.

## Decisions

An owner answer becomes a `[play]` statement in the `docs/facts/` file that
owns the subject, with the owner's words quoted. The issue is private, so it
is cited by number only, and no exe reading goes into the public file.

## Work list

[../todo.md](../todo.md) and one file per item under [../todo/](../todo/).
The issue links the item's file. Finishing an item deletes its file and its
index line in the same change; finishing part of it rewrites the file to what
is still open and updates the index line. An item cut into several issues
loses its file with the last of them.

The files under `docs/todo/play/` are the owner's to walk; they are never
issues.

## Order of work

The owner's order, until the owner changes it:

0. The housekeeping items ([split-hot-modules.md](../todo/split-hot-modules.md),
   [disasm-notes-cleanup.md](../todo/disasm-notes-cleanup.md)), because
   parallel builds in an unsplit hot module conflict on every merge. They may
   run alongside the proving ground's reads, never alongside builds in the
   module being split.
1. The proving ground ([proving-ground.md](../todo/proving-ground.md)) — it is
   where everything after it gets tested.
2. What the campaign meets, in campaign order: a weapon, building or vehicle a
   player can reach on an early map comes before one reached late.
3. Then skirmish, then what the campaign never shows.

Within that, reads before the builds that need them.

## Hot files

- **Indexes, one entry per line, sorted:** [../todo.md](../todo.md), the
  indexes under [../facts/](../facts/README.md) and
  [../history/](../history/README.md), and the disasm repo's `README.md`.
- **Hot modules:** the engine's battle loop (`lib/game/battle.ts`), the
  renderer's (`three/battle.ts`), the controller and the HUD are touched by
  almost everything. Issues that would edit one of them are chained or share
  an `area:<module>` label until
  [split-hot-modules.md](../todo/split-hot-modules.md) has taken them apart.

## Build rules

- **Engine rules go in `lib/game`, pure and headless**, tested in `unit/`; the
  domains are checked by `npm run boundaries`.
- **Never `Math.random` in `lib/game`**: the battle's seeded stream.
- **A visible change gets an e2e spec** when unit cannot see it, and a drawn
  subject is asserted on the canvas, not on a debug read
  ([../testing.md](../testing.md)).
- **Every new screen, overlay or clickable element works with the mouse**, in
  the same change ([../facts/menu.md](../facts/menu.md)).
- **Modules stay small and single-purpose** ([../../CLAUDE.md](../../CLAUDE.md)).
- `CHANGELOG.md` is written when a version is cut ([../release.md](../release.md)),
  never by a PR.

## Docs

1. A fact the change establishes goes into the `docs/facts/` file that owns
   its subject, tagged with how it is known and where; a new subject is a new
   facts file plus one line in [../facts/README.md](../facts/README.md).
2. The issue's work-list file is deleted or rewritten (§ Work list).
3. Nothing is appended to `docs/history/`. The PR body is the record.
4. The doc rule of [../../CLAUDE.md](../../CLAUDE.md): one subject per file,
   or an index.

## Verify

Each to its own log, then read the log:

```bash
npm run typecheck > _tmp/typecheck.log 2>&1
npm run boundaries > _tmp/boundaries.log 2>&1
npm run links > _tmp/links.log 2>&1
npm run test:unit > _tmp/unit.log 2>&1
npm run build > _tmp/build.log 2>&1
npm run e2e:locked -- <each e2e spec the change touches or adds> > _tmp/e2e.log 2>&1
```

- **e2e runs one at a time on the whole machine**: `npm run e2e:locked`
  takes a lock in the game folder that every slot shares and waits inside
  Node while another slot holds it. Run it with `run_in_background` and read
  its log when notified; never `npx playwright test --project=e2e` directly.
  Playwright does not build, so the build line comes first. The e2e run needs
  the installed game, which is `..` from the worktree.
- **A spec in `e2e/001` or `e2e/002` needs `e2e/000/foundation.spec.ts`
  first** in the same run — it writes the `.env` the later phases read.
- **The unit suite never runs beside an e2e run in the same slot**:
  `e2e/scratch.ts` clears `_tmp/saves` and `_tmp/profile` at the start and
  end of every Playwright run, so a unit run beside it fails on the profile.
- CI runs typecheck, boundaries, build, the unit suite, the link check and
  `fleet.mjs verify`; the e2e suite only runs locally.
- A disasm PR: `node tools/links.mjs .` in the disasm worktree.

## Review

**A `read` PR (the disasm repo)**, in this order:

1. **Re-read every address yourself BEFORE reading the note.** Take the PR
   body's `## Addresses read` list, run `python tools/xdis.py` on each, and
   write your own one-line reading of each into your review draft. Only then
   read the note and compare.
2. **The arms are read whole.** For the claims the issue turns on, follow each
   arm from its first instruction to its last and every jump target in a
   switch. A claim decoded from the middle of a routine is a defect.
3. **Negatives are searches, not verdicts.** "Nothing calls it" must list the
   `callers` and `refs` run; "no map places one" must name the script over all
   61 POGs.
4. **The doc rule**: one subject per file, a new file indexed at its sorted
   place, a correction that replaced the wrong text, `node tools/links.mjs .`
   passing.
5. **The issue is answered**: every acceptance question with an address, or
   `Part of` and what is left.
6. **What the player sees** is stated, in plain words.

**A code PR**, besides the shared checks: re-read the exe numbers the specs
assert with `tools/xdis.py` in the disasm worktree, and keep that re-reading
out of the public review — there, write which citations were checked and
whether they agree; a disagreement names the note and address, with the
detail in a comment on the disasm side.

## Merge

- The base is `master` in both repos.
- CI on a code PR: `ci.yml` (boundaries, typecheck, build, unit) and
  `docs.yml` (links, fleet verify). On a disasm PR: its `links.yml`.
- A paired disasm PR merges before its code PR.

## Slots

```bash
scripts/fleet-slots.sh <count>
```

makes `pow-fleet-<n>` and `pigs-disasm-fleet-<n>` in the game folder beside
the main checkouts, detached at `origin/master`, with `node_modules`, and
rewrites each slot's `.claude/settings.local.json`: the game folder as a
working directory (the disasm worktree, the exe and the e2e lock are in it),
a broad Bash allow list, and `FLEET_SLOT` for the guard. Safe to run again.

**Made 2026-11-02: five slots.** Slots 1–3 are for readers and developers, 4
and 5 for the two reviewers. The planner and the merger need no slot and run
in the main checkout. A worker session is opened in its slot's code worktree;
a reader works in the disasm worktree beside it.

## Traps

- `git show <rev>:<path>` has its argument mangled by Git Bash's path
  conversion; prefix it with `MSYS_NO_PATHCONV=1`.
- PowerShell mangles UTF-8 on this machine; Bash only.
- A one-off measurement over the game's files is a script under `_tmp/`, never
  committed: Python for raw bytes, or a throwaway Playwright config under
  `_tmp/measure/` to use the repo's own TypeScript readers.
- Lessons this project paid for itself: [LESSONS.md](LESSONS.md).
