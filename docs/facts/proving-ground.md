# The proving ground — the remake's own map

- `[play]` **One map to test every weapon and machine on**, asked for on
  2026-11-02 ([../todo/proving-ground.md](../todo/proving-ground.md)). The
  original has no such thing, so **its LAYOUT is the remake's own**; everything
  that HAPPENS on it is the original's, and nothing on it bypasses a rule the
  campaign uses. Opened from a running battle with `pow.swapMap('PROVING')` in
  the devtools console; `pow.swapMap()` lists it beside the shipping maps.
  `PROVING` is the name of no shipped map.

- `[deliberate]` **What is on it.** A flat field the whole width of the map,
  with the strip down its middle running +x. The player's side is one grunt at
  the head of the strip looking down it; the dummies are a second side of four
  real enemy pigs standing down the strip from 2560 to 8704 units off, every one
  near the middle of the map: the airship an air strike or the airlift sends
  starts 16384 units back from the aimed point (0x470430, `objects/airship.md`),
  and aimed at a dummy from the pig's side that start is still inside the
  ±15871 the airship is kept within.
  Across the strip in front of the pig, a row of 48 crates — one round each of
  skills 1..38 and 50..59, with a gap where the strip runs — and a SIGN beside
  every one. Beside the strip the four vehicles (TANK, AM_TANK, CARRY,
  AMLAUNCH) and behind them a PILLBOX and a BIG_GUN; on the other side a pond
  with a bank to walk out onto, a hill, and a wall. Nothing is held back by the
  script and nothing drops in. `lib/game/provingGround.ts`,
  `lib/game/provingTerrain.ts`.

- `[measured]` **The ground is built in code, out of a shipped map's bytes.**
  The blocks come from the same builder the unit fixture uses
  (`lib/game/terrainBlocks.ts`); no file is read for them and nothing is written
  into the install. The textures are CAMP.PTG's, and each tile wears what CAMP
  wears for the same thing, measured over CAMP's own 4096 tiles on 2026-11-02:
  open ground is texture 2 with type byte 0x09 (all 714 such tiles), open water
  texture 44 with 0x24 (all 110 of CAMP's water tiles carry 0x24; 44, 45 and 46
  are the only all-translucent palettes, water kind 2, dll 0x10007b6c), and a
  wall texture 153 with 0x85 and the solid-half byte 0 (562 of CAMP's 614
  wall-flagged tiles wear 153..156, and every one of those is 0x85 with the
  solid-half byte 0; the other 52 wear six other textures, one of them 0xC5,
  wall plus mine). The baked shade is `249·n_y + 5`, the fit of a
  shipped map's shade to its own normals (`lib/formats/pmg.ts`), so flat ground
  is 254 and the slopes darken.

- `[measured]` **Every record is a copy of a shipped record of the same
  model**, its position and yaw replaced and its stored y set to the ground
  plus that source record's own rise above its ground (the stored y is the
  model's centre, `objects/notes.md`). Sources, each present in a one-player
  game: CRATE1 record 7, SIGN 54 and the grunt marker GR_ME 3 from CAMP; TANK
  12 from OASIS; AM_TANK 7, PILLBOX 5 and BIG_GUN 4 from GENMUD; CARRY 20 from
  SNAKE; AMLAUNCH 16 from BAY. `lib/game/provingSources.ts`.
  - A copy carries **no script command**: fields 14, 15, 16, 25 and 27, which
    the loader builds one from (0x4a6287, `script/notes.md`), are cleared.
    Field 26 is read by nothing known and is copied as stored. OASIS's
    records 9..11 and both of SNAKE's CARRYs carry opcode 14 there, and the
    three GENMUD records opcode 13 (a health crate when the thing is wrecked,
    0x4aa4c8). OASIS's 12..14 carry none, which is why TANK comes from 12.
  - The **GENMUD three carry field 12 = 25**, a health override (0x4a6179,
    `objects/notes.md`); it comes along with the copy. The remake reads that
    field only for breakable scenery so far (`lib/game/targets.ts`).
  - A **crate** is kind 19 with its skill's crate byte (the inverse of the
    table at 0x4D9DC8, `lib/game/skills.ts`) in field 15's high byte, no wait
    label in its low byte, and an amount of 1.
  - The **markers** carry their side bit (0x100 the player's, 0x200 the
    dummies'); the player's carries the scripted bit in field 28, so its side
    is fielded first (0x4A5D2A). CAMP's marker carries the parachute bit 0x40;
    the copies do not.

- `[measured]` **The models come out of four archives, each in its own
  textures.** CRATE1, SIGN and everything the engine spawns from
  `Maps/CAMP.MAD`; TANK, AM_TANK, PILLBOX and BIG_GUN from `Maps/GENMUD.MAD`
  (every `GEN*` template carries all four); CARRY from `Maps/SNAKE.MAD` and
  AMLAUNCH from `Maps/BAY.MAD`, the only archives that carry them. A face group
  indexes its own archive's `.mtd`, so every map prop now carries the texture
  list of the archive it was read out of (`main/assets.ts`, `LoadedProp`).
  BOAT is in no archive and AIRSHIP1 / PP1 are what a strike spawns, so none is
  placed; CAMP's DUMMY model is not used, the dummies being real pigs.
  `main/provingGround.ts`.

- `[play]` **The dummies skip their turns**: "real enemy pigs that skip their
  turns", 2026-11-02. On this map a machine side's turn card is read out as for
  any computer side, and the pig then takes SKIP TURN in hand and fires it, the
  ordinary pass. The brain is not asked. Only the choice to pass is the owner's:
  a dummy is still thrown, hurt and killed, and poison still bites at the top of
  its own turn (0x4703A0, `weapons/gas.md`). `lib/game/battle/machine.ts`,
  `isProvingGround` in `lib/game/provingGround.ts`.

- `[gap]` **What it does not do yet** is listed in
  [../todo/proving-ground.md](../todo/proving-ground.md): a dummy brought down
  stays down, a taken crate stays taken, and the signposts are the plain SIGN
  model.
