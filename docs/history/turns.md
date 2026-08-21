# Turns and input

The clock, the beats around it, and what a player's press does.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## The beat has a ceiling, the crate has a voice

**The hold now ends after three seconds whatever is going on.** Play: "надо
думаю ждать 2-3 секунды пока завершится всё", and "без ящика гуд — с ящиком
плохо". The crate was the overrun: the break effect runs about a second, the
canopy takes two and a half more from 0xC00 up, and the exe's second of quiet
on top made four and a half. `AFTERMATH_MAX = 3` in `lib/game/aftermath.ts`
caps it; a crate still in the air keeps coming down behind the ordinary
camera, which costs nothing.

The busy list is play's, as far as this scene can answer it: a projectile in
the air, damage still floating, a body still coming apart, a canopy still up.
**A pig swimming for the shore is on their list and is NOT modelled** —
nothing knocks one into the water yet; when it does, it goes in there.

**The crate's canopy had no sound.** `BATTLE_SOUNDS.chute` was decoded far
enough to name and then only ever played by the level's opening drop
(`three/dropIn.ts`); `three/airDrop.ts` was silent. It plays now, and `land`
on touchdown.

**The reticle is the PC's.** Play thought it wrong and it is not: dumped all
46 entries of `Language/Tims/dashtims.mad` for them to look at, and the answer
came back "на пс1 была другая, но похоже для пк поменяли". `sights` + `target`
stay. The other archives under `Language/Tims` were not dumped.

**A plane, then a canopy.** Play: "там ещё звук самолёта перед парашютом."
`BG_PLANE` (index 10) is the bank's only candidate and `three/airDrop.ts`
plays it on `send`, with `chute` half a second behind it — a NAME pick, like
the rest of `audio/battle.ts`, since nothing has been traced starting that
bed. `CHUTE_DELAY` is the gap.

**The tremor is the analogue STICK.** The aim view's handler ends by unpacking six
signed bytes out of `[game+0x444]` and `[game+0x44C]`, halving them and feeding them on
every frame no direction is held (0x495699 onwards). On the machine this was made for
the sights are wired to a stick and a resting stick reads a few units either way, a
different few every frame; on a keyboard those bytes are zero, which is why the sights
were dead still and every invented substitute felt wrong. Where that reading GOES took
five more passes — see the last section of this file.

## The wait was cutting off the very thing it waited for

Play, again: "всё ещё анимация сброса ящика сильно рано прерывает предыдущую
анимацию." The gate was not the problem — `effects.busy()` is the right test
for the break. The problem was one line further down: the aftermath block put
`ANIM.IDLE` on the pig on every frame of the wait, and **asking for a clip
cancels a committed one** (`lib/game/anim.ts`). A bayonet strikes on frames 11
to 14 of a 36-frame clip, so the swing was thrown away with most of a second
still to run, and a gun's attack clip was killed the frame after it started.
The wait also never called `swings.update`, so nothing was advancing anyway.

So the blow now plays out INSIDE the wait — `swings.update` runs there, the
IDLE takes the same two guards the normal path uses (`swinging`,
`animating`), and the script's next step waits on all three of the swing, the
pig's own clip and the break. Both are in `settling` too, so the fifteen
quiet frames start after the pig has finished moving.

`AFTERMATH_MAX` stays at three seconds and the blow's animation is inside it,
which leaves the crate roughly the last two — the camera comes off it just
before it lands. That is the trade play asked for.

**Then the ceiling came off again.** With the blow finishing first, play wants
the descent watched to the end: "нужно ждать пока сундук упадёт на землю + там
ещё эффект от падения и только потом через 0.5 с где-то вернуться".
`AFTERMATH_MAX` is gone — it was there to stop a crate that started down
through the smoke of the thing it replaced, and that was the interruption's
fault, not the crate's.

Two things fell out of that. **A crate landing now throws up the BREAK burst**
(effect 0x3e, six rising puffs, no rings) — there was no landing effect at all
and nothing has been read that spawns one for a placed object, so borrowing
the engine's own ground-impact burst is the remake's, flagged at the call.
`airDrop.ts`'s `onLanded` carries the spot for it.

**And a landed crate is put back ON its spot.** Play: "коробки падают но
зависают чуть выше земли", and it was 29.9 units, measured. A descent leaves the
engine's list on the step it lands, so the last frame that DREW it drew it in
the air — at a height tweened between the two steps before it — and nothing
afterwards ever moved that mesh again. `props.restingY` had been carrying the
answer since the descent was built and nobody called it; `airDropArt.land`
does, and `e2e/002/strike.spec.ts` now checks every crate against its record's
own resting place. The record's y is exact, to within a unit of the terrain on
every crate CAMP carries, so there was never anything wrong with the placement.

And **`SETTLE` is half a second, not one**, which is the same fifteen frames.
`FRAME_SECONDS` here is 1/15, deliberately stretched from the engine's rate so
the walk reads right against half-scale models — so every timer taken off the
exe **in frames comes out twice as long as the original ran it**. Fifteen
frames undistorted is 0.5 s, which is exactly what play asked for. Worth
remembering the next time a decoded frame count feels sluggish; the constant is
now written in seconds and says why.

## INPUT: control sets, polled once a frame

**What a key means is one pure table** (`lib/game/controls.ts`): `modeOf` picks a
control SET, `readControls` says what the axes mean in it, `verbOf` says what a
one-shot key IS. The engine does the same and says so — `0x4928dc` routes the whole
of input through a different branch while the aim bit is down, the camera keeps a
remembered mode and restores it when the bit goes up, and the skill menu is a mode.
The sets: **starting / inventory / charging / armed / locked / sights / battle**, in
that priority. The frontend is a set that never reaches this file: the menu binds its
own KEY map instead.

**Two of them exist because play refused an exception.** "ОГОНЬ проходит сквозь
блокировку — а вот и нет! там просто другой контроллер!" A filling gauge is
`charging` (it reads the button coming UP, which is the exe's own split at 0x493796);
the beat at the top of a turn is `starting`. With both named, `locked` means what it
says and there are no carve-outs anywhere.

**A WEAPON is a layer on top of movement**, which is play's model: "каждое оружие —
свой контроллер; можно ведь комбинировать их — movement + melee или movement +
gun?" `weaponLayer` is that table: `melee`, `gun`, `lob`, `skill`, or `none` for an
empty hand. Only `gun` and `lob` have an AIM VIEW — a blade must leave G inert,
because entering a set DROPS the driving keys and G with a bayonet was stopping the
pig for nothing (and 0x46a891 pins a bayonet's aim angle to zero, so there is nothing
to show). Only `none` refuses FIRE: SKIP TURN has no weapon behind it and F still uses
it — "пропуск хода это не none, там есть реакция на f, а без оружия нет."

**A set change drops every DRIVING key** (`DRIVING_ACTIONS`), so a new set starts from
nothing held. The sights already did that and the inventory did not — one rule instead
of two behaviours. Two changes CARRY the keys instead: the first look of a battle
(there is no set to have come from) and leaving the BEAT (its rule is that the same
input is read again in the set that follows). Both cost a failing spec on the way in.

**Input is POLLED, once a frame, in the SCENE's loop** (`input/battleInput.ts`, from
`host.onInput` ahead of `onFrame`). Play asked for it — "onchange вообще плохой
способ в играх" — and it is a bug, not a style: a set changes while nothing on the
keyboard moves, so a listener is never told and the pig walks on under a menu. Three
things a poll needs, all three of which killed the first attempt:

- **a press LATCH** (`controller.tookPress`) — a press and its release both land
  between two frames and `isDown` is false at either end. One-shot actions need none:
  they are announced as they happen and QUEUED, in order, because order is
  load-bearing (R then SPACE opens the inventory and takes what is under the cursor);
- **a gate on the beat** (`wakes`) — a poll runs whether the player touched anything
  or not, and it counts what went DOWN this frame rather than what is down: "press any
  key", and a key still held through a handover is not a press;
- **one loop.** The dashboard's own `requestAnimationFrame` only draws.

**A PRESS cannot be derived from the held state rising.** `Intent` carries `fired`
beside `firing` and `setFiring(held, pressed)` takes both: a set that does not read the
fire key reports it up while the player holds it, so LEAVING that set read as a fresh
press — hold F through a shot and the grenade that came out the far side went off the
frame it appeared.

**A window that loses focus never sees the key come UP**, so `bindKeyboard` drops
everything on `blur` and `visibilitychange`. An alt-tab with G down held the aim view
for ever, and since W POINTS rather than walks down there, the pig could not be driven
again until G was pressed and released. Nothing downstream can recover from a stuck
key.

**Ending a turn is a SKILL** — 65, SKIP TURN, always in the menu. Choosing it takes it
in HAND and FIRE applies it; there is no key bound to it at all. R CANCELS a choice and
puts the weapon away. The `endTurn` action survives as the dashboard button's own path.
`e2e/002/controls.spec.ts` is the table's spec and `e2e/002/battle.spec.ts` drives the
two bugs play found by hand (the inventory stopping the pig, and the blur).

## The TURN's own beats

**"GET READY >S..." is `gtext 168`**, and it is the game's own answer to the beat at
the top of a turn. The beat had been in the domain since the turn clock landed and
nothing ever showed it, so a handover read as instant. A first pass invented a line out
of the exe's debug print; play sent a screenshot of the shipped game instead — big
green letters over the battle — so it is that string, with the SQUAD's name in it, on
the same centred card the mission title uses. **`gtext 167` is ">S MISSES A TURN!"**,
which is what SKIP TURN should say once the bar can be reached from the scene; a sound
cue stands in. **Do not invent a string this game already has**: both were sitting in
gtext four numbers apart, beside the crate lines this repo already used.

**The clock stops at the CHARGE, not at the throw.** Play: "при начинании зарядки
броска таймер останавливается — так как это уже атака началась." Same gate as the
rest: `Pig::MayAct` goes false on the press that starts the gauge, a second and a half
before anything leaves the hand.

**The camera TELEPORTS to a new subject** rather than gliding across the map —
`chase.reset()` clears `snapped` as well as the settle timer, and the end of a flight
calls it. Play asked and the answer is yes: easing is for following one thing about.

**A frame is clamped to a tenth of a second.** `getDelta` is wall-clock and the browser
stops calling `requestAnimationFrame` for a window nobody is looking at, so coming back
from an alt-tab handed the world one step of however long the player was away — a
fuse, a flight and a landing all resolved before anything drew, which play saw as
"2 раза вызвать выстрел, а цель стояла и не было прожектайла". Clamping is not a
pause and does not pretend to be one; a real one is a thread of its own.

## USING A WEAPON ends the turn — and the exception list is MEASURED

Play: "использование оружия заканчивает ход — у нас нет." The engine had every
piece of the ending — the beat after a blow, the WALK AWAY beat, the handover —
and nothing that spent the turn but the clock and SKIP TURN, so a pig could empty
a rifle into a yard of dummies on one clock.

The exe does not hang this on the weapon's behaviour at all. It is a byte in the
skill's own 80-byte record at **0x4d7300**: `+0x1c` goes into `[game+0x517]`, and
that flag is the mode machine's "go to WALK AWAY" (`turns/notes.md`). Read off the
shipped exe over all 67 records, `+0x1c` is **1 on everything but thirteen**:

| | |
| - | - |
| 0 | NONE |
| 35, 36 | MINE, ANTI-P MINE |
| 37, 38 | TNT, FIRECRACKER — and these two alone carry `+0x18` = 400, four seconds of ordinary play instead of a handover: plant it and run |
| 52, 54 | HEALING HANDS, PICKPOCKET |
| 60, 61, 62 | the vehicle skills (`in-out`, `pbox`, `getout`) |
| 63, 64 | MAP VIEW, BINOCULARS |
| 66 | SURRENDER |

Two families and nothing else — the explosives a pig PLANTS, and the skills that
are not blows. **65 SKIP TURN is not among them**, which is the check that the
reading is the right way round. `lib/game/spend.ts` is that set and one predicate;
the four-second wait is not modelled, because neither TNT nor the firecracker is a
weapon in this engine yet and a timer nothing can start is a guess with no way to
be wrong.

**The turn ends on the QUIET, not on the press.** The exe reaches mode 13 through
the same wait the beat after a blow is — `0x495316` → `0x494570` → WALK AWAY — so
the bullet flies, the swing plays out, the dummy comes apart and its crate lands
first, and only then does the turn go. In `lib/game/battle.ts` that is one `spent`
flag, cashed below the aftermath block against `!committed() &&
!anim.animating(acting) && !settling()`: the world quiet AND the pig's own clip
finished, which is the exe's own `0x47D800` ("no pig is still busy"). The few
frames between the blow and the handover are LOCKED — they are not a last chance
to walk.

Two things this pass turned up that are worth keeping:

- **`settling()` is now one function.** The same five-term list — effects, shots,
  grenades, damage numbers, falling crates — was written out twice and this rule
  wanted it a third time. All three waits ask the same question; a fourth copy
  would have been the one that drifted.
- **A rule that ends turns rewrites the SPECS' idea of a turn.** `002/shoot.spec.ts`
  broke on the honest thing: it broke a dummy with the bayonet and then waited for
  the pig to walk into the crate that dropped — and nothing is collected in the
  beats between two turns, so it sat there for the whole ten-second "press any
  key". `nextTurn(page)` in `e2e/controller.ts` is the handover a spec now has to
  take, and a spec that fires twice on one clock is a spec that is wrong.

## THE PAUSE, AND THE MENU OVER IT — 2026-08-19

Play asked whether there was an escape menu yet and said to build one. There
was not: Escape reached nothing at all in a battle, because the only binding
for it anywhere was the frontend's `menuBack`, and every screen's binder is
gated on being the view that is up.

**It was read before it was built, twice, and by two agents that did not see
each other's answers.** They agreed, which is worth saying because the last
thing this repo built off a single reading was the pig map's flags. Between
them they also retired three things `frontend/notes.md` had said: the fourth
row is SPEECH (175) and not PIG VOICES (240) — 240 has no reader in `.text`
at all, and the one nearby hit for 0xF0 is `push 0F0h; push 140h`, the pair
(320, 240) — the `0x45B3xx` block is not a networked second draw but the grey
pass of the same function, and the menu has five rows because the lit row
dispatches through a five-entry jump table. No RESTART. No INSTRUCTIONS.

**A pause is three things stopping, each in its own domain.** The world stops
because `running` already gated the whole battle frame (it is what keeps the
drop-in from running under the loading screen), so `engine.update` is never
reached and the fixed-step accumulator never sees the time — the exe does the
same thing one level lower, not advancing `[0x520878]` and snapping its own
accumulator forward so there is no catch-up burst. The sound stops by
suspending the one shared `AudioContext`, which is a suspend and not a stop on
purpose: the sergeant resumes mid-word rather than losing his line. And the
dashboard keeps DRAWING, because the frozen battle behind the menu is the
point, but is handed a delta of zero so the briefing bar stops scrolling and
the map stops sliding in.

That third one is the answer to what play recorded on 2026-08-11 and asked to
be kept for later: alt-tabbing froze the world and the instructor talked on.
The frame clamp in `three/scene.ts` was never a pause and said so.

**Where the input goes.** Escape is a battle action of its own, `pause`, and
not `menuBack` — that one lives in `MENU_ACTIONS`, which the battle
deliberately drops, so binding the menu to it would have gone round the repo's
own rule. The poll rides the scene's INPUT pass, which runs before the frame
the pause freezes, so the key that starts a pause is also the key that ends
one. While the menu is up the battle's own keys are the menu's: the walking
pair steps the cursor, the turning pair works a slider, FIRE chooses. That is
the skill menu's borrowing, and it is what the exe does by having one pad.

**The art.** `dashtims.mad` entries 28..35 — `pause1..pause8` — were down in
`todo.md` as "five two-frame widgets, built the same way as the dial". They
are not: they are the **nine-slice frame** of the menu's panel, eight 16×16
tiles drawn by 0x45B580. Which tile is which corner is nowhere in the code, so
it was measured off the art instead: decoded, each corner tile is exactly the
union of the two edge tiles that meet there, which puts them in reading order
TL, T, TR, L, R, BL, B, BR.

**One extra `AudioContext`, and it earns its keep.** Every noise the menu
makes is one sample at three pitches — `S_SELECT`, at 0x64 for the cursor and
for opening and closing, 0x96 after a volume step so the new level is heard,
0x82 for a toggle. But a pause SUSPENDS the game's context, and a suspended
context renders nothing at all, clicks included. The exe has no such trouble:
it parks twelve channel slots by hand and then plays on the same engine. A
second context for one buffer is the cheapest thing that keeps both halves —
the line held exactly where it was, and a menu that answers.

**The volumes had to become real.** Two rows of the menu are sliders and a
third is a switch, and sliders that move nothing are a lie, so `audio/bank.ts`
grew a mixer: a master gain with SFX and SPEECH under it, and everything the
game plays routed through one of the two. The exe keeps the same three on its
sound manager (`+0x14`, `+0x1A`, `+0x18`) and the in-mission menu writes them
directly — which is why a volume set in a mission is not in the options screen
afterwards, and why these last as long as the process and no longer.

**Two things are the remake's own and both say so where they live.** The floor
on a volume — the exe clamps only the top, and its bottom is a word going
through zero, which is an overflow rather than a behaviour. And Escape over an
armed ARE YOU SURE? takes the question down rather than the whole pause: the
toggle was read, the confirm flag's fate across one was not.

### …and the MISSION ABORTED screen turned out not to exist — same day

The one thing left open above was "the MISSION ABORTED screen (gtext 189) the
exe shows after an abort". It shows no such thing, and the sentence was mine:
an earlier note had said gtext 189 was "printed by the post-mission frontend
screen (0x424298)", and I repeated it without checking. **0x424298 is
`push 0BDh` as a Y COORDINATE** — `0x419FA0(600, 189, −5, 0)` — the same trap
this repo had already documented once for 0xF0 = (320, 240). And gtext 189 has
no reader anywhere: a byte scan of `.text` for every `BD 00 00 00` gives 24
hits, 23 of them jump displacements or mid-instruction, and the full caller
list of the gtext accessor covers 0xBB, 0xBC, 0xBE, 0xBF and 0xC0 and skips
0xBD. It is a PSX leftover like 174 VOLUME, 178 INSTRUCTIONS and 240 PIG
VOICES.

**What actually happens is that an abort is a LOSS.** ABORT writes mode 17;
the level runner's outcome switch takes `edi == 2` at 0x47E629, writes −2 into
the outcome word and FALLS THROUGH into the same debrief call the ordinary end
takes; and the page's own gate is `won = (outcome == 0)`, so −2 and the
ordinary −1 are one page with one pair of keys. Nothing in the image tells
them apart.

So the build was one line, and it is a rename rather than a screen: the
pause's ABORT leaves with the **`lost`** verdict, and lands on the loss
debrief the remake already had — SPACE RETRY, ESCAPE EDIT SQUAD, which is
exactly the pair the exe paints into `pigbkpc2.bmp`. `aborted` keeps what it
always meant here: the TOOLBAR's walk-out, which is the remake's own button
and has no original to be faithful to. Routing that through the debrief too
was tried first and the e2e fixture caught it in one run — the loss page's
SPACE is RETRY, so walking out of a battle went back into one, forever.

**One thing the same pass got wrong, and it is worth knowing why it was
caught.** It reported a fourth sound pitch for the pause, 0x50, from
`4922A3 push 50h / 4922A5 push 61h`. Disassembling the whole arm gives
`push ebp ×5 / push 64h / push ebp / push 50h / push 61h` — the call is
`Play(index=0x61, volume=0x50, 0, pitch=0x64, …)`, so **0x50 is the volume**
and it is identical in every one of these calls. An earlier pass had already
shown the full sequence; two readings of one instruction disagreed and the
cheap check settled it. The note now says so, so it is not re-added.

One difference from the same read was written down here as if it were live,
and it is not — play asked what the losses were, and the answer is that there
are none. The exe's RETRY rolls the whole team back from a snapshot
(`memcpy(team, team+0xAA0, 0x2A8)`) while EDIT SQUAD does not, so ITS
casualties persist on one key and not the other. What makes those casualties
is the battle→roster writeback `0x497930`, which runs before the page and puts
the dead, the kills, the friendly kills and the propoints into the live team
struct.

**The remake has no such writeback, so there is nothing for either key to keep
or undo.** `fall()` in `lib/game/roster.ts` is the only thing that could mark a
pig down and its single caller in the whole tree is a unit spec; a battle
musters off the MAP rather than off the save's roster, so `losses` in
`missionWonResult()` is always zero today and `save.squad` is never touched by
a battle at all. Nor is anything staged on a loss: `missionWonResult()` runs on
a WIN alone, builds a NEW object into `pending` and leaves `save` where it was,
so the `discardMission()` both keys call is a no-op there.

**And `missionWonResult()` does not write to disk** — that is the half the whole
answer rests on. It stages; `acceptMission()` is what promotes `pending` to
`save` and writes. There are exactly FOUR writers in `campaign.ts`, and it is
worth having them listed because "the debrief saves" is the easy assumption:

| writer | what reaches it |
| ------ | --------------- |
| `begin()` | NEW GAME, the army being born |
| `acceptMission()` | CONTINUE on a won debrief |
| `amend()` | EVERY squad edit — rename, upgrade, move (`main.ts`) |
| `skipTutorial()` | answering NO to PLAY TRAINING MISSION |

So a squad edit autosaves on the spot (the original waits for SAVE TEAM,
which the remake deliberately does not have), and `adopt()` — loading somebody
else's slot — writes nothing, because what it takes is already on disk.

So this becomes a real question on exactly one day: when a battle starts
fielding the SAVE's pigs — the `[gap]` `missionWonResult()` already names, "the
fallen arrive with that link". That is when RETRY has to undo the writeback
and EDIT SQUAD has to keep it.

### The menu was never on the screen — 2026-08-19, the play after

Play, on the first session with it: *"при нажатии esc ставится пауза - но меню
не показывается - хотя звуки слышны."* Which is exactly right, and the state
was right too: the world froze, the sound went, the cursor moved and clicked.

`hud.draw` had a bare `return` in the middle of it — the name plates hide
until the acting pig has stood still long enough, and that refusal was written
as an early return rather than a guard. The pause block had been appended
AFTER it. So on any frame where the pig had not been still for `PLATE.delay`,
which is every frame just after a key, the whole rest of the dashboard was
skipped and the menu with it. The plates are `drawPlates()` now, a function
that can refuse without taking anything else down.

**The suite passed it, and that is the part worth keeping.** Every assertion
in `e2e/002/pause.spec.ts` read `pow.battle.menu()` — the state — and none
read a pixel. It is the second time in one session: the pig map's flags were
computed and never drawn and the specs read `phase()` and `patches()`. So
`greenPixels` now counts the title's green on the HUD canvas, before and
after, and CLAUDE.md carries the rule: a debug read is not a paint check.

**And a second thing play reported the same day was not a bug at all — it was
a FEATURE nobody had built.** "камера летает по кругу над картой". I measured
it four ways first and every one came back negative: the camera is static to
the unit through twenty seconds of an untouched turn, it settles within a
second of a turn key being released, it does not move across a pause with a
key held, and the 3D picture is byte-identical to itself over three seconds of
pause. `eye()` — the only thing that could have drifted, since it is what turns
the dashboard's map — accumulates nothing either.

Then play said where to look: *"во время паузы — ты вроде в дизасм записывал
про неё."* They were right, and it was my own note. **The exe's pause enters
CAMERA MODE 7** (0x49205F, restored on the way out), and mode 7 is the MAP
VIEW `scanner/notes.md` had already read in full for skill 63: the camera
pulls back to **11000** against the chase's 3072 — row 7 of 0x4D9528 — and its
per-frame update 0x4A4D40 walks the pig list, looks at each for **0x7D
frames**, then steps to the next and wraps. It also shrinks the corner scanner
(`afSetScannerSizeSmall`), which is the very same small size a charging shot
asks for, so the widget needed no new number.

So a paused mission in the original is not a frozen frame: the world stops and
the camera goes round the field. `lib/game/mapView.ts` is the rule,
`three/chase.ts` gains a `map` row on the same rig it already had, and
`three/battle.ts` takes a `paused` predicate beside `running` — the first says
the world has stopped, the second says what to do instead of nothing. It tours
the pigs the DRAW loop is drawing, which is what the `+0x30` byte the exe tests
means: a pig indoors is skipped, and so is a dead one.

Two things about it are ours and both say so: the first frame SNAPS rather
than gliding 11000 units, and the exe's two ways of cutting a pig's turn short
— the camera coming too close, the pig leaving the screen — are not modelled,
because both are properties of a camera still travelling and this one is
parked with the whole field in shot.

**The measurement was not wasted, and it is why this is written down.** Four
negative readings said "not a bug in what you built", which is exactly what
they should say about a feature that does not exist — and the way to tell
those two apart was not more measuring. It was play pointing at the note.

### …and the flight was built from half a reading — 2026-08-19, the pass after

Play, on the build: *"камера всё ещё не летает"*, and then the diagnosis I had
not made: *"переключает субъект между свиньями — это камера победы; камера
паузы прям летает над полем по кругу."* Exactly right, and the duplication was
literal — `endOfGame.ts` already walks survivors on a `TOUR_SECONDS`, and the
new module had reached for the same name.

The note it was built from — `scanner/notes.md`, mine, written for skill 63 —
described the subject-stepping half of camera mode 7 and **nothing else**. The
handler was re-read to its last instruction and the flight is the larger half
of it:

- `add eax,6` at **0x4A4E5E**, unconditional, every frame — so the camera moves
  whether or not the subject does. My "it would park with one pig" was a
  conclusion from a reading that had never looked at this instruction, and CAMP
  fields exactly one pig, which is why play saw nothing at all.
- `add ecx,ecx` at **0x4A4E67** doubles the SINE's index, so the path is
  `x = R·cos θ`, `z = R·sin 2θ` — a 1:2 Lissajous about the world origin. **A
  figure-eight, not a circle**, crossing through the middle of the map twice a
  lap and bulging to R·√1.5 at the corners.
- the radius is the float `[0x4BD6E8] = 11000`, and **not** row 7 of the
  per-mode table, which happens to read 11000 in its first column and has no
  reader anywhere. The `MAP_CLOSE` the first build derived as a fraction of the
  chase rig was doubly wrong: wrong number, and the mode is not on that rig.
- the height is fixed at twice the map's highest vertex — which through
  `fromExeY`'s halving is exactly `TerrainQuery.peak`, so the query grew one
  field rather than the module growing a constant.
- 126 frames a subject (`cmp ecx,7Dh` is tested BEFORE the increment), and ONE
  early-out, the flight passing within 4408 units. The "or leaves the screen"
  in the old note was a misread of the `+0x30` draw flag, which is the search
  loop's eligibility filter.
- three easings, and the look-at's 1/13 a frame is mode 7's alone — every other
  mode gets a third. That is what makes a change of subject a sweep.

`easeOver` is the one thing here that is ours rather than read: the exe eases
per fixed frame and our frames are not fixed, so a factor is applied as
`1 − (1−f)^n`. The unit spec pins that asking for two frames at once agrees
with asking for one twice, which is the only property that matters.

The e2e now asserts the camera is somewhere ELSE seven hundred milliseconds
into a pause while the turn clock has not moved — a parked flight passes every
"is it in map view" check and fails that one.

### Three more from the same play round — 2026-08-19

Reported in one line — *"меню не работает и шрифт там гавно"*, plus
*"миникарта не должна отдаляться вообще"* — and only one of the three was a
matter of taste.

**The font was measurable.** The menu loaded `FETEXT\small` with no metrics, so
tracking was 0 and the letters were drawn edge to edge. The exe's text object
adds 3 after every glyph and 8 for a space, and its constructor sets that on
every one it builds (0x430C28) — `FRONTEND_METRICS` is that pair, already in
the repo, and this menu prints through the very object the frontend does. It
was not the font being wrong; it was the font being drawn without the game's
own spacing.

**The menu did not answer because SELECT is one button in the original.** Bit
0x20, the one that fires. This remake split firing onto F, because SPACE
already jumps — right in a battle and wrong in a menu: a player looking at
CONTINUE presses the key every other screen in the game chooses with, and
nothing happened. SPACE selects too now; jumping means nothing while the world
is stopped, so the key was free. `[deliberate]`, and it is the same shape as
the mouse working the frontend.

**And the map holds ONE SIZE.** The library shrinks it in two places — a
charging shot and the map view — both read, and play overrode both on sight.
Both numbers stay in `lib/game/scanner.ts` with the ruling written beside them,
and the drawer holds its scale as a `const` so nothing can re-apply them by
accident. That also retired the one reason the dashboard had been keeping a
real delta through a pause.

**A stale spec fell out of it.** `e2e/002/hud.spec.ts` asserted the bottom-left
corner of the dashboard was EMPTY — "the map is not built yet" — and it
outlived the map by a whole session, because nothing had run that file. It
counts the board's pixels now. Two lessons in one round, and they are the same
lesson: a suite only tells you about the files you run, and only about the
things it actually looks at.
### The font, again — and this time it changes font — 2026-08-19

Play's second look at the same menu: "шрифт в esc меню ужасный - надо другой
взять". The first round had blamed the spacing and fixed the spacing; that was
right as far as it went and it was not enough. Two things came out of reading
0x45A9B0 to its last instruction rather than around it.

**The exe really does print this menu in `FETEXT\small`.** Thirty-nine
references to `[0x51BA54]` between 0x45A9B0 and 0x45B560, none at all to
`[0x51BA58]`, the big one. There is no scaling anywhere on the path either —
no `imul` touches a glyph box. So SMALL, twelve pixels tall with a four-pixel
`I`, on a panel 260×300, is what the original looks like, and play has now
called it unreadable twice. The menu wears **CHARS2** instead — sixteen tall,
the letters every other menu in the game is written in — and the divergence is
`[play]` in CLAUDE.md with the reading beside it.

**And the spacing note this file left behind was wrong.** The 3 the pen adds
after a glyph is written only when `[0x51F120]` is set (0x430c28); the same
flag gates the 1024→640 squeeze of every coordinate (0x41ADB0). The pause
writes its panel in plain 640-space pixels, so the flag is CLEAR in a mission:
the battle's letters carry no tracking at all, and `FRONTEND_METRICS` is named
correctly after all.

**Which is why the volume BAR keeps SMALL.** Its width is arithmetic, not
taste. The track is twenty `I ` pairs (0x4CFA1C) with the fill `I ` repeated
`value/5` over it; `I` is 4 wide and a space advances 8, so a cell is 12 and
the track is exactly 240 across a panel of 260 — it fits because the exe's own
font makes it fit, and any other font moves it. Measured on the running
dashboard afterwards: 310..541 against a panel of 297..557.

One thing there is still deliberately not the exe's: the exe draws the red
fill FIRST and lays the full white track over it (0x45AE57, then 0x45B0BF),
which hides the level. We draw the track and then the fill.

### The four white stripes on the board — 2026-08-19

Play, same round: "на карте мира 4 белые полоски (или больше) и мне кажется те
откуда миникарта выезжает". Three screens could have meant that, so it was
measured rather than guessed, and the first two answers were both NO: the world
map's bright frame is painted into `BigMap.BMP` itself (rows 24..35 and 408..419,
columns 48..57 and 542..548, checked against the file's own pixels), and the
scanner's board has no transparent seams at all — the affine grow closed those
last round, and a hole scan of the whole widget finds none at either yaw.

The board itself is where they are. Its four RIM bands are near-white, they
TURN with the board, and the picture behind them is a fifth of the way to
saturated: the map raster's own texels reach 255. So the question became
arithmetic, and it needed the library.

**It is the original's.** The channel is five bits — the mine writes 31, not
255 — and the library clamps each one itself (`cmp ecx,1Fh / jle / mov ecx,1Fh`,
dll 0x1000A3F4). Palette row 9 is `100,100,100` and `100*194 >> 9` is 37, so any
high grey ground goes pure white. CAMP's boundary plateau averages 3087 against
1489 in the middle, all of it row 9 — a white frame round the whole board.

**And the direction was read, not assumed**, because getting it backwards would
have inverted the picture: `height` is an elevation, positive UP. `afSetMap`
stores `2 * (int16)` with no negation; the min/max sentinels start at +262144
and 0; water floods everything `<=` a level and RAISES what is below it, and on
every shipped map the water sits at the bottom of the range; gravity points
`(0,-1,0)`. Flipping it puts 941 white texels on CAMP where there are 208.

The last thing that could still have been ours was the FILTER — the board is
64 texels stretched over 167 pixels, and this repo had smoothed it on a
judgement. Read now: the library sets MAG and MIN to LINEAR once at start-up
and `DrawScanner` never touches the state, so bilinear is right and the
`[CHECK — remake]` is retired.

Nothing was changed about the WHITE. What came out of the round is a
`unit/scanner.spec.ts` test pinning both ends of the scale — 99 at the lowest
ground, 255 at the highest — so the next reader does not "fix" it back out.

The one real gap the reading turned up was a texel wide, and it is closed now:
the library's fill loop writes the texel twice when it reaches the second
column (`cmp edi,1 / jne / sub ebp,2 / mov [ebp],cx`, 0x1000A431), so the
picture's first column never keeps what it computed — it is a copy of the
second, all the way down. The picture's column runs along world z, so it is
the first z of every row. `mapRaster` does that now, with a test that would
fail on the old fill.

## THE CLOCK BY MAP, AND A VERDICT THAT KNOWS OUR SIDE — 2026-08-19

**The turn table's index turned out to be the campaign position, and the gap
in `turns.ts` closed for free.** `turns/notes.md` had left "which level is
which map" undecoded; the pigmap round decoded it from the other end —
`[0x51f17b]` is `team+0x53`, the campaign position (`pigmap/notes.md`), and
the order table at 0x4D17F0 maps positions to map ids (`army/notes.md`).
`lib/game/missions.ts` already carried that order as `CAMPAIGN`, so `BY_MAP`
in `lib/game/turns.ts` is now `Object.fromEntries` over the two tables
instead of a single hand-written CAMP row: 99 seconds on CAMP, ESTU and
ROAD, 60 to ZULUS, 45 to BRIDGE, 30 to TESTER, 15 on FOOT — the campaign's
tightest turn, Hamburger Hill — and 30 again on FINAL. The arenas are in
neither table and keep the 45 default; the original's multiplayer takes its
turn time off the FIELD CONDITIONS screen, which is not built.
`unit/turns.spec.ts` pins the corners, and the stale "Not decoded" section
of `turns/notes.md` now points at the two files that read it.

**And the verdict knows whose side is whose now.** `outcomeOf` used to answer
`'won'` on `sidesStanding === 1` — losing the whole squad to the last enemy
read as a victory, and the debrief would have paid for it. The exe's two
counters were never anonymous: `[+0x348]` is the player's side and
`[+0x34C]` the rest, our side empty is 2 (lost) in every arm including
both-empty, and the win asks OUR counter still standing with the others'
empty. The remake's side 0 IS the player's — `spawnTeams` orders the side
carrying the map's player bit first — so `outcomeOf(training, ownStanding,
othersStanding, targetsLeft)` says exactly that, `handOver` in
`lib/game/battle.ts` feeds it per-side, and `e2e/002/endOfGame.spec.ts`
pins the case that used to lie: our side down, one enemy up, `'lost'`.

## THE WHITE STRIPES WERE THE WORLD MAP'S AFTER ALL — 2026-08-19

The "four white stripes" section above ended on the wrong screen. Play's
report said "на карте мира" and play meant it; the round that answered it
measured the world map's BigMap frame and the scanner's seams, found both
clean, and settled on the scanner board's clamp-white rim — which is real,
still the exe's own, and still deliberately kept. But the stripes play kept
seeing are thin vertical hairlines ON THE WORLD MAP's territories, and a
screenshot finally pinned them: `hog2`, `sau4`, `trot2`, `sau3` — and, by
the same defect, every digit of the battle clock.

**They are ALIGNMENT PADDING in the art, and the PC original draws them.**
The whole chain was read this round (`library/notes.md` in the disasm repo):
a TIM's width is stored in 16-bit units, so odd-width art carries a filler
column; the exe's composer writes a −1 size sentinel into the 2D record
(0x483B83) and the library substitutes the PADDED width and UVs off the
page-fitted entry (dll 0x1000F1DA, 0x10012737); transparency is the CLUT
word 0x0000 — the loader strips the STP bit and canonicalises the zero-word
entry into index 0 (0x10012F90), so a grey-filled padding column is opaque
and, under the composer's additive blend, a bright hairline. Two false
leads died on the way: "the frame in BigMap.BMP" (real, but inset ~40px and
present in the PC original's own blit — full-surface, 1:1, at 0,0, read at
0x44D4D0), and "index 0 is transparent" (it is the RESULT of
canonicalisation, never the test).

So the fix is a `[play]` divergence — the memory is the PSX's, which never
had this port artifact — and it lives in the FORMAT layer: `spritePadding`
in `lib/formats/tim.ts` measures the filler (trailing columns within the
rounding allowance, one opaque index the body uses only as stray noise) and
`loadTims` in `main/assets.ts` trims it for SPRITES only. The rule is
deliberately narrow and pinned on the shipped data
(`e2e/000/timpadding.spec.ts`): exactly the four masks and the ten digits,
while `pause5`'s uniform dark rim and `fpole`'s solid columns — both of
which broader drafts of the rule ate — stay whole. The current mission's
white FLASH on the world map is untouched: that one is the exe's own
(0x482D99, colour forced white over the additive blend).

## The machine takes its own turn — the AI's seat, with a stub in it (2026-08-20)

Until now a mission was a hotseat: the handover put the camera on the enemy
pig and the same keyboard drove it. What landed is the SEAM, not a mind:

- **Which sides the machine plays is the battle's `computer(side)`**
  (`BattleParts`, threaded through `EngineParts`). The app hands in "everyone
  but side 0" — side 0 is ours, the same load-bearing convention the verdict
  uses — and nothing else does: a battle assembled without it (every pure
  spec, `engine-headless`) is the hotseat it always was.
- **Input never drives a machine pig.** `battleInput.poll` reads
  `situation().computerTurn` and drops every verb and axis — the same rule
  the pause takes, so nothing banks up — with ESCAPE untouched, because the
  pause is taken out of the queue before the gate.
- **The machine's turn is answered inside `battle.update`**, in a block that
  runs where the player's control sets would: the brain (`lib/game/ai.ts`)
  orders `begin` after 2 s of the GET READY card, `think` once — SKIP TURN in
  hand, clip 46 on — and `pass` after 2 s more, through the same
  `endTurnBeat` → WALK AWAY → `handOver` road every turn takes, so the
  mission verdict keeps its one home. If the brain ever stalls, the turn
  clock still runs the turn out: the clock block sits above and ticks
  regardless.
- **The brain is deterministic on purpose** — orders are a function of the
  battle's stepped time, and a real brain must keep that and roll only from
  the battle's seeded stream, because the `net` branch will drive this same
  seam in lockstep. Both waits are `[deliberate]` remake numbers
  (`AI_START_SECONDS`, `AI_THINK_SECONDS`), tuned for watchability.

`unit/ai.spec.ts` pins the order sequence (including the beat expiring on its
own 9.98 s before the brain was ever asked while it held);
`e2e/002/battle.spec.ts`'s rotation now watches the French pass their own
turn instead of clicking it away.

## The camera holds the blow, and never goes back to the shooter (2026-08-20)

Play: "выстрел должен держать камеру после попадания (или взрыва), щас
иногда сразу возвращается к свинье — возврата к свинье в оригинале вообще
нет." Both halves were real:

- **A gun never earned the beat.** The aftermath began only on `broke` and
  `blasted`, so a rifle shot that hit a pig — or the ground — snapped the
  camera straight home. The exe's wait runs after EVERY weapon use
  (`turns/aftermath.md`, one mode, one list); now `lib/game/bullets.ts`
  announces `shotLanded` wherever a bullet ends — body, ground, box, thin
  air — and the battle opens the same aftermath on it.
- **The end of the beat emitted `cameraReset`**, a teleport back to the
  shooter, and then WALK AWAY framed the old pig anyway. The exe's wait
  exits straight into mode 13 (0x495316 → 0x494570) with no return. Now a
  SPENT turn leaves the aftermath standing: the camera stays on the spot
  through the walk-away and the next pig's `focus` (or the mission's
  ending) is what clears it. The reset survives only for a blow that did
  not end the turn — a mine trodden mid-walk, a training break — where the
  same pig is about to be driven again.

And the wait's list grew the entry the exe always had (`0x47D800`, no pig
still busy): `corpses.live()` is in `settling()` now, so a kill is watched
through the dying clip, the sink and the boots before anything hands the
turn over — modes 15/16, "watching dying pig", by another door.

## THE DROP IS ITS OWN CONTROL SET — 2026-08-20

Play, the same evening the beat at the top of a turn grew a floor under it:
"нельзя пропустить парашуты как раньше — ты заблокировал." Exactly so, and the
floor only exposed it.

The turn's beat does not run its clock while the squad is coming down — the
battle returns out of its whole step for every frame of the drop — but
`game.starting` is true throughout, so the CONTROL SET during the drop was
`starting`, whose rule is "any key ends the beat and is then read again in the
set that follows". Cutting a canopy therefore went: press → `beginTurn` →
`startingFor = 0` → re-ask → `battle` → jump. It worked, and it silently spent
the GET READY card as well. Then the floor made `beginTurn` answer `false` for
the beat's first second — a second that never elapses while the drop holds the
clock — and the chutes could not be cut at all.

So the drop is a set of its own now, above `starting` and below `ending`: it
drives nothing and answers ONE key, the chute cut. Which is also what the exe
does with it — the parachute is its own mode there, and its canopy branch tests
the pad for a fresh press and nothing else.

### …and the specs the floor and the set caught out (2026-08-20)

The floor under GET READY and the drop's own control set between them turned
five specs red, and every one of them was the spec being right about the old
rules:

- `002/game-logic.spec.ts` and `000/engine-headless.spec.ts` called
  `game.beginTurn()` to skip the beat. That is a PLAYER's press now and the
  floor refuses it; the debug door is `cutTurnStart()`, and the one spec that
  is ABOUT the beat presses like a player and asserts the refusal.
- `002/battle.spec.ts` and `002/ramp.spec.ts` pressed a key the frame the card
  went up. They wait the floor out now, which is what a player does.
- `002/audio.spec.ts` sliced the heard-sounds list from a baseline the turn's
  own P_HMMM had not landed in yet — it WAITS for the bank if the bank is
  still loading, so its arrival is not fixed relative to a spec's baseline.
  Three tests there wait for the grunt before taking one.

**And one spec was already red and said so about something else.** The player's
own side has worn the TEAM's name since the campaign landed — side 0 is fielded
from the SAVE, everybody else out of `fetext` — and `002/battle.spec.ts` and
`002/hud.spec.ts` still expected the nation's TOMMY'S TROTTERS. Fixing that
uncovered two more expectations of the same age underneath it, because the test
had been failing before it reached them: `pow.swapMap` re-opens with no save
behind it, so after a swap every side IS named out of `fetext` again; and the
toolbar's walk-out of a CAMPAIGN battle lands on the SQUAD screen, not on the
menu. The test runs the whole way through now, which is also why it needed a
timeout of its own — it drives two map swaps and a machine turn.

### The drop ends INSIDE the step, one frame after the poll (2026-08-20)

Giving the drop its own control set cost a day's worth of hunting on its own,
and the lesson is about the ORDER of the frame rather than about parachutes.

The input poll runs in the SCENE's frame, ahead of the game's step
(`three/scene.ts`, `onInput`) — that is deliberate, so a press is read and acted
on in the same frame. But `dropIn.running()` goes false inside the step, which
means the poll that FIRST sees the drop over is the one a frame LATER. And a set
change that does not carry releases every driving key. So anything pressed
between the drop's last frame and the next poll was wiped: a pig stood on its
landing frame with W held down and never walked. Two specs said so
(`002/walkcycle.spec.ts` samples the clips a held W produces and got the get-up
and the idle; `002/ramp.spec.ts` walked nowhere) and a player would have said
so next.

Carrying the whole set out of the drop was tried first and is wrong: the LATCH
is a one-shot press, and one that arrived while the squad was in the air belongs
to the drop. So the two halves are separate now — leaving the drop keeps what is
HELD and drops the latch — and that is the only transition that wants the split.

## THE SERGEANT — 2026-08-20, off play's memory and found whole

Play: "потом сам свин который убил показывается и что-то говорится… этого вроде
нет сейчас — но должно быть — именно убить надо и тебя похвалят типо." It was
not there, it should be, and the arm turned out to be complete.

**The lead was in the install.** `Speech/Sku1/Sarge/` — 175 files, `SGEN{CC}{VV}
.wav`, 21 categories of eight short lines and a twenty-second of seven long
ones — and nothing in the remake had ever opened it. It is not a pig's voice:
the pig player `0x43AF70` has exactly four callers and all five of its
categories are placed (a shot, the top of a turn, getting up after a blast).
And these files carry **no language code**, where a pig's and the training
instructor's both do — one set, English, for every nation.

**`0x43B850` is `Sound::PlaySargeSpeech`.** Its own arithmetic, transcribed: 22
sections with anything past them clamped to nought and complained about
("eSpeechSection is wrong = %d"), a line passed whole when the range is −1 or
picked out of it at random, **a line past EIGHT spilling into the next
category** — which is how the "hurry up" pool of sixteen spans files 13 and 14
— and then `SGEN%02d%02d.wav`. It shares nothing with the pig's builder but the
audio manager: a separate hand-written body, different constants, different
`ret N`. The exe tells the two apart by a tag byte, and its "is he still
talking" test answers **3** for a Sarge line against 2 for a training one.

**Twenty-one call sites, all of them read.** Sections 4..9 are the crates by
item type, 10 and 11 are one-shot hints latched per battle, 12 is the clock
running down, 14..20 are the multiplayer pair chosen by the pig's own nation,
21 is the front end's — and the two this engine now builds:

- **section 2 → `SGEN03xx`, WELL DONE**, at the end of a turn in which you
  killed;
- **section 0 → `SGEN01xx`, BAD LUCK**, at the end of one in which you lost a
  pig.

**And the gate is about the SCORE, not only about the kill** (0x4983CD): the
praise wants your side strictly ahead on TOTAL TEAM HEALTH, the commiseration
wants it strictly behind. A kill from behind is met with silence. The exe's own
debug line names the comparison — "Current player health = %d. Min, Max Other
Players' health = %d, %d" — and the first draft of the headless spec proved it
by accident, killing one of five heavy gunners at 90 and hearing nothing,
because four of them still outweighed five grunts.

**The camera and the beat.** After the per-casualty death cams the exe pushes
its state, goes to **state 13**, points the camera at `[[turnController+0x4FC]
+0x10]` — the ACTING pig, the one that took the shot — in camera mode 3, and
plays `Pig::React(15)` or `React(16)` on it. Both of those are animation only,
a coin toss between clips 30/54 and 31/33, which is the other half of the voice
being the sergeant's alone. The state is released by asking whether he is still
talking, with a floor of 125 ms under it, and then the camera goes back to mode
4 and the pig makes its own turn-start noise.

Built the same shape: `lib/game/sergeant.ts` is pure (the tally, the health
comparison, the rotation, the file name), the battle counts the turn's dead by
side and opens the beat between the WALK AWAY and the handover, and the scene
pushes "is he talking" back into the rules the way it already does for a pig's
firing line. `audio/sarge.ts` speaks it.

**What is NOT built is nineteen categories, and only an EAR can place them.**
The lines carry no subtitles — neither text table holds a word of them — so
`pow.sarge.play(section, line)` is the console's way in, the same arrangement
`pow.sfx` has for the sounds whose names only play can settle.

### The other nineteen, HEARD — 2026-08-20, the same evening

The lines carry no subtitles, so `pow.sarge.file(category, line)` was installed
from the app's own start and play walked twenty-two of them. The full table is
in `docs/todo.md` P1; three things came out of it that belong here.

**The crates are a MEDAL ECONOMY, and the reader had no way to see it.** Six
categories are one crate each, sorted by the pickup type the exe switches on,
and five of the six talk about medals: 07 (types 2 and 14) awards one, 10 (type
8) awards one for beating the clock, and **08 — the arm the disassembly had
described only as "takes something off the pig" — TAKES A MEDAL BACK**, for
blowing up something that was not yours to blow up. 12 says what they are for:
collect them or you are not promoted. So a pickup type is a PP token, which is
the currency the save already carries and the squad screen already prints, and
the sergeant is that economy's voice. The exe's arm and the ear agree exactly
on 08, which is the strongest confirmation in the whole table.

**The two supply categories are the ones without a medal in them.** 05 (item
byte set) is equipment — "use it wisely"; 06 (item byte 0xFF) is MEDICAL, and
he complains about what bandages cost. 09 is the drop point being reached,
"here are some toys". So the three moments a crate can be are: you were given
kit, you were given health, you were given a medal.

**One reading was WRONG.** Category 22 had been written up as the front end
plus an idle nag; it is the **medal ceremony on the squad screen after a
mission**, over the award animation. The call site being in the front end still
holds, and so does the shape of the files — seven lines of 13 to 37 seconds
against 1 to 9 everywhere else, which is narration, not a bark. The idle-nag
half was an inference and is withdrawn.

02 and 04 came back as read: the goad when you are behind ("will you really let
these amateurs beat you?") and the flourish when you are ahead. They are the
same pair as 01/03 at the other end of the turn and are the cheapest thing left
to build, because `turnBegan` and `winOrLose` both already exist.

### The goad at the top of somebody else's turn — BUILT, files 02 and 04

Read on 2026-08-21, straight after the listening. **`0x497F80` is the
start-of-turn arm**, and its own first tests name the moment: a byte that says
he has already spoken this turn (`[turn+0x537]`), and `[turn+0x510] == 4` —
mode 4, the GET READY card, the same mode the side's music steps in.

**He speaks over somebody ELSE's turn.** The arm wants the acting controller's
kind to be **0** and a controller of kind **2** to exist beside it. Kind 2 is
the local human: it is the value the music tests before it plays (0x491208) and
the value the pig's own turn-start grunt tests (0x4724E5). The four controller
classes were found by their vtables — the kind is the slot at **+0x18** and it
is the only slot the four disagree on: `0x4BC690` returns 2, `0x4BC918`
returns 0, and `0x4BD400`/`0x4BD528` both return 1, the last of which is the
base every one of them is constructed through (0x498BB0).

**And the health value is the ACTING side's, not yours.** 0x498656 takes
`[turn+0x4fc]`'s own total (`0x4991A0`) and walks `[0x537F30]` comparing it to
every other side. So the enemy strictly ahead gets file 04 and the enemy
strictly behind gets file 02 — and both lines read that way round, "will you
really let these AMATEURS beat you" about a side that is losing, and "a victory
of legendary proportions" about a hole you would have to climb out of. One turn
in four: `rand()` with `test al,3` (0x4981A9, 0x49821E). The line rotates on
`[turn+0x53d]` and `[turn+0x53f]`, wrapping past eight exactly as 01 and 03 do.

**Two gates are read and NOT applied**, and they are honest about why. Both
arms also count the squad by the pig's own movement state — the `[pig+0x2ec]`
that 0x470C88 puts at 5 for a body in flight — through two routines that are
each other's mirror: `0x499070` totals the pigs whose state is NOT 8,
`0x4990A0` the pigs whose state IS. Which of those means "still standing"
decides whether file 04 wants you down to two pigs or merely under two losses,
and **state 8 has exactly one writer in the whole image** (0x468232), which is
too little to settle it. They are filters on top of the section and never the
choice of it, so leaving them out makes him speak more often, not wrongly.

**The builder's signature, now that every site has been read**:
`PlaySargeSpeech(section, lineLo, lineHi, volume, flag)`, pushed in reverse.
`lineHi == -1` means the line is taken whole; otherwise it is `rand()` in
`[lo, hi]`, which is how the crate lines and the two hints pick one of eight.
Every site passes volume 100 and flag 0. **0x495A9C is a TEST HOOK** — it plays
`rand() % 22` at a random line, the only site that does not name its section.

### Three things the same read settled, and none of them are built

- **The "hurry up" pool is MULTIPLAYER ONLY.** 0x4915E9 refuses unless
  `[0x5206F0] > 1`, the same global whose `== 1` is the single-player arm of
  everything above. It wants mode 6, a turn limit over 1500, and the clock in
  the window `limit-1000 < elapsed < limit-600` — hundredths, so **between ten
  and six seconds left** — then latches `[turn+0x539]` for the turn. Its
  counter is `[turn+0x540]` and it wraps past **16**, not 8, which is the pool
  spanning files 13 and 14 seen from the other end.
- **File 11 is gated on a MEDAL still lying about.** 0x49809E walks
  `[0x537FBC]`, the pickups, and looks for one whose type word is **2 or 8**
  with `[obj+0x30] == 1` — and 2 and 8 are exactly the two types whose own
  crate lines award a medal (files 07 and 10). File 12 is gated on the
  `[0x51ED90]` list holding an entry with `[+0x80] == 3`. Both latch for the
  battle (`[turn+0x53a]`, `[turn+0x53b]`), and there is an un-latched repeat
  arm behind them at one turn in four.
- **The medal counter is `[pig+0x1DE]`, and file 08 SUBTRACTS from it**
  (0x4AA3C6: `movzx ax, byte [item+3]; neg eax; add word [pig+0x1de], ax`).
  That is the whole economy in one instruction — a pickup's own value, taken
  off the pig that blew up what was not his.
