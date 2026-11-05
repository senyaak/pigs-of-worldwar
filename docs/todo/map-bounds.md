# A MAP THAT BUILDS NOTHING ON THE LINE — **THE OWNER'S CALL**

Play's report, 2026-08-25: "похоже границы на первой карте не верны". On 2026-08-26 the
data was read rather than guessed at (`terrain/boundary.js` and `terrain/boundary.md` in
the disasm repo).

**The limit is not wrong, and it is not per-map.** What the walk stops at and what a
thrown pig does past it are built: [../facts/map-limit.md](../facts/map-limit.md).

**What differs is what each map BUILDS on it**, and that is the answer to how it feels.
Counting the wall bit ring by ring inward over every shipped PMG: 19 maps carry their wall
ring at ring 7, whose inner face is −12288 to the unit, flush with the clamp, so the
invisible line has a visible wall standing exactly on it. Four put it at ring 8, one tile
inside, and **27 build nothing at all**.

**ESTU, the first mission, is one of the 27**: 0% wall through ring 7, 6% at ring 8. So on
the first map a pig is stopped in open ground by a clamp with nothing to explain it, which
is what play walked into. CAMP, by contrast, has its ring at 7 and reads correctly.

So what is open is **what the remake should DO on a map that builds no barrier**, and that
is play's call, not a reading. The raised RIM most maps carry is authored terrain, not a
boundary: it stops a pig as ordinary wall tiles and it is what whitens the scanner.
