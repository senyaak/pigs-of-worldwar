# Hogs of War file formats

Summary of the community's reverse-engineering work, checked against the real
PC installation this repo lives in. Primary sources:

- [how-doc](https://github.com/DummkopfOfHachtenduden/how-doc) — C# structure
  definitions for every format below
- [OpenHoW](https://github.com/TalonBraveInfo/OpenHoW) — open-source engine
  reimplementation (archived)

All values are little-endian. "Verified" notes are from files in this install.

## MAD / MTD — archives

Flat containers, no magic, no compression. Two layouts:

**Named** (most archives): a table of 24-byte entries, running from offset 0
up to the first entry's `position`.

| offset | size | type     | field    |
| ------ | ---- | -------- | -------- |
| 0      | 16   | char[16] | name (NUL-padded) |
| 16     | 4    | u32      | position |
| 20     | 4    | u32      | length   |

**Raw** (`Chars/mcap.mad` only): same idea, 8-byte entries, no names.

| offset | size | type | field    |
| ------ | ---- | ---- | -------- |
| 0      | 4    | u32  | position |
| 4      | 4    | u32  | length   |

Detection: parse as named and validate (printable names, table length
divisible by 24, entries in bounds); fall back to raw with the same checks.

Verified: `Chars/british.mad` = 81 named entries (VTX/NO2/FAC triples per
model, last entry ends exactly at file size); `Chars/mcap.mad` = 93 raw
entries, every length divisible by 272 (the MCAP keyframe size).

## Models (inside Chars/\*.mad)

A model is three sibling entries sharing a base name: `<name>.VTX`,
`<name>.NO2`, `<name>.FAC`. LOD suffixes: `_hi`, `_me`.

**VTX — vertices**, 8 bytes each, count = length / 8. Positions are
**bone-local** (found here, not in how-doc): without adding the accumulated
HIR bone offset for `boneIndex`, every body part piles up around the origin.
Y points down.

| offset | size | type | field |
| ------ | ---- | ---- | ----- |
| 0      | 2    | s16  | x     |
| 2      | 2    | s16  | y     |
| 4      | 2    | s16  | z     |
| 6      | 2    | s16  | boneIndex |

**NO2 — normals**, 16 bytes each:

| offset | size | type | field |
| ------ | ---- | ---- | ----- |
| 0      | 4    | f32  | x     |
| 4      | 4    | f32  | y     |
| 8      | 4    | f32  | z     |
| 12     | 4    | f32  | boneIndex |

**FAC — faces**: 16-byte header (reserved), then

- u32 triangle count; triangles, 32 bytes each: 6×s8 UVs (uA,vA,uB,vB,uC,vC),
  3×u16 vertex indices, 3×u16 normal indices, u16 unknown, u32 texture index,
  4×u16 unknown
- u32 quad count; quads, 36 bytes each: 8×s8 UVs, 4×u16 vertex indices,
  4×u16 normal indices, u32 texture index, 4×u16 unknown (no lone u16 here)

Quad corners are **perimeter-ordered** ABCD (found here): the split must share
the AC diagonal (ACB + ADC after the winding reverse). Face corners are stored
reversed relative to their NO2 normals; windings agree with NO2 in the game's
own Y-down space.

Face UVs are **unsigned** bytes (how-doc says signed) — pixel coordinates into
the referenced texture, origin top-left, V down. The face's texture index
points into the paired `.mtd` archive (same base name as the `.mad`), in entry
order — verified visually: pcace_hi + british.mtd produces the correctly
dressed British ace.

## Textures — TIM (inside \*.mtd)

Every MTD entry is a standard PSX TIM image. All 120 entries of british.mtd
are 4-bit CLUT mode; the decoder also handles 8-bit CLUT.

| offset | size | type | field |
| ------ | ---- | ---- | ----- |
| 0      | 4    | u32  | magic = 0x10 |
| 4      | 4    | u32  | flags: bits 0–2 mode (0 = 4-bit CLUT, 1 = 8-bit CLUT), bit 3 = CLUT present |

CLUT block (when present): u32 block length (self-inclusive), u16 VRAM x, u16
VRAM y, u16 colors per CLUT, u16 CLUT count, then colors as u16 **A1B5G5R5**
(R in the low bits; value 0x0000 = fully transparent).

Pixel block: u32 block length, u16 VRAM x, u16 VRAM y, u16 width in 16-bit
units (×4 pixels in 4-bit mode, ×2 in 8-bit), u16 height, then indices packed
low-nibble-first (4-bit). Rows run top to bottom.

Nation skins: `AMERICAN.MTD`, `FRENCH.MTD`, … in `Chars/` mirror the entry
layout of the per-nation archives, so the same model dresses per team.

## Skeleton & animation

**HIR (`Chars/pig.HIR`) — hierarchy**: 20 bytes per bone, 15 bones:

| offset | size | type | field |
| ------ | ---- | ---- | ----- |
| 0      | 4    | s32  | parentIndex |
| 4      | 2    | s16  | x     |
| 6      | 2    | s16  | y     |
| 8      | 2    | s16  | z     |
| 10     | 10   | —    | reserved |

Bone order: 0 hip, 1 spine, 2 head, 3–5 left arm (upper/lower/hand),
6–8 right arm, 9–11 left leg (upper/lower/foot), 12–14 right leg.

**MCAP (`Chars/mcap.mad` entries) — motion capture**: a sequence of 272-byte
keyframes (entry length / 272 = frame count):

| offset | size | type      | field |
| ------ | ---- | --------- | ----- |
| 0      | 2    | s16       | per-frame root offset (see below) |
| 2      | 30   | s8[10][3] | per-branch positions (10 non-leaf bones × x,y,z) |
| 32     | 240  | f32[15][4]| per-bone rotations — see below |

how-doc calls the rotations quaternions; on real data they are **not** (found
here): the fourth float of every bone is exactly 1.0 in every frame while the
first three range over ±π. They are **euler angles in radians** plus a
constant. The exact convention (solved in `pigs-disasm/anim/`, three
independent tests on the shipped data):

```
local = Rx(-x) · Ry(-y) · Rz(-z)      applied PARENT-RELATIVE
```

- **Negated** — the game's matrices are row-major (row-vector × matrix), the
  transpose of a column-vector engine's; for a rotation, transpose = negate.
  Only negated do the arms hang down out of the T-pose bind instead of
  sticking up. Legs never show it — their bind direction is already down,
  which is how the bug hid.
- **Parent-relative**, not absolute: in clip 4 "Turning on Spot" the hip is
  all zeros while the limbs move, so body yaw lives on the object.
- **XYZ order** — motion capture is smooth, and XYZ minimises frame-to-frame
  joint travel by a wide margin (10818 vs 11977 for the runner-up).

The model's forward axis is **+X**: the leg-swing axis is Z (run cycle,
upper-leg L/R correlation −0.887, anti-phase), and rotating a +Y leg about Z
swings it along X.

The leading field is **signed** and traces a smooth ramp up and back down
(`0,0,2,4,7,10,12,12,11,…,-1,-2,-5,-9,…`), never a spike — a per-frame root
offset, not an event marker; 41 of the 93 clips use it. Worth knowing because
it rules out an animation event channel: footstep and weapon-release timings
have to be **derived** from the skeleton, which works cleanly
(`pigs-disasm/anim/audio-events.md`).

Playback rate is a guess (25 fps); the branch positions are small per-frame
deltas whose exact meaning is still uninvestigated — clips play fine with
rotations alone, minus root motion.

**Clip indices are known** (recovered from the exe's debug-name pointer
table — pigs-disasm/animations/notes.md): 0 run, 3 walk backwards, 4 turn on
spot, 5 swim, 8/9/10 jump start/middle/end, 11 scramble, 27/28 idle cycles,
38 falling, 47-49 dying, 50 drowning, 58 parachuting — 59 named of the 93
entries in mcap.mad.

## Terrain (Maps/\*)

Per map `<NAME>`: `<NAME>.PMG` (ground mesh), `<NAME>.PTG` (ground textures),
`<NAME>.POG` (object placement), `<NAME>.MAD` (map-specific assets).

**PMG — ground mesh**: exactly 16×16 blocks of 368 bytes (verified:
ARCHI.PMG is 94208 bytes). Per block:

| offset | size | type      | field |
| ------ | ---- | --------- | ----- |
| 0      | 2    | s16       | x offset — **overwritten at load**, see below |
| 2      | 2    | s16       | base height (how-doc: unreliable; heights are absolute anyway) |
| 4      | 2    | s16       | z offset — **overwritten, and the file's sign is the opposite** |
| 6      | 2    | s16       | unknown |
| 8      | 100  | (s16+u8+u8)×25 | 5×5 vertex grid: height + shade + zero |
| 108    | 4    | u32       | always 0 |
| 112    | 256  | 16 bytes × 16 | 4×4 tiles |

Per tile: bytes 0–5 zero, byte 6 = type (`0x1F` mask type, `0x20` water,
`0x40` mine, `0x80` wall), byte 7 = slip, bytes 8–9 zero, byte 10 =
rotate/flip, byte 11 = **u8** texture index into the sibling PTG, bytes
12–15 zero. how-doc reads a u32 at 11–14; the exe reads bytes 10–11 as one
u16 and unpacks `texture = word >> 8`, so the index is a single byte and the
u32 is an accident of the zero padding.

**A block's world position is its PLACE in the file, not the offsets it
stores.** `Map::Load` (exe 0x4a5635) overwrites both before anything reads
them: `x = (col − 8) × 2048`, `z = (row − 8) × 2048`, from `col = index % 16`
and `row = index / 16`. The x matches the stored field; the z is its
opposite, because the file counts z down where the game counts it up. So a
vertex sits at `x = block.x + c × 512` and `z = block.z + r × 512`, **both
counting up**, and the map spans the world exactly, −16384 to +16384 on each
axis. Trusting the stored z builds the map back to front — invisible in
isolation, because mesh and collision mirror together, and fatal to anything
asymmetric. Pinned in `e2e/002/placement.spec.ts`.

**The rotate/flip byte** is bit 0 FlipX and bits 1–2 a **0..3 quarter-turn
count** — how-doc's separate `Rotate90`/`Rotate180` flags are that number's
two bits, and treating them as independent operations gets a third of the
tiles wrong. The library keeps a tile's four UVs as a ring around the quad,
mirrors ring slots 0↔1 and 2↔3 for the flip, then turns by shifting which
slot each corner takes — **flip first**. Unturned, the texture lands U along
+x and V along +z, V being the texture ROW, top-down.

The turn's DIRECTION is the one part measured rather than read: the
disassembly composes to a forward shift, the maps say backward, and the
half-turn — its own opposite, so unmistakable — is what settles it. Numbers,
addresses, and the reversal that has not been located:
`../pigs-disasm/terrain/notes.md`. The table is pinned byte by byte in
`e2e/000/terrain-viewer.spec.ts`.

Vertex heights are **elevation, up-positive** (found here) — the opposite of
the models' Y-down vertices: water tiles sit at the small values on every map
checked (ARCHI sea ≈ 132 vs land ≈ 1337). An engine in Y-down space must
negate them.

The vertex byte how-doc records as "unknown ≤255" is **baked brightness**
(found here), and it is what makes the original's ground look rounded: the
texture is modulated by it and interpolated across the tile, so slopes darken
smoothly instead of breaking into facets. Fitting it against the vertex
normals of a whole map gives a light pointing straight up and almost no
ambient — ARCHI `shade ≈ 249·n·(0,1,0) + 5`, R² 0.81, 30% of vertices at the
255 ceiling; CAMP fits the same light at R² 0.31 with baked shadowing on top,
DESVAL 0.69. The high byte of the pair is zero on every map checked, and
blocks store identical shade *and* height on the vertices they share, so the
5×5 grids join into one continuous 65×65 grid with no seams.

An engine that lights these polygons itself is drawing the shading twice, and
per-face normals over split vertices is exactly the faceted look the baked
shade avoids — the remake draws the ground unlit, texture × shade.

The slip byte is not slip: `Map::IsBlocked` (exe 0x4a7000) reads its low
nibble as WHICH half or diagonal of a wall tile is solid, and nothing else
reads it at all. Its fractions run +x and +z, so the exe's shapes apply
literally. Sliding ground is derived from the terrain gradient instead.

**PTG — ground textures**: u32 count, then `count` equal-sized TIMs —
`(fileSize − 4) / count` bytes each (verified: ARCHI.PTG = 238 × 576-byte
32×32 4-bit TIMs).

**POG — object placement**: a u16 count, `count` records of 94 bytes, then a
u16 that is 0 (verified on all 61 shipped files; GENMUD alone trails eight
spare bytes). No how-doc was used — the layout is what the files say, and
`../pigs-disasm/objects/layout.js` reproduces every number below.

| offset | size | field |
| ------ | ---- | ----- |
| 0      | 16   | model name, NUL-padded |
| 16     | 16   | second name — "NULL" in all 6322 shipped records |
| 32     | 62   | 31 × s16 |

Fields, by index: 0-2 position, 3 the record's own 1-based place in the
file, 4-6 pitch/yaw/roll in 4096ths of a turn, 7 object type, 8-10 collision
box extents ÷128 **in the order (z, y, x)**, 13 a bitfield whose low six
bits are always set, 17-24 and 30 always zero, 25-27 an unrelated second
position that is editor scratch. 11, 12, 14-16, 28 and 29 are undecoded.

A record is paired to its geometry **by name**: the base name of a
VTX/NO2/FAC triple in the map's own `<NAME>.MAD`, textured from the sibling
`<name>.mtd` — the character pipeline minus the skeleton. Prop vertices are
already absolute, and the bone index their VTX carries (0..14, with no .HIR
anywhere near the maps) means something else; adding bind offsets for it
scatters them.

5550 of 6322 records resolve that way, and every one that does not ends in
`_ME` — those are the **pig spawn markers**, carrying the pig CLASS in
`type` (0..16, the `gtext` class list from index 63).

**Stored z counts down**, exactly as the PMG's block offsets do: of the
eight sign-and-swap combinations, `(x, −z)` is the one that puts objects on
the ground (mean |y − terrain| 343 against 986 for the next best). **Stored
y is an elevation** in the PMG's own scale — against doubled heights the
median object sits 1464 units UNDER the ground — and it is the model's
CENTRE, not its feet, so each type sits its own constant amount above the
terrain (TREEG 352, CRATE1 96, BRIDGE_S 0).

**The yaw is negated and a quarter turn off**: `phi = −yaw − π/2`, for art
that faces +x as the pig's does. Neither half is read from the disassembly;
both are measured, from CAMP's bridge (whose two ramp pieces only form one
walkway under the negation) and its training dummy (stored at yaw 0, and
facing the green path only under `−π/2`). Full derivation, including two
tests that look decisive and are backwards:
`../pigs-disasm/objects/notes.md`.

## SRL — sound banks (Audio/, FESounds/)

The one shipped format that is not binary: plain CRLF text, a four-line
header then two lines per entry.

```
099            entry count
000
000
AUDIO\SFXDAY   the bank's own name
0              entry id …
AUDIO\AMB_1D.wav       … and its file
1
AUDIO\AMB_2D.wav
…
```

Three ship: `Audio/sfxday.srl` and `Audio/sfxnight.srl` — 99 entries and
byte-identical, so the PC release has no separate night bank — and
`FESounds/Fesounds.srl` with 27 for the frontend. It matters because the exe
names a sound by NUMBER: this is what turns a decoded index into a file.

The files themselves need no reader. Effects and speech are RIFF, 16-bit PCM
mono at 22050; the music in `MUSIC/` is Ogg Vorbis. Chromium decodes both.

The thirteen footsteps sit at ids 14-26, one per surface material (GRASS,
ICE, LAVA, METAL, MUD, QUAG, ROCK, SAND, SNOW, STONE, SWIM, WATER, WOOD).
WHICH terrain type picks which is not decoded — see
`../pigs-disasm/anim/audio-events.md`.

## MGL — frontend images (FEBmps/FEBMP.MAD)

Every `.mgl` entry is an LZ77+RLE-compressed **8-bit BMP**. No community
documentation existed; the compression was reverse-engineered here from the
game's own decompressor (`warhogs_.exe` @ file offset `0x97dd0`) — full
derivation in `pigs-disasm/mgl/notes.md`. One control byte dispatches:

| control     | consumed | meaning |
| ----------- | -------- | ------- |
| `0x00`      | 1        | end of stream |
| `0x01-0x3f` | 1 + c    | literal run of `c` bytes |
| `0x40-0x4f` | 1        | byte delta run: step = out[-1]−out[-2], `(c&0xf)+3` bytes |
| `0x50-0x5f` | 1        | word delta run: step = word[-2]−word[-4], `(c&0xf)+2` words |
| `0x60-0x6f` | 1        | repeat last byte `(c&0xf)+3` times |
| `0x70-0x7f` | 1        | repeat last word `(c&0xf)+2` times |
| `0x80-0xbf` | 1        | match: len 3, back `(c&0x3f)+3` |
| `0xc0-0xdf` | 2        | match: len `((c>>2)&7)+4`, back `((c&3)<<8 | p1)+3` |
| `0xe0-0xff` | 3        | match: len `p2+5`, back `((c&0x1f)<<8 | p1)+3` |

Matches copy forward byte-by-byte, so overlapping references replicate.
Verified: decodes `pigbkpc1.mgl` byte-identical to its uncompressed twin
`Language/Tims/Pigbkpc1.BMP` (308178 bytes), and all 237 FEBMP.MAD entries
decode into BMPs whose header size field equals the decoded length.

`pigbkpc1.mgl` is the 640×480 main-menu background.
