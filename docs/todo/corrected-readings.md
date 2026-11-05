# Readings the notes cleanup changed — check the remake against each

Splitting the disasm notes re-checked every place two readings disagreed, with
`tools/xdis.py`, and these came out different from what the remake may have
been built on. Each is a check first: what the remake does, against what the
exe does, and what play sees. Nothing has been changed in the code for them.

4. **Every effect stage fires at `when + 1`**, not only the first
   (`effects/stages.md`): the remake's effect timings may be a frame early.
