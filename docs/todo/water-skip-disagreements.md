# THE WATER SKIP: two places the engine and the exe still disagree

Found 2026-08-25 while answering play's question about the frog effect, by
re-reading `Projectile::OnHitLandscape` (0x437c74) and its two arms to their
last instruction. The SKIP itself is right and is now in the brain's dry run
too (lib/game/evaluate.ts). These two are the leftovers, both in the ENGINE:

1. **The 150 threshold is applied to the wrong quantity.** `skipsOnWater`
   (lib/game/grenade.ts) gates the IN-PLANE speed against
   `WATER_DOUSE_SPEED`; the exe gates the TOTAL |v| — `fld [edi+0x14]`, the
   contact record's own velocity LENGTH (built at 0x418310) — and asks the
   approach CLASS separately (0x407772: rising / grazing / plunging, the
   cutoff exactly 45°). The remake's `along > |vy|` reproduces that class
   test exactly, so only the threshold is off: an arrival a hair shallower
   than 45° with 140 in the plane and 190 total SKIPS in the exe and douses
   here.
2. **The kind exemptions are written down and not applied.** `grenade.ts`
   records in a comment that kinds 0x0C..0x17 (the bullets), 0x2C..0x2E and
   `[proj+0xA2]` of 3 or 4 all DOUSE whatever the speed — read at
   0x437c9d/0x437cad/0x437cbc — and nothing in `lobs.ts` acts on it. So a
   contact rocket skims here where the exe puts it out. **One thing is still
   unpinned and should be settled first**: which rows the bazooka actually
   carries in `+0xA2`, because if it is 3 or 4 then the exe's own "a
   skipping contact rocket does not detonate" exit (0x437f10) is
   unreachable, and the two readings cannot both be right.

Neither has been seen in play. Item 1 is a one-line change once somebody
decides it is worth diverging from; item 2 wants the `+0xA2` read first.
