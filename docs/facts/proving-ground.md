# The proving ground — the remake's own map

- `[play]` **One map to test every weapon and machine on**, asked for on
  2026-11-02 ([../todo/proving-ground.md](../todo/proving-ground.md)). The
  original has no such thing, so **its LAYOUT is the remake's own**; everything
  that HAPPENS on it is the original's, and nothing on it bypasses a rule the
  campaign uses. Opened by the PROVING GROUND bar on the ONE PLAYER screen
  ([menu.md](menu.md)), which needs no campaign save and writes none, and from
  a running battle with `pow.swapMap('PROVING')` in the devtools console;
  `pow.swapMap()` lists it beside the shipping maps. `PROVING` is the name of
  no shipped map.

- `[play]` **No rank gate**, 2026-11-02: "in the original a pig may use any
  skill it holds, whatever its rank, so any pig can test anything here".

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

- `[play]` **Each signpost wears the icon of the crate beside it**: "A signpost
  by each crate showing the skill's icon", 2026-11-02. The icon is the same
  picture the skill menu shows, out of `Language/Tims/MENUTIMS.MAD`, one 56×34
  BMP per skill named by `SKILL_ICON` (`skills/notes.md` § "The menu's art",
  `lib/game/skills.ts`). Which sign stands for which skill is
  `provingGroundSigns` in `lib/game/provingGround.ts`, and not on the record,
  where kind 19 would make a SIGN a pickup. The icon is on the record's own mesh
  (`three/signBoards.ts`), so a sign that is shot down takes it along and a sign
  that fades fades whole. No shipped map's SIGN carries one.

- `[deliberate]` **How the icon sits on the sign** is the remake's, the original
  having no proving ground. It replaces the board's texture outright: the skull
  would show round a 56×34 picture, and the icon's punched black would be holes,
  so it stands in the middle of a black square (`lib/game/provingSigns.ts`). A
  sign here is turned to stored yaw 1024, which leaves the model as modelled and
  looks its boards along ±x, at the crates and the pig; yaw 0, the source
  record's, would show him the edge. The collider turns with the sign (`boxOf`,
  `lib/game/obstacles.ts`), so at that yaw the box's 256 lies along the row, and
  the row stands at 480 a crate (`CRATE_PITCH`). That leaves 224 between two
  signs' boxes, room for the pig's body of 170 across with 54 to spare, and
  1280 at the strip's gap. The row's ends stand at z = ±11808 and the end signs'
  boxes reach ±11936, 352 short of the limit of 12288 a pig is held to
  (`WORLD_LIMIT`, exe 0x3000, `lib/game/terrain.ts`), so every crate can be
  walked to. `unit/provingGround.spec.ts` walks it.

- `[measured]` **The SIGN's board**, read off `Maps/CAMP.MAD` with `loadProps`
  (`main/assets.ts`) on 2026-11-04. The model is two face groups: the post and
  the board's edge in SIGN001.TIM, and the board's two big faces in SIGN000.TIM,
  a skull and crossbones on wood. The board is 376×377 model units, so square, on
  the faces at x = −54 and x = +56. Both faces carry the same U along z, so a
  picture reads the right way round from the −x side and mirrored from the +x
  side, which a symmetrical skull never shows. `three/signBoards.ts` runs the +x
  face the other way for an icon; `e2e/002/proving-ground.spec.ts` reads both
  sides off the canvas.

- `[play]` **A dummy that was killed comes back**: they "stand up at full health
  at the start of a turn", so that reactions, deaths and damage numbers get
  tested, 2026-11-02. The death itself is the original's and plays out whole,
  corpse blast and boots included (`lib/game/corpses.ts`); at the first turn
  start after it has finished, whoever's turn that is, the dummy stands at the
  full health of its class with its class's kit and no poison. Bringing all four
  down in one turn does not end the battle, and the player's own pig dying still
  loses it. One only wounded keeps its wounds where the blow left it: play's
  words are about a dummy that went down. `lib/game/provingDummies.ts`, asked by
  `handOver` in `lib/game/battle/handover.ts`.
  - `[deliberate]` **Where it stands up is not in play's words.** The layout is
    the remake's own, so it is the dummy's own place on the strip, facing the way
    it faced at the start: the ranges down the strip stay what they were laid out
    to be, and a body that drowned or was thrown has no other safe spot to return
    to. No getting-up clip was asked for, so it is simply standing there; the
    boots stay down where it fell.

- `[play]` **A crate that was taken is back at the start of the next turn**: "one
  round per crate per turn", 2026-11-02. The original has no refilling crate; this
  is the owner's rule for this map. Walked into, a crate hands over its one round
  and disappears, as anywhere (`Pig::GiveSkill` 0x465425, the crate table 0x4D9DC8,
  `skills/notes.md`). At the start of the next turn, whoever's turn that is, it
  stands in its place again, drawn and takeable. A pig that stays on the spot takes
  nothing more that turn, and takes it again when its own next turn comes. A pig
  already carrying fifteen skills is refused and the crate stays (`MAX_SLOTS`, exe
  0x465787, `lib/game/inventory.ts`), and a crate that has come back says its
  refusal anew. Crates on every other map are taken for good. `returning` and
  `turnStarted` in `lib/game/scenery.ts`, asked by `handOver` in
  `lib/game/battle/handover.ts`.

- `[gap]` **What is still open** is listed in
  [../todo/proving-ground.md](../todo/proving-ground.md): the bench, the automated
  specs that compare each skill on this map with the numbers read from the exe.
