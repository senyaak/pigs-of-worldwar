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
| 0      | 2    | u16       | unknown |
| 2      | 30   | s8[10][3] | per-branch positions (10 non-leaf bones × x,y,z) |
| 32     | 240  | f32[15][4]| per-bone rotations — see below |

how-doc calls the rotations quaternions; on real data they are **not** (found
here): the fourth float of every bone is exactly 1.0 in every frame while the
first three range over ±π. They are **euler angles in radians** plus a
constant. Order XYZ applied in the game's Y-down space produces coherent
poses (verified visually on clips #001/#005 — limbs stay attached and move
plausibly). Playback rate is a guess (25 fps); the branch positions are small
per-frame deltas whose exact meaning is still uninvestigated — clips play
fine with rotations alone, minus root motion.

## Terrain (Maps/\*)

Per map `<NAME>`: `<NAME>.PMG` (ground mesh), `<NAME>.PTG` (ground textures),
`<NAME>.POG` (object placement), `<NAME>.MAD` (map-specific assets).

**PMG — ground mesh**: exactly 16×16 blocks of 368 bytes (verified:
ARCHI.PMG is 94208 bytes). Per block:

| offset | size | type      | field |
| ------ | ---- | --------- | ----- |
| 0      | 2    | s16       | x offset (world; steps 2048 = 4 tiles × 512) |
| 2      | 2    | s16       | base height (how-doc: unreliable; heights are absolute anyway) |
| 4      | 2    | s16       | z offset (rows advance −z) |
| 6      | 2    | s16       | unknown |
| 8      | 100  | (s16+s16)×25 | 5×5 vertex grid: height + unknown ≤255 |
| 108    | 4    | u32       | always 0 |
| 112    | 256  | 16 bytes × 16 | 4×4 tiles |

Per tile: bytes 0–5 zero, byte 6 = type (`0x1F` mask type, `0x20` water,
`0x40` mine, `0x80` wall), byte 7 = slip, bytes 8–9 zero, byte 10 =
rotate/flip flags (`1` FlipX, `2` Rotate90, `4` Rotate180), bytes 11–14 =
u32 texture index into the sibling PTG, byte 15 zero.

Vertex heights are **elevation, up-positive** (found here) — the opposite of
the models' Y-down vertices: water tiles sit at the small values on every map
checked (ARCHI sea ≈ 132 vs land ≈ 1337). An engine in Y-down space must
negate them.

The slip byte marks sliding ground; nonzero values are direction hints
(how-doc's `MapTileSlip`: 1 Bottom … 8 TopRight), but on CAMP some hints
point across or up the actual slope — deriving the slide from the terrain
gradient matches the geometry better.

**PTG — ground textures**: u32 count, then `count` equal-sized TIMs —
`(fileSize − 4) / count` bytes each (verified: ARCHI.PTG = 238 × 576-byte
32×32 4-bit TIMs).

**POG — object placement**: still to transcribe from how-doc (`Map/POG`,
`ObjectFlag`, `ObjectItemType`, `ObjectScriptType`).

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
