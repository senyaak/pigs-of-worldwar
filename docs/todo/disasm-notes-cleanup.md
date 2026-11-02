# THE DISASM NOTES — split the big ones, and fold their corrections in

The notes grew as journals, and two habits from that time now cost every
reader: pages that hold many subjects, and corrections written beside the
wrong text instead of over it. The disasm repo's README states the rule both
violate.

## Split the notes past about 500 lines

Measured 2026-11-02: `movement/notes.md` 1265, `effects/notes.md` 1057,
`objects/notes.md` 873, `scanner/notes.md` 744, `tutorial/notes.md` 516. Each
becomes the index of its pieces at the same path, the way `weapons/fire.md`
and `frontend/notes.md` were split on 2026-11-02, so the remake's citations
still land. One issue per note.

## Fold the corrections in

`weapons/fire.md`'s index marks the pieces a later one overturned — the
bounce, the water bounce, and four passes at whether a blast throws a pig — and
many notes still carry `~~struck~~` lines and "WRONG, see below". For each:
rewrite the piece into what is true, with the addresses, and delete what was
overturned. The answer is already written; this is editing, not reading, but
every address that survives is re-checked with `tools/xdis.py` on the way.
One issue per note or per group of pieces.
