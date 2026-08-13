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
