# THE FRONTEND'S OTHER SCREENS — fifty-two records, not read

- **The frontend's OTHER screens — and there are FIFTY-TWO of them, wearing
  23 layouts.** A "screen id" 0..0x16 is the layout; the menus themselves are
  52 records of 72 bytes, built from tables in `.data`, and `frontend/menus.js`
  in the disasm repo prints all of them: title, items, and what each item
  DOES (an action and a parameter — 1 is navigation, 22 is a dead row, which
  is where our greyed-out OPTIONS comes from in the original). The main menu
  is record 1 of kind 1 and is read end to end. What that gives the next
  screen:
  - **MULTI-PLAYER is record 16 of kind 2** — the same layout as SELECT TEAM,
    which is the family that loads `selcog` and `name0..5`, so that is where
    the carriage belongs. And the original's is **six** items — TEAM A, B, C,
    D, then DONE and NETWORK — where ours is four slots and three actions.
  - the tree above it: ONE PLAYER → record 14 (NEW GAME → SELECT TEAM, LOAD
    GAME → LOAD), OPTIONS → record 2 (AUDIO, CONTROLS → CONTROLLER SETUP,
    CREDITS), QUIT APPLICATION → record 43, a REALLY QUIT APP? box.
- ~~**Where the frontend's WORDS land**~~ — READ, and built: a box per line
  out of `.data` (four per-screen tables for a screen's own string, one table
  of 16-byte records at 0x4C1728 for the ITEMS, indexed by a running total of
  the counts at 0x4C16C8), centred across the box, riding the entrance through
  a text origin that carries a constant -25. The whole frontend is CHARS2 —
  screen 3's CHARS3 is the only exception — and which of its three shades a
  line wears is decided by the MEAN of the colour it is asked for. **The one
  thing to check in play: our title was BIG and the game's is CHARS2**, half
  the height.
- ~~**What the plate widget's two per-frame numbers do**~~ — READ: a crop and
  a drop on the words as the plate turns, `k = 100 - |v|` per cent of a
  letter's height, dropped by what it lost. The rows and the title get
  different tables, so they turn at different rates.
