# The world

Water, bridges, buildings, props and everything breakable.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## WATER hurts, a turn ends with a BEAT, and the modes have names

Four of play's reports in one pass, and three of them turned out to be the same
piece of the exe — its MODE MACHINE, which now has a decoded name for every
number (`turns/notes.md`; the table is at 0x4d72b0 and NORMAL landing on 6 pins
it). Two answers fall straight out: **the beat at the top of a turn is mode 4**,
which was an open question since the turn clock landed, and **mode 13 is WALK AWAY
— the beat at the END of one**, which nothing here knew existed.

**Water takes health, and it RAMPS.** `lib/game/drowning.ts`: the bite is the
frame counter itself in 128ths of a point, capped at half a point a frame, so a
grunt's fifty last about nine seconds — and **the pig whose turn it is pays
twice**, except during the beat at the end of a turn, which is the exe's own
exemption. It is deliberately SILENT and invisible: the floating number is gated
above 0x7f and the cap is 0x40, so nothing is drawn and nothing is played, and the
health plate is the whole of the feedback. **Class 4 and 14..16 take nothing at
all** — the commando and the top tier by the spawn markers — and that is gated on
a ONE-PLAYER game, which is what `PLAYERS` in that file says and why it is not
`SIDES_FIELDED`. Two consequences worth knowing: `DEAD_BELOW` in `health.ts` is
now 1 rather than 0 because the exe's death test is "under one whole point" and
water is the first thing that deals fractions, and the name plate floors its
number the way the exe's own does.

**A turn does not hand over on the spot.** `lib/game/walkAway.ts` is mode 13:
control is locked, the clock is stopped, and anyone still in the water makes for
the nearest shore — eight compass rays, sixteen tiles each, nearest by dx²+dz²,
and a pig with nowhere to go drowns where it stands. It holds until they are all
out and the world has been quiet for a second, which is both the exe's fifteen
quiet frames and exactly what play asked for ("хотя бы секунду задержки между
ходами"). The exe calls its shore search for the ACTING pig ONLY in this mode, so
the swim out is a property of the handover and not of being in water.

`pow.debug.cutTurnBeat()` ends it, and `skipTurn` in `e2e/controller.ts` uses that
by default — a spec that ends four turns to get somewhere should not pay four
seconds for a beat it is not testing. `e2e/002/drown.spec.ts` is the one that IS
about it.

**A health crate shows something now.** `Pig::Heal` was read to the end and does
three things: the same floating number a hit does (one spawner, and the fifth
argument is the style — a hit takes the team's colour, a heal a fixed one), sound
0x53 P_SIGH at nominal, and it CLEARS the status bitfield. Only the third is not
built, because nothing here models statuses. `damage/notes.md`.

**A jump no longer walks through a dummy.** The obstacle field was consulted from
the walking branch alone, and `airborne` clamped its step to the world and read
objects only as a roof to land on. In the exe the block is in the PHYSICS layer:
the same sweep the walk uses (0x406AD0) is also called from the library's own
integration of a live body, and a pig in the air is a live body for the whole
flight. Reach is 0 up there, so a box whose top is above the feet is a wall and
one below them is still something to land on.

**And the pig's rump does NOT wag — that one is a measurement, not a fix.** Play
asked for the pelvis to turn while walking. The skeleton is fifteen bones with no
tail among them, the tail geometry hangs off the ROOT bone, and the root's yaw is
exactly zero on every frame of every run cycle (and of the backwards walk). What
swings is bone 1, the torso: ±19.6° of yaw and 22° of roll, which this engine
already wears — and the weapon channel owns bones 0..8, so a pig carrying
something has a still torso by design. The only clip that yaws the rump alone is
27, Standing around, by 4.9°. Full measurement in `animations/notes.md`; there is
nothing in the data to turn on.

## And a pig ON A BRIDGE is not in the water it crosses — for EVERYTHING

The rule was already written down for the driven pig, and the two things added
this pass — the water's damage and the end-of-turn swim — both asked
`query.isWater(position)` and nothing else. So a pig standing on CAMP's deck when
its turn ended counted as a swimmer and the beat "rescued" it: `restingY` put its
feet on the waterline, which is a drop through the deck. `inWater(query, x, z,
footY)` in `lib/game/locomotion.ts` is the rule for anything that is not driving —
the tile has to be water AND the feet at or below the waterline — and a swimming
pig's feet are on that line by `restingY`'s own definition, so the two cannot
disagree.

**And it came back one pass later, through the OTHER half of the same
question — where the feet are at all.** Play: "если начинаю ход на мосту, нажимаю
любую кнопку и он проваливается." `createLocomotion` took the pig's height off
the landscape, and a turn builds that state fresh for the pig that comes up
(`focus`, `lib/game/battle.ts`), so a turn starting on a deck started 652 units
below it — invisibly, because the scene draws the pig out of its own position
while "press any key" is up and out of the locomotion state once the turn is
being played. The first press was the drop. It now takes an optional `Footing` —
the pig's own y and the obstacles — and keeps the surface it is actually standing
on, `freeY` and `swimming` with it. The frame-by-frame walk had the rule all
along; only the FIRST frame had nothing to measure from.

Two lessons, and the second is the general one:

- **A state built from a POSITION needs the whole position.** `x, z` and the
  landscape is not where a pig is on a map with walkways on it. Anything else
  that rebuilds locomotion from a spot — `warp` today, a save file tomorrow —
  has the same hole, and `warp` is left with it deliberately: it names a spot
  and has no pig to ask.
- **A debug accessor that lies is how a bug family survives being fixed.**
  `pow.debug.hud().swimming` was `query.isWater(pig)`, so the spec written
  against it was told a pig standing on the bridge was in the water — the first
  version of the app test above failed on that and not on the bug. It asks
  `inWater` now. The e2e window is not exempt from the rules the engine keeps.

## EVERYTHING IS BREAKABLE, and a dummy is just the cheapest row

Play: "тнт не дамажит дом." It did not, and a house was never anything in this
engine: `targets.ts` built targets for the one model name the remake had ever seen
break. The original has no special case for a dummy at all — a dummy, a tree and a
house wall are the SAME class (vtable 0x4bd440, ctor 0x48d000, body type 0x135A),
with a different number out of one table.

The loader dispatches on the model NAME through a table of 466 strings at 0x4d9680
that names its own groups, and **every SCENERY record (indices 28..379, less the two
birds) is breakable**, with health at `[0x4d6d18 + (kind - 0x1c) * 4]` in the usual
128ths. `lib/game/breakable.ts` is that table, all 349 names of it, and
`../pigs-disasm/objects/notes.md` has the taxonomy.

What it means in play: CAMP's house is eighteen 60-point pieces of the `ST` set, so
one TNT charge (fifty at the core) leaves a wall standing with ten and the second
brings it down; its 85 firs are eighty each; the dummies keep their one point. A
CRATE is not breakable — CRATE4 is in the table twice and the PICKUPS entry wins.

**A BUILDING still is not.** Indices 1..6 (BIG_GUN, M_TENT1, M_TENT2, PILLBOX,
SHELTER, TENT_S — CAMP has one SHELTER) are a different class, 0x4bc5d0, body type
0x1359, and its own trick is that going off it sweeps up every pig around it and
throws each one at `(0x40, 0x200, bearing)` with a squeal.

## THE HOUSE FLICKERED because the map overlaps its own walls

Play: "дом имеет мерцающие текстуры." Measured rather than guessed: CAMP's house
overlaps its wall pieces at every corner by exactly 64 units — the wall's own
thickness — twelve pairs of them, each a 64×512×64 column, so their big faces are
COPLANAR. (Measured over the AABBs of the placed models, not the collision boxes.)

The original never minded because it has no depth buffer to fight over: a PSX-style
renderer sorts its polygons and the second of two coplanar faces simply lands on the
first. Three.js keeps a z-buffer with `LessEqualDepth`, so the LAST face drawn wins
— and its opaque sort falls back to distance from the camera, which reorders the
pair as the camera moves. That flip, once a frame, is the flicker.

`renderOrder` is the first key of that sort, ahead of the material and the distance,
so `three/props.ts` gives every record its own — the map's own order, fixed for
good. It costs the material batching across props, which for a hundred-odd objects
is nothing.

## THE SHELTER: a collider 96 units too wide, and no way in by design

Play: "у бомбоубежища силовое поле — моделька больше чем текстуры — с лицевой
стороны и задней нельзя подойти вплотную." Measured over every shipped map: of the
1113 box-shaped records whose extents ARE their model's own footprint, all but
sixteen match as stored — and **fourteen of those sixteen are the SHELTER**. Every
SHELTER in the game, at all four yaws, carries 832×640 for art that measures
640×832. So the collider hung 96 units past the art on two faces and fell 96 short
on the other two, which is exactly the pair play could walk into.
`TRANSPOSED_BOX` in `lib/game/obstacles.ts` is that one name, and it says why.

**Getting INSIDE is a missing FEATURE, not a bug — and it is BUILT now**, further
down under "THE SHELTER". The model is a closed twelve-triangle box with no
interior to walk into, in the remake and in the original alike; what happens is
that the pig stops being drawn. The skill numbers this paragraph used to carry were
wrong and are corrected there: 60 VEHICLE INOUT, **61 BUILDING INOUT**, 62 EJECT
PIG, and 64 is BINOCULARS.

**And the props are UNLIT at last.** `three/modelMesh.ts` has said since it was
written that a map's props must not be lit — a third of their NO2 entries are
garbage floats and the faces reference them — and no caller ever passed the flag.
`three/props.ts` does now, which puts them on the same footing as the ground.

## THE THIRD PASS: the door, the walls, the pig's own sphere, and the smoke

Play's batch, in the order the answers came.

**"В игре не может быть мусора" — and he was right to push.** The claim that a
third of a prop's normals were garbage floats is corrected where it lived
(`three/modelMesh.ts`): the bytes are **x86 instructions**. STW07PWW's NO2 holds 28
entries, 7 unit-or-zero and 21 reading `5a 59 5b c3` (pop/pop/pop/ret),
`53 51 52 56`, `b8 ff ff ff`, `e8 d4 1e 00` with every fourth dword zero — the
archiver padded with whatever memory it had. The layout is not in doubt
(`british.mad` is 97.5% unit through the same reader), and a quad's four normal
indices ARE its four vertex indices, so the faces point into the code. Which
settles unlit props from the other end: the original cannot be reading that.

**A RECORD'S OWN HEALTH beats the table.** "У дома кажется сильно много хп — с
1-го взрыва дверь ломается." The door says so itself: CAMP's record 46 is
`STW04_D2` and its **field 12 is 50**, exactly TNT's fifty at the core, where every
wall round it leaves the field at 255 and takes the table's sixty. The exe reads it
at 0x4a6179 (`field12 << 7` into `[+0x4c]`, and `[+0xa8]` too for the breakable
class); 5479 of 6322 shipped records say 255, and `lib/game/targets.ts` now honours
the rest.

**A WALL IS THIN, and that is what "дом бестелесен" was.** `MIN_SOLID` asked both
horizontal extents to reach two box units, and every wall piece in the game is ONE
unit thick (STW04PPP 64×512×512, STW07PWW 64×512×2048). The line is on the
FOOTPRINT now — a box stops a pig unless it is a single unit square, which over the
shipped data is exactly the tufts, the fish, a lamp post and a chimney pot.

**The pig's body is READ at last: a sphere of radius 0xAA = 170.** The 160 was half
a spawn marker's 5×5×5, and the loader jumps the box build outright for a pig
(0x4a61ad) — so that marker is not a collider anywhere in the original. What a body
is comes off the type-keyed table at 0x4a90cc: slot 0 is shape kind 2 with
`esi = 0xAA`, and slot 7 gives the blast effect the 35 this engine already draws
with. So the pig keeps a radius, and it is now the game's own number.

**COLLECTING a crate takes NOTHING away — only PLACING one does**, which is the
exe: `Pig::ClearInventory` (0x468f50, unconditional, no training-ground guard in
it) is called from the placement arm at 0x4aa6cb, and only on its PICKUP branch,
the other jumping clean over it at 0x4aa659.

**A rule that took your weapon on every collection stood here for a pass, and
it began as this repo reading play BACKWARDS.** "Тнт не забирается когда аптечку
в доме подбираешь… должен" was taken for a request that it BE taken; it was a
report that the TNT survives a medkit, and that it should. Play settled it in
one line — **"должен оставаться — я сказал"** — and then had the second half
out too: "ящик с оружием при подборе всё ещё забирает то, что несёшь — а вот
это давай сразу почистим." Worth keeping as a shape rather than as a fact: a
sentence of play's describing what the game DOES is not automatically a request
to change it, and the cheap check — asking what the line would BREAK if applied
— was available before the code was written.

What it broke was the training ground, and the arithmetic is all in CAMP's own
records. The DOOR (record 45, `STW04_D2`) is the one piece of the house with a
health of its own — **50, exactly TNT's damage at the core**, where every wall
beside it takes the table's 60 — and the only one carrying a command (opcode 22,
waiting on 89, signalling **7**), which the bazooka crate (18) and the house's
own medkit (55) wait on. So breaking a WALL places nothing, correctly; every
skill on the training ground being UNLIMITED, the player still has the TNT and
can go and blow the door — unless a medkit has emptied their pockets on the way,
there being no second TNT crate (record 52 is the only one, waiting on label 6).

**And the confiscation can only ever happen on CAMP — measured over all 61
shipped POGs.** Only CAMP has crates that WAIT to be placed (eight of them);
every other map's crates stand on their ground from the start, so the pickup
branch that clears is never reached. Eight maps besides it do run script steps
(BHILL, BRIDGE, GENMUD, MASHED, OASIS, SNAKE, SNIPER, TRENCH have waiting
records), but what they hold back is scenery, not pickups. **Not pinned by a
spec** — `docs/todo.md`.

**A steep throw goes IN.** "Если вертикальная скорость выше горизонтальной —
прожектайл тонет." The skip already needed 150 along the surface; it now also needs
to be going along faster than down, which is the same reading of `[contact+0x14]`
the page already argues for, with the case play caught added to it.

**Black smoke, and a bullet that smokes.** A puff was 55 units across in mid grey —
a sixth of a pig, invisible beside a fireball. It takes the fireball's own colour
law now (`cloudChannel(16)` = 100 of 255) at a size where fourteen of them read as
a cloud. And a bullet lays the same trail a grenade does — **which was right by
accident**: the CONSTRUCTOR's dispatch answers kinds 21..53 only, so a bullet is
outside it, and what actually hands one over is the projectile UPDATE's second
per-kind dispatch, where kinds 12..17 push the grenade's own id 0x15.

**Finding that dispatch is the pass worth remembering.** The same reading had been
offered as "the exe hangs nothing on a bazooka either" and play refused it in one
word — "ВРЁШЬ!!!" — and was right. The update has TWO per-kind dispatches; the one
that had never been read (0x436596 → 0x436727, the map at 0x436D68 indexed by the
kind STRAIGHT) hangs effect **0x14** on kind 10 on its second frame. Reading it
also corrected the grenade: the id → update map (`[0x48BF90 + id − 1]`) puts 0x14
on the ÷6 arm and 0x15 on the ÷3 one, so the "six a frame of type 0x16" this repo
called a grenade's trail is the ROCKET's, and a grenade lays **three** of type
0x19.

`lib/game/trail.ts` carries all three rows and **every number in them is the
engine's**. A pass that gave the rocket a white, double-size row off play's
"белый густой дым" was sent back — "давай делаем как в движке, в этом же и суть"
— and the count is where the difference really lives. If a trail reads as nothing
on screen, the thing to fix is the PUFF (our canvas blob against the original's
textured additive particle), not the row.

**The flight ANIMATES.** "Отбрасывание не запускает анимацию полёта. падение не
запускает анимацию подьёма после полёта." Both were one line: the frame dresses
every non-acting pig in IDLE once a frame, which took the bounce clip straight back
off — and the two beats did the same to the acting pig. All three now leave a pig
in the air alone.

## THE SHELTER: a pig JUMPS IN, and is gone from the picture

Play: "давай бомбоубежище доделаем — свин должен запрыгивать внутрь. И видит
бомбоубежище — в инвентаре скилы только постройки, и у бомбоубежища это только
пропустить ход. И просвечивать должны стены, которые мы взрываем — не
бомбоубежище." Three sentences, and the third turned out to be a consequence of
the first.

**Being inside means NOT BEING DRAWN, and that is the exe's own rule.** Both of
its doors — 0x469f60 in, 0x469b60 out — and the loader's own boarding do the same
two things to the pig: `[body+0x44] |= 1` and **`[pig+0x30] = 0`**. That second
byte is the gate the draw loop tests every object on (0x44e43e) and the base
constructor clears it (0x4a7e1b). So a pig in a shelter is off the screen, and
`lib/game/indoors.ts` does the same through the snapshot's own `sheltered` flag.

Which settles the fade: **a BUILDING is out of `sightBlockers` altogether**. Play
asked for it and the reason is stronger than the request — there is nothing behind
the wall to see. The eighteen pieces of CAMP's house are ordinary breakable scenery
and go on fading, which is the half play asked to keep.

**A building's own row is read**, out of 0x4c2e08 the constructor indexes by
`kind − 1` (`lib/game/buildings.ts`), and it carries two numbers:

| kind | | health | room |
| - | - | - | - |
| 1 | BIG_GUN | 200 | 1 |
| 2 | M_TENT1 | 30 | 2 |
| 3 | M_TENT2 | 40 | 4 |
| 4 | PILLBOX | 100 | 2 |
| 5 | **SHELTER** | **100** | **3** |
| 6 | TENT_S | 25 | 1 |

The second column is a CAPACITY and it is read rather than guessed: 0x46ca50 takes
`[+0xd8] − [+0xe4]` through `neg`/`sbb`/`inc` — the compiler's `== 0` — and turns
the pig away when they are equal, `[+0xe4]` being the occupant count kept beside
the list `Building::AddOccupant` (0x43f7f0) hangs off `[+0x80]`. So three pigs fit
in a shelter and the fourth is refused. The HEALTH is read and deliberately NOT
applied — a building is still not breakable here — and `002/shelter.spec.ts` pins
it so the reading cannot rot.

**The door has a KEY OF ITS OWN — `C` — and that was a correction.** It went in on
the jump key first, off "свин должен запрыгивать внутрь", and play sent it straight
back: "я не говорил по пробелу — там просто анимация входа, запрыгивание; сделай
отдельную кнопку, пробел уже прыжок." Right on both counts. The **запрыгивание** is
the animation the original plays, not the key, and a door sharing the jump means a
pig standing against a shelter cannot hop — one key wearing two meanings, which is
the kind of thing that reads as a hack because it is one. So `enter` is an action
of its own (`input/actions.ts`), `enterBuilding` a verb of its own
(`lib/game/controls.ts`), and `002/controls.spec.ts` pins that SPACE still means
jump in the battle and that nothing else is bound to `C`.

The exe's own door is the SKILL, 61 BUILDING INOUT out of the menu, and that is
still where it belongs the day the other five buildings are worth entering; the key
is the remake's and says so where it is bound. The verb is answered before the
walk, because a pig inside is not driven at all — no walk, no turn, no jump, no
crate collected, no mine trodden on. The FIRE key still reaches it, because SKIP
TURN has to.

**The entry ANIMATION is not built and nothing was found to build it from.** The
exe's enter arm (0x469f21..0x469fb4) calls `0x4a9800`, `0x4734b0`, `0x4a9ee0` and
`0x4a9e50` and **no `Pig::SetAnim` at all** — it clears the draw byte and the pig
is gone. So whatever play remembers hopping in is either one of those four or a
clip the picker asks for elsewhere, and inventing one here would be a stand-in.

**The menu indoors is the BUILDING's list, not the pig's** (`choosableIn`), and a
shelter's is empty — so the menu comes up with the one entry it always adds and
that entry is SKIP TURN, which is exactly what play described. The PILLBOX's own
45 HEAVY M-GUN and 46 FLAME THROWER are read and left out on purpose: neither is
built, and a menu entry that does nothing is the one thing a menu must not have.

Two numbers are the remake's and say so at the field: the reach — the exe's 0x100
applied to the building's own FOOTPRINT, because the pair its own test differences
comes out of an untranscribed call — and where a pig comes back OUT, which is the
doorstep it jumped from rather than anything the exe was seen to compute.
`pow.debug.shelter()` gives the building he is in, the one he could enter, and
whether his model is on the scene at all, because none of it is visible by design.

## THE DOOR, THE STEP AND THE SLOT — play's three, 2026-08-11

**The clip CARRIES the pig.** Read in full in `objects/notes.md`, summarised at
item 6 of the play list in [status.md](status.md). `lib/game/doorway.ts` is the
pure half — `carryIn`,
`carryOut`, `advanceCarry` — and `battle.ts`'s door block starts it, ticks it
after `updateLocomotion` (the exe's own add comes after the movement update too,
and overrules the ground pin), and ends it when the once-clip does. Two things
had to move with it: a pig going THROUGH a door is not driven but IS moving, so
`game.moveCurrentPig` is now gated on being actually inside rather than on
`sheltered`; and `focus` drops a half-open door the way it drops a half-finished
climb.

**Where the leap OUT ends is the whole of it.** Play, on the first pass:
"выпрыгивание не работает — проваливаюсь обратно сквозь крышу", and with it
"применение — отключает управление пока не завершится действие." Both were one
bug and it is measured. The glide targets the box's TOP, but the clip and the
carry finish a frame apart — the door block asks `anim` before `advanceCarry`
runs — so the rise stopped a few units SHORT: −1562 against a top of −1568. And
`standOn` counts nothing above the feet, so six units under the roof is no
support at all: the pig fell the whole 352 back to the ground **inside** the
shelter, where a solid box holds it still and the controls read as dead. The door
now ends the leap ON the roof plane, builds the footing FROM the roof (so the
step-up envelope is measured off the thing being landed on rather than the ground
below it) and hands the pig to gravity with a still velocity — the ordinary
landing does the rest. `e2e/002/shelter.spec.ts` waits for the rise to stop and
then asserts both halves: he is a shelter's height above the doorstep, and he
walks.

**A SCRIPT STEP IS OWED BY THE BATTLE, not by the beat that is running** — and
this is what had the tutorial stuck. Play: "когда взрываю дверь — должна базука
падать - щас нет." CAMP's door is record #46, `STW04_D2`, the one object on the
map carrying the guarded opcode 22: it waits on label 89, which nothing else
waits on, and signals **7** — which the bazooka crate (#19), the health×25 crate
(#56) and two more dummies all wait for. So everything after the TNT step hangs
off that single break. But TNT's fuse outlasts the four seconds planting hands
back, so the door breaks inside the beat at the END of the turn — and that beat
returns three branches above the block that paid the step, with `focus` clearing
the debt on the handover. `payScriptStep()` is now called before the branches and
the walk-away beat holds while anything is owed. The exe owes no wait at all
(`Object::RunScript` is the last thing the break handler does, 0x48d972); the
wait is the remake's own pacing, and what it must not do is depend on the mode.

**A pig INSIDE holds the door.** Play: "когда прыгаю в здание — в оружии должна
быть иконка запрыгивания во что-то (есть в игре)." Skill **61 BUILDING INOUT**
has an icon like every other (`SKILL_ICON`, and 60 is the VEHICLE's own), so the
slot beside the dial carries it for as long as the pig is in there. A DRAWING
decision and not a rule — `ui/battle.ts` substitutes it into `hud.draw`'s
`holding` and `pig.holding` is untouched, because the fire key acts on that and
the remake's door is a key of its own.

## THE SKY, 2026-08-12 — and the folder named after it is not it

The battle had drawn against a flat clear colour since there was a battle, with
`Skys/` sitting in the install as the obvious place to start: paired `.PMG` and
`.PTG` per mood, `COLD` and `DESERT` and `NIGHT` subfolders, and the `.PMG`s all
23552 bytes — 64 blocks of the terrain format's own 368, an 8×8 grid where a map
is 16×16. It reads like a sky made of ground.

**It is dead data on the PC.** The exe holds exactly three strings with "sky" in
them and not one of them is a path into that folder, and the two library exports
that would have consumed it — `afSetSky` and `afAddSkyToSortList` — are resolved
by name at 0x4AC430 and then never called: a scan of the whole `.text` for
`ff 15 <slot>` finds zero sites for either. Which is the second time this repo
has been saved by reading a search out to the end rather than stopping at the
first plausible file.

What the PC draws is at **0x4866B0**, and `library/notes.md` had already walked
past it — "two objects at `[[0x537FA0]+4]`/`[+8]`, scaled ×0x100000 —
sky/backdrop-sized". It is `Chars/SKYDOME.MAD`: `skydome`, a 32-segment
hemisphere of radius 15778 in eight rings, and `skydomeu`, its mirror below the
horizon, 544 triangles each in four quadrants. Four 250×250 TIMs skin them, out
of one of eleven `Chars/<mood>.mad` archives — which are TIM archives wearing a
model archive's extension, the only ones in the install that do. Both objects go
at the origin and are scaled `(0x100000, 0x80000, 0x100000)` against
`afScaleObj`'s unity of 4096: 256× across and 128× up, so a dome authored round
is drawn squashed to half height.

**Which mood is the MAP's, and the pairing is two tables.** `[0x520708]` turned
out to be the first dword of a 60-byte mission record copied there whole — 53 of
them at 0x4D5210, against 59 map names at 0x4D1990, and the campaign path
indexes the one by the other. It looked wrong at first because the name table's
base is easy to take four entries early; what settles it is `[0x4D17F0]`, the
campaign order, whose first mission is id 10 — `CAMP`, the training ground. The
data agrees the whole way down: ICE, ICEFLOW and FJORDS cold, DESVAL desert,
LUNAR1 space, PLAY1 and PLAY2 toy. The skirmish path searches the same records
for one whose field 0 is the mood the player picked, which is why that field is
a key as well as a value. `lib/game/sky.ts` carries the table.

Three things about the drawing are the remake's own, and `three/sky.ts` says so
at each:

- **The dome is small and rides the eye.** Four million units across cannot go
  through a depth buffer — the battle's far plane is 100 000 — so it is drawn at
  a radius of 40 000 centred on the camera every frame, which is the same
  picture in the limit. Behind everything by RENDER ORDER and `depthTest: false`
  rather than by distance.
- **Its skins are forced opaque.** A TIM's colour 0 is transparent and the
  ordinary model material discards it, which is right for a fir on a billboard
  and wrong twice here: black is what a night sky is mostly made of, and there
  is nothing behind the sky for a hole to show.
- **`pig.HIR` must not touch it.** `loadModel` pairs textures by the archive's
  own name and applies the skeleton sitting next to it in `Chars/`; the dome's
  vertices are absolute and all carry bone 0, so that would have moved the whole
  sky by the pig's root. `loadSky` is its own path for both reasons.

## THE FOG, AND THE UNITS THAT ARE NOT OURS — 2026-08-12

The mood's own `switch` arm gives a fog colour and a near/far, 238 out to
2125..4524, and `afSetFog` (`_d3d.dll` 0x100096F0) turns them into four
`SetRenderState` calls and nothing else: FOGENABLE, FOGCOLOR, FOGTABLEMODE =
`D3DFOG_LINEAR`, then FOGSTART and FOGEND with the caller's floats passed
straight through. Linear and eye-relative, which is three's `Fog` exactly. It is
called once a battle (0x4859E2, the only `ff 15` against slot 0x538058 in the
whole `.text`), never disabled, and `afSetWeatherValues` sets FOGENABLE again
right after with the same flag.

**So I read the distances as WORLD units, and that was wrong twice over.** Built
that way it buries a 16384-unit map inside eight tiles and hazes the acting pig,
which play answered with a screenshot of the shipped game and five words:
"молоко через пол шага", against a picture with a light haze about half a map
out and nothing near the pig at all.

**The proof was in the same function all along.** `afSetFog` does not only set
render states — it builds a matrix at 0x10009660 out of three immediates and
hands it to `SetTransform(D3DTRANSFORMSTATE_PROJECTION)`: **zn = 100, zf = 500**,
fov π/4. A map 16384 across cannot be drawn through a 500-unit far plane, so
vertices reach the library ALREADY SCALED DOWN and its z is not ours. (The
vtable offsets are what name those calls: `+0x2C` SetTransform and `+0x50`
SetRenderState is `IDirect3DDevice7`, which also settles that the engine hands
over untransformed vertices.) The factor itself is not decoded. `FOG_SCALE` in
`lib/game/sky.ts` stands in for it at 8 — one number, `[play]`, set against the
original's own picture — and the COLOURS and the ratios between the moods stay
the exe's.

The rule that came out of it is general and now in CLAUDE.md: **never take a
distance the library is handed for a world distance.**

One colour-management trap on the way: `new THREE.Color(r, g, b)` takes its
three numbers in three's WORKING space, which is linear, so the exe's bytes
handed over bare came out several shades light — 248 read back as 252. It is
`setRGB(…, THREE.SRGBColorSpace)` in and `getHexString(THREE.SRGBColorSpace)`
out. A debug hook caught it, not the eye.

## AND THE SNOW, which was nearly written off as removed

The same record decides it, and the loader is plain enough: `snow.mtd` for the
cold mood and `rain.mtd` for every other one, into `[+0x41C]` at 0x4853A9. Then
0x4854CE looks exactly like the start — `(1, 0)` for cold, `(0, 0)` for
ominous, every other mood skipping the call — and the function it lands on,
0x4A9ED0, **is a folded `ret 8`**. I reported that as a finding: the weather is
gone from the PC build. Play answered with a screenshot of CAMP with snow
falling on it, and was right. A stub means the wrong function was found. It is
the second time in this repo — the camera's mode 0x0B was the first — and the
rule was already written down.

**The drawing is at 0x44F9B0**, called from 0x44E577, switching on the same
`[0x520708]`: mood 0 → 0x44FE00 (snow), mood 5 → 0x44FA50 (rain), anything else
nothing. So the forty-odd other maps load the rain art and never show it.

It is a **2D effect end to end**, and that is what makes it cheap to carry over:
128 quads 16 units wide, wrapped against the screen's own width and height
(`[0x520668+0x44C]`/`[+0x450]`), handed to `afAdd2dPolyToSortList` in one batch.
The depth is a fiction of eight layers — `i & 7` picks the image (four, one per
two layers), the brightness (grey `(8 − phase) * 8`, near layer brightest) and
how much of the camera's own turn the flake takes, which the exe divides by
`phase + 1`. 0x44F9B0 keeps last frame's camera to work that delta out.

**The first pass of `three/weather.ts` invented four of those numbers** — the
flake's size, its fall, its drift and the parallax gain — on the argument that
the exe's are tied to a frame rate this project does not share. It came back
wrong twice over and the answer was the same both times: read the exe.

It hung still and could barely be seen, and that was mine alone: a layer
decides four things, and I had brightness and parallax calling layer 0 the
nearest while speed and size called layer 7 the nearest. So the visible flakes
crawled — 36 seconds to cross the screen — and the moving ones sat at a
sixteenth alpha. Then it read as a PATTERN, because I had spread the field by a
golden-ratio walk over the index rather than scattering it.

Both are in the exe, plainly, and neither needed inventing. **The initialiser
(0x44E1B9) is three `rand()` calls a flake** — `% screenWidth`, `% screenHeight`
and `% 3000`, the third read by neither drawer. **The step is integer
arithmetic on a 640×480 virtual screen** (`push 1E0h; push 280h`, 0x44E0FE):
`x += (driftStep * m) >> shift`, the same for y, then the camera's turn divided
by `8 − phase` — the FAR layer taking the most of it, which is the opposite of
what a parallax argument would have guessed — then `y += 1` unconditionally,
then a wrap by one screen. `driftStep` and `fallStep` are
`ftol(cos(angle) * 16)` and `ftol(sin(angle) * 32)` off the two trig tables the
same init builds, and `reach`/`shift` are 4/4 for snow against 5/2 for rain.
The quad is 32 wide and as tall as the fall step, which is what makes rain
streak. Every number of that is in `sky/notes.md`.

`three/weather.ts` now runs exactly that, in whole `EXE_FRAME_SECONDS` steps,
mapping the 640×480 field onto whatever the canvas is. It draws with three's
sprites and `sizeAttenuation` off — the one part of three that is already
screen-relative — and hangs off the SCENE rather than `root`, since the flip
into game space has nothing to say about a screen effect.

**Then it fell UP.** The battle's camera looks down, so the pitch is negative,
so `sin` of it is negative, so the fall was. The fix is a convention rather
than a formula: **the game's elevation field is a quarter turn off ours —
1024 is level, not 0** — which is the only reading that makes the exe's own
choice of functions work, `sin` at its maximum for a level camera and easing
off as the view tips. The quarter turn is the remake's, marked at `angles()`;
which of the two fields is yaw and which is pitch is still behind the virtual
call nobody has followed (0x44E2FC). What CAUGHT it is worth more than the fix:
`fallen` in the debug hook had been an absolute value, and made signed it fails
the moment the field rises.

**Then it looked dirty, and then it looked flat, and both were the same
mistake read two ways.** The exe modulates the quad by grey `(8 − phase) * 8`.
Carried as an OPACITY the far layers sat at a sixteenth and were not there at
all, so every flake on screen came from the two near layers and the field read
as one brightness. Carried as an ordinary COLOUR they became dark grey specks
on pale ice — "грязно, слишком серые". The art settles it: every one of the
sixteen palette entries in `Snow0..3` carries the **PSX semi-transparency bit**,
the same 0x8000 this project already decodes as translucency in ground art, over
glyphs of grey 148..206 on a transparent field. It is ADDED. Added, the ramp can
only brighten, and nothing on screen ever goes darker than what was there.

**And the clusters were the frame rate.** The field steps in whole 1/30ths and
the window paints at 60 or more, so half the frames moved nothing and the rest
moved all 128 at once. The state stays the exe's integers; the DRAWING carries
the fraction of a frame still owed. Underneath it there is a real lockstep that
is the exe's own — `m = reach − (i & 3)` gives four speeds, and the layer
changes nothing while the camera is still, so 32 flakes genuinely move as one.
The third value the initialiser rolls per flake (`rand() % 3000`) is read by
NEITHER drawer, so there is nothing in the original to break it up with either.

Two numbers on top are play's and say so: `FALL_GAIN` 1.35 and `SIZE_GAIN` 0.8,
kept as separate constants rather than edits to the exe's 32 and 32 so that what
was read stays readable.

One arithmetic detail, since it bit once: `cdq; and edx,0Fh; add eax,edx;
sar eax,4` is the compiler's signed divide by sixteen and it rounds toward
ZERO, not down. `Math.floor` is the wrong shape for it.

**Two things the verification cost, worth not paying twice.** `#battle-canvas`
holds `<canvas id="battle-hud">` FIRST and the scene's canvas after it, so
`querySelector('canvas')` reads the dashboard overlay back and reports a black
screen — `canvas:not(#battle-hud)` is the one with the battle on it. And a
pixel comparison ACROSS two launches proves nothing: the chase camera settles
differently enough that every sample moves. What the spec holds the dome to
instead is `pow.debug.sky()` — the mood, 544 triangles, four skins, and the
distance from its centre to the eye, which is the one number a screenshot could
never have shown.

## THE PROMOTION POINT, and the objectives machine behind the sergeant — 2026-08-21

Play asked for "the crates" off the previous session's summary, and the read
that followed **corrected that summary**: the sergeant's six crate categories
do not hang off a crate at all.

**What a record's ACTION is.** At load (0x4a6287) a 20-byte thing is built by
0x4A7130 out of the POG record's fields **14** (a KIND), **15**'s low byte (a
LINK id — the byte `formats/pog.ts` calls "not padding and not decoded"), 15's
high byte (a VALUE), **16** (an amount) and **25/27** (where a reward is to
drop, quantised to the 512 tile). It hangs off the object at `[obj+0x48]`.

**An ordinary crate never gets one.** Field 14 = 19 takes its own arm
(0x4a62b2): an action is built only when a global is 1 AND field 15's low byte
is non-zero, and **552 of the 561** field-14-19 records carry 0 there. So the
weapon and the count in a crate are read somewhere else entirely — which is
why the remake's crates have always worked with none of this decoded.

**The collect dispatch is 0x4AA170**, switching on the action's type through a
23-entry byte table at 0x4AA814 into seven arms. Types 4 and 16 do
`[pig+0x1DE] -= value` and say file 08; types 2 and 14 spawn model 0x17 at the
record's own spot, call 0x495420 and say file 07; type 13 spawns model 0x15
with the amount when the value byte is 0xFF and model 0x14 otherwise, saying
file 06 or 05. Types 20 and 21 hunt the pickup whose link byte matches and
finish it. **`[pig+0x1DE]` is the pig's own medal tally**, and file 08's arm is
the single instruction that proves it — the disassembly's flat "takes something
off the pig" and play's "попрощайся с медалью" turn out to be one sentence.

What carries these kinds, measured over all 61 maps: PILLBOX, BIG_GUN, TANK,
M_TENT1, BRIDGE_C, TENT_S, DUMMY — around 130 records in total. **It is the
mission-objective machine**, and it is not built.

**What IS built is the PROMOTION POINT**, which is none of the above. Object
type **395**, `PROPOINT`, eleven records over the shipped maps and ten of them
live on eight maps; BAY's carries field 14 = 0 where the rest carry 19, so it
is drawn and hands over nothing. All ten live ones read identically — weapon 1,
one round — so **the record does not say what a point is worth and every one is
worth the same**, which is why it is a pickup of its own KIND rather than a
crate with odd contents (`lib/game/pickups.ts`). Walking into one counts it,
takes it off the map with its own script command exactly as a crate goes, and
announces `promotionPoint`. The count leaves the battle beside the kills and
lands on `missionReward`'s third argument — which had been written, documented
as waiting on this, and passed by nobody — and lights the debrief's SPECIAL
BONUS row, which had been hardcoded grey for the same reason.

Two things about that row. The exe's bonus table (0x4D3560) is **display only**
and promises up to five where the maps place at most two, so the row is drawn
as long as the greater of the two numbers and a point that was picked up is
never left off it. And the sergeant's drop-point line over it is
`[CHECK — remake]`: the WORDS are play's and they name this moment — "you
reached the drop point, here are some toys" — but the exe reaches that file
from 0x4A7CA5, inside the link-partner arm, and plays nothing at all for
walking onto a PROPOINT.

`e2e/000/propoint.spec.ts` pins the census, because eight maps out of sixty-one
carry one and "I never saw it" is the expected experience everywhere else.
LIBERATE is the earliest map with one.

## The HOSPITAL TENTS — 2026-09-01

Play: "теперь давай на третьей карте посмотрим на палатки хилки — они
работают?" Three answers, and the first two are about the question rather than
the code.

**The third mission's tents are not healing tents.** TRENCH carries two
`TENT_S`, and `TENT_S` takes the SHELTER's arm of the exe's own jump: a turn
spent inside it is worth nothing at all. It is cover. That is the original's
behaviour and not a gap.

**The healing ones are two other models, and they come later.** Counted over
the campaign's own POGs: `M_TENT2`, the MASH tent, on SNIPER (position 8),
GUNS (10) and EMPLACE (20); `M_TENT1`, the medic tent, four of them on BRIDGE
(17). So the first one a player can reach is a MASH tent, five missions past
the tents they asked about.

**And nothing was built for either.** The turn beat ran the disguise's pass and
the poison's and nothing else; a pig could sit in a MASH tent all game.

### What the exe says, now that it has been read

The manual had the behaviour in words all along (`manual.txt`: a medic tent is
"a handy health boost", a MASH tent "cured back up to full health") and
`damage/notes.md` had carried it as an open question — WHICH model was which.
`Pig::PerTurn` (0x4703A0) answers it in three short arms: a pig whose
`[+0x2EC]` is 4 — inside a building rather than a vehicle — goes to 0x470340,
which computes the deficit and asks the building itself through 0x43F930, a
six-way jump on kind − 1. Code 1 heals `min(deficit, 0x1900)` = fifty points,
code 2 heals the lot, and codes 0 and 3 return. M_TENT1 is 1, M_TENT2 is 2, and
BIG_GUN, PILLBOX, SHELTER and TENT_S are not hospitals.

The rows agree from the other side: the MASH tent is the bigger and tougher of
the pair, 40 points of health and room for four against the medic tent's 30 and
two.

**The heal comes BEFORE the poison's ten**, in the same routine — so a poisoned
pig in a MASH tent is topped up and then pays. That ordering is reproduced
rather than assumed: `indoors.turnStarted` sits ahead of `poison.turnStarted`
in the turn beat, with the address beside it.

### Built

`buildingHeal` and `TENT_BOOST` in `lib/game/buildings.ts` — a table beside the
health and capacity ones it was read with — and `indoors.turnStarted`, which
owns it because `indoors.ts` is what knows who is inside what. The payout rides
the same `healed` event a crate and the healing hands do, so the number over
the head and the sigh under it come for free.

`unit/tents.spec.ts` pins all of it, TENT_S included: seven tests, and the one
that matters most is the negative — the tent a player meets first pays
nothing.

## 2026-09-03 — the PILLBOX gets its gun, and the first machine is stationary

Play set the order: "сначала стационарные — потом те что ездят". It is the right
one, and the reading says why. A pillbox's gun points where the PIG points — its
arm calls the ordinary aim helper, `0x46A960` — where the vehicle's three read
the turret's own angle out of `[[pig+0x170]+0xA0]` instead. So a building
borrows machinery this engine already has, and a vehicle needs machinery it
does not.

### What the exe actually says

Five arms `weapons/fire.md` had SIZED and never opened, read this day into
`weapons/emplaced.md`: 45, 46, the vehicle's 47/48/49, and both halves of the
in/out toggle at 60 and 61.

The design is one instruction. Every firing arm opens

```
mov  eax, [esi+0x170]      ; the thing this pig is inside
test eax, eax
je   0x47CD88              ; ...and if there is none, nothing happens at all
```

No class gates them, no kit, no menu — **`[pig+0x170]` and nothing else**. And
nothing happens loudly: no sound, no clip, no refusal. That matters here because
a CRATE hands 45 and 46 over (bytes 41 and 42), so a pig really can stand in a
field holding a pillbox gun, and the honest answer to the fire key is silence.

What comes out is an ordinary row through the ordinary constructor — there is no
emplaced-weapon machinery in the exe at all. The rows are the surprise:

| | speed | damage | pts | row +0x08 |
| - | - | - | - | - |
| 45 HEAVY M-GUN | 300 | 1024 | **8** | **0** |
| 46 FLAME THROWER | **150** | 512 | **4** | **0** |
| 7 RIFLE, for scale | 300 | 2560 | 20 | 0 |

The HMG fires the rifle's own bullet model at the rifle's own speed for less
than half its damage, and **neither throws anybody**. A pillbox is a cheap
position that never has to walk, not a hard-hitting one. That reads like a bug
and is not, which is why B27 says so in the play block.

`Building::ChangeAim` (0x4401D0) is the other half and it is the whole aiming
mechanic. `Pig::ChangeAimAngle` does the pig's own clamp and the per-skill
floors, then hands the same delta on: state 3 to the vehicle, state 4 to the
building. The building adds it to `[+0xE2]` — the elevation lives on the
BUILDING — and clamps it on the kind:

- **BIG_GUN**: [0, 0x200]. Level to 45° up, and it cannot depress.
- **PILLBOX**: [−0x200, 0x200], a full 45° each way.
- everything else: [0, 0], which is the table saying "no gun here" without a
  flag for it.

So **sitting in a pillbox costs half the elevation** a pig has on its feet.

### Built

- `buildingSkills(4) = [45, 46]` — the table that had been empty on purpose
  since the shelter was built. The exe never states the pairing as a table; it
  states it three times as a fact about the kind (the barrel elevates for kinds
  1 and 4, the AI's fire-from-cover branch tests kind 4, and 45/46 are the two
  whose arms want a mount).
- `barrelRange` beside it, and `clampAim` grew a MOUNT argument that runs after
  the weapon's own — the same order the exe stacks the two clamps in.
- `lib/game/barrel.ts`, new and small: `isEmplaced`, and `barrelMuzzle`, which
  is where the round is born. **This one is the remake's.** The exe's muzzle
  table is only consulted for skills 6..38, so 45 and 46 have no offset in it;
  and in this engine the pig sits at the building's box middle, the box is
  solid, and a bullet is stopped by the first box it is inside of — so a round
  born at the hand bone would die against the pillbox's own wall on the frame it
  left. It leaves through the wall the pig is facing, found in the box's own
  turned frame, a quarter of the way down from the roof.
- `battle.ts` lets a pig at a gun TURN where `sheltered` used to take the whole
  of its input, and moves its heading without moving it.

### What is deliberately not there

The pig inside is not drawn — that is the exe's own rule and it predates this —
and the GUN_BARRELS group is unread, so **nothing on screen turns**. The round
appears at the wall and flies. The camera is the gun's rather than the barrel's
0x11. Both are in section C, and both are art rather than mechanism.

`unit/pillbox.spec.ts`, eighteen tests. The two that earn their place are the
negatives: the pair is inert on foot, and neither of them moves anybody.

## 2026-09-03 — a VEHICLE is a mount, and the class it belongs to gets opened

Same day, the second half of play's order: "сначало стационарные — потом те что
ездят". The reading turned the two halves out to be much less different than
expected — and the difference that remains is exactly the one that makes the
second half expensive.

### The class

`objects/notes.md` had the VEHICLE class listed as never opened, naming five
addresses and reading none of them. `objects/vehicles.md` opens it, and the
find that matters is a table nobody had looked for: **0x4D94A0, twelve bytes a
kind**, loaded straight by the constructor. Health, capacity, and a third
column that is 30 on all seven kinds and therefore separates nothing.

**Everything on the ground takes a hundred and fifty points** — half again what
a PILLBOX takes, fifty short of a BIG_GUN — and the two kinds that FLY take
one. That is not an oddity: AIRSHIP1 and PP1 are on no shipped map at all,
because they are not scenery. They are what an AIR STRIKE spawns to carry the
bomb in.

The second column is the capacity, and it is worth saying how that was settled,
because no single source states it. The table says ten for AMLAUNCH and CARRY
and one for the rest. The ram switch at 0x478580 sends **exactly those two
kinds** to a different arm from the other three. And the manual says "the troop
**carriers** can be handy for picking up a group of your chums… just drive into
one of your team-mates and he will oblige by jumping in with you". Three
independent statements of one split.

### The turret, and the one structural difference

`Vehicle::ChangeAim` (0x49b6e0) is `Building::ChangeAim` with a different
clamp: **[0, 0x400] for AM_TANK and TANK, [0, 0] for everything else.** So a
turret reaches ninety degrees where a pillbox's barrel reaches forty-five —
and its minimum is a hard zero. **The PILLBOX is the only mount in the game
that can look down.**

The difference that costs: a pillbox's gun takes its heading from the PIG,
through the ordinary aim helper, and a tank's takes it from `[[pig+0x170]+0xA0]`
— **the turret's own object**. That is why the pillbox was a day's work and the
tank is not: one borrows machinery this engine has, the other wants machinery
it does not.

### Built

- `vehicles.ts` — the names, the kinds, the stat table, the three weapons and
  the turret range. Small and pure, like `buildings.ts` beside it.
- `mounts.ts` — the dispatch, and it earns its place with one fact: **kind 3
  means M_TENT2 to a building and TANK to a vehicle.** Before it, `battle.ts`
  asked `barrelRange(kind)` with a number and no class, which would have read a
  tank's turret out of the tent table and typechecked clean.
- `indoors.ts` holds both classes now. The change was small because the file
  was already right: the door, the glide, the footing and the occupant count
  never cared what they were the door TO. Only three lines asked a
  building-shaped question, and they now ask a mount-shaped one.
- 47, 48 and 49 as LOBS rather than guns — the records say so (+0x14 is 1 on
  the first two) and the ladder needed the emplaced gate on that branch too, or
  a tank shell would have come out of a pig's trotters.

### Deliberately not built

**Driving**, and with it the ram, the carriers' pick-up, and skill 62 EJECT.
`docs/todo.md` B28 has the whole of it. The honest state is that a vehicle is a
gun emplacement that happens to have tracks — which on OASIS, where six of them
sit, is most of what a tank is for anyway.

`unit/vehicles.spec.ts`, seventeen tests. The one that would have caught the
real bug is the dispatch test: `mountSkills('building', 3)` is empty and
`mountSkills('vehicle', 3)` is the tank's three.
