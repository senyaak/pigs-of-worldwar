# TODO — everything open, in the order it is worth doing

Written 2026-08-11 so the list survives a chat being compacted. **One item at a
time**, top to bottom; each one says what is already known, what is measured, and
what the next move is, so nothing has to be re-derived from the conversation.

Addresses like `0x467a10` are `warhogs_.exe`. Paths of the form `weapons/fire.md`
are in the **disasm repo**, never in this tree (see CLAUDE.md).

---

## A. THE TUTORIAL — finish the training ground

The script MOVES now: a crate collected speaks, a crate PLACED speaks, and the
menu counts (CLAUDE.md, "THE TRAINING SCRIPT MOVES"). What is left is the end of
it and one line.

### A1. Killing the last dummy must END the mission

Play: "убить последний манекен — не заканчивает миссию… очевидно что заканчивает
миссию." Nothing in the remake ends a training level at all: `game.over` is
"nobody is left" over the SQUADS, and CAMP fields one pig and no enemy.

**What is known.** The tutorial's last four clips are the closers and their call
sites are already located (`tutorial/notes.md`): `0x48FAC7` clip **28** and
`0x48FAF4` clip **27**, both inside `0x48F490`; `0x4900F4` clip **26** in
`0x48FCA0`; `0x497F72` clip **21** in `0x497F20`. Clips 26, 27 and 28 are all
blank lines — voice only — which is what an ending sounds like.

**Next move.** Read `0x48F490` and `0x48FCA0` and find what state they are
testing; those two functions also carry the `[gameMode+0x329]` training flag and
`[+0x32C]`, so they are the right neighbourhood. Then wire an ending: what it
shows, what it does to the turn, and how the player leaves.

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

**Not read.** Row 1 itself. It reaches **stages D and E of `0x48c410`**, which
this repo has never decoded — row 0 does not use them, which is why they were
skipped. Transcribe row 1 out of the 143-byte-per-kind table at `0x4d61e8`
(scaled per index by `0x4d6c88`), decode stages D and E, and add the row to
`lib/game/effects.ts` beside `ROW_ZERO` and `MINE_EFFECT`. Then `Charge` has to
carry the effect id the way the mine's already does.

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
install, and every one of `gtext`'s 272 strings. **Where to look next:** the
battle FONT drawn in world space the way a damage number is — effect 0x35 through
`0x487b90`, and a sibling call passing a character rather than a value would be it
— and `Language/Tims/fonttims.mad`, which nothing in the exe has been traced to.
`weapons/mines.md` has the negative results.

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

- **`[contact+0x14]`** — the scalar the water arm gates on and scales the skip's
  upward kick by. Filled at contact construction (0x409ca0, 0x409af9) from the
  creator's argument, sitting between the contact's two three-float vectors, and
  at least one creation site passes zero. The remake takes it as the IN-PLANE
  speed because that is the only reading that makes a vertical drop sink and a
  flat throw skip, but the field's identity is not transcribed.
- **effect 0x0D** — what a SKIP off water leaves. Not decoded past its jitter; the
  splash (0x0E) stands in, which is why a skim and a sinking look alike.
- **`0x48c410`, stages D and E**, which rows 1 and 16 reach and row 0 does not;
  and **stage C**, the inline flash, which no decoded row turns on. (Row 1 is
  B3 above.)
- **a sprite's SIZE unit** belongs to `wh32LIB.DLL` and cannot come out of the
  exe. `BLOB_UNIT`, `BLOB_ALPHA`, `PUFF_SIZE` and the trail's own pair are the
  remake's and say so at the field.
- **`ANIM.PARACHUTE = 82` against a table that names 59 clips.** The parachute
  works in play, so either MCAP holds more clips than the exe names or 82 is
  wrong and the canopy hangs on something else.
- **The weapon record's `+0x28`/`+0x2C`** — 1 on the grenade and TNT, 0 on the
  rifle, the bazooka and the grenade launcher. That splits "things with a fuse you
  might set off by hand" from "things that go off by themselves", which is
  suspiciously close to B1; readers unchased.
- **`pcpie4`** — the lens at the gauge's left end. The sprite is entry 25 of
  `dashtims.mad` and its drawer has never been found, so how full it is, which way
  it fills and where it sits are all play's word rather than a reading.
- **The remaining barrel sounds.** Read and written down, not wired: 6 PISTOL 42
  `L_PISTOL`, 7 RIFLE 43 `L_RIFLE`, 11 SNIPER 43 at pitch **90**, 19/20 GRENADE 40
  `L_MINETR`, 30 GRENADE LAUNCHER 36, 37 TNT 35 `L_ARTIL`. One line each in
  `audio/battle.ts`.
- **The grenade's own projectile model** is row 412, `WE_GRE2`, out of the map's
  archive — read, deliberately not wired, because it changes how every grenade in
  the game looks and nothing has asked.

---

## E. BIGGER THINGS NOT BUILT

- **The MAP**, bottom left of the dashboard.
- **The rest of the battle screen** in the order play asks for it.
- **The two unbuilt menu screens** — MULTI-PLAYER leads somewhere, OPTIONS does
  not.
- **There is no SKY.** The battle renders against a flat clear colour.
- **Fall damage** (`P_LAND1` is the impact that hurts, and nothing plays it).
- **The melee's own battle cry** — the same `0x43af70` call, not yet wired to a
  swing.
- **Footsteps**, which want the hoof-contact frames `anim/audio-events.md`
  derives; a footstep on a timer would be a stand-in nobody asked for.
- **A gun's DAMAGE for the weapons with no row**, and where a no-gauge weapon's
  charge becomes 0xFFF.
