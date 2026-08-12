# The training ground

CAMP's own script, and the mission it ends.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## THE TRAINING SCRIPT MOVES — and no step is hung on a building

Play: "выполнение задания по убежищу не двигает туториал." The guess in the list
above was that the shelter wanted a trigger of its own. It does not. **Nothing in
the original's training script fires on entering a building**, and the two lines
that mention one are an ordinary pair of crates: "USE BACKSPACE BUTTON TO ENTER
AND EXIT BUILDINGS OR VEHICLES" is the health×25 crate being COLLECTED, and
"ENTER THE BUILDING AND COLLECT THE CRATE" is the bazooka crate being PLACED.
Walking in is never a step; collecting is.

**"— inside it" used to end that sentence and it was never read.** Measured off
CAMP.POG (2026-08-12): the bazooka crate #19 stands in the open at
(−5376, 11008), the nearest building on the map is the SHELTER **5894** units
away, and what stands beside the shelter is the health×25 crate #56, 1305 from
it. The LINE is the game's; where it sends you is undecoded, and the map does not
agree with the obvious guess. One for play.

What was actually missing is the whole other HALF of the script. Everything the
remake could say hung on a crate being collected, and **a collected crate signals
nothing**: field 15's high byte is its contents, so `Command.signals` is always 0
(`lib/game/script.ts`). The chain runs on DUMMIES breaking, and what speaks then
is the second dispatcher, `0x465AB0`, called from the placement arm at
`0x4AA6B7` — guarded by the training flag and by the crate not being a health one
(`cmp [esi+80h],1`). Those are the six "FOLLOW THE … PATH" lines, and without
them the sergeant explains each weapon and never once says where to go.

Its table is read off the jump table rather than off its prose: `[skill - 7]`
into the byte map at `0x465C88`, six targets at `0x465C70`, and each arm pushes a
`gtext` and then its clip 209 apart, as everywhere else in the script.

| placed | clip | line |
| ------ | ---- | ---- |
| 7 RIFLE | 6 | FOLLOW THE YELLOW PATH AND COLLECT THE CRATE. |
| 11 SNIPER RIFLE | 10 | COLLECT THE CRATE. |
| 19 GRENADE ×5 | 12 | FOLLOW THE RED PATH… |
| 19 GRENADE ×10 | 15 | FOLLOW THE BLUE PATH… |
| 29 BAZOOKA | 22 | ENTER THE BUILDING AND COLLECT THE CRATE. |
| 37 TNT | 17 | FOLLOW THE PURPLE PATH AND CLIMB OVER THE GATE. |

**And the third mechanism is a COUNTER, not a dispatcher.** `[gameMode+0x32C]`
— on the object at `[0x537F24]`, whose `+0x329` is the level's copy of the
training flag — is moved by exactly three sites: every crate line ZEROES it in
its shared tail (0x465bb5, 0x465c4a), opening the skill menu sets it to **1**
(0x492b37), and taking something OUT of that menu increments it, but only from 1
upwards (0x4933c5). So the ordinary course is crate → menu → choice, and the
choice is count TWO — which is where clip 5, "PRESS SPACE TO ATTACK THE DUMMY",
lives. That line was the one the notes called untraceable. Clip 9 is the rifle's
same beat; clip 14 is the grenade's NAG, which asks for a count divisible by five
and for the sergeant to be quiet, so it comes back round rather than firing first.

**Clip 4 is the same block's other half, and the field it hangs on is the MENU
ITSELF** — identified 2026-08-11, which is the last line of the script to land.
`[gameMode+0]` is not a vtable slot and not a mode: **the game object's first
0x300 bytes ARE the skill menu**, sixty-four cells of twelve bytes — skill,
amount, and a 1-or-2 flag. `0x492FD0` clears the block in one 4×16 loop and
`0x468BD0` fills it from the pig's own `[+0x84]`/`[+0x88]` arrays and returns how
many, which is exactly why the same `mov eax,[esi]` two instructions earlier
decides whether the cursor is put back: an empty first cell is an empty menu.

So `cmp eax,3` is **the BAYONET sitting in the first cell**, and clip 4 is: the
menu has just been opened, on the training ground, with the counter still at
nought — a crate line has spoken and this is the first menu since — and the
bayonet is the first thing in it. Clip 3 has just said to press RETURN; this says
what to do now that you have. `clipForMenu` in `lib/game/tutorial.ts`, and the
`menuOpened` event carries the first cell because that is the only thing the rule
reads.

`lib/game/tutorial.ts` is the tables, `events.ts` carries `placed` and `chose`,
`ui/battle.ts` holds the counter and is the one listener that speaks, and
`pow.spoken()` is how any of it can be watched — the script runs on SPEECH, and
the briefing bar only ever carries the key press. `e2e/002/tutorial.spec.ts`
drives the first steps on the real map and reads the clips back in order:
3 collected, **4 the menu opened**, 5 chosen, 6 placed.

## …AND THE SCRIPT CAN BE PUT WHERE YOU WANT IT — F11/F12, 2026-08-12

The tutorial is a chain nine dummies long and the thing being fixed is usually
its last link, so `lib/game/training.ts` is a JUMP: **F12 on a step, F11 back
one**, `pow.step(9)` for the bazooka. The remake's own, like `pow.swapMap` and
`pow.give`, and it invents no mechanism — a step opens when something BREAKS
(a crate signals nothing), so a jump breaks exactly what a player would have
broken, in the chain's own order, and then stands the pig ON that step's crate
and lets `Scenery.collect` hand it over. The table is CAMP's own file and
`e2e/002/trainingStep.spec.ts` checks it against the shipped .POG: a step's
crate must wait on the label the last thing it breaks signals, and a GUARDED
group must be broken whole — with the crates left out of the group, because
placing one spends its command where a placed dummy keeps its own.

Three things it costs, each written where it lives. `AirDrops.land()` puts every
canopy down at once (nine descents from 0xC00 is half a minute of sky).
`DEBUG_ACTIONS` in `input/actions.ts` keeps these keys out of the battle's own
poll — a queued verb is what ends the beat at the top of a turn, so F12 would
have started the turn it jumped into. And **`main/index.ts` now sets a menu
without F11 on it**: Electron's default menu binds it to Toggle Full Screen, and
a menu accelerator goes over the page's head — `preventDefault` in a keydown
handler does not stop it. Everything else the default menu carries stays.

Two shapes worth keeping. A jump BACK is a RELOAD, and the want has to be
remembered across it — set before the reload so a second press counts from it,
and paid only once the new battle is up and its squad off its canopies; paying
it into the battle being replaced hands the pig whatever it was already
carrying, since the crate it warps to has already been collected. And a want is
cleared whether the scene takes it or not, or one asked for on a map that has no
such script blocks every jump after it.

## …AND THE LAST DUMMY ENDS IT — the exe's mode 2, 2026-08-11

Play: "убить последний манекен — не заканчивает миссию… очевидно что заканчивает
миссию." Nothing here ended a level at all: `game.over` is "nobody is left" over
the SQUADS, and the training ground fields one pig and no enemy.

**Nothing watches for a win frame by frame.** `Game::NextTurn` (0x48F490) asks
ONE function — 0x4966A0 — before it advances anybody, so a mission ends at the
HANDOVER and never before. That timing is kept and it is worth keeping: the dummy
comes apart, its crate lands, the beat at the end of the turn runs, and only then
does anyone notice there is nothing left to break. `handOver` in
`lib/game/battle.ts` is the one place, and `cutTurnBeat` goes through it too so a
spec cannot skip an ending along with a beat.

**What the training branch counts is the DUMMIES**, and the field it counts them
by is not the one it looks like: it walks the object list for a breakable (body
type 0x135A) whose `[obj+0x84]` is `0x43..0x47` or `0x4B`, and that field is the
object name table's index **minus 0x1C** (`lea eax,[edi-1Ch]`, written at
0x48D076). So the six kinds are TARGET, TARGET2..5 and DUMMY — and NOT
`T_SUP`/`T_SUP2`/`T_SUP3` at 0x48..0x4A, the stands they are mounted on, though
all nine share the one-point health row. CAMP carries eleven DUMMY records and
none of the TARGET family. The test never looks at `[obj+0x30]`, so the eight
records the script holds back count as standing from load — which is the only
reason a mission cannot end on its first frame. **A training level cannot be
LOST**: that branch has no losing answer in it, which agrees with the training
ground flooring a pig at one point. Everything else goes by SIDES.

**The ending is a mode of its own, 2 END OF GAME** (`lib/game/endOfGame.ts`,
`turns/notes.md`): the clock stops, nothing is driven — it is a control set above
every other (`ending` in `lib/game/controls.ts`) — the camera walks the survivors
**one every two seconds**, and past **three seconds** any key, or twenty on its
own, puts the battle away. The exe goes to mode 18 QUIT; here the engine emits
`missionEnded` and `ui/battle.ts` does exactly what its LEAVE button does — on a
microtask, because the event arrives from inside `engine.update` and the rest of
that frame still draws the scene it would dispose.

The sergeant signs off with clip **27** if it took more than twelve turns and
**28** otherwise (`[gameMode+0x40C]`, the handover count, against `cmp eax,0Ch`).
Which of the two is the congratulation is LOCATED and not heard — both lines are
blank, voice only.

**And it SHOWS something**, which play asked for — "при выигрыше не написано
победа, остаётся оружие в руках, он не танцует победный танец". The card is the
game's own and comes out of the same drawer every other card does: `0x45B8B0`
switches on `Game::Mode()` (the table at 0x45BF78), and mode 2's arm is
`gtext` **163 "MISSION ACCOMPLISHED!"** for a one-player side still standing,
**164 "MISSION FAILED!"** when it is not, and 165 "VICTORY TO >S!!" with the
team's name in multiplayer. The empty hands and the DANCE are the remake's — the
exe's mode-2 arm plays no clip and touches no weapon — and the clip is play's own
identification from the other end: 46, which they named as a celebration when
SKIP TURN borrowed it (`ANIM.VICTORY` beside `ANIM.THINKING`).

**Two of the four "closers" are nothing of the kind**, and this file had them
filed wrong. Both are built now, and each turned out to have a rule worth
knowing:

- **clip 21 is the first MINE.** Its call site is the PROJECTILE CONSTRUCTOR,
  gated on the ammo row being 0x28 or 0x29 — the two `WE_APMIN` — so it answers a
  mine trodden on and a mine set off by something thrown alike. Its flag
  `[gameMode+0x330]` is **the other way up from what it looks**: the game object
  is built with it SET, so the sergeant says nothing about mines until one of the
  two MINEFIELD crates CLEARS it as it speaks its own line (0x465D72, 0x465DBD —
  the health×15 and ×20 arms, both of which say "FOLLOW THE PATH THROUGH THE
  MINEFIELD"), and speaking sets it back. **Once per minefield, and only after
  being told to walk into one.**
- **clip 26 is the turn you WASTED**: the clock ran out and no weapon was used
  all turn. `[gameMode+0x334]` counts uses — the fire dispatcher increments it
  (0x493E7A), the handover zeroes it but only from 1 or less (0x48F50C), and the
  line writes **2**, which is exactly the value the reset refuses. So it is once
  a LEVEL, and a turn in which two weapons were used (only the planted charges
  allow it) disarms it just as permanently. An artefact of three lines rather
  than a rule anybody wrote, and it is transcribed as such.

`weaponUses` in `lib/game/battle.ts` is that counter and `turnWasted` the event;
the mine's flag is `ui/battle.ts`'s, beside the script's other one. One half of
the exe's guard is NOT modelled and says so at the field: it drops the
wasted-turn line while the sergeant is talking and lets it come round on a later
turn, where the remake counts it as said.

`e2e/000/engine-headless.spec.ts` drives the whole seam in plain Node on a CAMP
built with its DUMMY records left off — reaching the condition honestly is the
entire tutorial — and `e2e/002/endOfGame.spec.ts` pins the data: which records
the mission is measured by, and which line signs off.