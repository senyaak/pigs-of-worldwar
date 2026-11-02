# BIGGER THINGS — the ones that were built

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

- ~~**The MAP**, bottom left of the dashboard.~~ **DONE 2026-08-18/19** —
  `ui/battleMap.ts` on `lib/game/scanner.ts` and `lib/game/mapRaster.ts`. It is
  the library's SCANNER, not a screen: a tilted square of the whole level that
  never opens, never closes and is never clipped. `scanner/notes.md` has the
  read; `docs/history/status.md` has what it corrected.
- ~~**The pigs wear their own nations.**~~ **DONE 2026-08-19** —
  `lib/game/nations.ts`, `army/skins.md`, `docs/history/pig.md`. The player's
  squad wears SELECT TEAM's choice and the enemy the campaign's schedule;
  hats included.

- ~~**There is no ESCAPE MENU**~~ — **BUILT, 2026-08-19.** Play named it on
  2026-08-11 and asked for it on 2026-08-19. `pause1..pause8` turned out not
  to be five two-frame widgets at all: they are the **nine-slice frame** of
  the menu's panel, eight 16×16 tiles drawn by 0x45B580, and which is which
  corner was measured off the art. The pause is a MODE (8), the world's tick
  is simply not advanced while it is up, and the menu is five rows drawn with
  the battle's small letters over the live frame. `lib/game/pauseMenu.ts` has
  the rules, `ui/pauseMenu.ts` draws them, `unit/pauseMenu.spec.ts` and
  `e2e/002/pause.spec.ts` pin both halves. Play's own constraint stands and is
  written into the code: a real pause is SINGLE-PLAYER only and multiplayer
  must never stop (docs/history/status.md, "Threads left mid-pull").
  **And the pause's own CAMERA is in, 2026-08-19** — mode 7, the MAP VIEW: the
  camera FLIES, `x = 11000·cos θ`, `z = 11000·sin 2θ` with the bearing
  advancing six of 4096 every frame, which is a FIGURE-EIGHT about the world
  origin at the height of the map's own peak; it looks at a pig, eased in at a
  thirteenth a frame, changing every 126 frames (`lib/game/mapView.ts`). Play
  reported it as "камера летает по кругу над картой" and it was a feature
  nobody had built rather than a bug — then caught the first build of it,
  which walked pig to pig with a still camera and was the VICTORY camera by
  another name. The exe also SHRINKS the corner scanner while it is up and we
  do not: play ruled the map one size. **Skill 63 MAP VIEW is the other way
  into the same mode and is still not built** — it wants the inventory entry
  and the input lockout, and the camera half now exists for it.

  **And the abort is FINISHED too, 2026-08-19** — by finding out there was
  nothing to finish. There is no MISSION ABORTED screen: gtext 189 carries
  those words and has no reader in the executable, and the 0x424298 an earlier
  note blamed is `push 0BDh` as a Y coordinate. The exe writes −2 into the
  outcome word and falls into the same debrief call the ordinary end takes,
  and that page asks only `outcome == 0` — so an abort IS a loss, on
  `pigbkpc2.bmp` with SPACE = RETRY and ESC = EDIT SQUAD. The pause's ABORT
  leaves with the `lost` verdict now; `aborted` stays what it was, the
  toolbar's walk-out, which is the remake's own button.
- **The sky is DONE and shown — this entry is provenance, not work.** The dome,
  the mood's fog and the weather are in and answered by play (2026-08-12);
  nothing below is a defect and none of it is visible. It is here so the next
  reader knows which numbers are the exe's and which are not.
  - **Which of the exe's two angle fields is yaw and which is pitch.** NOT a
    question about our camera, which is fine and untouched: the drawer takes
    `sin([view+0x11754])` for the fall and `cos([view+0x11758])` for the drift,
    and one virtual call fills both (0x44E2FC, not followed). Pitch on the
    first and heading on the second is what `angles()` assumes, along with a
    quarter-turn convention — 1024 is level — inferred from the fact that no
    other reading puts the snow the right way up.
  - **`FOG_SCALE`**, standing in for the undecoded factor between the library's
    z and the world's (`scale/notes.md`).
  - **`FALL_GAIN` and `SIZE_GAIN`**, play's two on top of the exe's amplitudes.
  - **the brightness divisor**: the exe's ramp is `(8 − phase) * 8` and this
    normalises it against its own 64 rather than the engine's 128.

  And one thing reading further cannot change: with the camera still the field
  has only four distinct velocities and 32 flakes move as one, because
  `m = reach − (i & 3)` and the third random the initialiser rolls per flake is
  read by neither drawer. Breaking that up would be a divergence, not a fix.
