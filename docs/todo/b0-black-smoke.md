# B0. THE BLACK SMOKE IS DROWNED, NOT MISSING — diagnosed 2026-08-11

First in this section because play has raised it more times than anything
else on the list ("чёрный дым вообще не появляется… я тыщу раз уже
жаловался"), and because the cause is now READ OUT OF OUR OWN SOURCE rather
than guessed at. Two earlier passes blamed the blend mode; the blend mode is
not the problem.

**What the code does.** Row 0 is right and both clouds are spawned
(`ROW_ZERO`, `lib/game/effects.ts`): seventy sprites of dark red (16,0,0) on
one frame and seventy of near-black (4,3,0) on the next, from the same point.
`three/effects.ts` then paints the red one ADDITIVE and the dark one NORMAL
(`LIT = 8` splits them), which is the right instinct — additive light cannot
darken, so the smoke has to cover.

**Why nothing shows.** Arithmetic off our own constants:

- the red sprite's colour is `cloudChannel(16)/255` = **0.39**, and every
  sprite adds `0.39 × BLOB_ALPHA(0.4)` ≈ **0.157** to the red channel at its
  centre — so **about seven overlapping sprites saturate red to 1.0**, and
  seventy are born at one point;
- **nothing fades a cloud**: the colour law is flat by the exe's own reading
  and the alpha only drops over the last tenth of the life, so the red ball
  sits at full saturation for its whole **twenty frames**;
- both clouds live exactly those twenty frames and occupy the same volume, so
  the near-black cloud is painted INSIDE a solid red ball and dies with it.
  There is never a frame where the smoke is on screen without the fireball
  over it.

So the smoke is drawn, every time, and cannot be seen. What survives the ball
is the three bursts — fourteen puffs, mid-grey, gone in about another half
second.

**Where the fix has to come from, and what NOT to do.** Do not tune the split
or flip blend modes again — that is the loop the last three passes were stuck
in. The two numbers that decide saturation are both the remake's own
inventions and both now have a decoded replacement: `BLOB_ALPHA` (0.4, picked
because "seventy sprites at full opacity is a painted ball") and `BLOB_UNIT`
(1/64, invented because the sprite's size unit was thought unreadable). It is
readable now — **the 2D-poly record's half-extents ride the same perspective
factor as the position, so the engine's `(200 − age) × size × 12.5` is in
WORLD units at the sprite's own depth** (`library/notes.md`). Work the real
size out first; the saturation follows from size and count, and the alpha
follows from that.

One correction to carry into the fix: the CLOUD sprites are **untextured** in
the original (the draw writes texture −1), so the canvas blob is right in
kind for them. It is the fourteen BURST puffs that are textured, from
`expltims.mad`'s `ptp*` art.
