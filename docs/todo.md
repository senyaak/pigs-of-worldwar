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
todo's own premise was wrong about them: clip **21** is the first MINE going off
on the training ground (the projectile constructor, ammo rows 0x28/0x29), and
clip **26** is a turn whose clock ran out with **no weapon used** — `[+0x334]` is
incremented by the fire dispatcher and zeroed at the top of each turn. Neither is
built; both are one line each now that they are read.

**What is NOT pinned**: the honest eleven-dummy path. `e2e/000/engine-headless.spec.ts`
drives the whole seam — handover, ending, the three-second hold, the battle being
put away — on a CAMP built with its DUMMY records left off, because reaching the
condition legitimately is the entire tutorial. `e2e/002/endOfGame.spec.ts` pins
the data around it.

### A2. Clip 4 — the one line of the script that is not built

`0x492B32` speaks clip 4 ("PRESS SPACE TO SELECT YOUR WEAPON") only when
`[gameMode+0]` is 3 (0x492af5). That field is not identified — it is read two
instructions earlier to decide whether the menu cursor gets initialised, so it is
not a vtable slot being misread. Find its writer and the line falls out.

### A3. The camera looks the pig in the FACE under the canopy

Play remembers it and it is not traced. The remake's chase camera watches from
behind for the whole opening drop.

---

## B. PLAY'S REPORTS, still open

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

### B1. A bazooka can be hand-detonated like a grenade

Play: "базуку можно взорвать как гранату — баг." `Lobs.detonateNow` sets off
everything that is live, and the second fire press reaches it through the same
control layer a grenade uses. A CONTACT rocket has no fuse to cut short: it goes
off when it touches something and at no other time.

**Next move.** Refuse `detonateNow` for a row with `contact` set, and check the
control set at the same time — `weaponLayer(29)` is `'lob'`, so the second press
is being offered at all. The exe's own trigger for hand-detonation has never been
found (`lobs.ts` says so at the method), so this is the remake's rule either way.

### B2. TNT's blast is too big to get clear of

Play: "у динамита радиус слишком большой — я отхожу задом все 4 секунды, а меня
всё равно задевает на 4 урона."

**Measured.** The row is 50 points over a blast field of 2048; `blastReach` makes
that 1536; the exe's falloff (`0x48CBA0`) reaches **zero only at 2560** — 512 of
core plus 4/3 of the reach. The fuse is 5.83 s, planting hands back **4**, the
laying clip eats the start of it, and backing away is HALF speed (520 a second),
so about 2000 units. 2000 against 2560 is the complaint exactly.

**Next move — and the trap.** The falloff says how MUCH, not WHO. Two candidates
for who, and CLAUDE.md warns the range has been misread once already:

- the **±0x400 box** the projectile's update walks the pig list with (0x437775),
  which sets `[pig+0x180]` — 1024 on each axis, and what that byte means was
  never followed;
- the EFFECT's own body, which is a **sphere of radius 35** (0x4a8f42) — far too
  small to be the reach on its own, so if that is the contact then something else
  grows it.

Read `Pig::OnHit`'s effect arm (0x4778ae) to its last instruction and find what
gates it before `0x48CBA0` is called. Do not tune a constant first.

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

### B4. The rocket is drawn crooked, and it wants its own trail

Play: "прожектайл кривой при выстреле базуки… также шлейф — своего рода дым такой
белый."

`three/grenades.ts` points a flying lob along its velocity with a yaw and a pitch,
which assumes the model's nose is +Z. `WE_TNT`'s long axis turned out to be **−X**
(that is what `STAND` is for), so `WE_BAZZ`'s wants measuring the same way — off
the model's own vertices and the textures on them — rather than guessed.

The TRAIL is a separate half and the machinery is already there: `lib/game/trail.ts`
carries `LOB_TRAIL` and `FUSE_TRAIL` and `three/lobTrail.ts` draws either. Read
kind 10's constructor arm for a parented effect the way the grenade's (0x15) and
the charge's (0x1D) were read — the arm is `0x432414`, shared with kind 52, and it
already hangs 0x1D. Play says WHITE smoke, so the particle type's colour is the
thing to check.

### B5. The wall and the ceiling want to be a little more see-through

Play: "ещё чуть-чуть сильнее надо чтобы просвечивало — именно прозрачность стен и
потолка." `SEE_THROUGH` in `three/props.ts` is 0.5 (it was 0.25, and play asked
for more solid, then for a little less). This is eyework: move it a step and shoot
a screenshot.

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

### B10. The mine REVEAL is a texture swap, for three classes

"Инженеры и командос с героем видят жёлто-чёрные текстуры там где есть мины", the
range applies to the ground AND the map view, and the enemy is not shown them at
all. What is built instead is the `WE_MINE` model for the engineer family (5, 6,
7) inside 1024 on the ground. Play parked it twice — "индикатор мин пока рано, у
нас нет инженеров щас" — so it waits on the classes.

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

- **The MAP**, bottom left of the dashboard.
- **The rest of the battle screen** in the order play asks for it.
- **The two unbuilt menu screens** — MULTI-PLAYER leads somewhere, OPTIONS does
  not.
- **There is no ESCAPE MENU**, and play named it (2026-08-11). The original has
  one and its ART SHIPS: `dashtims.mad` entries 26..35 are `score1`, `score2`
  and `pause1..pause8`, and the battle's dashboard init LOADS ALL TEN at
  startup — five two-frame widgets, built the same way as the dial and the
  gauge (the loop at 0x45709D..0x45734F, two pages an iteration; see "THE
  DASHBOARD" in `library/notes.md`). The exe's own pause is a MODE: the beat
  at the top of a turn lists the pause button as one of its three ways out
  (0x4d8a2c, `turns/notes.md`). So an escape menu has a decoded skeleton to
  sit on — the widget machinery, the art, and a mode to enter — and this is
  the job that would justify transcribing the layout tables (D's loose end 5),
  because a new UI wants the original's coordinates rather than fresh eyework.
  Note the remake's own constraint from play: a real pause is single-player
  only, and multiplayer must never stop (CLAUDE.md, "Threads left mid-pull").
- **There is no SKY.** The battle renders against a flat clear colour.
- **Fall damage** (`P_LAND1` is the impact that hurts, and nothing plays it).
- **The melee's own battle cry** — the same `0x43af70` call, not yet wired to a
  swing.
- **Footsteps**, which want the hoof-contact frames `anim/audio-events.md`
  derives; a footstep on a timer would be a stand-in nobody asked for.
- **A gun's DAMAGE for the weapons with no row**, and where a no-gauge weapon's
  charge becomes 0xFFF.
