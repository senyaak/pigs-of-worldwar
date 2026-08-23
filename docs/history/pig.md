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

## Everyone drops in, nobody T-poses, and the drop face (2026-08-20)

Play on mission one: "все свины падают на парашютах — у нас враг в т-позе
стоит". Two separate faults under one report, and a face on top.

**The T-pose.** A pig whose worn clip is `null` is drawn in the HIR bind
pose, and nothing ever dressed the enemy: `clip` events are the only way into
`anim`, campaign maps flag only the player's side for the drop, and both the
drop-in phase and the start-of-turn beat return before the idle pass can
reach the standing squad. The engine now sets IDLE on every pig at
construction — the drop-in re-dresses its arrivals a moment later — so a pig
with nothing to do stands about instead of spreading its arms.

**Who drops.** The marker bit is real and stays read as the exe reads it
(one side of a campaign map — the exe stands the enemy on the ground), but
play rules everyone arrives out of the sky, so `mapSquads` now puts the whole
battle under canopies the moment any fielded marker carries the bit. A map
that flags nobody still stands everyone. `[play]`, noted in the muster and in
`e2e/002/parachute.spec.ts`, whose data test still pins the bit itself.

**The face.** The camera looks an arriving pig in the face the whole way
down, and what it saw was the resting face the head bakes in — `eyes000`
relaxed, `gobs000` with its tongue out. "Помойму не то выражение лица."
`Chars/FACES.MTD` holds seven alternate eyes and seven mouths at the same
sizes (the exe loads it unconditionally at 0x486030; the swap mechanism is
not decoded), and the textures themselves sort into expressions on sight:
002 closed lids, 004 a wide-eyed stare, 005 anger, and on the mouths 001 a
grin, 004 an open scream. `three/faces.ts` uploads the 004 pair and
`Soldier.wearFace` repaints the two face-group materials — scared from
`dropOpened` (a cut canopy keeps it), the pig's own back on `dropLanded`.
`[CHECK — remake]` on the choice of pair; correcting it is one name.

## The downhill stutter — a slope test wearing a cliff test's name (2026-08-20)

Play: "когда я спускаюсь с горки я какбы стукаюсь — падаю, иду, падаю, иду".
Measured before fixing: on the 26.6° spec hillside a driven pig covered 1299
units in a second of "walking" — the fall carries 1.5× walking speed, so the
stutter is also a speed exploit — and the clip chain re-cued RUN → JUMP →
LAND three times a second.

The cause was one `if` in `movement.ts`: the fall look-ahead compared the
terrain a whole LOOK_AHEAD (69.3 units — the exe's 52-unit stride inflated by
the play-only WALK_SCALE) ahead against the terrain underfoot, and called
anything more than STEP_DOWN (16) lower a fall. That is a slope test at
13.0°, and CAMP's median slope is 14°: more than half the map read as a
cliff. The exe asks a different question — is there ground within 32 below
the feet where the step ENDS (`TryMove` step 6) — which at its own stride and
doubled heights only fires past 31.6°.

The test is a BREAK test now: the look-ahead is walked in FACE_PROBE-long
probes and a fall wants more than STEP_DOWN lost within ONE probe — a face
past 45°, which feet cannot follow. A hillside of any lesser grade is walked
down pinned to the ground, the mirror of the climb (which never had a limit);
a real lip still launches from a whole walking step out, which is the spec
that forced the fixed look-ahead in the first place. The old
"drop-deeper-than-step-down falls" unit test encoded the bug — 34 over 200 is
a 9.7° hillside — and now pins the opposite; the cliff fixtures were rebuilt
one tile-face steep (51°), since fixture terrain interpolates over 512-unit
tiles and a "step function" was never a discontinuity to begin with.

**Corrected the same day: the 45° was wrong, and play caught it in one
message** — "вроде там где-то есть поверхности больше 45 по которым можно
подниматься и спускаться спокойно". Measured instead of argued: a census of
every shipped map's tile faces (movement/slope-census.mjs) found NO natural
line — non-wall faces run continuously from flat to ~88°, with 12% past 45°
and thousands in every band up to 70°, and the wall flag does not separate
hills from cliff walls either. So the criterion stays a grade but the number
is openly play's dial: WALK_OFF_GRADE = tan 60°, ground falling away steeper
than that within one FACE_PROBE is a cliff face, anything less is walked. A
walked surface found past 60° in play moves the number, nothing else.

## A DEATH PLAYS OUT, and the plates grow up (2026-08-20)

Play asked for the whole death in one message: at zero the pig explodes (in
water it sinks and explodes under the surface), an overkill just disappears,
and either way ONLY THE BOOTS stay — "щас полностью свинья остаётся". Plus
the plates: the font too big, blocks drawn over each other, no team colour.

**The death is `lib/game/corpses.ts`**, driven off the same `killed` the
scoreboard hears (now carrying `gibbed`, which every damage source computed
and threw away): the dying clip runs out (47 on land, the name table's 50 —
Drowning — in water, the dispatcher's own pick being unread), a water death
then sinks at `SINK_SPEED` (`[CHECK — remake]`) to the terrain floor, and the
corpse goes off as an ordinary `blasted` (row 0 under id 0x54) wherever it
lies — under the surface for the drowned. A gib skips both clip and bang.
Then one new event, `remains`: the engine marks the pig `gone` (the exe's own
state 8 next to DEAD's 6, `debrief/notes.md`), the renderer buries the model
(`Squad.bury`) and stands **`BOOTS`** on the spot — a model every one of the
61 map archives carries, spawned the way a trodden mine's `WE_APMIN` is
(`three/remains.ts`, lift measured off the geometry's own +y). No pickup
drop: the exe rolls one off a dying pig (`skills/notes.md`) and play said
"какой ещё пикап?". A corpse is also DRAWN off the engine's position now
(`three/battle.ts`, after the acting placement) — nothing else ever placed a
non-acting body, so the sink and a thrown corpse's flight were invisible.
`unit/corpses.spec.ts` pins all three arms.

## The death waits its turn — and dies in the right voice (2026-08-23)

Play, of the sequence: "сначала идёт урон, потом когда все остановились,
выплыли из воды — тогда только идёт анимация умирания. и у тебя она не
правильная, а также звук умирания не верный." The remake had been starting
the dying clip in the very frame the damage landed — a collapse-from-standing
played on a body still flying — and the disasm's third pass over
`[pig+0x2EC]` (weapons/fire.md) says the original never does: **death is a
state change and no clip at all.** State 6 rides the physics body wearing
clip 0x1D — 29, "Very Wounded", a name that for once sits below the +24 drift
and means what it says — and the dying clip is set only at the 6 → 7 edge,
once the body is at rest and the turn manager has noticed (0x46f732; the
water arm plays 0x4A = 74 right there, which corroborates `DROWNING`). The
turn-mode table gives the same order from the other side: 13 WALK AWAY, 14
WAITING FOR ALL OBJECTS TO STOP MOVING, only then 16 WATCHING DYING PIG.

So `corpses.ts` is two phases now: `claim` clears the overlay, dresses the
body in `ANIM.WOUNDED` and lets it ride; the dying clip, the sink and the
`dying` event start when the corpse's own flight is over AND the battle says
the stage is still — `Battle.stageStill()`, the settle list LESS the corpses
themselves (that would deadlock — `settling()` waits ON them) and less the
theatre, plus the walk-away's swimmers, so a kill made from the water is
watched only after everyone is ashore. WHERE the body ended is what it dies
in: `wet` is decided at the transition, so a corpse knocked off a deck drowns
in the bay it landed in, not on the bridge it was hit on.

The SOUND was wrong by the same reading: `P_MAD1` has no call site anywhere
in the exe ("wild squealing — no idea what for" was the honest label), while
the blast arm's tail plays squeal **0x59/0x5A** — entries 89/90 of
`Audio/sfxday.srl`, `P_SQUEA1`/`P_SQUEA2`, both verified present. The kill
now squeals one of the two by the pig's own id; the drown gurgle moved from
the blow to the `dying` event's wet arm, with the clip and the sink it
belongs to. Still open, and known: nothing moves the camera to the dying pig
(the exe's mode 16), and the death VOICE LINE category the speech bank
carries (speech/pigs.md) stays wired to nothing. `unit/corpses.spec.ts` pins
the new order end to end.

**The plates** (`ui/hud.ts`, `three/squad.ts`): SMALL at ×2 — play put up a
screenshot of the original's ~24-tall chunky letters against BIG's 32, and
which font `0x459B20` uses is unread — painted per TEAM through the
until-now-unused `SKIN_COLOURS` (skin, not nation), heart keeping its pink;
the number rides the same colour, as the screenshot shows. Overlapping
blocks unstack upward (nothing read about the original's answer — remake's
own). The stand-still delay came down 2 → 1 s ("не 2 секунды а меньше"), and
the espionage rule the exe applies to the plate (`0x459BA7`, the blip's
identical test) is on it now: a scout/sniper/spy of a side not acting is
unlabelled, both ways.

## A PLAY PASS OVER THE BATTLE — 2026-08-20 evening

Four reports in one message, and two of them were the same mistake in two
places.

**The plate wears BIG again, at 0.75.** Play had ruled BIG's 32 too big; the
plate went to SMALL at ×2, which is the same 24 pixels tall — and play saw it
in the game and ruled the LETTERS wrong: "не тот шрифт! верни тот что был — но
просто сделай меньше его." So it is BIG's shapes at a plate height that has not
moved. The heart keeps a scale of its own.

**…and the letters are OUTLINED.** "отсутствует чёрная обводка текста для имён
и хп". A team colour on its own disappears into half the ground in this game;
the plate carries a one-pixel black edge now, drawn from a black-painted copy of
the same font at eight offsets. The offsets are in SCREEN pixels and not the
plate's own units, because an outline is a hairline whatever the letters are
being drawn at — multiplied by a fractional scale it would land between two
device pixels and fade. `LAYOUT.plate.outline`, and the hud spec measures it by
turning the knob off and counting the difference.

**A BODY ALREADY INSIDE ANOTHER COULD NOT BE THROWN, and the arithmetic said so
before the game did.** Play, on the bayonet knock that had just been built:
"свинья будто на месте летит пол секунды вместо настоящего отбрасывания —
похоже застревания какието", and then "граната тоже както странно отбросила",
which is what named it as general rather than melee's.

`withPigs` blocks a step within `2·PIG_RADIUS` of another body; `blocks` is a
test on the DESTINATION alone; and a blocked step IN THE AIR zeroes the
horizontal velocity for good (`lib/game/locomotion.ts`). Put together: every
direction out of an overlap is still inside it, so a body that starts its
flight overlapping never leaves the spot — it goes up, comes down, and lands
where it stood. A walking pig is stopped at exactly `2·PIG_RADIUS` from the one
it is walking at, which is exactly where this blocks, so a MELEE victim starts
on the boundary every single time; two pigs shoulder to shoulder in a blast are
the same trap, which is the half play saw with the grenade.

`withPigs` takes the moving body's own position now and drops every pig it is
already inside. Nothing can be pushed further in by that, because it could not
be pushed at all. `e2e/002/tumble.spec.ts` throws a body from one unit away and
fails without the fix.

