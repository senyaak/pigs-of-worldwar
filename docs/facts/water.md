# Water

- **Water is art the artist made SEE-THROUGH** — palette bit 0x8000, the PSX's
  semi-transparency flag. `afIsPointWatery` short-cuts it with a per-texture
  kind computed at upload (dll 0x10007b6c); MIXED art has its translucent texels
  punched out on the way to the surface (dll 0x10007d79) and the probe reads
  those holes back. The tile's water BIT is only a prefilter. `lib/game/watermask.ts`,
  `formats/tim.ts`. `[exe]`

- `[gap]` **Open water is punched, where the original blends it.** The library
  punches water texels only out of MIXED art (kind 1); a kind-2 tile keeps its
  texture and is drawn translucent over the water. `three/terrain.ts` cuts
  every water texel out of every texture, so open water shows the flat sheet
  colour and reads plainer than the original's. Not chased.
- `[play]` **Water renders as: flatten + mask + one plain sheet.** Per water
  REGION (flood-fill of water-flagged tiles — the exe's "Fitting water." JOINS)
  a level is fitted (mode of the region's corner heights; 128 on every shipped
  map's main water); render vertices below their region's level are raised to
  it; shore art gets its water texels punched (cutout); one SEE-THROUGH sheet
  of the map's averaged water colour sits a hair under each region's level
  (`WATER_ALPHA`, 0.62 — it was opaque and play produced a screenshot of the
  shipped game showing a submerged pig through the surface). NO wat01/wat02
  pattern on the surface — the shipped game's footage shows smooth water, and
  every patterned attempt read wrong. What those two grey TIMs and the DLL's
  under-landscape 49×49 water grid are actually FOR is still open (play memory
  says a sink/kill layer, not the visible water).
