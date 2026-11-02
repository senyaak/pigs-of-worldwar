# The battle HUD

- `[exe]` **The pig NAME plates are SMALL — settled twice, and the font
  GLOBALS are context-switched slots, not files.** The plates tried BIG,
  then CHARS2, and play sent both back; the 2026-08-28 re-read pinned the
  real chain (the 2026-08-27 one had named a clip test and an overlap
  counter as "print helpers"): dispatcher 0x459B20 → drawer 0x45A5C0 →
  `[0x51BA54]` only — and `[0x51BA54]`/`[0x51BA58]` hold CHARS2/CHARS3 in
  the frontend but are REBUILT as `FETEXT\small`/`big` on the way into a
  battle (0x480D10 at 0x47E187). So frontend/notes.md's "0x51BA54 =
  CHARS2" and library/notes.md's "= small" were both right about different
  program states. GameChars/BigChars are PSX leftovers no PC binary loads.
  `PLATE_FONT` in `ui/hud.ts`, no metrics — the battle's letters carry no
  tracking (the frontend flag is clear in a mission) — and STRETCHED ×2
  vertically, width 1:1, which is the library's own glyph quad
  (`min(2·h, 45)`, text/notes.md): SMALL stands 24 tall on screen. The
  full text-object read (no outline pass exists; the /C colour escapes;
  the heart being a blinking font glyph coloured by status) is
  text/notes.md in the disasm repo.

- `[CHECK — remake]` **Two numbers on the dashboard are the remake's own**,
  and each says so where it lives: the GREEN the dial's face is filled in (the
  archive ships the beaded RIM and no disc behind it, so the face is a filled
  ellipse matched to play) and the PINK the heart is painted (its art is
  white). Correct them against play. The heart's ×2 GRADUATED to `[exe]`
  (2026-08-28): the original's plate heart is a GLYPH of the plate font,
  blinking, riding the same ×2 vertical stretch the battle draws every
  glyph with (text/notes.md) — and its colour comes off a per-STATUS
  table, which is the poisoned green's own mechanism.
- `[gap]` **The power gauge and the weapon icons wait for a weapon.**
  `newpow1..7` and `powg1` are the gauge — which the original shows only when
  the weapon in hand needs one — and `FACETIMS.MAD`, despite the name, holds
  `wepn01..20` with the crosshair and pointers. The slot they go in is drawn
  and deliberately empty.
