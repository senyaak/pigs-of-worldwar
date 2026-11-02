# Sprites

- `[play]` **Sprite TIMs are trimmed of their ALIGNMENT PADDING, and the PC
  original's are not.** A TIM's width is stored in 16-bit units, and four of
  the world map's territory masks plus all ten clock digits ship with a full
  opaque-grey filler column the artist never painted. The PC exe DRAWS it —
  it hands the 2D record a −1 size sentinel and the library substitutes the
  padded width and UVs (`library/notes.md`, read 2026-08-19) — which is the
  white hairlines play reported twice on the world map. Play's memory of the
  original (the PSX's) has none, and play wins: `spritePadding` in
  `lib/formats/tim.ts` measures the filler by a deliberately narrow rule and
  the sprite loader trims it (`main/assets.ts`, `loadTims` only — models and
  terrain map UVs over the full surface and are never trimmed). The rule is
  pinned twice: synthetically in `unit/timPadding.spec.ts` and over the
  shipped archives in `e2e/000/timpadding.spec.ts` — exactly `hog2/sau3/
  sau4/trot2` and `timer0..9`, and nothing else, because `pause5`'s dark rim
  and `fpole`'s solid columns are art an eager rule would eat.
