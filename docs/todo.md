# TODO — everything open, in the order it is worth doing

Written 2026-08-11 so the list survives a chat being compacted. **One item at a
time**, top to bottom; each one says what is already known, what is measured, and
what the next move is, so nothing has to be re-derived from the conversation.

Addresses like `0x467a10` are `warhogs_.exe`. Paths of the form `weapons/fire.md`
are in the **disasm repo**, never in this tree (see CLAUDE.md).

---

## A. THE TUTORIAL — finish the training ground

The script MOVES now: a crate collected speaks, a crate PLACED speaks, and the
menu counts (CLAUDE.md, "THE TRAINING SCRIPT MOVES"). The END of it is built too
(A1, done). What is left is one line and the camera.

### A1. Killing the last dummy must END the mission — DONE 2026-08-11

Play: "убить последний манекен — не заканчивает миссию… очевидно что заканчивает
миссию." Read end to end and built; `lib/game/endOfGame.ts` is the rule and
`tutorial/notes.md` + `turns/notes.md` the derivation.

**Nothing watches for a win frame by frame.** `Game::NextTurn` (0x48F490) asks
0x4966A0 for the state of the game before it advances anybody, so a mission ends
at the HANDOVER and never before — the dummy comes apart, its crate lands, the
beat at the end of the turn runs, and only then does anyone notice there is
nothing left to break. That timing is kept.

**What the training branch counts**: the object list, for a breakable (body type
0x135A) whose `[obj+0x84]` is `0x43..0x47` or `0x4B`. That field is the name
table's index **minus 0x1C** (written at 0x48D076), so the six kinds are TARGET,
TARGET2..5 and **DUMMY** — and pointedly not `T_SUP`/`T_SUP2`/`T_SUP3`, the
stands they are mounted on, though all nine share the one-point health row. CAMP
carries eleven DUMMY records and none of the TARGET family. The test never looks
at the placed flag, so the eight the script holds back count as standing from
load. A training level cannot be LOST, either — the branch has no such answer.

**The ending itself is mode 2, END OF GAME**: the clock stops, nothing is driven,
the camera walks the survivors one every two seconds (`0x490EFF` stamps `+0x4BC`
forward by exactly 0xC8), and past **three seconds** any key — or **twenty** on
its own — puts the battle away (mode 18, QUIT). The sergeant signs off with clip
**27** if it took more than twelve turns and **28** otherwise (`[+0x40C]`, the
handover count).

**Two of the four "closers" turned out to be nothing of the kind**, and the
todo's own premise was wrong about them. Both are BUILT now:

- clip **21** is the first MINE going off — its call site is the projectile
  constructor, gated on ammo rows 0x28/0x29 (the two `WE_APMIN`), so it answers a
  mine trodden on or hit by something thrown alike. Its flag `[+0x330]` is the
  other way up from what it looks: the game object is built with it SET, each of
  the two MINEFIELD crates CLEARS it as it speaks its own line (0x465D72,
  0x465DBD — the health×15 and ×20 arms), and speaking sets it back. **Once per
  minefield, and only after being told to walk into one.**
- clip **26** is a turn whose clock ran out with **no weapon used**. `[+0x334]`
  is incremented by the fire dispatcher, zeroed at each handover but only from 1
  or less, and the line writes **2** — the one value the reset refuses, so it is
  once a level.

`armsMineLine`/`MINE_LINE`/`WASTED_TURN_LINE` in `lib/game/tutorial.ts`,
`weaponUses` in `lib/game/battle.ts`, and the `turnWasted` event. One half of the
exe's guard is not modelled and says so at the field: it drops the wasted-turn
line while the sergeant is talking and lets it come round later, where the remake
counts it said.

**What is NOT pinned**: the honest eleven-dummy path. `e2e/000/engine-headless.spec.ts`
drives the whole seam — handover, ending, the three-second hold, the battle being
put away — on a CAMP built with its DUMMY records left off, because reaching the
condition legitimately is the entire tutorial. `e2e/002/endOfGame.spec.ts` pins
the data around it.

### A2. Clip 4 — the last line of the script — DONE 2026-08-11

"PRESS SPACE TO SELECT YOUR WEAPON", and the field it hung on was the MENU: the
game object's first 0x300 bytes ARE the skill menu, sixty-four cells of twelve
(skill, amount, a 1-or-2 flag). `0x492FD0` clears the block in one 4×16 loop and
`0x468BD0` fills it from the pig's own list — which is why the same
`mov eax,[esi]` two instructions earlier decides whether the cursor is put back:
an empty first cell is an empty menu. So `[gameMode+0] == 3` is **the bayonet
sitting in the first cell**, and the line is "the menu has just been opened, the
counter is still at nought, and the first thing in it is the bayonet".

`clipForMenu` in `lib/game/tutorial.ts`, the `menuOpened` event carries the first
cell, and `e2e/002/tutorial.spec.ts` now hears 3 → 4 → 5 → 6 in order on the real
map. All 28 clips of the script now have something that fires them except the two
that were never closers — clip 21, the first mine, and clip 26, a turn spent
doing nothing (both read, neither built).

### A3. The camera looks the pig in the FACE under the canopy — ALREADY BUILT

The entry was stale. `three/chase.ts` has the view (`FACE_LIFT`, and `watch`
picks `'face'` while `underCanopy` is up) — the chase rig turned around, level
with the pig rather than over its shoulder. What is true is the disasm note's own
sentence: **nothing in the exe has been traced for it**, so the framing is the
remake's own and play is what corrects it.

---

## A0. WHAT ONLY PLAY CAN ANSWER NOW (2026-08-11, after the batch)

Nothing here is a job; it is the list to walk through on the next run, because
each one is either eyework or a rule that came from play and can only be judged
by play. In the order they turn up:

1. **The ENDING.** The last dummy stops the turn going round; the camera tours
   the survivors, two seconds a pig; "MISSION ACCOMPLISHED!" on the card; the
   pigs are empty-handed and dance clip 46; three seconds before a key does
   anything, twenty before it leaves by itself. Which of clips 27/28 is the
   congratulation is LOCATED and not heard — under twelve turns you should get
   28.
2. **The FADE.** Nothing should vanish any more (that was `alphaTest`, not the
   opacity). A wall between the camera and the pig fades; a dummy, a tree, a coil
   of wire or the bridge he is standing on should not. `SEE_THROUGH` is 0.4 —
   `pow.hud` has no knob for it, so say the word and it moves.
   **2026-08-12**: the second half of that — "становятся прозрачными вещи,
   которые не перекрывают свина" — was the MARGIN, which grew every box by half
   a tile before the test. It is gone; the rays go to nine points of his own
   silhouette and a box has to cover five of them (lib/game/seeThrough.ts). What
   to watch for now is the OPPOSITE failure: a wall that hides him and does not
   fade. The knob for that is the majority in `crossedTowards`.
3. **The LENS**: `pow.hud.layout.gauge.lens.fill` — it is 1 against a disc that is
   measured (rows 2..29 of `pcpie4`), so a grenade shows half of the red. If it
   still reads as three quarters, that field is the one to type at.
4. **The SHOT waits for the line.** Fire, the pig speaks, and only then does the
   bullet leave.
5. **The DOOR** takes no input while its clip runs, and the pig stands still for
   the first half of it before the leap carries him.
6. **TNT** should be escapable now: the rim is the range, so past about 2100
   units nothing at all.
7. **The ROCKET**: nose along its flight, and its smoke six a frame (twice a
   grenade's) drawn bigger and thicker than the row asks. Fire does not set it
   off in the air any more.
8. **THE THROWN WEAPON'S TWO CAMERAS (2026-08-12) — both read off the exe.**
   Take a grenade or the bazooka in hand and the camera changes on the spot:
   `0x493BB0` dispatches on the skill and asks for **mode 4**, whose row
   `0x49F6F0` stamps to **3500** for anything thrown (1500 for a blade, nothing
   at all for a gun). Hold **G** and it comes in to the **TR cam, mode 0x12** —
   200 out, 400 up, nominal 1700 — close over his back. **The fire button does
   not touch the camera**; it did for one commit and that was the bug. The knobs
   are `LOB_CLOSE`/`LOB_RISE` and `THROW_CLOSE`/`THROW_RISE` in three/chase.ts,
   and `pow.debug.view()` says which is live. Two things not modelled: mode 4's
   lift on the branch a thrown weapon takes is not read (the +300 the remake uses
   is its other branch's), and the exe lets the player PITCH the TR cam (±700 of
   4096, `[cam+0x76]`) where nothing here is bound to a camera pitch.
