# The landscape — tiles, blocks and their light

- **A tile's terrain type is its LOW 5 BITS** (`and edx,1Fh`, 0x46fde4 — checked
  2026-08-12). The bits above are flags: 0x20 water, 0x40 mine, 0x80 wall.
  Measured over the shipped maps the same day: 1865 tiles carry type 11, and
  **not one of them is 0x0b** — 1857 are 0x2b and 8 are 0xab. An unmasked
  `=== 11` matches nothing at all. `[measured]`
- **A block's world position is its PLACE in the file, and a file row runs −z.**
  `parsePmg` mirrors the row once so every consumer keeps "vertices run +x with
  the column and +z with the row". Proof: 0 of 4096 cells disagree with
  `Map::SampleHeight` on nine maps (`terrain/mirror.js`), against ~3500 the
  other way. `[measured]`

- **The ground carries its own light.** Each PMG vertex stores a brightness byte
  the original modulates the tile texture by, Gouraud across the triangle; it
  fits a light straight overhead with almost no ambient (ARCHI R² 0.81) and
  neighbouring blocks agree on shared vertices. `three/terrain.ts` draws it
  unlit, texture × shade. `[measured]`
- **A buried mine shows as ground, to a detector and nobody else.** Each mine
  tile within one tile of a COMMANDO, SAPPER, ENGINEER, SABOTEUR or HERO (classes
  4, 5, 6, 7, 14), on both axes, wears `Language/Tims/Mine.tim` in place of its
  own texture, with no turn or flip, at its own height and shade. The eyes are the
  whole side whose turn it is, not only the acting pig, and a dead detector keeps
  seeing until its body has left the map; the ground goes back as the pig walks on
  and when the turn passes. `scanner/visibility.md`, 0x4768C0, 0x4A6E30, 0x4A55BF;
  `lib/game/mines.ts` `revealed`, `three/mineGround.ts`. `[exe]` Play: "видят
  жёлто-чёрные текстуры там где есть мины". `[play]` The art is 32×32, opaque, a
  4×4 checkerboard of near-black and yellow. `[measured]` Clearing a trodden
  mine's bit does not unstamp its tile in the exe, so it stays lit until the
  detector's next restore; here the ground goes back at once. `[gap]`
- **A tile is two triangles**, split along (col+1,row)–(col,row+1) — the same
  diagonal the mesh uses, so collision and visuals are one surface.
  `TerrainQuery.patch`. `[exe]`
- **`MapTileSlip` is not slip**: it is which half or diagonal of a wall tile is
  solid, read by `Map::IsBlocked` (0x4a7000) and by no other reader of that
  byte. `[exe]`
- **The tile's rotate/flip byte is one flip bit and a 0..3 turn COUNT** (bits
  1-2), flip applied first. The four UVs are a ring round the quad. The turn's
  DIRECTION is the one thing here measured rather than read — the disassembly
  composes to a forward shift and the shipped maps say backward (883 steep
  tiles, `terrain/turn.js`), and the residual is now an unfound v-convention
  flip in the TIM → page path. `[measured]`

- **Never compare a tile's type byte whole** — mask with `0x1f` first.

- **Never add a light to the ground.** Lighting those polygons again — with the
  per-face normals `computeVertexNormals` gives split vertices — is the
  faceting the baked shade replaces.

- **Do not tune the tile turn table by eye, and do not make it a setting.** It
  is pinned byte by byte in `e2e/000/terrain-viewer.spec.ts`.
