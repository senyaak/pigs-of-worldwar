# THE AI — what is left after the 2026-08-24 rewrite

## WHAT IS LEFT

1. **PLAY THE LAST THREE PASSES.** Unseen by play: the zone and the arc test,
   `close-in`, the camera's keep and its shake, the one-second hold on a
   landed body. Everything before those was played and signed off.
2. **THE FREEZE IS NOT DIAGNOSED.** Play met one — "а в конце щас игра тупо
   зависла" — and the log ends on DEN firing a sniper rifle with no `[turn]`
   after it. What was done is INSURANCE, not a fix: the parent walk in
   `pathfind.ts` was the only unbounded loop on that path and it can close on
   itself for a real reason (a cell carries the FEET's height, so it can be
   re-settled cheaper after being expanded — which is what makes a ramp work
   and what breaks the invariant keeping a parent chain acyclic). If it hangs
   again, what is wanted is what was on screen at the moment.
3. **A FOE is still not an obstacle.** Only the squad is. If play sees a pig
   shove an ENEMY rather than go round, the fix is a per-target exemption in
   the flood, not a bigger `BODY_CLEAR` — a blade's mark is 180 units off a
   body and the grid step is 128, so blocking foes at a body's width makes
   melee unreachable. That is why it is written this way.
4. **The lags are measured but not TUNED.** The plan lines say `cells 24891`
   — the whole map — at about 400 ms a plan, once a turn instead of the
   fifteen searches it was. If it is still felt, the lever is the flood's
   budget (`PLAN_TURNS`), not the price list.
5. **THE BOUNDS OF THE FIRST MAP** — play's own report, its own entry below.
