# THE DISASM NOTES — the rest of the cleanup

The five notes past 500 lines are split: `movement/`, `effects/`, `objects/`,
`scanner/` and `tutorial/` are each an index of one-subject pieces now, with
their corrections folded in, and the water, the height and the library's
registry moved to `water/mask.md`, `water/drawing.md`, `terrain/height.md` and
`library/function-names.md` (disasm repo, merged to its master).

## Fold the corrections in, in the other notes

About 45 notes still carry `~~struck~~` lines, "WRONG, see below" or dated
"corrected" headings (`grep -rn "~~\|WRONG\|see below\|RETRACTED\|OVERTURNED"`
in the disasm repo). For each: rewrite into what is true, with the addresses,
and delete what was overturned; an address that survives is re-checked with
`tools/xdis.py` on the way. The heaviest are `weapons/fire/fire-table-sized.md`,
`damage/notes.md`, `army/notes.md`, `speech/pigs.md`, `weapons/cluster.md`,
`turns/notes.md`, `water/notes.md` and `weapons/emplaced.md`.

`weapons/fire.md`'s five blast-throw pieces and its two OVERTURNED pieces go:
what still stands in them moves into the piece that is right, and the index
loses its "superseded" lines.

## Stale text the split found beside it

- `weapons/fire/weapon-in-hand-camera.md` sends skill 63 to arm 0x493C82; it
  never reaches that dispatch (`scanner/map-view.md`, arm 0x4935A0).
- `weapons/mines.md` says nothing draws a mine; the battle map and the
  class-gated reveal at 0x4767A0 both do (`scanner/visibility.md`).
- `weapons/emplaced.md` cites a "PE section map" rule `scanner/notes.md` never
  had.
- `water/notes.md` and `weapons/gas.md` still call 0x4700de / 0x467f2a the
  Scramble; it is the sneeze (`movement/clips.md`).
- `weapons/fire/blast-visual-row.md` has ids 0x5d/0x5f reading row 18; they
  take 0x489083, which reads no row, and row 18 is id 0x40's
  (`effects/rows.md`).
- `weapons/espionage.md` and `objects/airship.md` are still journals.
- Notes citing a section of an old note (`objects/notes.md` from
  `movement/sweep.md`, `terrain/notes.md`, `scale/notes.md`, `water/notes.md`,
  `damage/notes.md`, `weapons/emplaced.md`, `anim/audio-events.md`,
  `script/notes.md`, `weapons/mines.md`, two `weapons/fire/` pieces; and
  `tutorial/notes.md` from `skills/notes.md`, `turns/notes.md`) land on the
  index; point each at its piece.

## Then the remake's citations

The remake cites `movement/notes.md` 25 times, `objects/notes.md` 21,
`effects/notes.md` 16, `scanner/notes.md` and `tutorial/notes.md` 11 each, and
`weapons/fire.md` 72: each lands on an index now and should name its piece.
