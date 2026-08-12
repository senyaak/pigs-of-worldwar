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