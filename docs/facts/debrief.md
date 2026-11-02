# The debrief and the roster

- `[play]` **The DEBRIEF lists only the pigs that FOUGHT** — one after boot
  camp, three after the first mission, five from then on (`fieldedAt`). The
  exe draws five rows always and uses that count only to swap a benched pig's
  portrait for a plain one, its name and badge still printing. What makes this
  play's call rather than a mistake: the exe never shows this page after boot
  camp at all (0x47E61F), so the screen a player meets there is the remake's.
- `[deliberate]` **The debrief SHOWS after the training ground and pays
  nothing for it.** The exe sends CAMP straight to `EndOfMission`; here the
  roll call is wanted, so `paysPoints` gates every token the page draws
  against what `missionReward` actually hands out. The two must never be
  allowed to disagree again — play caught the screen promising two points for
  a mission worth none.

- `[deliberate]` **The roster counts DEATHS, and nothing draws them.** The
  exe has no deaths number at all — a death there is the fall order and the
  slot emptying — and the remake keeps one on the roster pig (`deaths`,
  counted by `regroup` when a pig gets up, so a replay counts nothing and a
  pig gone for good takes its number with it). It was on the `pigpro` board
  as a third pair beside battles and kills, and **play took it off again**:
  "третья иконка не нужна — только сколько битв и сколько убил врагов". The
  board is the original's two counts. `lib/game/roster.ts`,
  `ui/playerScreen.ts`.
