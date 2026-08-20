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

**The confirm box is the real widget now** (2026-08-18). `ui/askTraining.ts`
stopped being a bar-machine stand-in the day after its behaviour pass: the
kind-12 box slides in from the upper right on its two own springs, turns
itself over onto the `yes` picture with `Indu008`, walks its band's short
plate out, slides the dial six ticks with the window standing still, hides
the words behind the exe's own countdown flag, and leaves in reverse — every
number and sound the disassembly's (`frontend/notes.md`, the 2026-08-17
pass). Guessed: only `mainbar1`'s repeat seam. Kept on purpose: up/down
toggle the answer alongside left/right, where the exe's up/down arms are
empty. The QUIT confirms (records 0, 24, 43) wear the same layout and wait
on an escape menu to need them.

**LOAD GAME wears the original's furniture, and SAVE ARMY will never exist**
(2026-08-18). `ui/loadScreen.ts` came off the bar machine the day after its
read: the eight `pclit` plates with the lit one blinking script 1006, the
`pcsav` frame, the `pcsvinf` panel unrolling one frame a tick as the screen
climbs from a full screen below, the words riding in from 32 px left on their
own spring, `---` in an empty slot and a cursor that refuses to rest on one —
and no sound anywhere, because the family has none. The MEANING is ours: the
slots are the campaign's eight JSON autosaves, and the panel draws the picked
squad's badges and MISSION N off the parsed save rather than a 680-byte
struct. SAVE ARMY — the same screen with one action changed — is deliberately
never built: the campaign autosaves, and play ruled there is nothing to save
by hand.

**The debrief is the original's page** (2026-08-18). `ui/debrief.ts` came off
the bar machine last of the three: the battle's own 640×480 screen, its art
the loose BMPs in `Language/Tims/debrief/` through a loader of their own
(`loadDebriefImages` — the one art folder the frontend does not archive).
Five fielded rows on the exe's numbers — the pitch-74 portraits against the
pitch-73 names, a face or its wounded twin or `r_i_p`, the team's uniform
laid over the living, the badge-and-pip pair straddling x 215 — the team
name at (320, 5), the verdict column centred on 456, `Pigbkpc2` behind a
loss, and the SPECIAL BONUS row drawing the level's own token count greyed.
The exe's spinning `propoint.mad` is stood in by the `vp` coin, the two
gtext fonts by BIG and GameChars, both `[CHECK — remake]`; the CONTINUE /
RETRY fork stays ours — the original pays with SPACE and replays a loss
without asking.

**The campaign got its MISSION MAP** (2026-08-18), a screen the original never
had outside a cheat. `ui/missionList.ts` is record 44's mechanics — the
seven-row window scrolling under the parked lamp and bracket, the cursor
seeded from the campaign's position, the silent moves, the console rising
from 546 below — on the SELECT TEAM console's read furniture, wearing the
mission TITLES out of gtext where the cheat printed raw map names. Played
positions wear the plain shade, the current one the light, the future the
dark, and only the current one can be chosen — the cheat moved the campaign
anywhere, which is what a cheat is for and a map is not. The flow runs START
→ (the training question at position 0; NO now lands HERE, on the first real
mission) → the map → the battle, and `e2e/001/missions.spec.ts` drives the
whole path. The suite's `toMenu` learned to wait an animated leave out.

## THE PIG MENU AND THE CAREER PATH — 2026-08-18

The squad screen's pigs DO something now. The whole session was two reads and
one build, and both reads went to the disasm repo first (`frontend/notes.md`,
same date): the pig menu — record 19, kind 6 — and the promotion actions
behind it, then CAREER PATH — record 25, kind 13.

**SAVE TEAM went first.** The label had been promised away since SAVE ARMY
was ruled out (the campaign autosaves); touching the screen was the trigger.
START MISSION stands alone on its plate now, `PLACES` is nine, and
`e2e/001/player.spec.ts` counts one action.

**The menu is an OVERLAY, and that was the read's structural half.** The exe
never leaves the squad screen: action 7 links record 19 OVER record 12,
the parent keeps updating and drawing, and its brightness ramps 120 → 80 at
4 a tick. Two corrections fell out of the same pass and are worth more than
the menu itself: **the blit queue flushes BACKWARD** (first queued is drawn
on top — every "last blit wins" reading was upside down), and **the breathing
portrait is the SWAP-ARMED pig**, `[0x4C0C58]`, not the cursor — nobody
breathes in the exe's normal state. The remake keeps the lit pig's swell as
its own cursor (`[deliberate]`) and gives the armed pig the exe's.

**What was built** (`ui/pigMenu.ts`, `ui/careerPath.ts`, composed by
`ui/playerScreen.ts`; the rules in `lib/game/promotion.ts`, written through
`campaign.amend`, which autosaves):

- the `swap` plaque at (180, 260) riding `2·scaleY` of the box's own spring —
  500 → 0 at gain 12 / damping 20 / cap 40, out on the launcher 14/70 — with
  the `swap01..03` medallion at x 230 sliding 16 px a widget-frame down the
  three rows and blinking script 1006 at rest; the words stand still on their
  boxes (232, 357/389/422) while the plaque rises under them, all three in
  the plain shade — the medallion IS the highlight;
- PROMOTE carrying its price — the `vp` icon and the cost off the tree, `-`
  for a HERO; one way pays at once (`Promo`@80, the spend number at
  (323, 189), the menu closing), a GRUNT gates at the menu (`Crunch`@100
  when short) and picks on CAREER PATH, a HERO does nothing at all;
- CAREER PATH as the original's CAROUSEL — the title and ONE career name in
  one box (184, 339/373, 218 wide), four icons at (260 + 30n, 408) with the
  chosen one blinking on alternate ticks, `click4`@40 a move — paying
  without a second test, which is safe while all four ways cost one;
- SWAP POSITION arming the squad (`steam1`@100): the armed pig breathes, the
  next pig click swaps the WHOLE pig, BACK only disarms;
- RENAME through the one kind-0 machine — `nameScreen.use('pig')`: title 52,
  max seven, the buffer empty the way 0x42CEB7 leaves it — committed to the
  roster and straight back to the squad. The remake shows it as a full view
  where the exe overlays the panel over the dimmed squad; tagged in todo.
- sounds throughout are the read's: `Indu037`@100 a pig click, `steam1`@60
  in / @100 out, `click1`@60 the medallion arriving, `hiss2`@100 for the
  career path and the name entry.

`unit/promotion.spec.ts` walks the tree pure (a GRUNT to HERO on twenty
points); `e2e/001/pigmenu.spec.ts` drives all three choices, the broke
refusal, the seven-letter trim, the whole-pig swap and the disarm, and the
career walk on a planted three-token save.

## THE PIG MAP AND THE BRIEFING — 2026-08-18

Play asked for the mission screen and named what the note said did not exist:
"карта мира + карта региона + флажки миссий". The 2026-08-17 read had
concluded THERE IS NO CAMPAIGN MAP because no frontend RECORD draws one — and
that was the wrong place to conclude from: the chain lives in the MISSION
HOST (0x47DE90), after the frontend tears down on record 22. Two agent passes
pinned it end to end (`pigmap/notes.md` in the disasm repo) and the build
followed the same day. "I could not find it" is never "it is not there" —
now proved on a whole SCREEN.

**What the chain is** (every number the exe's): the world map — `BigMap.bmp`
under 25 territory patches (one array at 0x4D3658 places them) tinted by the
nation holding each mission (0x4D34E0, through the {0,2,1,4,5,3,6} art map)
with six localized region banners, the current mission's patch blinking on
`tick & 0x10` for 2000 ms; the ZOOM — the patch's rectangle flying to the
region page's over 32 steps of 50 ms on the easing table 0x4D4A40, patch
fading out, page fading in, a veil to 64/255; the REGION — the `*phy` page
(flat single-TIM archives, NOT 3D) with `fpole` on every one of its missions
revealing one by one, `flag` 40×32 tinted on the conquered, and the player's
own four-part `ar1..4` marker bobbing on 0x4D4B88 over the current one; then
the BRIEFING — `level<position>.bmp`, which IS the loading screen: the
17-step loadbar at (152, 451) 330×15, gtext 257 PRESS ANY KEY creeping up 2
px a frame once the load is in, and position 1 compositing the enemy's
`level1n<nation>.bmp` portrait at (342, 190). The training ground skips the
whole map (the exe gates on map id 10) and briefs on `level0.bmp`. After a
mission the game goes back through the map every time.

**The build**: `lib/game/pigmap.ts` carries the tables pure — sites, banners,
region pages with sizes, `regionOf`/`regionSpan` (Arstria keeps FOUR,
position 25 stands alone on the Isle of Swine), flag stands, easing, wave,
nation colours; `ui/pigMap.ts` runs the three phases on ms clocks with the
art tinted through `sprites.tinted`; `ui/briefing.ts` holds the page while
`battle.open` runs under it, the bar walking to its last step on its own
clock (`[CHECK — remake]` for that speed) and a key pressed EARLY counting.
The loaders grew one generic: `loadLanguageImages` (any Language/Tims
folder, punching only the keyed names — a 24-bit page keeps its magenta),
and `parseBmp` learned 24-bit. A key skips a phase, the exe's own; BACK
skips the whole map, `[deliberate]`.

**The MISSION LIST stand-in died the way stand-ins do** — `ui/missionList.ts`
and `e2e/001/missions.spec.ts` deleted, the flow rewired: START MISSION (or
NO to the training question) launches through the map; there is no list to
browse, because the original has none — the campaign is linear and the map
is its face. `e2e/001/mapchain.spec.ts` drives both paths (phase by phase,
and BACK's skip) into the battle and out; `unit/pigmap.spec.ts` pins the
tables; the whole phase-001 suite is 21/21.

**Not built from the read**: the newspaper page (mode 3, its variant math
unread), the region-complete victory FMVs (03..07 and the endings 08/09),
the load-screen gamma fade, the level runner's random non-campaign screens.

## THE SECOND PASS: THE NEWSPAPER LANDS, THE ZOOM LOSES ITS VEIL — 2026-08-18

Two more agent passes closed most of the chain's unread list and the OPTIONS
family (`pigmap/notes.md` second half, `frontend/notes.md` 2026-08-18
sections). Built from it the same day:

- **The NEWSPAPER** (`ui/newspaper.ts` on `lib/game/newspaper.ts`): a
  campaign win prints the nation's front page — headlines baked into the
  localized art — with the story block keyed at (23, 144) and the photo at
  (309, 111); the variant follows the five fielded survivors (a wipeout
  splits on whether the win still paid two points), the story rotates on
  the new position, and six maps carry special pages unless the win was
  flawless. Shown after the debrief's CONTINUE, never for the training
  ground, a loss or a retry; any key or ten seconds out. Wired as a third
  PASSAGE beside the map and the briefing.
- **The zoom corrected**: the second pass proved the 0.75 travel cap
  belongs to the VEIL alone — drawn over its own lerped rect, not the
  screen — while the page flies the whole way and stands still for the
  last six steps, so phase 3's first frame equals phase 2's last. The
  region phase wears no veil at all. `ui/pigMap.ts` follows.
- Read but not built, and marked in todo: the victory FMVs, the gamma
  fade with its tumbling `fhats.mad` hat (the "random load screens" that
  turned out not to exist — NVIEW*.BMP is referenced by nothing), and the
  whole OPTIONS family (volume overlay, controller setup with working
  remaps, credits' wall-clock scroll) plus the in-mission pause and the
  ESC/quit chain — each now specified to the pixel for whenever it is
  picked up.

## FIRST PLAY OF THE CHAIN: FOUR THINGS, AND TWO OF THEM WERE ONE — 2026-08-18

The map chain went to play and came back with four reports. Two turned out
to be the same defect wearing different clothes, and one of those was the
kind the suite is structurally blind to.

**"сломался парашют - начал миссию с падения"**, and the guess that came
with it — "скорее всего перехватил нажатие клавиши на экране загрузки" —
was right on the first try. ONE keydown was producing TWO actions. Every
view binds its own map on the same `window`, gated on being the view that
is up, and that gate holds right up to the moment a view hands over
SYNCHRONOUSLY: the briefing's `menuSelect` shows the battle before the
event has finished dispatching, so the listener registered after it read
the same Space through the BATTLE's map, where it is `jump` — and a jump
during the drop-in cuts every canopy. Measured, not argued: a throwaway
probe listening on the controller recorded `["menuSelect","jump"]` off one
press, with `canopy: false` on the pig by the next frame.

`input/controller.ts` now calls `stopImmediatePropagation` on any event it
turns into an action, and `MENU_ACTIONS` in `input/actions.ts` catches the
other half — the frontend's own verbs reaching the battle's queue inside
the same `fired()` pass, which no event listener could have stopped. The
exe cannot have either bug: its canopy cut (0x490c20) tests the pad for a
FRESH press, down this frame and not the last.

**And the battle was RUNNING under the briefing.** Found while chasing the
first: the scene is built the moment `battle.open()` resolves, which is
exactly when the loading bar fills and the page says PRESS ANY KEY — and
nothing gated the frame. The drop is five seconds; a player who reads the
briefing lands before looking at it. `three/battle.ts` takes a `running`
predicate now and the mission's clock does not start until the mission is
on screen.

**THE SUITE COULD NOT HAVE CAUGHT THE FIRST ONE**, and that is worth
keeping. Specs drive `controller.tap` on purpose (CLAUDE.md), so no spec
had ever produced a real keydown and the whole two-listener path was
invisible. `e2e/001/mapchain.spec.ts` now presses a real `Space` — the one
place in the suite that may, because here the keyboard IS the subject —
and reads `pow.debug.dropIn()` for canopies. It was checked the only way a
regression spec is worth anything: built with the fix backed out, watched
to fail, put back.

**"тренировка не должна давать награды."** `missionReward` had paid CAMP
zero since it was written; the DEBRIEF was drawing two tokens anyway.
`paysPoints` sits beside the award in `lib/game/save.ts` now and the page
asks it before it draws, so the screen cannot promise what the save
refuses.

**"должен 1 свин быть показан а не 5."** The exe draws five rows always —
0x484B77's bound is a literal — and calls the fielded count per row
(0x4849C0) only to swap a benched pig's portrait for the plain one; the
name and badge still print. But the exe never shows this page after boot
camp at all (0x47E61F), so the screen a player meets there is the remake's
own and play's ruling governs: rows follow `fieldedAt` — 1, then 3, then 5.

**"там уже стоит нажми esc чтобы повторить."** The prompt was never ours:
it is PAINTED INTO `Pigbkpc1/2` at y 438..466, and adopting the original's
backdrop had brought it in under our own CONTINUE/RETRY rows, the selected
one landing on top of the art's ESCAPE box. The rows are gone and the two
keys do what the picture says: on a win SPACE continues and ESCAPE
replays, on a loss SPACE replays and ESCAPE walks away to the squad. All
four are the exe's own (0x484EB5 returns `won ? 0 : 2`, and a 0 rolls the
mission back), and they answer where gtext 193 RETRY and 194 EDIT SQUAD
belong — a question the disasm notes had open. The debrief left the bar
screens for the PASSAGES on the way: it has no cursor to report any more.

## THE MAP'S COLOURS, AND ONE ACTION SPENT TWICE — 2026-08-18

Play took the chain out again: "карта почти классная - нет только цветов",
our own colour should spread as the campaign is won, and the briefing was
skipping itself.

**The briefing skip was the parachute bug one floor up.** The map hands over
to the briefing SYNCHRONOUSLY, so the key that ended the region phase was
still being handed down the listener list when the briefing became the view,
and the briefing takes ANY key. Rather than patch a third screen, the rule
went into the controller: `stopDispatch()` ends an action's delivery, and
`show()` — the one place a view changes — calls it. Both mapchain specs now
assert the briefing is still up once the level has loaded, and both fail
without it.

**The colours needed measuring, and the first guess was wrong.** The tint
cache looked like it was keyed one way and read another; a probe showed all
25 patches drawn with the right nation colours (`cdbb62`, `828282`,
`d67b85`, `6e7dc3`) and the region's marker in the player's own green. So
the cache was never the fault — the tidy-up stayed, the claim did not.

What the exe actually does came out of a fresh read (`pigmap/notes.md`, HOW A
TERRITORY IS COLOURED): the patches are GREYSCALE MASKS, the nation colour is
a diffuse at 255-neutral, and the composer draws them with **SRCBLEND =
DESTBLEND = ONE**. The map is `bigmap + mask × colour/255` — a wash the
relief shows through, where ours was a flat slab of paint laid over it. The
same read killed a second error: the blink does not HIDE the current
territory, it redraws it white, which over an additive blend is a flash.
`ui/pigMap.ts` does both now.

And the part that was simply missing: **a territory the campaign has already
taken flies OUR colour.** `holder` returned the defending enemy for every
position; past the current one, the nation defending it is us.

`pow.pigMap.patches()` was added for the spec, because a map with no tints at
all still paints — BigMap under them is a perfectly good-looking map, which
is exactly why nobody noticed.

### …and the one colour was an EMPTY ENEMY TABLE

Play came back once more: "все 1го цвета — + всё ещё нет флажки тоже не
появились — там есть вот флагштоки — а цветных флагов нет. скорее все 1
проблема." Right on the last count, and it was neither the tint nor the
blend.

The measurement that found it planted a save mid-campaign, at position 4, and
read the map back: positions 1..3 in our own green, and every other territory
`6d3820` — which is not a mistake at all, it is row 7 of the exe's own colour
table, the brown "NONE". `holder` returns 7 when `enemies[pos]` is undefined,
and the table was EMPTY.

`campaign.ts` was created calling `newGame(...)` with four arguments
(`7247312`); `drawEnemies` was wired in a commit later (`21b0690`). Every
campaign begun in that window saved `enemies: []` — and an empty array passes
`parse`'s test, `every` over nothing being true — so the save loads fine and
paints all 25 territories the same brown. The flags followed from the same
place, plus a rule that is correct: nothing is conquered at position 1, so
there is nothing to fly. Poles yes, flags no.

The first repair went into `adopt`, and play asked the better question: "так
это баг — как может сейв ломать карту?" Right. A file should not be able to
break a screen, and the reason it could was not that the map lacked a guard —
it was that the PARSER let through a save describing a campaign that cannot
exist, after which every screen downstream was working correctly on nonsense.

So the repair lives at the door instead. `parse` fills a short table the same
way it already answers `tutorial` for a file written before that field
existed, and `newGame` fills one too, so no caller can build a half table
either. The draw is SEEDED off the save's own name and army rather than
`Math.random`, which makes it pure — and means a file reads the same enemies
however many times it is opened, instead of re-rolling the world on every
load. Whatever the table already says is kept: those entries are the nations
already fought.

Two things learned the hard way, both now written into the specs that hit
them. A `rand` that answers a CONSTANT hangs `drawEnemies` — it rejects a
nation until the counts allow it, so the unit spec needs a cycling source;
that one wedged a run for ten minutes. And the e2e save folder OUTLIVES a
run: `load.spec.ts` sorts first and asserts `0/26`, so a mapchain spec run on
its own earlier leaves a campaign at position 1 and the next full phase fails
on a spec nobody touched.


## THE FLAGS WERE OURS, NOT THE EXE'S — 2026-08-19

Play, on the same breath as the map's white hairlines: *"при зуме карты и
показе карты региона — всё ещё нет флажков"*. The entry above this one had
answered that once already, and answered it wrongly: "nothing is conquered at
position 1, so there is nothing to fly. **Poles yes, flags no.**" That was an
inference dressed as a reading, and the second report is what it took to go
back to the binary rather than repeat it.

**0x4833B0's per-position loop is 0x483566..0x483631 and it contains no `cmp`
and no `test`.** The campaign position `[0x51F17B]` is not read anywhere in
the routine at all. There is no conquest gate, there never was one, and an
unflown pole is not a thing the original can draw: the flag and the pole are
the same two blits every time round the loop, at one x/y, the pole second so
that it covers the flag's hoist edge.

What a flag says is **who HOLDS that mission** — `[0x520920 + 4i]`, which the
composer fills from `team+0x55+i`, the 25-entry schedule rolled when the army
is born. So a brand-new campaign opens on a region page of five foreign
flags and takes them over one at a time, which is the screen doing its job:
the debrief re-stamps the slot as each mission is won (0x484F2E). The player's
own nation is read exactly once in the whole routine, at 0x48365A, and only
for the four-part `ar1..ar4` marker on the current mission.

We do not re-stamp anything — a save's `enemies` is the roll and a position
behind the campaign is ours by arithmetic — so `holder` was already giving the
right answer for all 25. Only the gate around it was invented. It is gone, and
the pre-tint in `show()` now paints a flag for every stand of the region
rather than for the conquered ones alone.

Two smaller things came out of the same read. The reveal is **100 ms and then
one every 150**, not one immediately and every 150 after: the cursor is
`start + (ticks + 1) / 3` on a 50 ms tick (0x483877), so the stands land at
100, 250, 400, 550, 700 — it lives in `lib/game/pigmap.ts` as `standsShown`
now, with `unit/pigmap.spec.ts` on it. And phase 2 draws neither flag nor
pole: the whole zoom makes three blits, the veil, the patch and the page.

`pow.pigMap.flags()` joins `patches()`, for the reason `patches()` exists —
a page of bare poles looks like a perfectly good page, and this is the second
time a silent miss on this screen was found by a player rather than by a run.

## A play pass over the menus — the pointer, the needle and the lit row (2026-08-20)

Seven reports in one message, all of them from playing the chain rather than
from reading anything, and each is written where it lives:

- **The needle pointed at the floor on ONE PLAYER.** `needleFrame` spread the
  dial's twelve frames over however many bars a screen had, which is the exe's
  own 0, 4, 7, 11 on a four-bar screen and nonsense anywhere else: LOAD GAME,
  row 1 of 2, took frame 11 — the bottom of the travel. The exe's arithmetic is
  per-ROW, not per-screen (`4*row - (4*row > 4 ? 1 : 0)`, 0x427C90), so two
  bars are frames 0 and 4. `ui/barScreen.ts`.
- **The MOUSE reached two more screens**, and the hit test became one module.
  `ui/mouseRows.ts` carries what `barScreen` had inline — un-letterboxing a
  canvas laid out with `object-fit: contain`, hitting a list of rectangles the
  screen hands in fresh each event (they ride the entrance), and remembering
  the row rather than acting on it, so the light walks there one row a tick and
  the reel, the needle and the lamps animate as they do under a key. SELECT
  TEAM feeds it the exe's own text boxes; the squad screen feeds it eight
  portraits and the option plate, and refuses everything while an overlay is up.
- **LOAD lights its lit row's LETTERS** (`[play]`, against the read: the exe's
  family shows the selection with the blinking plate and never recolours a
  label). Eight identical lines with a plate behind them did not read as a
  cursor.
- **The squad screen**: the pig's name went up to the portrait's top edge (16
  had it written across the middle of every face); START MISSION moved down 16
  with its words up 8 inside the plate; and its two lamps now blink `lit1..3`
  on the rack's own script while the row is lit, where they used to sit on the
  dark frame for ever — an action that never lit up.
- **The board lost its third pair.** Deaths came off it (`[play]`); the count
  stays on the roster. It was also what pushed that line past `pigpro`'s own
  200 px, which is the crowding the same message reported.
- **The briefing's PRESS ANY KEY stops twelve lower**, resting over the bar
  instead of climbing into the page's words.

### …and why three of those did not show up (same day)

Play came back with "имена свиней не перемещены выше", "старт меню не
переместил виджет" — three numbers changed in the source and none of them on
the screen. Nothing was wrong with the numbers: **the console layout's own
persistence was painting over them.**

`pow.screen` stashes a session's nudges in `localStorage` on the way out and
lays them back over the code on the way in, which is right — an evening of
moving furniture used to die with the window. What it stashed was the WHOLE
layout, every number the screens carried, so from the first nudge on that
machine the saved snapshot outranked the source for ever: editing `ui/*.ts`
changed nothing anybody could see.

It stores the DIFFERENCE now. The code's own numbers are snapshotted at
start-up before anything saved is applied, and `beforeunload` writes only the
leaves that differ from them — an untouched screen saves nothing at all. The
key moved to `pow.screen.layout.v2` and v1's whole-layout snapshots are
removed on sight, so the machines that have one recover without being told to
run `pow.screen.reset()`.

The same pass finished the rest of the list: LOAD answers the mouse (empty
slots are forgotten rather than chased, since the cursor may not rest on one),
the board's top line came down twelve with the four under it re-spaced to keep
the bottom where play said it was already right, and START MISSION's words are
CENTRED in their plate now — the drop-from-the-top number had been guessed
twice and reported low twice, so `options.text` is a nudge off the centre
instead.

### The reset that saved what it was resetting (2026-08-20)

Play: "я нечайно поломал лэйаут — и резет не спасает." Exactly so, and it had
never worked: `pow.screen.reset()` cleared the key and called
`location.reload()`, and a reload fires `beforeunload` — which wrote the LIVE
layout, the broken one still sitting in memory, straight back into the key
that had just been emptied. The way out is a promise not to save: `keep` goes
false before the reload and the writer returns early.

Two more of the squad screen's pieces stopped sharing numbers at the same
time. Each column's badge and stripes carry their OWN y now (they used to take
an x from the column and a y from a `drop` table shared with the other
column), and **the pig's NAME has a box of its own** — x, width and y — where
it used to be centred on the trapezoid and dropped by the badge's number, so
nudging the class picture dragged the letters with it. Play found that the way
it finds everything: "имена привязаны к columns[0].badge зачем-то, но имена
отдельно."
