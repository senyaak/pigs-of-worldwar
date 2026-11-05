# The battle map — the library's scanner

- **The battle MAP is the library's SCANNER, it is never opened and it is never
  closed.** The exe draws none of it: it loads `chars\top.mad` only to have an
  object to pack two screen coordinates into, and the dispatcher keeps that
  object out of the world and hands the pair to `_d3d.dll`'s `DrawScanner`
  (0x454913/0x4582F0, dll 0x1000485C/0x10009810). It slides in over twenty
  frames when a battle starts and stays: its enable bit has exactly two writers
  in `.text`, a zero in the constructor and a one in the HUD setup, so the
  slide-out is dead code. It sits **110 in from the left and 75 up from the
  bottom**. The library RESIZES it — smaller while a shot charges and while
  the MAP VIEW camera is up, two callers of `afSetScannerSizeSmall` — and
  **`[play]` overrides that: it is always one size.** "Миникарта не должна
  отдаляться вообще." Both numbers stay read and unapplied in
  `lib/game/scanner.ts`. `lib/game/mapView.ts`, `scanner/notes.md`. `[exe]`
  for the widget, `[play]` for the size.
- **The map is TILTED, it does NOT follow the camera, and nothing about it is
  masked.** The board is a square of the WHOLE level seen through a camera
  28.125° above the ground (the library's Euler angles are `(0, 3776, yaw)`
  against a full turn of 4096), with a real ±15% ground-plane recession — 167
  pixels wide at its near edge, 128 at its far one, 70 tall. The camera's
  POSITION cancels out of the vertex arithmetic exactly, so the board only
  TURNS; and there is no clipper, no scissor and no viewport change anywhere on
  the path, so its corners sweep round in the open. `[exe]`
- **The map's picture is one texel a tile, and its colours are the library's.**
  `afInitScanner` locks a 64×64 surface once per battle and writes
  `palette[type & 0x1F] * shade >> 9` into every texel, shade running 64..194
  with one vertex's height across the map's range — then hands it over with
  `afOverwriteTexture`. `lib/game/mapRaster.ts` carries the palette. `[exe]`
- **The shade lights the PEAKS, the channel is five bits, and the WHITE on the
  board is the original's.** `height` is an elevation, positive up — proved
  four ways, of which the plainest is that water sits at the map's MINIMUM
  (`scanner/notes.md`) — so shade 64 is the lowest vertex, where the
  arithmetic is the exact 8→5 bit conversion, and 194 the highest. Each
  channel is then CLAMPED at 31 by the library itself (`cmp ecx,1Fh / jle /
  mov ecx,1Fh`, dll 0x1000A3F4), so any palette row over 82 blows out on high
  ground: row 9 is `100,100,100`, and CAMP's boundary plateau turns the whole
  rim pure white. Play reported that as four white stripes; it is what the exe
  draws, and `unit/scanner.spec.ts` pins both ends of the scale. `[exe]`
- **The board is stretched BILINEARLY**, which was the last open question about
  the widget. The library writes `D3DTSS_MAGFILTER` and `MINFILTER` = LINEAR
  once at start-up (dll 0x10006518/0x1000652C — the only two filter writes in
  its whole `.text`) and `DrawScanner` never touches the state, so the 64×64
  picture is smoothed across its 167 pixels, not point-sampled. `[exe]`
- **An espionage pig is off the map on anybody else's turn, and there is no
  range.** Classes 8, 9 and 10 — SCOUT, SNIPER, SPY — get marker 0xFF whenever
  their team is not the team whose turn it is (0x440C67), and the library drops
  the blip; the same test hides the name over the pig's head. It cuts both ways:
  your own scout is off your own map through the enemy's turn. Only four model
  names get a marker at all — CRATE1, CRATE2, CRATE4, PROPOINT — and DRUM sits
  one place past the window on purpose. `[exe]`
- **A minefield IS on the map — as red GROUND, not as a marker, and only the
  mines that were there when the battle opened.** The same fill loop writes a
  solid red texel wherever the tile's mine bit is set, unconditionally and for
  everybody; the texture is never rebuilt, so a mine laid during play never
  shows, and one that goes off stays red: the map's copy of the flags is taken
  when the map loads. `bomb` in `MAPICONS.MTD` really is dead art — it has no
  reference in the library at all. The other way a buried mine shows is on the
  ground, not on the map: [terrain.md](terrain.md). `scanner/visibility.md`,
  dll 0x1000A3E6, 0x10002561. `[exe]`
- **A tile is drawn one column up z from its own row.** The library builds each
  texel's column from one vertex and the tile on that vertex's -z side, so a red
  texel sits one tile up z from its mine, tile row 0 fills the first two columns
  (the copy at dll 0x1000A431), and tile row 63 is not on the picture. No shipped
  map has a mine in that row. `scanner/board.md` § Which tile a texel shows, dll
  0x1000258D. `[exe]` for the place, `[measured]` for the row.
