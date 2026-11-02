# THE CAMPAIGN SCREENS — threads left open while they were built

The campaign's screens were built 2026-08-13..19 and the record is
[campaign-spine.md](../history/worklist/campaign-spine.md) and
[what-gates-what.md](../history/worklist/what-gates-what.md). These are the
threads that record leaves open. Each one is small and none blocks play.

- **SELECT TEAM's other machinery.** The original carries more moving metal
  round the console than the remake draws. Not read.
- **The TITLE box's folding is wrong on every screen placed that way.** Record
  15's raw box folds to (206, 55) 300 and play moved it to (170, 29), centred
  on the screen's middle. The `.data` tables are not in doubt; the fold from
  them to pixels is. PLAYER's (161, 45) is suspect too.
- **NAME ENTRY's grid spread** is the remake's own `INNER`. The arm 0x43148C is
  read and disagrees with play's seven columns; which box the text object is
  handed is the next read.
- **The help line's markup**: `fetext` 770 carries `/Z(131,62)` and `/N`/`/S`
  escapes nothing parses yet. The escape list is in [low.md](low.md), the
  text-object entry.
- **PLAYER screen**: which pair of stripes the original uses (`pip1/2` or
  `strp1/2`) and every line's y on the board are `[CHECK — remake]`.
- **LOAD GAME's own draw arm** (record 10, 0x41DF4A) is unread; the look is
  `[CHECK — remake]` until it is.
- **What YES and NO do in the original** on PLAY TRAINING MISSION? is unread.
  The remake's fork is `[play]`.
- **CHEAT LEVEL SELECT** (record 44, the team named NAUGHTY PIGS) is a `[gap]`,
  buildable on the existing machinery.
- **The region-complete FMVs** (03..07, endings 08/09, Bink), the load
  screen's gamma fade and its tumbling-hat overlay are read and not built.
