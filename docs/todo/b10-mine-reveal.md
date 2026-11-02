# B10. The mine REVEAL is a texture swap, and now it is READ

"Инженеры и командос с героем видят жёлто-чёрные текстуры там где есть мины", the
range applies to the ground AND the map view, and the enemy is not shown them at
all. What is built instead is the `WE_MINE` model for the engineer family (5, 6,
7) inside 1024 on the ground. Play parked it twice — "индикатор мин пока рано, у
нас нет инженеров щас" — so it waits on the classes.

**Read 2026-08-18, and three of those four clauses need correcting.** Play's
memory of the yellow-and-black GROUND is exactly right and it is the whole of
the mechanic:

- **The reveal is 0x4767A0**: a 3×3 block of tiles round the pig, read through
  `Map::GetTile` into `[pig+0x182]` and stamped back through `Map::SetTile`
  (0x4768C0 / 0x476BA5 → `afAdjustMapTile`), the cell it was taken at kept at
  `[pig+0x2C]`/`[pig+0x2E]` so it travels with the pig. The tail walks the same
  3×3 testing bit 0x40, the mine flag. **So the range is THREE TILES, not
  1024** — `DETECT_RANGE` in `lib/game/mines.ts` is an invention that should go.
- **The classes are `[pig+0x19C] ∈ {4, 5, 6, 7, 0x0E}`** — COMMANDO, SAPPER,
  ENGINEER, SABOTEUR, HERO, gated also on `[pig+0x2EC]` not being 1 or 8. Our
  `DETECTORS = new Set([5, 6, 7])` is the set that CARRIES skill 35 MINE, which
  is a different thing from the set that SEES one.
- **The map shows a minefield, but not through this and not as a marker.**
  `bomb` in MAPICONS.MTD has no reference anywhere in `_d3d.dll` — mines are a
  tile bit and not an object, so there is nothing to hang a blip on. What the
  map does instead is bake the bit into its own picture: `afInitScanner`'s fill
  loop writes a solid RED texel wherever `flags & 0x40` is set (dll
  0x1000A3E6), once, when the battle opens. So a placed minefield is red ground
  on everybody's map with no class gate and no range, and a mine LAID during
  play never appears there at all — the texture is never rebuilt. "The enemy is
  not shown them" is not implemented in either place.

Still waiting on the classes to exist, so this is a correction to make when the
work is picked up, not one to make now.
