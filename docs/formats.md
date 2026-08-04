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

**VTX — vertices**, 8 bytes each, count = length / 8:

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
| 32     | 240  | f32[15][4]| per-bone rotation quaternions (x,y,z,w) |

## Terrain (Maps/\*)

Per map `<NAME>`: `<NAME>.PMG` (ground mesh), `<NAME>.PTG` (ground textures),
`<NAME>.POG` (object placement), `<NAME>.MAD` (map-specific assets).
Structures documented in how-doc's `Map/` folder — to be transcribed here
when terrain work starts.
