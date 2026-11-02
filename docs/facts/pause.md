# The pause

**ESCAPE is the PAUSE, and a pause stops the WORLD while the CAMERA goes
touring.** `ui/battle.ts` owns one flag and each domain reads it in its own
way. The world stops because `running` gates the whole frame in
`three/battle.ts`, so `engine.update` is never reached and the fixed-step
accumulator never sees the time. The sound stops by suspending the one shared
`AudioContext`, which holds a half-spoken line where it was instead of losing
it. The dashboard keeps drawing on a delta of ZERO, so the bar stops scrolling
and the plates stop fading — with the MAP the one exception, because its size
belongs to the camera rather than the world.

**And a paused mission is NOT a still picture — the camera FLIES.** The exe
hands it mode 7, the same MAP VIEW skill 63 enters, whose per-frame handler
advances a bearing six of 4096 EVERY frame and puts the camera at
`x = 11000·cos θ`, `z = 11000·sin 2θ` — the sine's index doubled, so the path
is a FIGURE-EIGHT about the world origin — at the height of the map's own
highest ground. What it looks at is a pig, eased in at a thirteenth a frame,
changing every 126 frames or when the flight comes within 4408 units of it.
`lib/game/mapView.ts` carries every number. So `three/battle.ts` takes a
`paused` predicate BESIDE `running`: the first says the world has stopped, the
second says what to do instead of nothing.

**Switching subject with a still camera is the VICTORY camera, not this one**
(`lib/game/endOfGame.ts`, one survivor every two seconds). That mistake was
built once, off a note that had read only the subject half of mode 7 — and on
a one-pig map it produced a camera that never moved at all.

The menu itself is
`lib/game/pauseMenu.ts` (five rows and no more: the exe's lit row dispatches
through a five-entry jump table) drawn by `ui/pauseMenu.ts` on the HUD canvas,
and it is driven by the battle's own keys because the exe reads one pad. Two
things follow. **Escape is the battle's own action, never `menuBack`** — that
one is in `MENU_ACTIONS`, which the battle deliberately drops. And **the pause
is SINGLE-PLAYER only**: play's rule, "в мп вообще никаких остановок", and a
lockstep battle cannot have one side stop the clock. What it is PRINTED in is
`[play]` and the divergence list carries it: CHARS2, not the `FETEXT\small`
the exe prints every line of this menu with.

**ABORT is a LOSS, and there is no MISSION ABORTED screen.** gtext 189 carries
those words and nothing in the executable reads it; the exe writes −2 into the
outcome word and falls into the same debrief call the ordinary end takes, and
that page only ever asks `outcome == 0`. So the pause's ABORT leaves with the
`lost` verdict and lands on the loss debrief — SPACE RETRY, ESCAPE EDIT SQUAD
— while `aborted` keeps meaning the TOOLBAR's walk-out, which is the remake's
own button and has no original to be faithful to.

**A battle does not step until it is SHOWN.** The scene is built when
`battle.open()` resolves, which is exactly when the briefing's loading bar
fills — so `three/battle.ts` takes a `running` predicate and the frame is a
no-op until the battle is the view. Without it the five-second drop-in runs
under the loading screen and a player who reads the briefing lands before
looking at it.

- `[play]` **The PAUSE menu is printed in CHARS2**, and the exe prints it in
  `FETEXT\small` — read twice, and not in doubt: every line of 0x45A9B0 goes
  through the object at `[0x51BA54]`, thirty-nine times, and the big one at
  `[0x51BA58]` is not touched once. SMALL is twelve pixels tall with a
  four-pixel `I`, and play called it unreadable twice running — "шрифт гавно",
  then "надо другой взять". CHARS2 is sixteen tall and is what every other
  menu in the game is written in. **The volume BAR keeps SMALL**, because its
  width is arithmetic rather than taste: the track is twenty `I ` pairs, `I`
  is 4 wide and a space advances 8, so a cell is 12 and the track is exactly
  240 across a panel of 260. `ui/pauseMenu.ts`.
