# The pig itself

Its model, its footing, its animation and the noise it makes.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## The BATTLE MODEL is `_me`, and a keyframe has a HEAD

Two format-level things behind one report, and play had to make it three times
before the search left the pose and went to the assets: "жёпка так и не вертится…
именно та часть тела не шевелится вообще… должно двигаться вместе с туловищем а не
стоять колом."

**`Chars/british.mad` ships THREE models per class and only two of them are rigged
for the animation.** Measured across all twenty-seven: `pcXXX_hi` (627..668
vertices) hangs 30..35 vertices off bone 0 — the ROOT — and its bone 1 stops short
of the hip, so the whole pelvis is welded to a bone the shipped clips barely move
(4.9° of pitch, no yaw at all). `pcXXX_me` (457..496) and the short `XX_hi`
(168..201) put 6..8 there — the tail — and carry the hip band on bone 1, the
torso, where the run cycle's ±19.6° of swing lives. So on `_hi` the behind cannot
follow the body: it is not attached to it. `three/soldiers.ts` dresses a battle pig
in `_me`, and two things agree on that — a rig that matches the animation, and
`_ME` being the suffix the map's own spawn markers wear (`GR_ME`, `HV_ME`).
`pcXXX_hi` is for whatever shows a pig close up and standing still.

**An MCAP keyframe's first 32 bytes are TWO int32 vec3s, not an u16 and ten s8
triples.** how-doc's reading was wrong and nothing had ever consumed it. The
library settles it (`_d3d.dll` 0x1001228f): after the fifteen bone rotations it
reads dwords at +0x00/+0x04/+0x08 and +0x10/+0x14/+0x18, interpolates each between
the two keyframes as an INTEGER and ftols it into its own root record — two
16-byte slots, three live components each, which is also why the rotations start
at +0x20. The first slot is the body's own offset and its y MOVES: 21 units over
the run cycle's stride, two dips, one per footfall — the BOB. The second is zero
in all 93 shipped clips. `lib/formats/mcap.ts` reads it, `rootAt` samples it, and
it lands on the root of both the engine's skeleton and the drawn one.

Only the VARIATION is applied, against the clip's own first frame, and that half
is the remake's: the constant is about −100 on every clip and the original adds all
of it to a body it places its own way, while this engine stands a pig by the foot
offset measured off the art. Both would double up.

Found on the way and worth knowing: the model struct carries FOUR clip/frame pairs
— current and previous for each of the two channels, 0xFFFF for none — so **the
original CROSSFADES one clip into the next** where this engine cuts. Not modelled.

## A landing on a WALL tile settles, and only the get-up is refused

Play: "соскользнул с подьема и попал в бесконечный цыкл — туда сюда скользит на 1м
месте", with the tile's own address (CAMP 43,17 — type 0x85, a wall over terrain
type 5). The landing had two conditions where the exe has one: its impact handler
compares the ARRIVAL SPEED with 25 a frame (`cmp di,19h`, 0x4711d8) and that alone
picks the bounce (0x471247) or `0x471350`, which zeroes the velocity. What
`Map::IsBlocked` gates is the GETTING UP. Read as "a pig in a wall never lands", a
pig on that tile kept 99% of its slope-parallel speed off `WALL_MATERIAL` every
frame and the wedge counter relaunched it every 25 for ever. `002/wedge.spec.ts`
pins it; `002/locomotion.spec.ts` had the old reading as an assertion while its own
comment described the right rule.

## The pig's DRAW SCALE: the question dissolves

Open item 5 is closed and nothing had to change. The pig's constructor pushes
`0x1000` three times where the loader's building arm pushes `0x800`, and the worry
was that the original draws a pig at full model scale. It does not read either
number: both paths funnel into one base constructor, **`0x4a7db0`**, which is thirty
instructions and ends `ret 0x2c` — eleven dword arguments — and it reads exactly
**two** of them, arguments 1 and 3, into `word [this+0x2c]` and `[this+0x2e]`.
Everything else it writes is a zero or a constant. The scale triple is arguments 7,
8 and 9, and on the pig's path they are dropped twice over: its intermediate
`0x4407e0` ignores the three it was handed and pushes three fresh `0x1000`s, which
`0x4a7db0` then also drops. A dead argument in the engine's object constructor. The
body stands on the two measurements that agree — the shape table's 0xAA halved, and
the drawn shoulders.

## A HOOF KNOWS WHAT IT IS STANDING ON — footsteps, 2026-08-12

Done, and decoded end to end rather than picked: **when** a hoof lands is a
key-frame event on the clip (`lib/game/footsteps.ts` holds all 22 clips'
rows), **what** it lands on is the tile's terrain type through the exe's own
twelve-way switch (`SURFACE_SOUNDS`, `audio/battle.ts`), and the mix is the
exe's. The read is `anim/audio-events.md`, with `anim/key-events.js` to dump
any clip's events; nothing about it needs deriving from the skeleton, which is
what the plan that stood here for a week was going to do.

Four behaviours that will look like bugs and are not: **scrambling is silent**
(clip 11 authors no footfall) and so is standing still; **swimming's four
kicks a cycle are deliberately quiet**; the **climbing tile plays LAVA**, which
is the switch's own odd row and audible on ICEFLOW; and **`FT_SAND` plays under
every step**, at the same mix, because the handler plays it a second time. That
last one is the only thing here play might overrule — `STEP_UNDERLAY` is one
line to drop.

## …AND A BRIDGE IS THE ONE THING THE TILE CANNOT SAY — 2026-08-12

Play named it and it was not started: the sound of walking over a bridge. The
exe has no answer to give. `Pig::Footstep` (0x475010) reads the pig's TILE out
of the map array and nothing else — there is no object under the hoof anywhere
in the function — so the original crosses a deck to the sound of what is under
the deck, and over ISLAND's spans that is a splash.

The data closes it from the other side, measured over the shipped Maps folder
by `objects/deck-tiles.js` in the disasm repo:

- of the **1183 tiles the bridge pieces of all 61 maps stand on**, grass 481,
  stone 266, water 243, sand 105, snow 50, lava 20, ice 18 — and **not one of
  type 3**;
- over **all 249 856 tiles in the game** the type histogram is 0, 1, 4, 5, 6,
  7, 8, 9 and 11 only. Types 2 and 3 never occur, so two arms of the exe's own
  switch are unreachable and **`FT_METAL` and `FT_WOOD` ship unplayed**.

Nothing writes a tile type at runtime either. The one mechanism that looked
like it might — a 3×3 block of tile values saved at `[obj+0x182]` and stamped
back through `Map::SetTile` — turned out to be the MINE REVEAL, on a PIG of
class 4, 5..7 or 0x0E: the tail walks the same nine cells testing bit 0x40.
`objects/notes.md` carried it as "the only mechanism seen by which an object
reaches the ground a pig walks on" and no longer does.

**So the remake draws its own line, and it is one table wide.** A record that
is part of a bridge answers `WOOD` for the face a pig stands on; everything
else answers nothing and the tile is asked, exactly as before
(`lib/game/underfoot.ts`). The collision world carries it — `Obstacle.surface`,
and `Obstruction.underfoot` is `standing`'s own test asked for a material — so
it works for any pig on the map rather than only the driven one, and the bus
still carries a terrain TYPE and never a file name. The names are measured:
the six decks (`BRIDGE_C`, `BRIDG_C2`, `BRID2_C`, `BRID2_C1`, `BRID2C3`,
`BRID2_S2` — every one of them 64 units thick, a plank) plus the six walkway
pieces `isWalkway` already names. A crate, a wall top and a pillbox roof are
each a separate ruling and none of them was asked for.

Two specs: `e2e/002/obstacles.spec.ts` pins the rule itself (standing on a deck
is wood, walking past it or under it is not, and a crate is not), and
`e2e/002/audio.spec.ts` walks CAMP's first bridge and hears `FT_WOOD` over the
exe's own sand layer. `pow.debug.surface()` now answers what a hoof landing
NOW would play rather than the raw tile, which is what makes that assertable.

## UNIFORMS — the squads wear their nations, 2026-08-19

The battle used to load `Chars/british.mad` and take whatever `british.mtd`
came paired with it, so both sides were British on every map. Now the player's
squad wears the nation chosen at SELECT TEAM and the enemy wears whoever the
campaign says this mission is against.

Three numbers had been run together and the read separated them
(`army/skins.md`): the NATION a player picks, the SKIN every piece of art is
indexed by, and the SLOT a map's markers sit in. `Team::SkinOf` (0x4508E0)
converts the first into the second — `{0,2,1,4,5,3,6}` — and that table was
already in this tree TWICE, as `ART_OF` in `pigmap.ts` and `UNIFORM_OF` in
`debrief.ts`. It lives in `lib/game/nations.ts` now and both use it.

Three things this corrected, each of which had been written down as fact:

- **`teams.ts`, `spawns.ts` and `muster.ts` all said a marker's side bit IS the
  nation.** It is a slot. DEVI carries slots 2 and 4 and OASIS 1 and 5, neither
  has a slot 0, and both are campaign maps a British player plays; seventeen of
  the twenty-six maps are `0 + 1`, which under that reading would have made
  seventeen missions in a row French. Which side is the player's is record
  `+0x58` bit 0 — exactly one side per map carries it, and on DEVI it is 4.
  `spawnTeams` orders the campaign's own side first now.
- **The blip colours were eight and are six.** The last two were the first two
  rows of the scanner board's GROUND palette, one table further on in the dll.
  And they are indexed by the SKIN, not by a side's position in the list, so a
  French squad is blue and an American one cyan rather than the other way round.
- **`save.nation` and `save.enemies[position]` never crossed into the battle.**
  `battle.open` takes them now; without them each side falls back on its own
  slot, which is what the console's `pow.swapMap` and the headless spec get.

What made it cheap: **a nation is a repaint.** All seven archives hold the same
120 entries under the same names at the same sizes, and 105 of the ~110 that
differ from the British ones differ only in their CLUT — so one geometry load
dresses any of them. `loadModel(archive, base, skins?)` takes the alternative
`.MTD` and decodes it through the SAME padding path the paired one uses, so a
face's texture index cannot shift.

`SoldierArt` is keyed by `(base, nation)` now. It was keyed by `base` alone,
which would have dressed both sides in whichever nation loaded first — silently,
since the geometry is identical.

### …and the hats, the same day

The battle wears them now too. The exe hangs one off bone 2 — the head, the
bone's whole matrix and no offset — and turns it half a circle, which is the
same `afSetObjPos(obj, 0,0,0, 0, 0x800, 0)` every attachment gets at load
(0x486340) and which `three/heldWeapon.ts` had already measured its way to for
the weapon on bone 5. So `wearHat` is the weapon's own treatment, one bone
along.

**Only the heavy-gunner family gets one.** `ClassToModel` (0x4C2E50) gives
model type 2 to classes 1, 2 and 3 alone, and the exe hangs a hat when the type
is 2 and writes ZERO into the slot otherwise (0x440D71) — every other class
carries its headgear in its own mesh as a texture group. That is also why the
heavy is the one model with a bare head, which the SELECT TEAM work had already
found from the other end.

`FHATS.MAD`'s mesh order is `br_hat, am_h, frhelm, germh, rus_h, ja_ban,
pur_hat` — SKIN order, and the exe indexes its cache by the skin straight. The
frontend had its own list in nation order under its own name; there is one list
now, in `nations.ts`, and both screens look a hat up the same way.

`Chars/BRITHATS.MAD` — seven British hats on the class family names — is UNUSED:
the string does not appear in the executable at all. A note here used to call it
"the battle's".

`pow.debug.squads()` reports `nation`, `skin` and, per pig, `hat`.
