# B9. A trodden mine wants an EXCLAMATION MARK over it

Six places ruled out by measurement rather than by looking: the mine's effect
(0x4c/0x55 are the BLAST, row 14), the whole tread path (0x46bfd9..0x46c169), the
projectile's model, `WE_BANG`, `MAPICONS.MTD`, all 743 texture names in the
install, and every one of `gtext`'s 272 strings. **Where to look next — and
fonttims IS traced now** (2026-08-11, `library/notes.md`): **0x44EBA0** is the
battle's only consumer of `fonttims.mad` (`[0x520668+0x3F8]`), it draws in
world space, and the damage numbers flow through it (particle type 0x23 →
0x44F950). An exclamation mark over a mine would be drawn there; read its
callers (0x440A20, 0x45E110) for a site passing a character rather than a
value. `weapons/mines.md` has the negative results.
