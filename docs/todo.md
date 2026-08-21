# TODO — everything open, in the order it is worth doing

Written 2026-08-11 so the list survives a chat being compacted. **One item at a
time**, top to bottom; each one says what is already known, what is measured, and
what the next move is, so nothing has to be re-derived from the conversation.

Addresses like `0x467a10` are `warhogs_.exe`. Paths of the form `weapons/fire.md`
are in the **disasm repo**, never in this tree (see CLAUDE.md).

---

## P0. PLAY'S LIST, 2026-08-20 evening — **ALL SIX DONE 2026-08-20**

Written down at play's request to survive the chat ending. Everything below is
a report from a session, in play's own order; the numbers at the end are ones
play tuned live in the console and they are the ANSWER, not a starting point.

**Three of the six turned on a READ that had never been done**, and two of
those came out against what this list assumed — see P0.2 and P0.4. Everything
here is built; what is left is play's ear on it.

### P0.1 The battle plate wears the WRONG FONT — put BIG back, just smaller ✔

**Reverting a decision made earlier the same day.** The plate had been moved to
`SMALL` at ×2 after play called BIG too big; play then saw it in the game —
**"не тот шрифт! верни тот что был — но просто сделай меньше его."**

`PLATE_FONT = 'BIG'` and `LAYOUT.plate.scale = 0.75` (`ui/hud.ts`). The two come
to the SAME height — BIG's 32 at 0.75 is 24, exactly SMALL's 12 at 2 — so only
the letterforms changed, which is what was asked. The heart keeps a scale of
its own (2) and no longer follows the letters'. A fraction softens a bitmap
glyph; if that reads badly the knob is `pow.hud.layout.plate.scale` and the
clean fallback is 0.5.

### P0.2 A BAYONET does not throw the body it hits ✔ — and the READ corrected this entry

**This entry named the wrong routine.** The melee does not go through
`0x4A9260`; it goes through **`0x4A9100`**, and the difference matters —
0x4A9100 SETS the velocity where 0x4A9260 ADDS to it. Disassembled 2026-08-20:

- `Pig::HitByHandToHand` is **0x4785C0** (0x478618 is the `shl eax,7` inside
  it, damage into 128ths). Its five-way switch carries damage AND knockback:
  trotter 15/100, knife 15/125, **bayonet 10/75**, sword 25/150, prod 25/200.
- 0x4786c1 calls `0x4A9100(knockback, 0x200, bearing, 0)` — 45° up, along the
  attacker's own line to the body, which is the same local the 67.5° cone test
  measures the swing by.
- 0x4786c8 then calls **0x470C70**, which puts the victim in movement state 5
  and plays **clip 38** — the FLYING clip, not the bounce. State 5 returns out
  of `UpdateMovement` immediately, so a struck pig is not driven until it lands.
- **The BLAST has no impulse in its damage arm at all** (0x477C22), so the
  remake's `FLING_PER_POINT` is still an invention and the melee's is now READ.
  On one scale a bayonet is **5/12 of a grenade at the core** and the cattle
  prod's 200 is exactly `FLING_CAP` — the hardest swing throws a body as far as
  TNT, which is the reading agreeing with itself.

Built: `melee.ts`'s `knockback` column is live, `StrikeWorld` grew an optional
`fling` beside `BlastWorld`'s, and the throw carries an `ejected` flag through
`battle.fling` → `tumbles.fling` so the body wears clip 38 rather than the
bounce.

**One correction for the disasm repo**: `weapons/melee.md:286-288` says a set
`[target+0x3B2]` diverts the whole thing to 0x4760f1 with no damage. It does
not — at 0x478627 the damage has already been dealt, and that branch only
un-HIDEs and falls through to the impulse.

### P0.3 There is no MUSIC on a level ✔ — and the trigger is the TURN

The install ships `MUSIC/Track02.ogg`..`Track32.ogg`, 31 Ogg Vorbis files that
Chromium decodes unaided. The game reaches them through a CD: the exe sends MCI
`cdaudio` commands and the install's own `winmm.dll` — a MinGW shim, not
Microsoft's — turns a track number into `MUSIC\Track%02d.ogg`.

- **`0x43b4c0` is `Sound::PlayMusicClip`**, named by its own complaint at
  0x4c2ab4 ("ERROR:Music clip requested is out of range"). It clamps 0..29 and
  turns a clip into the MCI pair `(clip+3, clip+4)`, so clip N is `Track{N+3}` —
  the thirty clips land exactly on Track03..Track32 and Track02, the only long
  piece at 171 s, is the front end's.
- **A side owns FOUR clips and takes one A TURN.** Disassembled at 0x491222,
  inside mode 4 (the START OF TURN card) and only on the arm the local human's
  controller takes: `clip = counter + 4·[pig+0x1e9]`, volume 0x46, then the
  counter steps 0..3. It does not loop and a finished track is not chased with
  another: a thirteen-second sting at the top of your turn, then quiet. That is
  why the folder's pieces are short.
- `[pig+0x1e9]` is `[squad+3]` (written at 0x466b42) — the same byte the
  pig-voice path reads as its LANGUAGE, beside `[squad+2]`'s VOICE. What fills
  the squad record has never been read, so WHICH set of four a side owns is
  `[CHECK — remake]` exactly as its voice is. `pow.music.play(n)` hears any of
  the thirty; `pow.music.now()` says which is sounding.

Built: `audio/music.ts`, a MUSIC bus under the master in `audio/bank.ts` (so the
pause freezes the track mid-bar and the master knob reaches it, which is what
0x43C720 does), wired in `audio/battleSound.ts` off the new `turnBegan` event.
`e2e/002/audio.spec.ts` drives the whole road.

### P0.4 The turn's opening BARK, and a beat before GET READY ✔ — the bark is the OTHER way round

**The read went against play's guess, and the arm is not ambiguous.** Play
thought only the player's own side says a line. `Pig::React(7)` (0x472320,
case 7) splits on whose CONTROLLER the acting pig has, `cmp eax,2` at 0x4724e5:

- **anybody else's pig SPEAKS** — 0x47256B calls the voice player with
  **category 0**, which is not a category but the builder's signal to pick the
  line off the pig's HEALTH (0x43b1e3): above 0xC80 (25 points) lines 1–2,
  above 0x500 (10) lines 3–4, below that 5–6. `category++` makes every one of
  them file **01**, the category `speech/pigs.md` had never placed. The line
  inside a band alternates on the squad's byte 4, over two.
- **your own pig only GRUNTS** — 0x4725be plays **69 P_HMMM** at 60/90+rand&15,
  no words at all — and the side's MUSIC steps instead (P0.3). So the thing you
  hear on your own turn is the music; the thing you hear on theirs is a pig.

That also completes the taxonomy: category 01 is the top of a turn, 02/03 is
firing, 04/05 is getting up after a blast. And there are only FOUR callers of
0x43AF70 in the whole image.

**GET READY takes a key too early** ✔ — `TURN_START_FLOOR_SECONDS = 1` in
`lib/game/game.ts`. `beginTurn()` now answers `false` for the beat's first
second and `startingSettled` says whether it will take an answer; the floor is
in the rules, so the timeout, the pad and the pause button all wait it out. The
SPECS' own door is `cutTurnStart()`, which skips the floor with the beat — a
suite this size cannot pay ten seconds a turn for a card it is not testing.

Built: `turnBegan` on the bus (`lib/game/events.ts`), announced where a turn
actually starts — the handover, and the frame the opening drop lands — rather
than polled off `game.starting`, which a cut beat can skip past. `PigVoice.turn`
carries the health bands; the grunt is `BATTLE_SOUNDS.ready` and WAITS for the
bank if the bank is still loading, or a battle's first turn would be silent.

### P0.5 `pigpro` belongs BEHIND the columns ✔

`ui/playerScreen.ts` draws the board FIRST now, so the two column panels stand
over its edges. **This is deliberately NOT the arm's order** — 0x41DB85 blits
`pigpro` last, in front of everything — and it is play's ruling; the note says
so where the change is.

### P0.6 The numbers play tuned live ✔ — pasted in

- **START MISSION**: `options.rows = [385]` (48 under the tail's own 337) and
  `options.text = -14`, fourteen above the plate's middle.
- **The name**: `columns[0].name` is `{ x: 157, y: 21 }`. The right column was
  not measured; it takes the left's own relationship to the badge (`badge.x −
  4`, the same y) rather than staying at the portrait it was just moved off,
  and is flagged `[CHECK — remake]`.
- **The class badge** wanted a different y per ROW, so it IS a table now:
  `LAYOUT.badgeRows = [43, 43, 41, 42, 44]`, beside `rows` and `selectorRows`
  because it is the SLOT's number and both columns read it. The per-column
  `badge.y`/`stripes.y` are gone; the trapezoid and the stripes ride the same
  table. The right column's three were not measured either and take the same
  numbers.

### What is left on this list

Nothing to build. Three things want play's EAR or EYE:

- the plate at 0.75 — softness, and whether 0.5 reads better;
- which set of four the music should play (`pow.music.play(0..29)`), the one
  thing about it nobody has read;
- the SQUAD screen's right column — the badge rows and the name box, neither
  of which play measured.

---

## P1. THE SERGEANT — **HEARD AND PLACED 2026-08-20**, and he named a system

Two of his 22 categories were built off the exe alone (a kill, a loss —
`lib/game/sergeant.ts`). The other nineteen had their MOMENT read and their
WORDS read by nobody: the lines are never printed, neither `gtext` nor `fetext`
holds one, so listening was the only way. Play listened the same evening and
the table below is what he heard, against what the exe had said.

```
pow.sarge.list()          // what each of the 22 is
pow.sarge.file(3, 1)      // hear SGEN0301 — the praise for a kill
pow.sarge.play(2, 1)      // …the same line by the exe's own SECTION argument
pow.sarge.stop()
```

`file` takes the FILE's number, which is what the folder shows; `play` takes
the section, which is one lower and is what the exe's call sites pass.

| file | the moment (READ) | what he SAYS (heard) |
| --- | --- | --- |
| 01 | end of turn, you LOST a pig, behind | **built** — a threat: one more loss and he has your guts |
| 03 | end of turn, you KILLED, ahead | **built** — you and your boys have no equal |
| 02 | START of a turn that is not yours, THEY are behind | **built** — "will you really let these amateurs beat you?" |
| 04 | START of a turn that is not yours, THEY are ahead | **built** — "a victory of legendary proportions" |
| 05 | an OBJECT finished, action kind 13, value byte not 0xFF | a SUPPLY drop — useful equipment, use it wisely |
| 06 | the same, value byte 0xFF | MEDICAL supplies — bandages cost money, do not waste them |
| 07 | action kind 2 or 14 — a medal dropped at the record's own spot | "I am so impressed I am dropping you a medal" |
| 08 | action kind 4 or 16 — `[pig+0x1DE] -= value`, one instruction | a MEDAL TAKEN BACK — "I told you not to blow that up" |
| 09 | an object finished and its LINK partner found (0x4A7600) | the DROP POINT reached — "here are some toys". **Built on the PROPOINT** `[CHECK — remake]` |
| 10 | the same arm, the other branch | a MEDAL for doing it IN TIME — "a big fat medal" |
| 11 | start of turn, ONCE a battle | there may be things lying about, medals included |
| 12 | start of turn, ONCE a battle | collect medals or you will not be promoted |
| 13+14 | the clock running out, ONE pool of sixteen — **MULTIPLAYER ONLY** | "tick tock, get a move on" / "time is of the essence" |
| 15..21 | MULTIPLAYER, by nation: 1..4 praise, 5..8 commiseration | 16 confirmed as praise; the other six unheard |
| 22 | **the exe's front-end arm** | **NOT an idle nag — the MEDAL CEREMONY on the squad screen after a mission**, played over the award animation |

**The ear found a SYSTEM the reader had missed: there is a MEDAL ECONOMY, and
12 says what it is for — *collect them or you are not promoted*.** Five of the
six categories talk about medals: given (07, 10), refused, taken back (08).

**What they hang off was got WRONG here first and is corrected below**: these
are not the weapon crate. They are an OBJECT being finished — a gun, a tent, a
pillbox — through an action record the ordinary crate never gets. See "The
OBJECTIVES machine" further down; the medal counter is `[pig+0x1DE]`.

**One reading was wrong and is corrected.** 22 was written up as "the front end
and its idle nag after twelve idle ticks". Play placed it as the ceremony after
the first mission, on the squad screen, once the award animation has run —
which is consistent with the call site being in the front end, and its seven
lines being 13 to 37 seconds long where every other category runs 1 to 9. The
idle-nag half of that entry is unproven and should not be repeated.

**02 and 04 are BUILT** (2026-08-21) — `sargeAtTurnStart` in
`lib/game/sergeant.ts`, emitted from `announceTurn` in `lib/game/battle.ts`,
pinned in `unit/sergeant.spec.ts`. He speaks over the top of a turn that is not
yours, one turn in four, about how the side that is MOVING stands. Two count
gates in that arm are read and deliberately not applied; the reason is written
where the code is.

**What is left, and what each one is really blocked on:**

- **05..10 — the CRATES, and this is the real item.** Not blocked on the
  sergeant at all: the remake has no medals and no pickup TYPE, only a crate.
  The exe's shape is now known end to end — a pickup carries a type word and a
  value byte, the pig carries the tally at `[pig+0x1DE]`, and file 08's own
  call site is the instruction that SUBTRACTS one from the other. Build the
  economy and six of his categories fall out of it.
- **22 — the ceremony after a mission**, which needs the medals above before
  there is anything to award.
- **11 and 12** — one latch each per battle, but their gates are the medal
  crates again: 11 wants an uncollected pickup of type 2 or 8 still on the map,
  12 an objective of kind 3. They come with the crates, not before.
- **13+14 — MULTIPLAYER ONLY**, and that is read rather than assumed
  (`[0x5206F0] > 1` at 0x4915E9). The window is ten to six seconds left on a
  turn limit over fifteen seconds, once a turn, out of a pool of sixteen. It
  belongs with the net work, not with the campaign.
- **15..21** — multiplayer, one file a nation.

So the sergeant is FINISHED for the single-player campaign as it stands today:
what is left of him is either the medal economy or the network.

**The gate on 01 and 03 is worth remembering before judging the others**: the
praise is refused unless your side leads on TOTAL TEAM HEALTH, so it is not
heard after every kill. The whole chain — the builder at `0x43B850`, all 21
call sites, the camera and the beat — is in `docs/history/turns.md`.

---

## P2. THE SOUND BANK, IDENTIFIED BY EAR — 2026-08-21, and nine of them are unwired

Ninety-nine entries and the exe names them by NUMBER, so what a file IS was
always a guess from its name. Play walked all thirty-seven that are neither a
footstep nor a pig and said what each one is; the table lives where the wiring
is (`src/renderer/src/audio/battle.ts`, above `BATTLE_SOUNDS`) with the
measured length beside each.

**The one that settled the day's question**: there is NO burning fuse in the
bank. `BG_GAS` is the gas grenade — "газовая граната так делает" — and
`L_FLAME` is napalm going off, not something burning steadily. So a planted
charge is heard as its TIMER and nothing else, and the entry that had borrowed
the gas is gone rather than left wrong.

**What is placed and wired to nothing**, roughly in the order it would be worth
doing:

- **`S_CLOCK` is the TURN CLOCK starting to run out** — "также когда время
  кончаться начинает вроде". We play it for the charge's timer and nowhere for
  the clock itself, which is the thing it is actually for. One listener on the
  turn clock crossing its warning mark.
- **`I_BUILD` against `I_BULIT1`/`I_STAB`**: a round hitting a WALL against a
  round hitting MEAT. The engine already knows which it hit (lib/game/bullets.ts)
  and plays neither.
- **`I_METAL`** — a blast inside a bunker, a tank, a stationary machine. The
  engine knows a pig is indoors (lib/game/indoors.ts).
- **`I_SWMISS`** is a swing that MISSED, and it is currently wired as the
  grenade's `whoosh`. Two moments, one sound; the swing's own miss is decided
  in lib/game/strikes.ts.
- **`S_UNHOLS`** — putting a weapon away, which the last bayonet and every
  weapon swap already do.
- **`BATT_L1..3` and `BATT_S1..3`** — the battle going on somewhere else, three
  long and three short. Ambience nothing schedules.
- **`AMB_1D`/`AMB_2D`** — a falcon and another bird.
- **`EN_BIP`** — the AIRSHIPS that fly over a map, and **play notes we have
  none**: "дережабли летают на картах - их кстати щас нет вроде". That is a
  missing PROP before it is a missing sound.
- The weapon reports we do not field yet — `L_ARTIL`, `L_MORT`, `L_ROC`,
  `L_SHOTG`, `L_HVYMG`, `L_MGUN`, `L_FLAME` — one line each the day their
  weapon lands (`BARREL_SOUND`).

---

## 0. THE CAMPAIGN'S SPINE — a save, then NEW GAME and LOAD GAME

Play's order, 2026-08-13, and it is the next thing to build. The frontend is
the expensive half of this project because every screen has to be
disassembled first; the SAVE is not — it is ours, and only what a player sees
has to match the original.

**What the save holds** (play's list): which missions are done, the chosen
army, the team's name, every pig's name and rank, and the PP tokens. There is
no SAVE TEAM screen in our version — it **autosaves**.

**It lives in the APP's own folder** — `saves/` at the root of the checkout in
development, gitignored, and beside the executable in a packaged build
(`path.dirname(app.getPath('exe'))`; electron-builder installs per-user, so
that is writable). `POW_SAVE_DIR` overrides it, and the e2e fixture points
that at `_tmp/` so a test run never touches a real save.

Play settled this against a first draft that said `userData`, and each of that
draft's reasons was answered: a file in the working tree is what `.gitignore`
is for; a save PER CHECKOUT is a feature, not a hazard, because playing the
`net` worktree then leaves the master save alone; and next to the executable
is the same idea as next to the start script. The one thing left to know
rather than to argue: a machine-wide install into `Program Files` would not be
writable, and that is where a fallback to `userData` would go — one line, if
it ever happens.

**What the original keeps, for the shape to grow toward.** A team is a
**680-byte record**: six of them sit at 0x51F128 with a stride of 0x2A8, and
`savearmy0` in the install is exactly one of those dumped — 680 bytes, whose
pig names decode with the frontend's own `+0x1F` shift (JONES, DEN, BASIL…),
laid out as a 160-byte header and eight 64-byte pig records. We do not have to
read or write that file, but our own shape should be able to hold everything
it holds.

**Every MAP is read; the CAMPAIGN is not.** 59 map names live behind a pointer
table at 0x4D1990: ROAD, TRENCH, RUMBLE, DEVI, TWIN, ZULUS, SNIPER, GUNS,
OASIS, MASHED, CAMP, LIBERATE, MEDIX, FJORDS, EYRIE, BRIDGE, BAY, DESVAL,
SNAKE, EMPLACE, KEEP, SUPLINE, TESTER, FOOT, FINAL, ESTU, DEMO, BOOM, BHILL,
LECPROD, DVAL, ICE, BUTE, MAZE, SEPIA1, DBOWL, MLAKE, CMASS, ARTGUN, DVAL2,
HELL3, HELL2, LUNAR1, CREEPY2, PLAY1, PLAY2, ICEFLOW, RIDGE, ARCHI, DEMO2,
ISLAND, LAKE, ONEWAY, then the six GEN\* skirmish maps.

**That is every map, not the campaign — and the campaign is 26.** Read
2026-08-13 (`army/notes.md`), now `lib/game/missions.ts`:

- the 60-byte records at 0x4D5210 are the **weather block** and nothing else:
  sky index, fog and its colours, copied whole into 0x520708 when a map is
  entered (0x41A552). No briefing, no PP award, no campaign order in them.
- **map id 10 is CAMP and the loader special-cases it on the spot**
  (`cmp eax,0Ah` right after the copy) — the training ground.
- **the order is 26 dwords at 0x4D17F0**, indexed by ONE BYTE in the save
  (`team+0x53`) which the end-of-mission arm steps and the campaign ends at 26.
  Every id 0..24 appears once — so "names 0..24 end at FINAL, the right shape
  for a campaign of 25" was one short: ESTU (25) is position 1.
- **a mission's display name is `gtext 11 + mapId`**, the one thing here taken
  from the data rather than from code, and the training ground proves it —
  `ui/titleCard.ts` had BOOT CAMP hard-coded at 11 + 10 already, and CAMP's id
  is 10. The card names every campaign map now.

~~**Every mission opens CAMP for now**~~ **NOT ANY MORE, 2026-08-19** — the
campaign opens its own level now, and every one of them was measured open.
Section 0A has the sweep and the one bug it turned up.

### The order to do it in

1. ~~**One READ first**: when a pig dies, does a new one take its place?~~
   **DONE 2026-08-13 — YES, and the roster is a LIVE LIST OF EIGHT.** A killed
   pig's slot empties; the last two to fall get up again with their name and
   stats (0x450970); every slot still empty is drafted into by 0x482810, which
   names the newcomer `DRAFT<n>` (`fetext` 0x113 and a per-team counter) and
   puts it at the BACK, survivors closing up in front. So no headstones — a
   name that leaves never comes back. `lib/game/roster.ts`.
   **And the MANUAL confirmed it the same day** — `manual.pdf` is a scan with
   no text layer, but `manual.txt` beside it in the install is the text: "Lose
   three swine on one level and the first to die is gone for good. Lose four of
   them and the first two shall never return." That is `v >= holes - 2`
   exactly, so `pig+0x2C` is the order a pig fell in and `RETURNING = 2` is
   read, not inferred. It also gives **five of the eight go on a mission**
   (`FIELDED`), and losing all five is the mission LOST and replayed.
2. ~~**Find the CAMPAIGN's own list**~~ **DONE 2026-08-13** — above, and
   `lib/game/missions.ts`. What each mission is WORTH is still not read; the
   save carries `tokens` for it.
3. ~~**The save itself**~~ **DONE 2026-08-13** — `lib/game/save.ts` (pure: the
   shape, `newGame`, `finishMission`, `serialise`/`parse`), `src/main/saves.ts`
   (the folder and four operations, text in and text out — the main process
   never parses a save), the IPC and the bridge, `unit/save.spec.ts`.
   ~~The autosave has nowhere to be called from yet~~ **it has now — item 4's
   last bullet.** The shape grew `tutorial` (2026-08-17), backfilled false by
   `parse` so older files still read.
4. **NEW GAME** — the chain, screen by screen. **ONE PLAYER (record 14, kind 1)
   is DONE 2026-08-13** — `ui/onePlayer.ts`, a list of two bars on the machine
   we already had, NEW GAME live and LOAD GAME dark; it does not replay the
   entrance, which is its family's own behaviour. What is left:
   - ~~**SELECT TEAM** (record 3, kind 2)~~ **DONE 2026-08-13** —
     `ui/teamScreen.ts`, the frontend's SECOND layout and the first screen here
     that is not the machine. Read blit by blit first, which paid: the old
     summary was wrong in three places. A console with ONE window in it — one
     `selec` emblem at (298, 170) and one `lit` lamp at (537, 202), changing
     FRAME rather than position, five frames a row with a click on the one that
     lands — the six names in the console's own boxes, a static `selcog`
     carriage, one track rather than two.
     **Three things play saw against the shipped screen, 2026-08-13**, two
     fixed and one open:
     - ~~the lamp stayed at the top while a lower name was lit~~ **fixed** —
       both brackets take their y from widget 0's FRAME and SLIDE down the list
       with the selection, 0/22/46/70/92/116 against the text rows' own
       0/22/45/70/92/115. The notes had them as fixed positions.
     - ~~the first frame was the SETTLED screen and the entrance played after
       it~~ **fixed** — the canvas still held the last frame drawn before
       `leave()`, so `enter()` paints the un-arrived state before the first
       tick now.
     - ~~the PIG on the left is missing~~ **DONE** — a MODEL on the ordinary
       `ensureScene`/`buildPig` path, rendered to a canvas of its own and
       blitted into the frontend one (`three/frontendPig.ts`): **`pchvy_hi`**
       out of `Chars/british.mad`, clip 27 idling, and the nation's skins
       swapped on a row change. Where it sits is `[CHECK — remake]` and
       nudgeable; WHICH model is not — see the hats below.
     - ~~their HATS should differ~~ **DONE** — each nation has its own hat
       MODEL in `Chars/FHATS.MAD` with `FHATS.MTD` for the skins. **The
       archive's own order is `br_hat, am_h, frhelm, germh, rus_h, ja_ban,
       pur_hat` — SKIN order, not the nation's**, which this entry had wrong;
       the exe indexes its cache by the skin straight (`army/skins.md`), and
       `lib/game/nations.ts` holds the one list both screens use. It hangs off
       **bone 2, the head** — which `three/heldWeapon.ts`
       had already decoded from the engine's three attachment slots, weapon on
       bone 5 and hat on bone 2, the bone's whole matrix and no offset. Probed
       across the six: the silhouette's topmost row comes out 26/20/21/17/20/15,
       six different hats.
     - ~~the hat CENTRING is `[CHECK — remake]`~~ **READ, and it was never a
       centring.** The exe turns every attachment HALF a circle at load —
       `afSetObjPos(obj, 0,0,0, 0, 0x800, 0)` at the end of both the hat loop
       (0x486340, `chars\fhats.mad`) and the weapon loop (0x486443,
       `chars\weapons.mad`), against a whole circle of 0x1000 — and the pig's
       body constructor never calls it. So the half turn `three/heldWeapon.ts`
       had measured its way to is the exe's own, and a hat gets the same one.
       Untorned `br_hat` boxes x −197..61 against a head at x −25..221, i.e.
       behind the skull, which is what play saw as "on the belly"; turned it
       boxes x −49..209 and lands on it. `frontendPig.ts` turns and does not
       centre. `frontend/notes.md` carries the whole chain, exe to dll.
     - ~~TWO hats: the model carries its own~~ **READ — and it was the wrong
       MODEL, not a group to hide.** Play, 2026-08-13. Every class does carry
       its headgear in the mesh as one texture group (the grunt's `GR_H000.TIM`
       is 48 faces on bone 2, and that texture is 92% uniform khaki, so it is a
       hat and not a head) — and nothing in the drawing path ever drops a
       group. **The heavy gunner is the one model with a bare head**, which is
       exactly why the engine hangs a nation hat only when the kind is 2:
       SELECT TEAM forces class 1, the table at 0x4C2E50 turns that into kind
       2, and the dll's registry gives kind 2 the `pchvy` triple, near level of
       detail at the frontend's z of 1000. `frontendPig.ts` draws `pchvy_hi`
       now. `frontend/notes.md` carries the chain link by link.
     - **the rest of the MACHINERY is missing too** — the original carries a
       good deal more moving metal round the console than we draw. Not read.
   - ~~**PLEASE NAME YOUR TEAM**~~ **BUILT** — `ui/nameScreen.ts` on
     `lib/game/nameEntry.ts`. The rules are all read: the alphabet is `fetext`
     0 and the cursor is an index into it, the three past its end are DELETE,
     SPACE and ENTER, a team name is eleven characters and a pig's seven, the
     field pads with dots, and ENTER refuses an empty name. What is left on it:
     - ~~the GRID's shape is `[CHECK — remake]`~~ **`[play]` settled it**: seven
       letters across, six rows down, and the three keys as an EIGHTH column on
       the same plate — a screenshot of the shipped game, which the disassembly
       could not give because 0x431380 computes the shape from two font metrics
       filled at runtime. Which PLATE they sit on is read now and it is not the
       one the aspect argument picked: the plate is **widget 18's**, whose seven
       frames are `alpha02..08` and which the entrance walks 0 → 6, so the panel
       UNROLLS and comes to rest on **`alpha08`, 304×352 at (168, 32)** — dead
       centre of the screen. Where the letters sit ON it is bounded now by the
       art rather than by the plate: play, "буквы больше чем границы этого
       экрана" — the grid was spread over the WHOLE plate, so the last column
       and the three keys sat on the gold frame and past it. `alpha08`'s dark
       window, scanned for pixels under 115 in every channel, is **x 29..260,
       y 100..332** of 304×352, which lands at 197..429 on screen and centres
       on 312 against the screen's 320; the grid goes in there, with 3 pixels to
       spare on the widest piece. The SPREAD across it is still the remake's own
       (`INNER`), and the arm that would settle it is READ now without
       settling it: 0x43148C centres each glyph in a cell whose size is the box
       of one particular GLYPH — `` ` ``, 7×16 in CHARS2 — and steps
       `cell + 3·spacing` = 16 a column and twice a line's advance a row, with
       the keys' column at `(columns+1)·step − 4·spacing`. **It disagrees with
       play twice**: the shape formula gives 8 columns off record 15's own
       270-wide box where play counted seven, and 7 columns at 16 pixels is 112
       pixels of letters on a panel 304 wide. So either the box the text object
       is handed is not the item box as stored, or its pen offsets are not
       pixels — one of those is the next thing to read, and until then play's
       seven and the remake's own spread stand.
     - ~~every y is eyework~~ **the MOTION is read end to end** and built:
       the screen springs in on TWO axes at once (x −800 → 0, y −250 → 70,
       gain 15 damping 30 cap 30), KICKS itself the frame it lands (y = 1,
       velocities −40 and −20), walks a gate widget 0 → 6, and only then
       springs the name field in from −700 (gain 10, damping 17, cap 50). It
       leaves in the same order backwards, on the accelerating launcher
       (accel 12, cap 30): the field to −400 first, then the screen to −800
       and −250. `frontend/notes.md` carries every push.
     - ~~the three resting Y's are still eyework~~ **DONE — the SCALE FLAG is
       SET and every y is the arm's now.** `[0x51F120]` is written in exactly
       four places and the TEXT object is not one of them: the three addresses
       that had been called writes are the operand bytes of `mov eax,[51F120h]`.
       The frontend sets it entering and clears it leaving, so an arm is SCALED,
       and SELECT TEAM proves it — its lamp's `2·scaleY(20·row)` gives back the
       0, 22, 46, 70, 92, 116 that already match its text rows, where unscaled
       gives 40 a row. So the panel is at **32** with its bands at 6 and −22,
       and the bar at **4**: a panel with the name bar inlaid across its top,
       not three things stacked down the screen.
     - **the TITLE box's folding is wrong, and it is not this screen's alone.**
       Record 15's raw (370, 94) 400 wide comes out (206, 55) 300 with the
       stretch's +80/−25 in it, and play moved it to (170, 29) — where 170 with
       a 300 box centres on **320, the screen's own middle**, against the read
       box's 356. Every screen whose title is placed that way is suspect,
       PLAYER's (161, 45) included. The `.data` tables are not in doubt; the
       fold from them to pixels is.
     - ~~the caret plate the arm steps by its own table~~ **it was never a
       caret**: `[0x5128CC]` is slot 19, which widget 18's builder (0x41F8A3)
       fills from `alpha02..08`, and the table [51,35,35,19,3,3,3,3] is read
       backward by **widget 20**, which this screen never walks. So the step is
       a flat 3 and the plate is the panel itself.
     - the help line, `fetext` 770, carries `/Z(131,62)` and `/N`/`/S` markup
       nothing here parses yet.
   - **the PLAYER screen** (record 12, kind 5) — **BUILT**, `ui/playerScreen.ts`
     on `lib/game/ranks.ts`. The eight pigs in the arm's own grid, each with its
     career badge and the stripes of its step, the lit portrait swelling on the
     exe's own rate, and START MISSION beside them.
     Read and carried: the fifteen ranks are `fetext` 467 + class, the badge
     and stripes come out of 0x4D29C0, and the promotion tree at 0x4D2980 is
     four careers of three converging on COMMANDO and then HERO, twenty points
     either way. What is left on it:
     - ~~every y is eyework~~ **DONE, and the GRID was on its side.** `ebx` is
       the COLUMN, not the row: it steps x by **462** and `ebp` steps y by
       `2·37`, so it is five DOWN the left edge and three down the right, at
       x **57** and **519** and rows **75, 149, 223, 296, 368**. The badges step
       a pitch of their own, 417, and are HANDED (+82 left, −69 right) so both
       columns face inward — 161 and 427, the row's y plus 44. The two actions
       are record 12's own boxes 59 and 60, (350, 385) and (418, 385) 56 across,
       and the title is (161, 45) 300. The swell is SIDEWAYS: `fcos` is pushed
       as the width and the source height unscaled.
     - **which pair of stripes** the original uses is `[CHECK — remake]`:
       `pip1/2` and `strp1/2` are both pairs and the slot array is unnamed.
     - ~~the screen's own furniture is not drawn at all~~ **DONE 2026-08-16,
       and there was never a third loop** — 0x41D70E is loop 2's fourth blit
       block (the PROMOTION FLAG, `pcflag` on a pig the team can afford to
       promote), and the furniture is in the arm's TAIL, 0x41D830..0x41DB9C,
       read end to end (`frontend/notes.md`). A panel a column — the right one
       `sqpic` CUT 179 rows SHORT and capped with its own corner, which is how
       three slots come out of art built for five — a dial a column resting on
       74n+64, the team's plate at (120, −14), `pigpro` at (232, 304) drawn
       LAST and in front. `sqpics00..10` is `sqpic`'s own arrival animation;
       `parrow1..3` and `sqarmy` are dead on this screen; `backgr~1` is no draw
       arm's — it stays on play's word as the portrait's backing. The BOARD is
       `pigpro`'s face: tokens, name, class, PROMOTE cost, battles and
       kills, written with markup icons `vp`/`battle`/`kills`. **The arm that
       writes it was FOUND 2026-08-20** and it is not in the draw arm at all —
       it is the frontend's title/caption drawer `0x4285A0`, kind 5's arm
       `0x4287CB`, which also answers both of the two remaining questions:
       `[0x4C0D44]` is **2** for record 12 (4 for record 34), and `0x4267A0` is
       **not the option list's scroll** but the PORTRAIT HIGHLIGHT — eight
       slots walking a 0..3 counter through the four brightness copies of each
       face. And a lit OPTION row makes the board name the NEXT MISSION,
       `fetext 247` over `fetext 249 + mapId` — built, `frontend/notes.md` and
       `docs/history/frontend.md` carry the chain. Every line's y is still
       `[CHECK — remake]`: the arm's own pen ladder is arithmetic off a box at
       (215, 334) and has not been checked against a running game.
     - ~~**SAVE TEAM does nothing** and PROMOTE is not there at all~~ **BOTH
       SETTLED 2026-08-18.** SAVE TEAM is REMOVED — the autosave's screen-side
       half, promised where SAVE ARMY was ruled out. And the PIG MENU (record
       19, kind 6) is READ AND BUILT: an overlay over the DIMMED squad (120→80
       at 4/tick), the `swap` plaque springing 500→0 (12/20/40), the
       `swap01..03` medallion sliding 16 px a frame and blinking script 1006,
       PROMOTE with the `vp`-icon price or `-` for a HERO. CAREER PATH (record
       25, kind 13) too — the original's CAROUSEL: one career name in one box,
       four icons at (260+30n, 408), the lit one blinking. PROMOTE pays and
       writes the class (`lib/game/promotion.ts` + `campaign.amend` autosave),
       GRUNT gates at the menu and picks on the path, SWAP arms the squad and
       the next click swaps whole — **and the breathing portrait is the ARMED
       pig, the exe's own; breathing the lit one too stays `[deliberate]`** —
       RENAME reuses the kind-0 machine (title 52, max 7, empty buffer).
       `ui/pigMenu.ts`, `ui/careerPath.ts`, `e2e/001/pigmenu.spec.ts`,
       `unit/promotion.spec.ts`; the read is `frontend/notes.md` 2026-08-18.
       Small `[CHECK — remake]`s: the spend popup's life at (323,189), the
       menu rows' shade, career path's close sound, our full-screen name view
       where the exe overlays it.
   - ~~the autosave now has its first half~~ **DONE 2026-08-17, BOTH halves,
     and the campaign is a live thing** — `src/renderer/src/campaign.ts` holds
     the SaveGame in play; `begin` writes the first free of the original's own
     EIGHT slots `savearmy0..7` (0x42C3E7, `army/notes.md`) and `finishMission`
     runs at the end of a won mission. **A win is not written until the DEBRIEF
     takes it** (`[play]`): CONTINUE accepts — roster settled, position
     stepped, tokens up by the manual's award (`missionReward`: one for the
     level, one more for all five through, the hidden bonuses a `[gap]`) — and
     RETRY throws it away and takes the field again. A LOST mission is the
     manual's replay; a walked-out one (`BattleExit` 'aborted') goes straight
     back to the squad with nothing written. The debrief rides the bar machine
     with gtext's own words (163/164, 181 CONTINUE, 193 RETRY) — the original's
     end-of-mission screen (0x4848A2 walks the five fielded) is unread.
5. ~~**LOAD GAME**~~ **DONE 2026-08-17 as a STAND-IN** — `ui/loadScreen.ts` on
   the bar machine: the eight slots listed newest first, the team's name on the
   bar and its progress on the right, a chosen slot adopted as the campaign
   (`e2e/001/load.spec.ts` drives the round trip). The original's record 10 is
   kinds 8/9 — save slots named at runtime — and its draw arm (0x41DF4A) is
   still unread; the look is `[CHECK — remake]` until it is.
6. **PLAY TRAINING MISSION?** — **the fork is DONE 2026-08-17, the BOX is
   not**: the original asks with record 39, a kind-12 confirm whose blits are
   fully decoded (`yesno01..06`, the `yesdial1..7` cursor sliding between the
   answers — `frontend/notes.md`), and ours asks with fetext 141/142/143 on
   the bar machine (`ui/askTraining.ts`) until that widget screen is built.
   YES plays CAMP and a win sets the save's `tutorial` flag; NO steps the
   campaign past position 0 unrewarded, the flag staying down — skipped is not
   finished. What YES/NO do in the ORIGINAL is unread; this fork is `[play]`.

### The PROPOINT tokens — **BUILT 2026-08-21**

Play's ruling, 2026-08-18: **one point for finishing, one for coming through
without a death, and UP TO THREE tokens on a map — and not all of them stand
on it: some spawn only through EVENTS.** The measurement agrees and is now
pinned in `e2e/000/propoint.spec.ts`: the POG places **eleven** PROPOINT
records over the 61 maps, **ten of them live** on **eight** maps (DESVAL and
EMPLACE two each; MASHED, GUNS, LIBERATE, FJORDS, EYRIE, TESTER one each) —
BAY's carries field 14 = 0 where every other carries 19, so the map draws it
and it hands over nothing. The debrief's display table (0x4D3560) promises up
to five. The missing ones are event-spawned and that spawner is now READ; see
the objectives note below.

**What is built.** A PROPOINT is object type **395** and is a pickup of its
own KIND rather than a crate (`lib/game/pickups.ts`), because what the record
says is inside it — weapon 1, one round, the same on all ten — is not what it
gives. Walking into one counts it, takes it off the map with its own script
command the way a crate goes, and says so on the bus (`promotionPoint`). The
count leaves the battle beside the kills, reaches `missionReward`'s third
argument — which had been sitting there unused since the day it was written —
and lights the debrief's SPECIAL BONUS row, which had been hardcoded grey.
The sergeant says his drop-point line over it, and that one line is
`[CHECK — remake]`: the words are play's and they name this moment, the CALL
SITE is not (`SARGE_POINT` in `lib/game/sergeant.ts` is one number to move).

**What to watch in play**: eight maps out of sixty-one carry one, so on the
other fifty-three there is nothing to see. LIBERATE is the earliest.

### The OBJECTIVES machine — read 2026-08-21, and it is what the sergeant's six crate lines belong to

**This corrects the P1 entry above.** The six categories were written up as
"a crate collected, by pickup type". They are not: the ordinary weapon crate
never reaches that code at all.

- **A record's ACTION is a 20-byte thing built at LOAD** (0x4A7130, from
  0x4a6287) out of POG fields **14** (the kind), **15**'s low byte (a LINK id,
  which is the byte `formats/pog.ts` calls "not decoded"), 15's high byte (a
  VALUE), **16** (an amount) and **25/27** (where a reward drops, quantised to
  the 512 tile).
- **An ordinary crate gets none.** For field 14 = 19 the loader takes an arm of
  its own (0x4a62b2) that builds an action only when a global is 1 AND field
  15's low byte is non-zero — and **552 of the 561** field-14-19 records carry
  0 there. So a crate's weapon and count are read somewhere else entirely,
  which is why the remake's crates work without any of this.
- **The collect dispatch is 0x4AA170**, on the action's own type through a
  23-entry byte table at 0x4AA814 into seven arms:
  - types **4 and 16** → `[pig+0x1DE] -= value`, then file **08**. That
    instruction is the whole medal economy in one place, and it is the reason
    the disassembly's flat "takes something off the pig" and play's "попрощайся
    с медалью" are the same sentence.
  - types **2 and 14** → spawn model 0x17 at the record's own spot, call
    0x495420, file **07** — a medal dropped for you.
  - type **13** → spawn model 0x15 with the amount when the value byte is 0xFF,
    else model 0x14: files **06** (medical) and **05** (equipment).
  - type **1** → spawn model 0x15. Types **20, 21** find the pickup whose link
    matches and finish it; **22, 23** their own pair; everything else nothing.
- **What carries these is not crates.** Over the 61 maps: 31 records of kind 1,
  13 of kind 2, 25 of kind 7, 14 of kind 13, 9 of kind 14, 14 of kind 20 — on
  PILLBOX, BIG_GUN, TANK, M_TENT1, BRIDGE_C, TENT_S, DUMMY and the spawn
  markers. **This is the mission-objective machine**: blow up the gun, take the
  pillbox, and the sergeant remarks on it. Files 09 and 10 hang off 0x4A7600,
  the arm that runs when an object is finished off and a partner record is
  found by its link byte.

**Not built, and this is now the shape of the work**: an object's action, the
link between two records, `[pig+0x1DE]` as a per-pig tally, and the four
spawned models. It is a bigger piece than the tokens and it is what the rest
of the sergeant is waiting on.

### What gates what

- The campaign SPINE is closed: save, slots, autosave, LOAD GAME, the
  tutorial question, the map chain and the three mission exits all run.
  ~~**Every mission still opens CAMP**~~ **the campaign opens its own level,
  2026-08-19** — `nextMap(save)` in `main.ts`. All 53 real maps open; what is
  still missing is an AI and a verdict that knows whose side is whose, which
  is section 0A.
- ~~The read-from-scratch debts~~ **ALL THREE READ 2026-08-17**, each a build
  now waiting on nothing:
  - ~~**LOAD/SAVE (kinds 8/9)**~~ **LOAD BUILT 2026-08-18** —
    `ui/loadScreen.ts` wears the original's furniture on our slots: the eight
    `pclit` plates blinking script 1006, the `pcsav` frame, the `pcsvinf`
    panel unrolling as the screen rises from a screen below, `---` for an
    empty slot, the cursor refusing to rest on one, the panel drawing the
    picked squad's badges and MISSION N, and not one sound — the family has
    none. **SAVE ARMY (record 21, kind 9) is deliberately NEVER built**
    (`[play]`): the campaign autosaves and there is nothing to save by hand.
    ~~The player screen's SAVE TEAM label goes with it whenever that screen is
    next touched~~ **gone 2026-08-18** — START MISSION stands alone on its
    plate.
  - ~~**The confirm box (kind 12)**~~ **BUILT 2026-08-18** —
    `ui/askTraining.ts` is the real widget box now: the two springs in from
    the upper right, the `yesno` turn-over landing on `yes` with `Indu008`,
    the six-tick `yesdial` slide with its stand-still window, the words
    behind the hide-flag fade, the leave in reverse. One guessed number
    (`mainbar1`'s repeat seam) and one kept divergence (up/down toggle too).
    Records 0/24/43 — the QUIT confirms — can reuse the module whenever the
    escape menu lands.
  - ~~**The end-of-mission DEBRIEF**~~ **BUILT 2026-08-18** — `ui/debrief.ts`
    is the original's page: the loose BMPs of `Language/Tims/debrief/`
    through their own loader, faces/wounded/`r_i_p` with the team's uniform
    over the living, the pitch-74/73 rows, `Pigbkpc2` behind a loss, the
    greyed SPECIAL BONUS row. Stand-ins, tagged: the `vp` coin for the
    spinning `propoint.mad` and BIG/GameChars for the exe's unread gtext
    font pair. **The CONTINUE/RETRY fork is GONE (play, 2026-08-18)** — the
    backdrop paints its own key bar, so the page now just honours it: on a
    win SPACE continues and ESCAPE replays, on a loss SPACE replays and
    ESCAPE walks away to the squad, which is the exe's `won ? 0 : 2` and the
    home of gtext 193/194. Rows follow the FIELDED count (1/3/5) and the
    training ground's tokens are gated on `paysPoints`.
- ~~the CAMPAIGN MAP~~ ~~READ 2026-08-17, and THERE IS NO SUCH SCREEN~~
  **WRONG — play caught it, and it is READ AND BUILT 2026-08-18.** The map
  lives in the MISSION HOST, not in a frontend record — which is why every
  menu-side search missed it (`pigmap/notes.md` has the whole chain; the
  "never never" lesson holds). Built as the original runs it: START MISSION
  (position 1 on) → the WORLD MAP (`BigMap` under 25 territory patches
  tinted by the defending nation, six banners, the current one blinking) →
  the ZOOM (32 easing steps, patch crossfading into the region page) → the
  REGION (`*phy` flat pages — not 3D — with a pole per mission, flags on the
  conquered, the player's own four-part marker bobbing on the current) → the
  BRIEFING, which IS the loading screen (`level<pos>.bmp` + the 17-step
  loadbar at (152,451) + gtext 257 creeping up; position 1 pastes the
  enemy's `level1n<nation>.bmp` portrait at (342,190)) → a key starts. The
  training ground skips the map and briefs on `level0.bmp`, the exe's own
  gate. A key skips a phase (the exe's); BACK skips the whole map
  (`[deliberate]`). The MISSION LIST stand-in (`ui/missionList.ts`, the
  cheat's mechanics) is DELETED with its spec — the real thing landed.
  `lib/game/pigmap.ts` (the tables), `ui/pigMap.ts`, `ui/briefing.ts`,
  `unit/pigmap.spec.ts`, `e2e/001/mapchain.spec.ts`. **The NEWSPAPER is
  read and built too** (second pass, 2026-08-18): a campaign win prints the
  nation's front page with the story keyed at (23,144) and the photo at
  (309,111), variant off the five fielded survivors (the wipeout split on
  points ≥ 2), story rotated by the new position, six special pages for six
  maps — after the debrief's CONTINUE, any key or 10 s out
  (`lib/game/newspaper.ts`, `ui/newspaper.ts`, `unit/newspaper.spec.ts`).
  **The COLOURS were corrected after play, 2026-08-18**: a territory patch is
  a greyscale MASK and the nation colour a 255-neutral diffuse, and the
  composer ADDS it (SRCBLEND = DESTBLEND = ONE), so the map is `bigmap + mask
  × colour/255` and the blink is a white FLASH rather than a hole. A position
  the campaign has already taken flies the PLAYER's colour.
  **The FLAGS were corrected after play, 2026-08-19**: EVERY stand of a region
  flies one from the campaign's first day, in the colour of the nation holding
  that mission — the per-position loop at 0x483566 carries no comparison at
  all, and the campaign position is not read anywhere in the routine. "Only on
  the conquered" was this repo's invention and it showed as a page of bare
  poles. `pow.pigMap.patches()` and `pow.pigMap.flags()` exist because a map
  with no tints, and a page with no flags, both still paint.
  Still not built from the read: the region-complete victory FMVs
  (03..07, endings 08/09 — Bink), the load-screen gamma fade and its
  tumbling-hat overlay (`fhats.mad` across a frozen frame — the "random
  load screens" that never were; NVIEW*.BMP is dead art nothing reads).
  What the earlier read yielded still stands:
  - **the mission list on screen is the CHEAT** — record 44, CHEAT LEVEL
    SELECT, kind 2, opened by naming the team NAUGHTY PIGS (fetext 0x2EB;
    also sets the tokens to 99): 26 raw map names in a seven-row scroll
    window, and choosing a row MOVES `team+0x53`. Buildable any time on the
    machinery we have; a `[gap]` until then.
  - **the enemy table is rolled at the team's birth** (0x482940) — balanced
    five of each other nation over positions 1..24, FINAL always Team Lard —
    **and the remake now does the same**: `lib/game/enemies.ts`, rolled in
    `campaign.begin`, read back by `missionWonResult`. `[exe]`.
  - the full-screen map art (`lselpc*`) is MULTIPLAYER's SELECT LEVEL
    (record 28, kind 20, arm 0x41E579) — a screen for the `net` worktree's
    future, not the campaign's.
  - mission TITLES (`gtext 11+mapId`) are drawn only by the battle's opening
    card, which `ui/titleCard.ts` already does.
- NEW GAME's first two screens are built. **SELECT TEAM's own pass is done**
  (0x41CBE1 and the widget pass at 0x41E790), and it found three wrong numbers
  in the old summary — which is the argument for doing the NAME ENTRY's pass
  (0x41DC69) before building it too, rather than from the paraphrase.
- **The OPTIONS family and the ESCAPE chain are READ 2026-08-18 and wait to
  be built** (`frontend/notes.md`, the 2026-08-18 sections):
  - **VOLUME CONTROL** (record 20, kind 7) — an OVERLAY on the dimmed
    OPTIONS machine: the `vol00` panel rising from below at (100,240), two
    `vollit` knobs at 230+⌊25v/2⌋ (MASTER y+320, SFX y+351), MODE and
    VOICES printing their value (MONO/STEREO/SURROUND, OFF/ON) with the lit
    value flashing; LEFT/RIGHT step, Crunch at the stops, SFX previews
    COINDROP/COINFLIP/SPARKS02/STEAM001 in turn; the exe's VOICES slider is
    built and never drawn. Values live in team bytes +8/+9/+0xA/+0xC and
    persist only through the save.
  - **CONTROLLER SETUP** (record 41, kind 15) — the `pckey` poster
    unrolling 0→6 with `Indu013`, twelve actions in a six-row window, and
    remapping that WORKS (capture with swap-dedupe). Ours would bind the
    remake's controller instead.
  - **CREDITS** (record 45, kind 16) — a wall-clock scroll (~58.5 px/s) of
    fetext 503+ name/role pairs over the backdrop, a pig voice looping. The
    PC build draws only 18 of the ~150 shipped rows — dead PSX data; ours
    should run the whole list.
  - **The ESCAPE chain**: frontend ESC → REALLY QUIT? (24) from the squad,
    REALLY QUIT APP? (43) from the main menu (kind 19 IS the app-quit
    code); **in a MISSION esc is the PAUSE binding** — and that half is
    BUILT (2026-08-19): the game's own pause, sim frozen, sound suspended,
    "-GAME PAUSED-" gtext 173 over CONTINUE / MASTER VOLUME / SFX VOLUME /
    **SPEECH** / ABORT, the in-mission volume tweaks touching only the
    engine, ABORT asking ARE YOU SURE? on NO. `lib/game/pauseMenu.ts`,
    `ui/pauseMenu.ts`, `e2e/002/pause.spec.ts`. **The fourth row is SPEECH
    (175), not PIG VOICES (240)** — an earlier reading of this line said
    the latter and 240 has no reader in `.text` at all. What is still the
    FRONTEND's half — REALLY QUIT? and REALLY QUIT APP? — can reuse the
    kind-12 confirm module.

## 0A. PLAYING THE REAL CAMPAIGN — what stands between us and mission 1

Play asked on 2026-08-19: what is left before the first map can be loaded. The
answer turned out to be shorter than this list looks, because most of it is
already built — so this section says what was MEASURED that day, not what was
assumed.

**The map opens today.** `pow.swapMap('ESTU')` — position 1's own level —
loads with no errors and stands TWO squads on it: ours of three (which is what
`fieldedAt` gives position 1) and the French `GARLIC GRUNTS`, three, in skin 2.
So "the levels are not playable" was never about the levels.

**And so does the rest of the turn machinery.** `Game.endTurn` moves the acting
pig, then walks to the next side that still has anybody standing, turns the
turn number over and resets the clock (`lib/game/game.ts`). Both sides take
their turns from the same keyboard, which `e2e/002/battle.spec.ts` already
drives on LIBERATE. The verdict "one side left standing" exists
(`lib/game/endOfGame.ts`).

What is actually missing, in the order it is worth doing:

1. ~~**Every campaign map has to OPEN**~~ **DONE 2026-08-19, and the sweep
   found a real bug on the way.** All 59 names were opened one after another
   through `swapMap` in one run: **53 open, with not one console error
   between them**, and the six that refuse are the `GEN*` texture sets, which
   carry no spawn markers and are not maps. `main.ts` opens `nextMap(save)`
   now.

   **The bug was ROAD — mission 2 — and it was a confusion of two numbers.**
   The battle filtered a map's records by `SIDES_FIELDED`, which is 2 because
   two squads play, where the exe's own test asks how many PLAYERS the game
   has. The campaign is ONE. Measured over ROAD's POG: its five scripted
   markers, the player's own side, carry low byte 0x71 — only the first
   player bit — so asking for two dropped the whole squad, and the enemy's
   two four-player markers were promoted to ours because no surviving side
   carried the scripted bit. ROAD opened as a lone pair of pigs with nobody
   to fight, and `outcomeOf` would have called it won on the first handover.
   At one player it fields 5 against 3. Over all 59 maps exactly two read
   differently either way, ROAD and BOOM (the arena, whose four sides are the
   multiplayer set). `lib/game/muster.ts` carries `PLAYERS = 1` beside
   `SIDES_FIELDED = 2` now, and `e2e/002/spawns.spec.ts` pins ROAD.

2. ~~**The verdict does not know whose side is the player's**~~ **DONE
   2026-08-19.** `outcomeOf(training, ownStanding, othersStanding,
   targetsLeft)` now: our side down is `'lost'` whoever else is standing —
   the exe's own both-empty case is 2, not 3 — and the win asks OUR side up
   with the others' empty. Side 0 is ours because `spawnTeams` orders the
   side carrying the map's player bit first; `handOver` feeds it per-side and
   `e2e/002/endOfGame.spec.ts` pins the case that used to lie
   (docs/history/turns.md).

3. ~~**The SAVE's squad does not reach the field.**~~ **DONE 2026-08-19,
   both directions.** `mapSquads` takes an `OwnSquad` — the save's name and
   the first `fieldedAt(position)` pigs, each under its own name and
   rank-class — and the battle hands side 0's dead back as roster slots in
   the order they fell, which `main.ts` stamps on with `fall` before the
   debrief reads anything. `discardMission` stands the squad back up, so
   RETRY and EDIT SQUAD find it as the mission did; CONTINUE settles it as
   before. And since later the same day the board's two counts COUNT:
   `killed` carries the attacker, the battle tallies side 0's kills, and a
   win puts missions+1 and the kills on every fielded pig's record
   (`credit`, docs/history/status.md "THE BOARD'S TWO COUNTS COUNT").

4. ~~**A turn is 45 seconds on every map but CAMP.**~~ **DONE 2026-08-19.**
   The exe's turn table is indexed by the CAMPAIGN POSITION — `[0x51f17b]`
   is `team+0x53`, decoded in `pigmap/notes.md` — so `BY_MAP` in
   `lib/game/turns.ts` is now the composition of `CAMPAIGN` and the table:
   every campaign map by name, arenas on the 45 default,
   `unit/turns.spec.ts` pinning the corners.

5. **There is no AI — but its SEAT is built, 2026-08-20.** The battle knows
   which sides the machine plays (`computer(side)` — the app hands in
   "everyone but side 0"), input never drives a machine pig
   (`input/battleInput.ts` mutes everything but ESCAPE on its turn), and the
   machine's turn runs itself through the one road every turn takes:
   `lib/game/ai.ts` is the brain, and today's brain waits out the GET READY
   card, stands THINKING (clip 46), and passes. So a mission plays start to
   finish with the enemy passing every turn; what is left is a brain that
   DOES something — and it must stay a function of stepped time and the
   battle's one random stream, because lockstep (the `net` branch) will feed
   the same seam. The pure specs and `engine-headless` stay hotseat: nobody
   is the computer unless the assembler says so.

Not blockers for mission 1, though the lists carry them: the pillbox's two
weapons and the vehicle (section C), skill 63 MAP VIEW, the PROPOINT tokens
(`bonusPoints(1)` is 0 — the first mission pays none), the empty power-gauge
slot, and the three arch bridges that are fallen through (ESTU is not one).

## A. THE TUTORIAL — finish the training ground

The script MOVES now: a crate collected speaks, a crate PLACED speaks, and the
menu counts (docs/history/training.md, "THE TRAINING SCRIPT MOVES"). The END
of it is built too
(A1, done). What is left is one line and the camera.

**And it can be JUMPED to a step** — F12 on, F11 back, `pow.step(9)` for the
bazooka (`lib/game/training.ts`, docs/history/training.md, README). Anything below that says
"play the tutorial to the TNT" is a keypress now.

### A4. WHICH BUILDING clip 22 means — open, and the map disagrees with the guess

"ENTER THE BUILDING AND COLLECT THE CRATE" fires when the BAZOOKA crate is
PLACED; that half is read (`tutorial/notes.md`). Where it sends you is NOT, and
this file's own note used to say "inside it" as though it were. Measured off
CAMP.POG 2026-08-12: crate #19 stands in the open at (−5376, 11008), the nearest
building is the SHELTER 5894 units away, and the house is 11000 and more. What
stands beside the shelter is the health×25 crate #56 (1305 away), whose line is
clip 24, the BACKSPACE one.

So either the line is generic and the crate is simply the next one along the
path, or it means a building the remake has not identified. **This is a question
for play** — one run to the bazooka step (F12 to 9) with an eye on where the
original sends you settles it.

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
   Take a grenade or the bazooka IN HAND and the camera changes on the spot:
   `0x493BB0` dispatches on the skill and asks for **mode 4**, whose row
   `0x49F6F0` stamps — **3500 out at up to 29.2° above level** for anything
   thrown, 1500 at 19.7° for a blade, and **nothing at all for a gun**. Hold
   **G** and it comes in to the **TR cam, mode 0x12**: 200 out, 400 up, nominal
   1700, close over his back, and the one view the exe lets under the ground
   floor. **The fire button touches neither** — it did for one commit and that
   was the bug — and **the charge no longer cancels the view**, because the
   `charging` control set carries the sight key through the way the exe's aim
   branch does.

   **The lob view LOOKS PAST HIM (2026-08-12), and that is the framing play
   was describing.** "В оригинале он поднимается выше и отдаляется — свин у
   нижней границы экрана; у нас он в центре экрана." Mode 4's thrown branch
   makes one call its blade branch does not — `0x44E620(0x600, [cam+0x8C],
   &dx, &dz)` at 0x4a2307, 1536 along the camera's own FORWARD yaw (mode 0
   springs that field toward `subjectYaw − column2`, and the chase's column 2
   is zero) — and the PC build then never reads the result: the target is
   stamped from the subject outright. Applied here as `LOB_AHEAD`, it puts the
   pig **15.7° under the view axis** — seven tenths of the way to the bottom
   edge of a 45° frame — and play confirmed that half ("а вот угол вроде
   верный"). `weapons/fire.md`.

   **A CAMERA LENGTH DOES NOT RIDE `MODEL_SCALE`, and there is no eyework in
   either view.** Play asked the right question of a fudge factor offered for
   the distance — "точно нет? как движок тогда это делает?" — and the answer is
   that the halving was the bug. `MODEL_SCALE` is what a MODEL is drawn at and
   the exe applies it too; the map is a tile of 512 either way, so the exe's
   world IS this one and a distance between two of its points is the exe's
   number outright. What halves is a length taken off a model (the bayonet's
   460, the body's 0xAA). The factor is deleted.

   Two more corrections came with it. **3500 is the SEPARATION, not the
   horizontal run** — the distance spring differences `0x44E850`, the length of
   camera minus target — so the elevation splits it, `3500·cos 29.2°` along the
   ground and `3500·sin 29.2°` up. And **the TR cam's 200 and 400 are its LOOK
   POINT**, not its camera: `0x4A0B50(cam, &camera, &target)` takes the vector
   its handler builds as the THIRD argument, and the camera is put at the row's
   1700 from it (0x4a484d) at that mode's own column 1 of 1024 — dead level.

   Where the two views land, in world units, with nothing tuned:

   | | behind the pig | over him | from the lens | he sits |
   | - | - | - | - | - |
   | lob (in hand) | 1520 | 1706 | 2285 | 19.1° under a 29.2° axis, 0.85 of the half-frame |
   | TR (G held) | 1500 | 400 | 1552 | 14.9° under a level axis, 0.66 of it |

   The two agree on which corner of the picture the pig sits in without either
   being tuned to the other, which is the check on both.

   **AND THE SHOT CAMERA DOES NOT FOLLOW THE SHOT (2026-08-12).** Play: "когда
   кидаешь или стреляешь — камера не чисто за снарядом, а в бок будто
   перемещается." Mode 1's handler is **0x4a11e0** — found through the pointer
   table at 0x4D95A0 that `0x49F740` reads and `[cam+0xE0]` holds — and it is
   thirty instructions that decompose camera-to-subject and aim along it. **No
   position, no spring, and `0x4A0B50` never called**, so its row's 3072/1024
   is not read and neither is the ground floor. The camera stands where the
   throw left it and TURNS. A camera flown behind the flight has to swing round
   every time the heading changes, which is the drift play saw; this one has
   nothing to swing. `chase.watch` is that, and `chase.ride` stays for the
   CRATE, which is mode 0 and really does move (0x4661c2).

   **And mode 1 is NOT what a grenade asks for.** Play, before the read: "ты
   разобрал камеру для снайперки итд. а для гранат и базук она другая)". The
   fire dispatcher (`jmp [eax*4 + 0x47CF8C]`, skill − 6) gives four answers,
   one per arm, tails followed: **6 PISTOL / 11 SNIPER RIFLE / 12 / 13 / 15 /
   17 / 18 → mode 1**; **19..27 GRENADES, 28 MORTAR, 29 BAZOOKA, 30..33,
   39..44, 47..49 → mode 0x0B**; 34 and 50 JETPACK → mode 0x0A; 51 SUICIDE →
   mode 2; and **7 RIFLE, 8, 9, 10, 14, 16 and the planted charges ask for
   nothing at all**. `TRACKS_ITS_SHOT` in three/chase.ts is that table.

   **NOBODY IS EVER IN MODE 0x0B — `0x49F740` rewrites it to 0x0D on entry**
   (`cmp ebp,0Bh` … `mov ebp,0Dh`, 0x49f774..0x49f7a5), which is why 0x0B's own
   handler is a `ret` shared with modes 5, 8 and 0x0C: unreachable, not a
   behaviour. It also closes three loose ends at once — 0x0B/0x0C/0x0D share
   the setup arm 0x49f912, that arm is the only writer of `[cam+0x7A]` and
   0x0D's handler its only reader, and the setter zeroes `[cam+0x78]` for every
   mode BUT 0x0D.

   **Mode 0x0D (0x4a3a20) swings in behind the thing and then RIDES ROUND it**
   — play named the shape before it was read ("камера там ещё будто едет по
   кругу вокруг"). Phase one springs the camera's yaw toward the subject's own
   facing and turns it about the subject until the step is under 1.4°, then
   stamps the separation into `[cam+0x7A]`. Phase two, once a frame: radius =
   clamp(⅔ × separation, stamp, 10000), `[cam+0x78] -= 10` of 4096 — **0.879° a
   frame, one way, held within 67.5°** of the bearing it locked at — and the
   camera is placed at that bearing and radius. The height is the row's own
   ceiling, **column 1 = 824 → 17.6° above level**, plus the tail's 768 floor;
   the row's 3000 is not read at all. `chase.pursue` is that, state and all.

   The freeze play describes is the beat BEFORE the throw — `Pig::Fire`'s
   battle cry with the camera still in mode 4 — which is also why mode 4 aims
   1536 down-range.

   **A RIFLE tracks like a sniper**, also play's. The exe's own split (the
   pistol and the sniper reach the shared tail at 0x47ad71, 7 RIFLE's arm jumps
   to the common exit) is not honoured anywhere else in the shot path, so the
   caller asks the weapon's LAYER: every `gun` gets `watch`, every `lob` gets
   `pursue`.

   **Mode 0x0A is read and NOT built** (0x4a43c0): the look point 1024 ahead of
   the subject's own heading, then the three springs and the tail — mode 4's
   shape, aimed ahead of something moving. Skills 34 and 50 JETPACK reach it,
   and neither is built.

   It also explains an old empty search: `lib/game/sightline.ts` dodges walls
   because watching a grenade through one is no use, and the exe was found to
   have no line-of-sight test anywhere in its camera code. A camera that does
   not move has no wall to dodge. The dodge now applies to the crate view
   alone — if a wall hides a grenade in play, that is the thing to bring back,
   as a swing of the STANDING camera.

   **What this leaves standing: the ordinary chase is 2.7× closer than the
   exe's.** `BACK`/`LIFT` put the lens 1142 from the pig where mode 0's row is
   3072 at 22.5°. Those two are the remake's own eyework, tuned when models were
   full size and halved with them so the framing would not move — not a decoded
   number being mis-scaled. Not touched: the whole feel of the game hangs off
   it and it is play's call.

   Two numbers that were invented and are not any more: `CLEARANCE` is the exe's
   **ground + 768** (0x4a0c12, the tail every mode ends with), and **column 1 of
   the mode table is the elevation CEILING** (`0x4A0900`, 0x400 = level, smaller
   = higher) rather than the zoom it had been written down as. The lob view is
   placed by that ANGLE and by 3500 taken as a LENGTH through `MODEL_SCALE` —
   play looked at the ratio-against-`BACK` version and said the original pulled
   further back. The knobs, if it still wants moving: `LOB_CLOSE`/`LOB_CEILING`
   and `THROW_CLOSE`/`THROW_RISE` in three/chase.ts, and `pow.debug.view()` says
   which view is live. Not modelled: the exe lets the player PITCH the TR cam
   (±700 of 4096, `[cam+0x76]`) and nothing here is bound to a camera pitch.

9. **THE EJECT (2026-08-12), and it wants standing on.** Play stood on CAMP
   **18,12** — a flat wall tile 128 BELOW the ground beside it — and got
   "прыгает по полу будто соскальзывает, но на месте". Two bugs in
   `EjectFromWall`, both the remake's reading: the gradient's atan2 is the
   bearing of an IMPULSE and not a new facing (turning the pig walked him back
   into the wall while W was held), and the arm has **two** impulses — 32 level
   downhill, 32 at 83.5° — where this had one 0x20 pitched at 83.5, which keeps
   the lift and throws the push away. Both fixed; `002/wedge.spec.ts` stands a
   pig on that very tile. **What to watch:** he should be pushed clear once and
   walk on, not hop. And the same half-turn was the last suspect for "летящая
   свинья крутится вокруг своей оси" — see whether that is gone too.

10. **G WITH A BAYONET OR EMPTY HANDS — play says it moved the camera, the code
    says it cannot.** `sighting` is "held AND the weapon's layer has an aim
    view", and only `gun` and `lob` do; the camera picks its two lob views off
    the layer as well, so a blade can reach neither. That is the exe's own shape
    too — its aim branch gives a blade no camera, and `0x493BB0` moves the view
    for a blade only when it is TAKEN IN HAND (mode 4 at 1500/19.7°, closer and
    lower than the chase, which is a real change and may be what was seen).
    `002/sights.spec.ts` pins the rule. If it still moves on this build, the next
    step is measuring `pow.debug.view()` and `pow.debug.camera()` with a bayonet
    out rather than reasoning about it again.

## B. PLAY'S REPORTS, still open

**The 2026-08-11 batch is done and its entries are marked below**: TNT's radius
(B2), the wall's transparency (B5), the door's glide starting after the wind-up
(A1 → `objects/notes.md`, and `lib/game/doorway.ts`), the rocket's pose and its
trail (B4), the rocket that went off on the fire key (B1), and the victory — the
card, the empty hands and the dance (A1's ending). What is left in this section
is everything NOT in that batch.

### B00. A COLLECTED CRATE TAKES NOTHING — fixed 2026-08-12, NOT PINNED

Play: "если сломать не дверь динамитом — туториал багуется — я сломал стену,
взял аптечку, и там пропал динамит и не появилась базука."

Read off CAMP's own records: the DOOR (45, `STW04_D2`) is the only piece of the
house with a health of its own — **50, exactly TNT's core damage**, where the
walls beside it take the table's 60 — and the only one carrying a command
(opcode 22, waits on 89, signals **7**), which the bazooka crate (18) and the
health crate inside the house (55) wait on. So breaking a wall places nothing,
correctly. What dead-ended it was ours: every crate cleared the inventory on
COLLECTION, which is play's own earlier rule on top of the exe (whose
`ClearInventory` fires from the PLACEMENT arm alone, 0x4aa6cb, unconditional).
Every skill on the training ground is UNLIMITED, so the TNT should have survived
a wasted charge — and there is no second TNT crate, record 52 being the only one.

**The whole rule is gone now, weapon crates included** — "ящик с оружием при
подборе всё ещё забирает то, что несёшь — а вот это давай сразу почистим" — and
nothing is lost with it: "one weapon at a time" rides the PLACEMENTS, which is
where the exe puts it (0x4aa6cb, the pickup branch only). **And that can only
ever fire on CAMP**, measured over all 61 shipped POGs: it is the only map whose
crates WAIT to be placed (eight of them). Eight other maps run script steps —
BHILL, BRIDGE, GENMUD, MASHED, OASIS, SNAKE, SNIPER, TRENCH — but what they hold
back is scenery, never a pickup.

**PINNED — `e2e/002/crate.spec.ts`**, which play sized itself: "спавни ящик
прям перед свином — путь пройдёт… потом используй, и если бесконечное не
пропало, если конечное пропало — норм?" Two tests, both on shipped maps and no
new debug write:

- CAMP — a grenade in the pockets first (`pow.give`), then the bayonet crate
  WALKED into from a stride away, which is `reached` doing its own job. The
  grenade survives the collection (the pin this section exists for), the bayonet
  arrives UNLIMITED, and it is still there and still unlimited after a swing.
- GUNS — its TNT crate, the one charge, on a map that is not the training
  ground so a slot carries the record's own count. Planted once, and the slot is
  GONE (`spend` drops it at zero) — TNT being the weapon that does not hand the
  turn over, so one press settles it.

One thing the writing of it turned up, and it is in the spec at `useUntil`: a
FIRE press on the frame the skill menu is still up is read by a control set that
does not carry the fire key, and the latch goes with it. One frame either way,
so a spec that presses once passes and fails on alternate runs. It presses until
the blow starts instead; four runs, four passes.

### B0. THE BLACK SMOKE IS DROWNED, NOT MISSING — diagnosed 2026-08-11

First in this section because play has raised it more times than anything
else on the list ("чёрный дым вообще не появляется… я тыщу раз уже
жаловался"), and because the cause is now READ OUT OF OUR OWN SOURCE rather
than guessed at. Two earlier passes blamed the blend mode; the blend mode is
not the problem.

**What the code does.** Row 0 is right and both clouds are spawned
(`ROW_ZERO`, `lib/game/effects.ts`): seventy sprites of dark red (16,0,0) on
one frame and seventy of near-black (4,3,0) on the next, from the same point.
`three/effects.ts` then paints the red one ADDITIVE and the dark one NORMAL
(`LIT = 8` splits them), which is the right instinct — additive light cannot
darken, so the smoke has to cover.

**Why nothing shows.** Arithmetic off our own constants:

- the red sprite's colour is `cloudChannel(16)/255` = **0.39**, and every
  sprite adds `0.39 × BLOB_ALPHA(0.4)` ≈ **0.157** to the red channel at its
  centre — so **about seven overlapping sprites saturate red to 1.0**, and
  seventy are born at one point;
- **nothing fades a cloud**: the colour law is flat by the exe's own reading
  and the alpha only drops over the last tenth of the life, so the red ball
  sits at full saturation for its whole **twenty frames**;
- both clouds live exactly those twenty frames and occupy the same volume, so
  the near-black cloud is painted INSIDE a solid red ball and dies with it.
  There is never a frame where the smoke is on screen without the fireball
  over it.

So the smoke is drawn, every time, and cannot be seen. What survives the ball
is the three bursts — fourteen puffs, mid-grey, gone in about another half
second.

**Where the fix has to come from, and what NOT to do.** Do not tune the split
or flip blend modes again — that is the loop the last three passes were stuck
in. The two numbers that decide saturation are both the remake's own
inventions and both now have a decoded replacement: `BLOB_ALPHA` (0.4, picked
because "seventy sprites at full opacity is a painted ball") and `BLOB_UNIT`
(1/64, invented because the sprite's size unit was thought unreadable). It is
readable now — **the 2D-poly record's half-extents ride the same perspective
factor as the position, so the engine's `(200 − age) × size × 12.5` is in
WORLD units at the sprite's own depth** (`library/notes.md`). Work the real
size out first; the saturation follows from size and count, and the alpha
follows from that.

One correction to carry into the fix: the CLOUD sprites are **untextured** in
the original (the draw writes texture −1), so the canvas blob is right in
kind for them. It is the fourteen BURST puffs that are textured, from
`expltims.mad`'s `ptp*` art.

### B1. A bazooka can be hand-detonated like a grenade — DONE 2026-08-11

`Lobs.detonateNow` skips a row with `contact` set: a rocket has no fuse to cut
short (row +0x14 nil starts it in state 2, which nothing counts down — what ends
it is touching something, 0x437F2C). The press is still swallowed, so F during a
rocket's flight does nothing at all, which is the same "one blow a turn" rule
everything else follows.

*(What this entry used to say, kept for the control-set half, which is unchanged:
`weaponLayer(29)` is `'lob'`, so the second press is offered — and it is now
offered to something that refuses it.)*

### B2. TNT's blast is too big to get clear of — DONE 2026-08-11, and nothing was tuned

Play: "у динамита радиус слишком большой — я отхожу задом все 4 секунды, а меня
всё равно задевает на 4 урона." Measured off the old numbers, they were about
**2400** units out when they took those four points.

**The rim is the RANGE.** `0x48CBA0` is a ramp from a 512-unit core to a QUARTER
at exactly `past = range` — "never to nothing", which is the rim the exe draws.
This engine went on evaluating that line past its own divisor to where it crosses
zero, `512 + 4·range/3`, and used THAT as the reach. The gap is the range's own
size, which is why only TNT was ever complained about: a grenade loses under a
hundred units by the correction and TNT loses four hundred, so at 2400 there is
now nothing at all.

**And the falloff's third term is read** — the one docs/history/weapons.md called "a float
nobody has read". `[[body+0x18]+0x4C]+0x0C` (0x48CC46) is the STRUCK BODY's own
collider radius, out of the shape table its body comes from: 0xAA for a pig,
riding `MODEL_SCALE` here like every other body length.

**What is still NOT found is WHO** — and one candidate is now ruled out by
measurement. `Pig::OnHit`'s blast arm is reached from a physics CONTACT with the
effect's own body, and the shape table (0x4A90CC, eleven entries) gives an effect
a sphere of **35**: 205 units against a pig, inside the falloff's own core, where
it could never be anything but full damage. So something grows that contact and
it has not been read. The other candidate is DEAD: `[pig+0x180]`, which the
projectile's ±0x400 sweep sets, has exactly two readers and both are in the
ANIMATION picker (0x46F457, 0x4721B7) — they put clip 0x21 on, so a pig with a
live projectile within a tile of it **cowers**. Nothing about damage.

### B3. Read ALL of the blast's picture, not half

Play: "не правильный эффект при взрыве… половина прочитана — читай всё."

**Read already.** The destructor's per-kind table (0x435A6C) sends kind 10 to
`0x433220`, which joins the tail at `0x43533E` and pushes effect **0x53** where
the grenade's arm pushes 0x54; both play sound 0x0C (`E_1`). The id → row map
resolves 0x53 to **parameter ROW 1** (`byte [0x489680 + id − 1]` → slot 54 → arm
`0x488faa` → `0x48ccc0(1)`), against the grenade's row 0.

**Read now — 2026-08-11.** Row 1 is transcribed and stages D and E are decoded
(`effects/notes.md`): a near-black 70-sprite cloud, a **five-way fan of grey
smoke JETS** at 200 a frame (stage D — fifty frames a jet), and two bursts.
Stage E turned out to be enabled in no row at all. What is left is only the
build: add row 1 to `lib/game/effects.ts` beside `ROW_ZERO` and `MINE_EFFECT`
(the jet fan needs its stage-D shape drawn), and `Charge` has to carry the
effect id the way the mine's already does.

### B4. The rocket is drawn crooked, and it wants its own trail — DONE 2026-08-11

Play, twice: "прожектайл кривой при выстреле базуки… также шлейф — своего рода дым
такой белый."

**The nose is MEASURED.** `WE_BAZZ` out of the map's own archive (which is where a
fired rocket's art comes from) is thirteen vertices with its long axis on **Y**,
−196..191, and **one** vertex at the −196 end against six at +191 — an apex over a
hexagonal body. So the nose is model **−Y**, and the pose is that axis turned onto
the velocity rather than the yaw-and-pitch pair that assumed +Z.

**And the trail is the ENGINE's — effect id 0x14.** A first pass answered "the exe
hangs nothing on a bazooka" off two dispatches; play refused it flat ("ВРЁШЬ!!!")
and was right. The projectile's UPDATE has **two** per-kind dispatches and the
pass read the wrong one: 0x436596 sends every kind outside 26..28 to 0x436727,
where the map at 0x436D68 is indexed by the KIND straight and kind 10 lands on
0x43676D — `new(0xE4); push 14h; push esi; 0x487620(…)`, the same parented-effect
call the grenade's constructor makes with 0x15.

**And it corrected the grenade with it.** `[0x48BF90 + id − 1]` → `[0x48BF24 +
slot*4]` puts id 0x14 on 0x48B024 (÷6, particle 0x16) and id 0x15 on 0x48B0F5
(÷3, particle 0x19) — so the "six a frame" every note called the grenade's is the
ROCKET's, and a grenade lays three. `LOB_TRAIL` is fixed to match.

**And it is the engine's end to end** — a first pass shipped a white, double-size
row off play's "белый густой дым" and play sent it back: "давай делаем как в
движке — в этом же и суть." Both trails share one particle setter, so the row is
grey 0x4210 at size 8 like a grenade's and the COUNT is the only difference; six
against three is the whole of "густой". If it still reads as nothing in play, what
is wrong is the PUFF — our canvas blob against the original's textured additive
particle — and that is the thing to change, not the row.

The same dispatch settles the BULLET: kinds 12..17, the guns, take `push 15h` —
the grenade's own id — so a bullet really does lay a grenade's trail, which this
engine had right by accident and for the wrong reason.

Read and not built: effect 0x14's Init lays one particle of type 0x14 at the
spawn point, same grey at size 0x10 — a bigger puff where the rocket leaves the
barrel.

**The lesson, and it is the one already written down**: "I could not find it" is
never "it is not there". Two dispatches read is not the same as the site read.

### B4b. ALT-TAB stops the battle but not the sergeant — written down, not built

Play, asked to be recorded for later: "в игре при альт-табе останавливается — пуля
например не летит дальше пока не вернусь, а вот инструктор говорит дальше — надо в
будущем паузу делать, эскейп меню, но это потом."

Exactly right, and half of it is already written up under "A frame is clamped to a
tenth of a second": the browser stops calling `requestAnimationFrame` for a window
nobody is looking at, so the ENGINE stands still while the audio — which is the
browser's own clock — plays on. The clamp only stops the world resolving a whole
alt-tab in one step; it is not a pause and does not pretend to be.

What the original has is a real one: the beat at the top of a turn lists the PAUSE
button as one of its three ways out (0x4d8a2c), and the mode machine carries **7 PC
PAUSE MODE** and **8 PAUSE MODE** beside it (`turns/notes.md`). So the escape menu
has a mode of its own to be built on. Singleplayer wants it; multiplayer wants
nothing of the kind ("в мп вообще никаких остановок"), which is the same split the
frame clamp already lives with.

### B5. The wall and the ceiling want to be a little more see-through — 2026-08-11

Play, again: "прозрачность ещё как-то мало — надо побольше; вообще будто не
менялась с прошлого раза — текстура наверху прозрачная, а внизу еле-еле."

**Most of that was not the number.** One ray, from the eye to the pig's MIDDLE,
faded exactly the piece it skewered — and a wall is pieces stacked up the wall, so
it went see-through level with his head and stayed solid level with his feet,
which is "transparent at the top and hardly at the bottom" to the word.
`crossedTowards` takes three points down the body now (crown, middle, soles) and
fades the union. `SEE_THROUGH` went 0.5 → **0.4**, one step and not a jump back to
the 0.25 that was already refused. Still eyework.

### B6. The house's SEAMS still misbehave

"Всё ещё текстуры странно себя ведут на стыках дома." The per-record `renderOrder`
fixed the z-fight between the twelve COPLANAR pairs; something else is left. Two
candidates, **neither measured**: the 64-unit overlap itself (the faces are inside
each other, not merely touching), and texture bleed at the UV edges — the atlas
has no padding and the models' UVs are in pixels.

### B7. A pig thrown by a blast SPINS about its own axis

"Летящая свинья вроде ещё крутится вокруг своей оси." **Both first guesses are
measured out**: not the draw path (`heading` reaches the picture from one place
and nothing writes it from a velocity), and not the clip (BOUNCE is clip 39,
twenty frames, bone 0 does not move at all and its root track has a y span of
zero). What is left unexamined is the wall EJECT — `state.heading =
query.downhill(...) ?? state.heading + π` in `locomotion.ts`, which a pig landing
wedged runs every 25 frames.

### B8. Walking into a dummy shoulders the pig PAST it

Measured: hold W at a dummy and the pig is stopped 149 out, then the wedge counter
sidesteps it — x moves and z holds for four ticks — and it squeezes round the
corner and ends up **687 units beyond**. Play confirmed the reading: "это потому
что постепенно сдвиг в бок идёт и обход цели — не проход насквозь." The collision
holds; what has to stop is the wedge firing on a small free-standing box. The
wedge exists to get a pig off a WALL.

### B9. A trodden mine wants an EXCLAMATION MARK over it

Six places ruled out by measurement rather than by looking: the mine's effect
(0x4c/0x55 are the BLAST, row 14), the whole tread path (0x46bfd9..0x46c169), the
projectile's model, `WE_BANG`, `MAPICONS.MTD`, all 743 texture names in the
install, and every one of `gtext`'s 272 strings. **Where to look next — and
fonttims IS traced now** (2026-08-11, `library/notes.md`): **0x44EBA0** is the
battle's only consumer of `fonttims.mad` (`[0x520668+0x3F8]`), it draws in
world space, and the damage numbers flow through it (particle type 0x23 →
0x44F950). An exclamation mark over a mine would be drawn there; read its
callers (0x440A20, 0x45E110) for a site passing a character rather than a
value. `weapons/mines.md` has the negative results.

### B10. The mine REVEAL is a texture swap, and now it is READ

"Инженеры и командос с героем видят жёлто-чёрные текстуры там где есть мины", the
range applies to the ground AND the map view, and the enemy is not shown them at
all. What is built instead is the `WE_MINE` model for the engineer family (5, 6,
7) inside 1024 on the ground. Play parked it twice — "индикатор мин пока рано, у
нас нет инженеров щас" — so it waits on the classes.

**Read 2026-08-18, and three of those four clauses need correcting.** Play's
memory of the yellow-and-black GROUND is exactly right and it is the whole of
the mechanic:

- **The reveal is 0x4767A0**: a 3×3 block of tiles round the pig, read through
  `Map::GetTile` into `[pig+0x182]` and stamped back through `Map::SetTile`
  (0x4768C0 / 0x476BA5 → `afAdjustMapTile`), the cell it was taken at kept at
  `[pig+0x2C]`/`[pig+0x2E]` so it travels with the pig. The tail walks the same
  3×3 testing bit 0x40, the mine flag. **So the range is THREE TILES, not
  1024** — `DETECT_RANGE` in `lib/game/mines.ts` is an invention that should go.
- **The classes are `[pig+0x19C] ∈ {4, 5, 6, 7, 0x0E}`** — COMMANDO, SAPPER,
  ENGINEER, SABOTEUR, HERO, gated also on `[pig+0x2EC]` not being 1 or 8. Our
  `DETECTORS = new Set([5, 6, 7])` is the set that CARRIES skill 35 MINE, which
  is a different thing from the set that SEES one.
- **The map shows a minefield, but not through this and not as a marker.**
  `bomb` in MAPICONS.MTD has no reference anywhere in `_d3d.dll` — mines are a
  tile bit and not an object, so there is nothing to hang a blip on. What the
  map does instead is bake the bit into its own picture: `afInitScanner`'s fill
  loop writes a solid RED texel wherever `flags & 0x40` is set (dll
  0x1000A3E6), once, when the battle opens. So a placed minefield is red ground
  on everybody's map with no class gate and no range, and a mine LAID during
  play never appears there at all — the texture is never rebuilt. "The enemy is
  not shown them" is not implemented in either place.

Still waiting on the classes to exist, so this is a correction to make when the
work is picked up, not one to make now.

### B12. Two specs are FLAKY, and they were flaky before the step jump

Found 2026-08-12 while running phase 002 over the training-step work, and both
were checked against the tree WITHOUT it — `git stash`, rebuild, same two fail.
So neither is a regression, and neither is written down anywhere else.

- **`002/grenade.spec.ts:89`**, "the gauge fills while F is held": the thrown
  grenade's fuse read **4.25** against a floor of 4.5 (the window is 4.5..5.5
  for a fuse of 150 exe frames plus `rand() & 7`). It is measured after the
  throw over a round trip, so what the spec is really asserting is "the fuse has
  not burned much yet" — the read is late on a busy machine. Either measure the
  fuse against the moment the lob appeared, or widen the floor and say why.
- **`002/mines.spec.ts:494`**, "TNT goes down IN FRONT of the pig": it polls for
  the lay clip and then asserts nothing is planted yet, but the charge goes down
  on the clip's own event at phase 1314 of 4096 — about a third of the way in —
  so a poll that lands late finds one already down. It wants the assertion taken
  at a phase rather than at "the clip is up".

Neither has been touched: they are timing in the SPECS, not behaviour, and the
fix is a measurement each rather than a tuned number.

### B11. `002/camera-smooth.spec.ts`'s opening drop scores worse near 60 fps

0.157 at 144 fps and 0.355 at 62, a hair over the engine's own 60 Hz step, so its
bar is 0.5 where the other two are 0.35. The measure itself is sound (it is a
rate, not a step). What is not answered is why the DESCENT is the one that shows
it: the suspect is `dropInArt.riseOver`, handed to the chase separately and
tweened by nothing.

---

## C. THE REST OF GETTING INSIDE

The SHELTER is done end to end. What is left round it:

- **The PILLBOX** wants its own two weapons, **45 HEAVY M-GUN** and **46 FLAME
  THROWER**, and the GUN_BARRELS group beside them (BIGBAR, BUNKGUN, PILLBAR,
  AMPHGUN, B_GUN, TANBAR). `buildingSkills` is the table they go in and it is
  empty on purpose until they exist.
- **A VEHICLE is the other half** — skill 60 VEHICLE INOUT, `[pig+0x2ec] = 3`,
  body type 0x1358, through `0x49a320` instead of the building's `0x43f7f0`.
  None of it is built.
- **Some pigs START inside**: `0x47d4e0` runs once from the map loader, walks the
  object list for every pig whose `[+0x3c0]` is 1, and boards the nearest thing
  within **4096** units. Which marker bit fills `[+0x3c0]` is not decoded (the
  loader takes it from a stack table at `[esp + (flags & 0x40) + 0xc8]`, 0x4a6768).
- Two more for the day a pillbox is worth entering: the exe refuses a building the
  OTHER SIDE is holding (`0x43f910` against `[+0x194]`), and its own reach test
  differences a pair of words out of `0x44e850` that have not been transcribed.

---

## D. WHAT IS STILL NOT READ (disassembly gaps)

- **The frontend's OTHER screens — and there are FIFTY-TWO of them, wearing
  23 layouts.** A "screen id" 0..0x16 is the layout; the menus themselves are
  52 records of 72 bytes, built from tables in `.data`, and `frontend/menus.js`
  in the disasm repo prints all of them: title, items, and what each item
  DOES (an action and a parameter — 1 is navigation, 22 is a dead row, which
  is where our greyed-out OPTIONS comes from in the original). The main menu
  is record 1 of kind 1 and is read end to end. What that gives the next
  screen:
  - **MULTI-PLAYER is record 16 of kind 2** — the same layout as SELECT TEAM,
    which is the family that loads `selcog` and `name0..5`, so that is where
    the carriage belongs. And the original's is **six** items — TEAM A, B, C,
    D, then DONE and NETWORK — where ours is four slots and three actions.
  - the tree above it: ONE PLAYER → record 14 (NEW GAME → SELECT TEAM, LOAD
    GAME → LOAD), OPTIONS → record 2 (AUDIO, CONTROLS → CONTROLLER SETUP,
    CREDITS), QUIT APPLICATION → record 43, a REALLY QUIT APP? box.
- ~~**Where the frontend's WORDS land**~~ — READ, and built: a box per line
  out of `.data` (four per-screen tables for a screen's own string, one table
  of 16-byte records at 0x4C1728 for the ITEMS, indexed by a running total of
  the counts at 0x4C16C8), centred across the box, riding the entrance through
  a text origin that carries a constant -25. The whole frontend is CHARS2 —
  screen 3's CHARS3 is the only exception — and which of its three shades a
  line wears is decided by the MEAN of the colour it is asked for. **The one
  thing to check in play: our title was BIG and the game's is CHARS2**, half
  the height.
- ~~**What the plate widget's two per-frame numbers do**~~ — READ: a crop and
  a drop on the words as the plate turns, `k = 100 - |v|` per cent of a
  letter's height, dropped by what it lost. The rows and the title get
  different tables, so they turn at different rates.

**A sweep on 2026-08-11 closed most of this list** — the reads are in the
disasm repo; what survives of each item is the WIRING, which waits for play to
ask. And one discovery reshapes the leftovers: **`wh32LIB.DLL` is the LaserLok
copy protection, not the renderer** — every library call the exe makes goes to
`Data/_d3d.dll`, which ships in the install with 94 named exports, and the
exe's whole slot table is now mapped (`library/notes.md`). Nothing is "in a
library that cannot be read" any more.

- ~~**`[contact+0x14]`**~~ — READ (`weapons/fire.md`): it is the |v| of the
  contacting body's velocity — the TOTAL speed, not in-plane — and the
  flat-vs-plunge verdict is a CLASS BYTE beside it, `[contact+0x30]` (2 rising,
  1 grazing, 0 plunging; getter 0x409C10). The water arm gates on BOTH, with a
  douse gate nobody had seen: a fast plunge (class 0) douses however hard it
  arrives. The remake's in-plane reading got the behaviour right and the
  mechanism wrong; `lib/game/grenade.ts` could carry the exe's own two-part
  test now (total speed against 150, and drop-dominates refuses the skip).
- ~~**effect 0x0D**~~ — READ (`effects/notes.md`): twenty grey five-frame
  droplets thrown up 20..50 under gravity, plus six frames of mud-red (25,0,5)
  streak particles along the travel — a modest MUD spray, no rings, beside the
  full splash's rings-and-cloud. Wiring it where the skip borrows 0x0E is
  remake work.
- ~~**`0x48c410`, stages D and E**~~ — READ (`effects/notes.md`): a circular
  FAN of smoke-jet child effects, fifty frames a jet. Stage D is enabled in
  exactly rows 1 and 16; **stages E and C are enabled in NO row of the
  nineteen** (row 16 carries both authored and switched off), so neither ever
  runs in the shipped game. Row 1 and row 16 are transcribed, and the id → row
  map plus a per-row stage-enable table are in the notes. B3's remaining half
  is purely `lib/game/effects.ts` work.
- ~~**a sprite's SIZE unit**~~ — READ (`library/notes.md`, 2026-08-11 second
  pass): the 2D-poly record's half-extents go through the SAME perspective
  factor as its position, so they are WORLD UNITS at the sprite's own depth —
  `BLOB_UNIT` can die in favour of the exe's own formulas (cloud sprites
  `(200−age)·[+0x7E]·12.5`; particles `(a1·10 + a2·age/10)`-shaped, with a10
  a linear brightness fade). Two surprises came with it: **effect particles
  are TEXTURED, from `expltims.mad`** — the `ptp*` puff art, the `num0..9`
  digit art and the pig's `Shad_org` shadow all live there — and **the blend
  is ADDITIVE ONE:ONE** (flags 0x5A) for sprites, particles and clouds
  alike. Play's standing complaint is that the black smoke NEVER APPEARS
  (the "additive cannot darken" line was the remake's own reasoning, never
  play's), and the read says the remake's smoke is missing the ART as much
  as the law — the fix to try is the real `ptp` textures with the exe's
  colours, under both blend modes, shown to play.
- ~~**`afSetZoom`**~~ — READ: the target is `15 + 45·z/4096` fifteenths of
  the base focal length, so full zoom 0x1000 is **exactly ×4** —
  `SCOPE_MAGNIFY = 4` was the original's own number all along — and the
  library GLIDES the live zoom a third of the gap per frame (Begin2D's
  tail), on top of the exe's 0x20-a-frame creep. `lib/game/zoom.ts` could
  carry the glide.
- ~~**`ANIM.PARACHUTE = 82`**~~ — was already answered in
  `parachute/notes.md`: MCAP ships 93 clips, the exe's 59-name array is not
  the index order at the tail, and `Pig::SetAnim`'s only clamp is
  `id >= 0x53 → 0`, so 82 is the last reachable clip and its pose ranks 2nd
  of 93 for the hands-above-the-shoulders hang. Nothing left to chase.
- ~~**The weapon record's `+0x28`/`+0x2C`**~~ — READ (`weapons/fire.md`,
  `weapons/notes.md`), and the hand-fuse theory was wrong: the record's tail
  is three 16-byte ANIMATION steps `(clip, direction, repeats, rate)`.
  `+0x28` is the attack clip's repeat count (4 on skills 58/59, else 1) and
  `+0x2C` a signed playback-rate multiplier (negative = backward; every
  shipped value is 1). Non-zero exactly where an attack clip exists.
- ~~**`pcpie4`**~~ — FOUND, and the whole DASHBOARD with it
  (`library/notes.md`, "THE DASHBOARD, end to end"). The earlier "structural
  negative" was a one-slot mis-parse of the loader's handle table — dashtims
  is `[0x520668+0x400]`, not +0x3E0 — and once corrected: init `0x454578`
  resolves pcpie4 (entry 25) into a four-vertex pretransformed buffer at
  `[0x51C640]`, and **`0x457FB0` draws it WHOLE every frame — there is NO
  fill mechanic** — gated only on `[0x537F24]+0x458` (plausibly the skill
  in hand) being outside 19..26, the grenade family. So the original's lens
  never fills or empties on the PC: it is the full red disc, hidden for the
  gauge weapons. The remake's class-driven clipping (`LAYOUT.gauge.lens`,
  off `Lob.contact`) is its own invention over play's memory — **play
  should see this reading before anything moves**. Two things nailed down
  since: **the field IS the skill in hand** (its eight writers hand the same
  number to the pig, including the literals 60 VEHICLE INOUT and 61 BUILDING
  INOUT), and **the ART is a full disc** — measured, 335 flat-red pixels in
  a brass ring with a specular highlight.

  **AND WHAT IT MEANS IS SETTLED — play's reading, which I first wrote down
  as refuted and which is in fact exactly right.** Play: "лампа гаснет
  именно там, где второе нажатие работает — ЭТО И ЕСТЬ ПОЛУЗАЛИВКА." The
  exe's two states are play's two states: the **full disc** is shown for
  everything that goes off by itself, and it is **absent** for skills 19..26
  — the grenade family, precisely the set where a second FIRE press
  hand-detonates. So the lens tells the player whether they still have a say.
  The half-filled circle is the weapon port showing through, i.e. the remake's
  own `LENS_ORDINARY = 0.5` in `ui/battle.ts` — and our existing rule
  (`lobOf(holding)?.contact ? 1 : 0.5`) already sorts the weapons the way the
  exe does. Nothing here needs changing; only the empty state is painted
  differently (the exe draws no disc at all rather than half of one).

  The mistake worth not repeating: I stated the correlation — "the family the
  lens is hidden for is exactly the family with hand-detonation" — and then
  concluded it disproved the meaning instead of being it. Same pass: the gauge
  slides in over 20 frames through an authored ease table (0x4D1958), the
  slider's x is `[game+0x4E4]` times two constants, the clock's digits are
  `dashtims[13 + digit]`, and — the big one — **the dashboard's LAYOUT is
  authored DATA at 0x4CF71C/0x4CF878/0x4CFA54, anchored to the screen dims**:
  the remake's eyework `LAYOUT` in `ui/hud.ts` could be replaced by the
  exe's own numbers, one mechanical transcription away. **B9's lead firmed
  up on the way: 0x44EBA0 is the battle's only fonttims consumer**
  (world-space text, fed by particle type 0x23 via 0x44F950), and
  0x447DC0/0x447FD0 are twin glyph-layout routines over a metrics table at
  0x51EC70.
- **The remaining barrel sounds.** Read and written down, not wired: 6 PISTOL 42
  `L_PISTOL`, 7 RIFLE 43 `L_RIFLE`, 11 SNIPER 43 at pitch **90**, 19/20 GRENADE 40
  `L_MINETR`, 30 GRENADE LAUNCHER 36, 37 TNT 35 `L_ARTIL`. One line each in
  `audio/battle.ts`.
- **The grenade's own projectile model** is row 412, `WE_GRE2`, out of the map's
  archive — read, deliberately not wired, because it changes how every grenade in
  the game looks and nothing has asked.

### The loose ends this sweep left, in plain words

None of these blocks anything; they are the threads that were *touched* and
not pulled, written here so nobody has to remember an address.

1. **What decides that a body reports its speed to a contact at all.** Two
   places build a contact and both first test one bit on the body; which
   bodies carry that bit is unread. Matters only if a collision ever behaves
   differently for one kind of thing than another. (`weapons/fire.md`.)
2. **A second number on the contact record**, sitting beside the speed and
   filled from the same call, which nothing in the water path reads. Probably
   a penetration depth. (`weapons/fire.md`.)
3. **What exactly the dashboard checks to hide the round lens.** It is a field
   on the game object holding a number in the 19..26 range for the grenade
   family — almost certainly "the skill in hand", but the field's writer was
   not chased, so the remake should not hang a rule on it yet.
   (`library/notes.md`.)
4. **One HUD widget function was not walked** — the small one beside the gauge
   and the dial. Everything around it is decoded, so it is a half-hour if a
   piece of brass ever turns out to be missing. (`library/notes.md`.)
5. **The dashboard's LAYOUT tables are located but not transcribed.** The
   positions live as authored records in the exe; turning them into numbers is
   mechanical and waits for a reason (see below — the next UI is the reason).

---

## E. BIGGER THINGS NOT BUILT

- ~~**The MAP**, bottom left of the dashboard.~~ **DONE 2026-08-18/19** —
  `ui/battleMap.ts` on `lib/game/scanner.ts` and `lib/game/mapRaster.ts`. It is
  the library's SCANNER, not a screen: a tilted square of the whole level that
  never opens, never closes and is never clipped. `scanner/notes.md` has the
  read; `docs/history/status.md` has what it corrected.
- ~~**The pigs wear their own nations.**~~ **DONE 2026-08-19** —
  `lib/game/nations.ts`, `army/skins.md`, `docs/history/pig.md`. The player's
  squad wears SELECT TEAM's choice and the enemy the campaign's schedule;
  hats included.
- **The rest of the battle screen** in the order play asks for it.
- **The two unbuilt menu screens** — MULTI-PLAYER leads somewhere, OPTIONS does
  not.
- ~~**There is no ESCAPE MENU**~~ — **BUILT, 2026-08-19.** Play named it on
  2026-08-11 and asked for it on 2026-08-19. `pause1..pause8` turned out not
  to be five two-frame widgets at all: they are the **nine-slice frame** of
  the menu's panel, eight 16×16 tiles drawn by 0x45B580, and which is which
  corner was measured off the art. The pause is a MODE (8), the world's tick
  is simply not advanced while it is up, and the menu is five rows drawn with
  the battle's small letters over the live frame. `lib/game/pauseMenu.ts` has
  the rules, `ui/pauseMenu.ts` draws them, `unit/pauseMenu.spec.ts` and
  `e2e/002/pause.spec.ts` pin both halves. Play's own constraint stands and is
  written into the code: a real pause is SINGLE-PLAYER only and multiplayer
  must never stop (docs/history/status.md, "Threads left mid-pull").
  **And the pause's own CAMERA is in, 2026-08-19** — mode 7, the MAP VIEW: the
  camera FLIES, `x = 11000·cos θ`, `z = 11000·sin 2θ` with the bearing
  advancing six of 4096 every frame, which is a FIGURE-EIGHT about the world
  origin at the height of the map's own peak; it looks at a pig, eased in at a
  thirteenth a frame, changing every 126 frames (`lib/game/mapView.ts`). Play
  reported it as "камера летает по кругу над картой" and it was a feature
  nobody had built rather than a bug — then caught the first build of it,
  which walked pig to pig with a still camera and was the VICTORY camera by
  another name. The exe also SHRINKS the corner scanner while it is up and we
  do not: play ruled the map one size. **Skill 63 MAP VIEW is the other way
  into the same mode and is still not built** — it wants the inventory entry
  and the input lockout, and the camera half now exists for it.

  **And the abort is FINISHED too, 2026-08-19** — by finding out there was
  nothing to finish. There is no MISSION ABORTED screen: gtext 189 carries
  those words and has no reader in the executable, and the 0x424298 an earlier
  note blamed is `push 0BDh` as a Y coordinate. The exe writes −2 into the
  outcome word and falls into the same debrief call the ordinary end takes,
  and that page asks only `outcome == 0` — so an abort IS a loss, on
  `pigbkpc2.bmp` with SPACE = RETRY and ESC = EDIT SQUAD. The pause's ABORT
  leaves with the `lost` verdict now; `aborted` stays what it was, the
  toolbar's walk-out, which is the remake's own button.
- **The sky is DONE and shown — this entry is provenance, not work.** The dome,
  the mood's fog and the weather are in and answered by play (2026-08-12);
  nothing below is a defect and none of it is visible. It is here so the next
  reader knows which numbers are the exe's and which are not.
  - **Which of the exe's two angle fields is yaw and which is pitch.** NOT a
    question about our camera, which is fine and untouched: the drawer takes
    `sin([view+0x11754])` for the fall and `cos([view+0x11758])` for the drift,
    and one virtual call fills both (0x44E2FC, not followed). Pitch on the
    first and heading on the second is what `angles()` assumes, along with a
    quarter-turn convention — 1024 is level — inferred from the fact that no
    other reading puts the snow the right way up.
  - **`FOG_SCALE`**, standing in for the undecoded factor between the library's
    z and the world's (`scale/notes.md`).
  - **`FALL_GAIN` and `SIZE_GAIN`**, play's two on top of the exe's amplitudes.
  - **the brightness divisor**: the exe's ramp is `(8 − phase) * 8` and this
    normalises it against its own 64 rather than the engine's 128.

  And one thing reading further cannot change: with the camera still the field
  has only four distinct velocities and 32 flakes move as one, because
  `m = reach − (i & 3)` and the third random the initialiser rolls per flake is
  read by neither drawer. Breaking that up would be a divergence, not a fix.
- **Fall damage** (`P_LAND1` is the impact that hurts, and nothing plays it).
- **The melee's own battle cry** — the same `0x43af70` call, not yet wired to a
  swing.
- **The puff a hoof throws.** The footstep handler loads three registers per
  surface and only the first is the sound (lib/game/footsteps.ts, done): the
  other two — 0x0B..0x0D and 0x27..0x2D — go to a 0xE4-byte object built at
  0x475421 and a virtual call at 0x47549d, which is the dust, the splash and
  the snow spray. Nothing draws them.
- **A gun's DAMAGE for the weapons with no row**, and where a no-gauge weapon's
  charge becomes 0xFFF.

---

## LOW — the odd corners, and play's ruling on each (2026-08-21)

Written down because they were raised in one sitting and answered in one:
**"запиши всё в туду как лоу - потом посмотрим если надо будет."** Nothing
here is scheduled. Each carries what play said, because on four of the six
the ruling changes what the work IS.

- **`FT_WOOD` is a KNOCK ON WOOD** — `[play]`, and it settles the footstep
  divergence rather than leaving it a guess. Over all 61 shipped maps there is
  **not one tile of type 2 or 3**, so two arms of `Pig::Footstep`'s twelve-way
  switch are unreachable and the file ships unplayed: the original crosses a
  deck to the sound of the ditch. `lib/game/underfoot.ts` already gives the
  bridge pieces their own material by NAME, and this says that is the right
  sound to be giving them.
- **`wat01`/`wat02` and the DLL's 49×49 grid are WATER TEXTURES** — `[play]`:
  "просто на пс1 их не было, на пк добавили - потом попробуем." So the open
  question is closed, and what is left is an experiment rather than a read.
  The remake draws one flat see-through sheet (CLAUDE.md); trying the two grey
  TIMs on it is a session of its own and play wants it later.
- **The tile turn's DIRECTION** — `[play]`: "плохо читал." The disassembly
  composes to a forward shift and the shipped maps say backward over 883 steep
  tiles, and the residual was blamed on an unfound v-convention flip in the
  TIM → page path. That is not an answer, it is a shrug. Read it again
  properly before touching the table, which is pinned byte by byte in
  `e2e/000/terrain-viewer.spec.ts`.
- **The IDLE CYCLE wants decoding** — `[play]`: "ну так надо расшифровать."
  A standing pig loops clip 27 and nothing else. The 80-byte table at 0x4D7300
  that a spent repeat count steps into is per-WEAPON, not per-pig, which is why
  an unarmed pig falls straight through it; what a pig does while it stands
  about is behind the exe's own "Choosing idle anim from scratch" string and
  nobody has followed it.
- **The FISH do not swim** — `[play]`: "они вроде не плавают а стоят на 1
  месте." 292 records across 13 maps at heights 160..432. They are dropped from
  the collision world by the two-unit rule (lib/game/obstacles.ts) and drawn
  like any other prop, so if they are standing still that is already faithful.
  Nothing to do unless play sees them moving in the original.
- **The three specs the CLASS KITS turned red are MINE** — `[play]`: "ну это
  ты сломал спеки когдато - тыж весь код пишешь." They were handed back as an
  open question and should not have been. `CLASS_KIT[0]` gives a grunt the
  bayonet, so `crate.spec:116`, `crate.spec:154` and `trainingStep.spec:124`
  fail, and the tutorial's first step leaves a GRENADE in hand instead of the
  blade. Decide it in the code and fix the specs with it.
- **The AIRSHIPS are in the data.** `EN_BIP` is the sound play named — "дережабли
  летают на картах" — and the POG carries **`BIGLOONY`, six records, all on
  LUNAR1**, at heights 1440..1984. `three/props.ts` draws by name off the map's
  own archive, so they are probably already drawn and simply silent. Open
  LUNAR1 before assuming anything is missing.
