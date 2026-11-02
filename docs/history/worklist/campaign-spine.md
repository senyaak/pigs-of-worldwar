# 0. THE CAMPAIGN'S SPINE — a save, then NEW GAME and LOAD GAME

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

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

## The order to do it in

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
