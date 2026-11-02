# Animation

- **The animation library is `Data/_d3d.dll`**, not the exe — which resolves
  `afDrawAnimModel` and friends through `GetProcAddress`. Skeletal maths is not
  in `warhogs_.exe`. `[exe]`
- **Clip indices come from the exe's CALL SITES**, not from its debug name
  table: 0 run, 3 walk back, 4 turn on spot, 5 swim, 8-10 jump, 11 scramble,
  27/28 idle, 47-50 dying/drowning, 82 parachute. The name table lists 59 names
  where the code reaches 83 clips and its last name is wrong — it calls 58
  "Parachuting" and the exe parachutes with 82. Every entry of `ANIM` in
  `lib/game/locomotion.ts` cites the site that plays it. `[exe]`
- **A clip carries its own EVENTS** — six `(phase, id, id)` rows in the library
  (`afGetKeyFrameList`, 0x1002c778 + clip*88), which is where footsteps, the
  grenade release, the blade's strikes and the doorway's glide all come from.
  `lib/game/footsteps.ts`, `lib/game/melee.ts`. `[exe]`

- **Never read a clip index off the exe's name table**; take it from `ANIM`,
  where every entry cites the call site that plays it. `animations/notes.md`
  and `parachute/notes.md`.

- `[play]` **The pig slides, and that stays.** The walking clips carry a body
  about 855 units a second at 25 fps; the exe walks 1560, so the feet skate
  about 2×. Driving playback off the walking speed to close that (a `gait.ts`
  that scaled playback) was built and rejected on sight — the legs whirl, and
  the run clip is not foot-locked to begin with, its two hooves disagreeing by
  40%. `lib/game/clips.ts` plays everything at a flat 25; `movement/stride.js`
  is the measurement.

- `[gap]` **The idle CYCLE is not modelled** — a standing pig loops clip 27 and
  nothing else. The 80-byte table at 0x4d7300 that a spent repeat count steps
  into turned out to be per-WEAPON, not per-pig: record 1 and 2 play "Sword /
  Knife", 22 plays "Using Grenade", and record 0 (no weapon) is empty, which is
  why an unarmed pig falls straight through it. So it lands with the weapons,
  not before. What a pig does while it stands about — the "Choosing idle anim
  from scratch" string — is READ (2026-09-15, `anim/idle.md`): one frame in
  eight the standing state re-picks, and an armed healthy pig gets clip 27
  every time; the variety (a look around, the second standing cycle, the hero
  classes' pose, a shiver or a fan on a cold or hot map, a sneeze when
  poisoned, the cower near a ticking charge, VERY WOUNDED under ten points)
  belongs to empty hands and to state. Still `[gap]` here.

- `[CHECK — remake]` **The drop face is the 004 pair.** An arriving pig wears
  `eyes004`/`gobs004` out of `Chars/FACES.MTD` — the stare and the scream —
  from `dropOpened` to `dropLanded` (three/faces.ts). The exe loads that
  archive unconditionally (0x486030) but HOW it picks a face is undecoded,
  and which pair is "scared" was judged by looking at the art. Correct it in
  play; an expression is one name there.
