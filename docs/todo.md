# The work list — index

Everything open, one file per item under [todo/](todo/). This file only lists
them. How a file in this tree is shaped is in [CLAUDE.md](../CLAUDE.md), the
docs rule.

- **Adding an item** is a new file plus ONE line here, at its sorted place in
  its group. Never append to someone else's item to add a second subject.
- **Finishing an item** deletes its file and its line, in the same change that
  does the work. What happened goes into the PR, and the facts it established
  go into [facts/](facts/) or the disasm notes.
- **Finishing part of an item** keeps its file and rewrites it to what is
  still open, in the same change; the index line is updated to match. An item
  the planner cut into several issues loses its file with the last of them.
- **With the fleet**, the planner turns items into GitHub issues; the issue
  links the file, and the PR that finishes the item deletes it
  ([fleet/README.md](fleet/README.md)).

Addresses like `0x467a10` are `warhogs_.exe`. Bare paths of the form
`weapons/fire.md` are in the **disasm repo**, never in this tree.

## Housekeeping — before the fleet builds in parallel

- [disasm-notes-cleanup.md](todo/disasm-notes-cleanup.md) — the big notes are split; fold the corrections into the other ~45, then repoint citations
- [failures-and-actions.md](todo/failures-and-actions.md) — the shared failure and testing rules: the kinds of failure, tests that fail at once and wait on actions

## Play checks — what only play can judge

- [play/2026-08-11.md](todo/play/2026-08-11.md) — the first batch: the ending, the fade, the lens, the shot's timing, the door, TNT, the rocket, the thrown weapon's cameras, the eject
- [play/2026-08-20.md](todo/play/2026-08-20.md) — the plate at 0.75, and the squad screen's right column
- [play/2026-09-01.md](todo/play/2026-09-01.md) — TRENCH: tents, mortar, suicide, the grenade camera, the blast throw, super TNT, the crates
- [play/2026-09-06.md](todo/play/2026-09-06.md) — the mine plant pass, the second pig opening, the throw's release, the cluster camera, the flight frame, the medicine ball, G with any hand, the refused heal, the freeze watchdog
- [play/2026-09-07.md](todo/play/2026-09-07.md) — the brain in its own process, the cluster's first victim, the minimap blink, the AI's gun
- [b24-blast-throw.md](todo/b24-blast-throw.md) — the blast throw is the exe's now; is it too short

## New, from play — 2026-11-02

- [ambient-airship.md](todo/ambient-airship.md) — the airship over the map that can be shot down; find who sends it
- [proving-ground.md](todo/proving-ground.md) — the map is built and on the ONE PLAYER menu; left: the bench of specs against the exe

## Build — read in the exe, not built

- [ai-after-the-rewrite.md](todo/ai-after-the-rewrite.md) — the freeze, a foe as an obstacle, the plan's cost
- [ambience.md](todo/ambience.md) — the distant battle and the birds must sound off-screen
- [b0-black-smoke.md](todo/b0-black-smoke.md) — the smoke is drawn inside the fireball; size the sprites by the exe's own formula
- [b10-mine-reveal.md](todo/b10-mine-reveal.md) — the map's red ground under a placed minefield
- [b16-read-not-built.md](todo/b16-read-not-built.md) — the fatal fall, the map bound, 40 MINE SHELL, the airburst pair
- [b18-level2-dead-skills.md](todo/b18-level2-dead-skills.md) — 31/32 AIRBURST, 50 JETPACK, the MG burst, the dart, the suicide camera
- [b22-what-is-left-to-read.md](todo/b22-what-is-left-to-read.md) — the fire table's build list: 30, 15, 16, 34, 50, and small threads
- [b23-hero-kit.md](todo/b23-hero-kit.md) — 53 MEDIC, 56 SHOCKWAVE, 57 the airlift, 58/59 the air strikes
- [b27-pillbox.md](todo/b27-pillbox.md) — the emplaced guns' art and camera, and the BIG_GUN's six shells
- [b28-vehicles.md](todo/b28-vehicles.md) — EJECT, the hull's collision, falling, tilt, breaking, amphibious
- [b3-blast-picture-row1.md](todo/b3-blast-picture-row1.md) — TNT's effect row 1, the smoke-jet fan
- [barrel-sounds-and-grenade-model.md](todo/barrel-sounds-and-grenade-model.md) — six barrel sounds, and `WE_GRE2`
- [bigger-things.md](todo/bigger-things.md) — the rest of the battle screen, two menu screens, fall damage, the melee cry, the hoof's puff, gun damage rows
- [campaign-leftovers.md](todo/campaign-leftovers.md) — what the 0A sessions left: AI pass 1, sound name picks, wound extras, saved voice rotations
- [frontend-open-threads.md](todo/frontend-open-threads.md) — the campaign screens' loose threads
- [frontend-options-and-escape.md](todo/frontend-options-and-escape.md) — VOLUME CONTROL, CONTROLLER SETUP, CREDITS, the quit confirms
- [frontend-particles.md](todo/frontend-particles.md) — steam, sparks and sparkles on the menus
- [gas-family.md](todo/gas-family.md) — the afflicted stance, the green face, 23/24/25, the swamp, the gas shell, the AI and plumes
- [getting-inside.md](todo/getting-inside.md) — barrel art, the barrel camera, pigs that start inside, enemy-held buildings
- [map-bounds.md](todo/map-bounds.md) — the clamp belongs on the walk alone, and a thrown pig walks home
- [objectives-machine.md](todo/objectives-machine.md) — object actions, record links, medals, the four spawned models
- [sergeant-medals.md](todo/sergeant-medals.md) — the medal economy and the sergeant's lines that hang off it
- [sound-bank-unwired.md](todo/sound-bank-unwired.md) — the airships, the weapon reports, the night ambience
- [water-skip-disagreements.md](todo/water-skip-disagreements.md) — the 150 gate on total speed, the kind exemptions

## Read — not read in the exe yet

- [frontend-other-screens.md](todo/frontend-other-screens.md) — fifty-two menu records, MULTI-PLAYER first
- [loose-ends-2026-08-11-sweep.md](todo/loose-ends-2026-08-11-sweep.md) — five threads touched and not pulled

## Bugs and questions from play

- [a4-which-building.md](todo/a4-which-building.md) — where tutorial clip 22 sends the pig
- [ai-grenade-from-riverbank.md](todo/ai-grenade-from-riverbank.md) — the grenade half of the report is unreproduced
- [b13-newspaper-tint.md](todo/b13-newspaper-tint.md) — the page is tinted the wrong side's colour, and maybe not at all
- [b4b-alt-tab.md](todo/b4b-alt-tab.md) — the sergeant talks on while the battle is stopped
- [b7-thrown-pig-spins.md](todo/b7-thrown-pig-spins.md) — a thrown pig spins about its own axis
- [b8-dummy-shoulder.md](todo/b8-dummy-shoulder.md) — walking into a dummy shoulders the pig past it
- [b9-mine-exclamation.md](todo/b9-mine-exclamation.md) — the exclamation mark over a trodden mine
- [house-stone-fin.md](todo/house-stone-fin.md) — the house's corner stones reach past the wall

## Tests

- [b11-camera-smooth-60fps.md](todo/b11-camera-smooth-60fps.md) — the opening drop scores worse near 60 fps
- [b12-flaky-specs.md](todo/b12-flaky-specs.md) — the grenade gauge spec's late read
- [b17-untested-paths.md](todo/b17-untested-paths.md) — a bullet or blade ending the turn, the jump's barge, the acting pig barged
- [b19-weapons-suite-holes.md](todo/b19-weapons-suite-holes.md) — guns with no assertion, unswung blades, weapon sounds, what the AI prices

## Low — play's rulings, nothing scheduled

- [low.md](todo/low.md) — FT_WOOD, the water textures, the tile turn, the fish, the airship props, the text object

## Where the old ids went

Code and notes cite the old list by id, as `todo.md B28`. Open ids are files
above; closed ones are records in [history/worklist/](history/worklist/).

| id | now |
| - | - |
| P0 batches | `todo/play/` by date; the AI's was closed into `history/worklist/ai-rewrite-2026-08-24.md` |
| P1 | [sergeant-medals.md](todo/sergeant-medals.md) |
| P2 | [sound-bank-unwired.md](todo/sound-bank-unwired.md) |
| P2b | [gas-family.md](todo/gas-family.md) |
| 0 | closed: `history/worklist/campaign-spine.md`, `propoint-tokens.md`, `what-gates-what.md`; open: [objectives-machine.md](todo/objectives-machine.md), [frontend-open-threads.md](todo/frontend-open-threads.md), [frontend-options-and-escape.md](todo/frontend-options-and-escape.md) |
| 0A | closed: `history/worklist/campaign-0a.md`; open: [campaign-leftovers.md](todo/campaign-leftovers.md), [ai-grenade-from-riverbank.md](todo/ai-grenade-from-riverbank.md), [frontend-particles.md](todo/frontend-particles.md) |
| A1, A2, A3 | closed: `history/worklist/tutorial-a1-a3.md` |
| A4 | [a4-which-building.md](todo/a4-which-building.md) |
| A0 | [play/2026-08-11.md](todo/play/2026-08-11.md) |
| B00, B1, B2, B4, B5, B14, B15, B20, B21, B25, B26 | closed: `history/worklist/b*.md` |
| B0, B3, B4b, B6..B13, B16..B19, B22..B24, B27, B28 | the `b*` files above |
| C | [getting-inside.md](todo/getting-inside.md) |
| D | closed: `history/worklist/d-reads-2026-08-11.md`; open: [frontend-other-screens.md](todo/frontend-other-screens.md), [barrel-sounds-and-grenade-model.md](todo/barrel-sounds-and-grenade-model.md), [loose-ends-2026-08-11-sweep.md](todo/loose-ends-2026-08-11-sweep.md) |
| E | closed: `history/worklist/e-built.md`; open: [bigger-things.md](todo/bigger-things.md) |
| LOW | [low.md](todo/low.md) |
