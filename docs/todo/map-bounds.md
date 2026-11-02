# PLAY'S REPORT, 2026-08-25: THE BOUNDS OF THE FIRST MAP — **MEASURED**

Play's line was "похоже границы на первой карте не верны", and on 2026-08-26
the data was read rather than guessed at (`terrain/boundary.js` and
`terrain/boundary.md` in the disasm repo).

**The limit is not wrong, and it is not per-map.** `WORLD_LIMIT` is the
exe's own ±0x3000, an immediate compiled into `TryMove` with no map field
behind it: `Map::Load` reads no bounds, and the 60-byte mission record holds
sky, weather and colour only. Against a world of ±16384 in 64 tiles of 512
that clamp is a fixed inset of EIGHT TILES, the same on every level.

**What differs is what each map BUILDS on it**, and that is the answer to
how it feels. Counting the wall bit ring by ring inward over every shipped
PMG: 19 maps carry their wall ring at ring 7 — whose inner face is −12288
to the unit, flush with the clamp, so the invisible line has a visible wall
standing exactly on it — four put it at ring 8, one tile inside, and **27
build nothing at all**.

**ESTU, the first mission, is one of the 27**: 0% wall through ring 7, 6% at
ring 8. So on the first map a pig is stopped in open ground by a clamp with
nothing to explain it, which is what play walked into. CAMP, by contrast,
has its ring at 7 and reads correctly.

So the open question is no longer "what is the number" but **what the
remake should DO on a map that builds no barrier** — and that is play's
call, not a reading. Three things are known and none of them is chosen:

1. the exe's clamp applies **only to the player-driven pig and not in mode
   13**; the remake clamps every pig, the ballistic path and the swim
   unconditionally. **`[play]`, 2026-08-26, says which way that goes**: in
   the original a BLAST can throw a pig past the walkable boundary — "там
   можно чтобы взрывом отбросило за проходимую границу вроде - но потом
   обратно свин сам бежит" — and then walks itself back in. So the
   clamp belongs on the WALK alone, and something has to bring a pig home
   afterwards; that arm is not found yet (`terrain/boundary.md`);
2. the AI's search grid is derived from `WORLD_LIMIT` (`lib/game/pathgrid.ts`),
   which is why that session's plans sat on ±12032 — the grid's own corner,
   not a map edge, so it is not evidence of a bounds bug;
3. the raised RIM most maps carry is authored terrain, not a boundary: it
   stops a pig as ordinary wall tiles and it is what whitens the scanner.
