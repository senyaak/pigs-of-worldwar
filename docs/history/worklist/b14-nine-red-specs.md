# B14. NINE SPECS WERE RED AT HEAD — all nine settled 2026-08-29

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Found while verifying the mine and cluster work: a full run was **67 failed**,
and almost all of it was one broken thing wearing sixty-six disguises.

**The cascade is fixed.** `02a36f3` took the frame off the battle
(`#battle-toolbar` is `display: none`) and left `#battle-leave` behind it,
wired. Playwright will not click what is not visible, so `e2e/app.ts`'s exit
table — and five specs that walk out by hand — sat on a thirty-second timeout,
and every spec after them in the same worker went down in the fixture. All six
sites go through `leaveBattle(page)` now, which dispatches the event straight at
the button: it is the remake's own exit, nothing asserts it, and there is no
other way to reach it. 67 → 9.

**The nine that remain were red before any of this**, proved by running them
with only `src/lib/game/` stashed: the same nine, the same numbers, and the one
difference is `002/mines.spec.ts:441` going green with the damage rule in. Four
of them are arithmetic anyone can check by reading:

| spec | wants | gets | why |
| ---- | ----- | ---- | --- |
| `002/mines.spec.ts:120` | `fromExeFrames(12+7) < 0.7` | 0.76 | 19/25 |
| `002/mines.spec.ts:255` | TNT's fuse `< 6.2` | 7 | 175/25 |
| `002/knockback.spec.ts:32` | a rim fling `> 400` | 253.6 | every exe speed is 5/6 of what it was |
| `002/mines.spec.ts:510` | nothing planted before the clip's key-frame | one already down | B12's own flake, still unfixed |

The first three are **stale floors from `EXE_FRAME_SECONDS` going 1/30 → 1/25**
in the same commit, and none of them is a measured constant — each is a guard
rail written when the clock was 1/30. They want re-deriving at 25 Hz, not
nudging: the knockback one in particular is worth a moment's thought first,
because "a rim hit throws you 253 instead of 400" could equally be a fling that
now falls short in play.

**And then all nine were fixed, each against a reading rather than a nudge.**

- **The three fuse/fling floors were re-derived.** The two mine ones are on the
  FRAMES now — rows 40/41 and 53 of 0x4c2030, re-read the same day (arming 0
  fuse 12; arming 50 fuse 125) — because a bound in seconds measures
  `EXE_FRAME_SECONDS` and nothing else, which is exactly how they went red. The
  knockback floor was never the clock at all (`fromExeSpeed` rides
  `FRAME_SECONDS`, untouched): it was a FLAT 400 against a throw that scales
  with the damage, and the round it failed on took NINE points at the rim and
  travelled 254 — right down to the arithmetic. The floor is derived from the
  damage now, `0.4 · v²/g` off `flingSpeed`, measured against both rounds that
  connect (30 points buys 3240 and travels 1709; 9 buys 291 and travels 254).
- **The TNT plant flake (B12's first half) is closed** by sampling in the PAGE
  at frame rate instead of polling over a round trip — a sampler cannot land
  late, and the assertion is on the sequence rather than on one lucky reading.
  B12's other half, `002/grenade.spec.ts:89`, is untouched.
- **`002/spawns.spec.ts` was stale, and the exe says so.** `ClassToModel` —
  sixteen words at 0x4C2E50, read into the display object at 0x440898 with no
  bounds check: `1 2 2 2 6 5 5 5 7 7 8 4 4 4 3 3`, indexing `british.mad` in
  FILE order (pcace, pcgru, pchvy, pcleg, pcmed, pcsap, pcsab, pcsni, pcspy).
  Class 10 SPY is kind 8 `pcspy_me`; class 4 COMMANDO is kind 6 `pcsab_me`.
  `cdd6c6e` corrected `three/soldiers.ts` to exactly this and left the spec on
  the retired marker-suffix guess.
- **`002/trainingStep.spec.ts:124` was the ENGINE, and it is the one play
  named**: the step jump put `carrying[last]` in the pig's hands, which is the
  crate's own skill only while the pig carries nothing else. `Scenery.collect`
  ANSWERS with the skill it handed over now, and the jump holds that. The
  tutorial's first step gives out the BLADE again.
- **And fixing `trainingStep` turned `002/tutorial.spec.ts` red, which was a
  LANDMINE rather than a regression.** `pow.spoken()` is the APP's speech bank
  and not the battle's — it deliberately outlives a mission
  (`002/audio.spec.ts`) and is only emptied by `dispose` — so the tutorial spec
  was taking indices over the whole session's history and passing only while
  nothing before it had ever spoken clips 3, 4 and 5. `trainingStep` had been
  dying half way through since the class kits landed; the moment it ran to the
  end it walked the whole training chain and left a 4 in the list before the
  tutorial had said a word. Both tests take a MARK now and read their own
  stretch, and `pow.spoken`'s own comment — which claimed "this battle" — is
  corrected where it lives.
- **The two crate specs were stale the same way** — a grunt spawns with
  `[[3,∞],[7,∞],[19,3]]` and GUNS' spy with a TNT of its own, so neither "the
  skill appeared" nor "the slot reads one" says anything about the crate. The
  walk is asserted on the crate LEAVING THE MAP (the drawn node), the stack on
  `before + the record's amount`, and `spend`'s drop-at-zero moved to
  `unit/inventory.spec.ts`, where the arithmetic lives and no battle is needed
  to reach it.
