# Where it stands

Status, the lists play has given, and what is still not read.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## What is built, and what it wears

Formats, models, textures, skeleton, 93 animations, terrain, water and the
maps' OBJECTS all parse and render — CAMP draws its 147 props, the training
ground's dummies, crates and bridge among them. **The main menu IS the
original screen**: the backdrop and the machinery out of FEBMP.MAD, the
letters out of the FEText glyph tables, the labels out of fetext.bin — MAIN
MENU over ONE PLAYER, MULTI-PLAYER, OPTIONS, QUIT APPLICATION, drawn on a
640×480 canvas that is scaled whole and unsmoothed. Only ONE PLAYER leads
anywhere (the training ground); the two unbuilt screens wear the font's dark
shade, the way the original greys out what cannot be chosen.

**The battle wears the original's brass too.** What the original keeps on
screen — from play, not from the disassembly:

- the **clock**, bottom right: `clock01..04` out of
  `Language/Tims/dashtims.mad` with a `timer0..9` face in each of its two
  windows;
- the **angle dial and the weapon slot** as ONE widget, top right, always
  there: `ang1` over `ang3` is the beaded arc with the needle's spindle down
  its right edge, `wedge1`/`wedge2` its see-through green face, `angpoint`
  the needle, and `ang2`/`ang4`/`ang5` the slot beside it — empty until a
  weapon is chosen. Which piece is which is play's answer, not the
  archive's; the whole map is in docs/formats.md, `divide1`/`divide2` (the
  needle's stops, which a weapon may move) and the power gauge among them;
- the **map**, bottom left (not built);
- over each pig, its **name and its health beside a heart**, in the BIG
  letters, which hide the moment the player moves and come back after two
  seconds' rest — the heart is `iconhart` out of `MAPICONS.MTD`, which ships
  its markers WHITE for the game to paint;
- the **power gauge**, only when the weapon in hand asks for one.

The dashboard rides on its own canvas over the 3D view, at native
resolution, scaled by the window's height against the 480 the art was drawn
for, and anchored to the view's own edges — a wide window is wider than 640
of those units.

**Every number it is placed by is one live object, `LAYOUT` in `ui/hud.ts`,
and the console is its editor**: `pow.hud.layout.dial.slot.bottom -= 1`
nudges a piece against the real screen and `pow.hud.print()` writes the lot
back out to paste in. Placing this art is eyework — it took four rounds of
"almost, seven pixels up" to seat the weapon slot — so do that in the
console and commit the result, rather than rebuilding per pixel.

**A turn's LENGTH is the level's, and the first three are 99 seconds.** The
exe reads it from a 27-entry table at 0x4d1860 and multiplies by 100 into
the clock (0x4309f1) — 99, 60, 45, 30, 15 as the campaign tightens, which is
also why the dashboard's clock has exactly two digit windows. WHICH level is
which map is NOT decoded (the name comes from its own array on a different
index), so `lib/game/turns.ts` keys only CAMP, the training ground and so
level 0, and says so.

**A turn does not begin when it is handed over.** There is a beat first —
its own mode in the original, with the debug line "START OF TURN - Press any
key to continue" (exe 0x4d8a2c) and three ways out, each of which announces
itself: timed out, digital input, pause button. The timeout is 998 in the
same hundredths the turn clock uses, so about **ten seconds**
(`TURN_START_SECONDS`); the clock does not run during it and the pig cannot
be driven, and the first input both ends it and is acted on in the same
frame. Behind it the original flies its camera to the next pig, which the
remake does not — so if ten seconds of a still screen reads wrong in play,
that is the thing to fix, not the constant. Specs skip it through
`pow.debug.beginTurn()`, the second debug WRITE after `warp`, because every
key a player would press also drives the pig.
`turns/notes.md`.

**A level OPENS with the drop-in.** A marker's flags bit 6 says its pig
arrives by parachute, and on a campaign map that is the player's side of
five while the enemy is already standing there. Those pigs start
`fromExeY(3072)` above their own marker with a `WE_PARA` canopy over them
and come down at the parachute force's terminal — about five seconds — with
the turn clock and walking stopped, because the original's parachute branch
advances the clip and returns. The ONE key it answers is JUMP, which cuts
every canopy at once and hands the squad back to gravity (the exe's handler
walks the whole pig list). `lib/game/parachute.ts` is the descent,
`three/parachute.ts` the canopy, and the whole derivation is
`parachute/notes.md`.

**A miss is measured, not guessed at.** `pow.debug.strike()` gives the last
swing's three blade points and, per pig and per dummy, the nearest approach on
each axis — `gap.x`/`gap.z` against 170, `gap.y` against 360, `degrees`
against 67.5. A strike has four separate ways of failing and no way to tell
them apart by eye. It earned its keep on the first miss it was pointed at:
`gap.x` 1.3 and `off` 0 with `gap.y` **3136** said in one line that the
horizontal was perfect and the vertical was in the wrong SPACE — `targetsOf`
had taken a POG record's stored y, which is an up-positive ELEVATION, as if
it were a game-space (Y-down, `HEIGHT_SCALE`) coordinate. Two rounds of
reasoning about bones had got nowhere; the numbers took one.

`e2e/002/strike.spec.ts` is the pin that would have caught it — the whole
path in one spec, collect the crate, take it in hand through the real menu,
walk up and swing. The pure specs around it all passed while the feature did
not work: what was broken lived BETWEEN them.

**The damage FLOATS off what was hit, in points.** It is the original's own
effect, not a flourish: `Pig::TakeDamage` (0x467b5b) and the dummy's
(0x48da5c) both call **0x487b90** with the body's position and `amount >> 7`,
which spawns effect 0x35 with a life of 0x3e8 and the value at `+0xd4` (a
style index per team at `+0xd8`, out of 16-byte records at 0x4cf1e4 — not
used here). `three/damageNumbers.ts` holds them and `ui/hud.ts` draws them in
the game's own letters, OUTSIDE the name plates' rest delay: a hit is exactly
when nobody is standing still, so sharing that delay would hide every one.
How it MOVES is not decoded — the rise and the fade are the remake's own, and
so is reading 0x3e8 as milliseconds rather than the clock's hundredths.

**And a blow throws RINGS — the effect system is decoded and its first piece
is built.** The original has ONE effect class (vtable 0x4bd370, 0xE4 bytes,
body type 0x135E) and every effect in the game is an id into it. `Init`
(0x487ca0) switches the id into a parameter ROW — **143 signed bytes per kind
at 0x4d61e8**, scaled per index by 0x4d6c88 — and the row is twelve timed
STAGES, each of which spawns a CHILD effect of its own on one named frame of
the parent's life. For all five hand-to-hand weapons every live stage spawns
the same child, id 0x18: a **ring**, thirty-two quads in the XZ plane, outer
radius `[+0x86]` and inner `[+0x86] − [+0x8C]`, each with its own growth (and
the sword's with a second difference, so its rings SLOW). The colour is 5
bits a channel out of the row and is divided by the ring's own age, so a hit
is a white flash that collapses into the table's dark blue-purple over about
half a second — which is what play remembers as black smoke. The bayonet
throws two rings, the sword three, the cattle prod three and a particle
burst (not built — the particle half is undecoded past its 40-byte record).
`lib/game/effects.ts` is the rules, `three/effects.ts` the geometry,
`effects/notes.md` the read.

**The map's SCRIPT runs, and the objects ARE the program.** There is no script
file and no interpreter loop: every POG record may carry one command, **field
14 is its opcode**, and the loader hangs it on the object at `+0x48`
(0x4a6287). It runs when the object is FINISHED — a dummy breaking (0x48d972,
the last thing its death handler does) or a crate being collected (0x464633).
A chain of "and then", one link per object.

**Field 15 is a PAIR of labels**, one byte each: the low one is what the object
WAITS for, the high one what it SIGNALS. Except on a crate — field 14 of 19 —
where the high byte is the CONTENTS instead, so a crate waits and never
signals. Field 14 of **21 or 23** takes the object OFF the map at load
(`[obj+0x30] = 0` and the body's no-draw bit, 0x4a62f2), which is what CAMP's
23s are: eight dummies and the whole second bridge, seven records all waiting
on the same label so it arrives assembled.

**A crate comes down under a CANOPY and everything else just switches on**, and
that is the record's own doing rather than a choice: the placer tests the
waiting object's BODY TYPE, and `0x135b` — what the pickup constructor writes
(0x4641bd) — gets lifted **0xC00 above whatever signalled** and falls
(0x4aa64a). 0xC00 is the same 3072 the level's opening drop-in uses, so it is
the same descent, constants and all (`three/airDrop.ts` over
`lib/game/parachute.ts`).

Read off the shipped CAMP, breaking the FIRST dummy places two more dummies and
drops in a crate of **rifles** — which is what play said before any of it was
read, down to the weapon. `lib/game/script.ts` is the rules and
`script/notes.md` the read; `pow.debug.script()` says what is
still held back and what is in the air.

One line in it is inferred rather than read and says so: where a CRATE with a
wait label is hidden. The loader's own hide covers only opcodes 21 and 23, but
it gives such a crate a command all the same and the placer's whole job is to
switch it on — which would be nothing to do if it had never been off.

**A thing BREAKING is a different effect, and that one IS the smoke.** Play
said so — "там ещё чёрный дым в игре при уничтожении чего либо" — and the
binary agrees: the object's own break handler (0x48d750, whose last act is to
run its map-script command) spawns effect **0x3e** at a point jittered ±32
about it, which resolves to parameter row **0**, and row 0 has no rings in it
at all. What it has is the BURST: colour 0x4210 — sixteen of thirty-one on
every channel, the exact default the particle setter compares against — fanned
round the horizontal and RISING. So a hit makes rings and a breaking makes
smoke, and they are not the same code path. `onBroken` in `three/battle.ts` is
the hook, the same way the exe hangs it on the object rather than on the blow.

Two things this paragraph used to say are now WRONG and corrected below: it is
not six particles but fourteen over three bursts plus two clouds of seventy,
and the byte the engine subtracts from the y velocity is **gravity**, not
buoyancy — the engine's world is +y UP. Both are settled; see the grenade's
last pass at the end of this file, and `effects/notes.md`.

Two numbers in it are the remake's own and say so: a ring's SIZE rides
`MODEL_SCALE`. The exe computes the radius in world units, but in a world
whose pigs are twice the size of these, so an unscaled band would read as
twice the blow. Same argument as the chase camera's distances — a rig around
a BODY halves with the body, and the terrain does not. The other is how big a
puff of SMOKE is drawn and what it is drawn with — a soft blob on a canvas —
since the half of the system that draws a particle (0x48a570) is not read at
all. A spec cannot see a transparent quad, so `pow.debug.effects()` counts the
live rings and `pow.debug.smoke()` the puffs, and `e2e/002/strike.spec.ts`
reads a high-water mark the PAGE keeps once a frame: polling from the test
misses a half-second window outright.

**Health is POINTS, the maximum is the CLASS's, and it is not 100.** The
constructor reads it out of a 128-byte record per class at 0x4d02e0 — the
same record whose `+0x04` is the thirteen `Pig::Walk` grants — so a grunt has
**fifty**, a heavy 120, class 4 has 130. The engine counts 128ths of a point
and every amount arrives shifted left seven; nothing ever produces a
fractional point, so `lib/game/health.ts` counts POINTS and the exe's
thresholds come out exact: death at `<= 0x7f` is "under one whole point",
which over whole points is `<= 0`. Three more rules, all decoded and all
applied: **the training ground floors a pig at one point** (0x467c85 — CAMP
cannot kill, the same flag that makes its skills unlimited), **sixty points
past dead is a different, messier death** (`GIB_BELOW`, strictly below), and
**healing has NO ceiling** — `Pig::Heal` adds and stops, so a 50-point crate
on a 50-point grunt leaves it at ninety and the original allows it. The
`FULL_HEALTH = 100` clamp that used to live in `pickups.ts` was both numbers
wrong and is gone. `damage/notes.md`.

Finding the pig's vtable is the fiddly step and worth not redoing: it is
**0x4bd298** (`+0x34` TakeDamage 0x467ac0, `+0x38` Heal 0x467fd0), and the
pig links itself into the list at 0x51ee18 on `+0x168`. The class at 0x4bd238
looks like it — health at the same `+0x4c`, constructor in the same 0x464xxx
block — and is NOT: it chains through `+0x7c` off 0x51ed90, its heal is a
`ret 4` stub, and it is the TRAINING DUMMY.

**A fallen pig is stepped over, and by two rules.** `Game.endTurn` advances
past the dead in its own squad AND past a side with nobody left — including
the incoming side's own `activePig`, which advances only when its turn ends
and so can be pointing at a body by the time it comes round again (that one
cost a failing spec). The acting pig dying ends the turn on the spot, which
is what the exe does from inside the damage itself (0x467d4f). `game.over`
says nobody is left. The battle skips a corpse in the idle loop, or it would
stand it back up every frame.

**Some clips are EVENTS, not states — `state.commit` in `locomotion.ts`.**
`Pig::SetAnim`'s third argument is a repeat count, and the exe only
decrements it where the clip's own cursor wraps (0x46e27f..0x46e2cb), so a
count of 1 means "play it through once". Two clips are asked for that way:
the jump's crouch (the launch waits for it, 0x46e8e2) and a landing's get-up
(0x470944, and the parachute's 0x4717f5). `lib/game/clipPose.ts` samples those with
`LoopOnce` and CLAMPS the last frame.

**And BOTH belong to a pig that is not being driven.** The crouch is the
standing hop's: the dispatcher branches on this frame's walking step
(0x46c220) and a pig moving forward goes straight to `StartFalling` — a
run-up never crouches, and backing away does. The get-up is the same rule
from the other end: nothing guards it, but the animation picker (0x467ec0)
asks for a movement clip whenever the pig has speed, and that request resets
the cursor outright (0x472320), while at a standstill it asks for nothing.
So land running and there is no get-up. The domain owns both — it says WHICH
clip and whether it is committed; `Soldier.setClip` cancels a one-shot the
moment a different clip is asked for, exactly as 0x472320 does.

Two ways this has already gone wrong, so do not repeat either: faking a
one-shot with a timer over a looping player (it put a crouch-and-snap on
every parachute landing and read as a bounce), and giving the crouch to
every jump instead of the standing one. The chase camera leaves room for the
canopy while one is up (`desiredCamera`'s `rise`); without that the canopy
sits off the top of the frame, which is how it looked the first time. Every
e2e entry into a battle waits it out through `landed()` — a spec that drives
before then is driving nothing.

Squads are fielded from the map's OWN spawn markers — position,
facing, side and CLASS, each class dressed from its own model in
`Chars/british.mad` — so LIBERATE puts a saboteur, a hero and three grunts
against four spies and a gunner, exactly where the original did. The NAMES
are the game's own six nations out of `fetext` (TOMMY'S TROTTERS with NOBBY,
GINGER, DEN…), and which two a map fields is the map's own choice: a
marker's side bit indexes that list, so LIBERATE's enemy is French. The battle
scene opens on CAMP — the training ground, so ONE pig — and fields real
squads wherever a map has two sides (console: `pow.swapMap('LIBERATE')` —
see README) with
the original's turn clock, tank controls, jumping, swimming (water by the
art's own translucency, floats at the region's surface, sunk SWIM_SINK),
scrambling on
masked type 11, wall scrabble-and-eject, and ground movement taken from
the exe — see `movement/notes.md` for the derivation of
every constant in `src/lib/game/movement.ts`, `ballistics.ts`,
`locomotion.ts` and `watermask.ts`. The chase camera follows only what
the player drives; flung pigs are watched from a standing camera that
waits half a second past the landing.

What the exe gave up, in short: terrain height never refuses a step; a wall
grants only the step-up envelope, scrapes past it, and a pig inside one
never lands — the wedge counter throws it out downhill; an OBJECT is the
other half of that same dispatch and gets the same envelope, so a low box
is a step onto, a tall one a wall to scrape along, and a raised one is
walked under (`lib/game/obstacles.ts`, and a pig is 640 units on a side
because every spawn marker says so); each terrain type
carries its own friction and restitution, and masked type 11 is the one
that plays the Scramble clip in every band; a landing is binary at an
impact of 25 a frame; a jump is committed, costs 15 frames, and leaves the
ground STRAIGHT UP — the forward half is a separate impulse three frames
later. Falling is not a constant pull either: a pig is body type 0x1357,
which the engine gives a `(320 - v)/32` force a frame, so it starts at the
same 10 a frame squared a plain gravity would and then caps — and the same
32 frames bleed its horizontal away.
The walking SPEEDS are its own too — every input asks for a flat 64 units a
frame, `Pig::Walk` grants the class's thirteen sixteenths of it (52 for a
grunt) and half that backwards, water caps the step at 16 — so the one
number left standing between them and metres is `FRAME_SECONDS`.
The acting pig's whole frame-by-frame state machine is pure
(`lib/game/locomotion.ts`); the battle scene only feeds it intents and
draws what it says.

**A sound is a CUE — index, VOLUME and PITCH — and the pig's own moments are
decoded.** `Sound::Play` is 0x43A9D0, one call with 222 sites, and its first
three arguments are `(index, volume, pitch)` with 100 nominal on both scales.
The order is pinned twice over: argument two never exceeds 100 anywhere in the
binary while argument three reaches 140, and the jump asks for
`90 + (rand() & 15)` on the third — a spread straddling nominal is a pitch
jitter and nothing else. `anim/audio-events.md` has the full
table and `anim/sounds.js` is the tool (wrapper → index, then annotate any
disassembly with it).

Three results are worth stating because they are counter-intuitive, and two of
them were what play heard as wrong:

- **the landing is index 30, `I_PICKUP`**, at volume 40 pitch 150 — `Pig::Land`
  (0x470910, identified by its get-up `SetAnim(10)`) plays it, and so does the
  parachute's landing at a wide random pitch. The `I_` family is IMPACTS
  (I_METAL, I_SPLASH, I_STAB), so the name is about what is hit;
- **`P_LAND1` is the impact that HURTS** — its wrapper calls the body's own
  `TakeDamage` right after playing it. Nothing in the remake plays it, because
  fall damage is not modelled;
- **the slip is `P_SLIP` gated on `Map::IsBlocked`** at the pig's feet plus an
  arrival under 50 (0x471045) — the wall-eject moment, which is what play
  called "соскальзывание".

The jump is **P_SNORT1**, volume 60, pitch 90 + rand(0..15) — play named the
file and the exe confirmed it.

**What is still a name pick is picked BY EAR, from the console.** `pow.sfx` is
the same shape as `pow.hud`: `list()` the bank with indices, `play()` one,
`now()` the table, `set('splash', 'I_SPLASH', {pitch: 120})` to rebind live and
hear it, `print()` to paste back into `audio/battle.ts` (`audio/console.ts`,
README). A name pick cannot be corrected off 99 file names — the sound has to
be heard where it belongs. `BATTLE_SOUNDS` is deliberately mutable so a rebind
takes on the next event.

**Sound is played by NAME out of the game's own bank.** `Audio/sfxday.srl`
is a numbered list of 99 files and `FESounds/Fesounds.srl` 27 more, both
plain text (docs/formats.md). The exe names a sound by INDEX, so anything
decoded later drops straight in — but WHICH sound belongs to which moment is
NOT decoded for the pig noises, and `audio/battle.ts` picks by name and says
so. Correct those in play; the spec pins the plumbing, not the choice.

**FOOTSTEPS are decoded end to end** and are not a pick at all — see "A HOOF
KNOWS WHAT IT IS STANDING ON" in [pig.md](pig.md). When the hoof lands is a key-frame event
on the clip (`lib/game/footsteps.ts`), what it lands on is the tile's terrain
type through a twelve-way switch (`SURFACE_SOUNDS` in `audio/battle.ts`), and
the mix — 45 or 30 minus `rand()&15`, pitched 92/100/108 by which hoof — is
the exe's own.

## Threads left mid-pull

Seven jobs are open and play named all seven. In the order they were named:

**1. A PIG DOES NOT MOVE while it walks.** Play: "свиньи ещё не двигаются при
ходьбе." Written down and not chased. Worth knowing before starting: the clips
themselves play (`lib/game/clips.ts` runs everything at a flat 25 fps and the walk is
clip 0/3), the pig SLIDES by design and that is a deliberate divergence
(CLAUDE.md), and only
the ACTING pig is driven — every other one is put on `ANIM.IDLE` every frame by the
scene's own loop, which is the first place to look.

**2. The game must not STOP in the background, and a real PAUSE is its own job.**
Play: "на заднем плане отключать игру нельзя, как по мне — это убивает много чего…
в сг проще паузу ставить, в мп вообще никаких остановок." The frame clamp above
stops the damage but is not the feature: singleplayer wants a real pause (the
original has one — the beat at the top of a turn lists the pause button as one of
its three ways out, 0x4d8a2c) and multiplayer wants nothing of the kind. Deliberately
not built yet.

**3. A pig that cannot SWIM goes under, and stays visible down there.** From the
same screenshot: the pig is below the surface with its name plate and health still
up. `SWIM_SINK` puts a swimming pig's eyes at the waterline; a class that cannot
swim should sink past it. WHICH classes is now read, from the other end — the
water's own damage exempts class 4 and 14..16 and nothing else
(`lib/game/drowning.ts`) — but what the exe does to a non-swimmer's HEIGHT is
still not, and the sink is unchanged.

**4. There are no FOOTSTEP sounds.** ~~Deliberate so far~~ **DONE, 2026-08-12** —
and the contact frames turned out not to be needed: the clips carry the footfalls
themselves. "A HOOF KNOWS WHAT IT IS STANDING ON" in [pig.md](pig.md).

**5. The SKIP TURN animation is wrong, and it is the VICTORY clip.** Play, at a
glance: "анимация пропуска хода кривая, и она на победу". `ANIM.THINKING = 46` was
play's own pick a pass earlier, off the exe's 59-clip name table — "Thinking" —
and the clip that plays is a celebration. Not chased: play asked for it written
down and left. Whatever replaces it wants the same treatment as every other clip
here, which is to be read off a CALL SITE rather than off the name table (see the
`ANIM` note in `locomotion.ts`), and skills 63/65/66 are out of range of
`Pig::Fire`'s dispatch so there is no site to read.

**6. The WATER SPLASH is in the wrong place and far too big — and it is what reads
as a grenade EXPLODING on contact.** Play reported the blast twice more
("всё ещё при контакте с водой граната взрывается сразу") and it is not the douse:
`e2e/002/sink.spec.ts` stands a pig in CAMP's pond, drops one at its feet and
measures the whole path — the y only grows, it is gone after its couple of seconds,
`FT_WATER` is heard and `E_1` never is. So what is on screen at the moment of contact
is THIS effect, in the air where it should be under the surface, and play has also
asked for its DIRT look to be written down: "есть брызги земли — это потом
запиши."

**6b. The rest of the splash's placement.** Play: "эффект воды —
не там, огромный, и вообще не на воде". `SPLASH_EFFECT` is effect 0x0E / parameter
row 2 and the row is decoded — three rings at a lift of −500, a sixty-sprite cloud,
a ten-particle burst — so what is wrong is the remake's, not the reading. Two
candidates and one is nearly certain: the ring's `lift` of −500 rides no scale while
the ring's RADIUS rides `MODEL_SCALE`, and the SIZE scalars (`BLOB_UNIT`,
`PUFF_SIZE`) were picked against a blast, not a splash. The y handed to
`effects.splash` is `query.surface(x, z)`, which is the water line — check that
first, because "вообще не на воде" points at it.

**And there is now a third candidate, which is probably the whole of it: the ring's
`lift` is carried with the WRONG SIGN.** +y is up in the engine (settled four ways,
`cloud.ts`), and row 15's shockwave stack at +100/+300/+600 goes UP — so row 2's
−500 goes DOWN, under the surface, where a spreading ring belongs, and
`advanceEffect` currently puts it 500 units into the AIR. It was fixed and reverted
in the same session on play's instruction ("ПРИЧЁМ ТУТ ВСПЛЕСК? МЫ НЕ ДЕЛАЕМ
ЕГО ЕЩЁ!"), because moving the splash belongs to this thread and not to a
grenade fix. The flip is one line in `advanceEffect`; the lift should ride
`MODEL_SCALE` the way the ring's radius does at the same time.

**7. The RAMP is wrong** — DONE, both halves play named. It was drawn a −45°
turn out ("модельки отрисованы криво, −45 градусов от нужного", and it was
exactly that, to the unit), and it can be walked up now. Both are written up
among the divergences in CLAUDE.md. What is NOT done is the first bridge, which is
its own shape of problem and has an entry of its own.

## PLAY'S OPEN LIST — what is still open (2026-08-11)

Everything play has named over four passes is written up above as its own section:
the charge that stands fuse-up and burns, the blast that throws and how hard, the
house that takes damage and stops flickering and stops being walk-through, the
shelter's collider, the door's own health, the pig that is no longer twice its own
width, the wall that fades when he is behind it, the crate that empties the hands, a
steep throw that goes in the water, black smoke, a bullet's trail, and now the mine
that explodes with its own picture and wears the engine's own model. What is left is
here rather than in a chat that scrolls away.

**PLAY'S NEWEST LIST, straight off testing the shelter (2026-08-11).** Written down
before anything is touched, with what is already known about each — none of it is
done yet.

1. **A wall should go SEE-THROUGH, not vanish.** "Стены должны не пропадать, а
   становиться полупрозрачными." `SEE_THROUGH` in `three/props.ts` is **0.5** now,
   up from 0.25 — half, the one value that cannot be argued in either direction:
   the wall is exactly as present as what is behind it. It is the remake's own
   number and there is nothing in the binary to check it against, so the next move
   on it is play's. The `depthWrite: false` STAYS and is not part of the same
   question: it is there so a faded wall does not go on occluding the pig, which is
   the whole point of fading it, and turning it back on would undo the feature at
   any opacity.
2. ~~**The dynamite's flame is not the game's.**~~ **Done, and it was exactly where
   the guess said to look.** Kind 53's constructor arm (`0x432414`, shared with kind
   52) hangs a PARENTED effect on the projectile the same way the grenade's arm
   (`0x43247b`) hangs id 0x15 — same call, same tail arguments — with id **0x1D**
   and one changed argument: **0x3C** where the grenade passes zero, so the effect
   rides up the FUSE. Its update arm (0x48ad9d) is the trail's shape with its own
   numbers: **four** a frame rather than six, of particle type **0x18**, whose
   setter (0x486f16) gives colour **0x14A5** — five of thirty-one on every channel,
   dark smoke — in puffs of **0x10**, twice a grenade's 8. A planted charge does not
   move, so all four land on the same spot: a column of smoke off the fuse. **There
   is no fire in it.** `lib/game/trail.ts` now carries both rows (`LOB_TRAIL`,
   `FUSE_TRAIL`), `three/lobTrail.ts` draws either, and the invented
   `three/fuse.ts` is deleted. Not carried over: the arm also plays **sound 8** at
   100/100 as the charge goes down (0x43246b), and the particle spawner's own fields
   past what the row quotes.
3. ~~**A charge is planted AT the pig, and should be IN FRONT.**~~ **Done, and by the
   HAND rather than by a number.** `Lobs.plant` now puts it where `HAND_BONE` is —
   the same bone the throw leaves from — with the pig's own feet for the height, so
   a pig on a bridge does not lay one in the ditch, and a battle nobody is drawing
   (`NO_POSE`) falls back to the soles. Measured in play's own path: **131 ahead and
   16 aside**, against a pig 85 in radius. The spec's floor is `PIG_RADIUS`, so it
   asserts "in front of it" without pinning a number the pose owns.
4. **The house's SEAMS still misbehave.** "Всё ещё текстуры странно себя ведут на
   стыках дома." The per-record `renderOrder` fixed the z-fight between the twelve
   COPLANAR pairs; something else is left. Two candidates, neither measured: the
   64-unit overlap itself (the faces are inside each other, not merely touching),
   and texture bleed at the UV edges — the atlas has no padding and the models' UVs
   are in pixels.
5. **A pig thrown by a blast SPINS about its own axis** — and BOTH guesses are now
   measured out. "Летящая свинья вроде ещё крутится вокруг своей оси."
   - *Not the draw path.* `heading` reaches the picture from one place —
     `pigShotOf` copies `pig.heading` (engine.ts), `squad.place` turns the node by
     it — and nothing writes it from a velocity. `tumble.update` writes
     `pig.position` and never `pig.heading`; `updateLocomotion` touches heading in
     exactly two places, the turn key (guarded on `airborne === null`) and the
     wall EJECT.
   - *Not the clip.* BOUNCE is clip 39, twenty frames, and bone 0 does not move at
     all in it — x/y/z spans of 0°, a constant z of 43°. Its root track has a y
     span of **zero**. The biggest thing in it is 44° on bone 10. It is a flail,
     not a somersault.

   What is left unexamined: the wall EJECT (`locomotion.ts`, `state.heading =
   query.downhill(...) ?? state.heading + π`), which a pig landing wedged runs
   every 25 frames — a half turn each time would read as spinning. That is a pig on
   the GROUND, though, not one in the air, so it may not be what play saw.
6. ~~**Going in puts the pig at the building's MIDDLE, and that is not where he
   should be.**~~ **Done, and the middle was right — it was the JUMP CUT that was
   wrong.** Play settled it: "свин прыгает на месте — должен прыгать в центр
   строения и выпрыгивать из центра строения наверх." The door arm writes three
   signed words at `[pig+0x210..0x214]` and the pig's own update ADDS them to the
   body's position every frame the clip runs (0x46e1a1), each being
   `(target − here) / n`. Going IN, all three axes step to the building's own
   transform and the pig stays DRAWN for the whole of it. Coming OUT, **x and z
   are written as zero** (0x46a150, 0x46a15e) and only the vertical is stepped —
   so a pig leaves through the TOP and nowhere else. That also re-reads the old
   "из убежища выпрыгивает на крышу": the destination was never the bug.
   `lib/game/doorway.ts` is the glide, `battle.ts`'s door block drives it, and
   how FAR up is the one number not recovered — `[+0x212]`'s difference runs
   through 0x479690 and two pushes that move the frame under the reads, so the
   remake takes the building's own box top and says so.

   *(What this entry used to say, kept because it is still true and still worth
   not re-deriving: the transposition does NOT move the centre — `TRANSPOSED_BOX`
   swaps `halfX`/`halfZ` and nothing else, so `box.x/z` is the record's own
   position, which IS the transform 0x469fde copies.)*

7. ~~**Coming OUT lands him on the ROOF.**~~ **Answered by the same read as 6: out
   through the top IS the original.** Two measured negatives survive from the pass
   that chased it as a bug, and both are worth keeping. *(a)* `footingAt` does not
   snap to the box: CAMP's SHELTER box runs y −1568 (top) to −1184, the ground at
   its wall is −1216, so the top is **352** above the doorstep — past `WALL_CLIMB`
   128 and past `PIG_HOLD` 196 alike; a footing rebuilt at the doorstep gives
   −1216, one rebuilt at the shelter's own centre gives −1216, and a pig left
   standing at that centre for three seconds neither rises nor wedges. *(b)* Clip
   7 does not clamp him up there either: its root track runs −115 at frame 0,
   −564 at its peak and **−115 again at frame 53**, so a held last frame holds
   nothing. What play was complaining about was the jump cut, and the glide is
   what fixes it. The door still hands back the footing it took
   (`indoors.enter(pig, footing)` / `leave`), because deriving one where a kept
   one exists is guessing — from the box top the rebuild does stick to the box
   top.
8. ~~**Finishing the shelter does not move the TUTORIAL on.**~~ **Done** — and the
   shelter had nothing to do with it. See "THE TRAINING SCRIPT MOVES" in
   [training.md](training.md).

1. **A trodden mine wants an EXCLAMATION MARK over it.** "когда наступил — мина
   появляется с восклицательным знаком над ней." The mine itself appears now, in the
   engine's own `WE_APMIN`; the mark is still not found, and this pass ruled out six
   places by measurement rather than by looking: the mine's effect (0x4c/0x55 are the
   BLAST — row 14), the whole tread path (0x46bfd9..0x46c169), the projectile's model,
   `WE_BANG` (a wire and a box — it is skill 40's MINE SHELL), `MAPICONS.MTD`, all 743
   texture names in the install, and every one of `gtext`'s 272 strings. **Where to
   look next:** the battle FONT drawn in world space the way a damage number is —
   effect 0x35 through 0x487b90, and a sibling call passing a character rather than a
   value would be it — and `Language/Tims/fonttims.mad`, which nothing in the exe has
   been traced to. `weapons/mines.md` has the negative results so they are not redone.
2. **The reveal is a TEXTURE SWAP, and for three classes.** "инженеры и командос с
   героем видят жёлто-чёрные текстуры там где есть мины", the range applies to the
   ground AND the map view ("к земле тоже"), and the enemy simply is not shown them
   on the minimap. What is built instead: the `WE_MINE` model for the engineer family
   (5, 6, 7) inside 1024 on the ground. Play, twice: "но ладно это потом" and
   "индикатор мин пока рано — у нас нет инженеров щас". So it waits on the classes.
3. **Walking into a dummy shoulders the pig PAST it.** Measured while hunting the
   bullet: hold W at a dummy and the pig is stopped 149 out, then the wedge counter
   sidesteps it — x moves and z holds for four ticks — and it squeezes round the
   corner and ends up **687 units beyond** the target. Release the key at the moment
   it stops and the swing lands, so this is not the strike; it is that you cannot
   stand still in front of a small box by walking at it. The wedge exists to get a
   pig off a wall, and a dummy is not a wall. **Play confirmed the reading**
   (2026-08-11): "это потому что постепенно сдвиг в бок идёт и обход цели — не
   проход насквозь." So nothing walks THROUGH the dummy and no spec claims one
   does; the collision holds and it is the sidestep that has to stop firing here.
4. **`002/camera-smooth.spec.ts`'s opening drop scores worse near 60 fps.** 0.157 at
   144 fps and 0.355 at 62, which is a hair over the engine's own 60 Hz step — so its
   bar is 0.5 where the other two are 0.35, and the score now reports the frame rate
   it was measured at. The measure itself is sound (it is a rate, not a step). What
   is not answered is why the DESCENT is the one that shows it: the pig is drawn
   between steps like everything else, so the suspect is `dropInArt.riseOver`, handed
   to the chase separately and tweened by nothing.
5. **The rest of getting INSIDE.** The SHELTER is done (above); what is left round
   it is the other five buildings' reasons to be entered. The **PILLBOX** wants its
   own two weapons, **45 HEAVY M-GUN** and **46 FLAME THROWER**, and the taxonomy's
   GUN_BARRELS group beside them (BIGBAR, BUNKGUN, PILLBAR, AMPHGUN, B_GUN, TANBAR);
   `buildingSkills` is the table they go in and it is empty on purpose until they
   exist. **A VEHICLE is the other half** — skill 60 VEHICLE INOUT, `[pig+0x2ec] = 3`,
   body type 0x1358, through `0x49a320` instead of the building's `0x43f7f0` — and
   none of it is built. **And some pigs START inside**: `0x47d4e0` runs once from the
   map loader, walks the object list for every pig whose `[+0x3c0]` is 1, and boards
   the nearest thing within **4096** units; which marker bit fills `[+0x3c0]` is not
   decoded (the loader takes it from a stack table at `[esp + (flags & 0x40) + 0xc8]`,
   0x4a6768). Two more that will matter the day a pillbox is worth entering: the exe
   refuses a building the OTHER SIDE is holding (`0x43f910` against `[+0x194]`), and
   its own reach test differences a pair of words out of `0x44e850` that have not
   been transcribed. `objects/notes.md` has the read.

## PLAY'S LIST OF 2026-08-11 (the second one) — three done, four open

**Done.**

1. *A RAMP fades and should not.* "Просвечивание включается на рампе — не должно,
   ведь она за свином, не между ним и камерой." A ramp's box is the whole
   triangular prism, so a pig on its LOW end has its middle well below the box's
   top and a camera behind and above looks down THROUGH the slab to reach it.
   `sightBlockers` drops ramps the way it already drops buildings: what you stand
   on is never between you and anything.
2. *Too little of the roof and the walls fades.* One ray fades exactly the pieces
   it skewers and a house is eighteen of them, so the panel in the way went
   see-through while its neighbours stayed solid. Every box is grown by
   `SIGHT_MARGIN` (256, half a tile) before the segment is tested.
3. *Charging in mid-air.* "Можно во время прыжка начать заряжать оружие — баг."
   `Pig::MayAct` refuses outright while the pig's mode is 5, which is being
   airborne — the same value `UpdateMovement` returns on (0x467a28, 0x46b205).
   `setFiring` drops the whole press rather than the hold alone, or a gauge
   already filling would loose on the way up.
4. *The lens is in the wrong widget.* It belongs at the gauge's left end, before
   the scale's zero — "надо в низу левее нуля шкалы, там есть полузалитый круг" —
   not behind the weapon slot. Moved to `LAYOUT.gauge.lens`.

**Open, with what is measured.**

5. **TNT's blast is too big to get clear of.** "Я отхожу задом все 4 секунды — а
   меня всё равно задевает." The arithmetic: the row is 50 points over a blast
   field of 2048, `blastReach` makes that 1536, and the falloff — the exe's own
   `0x48CBA0` — reaches **zero only at 2560** (512 of core plus 4/3 of the reach).
   The fuse is 5.83 s and planting hands back **4**, of which the laying clip eats
   the first stretch; backing away is HALF speed, 520 a second, so about 2000
   units. 2000 against 2560 is exactly play's complaint.
   **Where to look:** the falloff is not what decides WHO is caught. In the exe
   the blast hurts what the EFFECT's own body touches — `Pig::OnHit` off the
   physics contact — and `0x48CBA0` only says how much. The effect body's size has
   not been read, and the remake uses the falloff's extent as the reach instead.
   That is the number to find; nothing here should be tuned by hand first.
6. **The rocket is drawn crooked.** "Прожектайл кривой при выстреле базуки."
   `three/grenades.ts` points a flying lob along its velocity with a yaw and a
   pitch, which assumes the model's nose is +Z. `WE_TNT`'s own long axis turned
   out to be −X (that is what `STAND` is for), so `WE_BAZZ`'s wants measuring the
   same way — off the model's vertices and its textures — rather than guessing.
7. **The blast's picture is the wrong one — and this half IS read.** The
   destructor's per-kind table (0x435A6C) sends kind 10 to `0x433220`, which joins
   the tail at `0x43533E` and pushes effect **0x53**, where the grenade's arm
   pushes 0x54. Both play sound 0x0C (`E_1`). And the id → row map resolves
   0x53 to **parameter ROW 1** against the grenade's row 0 (`byte [0x489680+id-1]`
   → slot 54 → arm 0x488faa → `0x48ccc0(1)`). What is NOT built is row 1 itself:
   it reaches stages D and E of `0x48c410`, which this repo has never decoded and
   which "What is still not read" below already names. `Charge` would have to
   carry the id the way the mine's already does.
8. ~~**Killing the last dummy does not end the mission.**~~ **Done, and read
   rather than invented** — see "…AND THE LAST DUMMY ENDS IT" in
   [training.md](training.md). It is asked
   at the HANDOVER, the count is the DUMMY records alone (their stands do not
   count), and the ending is the exe's own mode 2 with its tour, its three-second
   hold and its twenty-second bail.

## What is still not read

**Swept 2026-08-11 — docs/todo.md section D is the live list now**, and most of
what used to sit here is READ (the reads are in the disasm repo):
`[contact+0x14]` is the contacting body's TOTAL speed with a flat-vs-plunge
class byte beside it at `[contact+0x30]` (`weapons/fire.md`); effect 0x0D is a
mud spray, decoded in full; `0x48c410`'s stages D/E are a fan of smoke jets and
stages E and C are enabled in NO shipped row; the skill record's `+0x28`/`+0x2C`
are the attack clip's repeats and its signed playback rate; and PARACHUTE=82
was already settled in `parachute/notes.md` (MCAP ships 93 clips, the name
array stops at 59). The big one: **the render library is `Data/_d3d.dll`, in
the install, 94 named exports, and the exe's whole call-slot table is mapped**
(`library/notes.md`) — `wh32LIB.DLL` is the LaserLok copy protection and every
"lives in wh32LIB, cannot be read" verdict in this file is dead. The second
pass the same day read the DLL side too: a 2D sprite's size is WORLD UNITS at
its own depth (so `BLOB_UNIT` can die for the exe's own formulas), effect
particles are TEXTURED from `expltims.mad` — the `ptp*` puffs, the damage
digits and the pig's shadow live there — and drawn ADDITIVE ONE:ONE, and
`afSetZoom`'s full zoom is exactly ×4 with a thirds-of-the-gap glide. On the
smoke play keeps reporting MISSING: the remake's blob has the wrong art AND
an invented draw law; the fix to try is the real puff textures with the
exe's colours under both blend modes, shown to play ("additive cannot
darken" was the remake's own argument, never play's). The third pass found
**the whole DASHBOARD** (`library/notes.md`): dashtims is `[0x520668+0x400]`
(an earlier one-slot mis-parse hid it), init 0x454578 + frame 0x457840, and
two findings that matter here — **`pcpie4` is drawn WHOLE, no fill mechanic,
hidden for skills 19..26** (the remake's class-driven lens clipping is its
own invention — show play before moving anything), and **the dashboard's
layout is authored DATA in the exe** (0x4CF71C/0x4CF878/0x4CFA54, anchored
to the screen dims), so `LAYOUT`'s eyework in `ui/hud.ts` could be replaced
by the original's own numbers when asked.

## The older status, kept as it was written

Everything below this line is older, and the shot's own six items are DONE —
see "The SHOT, end to end" in [weapons.md](weapons.md).

1. **The map SCRIPT — decoded and BUILT.** See [training.md](training.md);
   what is left of it is a
   short list at the end of `script/notes.md`, and none of it
   blocks anything.

Two smaller ones noted in play and not acted on: **a dying pig should come
apart and leave its boots** (the exe already splits the two deaths and so
does `lib/game/health.ts` — `died` and `gibbed` — but both wear clip 47 for
now), and **`THREE.Clock` is deprecated** in favour of `THREE.Timer`.

**Nothing is failing.** `e2e/002/hud.spec.ts:168` was, since 300fc6e, and the
poll fixed one half of it and a measurement fixed the other — see "INPUT:
control sets, polled once a frame" in [turns.md](turns.md).

- **A crate is walked THROUGH, where the original is shouldered into.** The
  records say a pickup is solid — shape kind 0, a real 3×3×4 box — and play
  remembers pushing at one before it goes. Making it solid, though, means
  the pig can never be inside it, and this engine's step refuses to END
  inside a box, so the collect-on-overlap test never fires and the crate
  becomes a thing to bump into forever. It is deliberately kept OUT of the
  collision world until the two halves are reconciled (collect off the
  step's target, or a shove that resolves) — `lib/game/obstacles.ts` says so
  where it drops them.
- **A pig carries skills, takes one in hand, aims it, and SWINGS it — but
  only the five that swing.**
  Crates are collected by walking into them (`three/battle.ts` →
  `lib/game/pickups.ts`), the contents go into fifteen slots with the exe's
  own stacking rules (`lib/game/inventory.ts`), and `R` opens the game's own
  menu over them — `MENUTIMS.MAD`'s frame with an icon per skill and
  `SELECT.BMP` over the cursor, driving in from the right with `S_OPEN`
  behind it (`ui/skillMenu.ts`). `Space` there sets `pig.holding`, and from
  that the scene plays the weapon's getting-it-out clip, hangs its model on
  the pig's forearm bone and holds its aiming pose at the angle `Q`/`E`
  drive (`lib/game/weapons.ts`, `lib/game/aim.ts`, `three/heldWeapon.ts`).
  `F` uses it, and the five hand-to-hand skills — 1 TROTTER, 2 KNIFE,
  3 BAYONET, 4 SWORD, 5 CATTLE PROD — are the ones that answer, because the
  original resolves those by CONTACT and the rest by a projectile that is
  still unbuilt.

  **The swing is four ANIMATION EVENTS, not a timer**, and that is the whole
  shape of it. Fire writes a ten-frame fuse (`Pig::Fire` 0x469360); the fuse
  runs out and `Pig::Attack` (0x469610) puts the record's own clip on the
  PRIMARY channel and clears the weapon one — 22 for the bayonet, "Bayonet",
  so a swing is whole-body and the aiming pose comes off for it. That clip
  carries four key-frame events at phases 1243/1356/1469/1582, frames 11 to 14
  of 36, and each one calls `Pig::HandToHandStrike` (0x475a00). Walking is
  refused from the button down to the clip's end and turning for the clip
  (0x46afd5, 0x46af43); the round is spent as the clip goes on, and a pig out
  of them puts the weapon away. `lib/game/melee.ts` is one weapon's reach and
  one swing's timeline, `lib/game/strikes.ts` the swing HAPPENING, and
  `weapons/melee.md` the read.

  A strike is THREE points off bone 5, the hand — the weapon's row of the
  table at 0x4d0ee0 in full, halved, and the bone itself — tested per AXIS
  against 170/360/170 and then against a 67.5° cone off the attacker's facing.
  **Whether that offset is model units or world units is the one judgement in
  it**: the exe builds the point off a pose matrix whose scale is not read,
  and taken as world units a bayonet would reach one and a half pigs past a
  blade drawn half that long. So it rides the bone through the mesh's own
  `MODEL_SCALE` and lands where the art is. Written up in `lib/game/melee.ts`.

  **A swing has its own CAMERA, and it is the exe's.** `Pig::Fire` calls
  `0x49f740(0x13, 0)` and mode 19 is asked for by that one site out of 82 —
  its handler (0x4a4940, flag-0 branch) stands the camera at `pigYaw − 612` of
  4096, **53.8° round from straight behind**, where the ordinary chase (mode
  0) adds no offset at all, and at distance **1700** out of the per-mode table
  at 0x4d9528 against the chase's 3072. `three/chase.ts` carries both as
  `MELEE_TURN` and `MELEE_CLOSE` — the swing and the PROPORTION, since the
  rig's own distances are the remake's. **The SIDE is play's and it is the
  exe's sign REVERSED**: read literally the camera goes round to the pig's
  left and the original goes right, so the turn is added. Same shape as the
  tile table's turn direction — a yaw sign that flips somewhere between the
  exe and our pixels and has not been found. The remake holds the view for
  the length of the swing and then glides back, which is its own bracket:
  nothing has been found that ends the mode in the exe. On a HIT the original
  moves again, to mode 2 aimed at the victim (0x4760ab) — not done.

  **The AIM ANGLE has no part in the strike, and that is SETTLED — do not
  re-add it.** `Pig::HandToHandStrike` never reads `[pig+0x304]`, and for the
  only two melee weapons that could carry an angle 0x46a891 pins it to zero,
  so a bayonet strikes level however the player has pointed it. Steering the
  blade with the aim was built once, on the reading that the remake lets those
  two aim and so ought to honour it, and taken straight back out: **the exe
  not reading a value is not an ambiguity to fill in, it IS the behaviour.**
  (It would also have decided almost nothing — `STRIKE_RISE` is 360 against a
  pig 320 tall, so a body within a body-height is caught either way.)

  Two things in it are decoded and deliberately NOT applied: the KNOCKBACK
  (75 for a bayonet, at 45° up along the bearing — only the acting pig has a
  locomotion state, so there is nothing to push) and the BATTLE CRY
  `Pig::Fire` plays out of the squad's own rotating counter. CAMP fields ONE
  pig, so a swing has nothing to hit there — `pow.swapMap('LIBERATE')`.

  **The training DUMMY is a target, and it has ONE point.** Its class is
  vtable **0x4bd440** (constructor 0x48d020, list head `[0x537df0]`), it
  answers the same `[vtbl+0x34]` a pig does, and its health comes from the
  table at 0x4d6d18 by record type: every type the strike answers to —
  0x43/0x44/0x45/0x4b — is 128 of the engine's 128ths, **one whole point**, so
  anything at all flattens it. `lib/game/targets.ts` matches them by MODEL
  NAME and CAMP carries eleven.

  Getting there cost a wrong turn worth not repeating: the class was first
  guessed at 0x4bd238 from the melee's `[+0x84]` field test — thirty points,
  three hits — and play said one ("манекены 1 очко") before the binary did.
  An object identified by a field test is a guess until the code that WRITES
  the list pointer is found. Same lesson as the weapon's bone field.

  **All eleven are live, and THAT is the remake's own.** 0x4762e0 does not
  walk a list; it takes the single object at `[0x537df0]`, so most of CAMP's
  are not the one being struck at any moment, and what moves that pointer is
  the map SCRIPT. Play also says knocking the first one down drops a crate in
  BY PARACHUTE, and the tutorial's step list agrees — a step ends on "killing
  the dummy, picking up the crate, or reaching somewhere". That drop is the
  same script that raises the second bridge, and it is not built.

  What is still missing is the other kind of shot: the power gauge, the
  projectile and its damage. `[game+0x4e4]` charges 0x50 a frame to 0xfff and
  0x47a2b6 onwards is the per-weapon dispatcher, of which only the melee arm
  (0x469415) has been read.

  **The bayonet's pin is decoded and deliberately not applied.** 0x46a891
  forces the aim angle to zero for skills 3 BAYONET and 5 CATTLE PROD, so in
  the original those two cannot be aimed at all. The remake lets them aim
  like everything else, by request — the bayonet is the training ground's
  first weapon and tilting it is the whole of what a player does with it
  until firing exists. One `if` in `clampAim` restores it. **The swing did
  not change that**: the strike is built off the HAND BONE and never reads
  the angle, so tilting a bayonet is cosmetic — it moves the held pose and
  nothing else. Whether to pin it now that the bayonet DOES something is the
  user's call and has not been asked.

  **The aiming pose is a SECOND animation channel, not a clip.** A pig has
  two of them — `Pig::SetAnim` (0x471ef0) writes one block of fields and
  0x471f50 an identical one beside it — and the weapon's clips go on the
  second while running, walking and idling go on underneath. `mcap.mad` has
  no armed run cycle at all; a pig charging with a bayonet is the ordinary
  run with the weapon channel over its arms. `lib/game/clipPose.ts` does that
  with a bone overlay composed into the pose.

  Two things there are the remake's own: WHERE a weapon hangs, and which
  bones the overlay takes (spine, head, both arms). The first is play's word
  against the file's — the models' VTX bone field is not an attachment (24 of
  29 put everything on bone 0 and `WE_TELR` splits across two), they only
  agree on reaching along −Z, and play says the pig holds it in the other
  hand, so `three/heldWeapon.ts` mirrors them across z. `Chars/PROPOINT.MAD`
  is where the real attachment points probably live and nothing in the exe
  has been traced to it. The SHAPE of the second is decoded: both channels
  hold six-entry key-frame lists and six is the skeleton's branch count, so
  the split is per branch — but the mask itself is inside `wh32lib.dll`'s
  `afGetKeyFrameList` and is not in the MCAP data.

  Three things in the menu are the remake's own and want play against them:
  where it sits and how it arrives (the exe computes its coordinates rather
  than storing them); that SKIP TURN is what an empty-handed pig always has
  in it, which is play's word and not the exe's; and that twelve cells hold
  fifteen slots, since what the original does with the other three is not
  decoded. Its art is two transparency keys, and those ARE measured — the
  frame keys on magenta and keeps its black (that black is the widget's
  inside), the icons and the highlight key on black (`main/assets.ts`).
- **The tutorial speaks over the drop, over the round, and off every crate.**
  The bar is the exe's own (`ui/briefingBar.ts`: `npro4` caps over four
  `npro3` tiles, the ten-frame drop-in curve, a 206-wide window, the scroll
  at 5 px a frame), the instructor is `Speech/Sku1/Train1` through
  `audio/speech.ts`, and clip N always carries `gtext` 209 + N. The script
  itself turned out to BE the crates — the tutorial dispatcher switches on
  the skill just collected — so collecting is what speaks it
  (`lib/game/tutorial.ts`). Two things still have nothing to fire them: the
  "FOLLOW THE YELLOW PATH" lines, which the exe says when a crate is PLACED
  by the map script, and the dummy.
  `pow.say('…')` puts any line up meanwhile. The font is the game's own:
  the bar's `macfont.bmp` is `FEText/BIG.BMP` pixel for pixel and its metrics
  are read from `BIG.TAB`, so the bar loads `BIG` and kerns a pixel a pair as
  the exe does. One number in it is still unchecked — the 300 ms a line that
  FITS the window is held for, which reads faster than a line can be read.
- **The rest of the battle screen, in the order play asks for it**: the MAP
  bottom left (`MAPICONS.MTD`: `map1` plus the pig, heart, pickup and prop
  markers), and the POWER gauge, which nothing has needed yet. The dial is
  done — the needle turns with the aim angle and the slot beside it carries
  the chosen skill's icon, out of the skill menu's own art.
- **The menu DRIVES ON, and every number in that is read.** It comes down
  from 380 pixels above — the exe's per-screen start table at 0x4C0A18, in
  the frontend's own 1024×820 space — and settles on one shared damped
  spring (0x41FD30) at its own arm's gain 8, damping 17 and cap 80. Ten
  engine frames, with an OVERSHOOT the exe gets by not clamping the step.
  `ui/entrance.ts`, stepped at `EXE_FRAME_SECONDS` rather than at the
  screen's 25 repaints a second. The backdrop does not move with it: the exe
  blits it before the switch that applies the displacement. Only the MAIN
  MENU claims a start — the table has one for every screen, but which id is
  which is only pinned for that one. What is still eyework is the MACHINE
  behind the column; see the layout entry below.
- **There is no SKY.** The battle renders against a flat clear colour, while
  the original ships `Skys/` — paired `.PTG`/`.PMG` files per mood
  (`CLOUDY1`, `DAWN1`, `CLIMB`, plus `COLD` and `DESERT` folders). Neither
  the format nor which map picks which sky is decoded. Own thread, after the
  tutorial.
- **The drop-in's card and camera are in, and both want a look.** The card
  is the exe's (`gtext 159` + the mission name, centred, y = 160 —
  `ui/titleCard.ts`), but only CAMP is answered: which display name goes
  with which MAP FILE is stored nowhere, so every other map gets no card
  rather than a guessed one. The face-on camera while a canopy is up is the
  remake's own framing (`FACE_BACK`/`FACE_LIFT` in `three/chase.ts`), the
  same way the chase's own distances are.

- `0x406bb0`, 3280 bytes: the collision test itself. Knowing what else lives
  in that world would settle whether objects need their own handling.
- The flag at `+0x3a4` is a bitfield; only bit 3 (terrain type 11) is traced,
  and six other sites write it.
- The tile type's low 5 bits: 0x20 water, 0x80 wall and the twelve material
  rows are known; the rest of the meanings are not.
- POG fields 11, 12, 14-16, 28 and 29. 14-16 look like the interesting ones
  — they are non-zero mostly on crates and spawn markers, which is where a
  crate's contents and a spawn's team would live. Of the flags word (13),
  the side, the player counts, "placed at all" and now bit 6 (the
  parachute) are decoded; the rest of the low byte is not.