# B16. READ AND NOT BUILT — two closers and a family that changed shape — 2026-08-31

All of it came out of the same session as B14/B15. Each is READ; none is guessed;
none is built. They are small apart from the last, which got BIGGER on reading.

**Two ways the exe ends a turn that the remake has no equivalent for.** The
big one — a BLOW on the acting pig — is built (`turns.md`, the `blow` flag), and
so is the training-ground floor ([turns.md](../facts/turns.md)). These are the
leftovers of the same read:

- **The fatal fall, 0x46d7bb.** `[pig+0x388]` is a FRAME COUNT of the fall, set
  to 1 at 0x46fc92 and incremented at 0x46fe8a. Past 25 the drop becomes the
  flying state that the ground can hurt (built — `falling.ts`); past **250**,
  ten seconds of continuous falling at 25 Hz, the pig is dead: effect 12, the
  scoreboard, and EndTurn if it was acting. That is falling out of the world,
  not off a ledge.
- **The map bound, 0x46d039.** `|x|` or `|z|` past **15871** and the pig is
  snapped back to its own cell and tallied dead — again with the handover if it
  was acting.

The first is not reachable in the remake today, which is the honest reason it is
unbuilt rather than an oversight: nothing lets a pig fall for ten seconds. The
second is, now that a blast throws a pig past the line
([../facts/map-limit.md](../facts/map-limit.md)), and it is
senyaak/pigs-of-worldwar#32.

**And 40 ARTILLERY CLUSTER is not the job it looked like.** `weapons/cluster.md`
was read whole this session and its skim corrected three times over. The one
that matters for planning: **the artillery cluster's five children are the
MINE-LAYING projectile** (id 426, kind 38, the one skills 35/36 use) — so the
skill is a 25-point blast plus a five-mine minefield, not a second bomblet
scatter. Building it means laying mines from the air, which is `mines.ts` work,
not another twenty lines in `lobs.ts`.

**The question that used to sit here is ANSWERED and is not a question**
(2026-08-31): a minefield the enemy did not place is exactly what the original
drops, so that is what this drops. "Очевидно что как в оригинале — как можно по
другому?" Nothing to weigh next time it comes up. `[play]`

**What it is actually blocked on is the ARTILLERY, which does not exist here at
all.** No pig can hold skill 40: the whole family 39–44 (`artrang`, `cluster`,
`artgas`, `artrain`, `art1000`, `artshoc`) is absent from `CLASS_KIT`
(lib/game/kits.ts), and nothing in `lib/game/` delivers a called-in shell —
there is no off-map arrival, no aiming for one, no shell. The poison note above
already says as much for its sibling ("Skill 41 GAS SHELL … lands with the
artillery, whenever that is"). So the cluster's five mines are twenty lines
sitting behind a subsystem, and the subsystem is the job. Every number for the
shell itself is in `cluster.md`.

**CORRECTED 2026-09-15 — the subsystem is the BIG_GUN, and it is the
pillbox's design, not a new one.** `weapons/artillery.md` in the disasm repo,
read whole. There is no off-map arrival and no bombardier: skills 39..44 are
the six shells a BIG_GUN building carries in its own magazine (`[bld+0x84]`,
six 12-byte slots — 39 LONG RANGE SHELL ×3 and one each of 40 MINE SHELL, 41
GAS SHELL, 42 FIRE RAIN SHELL, 43 1000 LBS SHELL, 44 SHOCK SHELL), the
inventory menu lists the gun's magazine ahead of the pig's kit while it sits
inside (skill 61), the shot decrements the GUN's slot, the aim is the barrel's
`[bld+0xE2]` (level to 45° up, with the ordinary power gauge), and the shell
leaves from the barrel's tip, 819 units down BIGBAR's local x. Eighteen guns
stand on twelve shipped maps (ARTGUN 4, BHILL/GUNS/ICE/KEEP/MEDIX 2, one on
each generator template). So the build is: the building's magazine and the
menu merge, the barrel as the muzzle, and six lob rows — the `mines.ts` work
for 40 and the gas stream for 41 are already read, and 42 is the fire-rain
droplet `fire.md` has had since 2026-08-24. No class ever holds these skills
and no shipped crate carries them; `CLASS_KIT` is right to leave them out.

The AIRBURST pair is closer to buildable and bigger than it read: both are
**CONTACT, not timed** (the constructor's state machine, 0x43200C — the fuse of
125 in their rows has no reader), 31 scatters five 20-point sub-shells off a
40-point blast, and 32 fires **two whole airburst shells 180° apart** off its
own 50-point one — 330 on one body, twelve detonations. Every number is in
`cluster.md`; what is NOT decoded there is effect parameter rows 1, 3 and 14.
