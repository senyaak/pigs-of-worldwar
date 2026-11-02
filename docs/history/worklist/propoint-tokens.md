# The PROPOINT tokens — **BUILT 2026-08-21**

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play's ruling, 2026-08-18: **one point for finishing, one for coming through
without a death, and UP TO THREE tokens on a map — and not all of them stand
on it: some spawn only through EVENTS.** The measurement agrees and is now
pinned in `e2e/000/propoint.spec.ts`: the POG places **eleven** PROPOINT
records over the 61 maps, **ten of them live** on **eight** maps (DESVAL and
EMPLACE two each; MASHED, GUNS, LIBERATE, FJORDS, EYRIE, TESTER one each) —
BAY's carries field 14 = 0 where every other carries 19, so the map draws it
and it hands over nothing. The debrief's display table (0x4D3560) promises up
to five. The missing ones are event-spawned and that spawner is now READ; see
the objectives note below.

**What is built.** A PROPOINT is object type **395** and is a pickup of its
own KIND rather than a crate (`lib/game/pickups.ts`), because what the record
says is inside it — weapon 1, one round, the same on all ten — is not what it
gives. Walking into one counts it, takes it off the map with its own script
command the way a crate goes, and says so on the bus (`promotionPoint`). The
count leaves the battle beside the kills, reaches `missionReward`'s third
argument — which had been sitting there unused since the day it was written —
and lights the debrief's SPECIAL BONUS row, which had been hardcoded grey.
The sergeant says his drop-point line over it, and that one line is
`[CHECK — remake]`: the words are play's and they name this moment, the CALL
SITE is not (`SARGE_POINT` in `lib/game/sergeant.ts` is one number to move).

**What to watch in play**: eight maps out of sixty-one carry one, so on the
other fifty-three there is nothing to see. LIBERATE is the earliest.
