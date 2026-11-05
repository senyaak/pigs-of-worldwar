# The facts the engine is built on — index

One file per subject. Each file holds statements, each with where it lives in
the code and how it is known, and the remake's divergences on that subject
beside them. The reasoning, the false starts and the sessions behind a number
are in [../history/](../history/README.md): a number without its argument gets
"fixed" by the next person who reads the disassembly.

## How a statement says how it is known

- `[exe]` / `[measured]` — read out of the binary, or measured over the shipped
  data by a script. A divergence tagged so is a deliberate simplification of
  something known.
- `[play]` — the user ruled it, against the original as they remember it. It
  overrides the disassembly by design; do not "correct" it back.
- `[manual]` — the game's own field manual says it in words. `manual.pdf` in the
  install is a scan with no text layer; **`manual.txt` beside it is the text**,
  and it is worth opening before calling a rule an inference.
- `[gap]` — the original's behaviour is known and simply not built yet.
- `[deliberate]` — a remake convenience the original never had.
- **`[CHECK — remake]`** — invented here. Nothing was read and nobody ruled it;
  it stands because it made play work.

**Treat `[deliberate]` and `[CHECK — remake]` as open questions.** Most of the
remake's "differences from the original" turned out to be a crooked reading of
the exe rather than a choice. Before building on one, re-read the address it
cites; if it cites none, the reading is the first job. The genuine exceptions
are play's own rulings, such as the mouse working every menu.

A new statement cites its source: a disasm path and an exe address for
`[exe]`, the script for `[measured]`, play's own words for `[play]`. Bare paths
of the form `weapons/fire.md` are in the **disasm repo**, never in this tree.

## The subjects

- [animation.md](animation.md) — the library, clip indices from call sites, clip events, the slide, the idle cycle, the drop face
- [bridges-and-ramps.md](bridges-and-ramps.md) — tilted ramps, walking them, bridges, their sound, the arch bridges, CAMP's gap
- [buildings.md](buildings.md) — the two hospitals among the six buildings
- [camera.md](camera.md) — a flight is kept inside the middle 60% of the frame
- [code-layout.md](code-layout.md) — the domains, fixed steps and one random stream, the brain's process, the snapshot, the bus
- [debrief.md](debrief.md) — who the debrief lists, the training ground's debrief, the roster's deaths
- [doors.md](doors.md) — the four door arms: the glide's window and steps, the way out of a building and of a vehicle
- [effects.md](effects.md) — an explosion's sprites and puffs, an effect's collider
- [heal.md](heal.md) — a refused heal says why, the medicine ball's cloud
- [hud.md](hud.md) — the name plates' font, the dashboard's own numbers, the gauge and icons
- [input.md](input.md) — the controller, one keydown one action, an action spent by a view change
- [knock-and-throw.md](knock-and-throw.md) — a flight bowls a pig over, a bullet's knock, damage throws
- [map-records.md](map-records.md) — player counts, true world coordinates, spawn slots, solidity
- [menu.md](menu.md) — the bar machine's layout and motion, the mouse, names
- [movement.md](movement.md) — contact softening and the turn ramp, both unmodelled; a flying pig's landing ladder
- [nations.md](nations.md) — nation against skin, the enemy's nation, hats, repaints
- [pause.md](pause.md) — the pause, its flying camera, its menu and font, ABORT, a battle stepping only once shown
- [pigmap.md](pigmap.md) — territories are grey masks added to the map
- [proving-ground.md](proving-ground.md) — the remake's own test map: its layout, where its ground, records and models come from
- [saves.md](saves.md) — a save is repaired at the parser
- [scanner.md](scanner.md) — the battle map: the library's scanner, tilt, colours, filtering, who shows, minefields
- [sky.md](sky.md) — the sky dome, its size, snow and rain
- [space-and-scale.md](space-and-scale.md) — Y-down models, rotations, half-size models, height scale, +X facing, +y up
- [sprites.md](sprites.md) — sprite TIMs are trimmed of their alignment padding
- [terrain.md](terrain.md) — tile type bits, block placement, baked light, triangles, wall halves, the turn byte
- [time.md](time.md) — the frame rate, the exe's step, 25 Hz
- [turns.md](turns.md) — the second pig opens, two sides fielded, everyone drops in
- [wall-art.md](wall-art.md) — a wall piece's corner stones, and what its joints fought over
- [walls-and-slopes.md](walls-and-slopes.md) — walls, the wall envelope, hillsides, the scrabble clip
- [water.md](water.md) — water is see-through art, and how it is drawn
- [weapons/gas.md](weapons/gas.md) — the poison gas streams
- [weapons/hide-and-pickpocket.md](weapons/hide-and-pickpocket.md) — the bush and the whole stolen slot
- [weapons/mortar.md](weapons/mortar.md) — a lob with no gauge fires at full charge
- [weapons/shotgun.md](weapons/shotgun.md) — ten pellets, capped and multiplied
- [weapons/suicide.md](weapons/suicide.md) — the suicide is seen before it lands
