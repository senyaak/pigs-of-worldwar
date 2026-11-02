# Time

- **`FRAME_SECONDS` is 1/15** (`lib/game/ballistics.ts`) and it is the rate of
  everything counted in frames. The walk has its own knob, `WALK_SCALE = 4/3` in
  `lib/game/movement.ts`, on the forward and back speeds only. `[play]`
- **The exe's own step is 52 units a frame** — request 64, `Pig::Walk` takes
  `sar eax,4` of it times the grunt's 13 — against a tile of 512. `[exe]`
- **25 Hz is an INFERENCE.** Three durations come out round at 25 and awkward
  anywhere else (the turn clock's hundredths, the crush counter's 250 frames =
  10 s, the wedge counter's 25 = 1 s), and 25 is the PAL field rate halved. No
  call site says it: the exe reaches `timeGetTime` indirectly. `[exe]`, inferred

- **Do not re-propose `FRAME_SECONDS` at 1/20 or 1/25, or `HEIGHT_SCALE`
  doubled.** Both were built, shown to play and answered — the reasoning is in
  `docs/history/why.md`.
