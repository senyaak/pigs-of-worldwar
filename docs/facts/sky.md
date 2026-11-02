# The sky

- **The SKY is a MODEL, and the `Skys/` folder is not it.** `Chars/SKYDOME.MAD`
  carries two hemispheres — `skydome` over the horizon, `skydomeu` under it,
  544 triangles each in four quadrants — and one of eleven `Chars/<mood>.MAD`
  archives skins them with four 250×250 TIMs. The loader is 0x4866B0; it puts
  both at the origin and scales them 256× across and 128× up, so a dome
  authored round is drawn SQUASHED to half height. Which mood a map wears is
  the first dword of its 60-byte record in the mission table at 0x4D5210,
  paired to the map names at 0x4D1990 — `lib/game/sky.ts` carries the whole
  table, `three/sky.ts` draws it. The exe's `afSetSky` and `afAddSkyToSortList`
  are resolved and never called. `sky/notes.md`. `[exe]`

- `[CHECK — remake]` **The sky dome is SMALL and rides the eye.** The original
  scales it to about four million units across and leaves it at the origin,
  which no depth buffer can draw — the battle's far plane is 100 000 and
  anything past it is clipped. `three/sky.ts` draws the same dome at a radius
  of 40 000, centred on the camera every frame, with depth testing off and the
  first place in the draw order. That is the same picture in the limit and the
  ordinary skybox trick, but the radius is the remake's own number.
- `[gap]` **The mood's SNOW and RAIN are decoded and not built.** The same
  record that picks the dome loads `snow.mtd` for the ten cold maps and
  `rain.mtd` for everything else, and starts one only for cold and ominous
  (0x4854CE). `sky/notes.md`.
