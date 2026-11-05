# Readings the notes cleanup changed — check the remake against each

Splitting the disasm notes re-checked every place two readings disagreed, with
`tools/xdis.py`, and these came out different from what the remake may have
been built on. Each is a check first: what the remake does, against what the
exe does, and what play sees. Nothing has been changed in the code for them.

4. **The landing thresholds**: 0x32 is the blocked-ground eject, 0x4b the dust
   (with `[pig+0x1b2] > 2`), 0x19 a sound at 0x471158 and the land/bounce fork
   at 0x4711d8, 0x46 the fatigue. Disasm `movement/landing.md`.
