# What gates what

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

- The campaign SPINE is closed: save, slots, autosave, LOAD GAME, the
  tutorial question, the map chain and the three mission exits all run.
  ~~**Every mission still opens CAMP**~~ **the campaign opens its own level,
  2026-08-19** — `nextMap(save)` in `main.ts`. All 53 real maps open; what is
  still missing is an AI and a verdict that knows whose side is whose, which
  is section 0A.
- ~~The read-from-scratch debts~~ **ALL THREE READ 2026-08-17**, each a build
  now waiting on nothing:
  - ~~**LOAD/SAVE (kinds 8/9)**~~ **LOAD BUILT 2026-08-18** —
    `ui/loadScreen.ts` wears the original's furniture on our slots: the eight
    `pclit` plates blinking script 1006, the `pcsav` frame, the `pcsvinf`
    panel unrolling as the screen rises from a screen below, `---` for an
    empty slot, the cursor refusing to rest on one, the panel drawing the
    picked squad's badges and MISSION N, and not one sound — the family has
    none. **SAVE ARMY (record 21, kind 9) is deliberately NEVER built**
    (`[play]`): the campaign autosaves and there is nothing to save by hand.
    ~~The player screen's SAVE TEAM label goes with it whenever that screen is
    next touched~~ **gone 2026-08-18** — START MISSION stands alone on its
    plate.
  - ~~**The confirm box (kind 12)**~~ **BUILT 2026-08-18** —
    `ui/askTraining.ts` is the real widget box now: the two springs in from
    the upper right, the `yesno` turn-over landing on `yes` with `Indu008`,
    the six-tick `yesdial` slide with its stand-still window, the words
    behind the hide-flag fade, the leave in reverse. One guessed number
    (`mainbar1`'s repeat seam) and one kept divergence (up/down toggle too).
    Records 0/24/43 — the QUIT confirms — can reuse the module whenever the
    escape menu lands.
  - ~~**The end-of-mission DEBRIEF**~~ **BUILT 2026-08-18** — `ui/debrief.ts`
    is the original's page: the loose BMPs of `Language/Tims/debrief/`
    through their own loader, faces/wounded/`r_i_p` with the team's uniform
    over the living, the pitch-74/73 rows, `Pigbkpc2` behind a loss, the
    greyed SPECIAL BONUS row. Stand-ins, tagged: the `vp` coin for the
    spinning `propoint.mad` and BIG/GameChars for the exe's unread gtext
    font pair. **The CONTINUE/RETRY fork is GONE (play, 2026-08-18)** — the
    backdrop paints its own key bar, so the page now just honours it: on a
    win SPACE continues and ESCAPE replays, on a loss SPACE replays and
    ESCAPE walks away to the squad, which is the exe's `won ? 0 : 2` and the
    home of gtext 193/194. Rows follow the FIELDED count (1/3/5) and the
    training ground's tokens are gated on `paysPoints`.
- ~~the CAMPAIGN MAP~~ ~~READ 2026-08-17, and THERE IS NO SUCH SCREEN~~
  **WRONG — play caught it, and it is READ AND BUILT 2026-08-18.** The map
  lives in the MISSION HOST, not in a frontend record — which is why every
  menu-side search missed it (`pigmap/notes.md` has the whole chain; the
  "never never" lesson holds). Built as the original runs it: START MISSION
  (position 1 on) → the WORLD MAP (`BigMap` under 25 territory patches
  tinted by the defending nation, six banners, the current one blinking) →
  the ZOOM (32 easing steps, patch crossfading into the region page) → the
  REGION (`*phy` flat pages — not 3D — with a pole per mission, flags on the
  conquered, the player's own four-part marker bobbing on the current) → the
  BRIEFING, which IS the loading screen (`level<pos>.bmp` + the 17-step
  loadbar at (152,451) + gtext 257 creeping up; position 1 pastes the
  enemy's `level1n<nation>.bmp` portrait at (342,190)) → a key starts. The
  training ground skips the map and briefs on `level0.bmp`, the exe's own
  gate. A key skips a phase (the exe's); BACK skips the whole map
  (`[deliberate]`). The MISSION LIST stand-in (`ui/missionList.ts`, the
  cheat's mechanics) is DELETED with its spec — the real thing landed.
  `lib/game/pigmap.ts` (the tables), `ui/pigMap.ts`, `ui/briefing.ts`,
  `unit/pigmap.spec.ts`, `e2e/001/mapchain.spec.ts`. **The NEWSPAPER is
  read and built too** (second pass, 2026-08-18): a campaign win prints the
  nation's front page with the story keyed at (23,144) and the photo at
  (309,111), variant off the five fielded survivors (the wipeout split on
  points ≥ 2), story rotated by the new position, six special pages for six
  maps — after the debrief's CONTINUE, any key or 10 s out
  (`lib/game/newspaper.ts`, `ui/newspaper.ts`, `unit/newspaper.spec.ts`).
  **The COLOURS were corrected after play, 2026-08-18**: a territory patch is
  a greyscale MASK and the nation colour a 255-neutral diffuse, and the
  composer ADDS it (SRCBLEND = DESTBLEND = ONE), so the map is `bigmap + mask
  × colour/255` and the blink is a white FLASH rather than a hole. A position
  the campaign has already taken flies the PLAYER's colour.
  **The FLAGS were corrected after play, 2026-08-19**: EVERY stand of a region
  flies one from the campaign's first day, in the colour of the nation holding
  that mission — the per-position loop at 0x483566 carries no comparison at
  all, and the campaign position is not read anywhere in the routine. "Only on
  the conquered" was this repo's invention and it showed as a page of bare
  poles. `pow.pigMap.patches()` and `pow.pigMap.flags()` exist because a map
  with no tints, and a page with no flags, both still paint.
  Still not built from the read: the region-complete victory FMVs
  (03..07, endings 08/09 — Bink), the load-screen gamma fade and its
  tumbling-hat overlay (`fhats.mad` across a frozen frame — the "random
  load screens" that never were; NVIEW*.BMP is dead art nothing reads).
  What the earlier read yielded still stands:
  - **the mission list on screen is the CHEAT** — record 44, CHEAT LEVEL
    SELECT, kind 2, opened by naming the team NAUGHTY PIGS (fetext 0x2EB;
    also sets the tokens to 99): 26 raw map names in a seven-row scroll
    window, and choosing a row MOVES `team+0x53`. Buildable any time on the
    machinery we have; a `[gap]` until then.
  - **the enemy table is rolled at the team's birth** (0x482940) — balanced
    five of each other nation over positions 1..24, FINAL always Team Lard —
    **and the remake now does the same**: `lib/game/enemies.ts`, rolled in
    `campaign.begin`, read back by `missionWonResult`. `[exe]`.
  - the full-screen map art (`lselpc*`) is MULTIPLAYER's SELECT LEVEL
    (record 28, kind 20, arm 0x41E579) — a screen for the `net` worktree's
    future, not the campaign's.
  - mission TITLES (`gtext 11+mapId`) are drawn only by the battle's opening
    card, which `ui/titleCard.ts` already does.
- NEW GAME's first two screens are built. **SELECT TEAM's own pass is done**
  (0x41CBE1 and the widget pass at 0x41E790), and it found three wrong numbers
  in the old summary — which is the argument for doing the NAME ENTRY's pass
  (0x41DC69) before building it too, rather than from the paraphrase.
