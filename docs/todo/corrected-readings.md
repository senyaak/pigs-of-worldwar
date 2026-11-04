# Readings the notes cleanup changed — check the remake against each

Splitting the disasm notes re-checked every place two readings disagreed, with
`tools/xdis.py`, and four came out different from what the remake may have
been built on. Each is a check first: what the remake does, against what the
exe does, and what play sees. Nothing has been changed in the code.

1. **The building door.** The arm read as the building's IN (0x469F21, the
   glide steps 0x46A032/0x46A08C/0x46A0E4) is the VEHICLE's; the building's
   starts at 0x46A228 (its own steps 0x46A338/0x46A392/0x46A3EA), and
   0x469B60 is the 57 SPECIAL OPS airlift rather than the door's way out.
   Disasm `objects/getting-inside.md` has the four arms in a table. Against
   `lib/game/doorway.ts` and `lib/game/buildings.ts`.
3. **The charge's burning fuse**, effect 0x1D, is updated by 0x48B85C: ten
   cloud records relaunched in a narrow cone, orange — not the dark smoke of
   0x48AD9D, which is id 0x22's. Disasm `effects/fuse.md`. Against
   `FUSE_TRAIL`; play confirms which the original shows.
4. **The landing thresholds**: 0x32 is the blocked-ground eject, 0x4b the dust
   (with `[pig+0x1b2] > 2`), 0x19 a sound at 0x471158 and the land/bounce fork
   at 0x4711d8, 0x46 the fatigue. Disasm `movement/landing.md`. And every
   effect stage fires at `when + 1`, not only the first (`effects/stages.md`):
   the remake's effect timings may be a frame early.
