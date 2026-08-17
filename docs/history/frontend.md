# The frontend

The menu screens: the machine, what moves on it and what it sounds like.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## THE MAIN MENU IS ALL READ NOW, and three of our own ideas were wrong

Play, opening the session: the menu has a lot wrong with it, go and read the
screen out of the binary instead of guessing — every screen, starting with
this one. So screen 1 was walked end to end: its enter arm, its update arm,
its leave arm, its draw arm and the function that owns the selection
(`frontend/notes.md` carries all of it, function by function). What came back
changed six things here, and three of them were ideas this repo had invented
and then written up as if they were the game's.

**The needle was ours by accident, and it was right.** This file used to say
the dial's twelve frames were spread over the rows by the remake because
"nothing found so far moves it". The thing that moves it is `0x427C90`, the
handler that runs when the lit row changes: it aims widget 4 at
`4*row`, less one past four — frames 0, 4, 7 and 11 — and the widget walks
there ONE frame a tick. Spreading twelve frames over four rows gives exactly
those four back, so the picture never changed; what changed is that the sweep
is now a frame walk on the game's own clock instead of an eased interpolation
over a made-up third of a second, and that it CLICKS when it lands
(`Indu006`, half volume, played by the dial's builder on the step that
reaches the frame it was aimed at).

**The cogs do not turn.** We span them at twelve frames a second. Both cog
widgets are built on frame 0 and no call site on screen 1 ever asks either for
another one, so `cog0` and `cogb00` are still pictures. What is really turning
in the memory of it is the plates; what is really running is the SOUND —
`cog.wav` is a 32-millisecond tooth, and the update arm plays it once a tick,
at a fifth volume, the whole time the screen is driving in or out. Ten of them
as it lands is a ratchet.

**Nothing gates a press.** The remake refused to move the light for 0.3 s
after a move and played `click5` on every one. The original's up and down arms
are two lines each — decrement or increment, wrap on the item count, tell the
selection handler — with no travel to wait out and no sound of their own. The
only click a player hears when they move is the needle arriving.

**The lamp blinks on a script, and the script is in the data.** Animation id
1002 out of the table at 0x4C0A78: `light2` for one tick, `light3` for ten,
`light2` for one, `light1` for five, looping — seventeen ticks, most of them
on the brightest. Every other row is WALKED back down to `light1` rather than
snapped, so a lamp fades as the light leaves it.

**The tracks were the last piece placed by eye, and they hang off the screen
on purpose.** Both are blitted through the stretching blitter, 64 wide by 638
tall out of 64×480 art, at x -34 and 681 on a 640-wide screen — and the right
one's WIDTH is negated, which the flush reads as a mirror. That is why reading
them literally had looked wrong: about thirty pixels of one shows and
twenty-three of the other, and the flush's own clipper trims the rest. Nailing
that down settled a second question at the same time, one this repo had argued
from the plate and the lamp abutting rather than read: the clipper moves a
blit's source rect by exactly what it moves the destination, which is only
right if **x/y is the top left corner**.

**A screen leaves as deliberately as it arrives, and we had no exit at all.**
Choosing a bar used to swap the view on the next microtask. The original runs
a leave arm until it says it is done: the plates turn the OTHER way (put back
on frame 0, walked to 3), the machine climbs out of the top of the screen
under constant acceleration, and only once it is gone do the tracks walk out
sideways. About half a second, and the same cog ratchet under it.

And one piece of ordering that is easy to miss and reads as a bug when it is
missing: **the tracks slide in BEFORE the screen falls.** While their offset
is non-zero the update arm does nothing else at all, so for the first four
ticks the racks are the only thing on the backdrop.

### What it cost, and what is still open

The motion is three integer routines and they are transcribed rather than
approximated (`ui/springs.ts`): a damped spring that overshoots because the
exe does not clamp its step, an accelerating launcher with no pull in it at
all, and a plain clamped walk. The spring reproduces the ten-frame arrival the
disassembly predicts, value for value, and the tracks come in in four ticks.

`ui/frames.ts` grew the second of the two ways a widget gets a new frame — the
SCRIPT — and `ui/drive.ts` replaced `entrance.ts`, which only knew how to
arrive.

## AND THEN THE WORDS, which were the last thing we were placing by eye

Play, on reading the above: that list ends with something unread — go and read
it. So the text path was walked too, and it turns out to be `.data` rather
than draw code: the frontend prints through one object per font, and a box is
handed to it before every line.

**The whole frontend is CHARS2, title included.** The frontend builds exactly
two text objects on entry — CHARS2 with its light and dark siblings, and a
CHARS3 that only screen 3 uses. Our title was drawn in BIG, 32 pixels tall,
because it looked right; the game writes it in the same 16-pixel letters as
the rows, in a box 17 tall. That is the one change here that will look like a
regression until it is checked against the original.

**The boxes are tables.** A screen's own string has four parallel per-screen
tables; the ITEMS have one table of 16-byte records that every screen indexes
from a running total of the per-screen item counts, summed at startup — so
screen 1's four rows are records 1..4 of it. In pixels: the title at (298,
132) 181 wide, the rows at x 305, 178 wide, tops 192, 232, 273 and 314. Two
checks fell out of that. The title's box centres on 388.5 against the title
plate's own 389 — which is what says the whole chain, including a constant -25
the text origin carries, was read right. And **the rows do not carry the
plates' stagger**: all four boxes share an x while rows 1 and 2 are nudged
twelve pixels in, so in the original the words stay put and the plate moves
under them. We had been centring each label on its own staggered plate.

**One number picks the shade.** A row is asked for in (120, 120, 75) when it
is lit and (80, 80, 45) when it is not, and a row that leads nowhere has that
divided by three; the glyph drawer then picks the light atlas over a mean of
100, the dark one under 50, and the plain one between. Our lit/plain/off
mapping was right and is now the game's own rule rather than a convention.

**And the two per-frame numbers the plate widget writes are the words riding
the turn.** They are a crop and a drop: a letter is cut to `k = 100 - |v|` per
cent of its height and dropped by exactly what it lost, so a line collapses
onto its own baseline and is gone at k = 0. The rows and the title get
DIFFERENT tables — walking in, the rows are invisible for two frames and come
back through 30 and 80 per cent while the title only ever dips to 10. We had
been hiding both outright for the whole turn, which was the right instinct and
the wrong shape.

Still not read on this screen: two allocations in the update's tail, and a
second lit row the loop supports and screen 1 never uses.

## AND THE LEVEL ABOVE IT: 52 MENUS WEARING 23 LAYOUTS

Reading on past the main menu turned up the thing every earlier pass had been
one level below. **A "screen id" 0..0x16 is a LAYOUT, not a screen.** The
frontend allocates 52 records of 72 bytes — one per menu — and fills them from
tables in `.data`; each record names which of the 23 draw/enter/update/select
arms it wears. The main menu is record 1 of kind 1. What these notes and this
repo had been calling "screen 7, the MULTI-PLAYER" is kind 7, which is the
VOLUME CONTROL.

An ITEM is a pair: an action and a parameter. Action 1 is plain navigation
with the parameter naming the record, 6 picks one of the six armies, and **22
is a dead row** — which is what the item drawer greys, so a bar that leads
nowhere is dead in the DATA rather than in the drawing. Our greyed-out OPTIONS
is the same idea arrived at from play.

The string ids are a chain rather than a table: title, then that screen's
items, then the next screen, striding by `count + 1` — with six fix-ups, and
without them the main menu comes out wearing the pad screen's four labels
(…CONTROLS) instead of its own (…QUIT APPLICATION). The script in the disasm
repo transcribes the fix-ups rather than the pattern, which is why its output
can be trusted where it looks odd: the save-slot screens really do stride past
their own words, because their items are named at runtime.

One more number came out of the same read and it moves every centred label:
**the letters are spaced 3 apart and a SPACE is 8.** Neither is in the `.tab`
— the exe's text constructor puts them on the object, and it builds every text
object in the game the same way. Applied to the frontend's three shades only
(`FRONTEND_METRICS` in `ui/font.ts`); the battle's text is left as play
approved it, and is 3 per glyph narrower than the original until someone rules
on it.

Two things this hands the next piece of work. **MULTI-PLAYER is record 16 of
KIND 2** — the same layout as SELECT TEAM, and that family is the one that
loads `selcog` and `name0..5`, so the carriage this repo threw off the main
menu belongs there. And the original's MULTI-PLAYER is **six** items — four
teams, DONE, NETWORK — where ours is four slots and three actions.

## ONE PLAYER, THE FIRST SCREEN OF THE CAMPAIGN CHAIN (2026-08-13)

The cheapest screen in the game, and it cost nothing because it is the machine
we already had: `frontend/menus.js` prints **screen 14 as kind 1** — the main
menu's own layout — with the title at `fetext` 54 and two items at 55 and 56.
NEW GAME goes to screen 3 SELECT TEAM and LOAD GAME to screen 10 LOAD. So
`ui/onePlayer.ts` is a list and nothing else, the third module to sit on
`initBarScreen` after the main menu and MULTI-PLAYER.

**It does not drive on, and that is read.** The per-screen entrance table at
0x4C0A18 gives screen 14 a y of +100 against the main menu's −650, but the
loader arm that serves this family (0x421BC3, kinds 1 and 7) does not replay
the entrance moving from one of its screens to another. So the machine stays
put and only the plates turn over — which is also what it looks like, and the
`entersFrom` the main menu passes is deliberately left out here.

**LOAD GAME is dark**, and what it waits on is not the save — that is built
(`lib/game/save.ts`, `src/main/saves.ts`) — but screen 10, which is **kind 8**
and has not been read at all. Its items are named at RUNTIME, which is why
their `fetext` ids overrun into the next screen's words.

What it cost elsewhere: the battle is two screens deep from the menu now, so
`e2e/menu.ts` grew `toBattle` — the walk without the drop — and `startGame`
sits on it. Three specs that opened the battle by hand because the drop or the
beat was their subject now go through it, and `toMenu`'s exit table learned
`#oneplayer`.

**Next is SELECT TEAM, record 3, kind 2** — six armies at `fetext` 25..30,
action 6 with params 180..185. Its draw arm (0x41CBE1) and its cursor are read
(`frontend/notes.md`): the `counsele` console, the `selcog` carriage at
(553, 180), widget 0 walking FIVE frames per row with `selec00..05` rebuilt at
`frame % 6` under it and a click on the step that lands, and — on this record
alone — a live squad, because a changed row calls `0x4824A0` with it and the
screen shows that army's actual eight. That last one is now cheap: the squad it
would show is `lib/game/roster.ts`.

## SELECT TEAM — THE SECOND LAYOUT, AND WHY THE READ CAME FIRST (2026-08-13)

The first screen in this project that is **not the machine**. Play asked for it
straight after ONE PLAYER; what it took was reading kind 2's draw arm rather
than building from the summary this file already carried — because that summary
turned out to be wrong in three places, and each one would have put art in the
wrong pixel.

**The corrections, before anything else.** The console's skirt is
twenty-five blits stepping +4 down, not one. The repeated two-pixel column runs
463..511, not "from 591" — a number that is neither end of anything and would
have left a seam. And the name band sits at `namarm + 24`, dropping to +16 on
one frame of six, where the old note had +16 as the base.

**Then two that changed the shape of the job.** The arm draws ONE track, the
mirrored one, where the main menu draws two. And it RETURNS after it for every
kind-2 screen except record 16 — so the `com_man` block before it and the
sine-wobble block after it are MULTI-PLAYER's, not this screen's.

**"The arm is short" was then challenged, and proving it was worth the hour.**
All 23 kinds are drawn by ONE function, `0x41BEF0` — the only `sub esp,668h`
in `.text`, matching the `add esp,668h; ret 4` at 0x41E720 — and every arm is a
label inside it, reached from a dispatch at 0x41BF54 over a byte map at
0x41E768 and a pointer table at **0x41E72C**. Entry [2] is 0x41CBE1, so nothing
before it is this arm's; entry [14] IS 0x41E71C, the function's own tail, which
is the arm for the kinds that draw nothing — so the `jne` out of the middle of
the kind-2 arm really is a return. The whole table is in `frontend/notes.md`
now, which names every draw arm by kind.

**What the screen actually is.** A console with ONE window in it. Six armies,
and yet one `selec` emblem at (298, 170) and one `lit` lamp at (537, 202): what
changes with the row is the FRAME. Widget 0 walks five frames per row and
rebuilds the emblem at `frame % 6` on every step, clicking (`Fesounds` entry 4
at 60) on the one that lands — the emblems reel past in a single window while
the six names sit in the console's own eight text boxes below. The `selcog`
carriage at (553, 180) does not move at all; the arm blits it at a literal.
`ui/teamScreen.ts` is all of that, with the address on every number.

**One piece is deliberately absent.** The original shows the highlighted army's
own squad — a changed row calls `0x4824A0`, which `army/notes.md` identifies as
`Team::SetNation`, so the eight it lists are the team record's and
`lib/game/roster.ts` could supply them. Where `sqarmy`, `pigpro` and `standpc`
land is not read, so the panel is left out rather than placed by eye.

**And one spec bug worth remembering.** The screen's first version looked blank
to the suite: the labels arrive with `load()` and the first DRAW is a frontend
tick later, so reading the canvas straight after the labels catches it empty.
The menu's own spec had polled for exactly this reason. Poll the canvas.

Next is PLEASE NAME YOUR TEAM (record 15, kind 0) — the `alpha` alphabet with
`chardel`/`charspc`/`charent` and a caret that steps by its own little table
(0x41DC69). After it, `newGame` in `lib/game/save.ts` has everything it needs
and the autosave finally has a campaign to write.

### …and then play looked at it beside the original (2026-08-13)

Three things, and the screenshot settled two of them on the spot.

**The lamp did not follow the lit row.** It sat at the top of the list while
the third name was lit — and the original brackets the lit name, a green bar
either side of it. The `[0x512C18]` both brackets read is **widget 0's frame**,
the same per-widget array the draw arm takes widget 5's out of twenty bytes
along, and widget 0 walks five frames per row: `2·scaleY(4·frame)` puts them
0, 22, 46, 70, 92, 116 down the list against the console's own text boxes at
0, 22, 45, 70, 92, 115. Two unrelated tables agreeing to a pixel — which is
the check the first reading never had, because it had assumed the literals
were fixed positions.

**The first frame was the finished screen.** The canvas still held the last
frame drawn before `leave()`, so coming to the screen flashed it settled and
only then drove in from the top. `enter()` paints the un-arrived state before
the first tick now. Worth knowing for every screen that drives.

**And the PIG is missing.** The original stands the chosen army's own pig on a
green turntable at the left, and carries a great deal more moving metal than
we draw. That is the piece this file already flagged as unread — `standpc` is
the turntable, the pig is a MODEL rather than frontend art — and it is what
makes the screen read as the original instead of as a list. Next read.

### The list moved left, and the pig turned out to be a MODEL (2026-08-13)

Two more passes after play looked at it.

**The text.** The exe's own item table really does say x 404 — records 5..12
at 0x4C1728, raw 687 through the same `x·640/1024 − 25` the main menu's boxes
go through, and every other box on this screen comes out of those tables and
lands right. But `counsele` is **179 × 306**, so the console spans 335..564
with the global 50 in it, and a 163-wide box at 404 runs to 567: the longest
name goes past the console's own right edge, which is what play saw. It is
368 now, centred on the console, `[play]` against the exe — and the exe's
number is written down beside it because the disagreement is real and
unexplained. The text boxes joined the screen's clonable layout at the same
time, so the next correction is a console nudge rather than an edit.

**The pig.** The left half of the original — a pig on a green turntable — is
missing from our screen because it is missing from the draw arm: it is not
frontend art. A changed row calls `Team::SetNation` with the row and then
`0x426610(-1)`, which reads the pig's CLASS out of the team record at
`[team + 0x71 + 64*slot]` and parks it in the frontend's own model-display
state at 0x513034..0x513050. So the screen shows one pig of the chosen army,
by class, wearing that nation's uniform because SetNation has just written it.

**That is the piece left, and it is not a blit.** It wants the pig's model,
the nation's uniform and a turntable beside a 2D canvas — the first frontend
screen in this remake that needs the scene. Everything the engine needs is
already there (the battle loads both), but `ui/` may not import `three/`, so
it lands the way `ui/battle.ts` does it: the screen composes, the scene draws.

**And one spec lesson.** A screen that has never been entered reports itself
SETTLED — its drive is at rest and its plates are not walking — so `lightBar`
let a press fly while the screen BEFORE it was still leaving, and both dropped
it. The test only passed because the one above it happened to leave ONE PLAYER
mid-walk. Wait for the panel to be visible before driving a screen.

### "иди сравнивай" — the comparison paid, and then I over-read a stub (2026-08-13)

Play ordered the comparison and it was worth it: both frontend functions that
work the pig-display block — `0x426610` which fills it and `0x418C50` which
draws it — dispatch on `screen − 3` through a byte map into a pointer table,
and the first read had taken **the arm next to the right one** in each. Screen
3's arms are `0x42667D` and `0x418D38`. The class read out of
`[team + 0x71 + 64*slot]`, and the numbers **290, 320, 378, 405**, are the
SQUAD screens' — records 12, 14, 19, 34 — and were never SELECT TEAM's. Screen
3 overrides nothing and falls into the drawing tail on the shared defaults,
`edi = ebp = 331` and `esi = 160`. Both byte maps are in `frontend/notes.md`.

**And then a worse mistake, which is the one worth keeping.** `0x482510` is
`xor eax, eax; ret 4`, and that got written up as "the model lookup answers
nothing, so the PC build draws no pig" — into this file, into `todo.md` and
into the disasm notes. It is wrong twice over. **Its return value is discarded
at both call sites** (`call` then `jmp`, 0x418D36 and 0x418D45), so it is a
stubbed side-effect that says nothing about what is drawn. And it was written
against a screenshot of the shipped game, supplied in the same conversation,
showing the pig plainly. A remark from play — "свиньи кстати нет там" — was
read as evidence for it, when it was a bug report about OUR screen after the
fix that was meant to bring the pig in.

The rule this earns: **a stub whose result nobody reads is not evidence of
absence**, and no reading of the binary outranks a picture of the game running.
`[play]` is above `[exe]` in this project for exactly this reason.

So the pig is real work and it is still to do: the model, that nation's
uniform, clip 27 idling, and a turntable — the first frontend screen here that
needs the scene beside its canvas.

## The hats, three wrong answers and one right one (2026-08-13)

Play: the nation hats land "либо на пузе либо в ногах", and the standard hats
are not removed. Three passes, each one further into the same question.

**First — a centring.** The hat's box came out behind the skull, so
`frontendPig.ts` centred it on the head bone in x and z and called it
`[CHECK — remake]`. Invented, and it hid the real thing.

**Second — the half turn, which is the exe's.** Both attachment loaders end
their model with `afSetObjPos(obj, 0,0,0, 0, 0x800, 0)`, half of the 0x1000
circle, and the pig's body constructor never calls it at all — so the turn
`heldWeapon.ts` had measured its way to for a WEAPON is a rule about
attachments, and a hat gets it too. `afSetObjPos` does not put it in the
object's matrix either (which `afDrawAnimModel` would then overwrite with the
bone's): it calls a helper that walks the mesh and turns the VERTICES, once, at
load. Untorned `br_hat` boxes x −197..61 against a head at x −25..221; turned,
x −49..209, on the head.

**Third — and this was the whole of the two hats: the wrong MODEL.** Every
class carries its headgear in the mesh as one texture group, and the pig on
SELECT TEAM is the one model that does not: the HEAVY GUNNER. `british.mtd` has
no `HV_H` at all. Which is what the engine's `[obj+2] == 2` gate means — not
"kind 2 wears a nation hat" but "kind 2 is the bare head". Record 3 forces the
class to 1, 0x4C2E50 maps that to kind 2, `afLoadAnimModels` stores
`british.mad` straight through a 0x48 record at a time so kind 2 is the `pchvy`
triple, and the frontend's z of 1000 is inside the near threshold of 1500. So
it is `pchvy_hi`, and there is nothing to hide.

**Then a fourth report, which was not about placement at all**: scrolling the
list, the hats sank one step per row. `buildModelGeometry` hands the geometry
the parsed model's OWN `Float32Array` without copying it, and `unresolve`
subtracts the bind offsets in place — so on a screen that rebuilds its hat on
every change, each pass took bone 2's offset off again, 198 units a time.
`unresolve` copies first now. The battle never showed it because
`heldWeapon.ts` caches one geometry per weapon and unresolves once.

Two lessons. **A measurement can be right and still be the wrong answer** — the
box really was behind the skull, and centring it really did move it there, and
none of that was the bug. And **a shared buffer handed out as a view is a trap
that only shows up on the second call**; the fix belongs where the mutation is.

## PLEASE NAME YOUR TEAM (2026-08-13)

The fourth screen, and the first one whose SHAPE was a surprise. It has no bars
and no list: the alphabet is `fetext` 0 — one string of 42 characters — and the
cursor is `[record+0x0C]`, the same field every other kind uses for "which item
is lit". Three values past the end of that string are three keys of their own,
and the walk at 0x42AE30 puts them in one more column beside the grid, wrapping
those three among themselves. So the rules came out small and pure
(`lib/game/nameEntry.ts`, ten tests) and the screen is only the picture.

Everything about what a name IS was read: eleven characters for a team and
seven for a pig (0x42CE6C and 0x42CEB7), the destination the screen is opened
with, SPACE appending byte 1 because the game's letters are `ASCII − 0x1F`,
ENTER refusing an empty name with sound 21, and the field showing the name
padded out to its maximum with `fetext` 745, a full stop — so an empty team
name reads as eleven dots.

**The art answered questions the code did not.** `alpha02..08` looked like they
might be letter grids; decoded, every one is a solid block, so they are seven
PLATES the widget walks between and the letters go on top as text. And
`chardel`/`charspc`/`charent` are 24×28 each, which is exactly the 28 the draw
arm stacks its three blits by — so those three blits ARE the keys, one under
another.

**What is still not read is the grid's shape**, and it is worth saying why
rather than pretending. 0x431380 computes it from the box and the font, and the
two font metrics it reads are filled at runtime by the text object's
constructor. Six across and seven down is what 42 letters make on `alpha07` at
a square cell, and that is the argument for it — arithmetic on the art, not a
reading. It is tagged `[CHECK — remake]` in the file and in `todo.md`, along
with every y on the screen, which the arm computes off an entrance whose
resting value is equally unread.

Two additions came with it. `menuLeft`/`menuRight` — the frontend had never
needed a sideways press before — and a `type()` on the screen, the remake's own
keyboard, which is `[deliberate]` in the same way the mouse on the menu is: the
original has only the grid, and the grid still works.

And the far end: accepting a name runs `newGame` and writes `savearmy0`. That
is the first save this project has ever written from play rather than from a
test.

## The PLAYER screen, and the promotion tree under it (2026-08-13)

Play asked for the screen after the name entry and, in the same breath, said
what the ranks do: "в конце все идут командос герой". Both halves of that
turned out to be readable, and the second was the better find.

**The screen** is record 12, kind 5, and its arm draws the squad TWICE over one
ragged grid — five across and then three, which is the squad of eight — from
`team + 64*slot + 0x70`. The first pass is portraits, the second badges and
stripes. Only one thing on it moves: the lit portrait's width and height come
out of `fcos` on an angle that steps 100 of 4096 a frame, so it swells in place
while everything else sits at unity.

**The ranks are one byte.** `fetext` 467 + class names all fifteen — GRUNT,
GUNNER, BOMBARDIER, PYROTECH, COMMANDO, SAPPER, ENGINEER, SABOTEUR, SCOUT,
SNIPER, SPY, ORDERLY, MEDIC, SURGEON, HERO — and 0x4D29C0 turns the same byte
into a career (six badges) and a step in it (0, 1 or 2, the first wearing no
stripes). Then 0x4D29A8 and 0x4D2980 give the tree outright: a GRUNT has four
ways out at one point each, everything else has exactly one, and a HERO has
none. Every career runs three rungs at 2, 3 and 6 into **COMMANDO**, and
COMMANDO becomes a **HERO** for 8 — so twenty points whichever way round, which
is what play remembered. The manual says the same in words.

That went into `lib/game/ranks.ts` with six tests rather than into the screen,
because it is a rule about pigs and the squad screen is only the first place
that shows it: PROMOTE and CAREER PATH are still to build and will want the
same table.

What the screen does NOT have is most of its furniture — `sqpic`, the dials,
the name plates, the arrows, the medals — and every y on it is eyework, the
same way the name entry's is and for the same reason.

## The two screens straightened out, 2026-08-13

Play: the name entry is crooked and the squad screen very crooked. Both were
placed by eye for the same reason — the arms compute their coordinates off an
entrance whose resting value goes through the frontend's resolution scalers, and
whether those scalers were ON was the one value nobody had read. It is read now,
and both screens came out of it.

**The scale flag is SET, and the earlier note had misread three reads as
writes.** `[0x51F120]` is written in four places in the whole exe's frontend:
set entering (0x426A3F, 0x426B6D), cleared at the teardown and on a mode change
out. The three addresses that had been written down as the TEXT object writing
it are the operand bytes of `mov eax,[51F120h]`. So an arm is scaled — 640/1024
across, 480/820 down, truncated — and SELECT TEAM proves it rather than either
of these screens: its lamp steps `2·scaleY(20·row)` = 0, 22, 46, 70, 92, 116,
which is the 0, 22, 45, 70, 92, 115 its text rows already sit at, and unscaled
the same expression steps a flat 40.

**The name entry is a PANEL with the name bar inlaid across its top.** The plate
is widget 18's — the very widget the entrance walks 0 → 6 — and its seven frames
are `alpha02..08`, so what had been a static plate and an invisible gate counter
is one thing: the panel unrolls downward from y 32, 368 wide and 192 tall at
frame 0, and rests 304×352 at x 168, centred. Two 30-row bands of its own top
edge go above it at 6 and −22 and carry it off the top of the screen. The bar is
`propoint` tiled at y 4 — caps at 184 and 432, twelve middles between them, each
20×60 — with a single source row stretched 100 tall above both caps, which is
the rail it falls in on. It does not ride the screen's x at all; it has a fall of
its own and nothing else. The title's box is the exe's (206, 55) 300 wide, 15
pixels down from where it had been guessed.

**The squad screen's grid stands UP, and that was the "very".** The arm's two
counters had been read the wrong way round: `ebx` is the COLUMN and steps x by
462, `ebp` is the ROW and steps y by `2·37`. So it is five pigs DOWN the left
edge and three down the right — x 57 and 519, rows 75, 149, 223, 296, 368 — with
everything else on the screen between them, not five across the top. The badges
step a pitch of their own, 417, and are handed +82 on the left and −69 on the
right, so both columns' badges face the middle: 161 and 427, the row's y plus
44. START MISSION and SAVE TEAM are the record's own item boxes 59 and 60, side
by side at (350, 385) and (418, 385) under the short column. And the swell is
SIDEWAYS — `fcos` is pushed as the blit's width, the source height is pushed
unscaled, and the x re-centres — so the lit portrait breathes about its own
axis instead of growing in place.

`frontend/blits.js` in the disasm repo learned the two scalers and a `--set
512964=70` for the entrance, which is what turned an arm full of `?` into
pixels; the `lea reg,[reg+reg-imm]` its interpreter could not read was why every
plate's y came out unknown.

What is still not drawn is the squad screen's furniture — `sqpic`, the dials,
the name plates, the arrows, the medals, the `backgr~1` frame each portrait sits
in — and the arm's third loop (0x41D70E) that would place some of it. Where the
letters sit on the name entry's panel is still the remake's own: the exe lays
them out through the text object off record 15's first item box, (280, 250)
270×30 raw, and that arm is unread.

**The furniture went down three days later, and there was never a third loop**
(2026-08-16). 0x41D70E is loop 2's fourth blit block — the promotion flag,
`pcflag` on any pig whose next step the team can afford — and the furniture is
the arm's TAIL, 0x41D830 to its `ret`, read end to end this session
(`frontend/notes.md`). The answer to the screen's oldest riddle fell out of it:
the right column's panel is the LEFT one, its source cut 179 rows short —
exactly the two rows that column does not have — and capped with its own
top-left corner flipped in both axes. `sqpics00..10` is the panel's arrival
animation, `parrow1..3` and `sqarmy` are dead, `pigpro` is the arm's LAST blit
and stands in front, and play read the shipped screen off it: it is the BOARD,
five lines about the team and the lit pig written with the markup icons
`vp`/`battle`/`kills`. Each column got a dial of its own that only rides up and
down (`[play]`, then the tail agreed — two dials on counters of their own), the
names moved onto the plate above the badge, and every trapezoid came out
`bgdark`. The layout itself was regrouped into rows/columns/drop so the console
work is one knob a move, and the nudge stash survives the window closing — an
e2e run got a profile of its own the same evening, having been found writing
its layouts into the developer's stash through the shared Electron profile.

**The campaign got its spine** (2026-08-17). The save is LIVE now:
`src/renderer/src/campaign.ts` holds the game in play, `begin` writes the first
free of the original's eight `savearmy0..7` slots, and the three ways a battle
ends go three ways — WON through the debrief, where CONTINUE takes the settled
result (the manual's award: one point, two with all five through) and RETRY
throws it away; LOST is the manual's replay; walked-out is an abort straight
back to the squad, nothing written. LOAD GAME (`ui/loadScreen.ts`), the debrief
(`ui/debrief.ts`, gtext's own 163/164/181/193) and PLAY TRAINING MISSION?
(`ui/askTraining.ts`, fetext 141..143 — the original's record 39, whose kind-12
box is decoded and not yet built) all ride the bar machine as stand-ins; the
save grew a `tutorial` flag a win on position 0 raises and a skip does not.
Every mission still opens CAMP — the twenty-five real levels wait on an AI.
The read-debts this leaves are in todo.md §0's "what gates what", the campaign
map screen ("screen 22", 0x41E365, nothing read) first among them.
