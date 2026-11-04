# Walls and slopes

- **Terrain height never refuses a step, and a wall is not a full stop.** Open
  ground of any slope is walked; a wall tile gets the step-up envelope
  `WALL_CLIMB = fromExeY(128)` from the pig's last free footing, then it
  sidesteps or the wedge counter (25 frames) throws it out downhill.
  `lib/game/locomotion.ts`, pinned by `e2e/002/locomotion.spec.ts`. `[exe]` for
  the constants, `[play]` for walls not being ladders.

- `[exe]` **The wall envelope is a STAND-IN for a known original, no longer
  an inference.** The sweep is read (0x406bb0, 2026-09-15, `movement/sweep.md`):
  wall geometry is NOT in the exe's collision world — a wall is a face of the
  landscape heightfield wearing friction 0.01 / restitution 0.99, the sweep
  never reads a tile flag, and the step-up / sidestep pair is reached only by
  hitting an OBJECT. What refuses the climb in the original is the pig's own
  blocked-tile reactions (eject, the wedge counter, the landing fork —
  `movement/notes.md`), on a body that slides. The remake still refuses a
  step at a wall tile and walks the decoded step-up envelope instead; that is
  now `[deliberate]`, and the honest replacement is the slippery contact.

- `[play]` **A hillside is walked DOWN, and only a face past WALK_OFF_GRADE
  (60°) is fallen off — and that number is PLAY'S DIAL.** The first build's
  fall test was a slope test at 13.0°, under CAMP's median slope of 14°, so
  most descents were a stutter of launches ("спускаюсь с горки — падаю - иду
  - падаю"). The look-ahead now hunts a CLIFF FACE — ground falling away
  steeper than WALK_OFF_GRADE within one FACE_PROBE — so ordinary grades are
  walked pinned to the ground (the climb has no limit at all) and a real
  wall still launches a walking step ahead. The 60° is not measured from
  anything: a census of every shipped map (`movement/slope-census.mjs`)
  found tile faces run CONTINUOUSLY from flat to ~88° with no gap between
  "hill" and "cliff", 12% of non-wall tiles past 45° — and play walks faces
  past 45° both ways. A walked surface found past 60° in play moves the
  number. `lib/game/movement.ts`; pinned in `unit/movement.spec.ts` and the
  downhill walk in `unit/locomotion.spec.ts`.
- `[exe]` **The Scramble is the walk in a wall**, not a property of the ground.
  `Pig::Walk` puts a forward step in the wall slot when the feet are down, the
  spot a full request ahead holds nothing but landscape, the ground there is
  higher than here, and the pig's own point is blocked (0x46abfd..0x46acf3);
  the run-cycle picker answers that bit with clip 11 (0x46c49a..0x46c511).
  `movement/walls.md`, `movement/clips.md`. So terrain type 11 scrambles nobody,
  a pig walking out of a wall downhill or over flat wall runs, and a pig backing
  or standing there does not scramble. A pig the wall envelope holds at the base
  wears it too, because the envelope is the stand-in above for the pig the exe
  lets one step in. The 4-unit cap of the same slot and the Scramble's
  distance-driven cursor are not built. `lib/game/locomotion.ts`, pinned in
  `unit/locomotion.spec.ts`.
