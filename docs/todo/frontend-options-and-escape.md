# THE OPTIONS FAMILY AND THE ESCAPE CHAIN — read 2026-08-18, not built

- **The OPTIONS family and the ESCAPE chain are READ 2026-08-18 and wait to
  be built** (`frontend/notes.md`, the 2026-08-18 sections):
  - **VOLUME CONTROL** (record 20, kind 7) — an OVERLAY on the dimmed
    OPTIONS machine: the `vol00` panel rising from below at (100,240), two
    `vollit` knobs at 230+⌊25v/2⌋ (MASTER y+320, SFX y+351), MODE and
    VOICES printing their value (MONO/STEREO/SURROUND, OFF/ON) with the lit
    value flashing; LEFT/RIGHT step, Crunch at the stops, SFX previews
    COINDROP/COINFLIP/SPARKS02/STEAM001 in turn; the exe's VOICES slider is
    built and never drawn. Values live in team bytes +8/+9/+0xA/+0xC and
    persist only through the save.
  - **CONTROLLER SETUP** (record 41, kind 15) — the `pckey` poster
    unrolling 0→6 with `Indu013`, twelve actions in a six-row window, and
    remapping that WORKS (capture with swap-dedupe). Ours would bind the
    remake's controller instead.
  - **CREDITS** (record 45, kind 16) — a wall-clock scroll (~58.5 px/s) of
    fetext 503+ name/role pairs over the backdrop, a pig voice looping. The
    PC build draws only 18 of the ~150 shipped rows — dead PSX data; ours
    should run the whole list.
  - **The ESCAPE chain**: frontend ESC → REALLY QUIT? (24) from the squad,
    REALLY QUIT APP? (43) from the main menu (kind 19 IS the app-quit
    code); **in a MISSION esc is the PAUSE binding** — and that half is
    BUILT (2026-08-19): the game's own pause, sim frozen, sound suspended,
    "-GAME PAUSED-" gtext 173 over CONTINUE / MASTER VOLUME / SFX VOLUME /
    **SPEECH** / ABORT, the in-mission volume tweaks touching only the
    engine, ABORT asking ARE YOU SURE? on NO. `lib/game/pauseMenu.ts`,
    `ui/pauseMenu.ts`, `e2e/002/pause.spec.ts`. **The fourth row is SPEECH
    (175), not PIG VOICES (240)** — an earlier reading of this line said
    the latter and 240 has no reader in `.text` at all. What is still the
    FRONTEND's half — REALLY QUIT? and REALLY QUIT APP? — can reuse the
    kind-12 confirm module.
