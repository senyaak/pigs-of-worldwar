# Weapons

The shot, the sights, the grenades, the mines and the charges.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## The SHOT, end to end

Aiming and firing landed in this order: the projectile's rules
(`lib/game/projectile.ts`), the aim view on a HELD G, the scope overlay, the
bullet and its hit (`three/shots.ts`). Play named six things wrong with it and
all six are now done. What each turned out to be, because most of them were
not what the list guessed:

1. **The scope's gaps** were rounding at the joins, as suspected. The four
   quadrants now run a pixel past the centre lines and the surround starts a
   pixel inside them (`ui/hud.ts`, `LAYOUT.scope.overlap`). Every join is the
   same solid rgb(8,8,8), so the overlap costs nothing.

2. **The bullet has a body.** `0x4a8ed5` is the only place a projectile's size
   is decided and it reads the KIND: 35 model units for every gun but the
   pistol's 100. `three/shots.ts` draws a sphere of exactly that instead of
   the invisible one-pixel streak. The colour is still the remake's — the
   factory takes it out of a palette at 0x4de9d0 that has not been read.

3. **The sequence is built** (`lib/game/shot.ts`): press → leave the sights →
   the pig says a line → ten frames of fuse → the bullet, the attack clip, and
   the camera riding it (`chase.ride`, mode 1, whose row is the chase's own
   3072) → back to the pig when the air is empty. The turn clock does not run
   for any of it. The **pig voice** is new and its own module
   (`audio/pigVoice.ts`, decoded in `speech/pigs.md`):
   `Speech/Sku1/Pig{NN}/{NN}{LANG}{CC}{VV}.wav`, twelve firing lines walked in
   rotation, and NN belongs to the squad rather than the pig.

4. **The gate is `[pig+0x230]`**, and it needed no new mechanism: the sequence
   itself is the gate. A press while `firing` is set is dropped, which is
   `Pig::MayAct` refusing for the window between the press and the attack
   (0x467a10, listed in full in `fire.md`).

5. **The wobble is entirely the remake's** and `lib/game/wobble.ts` says so at
   the top. Nothing in the binary drifts an aim: `Pig::Aim` adds the input,
   clamps to ±0x3FF and stops, with no RNG anywhere on the path. Two slow
   sines at periods that do not divide each other, applied to the view AND the
   shot together, because the crosshair is fixed at the middle of the screen.

6. **The sniper rifle was the SCRIPT, not the lists** — though the lists were
   wrong too and are fixed (one `targets` array, shared). The real rule is the
   guard at 0x4aa6e7: an object with opcode 22 or 23 places nothing while any
   OTHER object is still waiting on the label it itself waited on. So a group
   raised by one signal is one step, and only the last of it to fall speaks.
   Two dummies wait on 2; both must go down. Reading that also corrected two
   things this repo had backwards: **a placed DUMMY keeps its command** (only
   the pickup branch clears it, 0x4aa659 jumps over the line) — without which
   no chain could run past its first step — and **`Pig::ClearInventory` is
   called only when a CRATE is placed**, not on every placement.

## The beat after the blow

Play, straight after: "останавливается таймер и показывается как ящик на
парашюте спускается… после попадания пару секунд показывается ещё то место, а
только потом запускается таймер и показывается свин." All of it turned out to
be one wait in the binary and it is now built (`lib/game/aftermath.ts`,
decoded in `turns/aftermath.md`).

Knocking anything down stops the turn clock and takes the camera off the pig.
It goes to whatever the script just placed — the exe hands the crate to the
camera as its subject and asks for **mode 0**, the ordinary chase row, so the
descent is framed exactly as a pig is (0x4661a0). The turn comes back only
once nothing is still moving AND fifteen quiet frames have gone by on top:
`0x415420` is one global counter that every other bail on the list zeroes, so
the second is measured from the world settling, not from the blow.

**Jump cuts the crate's canopy.** That one is play's guess ("вроде можно
пробел нажать") and `airDrop.ts` says so at the method — a pig cuts its own
with the same key, and nothing in the exe has been read either way.

## The scope is bolted to the HAND

Play pushed back on the wobble — "если не нашёл, так надо лучше искать" — and
they were right. The earlier negative result was right about the ANGLE and
wrong about the question.

`0x4a2e30`, the rifle cam, never reads its row of the mode table. It takes
row 14 of the offset table at 0x4d0ee0 — **(44, 32, 230)**, the pistol's own
muzzle point — and puts it through **bone 5** with `0x440fb0`, the same
bone-to-world call the shot and the bayonet use. `[cam+0x60]` is zero for this
mode so there is no smoothing: the camera is where the hand is, this frame.
That also settles what the mode table could not — **the aim view IS first
person**, and its 2048 is simply not read.

So `three/chase.ts` mounts the scope there (`SCOPE_MOUNT`, `SCOPE_BONE`) and
the battle hands it the posed world point. The wobble comes free: measured off
the shipped `mcap.mad`, with the guns' aim pose held on the arm and the idle
clip underneath, that mount travels ~32 model units across, 26 up and 13
forward every 2.4-second breath. The DIRECTION is still built from the pig's
heading and the aim angle, as the exe builds it, so a breathing hand shifts
the view without steering it.

`lib/game/wobble.ts` survives as a declared EXAGGERATION on top — a degree of
breath is not what play wants to feel. Zero its `SCALE` and the scope still
breathes, just quietly.

## The SIGHTS: the eye is sampled once a frame, the sniper zooms

Play: "дрожание совсем не то — щас плавает, а в оригинале прям дрожит /
прожектайлы летят через стены / снайперский прицел начинает с малого зума и
автоматом увеличивается до предела." All three are done and two of them are
decoded outright.

**The eye is SAMPLED ONCE AN ENGINE FRAME**, and that turned out to matter
more than the tremor did. Measured in play, the scope camera moved on 267 of
289 rendered frames — the mount is on a bone the pose interpolates, so the
breath glided however the drift was shaped. Holding the eye between engine
frames (`three/battle.ts`, `scopeEye`) inverts it: 259 of 290 frames now hold
perfectly still and the rest jump, biggest step 2.16 against a mean of 0.13.
The exe places this camera once a game frame; sampling an interpolated
skeleton at sixty was the bug.

**The camera's own shake is the wrong kind** — 0x49fea0 jitters all three axes and
decays the amplitude every frame (0x4a0002), which is a blast, not something held.
Where the tremor DID come from is at the end of this file.

**The sniper's magnification is the view manager's**, and it closed a question
`fire.md` had carried from the start. `afSetZoom` is a library entry at
`[0x537fd4]`; every caller of the setter passes zero, and the ADDER has one
caller — for skill 11 and skill 64 only, the input handler creeps the zoom in
by **0x20 a frame** toward **0x1000** (0x495e75). The same handler scales the
aim step by `(0x1000 − zoom) >> 12`, floored, so the sights get finer the
closer they look. `lib/game/zoom.ts` has all of it. What 0x1000 does to a
field of view IS read now (2026-08-11, `library/notes.md` in the disasm repo —
the library turned out to be `Data/_d3d.dll`, in the install all along):
`afSetZoom` sets a target of `15 + 45·z/4096` fifteenths of the base focal
length, so full zoom is **exactly ×4** — `SCOPE_MAGNIFY = 4` in
`three/chase.ts` was the original's own number — and the library glides the
live zoom a third of the gap per frame, which the remake does not yet.

**Bullets stop at the world.** `ObstacleField.solid(x, y, z)` is a new POINT
test — `blocks` is shaped like a pig, with feet and a step-up reach, which a
bullet is not — and `three/shots.ts` checks the ground height and that box
before it checks anyone's body. The exe's projectile update reads the terrain
table itself at four sites inside 0x436xxx, so this is the shape of it rather
than an invention.

**Sideways now moves at the same rate as up and down.** That is the remake's
choice and `rampedStep` in `lib/game/aim.ts` says so: the pad gives the aim a
ramp to 0x20 a frame (0x492bf5) and the turn a flat 0x40 the instant the key
goes down (0x492bb8), so in the exe left/right is twice as fast AND instant.
Only the aim view is changed; a pig turning on its feet turns as it always
did.

Left open on this whole thread, and all of it flagged where it lives: a gun's
DAMAGE (`SHOT_DAMAGE = 20` is invented), where a no-gauge weapon's charge
becomes 0xFFF, what bit 0 of a body's `+0x44` means at 0x47a24b, the melee's
own battle cry — the same `0x43af70` call, not yet wired to a swing — and
which mode number the wait above actually is. (The sniper's magnification
used to be on this list; it is read now — exactly ×4, see the zoom paragraph
above.)

## One thing at a time, and the sights hold still

Play's list after watching it run, and what each turned out to be.

**The next animation waits for the last one.** "всегда так — ждёшь конца одной
анимации и включаешь другую." Breaking a dummy no longer runs its script
step on the spot: `onBroken` parks it as `pending` and the aftermath only runs
it once the smoke off the dummy is gone (`effects.smoke() === 0`), so the
crate starts down after the dummy has finished coming apart rather than
through it.

**The clock stops for the whole blow**, from the button going down to the end
of showing what it did — a swing, a shot, and the beat after either. One
predicate, `blowInProgress`, and the exe's own gate agrees: `Pig::MayAct` is
false for all of it.

**The sights do not come back on their own.** Firing drops them, and they stay
dropped until G is actually released — `sightingRefused`. Holding the key
through a shot used to snap the scope back over the flight.

**Nothing moves the sights once the trigger is down**, and this one is
decoded: `Pig::Aim` (0x46a7f0) calls `Pig::MayAct` before it does anything and
bails when it is false, which it is from the press until the attack
(`[pig+0x230]`). Without it the bullet left along wherever the sights had
drifted to by the end of the ten-frame fuse — play: "будто секунду в сторону
движения прицела продолжал двигаться".

**No jumping down the sights.** The remake's reading: the exe routes input
through a different branch entirely while the aim bit is held (0x4928dc) and
no jump is reachable from it.

**The aim view reads the pad through its OWN arm** — found on the fourth pass
and it settles the sideways-speed question for good. Holding the aim bit hands
input to `0x495690`, which dispatches per camera mode, and mode 0x0E's arm
(0x495b29) has constants of its own: both the turn and the aim accumulate by
**1 a frame to a cap of 16**, against the ordinary handler's 2-to-0x20 and a
flat 0x40. So down the sights both axes are half the speed and were already
identical to each other. The remake had matched them by hand and called that
its own choice; it is the original's, and `SIGHT_RAMP`/`SIGHT_TOP` in
`lib/game/aim.ts` now say so.

**The scope camera's HEIGHT lags the hand by a third a frame** — read off the
rifle cam's short branch instruction by instruction (0x4a304e, scaled by the
double at 0x4bd6c8 = 0.333). X and Z come off the bone outright; the y is
nudged a third of the way and no further. So the picture snaps sideways and
drags vertically, and the two axes are never in step. `three/battle.ts`,
`EYE_LAG`. Closest thing to the tremor found so far.

**The crate waited on the wrong thing.** The gate was `effects.smoke() === 0`,
and the break effect's burst does not fire until its THIRD frame — so the
count was zero on the frame the dummy broke and the parachute started down
through the smoke anyway. `effects.busy()` is the whole effect, stages
included.

**`fire.md` lists every place a dedicated scope tremor is NOT**, so that search is
not run a sixth time: `Pig::Aim`, the shot's angle read, both branches of the rifle
cam, `Camera::Shake`, the engine's terrain-gated random walk, the view manager's
constructor seeding, `0x44E620` and `0x46a960`, and the camera's own accessors.

## GRENADES: the gauge, the fuse and the blast's reach

**The POWER GAUGE is built and it is the exe's throughout** (`lib/game/gauge.ts`).
A weapon's record byte `+0x14` says whether it has one — already read into
`Weapon.power` — and the fire button splits on it at 0x493796: with a gauge a
fresh press charges `[game+0x4e4]` by **0x50 a frame to 0xfff** and the throw
comes on the RELEASE or when it tops out; without one the press writes 1 and
fires now. The charge rides to `[pig+0x300]`, into the projectile constructor,
and becomes the flight speed as `row.speed * charge >> 12`. Fifty-two frames
to fill, which is three and a half seconds.

**So FIRE is a HELD action now** (`input/actions.ts`), and the scene is told
both edges through `setFiring`. A gun and a blade still go off on the rising
one; only a gauge weapon cares about the rest of the hold. A spec that only
`press`ed fire and never released it was passing by accident and is fixed —
a held action's press is idempotent, so the second one did nothing.

**The ARC is the engine's own number.** `0x4aa0d0` turned out not to be
"expire" at all — this repo had it recorded that way — but the physics world's
attach-a-force call: type 0x1357, the pig, gets the terminal-velocity force
and **everything else gets plain gravity, ten a frame squared**, with the
integrator's linear drag skipped for the projectile type outright. So
`PLAIN_GRAVITY` in `ballistics.ts` is read, not chosen, and a grenade is a
clean parabola. The same reading says a BULLET does not vanish at the end of
its range — it starts falling.

**The FUSE is decoded, and it is not three seconds — play said so and play was
right.** Row **+0x18** is the fuse in frames, not the damage: the projectile's
state machine (0x436938) starts a grenade in state 0, counts row +0x14 = three
frames, dispatches on row +0x1C's low byte to the arm that moves it to state 1
(0x4369e3), and state 1 is `cmp ecx,[esi+0B8h]` → state 6, which sets
`[proj+0x31] = 1` and it is over. `[proj+0xB8]` is row +0x18 plus `rand() & 7`,
written once in the constructor. So **150 frames and a little**, which at the
engine's own rate is a touch over five seconds — `fromExeFrames` in
ballistics.ts is that conversion and the second place to use it.

That was a self-inflicted error worth remembering: the row field was read as
damage "on its distribution" (zero for guns, a ladder for explosives) when
`fire.md` had already recorded, correctly, that it is compared against a
counter. **A distribution is a hint; an instruction is the answer.**

**`BLAST_REACH = 0x400` is NOT the blast's reach** — that reading is dead, and
what the flag means is read now (2026-08-11). The last thing a projectile's
update does is walk the pig list at `[0x51EE18]` and set `[pig+0x180]` on
everything inside ±0x400 on all three axes (0x437775); that byte has exactly two
readers and both are in the ANIMATION picker (0x46F457, 0x4721B7), where it puts
clip 0x21 on. **A pig with a live projectile within a tile of it COWERS.** It has
nothing to do with damage, and the note that offered it as a candidate for "who
is caught by a blast" was wrong. What decides that is still open — see the blast
paragraph further down and `weapons/fire.md`.

**The gauge shows whenever a weapon that HAS one is in hand**, not only while
it fills — which is what the original does with it. `charging()` returns 0
rather than null for those, and null for everything else.

Its art: `newpow3..7`, five 64×64 tiles laid left to right, measured rather
than guessed (5 and 6 are 61% identical and flat outside rows 9..29 — a
repeating middle), **clipped to their top 30 rows**, because below that every
column is the dashboard's own rgb(8,8,8) and blitting the tiles whole hangs a
black slab under the brass. Where the strip SITS is still eyework:
`pow.hud.layout.gauge`. `newpow1`, `newpow2` and `powg1` ship with them and are
deliberately NOT drawn — what they are has not been settled.

**`pow.give(19)` is how a grenade is reached at all.** No crate on the training
ground carries one — it hands out a bayonet and then a rifle — so the console
puts one in hand, the same way `pow.swapMap` picks a map. The remake's own.

## GRENADES: the arc, the angle, the bounce and the blast

Eight things, and half of them turned out to be readable.

**The angle was tracking all along and nothing showed it.** `scene.aim()` was
gated on `scrubsPose`, which is about whether there is an aiming CLIP for the
angle to scrub — and every thrown weapon is in that function's exclusion list,
because nothing thrown has one. So the needle went dead and the angle looked
frozen. The right test is the record's own `aims` bit. Two different questions
wearing one predicate.

**A grenade comes up at 45°, which is what the exe writes** — and that is a
process note as much as a constant. A remembered ~70° went in over the decoded
0x200 for one commit and came straight back out: "45 верно — я не так сказал —
сначала проверяем то что находим в движке." **An unambiguous decoded value gets
shipped and LOOKED AT before anything is substituted for it**; a remembered
figure is a reason to go and check the read, not to replace it. Play overrides
inferences — the wall envelope, the water, the clip playback — not clean
transcriptions nobody has seen yet.

**A thrown thing BOUNCES on its own numbers — decoded.** Row +0x10 is 1 for
every gun and 2 for everything lobbed, its only reader is inside the collision
code (0x4157a5), and the lobbed arm writes **0xFFF and 0x200 of 4096** onto the
collision record before resolving: almost perfectly elastic, almost
frictionless. That is play's "как камень отскакивать", and `LOB_BOUNCE` in
`grenade.ts` is it. A bullet's arm has none of it.

**Grenades sink.** Water is not a surface to skip off: `settle` checks
`isWater` and the region's own fitted `surface` before it checks the ground,
and a sunk grenade keeps falling to the bed. The sink rate is the remake's.

**A second F sets a live one off.** Play's, and `grenades.ts` says so at the
method — nothing in the exe's fire handler has been read for it.

**It is drawn as `WE_GREN`**, its own model out of `Chars/WEAPONS.MAD`
(`three/lobArt.ts`), free rather than bone-bound: the hand's copy un-resolves
each vertex against its bone's bind offset and a thing in flight has no bone.
Nothing draws a placeholder while it loads — a sphere kept "until the real one
lands" is a stand-in that outlives its excuse.

**The gauge, corrected twice.** The tile ORDER was right and MEASURED — mean
RGB distance across each seam is 28 / **2** / **2** / 38 for 3|4|5|6|7 against
107..181 for every wrong pairing — but clipping the tiles to their top thirty
rows cut the two ends in half, and there was no need for the clip at all:
index 0 is the TIM's transparent colour, so their black is a hole. And it is
**not a filling bar**: `powg1` is the SLIDER — 24×36 with its art eight pixels
wide and thirty-two tall — and it RUNS along the strip. `LAYOUT.gauge.track` is
where it travels and that is eyework.

**The EXPLOSION is in the projectile's DESTRUCTOR** — 0x432730, which
identifies itself by writing the projectile vtable 0x4BC468 back over the
object on its third instruction. That is why nothing in the update or the
constructor looked like a blast. It switches the kind through a 55-entry table
at 0x435A6C into forty arms, thirteen kilobytes of them, and **kind 24's is
effect `0x54` plus sound `12` (`E_1`) at 100/100** — with the row's +0x04 as
the effect's life and +0x08/+0x0C as its two parameters. No damage in the arm
at all, so the hurt comes from elsewhere.

**And the DAMAGE is decoded too — all of it, guns included.** It is not in the
weapon's record and not in a per-weapon switch; both were searched and both
searches were right. The physics world's contact loop calls the pig's
`vtable+0x54` (`Pig::OnHit`, 0x477390), which switches on the other body's
TYPE, and the arm for an **effect** gates on the effect's id being inside
`0x41..0x63` before asking `0x48CBA0` how much. That function is a **core of
512 units at full damage falling linearly to a QUARTER at the rim** — never to
nothing — and it bails to flat damage when the range is zero, which every gun's
is.

So **row +0x08 is the blast range and row +0x0C is the damage in 128ths**, and
the ladder is unmistakable: pistol and rifle 20 points, **sniper 40**, grenade
30, freeze grenade 60, guided missile 75, and the **medic dart 0** — it heals,
so it must not hurt. `SHOT_DAMAGE = 20` was invented and happened to be right
for two weapons out of thirteen; `damageOf(skill)` replaces it. Two terms of
the exe's range are left out and `grenade.ts` says which.

**The sound is wired** (`BATTLE_SOUNDS.blast`); the VISUAL still borrows the
break burst. `0x48CC90` turned out to be the effect's whole parameter-row
accessor — `0x4D61E8 + row*143 + offset`, scaled by `[0x4D6C88 + offset]`, with
the row index at `[effect+0xDC]` — so the one step left is which ROW id 0x54
takes. Init's id dispatch is spread through 0x487d80..0x4881d0 rather than
being a table.

That read also settles what row +0x04/+0x08/+0x0C are — an effect's life and
its two parameters, used by the every-fifth-frame TRAIL (0x4365f1, ids 0x5D and
0x5F) and by the blast alike — and rules out 0x4323f3, which is the
CONSTRUCTOR's switch and so the launch's noise.

## GRENADES: the gauge widget, the skim, the substep

**The gauge widget, measured properly.** Per assembled column the art's
vertical extent is tall and irregular out to x≈100, then **dead constant at
rows 1..37 from x 104 to 268**, then tall again: the flat middle is the TROUGH
and the ends are ornament. So the slider travels 108..264, not across the whole
320 — play saw it ("набор силы идёт по шкале, а не через весь виджет").
`newpow1`/`newpow2` are the missing piece at the top left and are drawn now;
the margin went to 0 to close the gap under it. Everything about WHERE remains
`pow.hud.layout.gauge`.

**A grenade SKIMS water while it has the speed.** The lobbed collision arm is
nearly elastic and the exe does not exempt water from it, so a flat throw skips
a pond exactly as it skips the ground; what sinks it is running out of speed,
and the threshold is `BOUNCE_CUTOFF`, the only figure the engine has for "too
slow to bounce". Play named both halves, one turn apart.

**It no longer falls through slopes.** The substep was the blast's 512 units; a
grenade is 35 across, and at 4500 a second a 512 step walks straight through a
tilted surface. It substeps by its own size now and is clamped above the ground
at the end of every one.

**No jumping behind a grenade.** `jumpRequested` is dropped while `firing` or
anything is in the air, on the same gate the sights use.

**`SWIM_SINK` was 280 against a pig 320 tall** — under to the eyebrows, which
is what play saw. It is eyework with nothing decoded behind it and it predates
the discovery that models are drawn at half size, so it halved with them.

## GRENADES: the effect ROW is found

**The blast is parameter ROW 0 — the same row a thing breaking uses.** The row
comes from a setter, `0x48CCC0`, whose twenty callers are all jump-table arms
inside `Effect::Init`; the dispatch is `slot = [0x489680 + id - 1]`,
`arm = [0x489574 + slot*4]` (0x4881e8). id 0x3e, the break burst, resolves to
row 0 — which is the CHECK, since `effects/notes.md` derived that from the other
end — and **id 0x54, the grenade's blast, is row 0 too**. What separates them is
the id (which is what decides whether it hurts) and the constructor's arguments.

So the missing explosion is not a missing row. It is **row 0's four other
STAGES**, through `0x48bff0` and `0x48c160`, each keyed on a row OFFSET through
`0x48CC90`. The remake draws one stage of five — the six-puff burst — which is
exactly why an explosion and a breaking look the same and neither looks like
much. **DONE the next day**: both spawners are decoded and all five stages are
built. See the fifth pass at the end of this file.

**The bounce MULTIPLIES the surface's material** — see "the BOUNCE was wrong all
along" below for the read, and for the two words this paragraph used to have wrong.

**The gauge fills in 1.7 s, not 3.4** — `EXE_FRAME_SECONDS` again, the third
place to need it. 0x50 a frame to 0xfff is 52 ENGINE frames.

**Is the blast range exact?** Nearly. `[0x4BD3FC]` reads 512.0, the same figure
the core uses, so it cancels against the core's own subtraction and the rim
lands at `row+0x08 + the struck body's own term`. The remake uses `row+0x08`
alone — the shape is exact, the rim is within about ten per cent, and what that
float on the body is has not been read.

**The camera does NOT avoid walls in the original, and that IS decoded.**
`Map::IsBlocked` has ten callers and not one is in the camera code
(0x49e000..0x4a6000); the camera's only world query is `Map::SampleHeight`, at
fifteen sites, keeping itself off the ground. There is no line-of-sight test to
restore, so swinging round an obstacle is the remake's invention. **Built
anyway, by request** — and kept in one file with the whole argument at the top
so it can be deleted in one go: `lib/game/sightline.ts` finds the nearest
heading either side that can SEE the subject, sampling the LINE rather than
just the camera point, and only `chase.ride` uses it. The ordinary chase does
not dodge — a pig you are driving is where you already know it is.

**And the mesh is lifted by the body's own radius.** The point that bounces is
the projectile's CENTRE, so a grenade resting on the ground was half buried and
its downhill half went under a slope.

## GRENADES: where the energy was going

**`bounceOff` carries a PIG's damping and a grenade must not use it.** Play:
"трение всё ещё съедает энергию — в игре граната всё время хоть чуть-чуть да
катится." Two separate things were wrong and neither was the coefficient:

1. **The `>> 3`.** `bounceOff` returns the normal part as `e * vn / 8`, and that
   eighth is `bounceSpeed`'s — the PIG's impact handler (0x4711d8 → 0x471247),
   which stops a pig ricocheting off its own behind. The SOLVER has no such
   term: `e = restitutionA * restitutionB` and nothing else (0x40f690). A
   projectile never reaches the pig's handler, so it was coming back with an
   eighth of what it arrived with on top of everything else being wrong.
2. **Friction once per CONTACT, not once per SUB-STEP.** The scene walks a
   grenade in steps of its own size and every step that ended below the surface
   took another 12.5% off the tangential. `bounceLob` now resolves nothing when
   the thing is already leaving the surface, which is the exe's own condition.

`bounceLob` does its own solve for exactly those two reasons and says so.

**The blast's range is row +0x04 = 1024, and there is no cap** — the first
reading took it off +0x08 by matching Init's stack slots to `0x487AD0`'s
arguments in ORDER instead of counting the frame. Counted instruction by
instruction (0x487b23..0x487b58): Init's arg 5, the ID, is `0x487AD0`'s arg 3;
Init's arg 7, which becomes `[effect+0x60]`, is arg **4**; Init's arg 10, the
damage, is arg 7. The damage was right all along.

With 1024 the falloff bottoms out on its own at about **1195 units** — full
damage inside one tile, nothing past two and a bit — so the stopgap cap is gone,
and so is the theory that a blast has to GROW to reach anybody. That only
existed to reconcile a 2600 range with a 35-unit effect body (0x4a8f42, reached
by `jmp [eax*4+0x4a90CC]` where `eax = type - 0x1357`). Wrong premise, invented
mechanism. **When a number does not fit, suspect the reading before inventing
machinery to justify it.**

**The gauge's track is the trough END TO END, 104..268.** Insetting it by half
the slider's box was wrong twice: it moved the START, which was never the
complaint, and the box is 24 wide while the art inside it is eight (cols 8..15),
so the art is within four pixels of wherever the slider is put.

**And the blast now HOLDS the camera.** That is why play kept reporting no
explosion: the camera comes off a grenade the frame it stops existing, so the
puffs were happening behind the player. `onBlast` starts the same wait a broken
dummy starts.

## GRENADES: the explosion's LOOK, and +y is UP

Play: "эффект взрыва всё ещё не работает верно". It was not: the remake was
drawing **one stage of five**, and the vertical of the whole effect system was
upside down.

**+y is UP in the engine's world.** Read off the physics rather than argued
from the models: the world builds three force generators and the direction is
`(0,-1,0)` in all three, one of them gravity (`movement/notes.md`
already had this written down), so falling is y DECREASING. The effect table
agrees from four independent directions — a burst's vertical launch is
`rand()%100 * p * 3/100` and cannot be negative; row 15 stacks three shockwave
rings at +100, +300 and +600; a damage number lays its trail at `y + 100` and a
damage number floats up; and row 0's cloud fires in a cone about +y against a
force that decelerates it. So `[+0x1d]` and `[+0x12]` are **gravity**, and the
note that called them buoyancy — which had stood since the melee rings — was
wrong. The remake stays Y-down and flips the sign once, in `lib/game/cloud.ts`.

**Row 0 is five stages, and the two big ones are not particles.** `0x48bff0`
hangs its own array of 20-byte records off `[child+0x70]` — position, velocity,
colour, one byte of gravity — stepped by `0x48a7e0` and drawn one SPRITE each by
`0x489fa0`, both gated on that pointer being non-null. Seventy of them, twice: a
dark red cloud on frame 1 and a near-black one on frame 2, each fired in a 44°
cone with a random 1..2 on the speed, shrinking from twice its final size over
twenty frames. `0x48c160` adds two more four-particle bursts. So a blast is
**140 sprites and 14 puffs** where it used to be six, and it is the same picture
a crate coming apart makes, because both ids resolve to the same arm.

**`0x48c160` also PINNED the burst's argument order**, which had been "assigned
to fit" since the melee pass. The check costs nothing: the parameter a stage is
GATED on is the one that becomes the age step, exactly as a ring is gated on its
own. The three numbers the old note guessed at are not the launch at all — they
are `param(base+9..11)`, still unidentified.

**The effect system now runs at the ENGINE's rate.** It was on `FRAME_SECONDS`,
which is the walk's stretched 1/15 and exists so a pig at half scale does not
sprint; nothing in here counts a stride. At 1/15 every timer came out twice as
long and a twenty-frame fireball took a second and a third to go off.
`EXE_FRAME_SECONDS`, and this is the fourth place to need it — the melee rings
got twice as fast with it, deliberately.

Two scalars are the remake's own and say so at the field: `BLOB_UNIT`, because
a sprite's size is handed to the library and the unit is the library's (the
library is `_d3d.dll`'s `afAdd2dPolyToSortList`, readable since 2026-08-11 —
`library/notes.md`; NOT wh32LIB.DLL, which is the LaserLok copy protection), and
the split where a puff's DRIFT rides `MODEL_SCALE` while the point it started
from does not — same argument as the ring's radius.

## GRENADES: the BOUNCE was wrong all along

Play, in one line each: "не должна прыгать как на батуте", "о сушу прыгает как от
воды", "по воде застревает и не тонет — должен быть эффект лягушки". Three
symptoms, one cause.

**`+0x24`/`+0x28` were never a material pair.** They are two of three
consecutive WORDS — `+0x24`, `+0x26`, `+0x28` — read and written as a group and
copied into three globals together (0x415cc5). A vector, on a record whose other
fields are a segment's start, its end and a squared length: `0x4156d0` is a
segment query and nothing on it is a material. The 0.9998 restitution this repo
carried for four passes came from misreading one word of it.

**And the near-elastic 0.01/0.99 surface is the WALL, pig-only.** `ballistics.ts`
already had it right as `WALL_MATERIAL`; what was missing is that the branch is
gated on the contacting body's owner being type **0x1357** (0x40e964). A thrown
thing never gets it.

**What a projectile brings is row `+0x20`/`+0x22`**, handed to `0x416560` on its
own body in the constructor (0x4323e2): for a plain grenade **0.30 friction, 0.80
restitution**. The solver multiplies the two bodies' pairs, so against grass
(0.40/0.40) it lands on **0.12 and 0.32** — a hop or two, then a long roll. Skill
26's kind is 0.001 on both and does not bounce at all; it sticks.

`WATER_BOUNCE` is deleted: water is one surface among the twelve, and the FROG
falls out of the numbers rather than needing its own pair — a skip needs the
tangential speed to survive, which 0.12 friction does, not the normal one to come
back whole. What kept a grenade standing on a pond was the skip gate testing
TOTAL speed: something sliding across water keeps that for ever. It tests the
DROP now.

**Three visual corrections in the same pass.** The gauge's slider travels its
VISIBLE marker (eight pixels at cols 8..15 of a 24-wide box) rather than the box,
because centring the box put the marker four pixels past the trough. The clouds
are NOT additive — additive light cannot darken, and row 0's second cloud is a
near-black whose whole job is to be smoke ("чёрного дыма нет на взрыве"); the
blend mode lives in the library — `_d3d.dll`, readable since 2026-08-11
(`library/notes.md`), not the wh32LIB this used to blame — so this is the
remake's pick until someone reads it. And a landing CRATE takes row 0's smoke without its fire (`DUST_EFFECT`) —
it was borrowing the whole row, so once the row grew a fireball a crate arriving
set one off ("коробка когда падает — искрит").

## GRENADES: the trail, the water, and Coulomb friction

Play: "давай лучше дизасми — там ведь всё стоит в движке". It did.

**The TRAIL is in the CONSTRUCTOR.** Both of the projectile update's per-kind
dispatches send a plain grenade to the exit, which is why looking there found
nothing. `0x43247b` — the arm the whole grenade family takes — builds a PARENTED
effect of id **0x15** at zero offset before anything else, so it follows the
grenade. That effect has no parameter row at all (its Init arm never calls
`0x48ccc0`, so the twelve-stage tail refuses it), and its update lays **six
particles a frame evenly along the segment travelled** (0x48b024). Particle type
0x16 is grey 0x4210, an age step of 0x14 so five frames, and no velocity, jitter
or gravity. Six a frame for five frames is thirty alive — exactly the capacity id
0x15 draws from Init's count table, which is the check on the whole read.
`lib/game/trail.ts`, `three/lobTrail.ts`. **No fire in it**: play asked for smoke
and fire, and the engine's trail is smoke.

**Water is bit 6 of the tile byte, and a thrown thing goes THROUGH.** The
projectile's own handler (0x437a57) puts a splash projectile at the water height,
plays sound 0x28, and touches its velocity nowhere — no bounce, no material,
nothing to stop it. `SKIPS_ON_WATER` is deleted along with `WATER_BOUNCE`; the
skip play wanted is a LAND behaviour and falls out of the friction below.

**Friction is a Coulomb IMPULSE and this had it as a fraction of the slide.**
The solver normalises the tangential (0x4110c1, after the epsilon test at
0x411084) and passes the friction product in as a scalar (0x40f980); restitution
enters as the standard `(1 + e)` (0x40f6b4, where `[0x4BC1B4]` is −1). A
direction times a scalar is not a fraction of a speed, and that is the whole of
why a grenade would not roll: at rest on flat ground the contact carries only
gravity's own increment, so the friction impulse available each frame is tiny.
The magnitude inside `0x410F70` is not accounted for instruction by instruction —
it is inlined operator overloading — so the remake uses the textbook
`mu * (1 + e) * |vn|`, capped at what would stop the slide, and says which half
is read and which is inferred.

**The blast has NO ground test** — the destructor's arm is unconditional and its
tail (0x4357f9) is camera work. So the clouds blend by their own authored colour
instead: (16,0,0) is light and ADDS, which is the flash; (4,3,0) comes out of the
draw's gain as (25,19,0) and COVERS, which is the black smoke. Additive light
cannot darken, which is exactly why the smoke was missing — and a dark red laid
over the map is what play was reading as thrown dirt.

**And the gauge slider, MEASURED at last.** `powg1`'s transparent colour is
palette index **11** (0x0000), not index 0 (which is a real 0x0421). Per column
the drawn-texel counts are
`0,0,0,0,0,0,0,13,17,19,33,34,34,33,19,17,13,0,0,0,0,0,0,0` — the marker is **ten
pixels wide starting at x = 7**, not eight starting at 8. One pixel each side is
exactly what kept showing.

## GRENADES: water DOUSES it, and the maps have no depth

**A thrown thing that goes quietly into water DOES NOT GO OFF, and play
half-remembered it before the binary said so.** There is ONE water path, not two —
0x437a57 and 0x437bfb are arms of the same `OnHitLandscape` and both happen at the
same contact (the measurement is at the end of this section). The splash (tile bit 6,
0x437a57) goes at the water height, and then
the CONTACT arm (0x437bfb, gated on `0x4A6FA0` — tile bit **5** plus the DLL's own
per-texel mask through `[0x538128]`, the same pair `lib/game/watermask.ts`
builds) is the one that matters. Under **150 a frame** it plays FT_WATER, leaves
effect **0x0E**, and sets `[proj+0x84]`. That byte is the FIRST thing the
destructor tests (`4328c9`), and its branch has no effects and no sound at all.
So: splash, sink, and nothing else. `dousedByWater` in `lib/game/grenade.ts`.

Effect 0x0E is worth its own line: its Init arm writes the water height over its
own y (0x488c19) before reading parameter **row 2**, so the splash is drawn on the
SURFACE however deep the thing sank — which is why the grenade can go out of
sight and the splash still land where it went in. Row 2 is three near-white rings
at a lift of −500, a sixty-sprite cloud and a ten-particle burst; `SPLASH_EFFECT`
carries it and none of it is invented.

**And it no longer stops dead on contact** — play saw that immediately ("на воде
тупо при контакте застрял сразу"). Nothing holds it at the surface: gravity has
the vertical and only the sideways travel is damped, so it sinks to the bed and is
doused there.

**One water handler, not two, and the maps have NO DEPTH.** 0x437a57 and 0x437bfb are
arms of the same `Projectile::OnHitLandscape` (0x4377d0), so a thrown thing is untouched
until it reaches the ground and then gets the splash AND one of the two arms. Measured
over the shipped water — CAMP, BAY, ARCHI — `bed − water line` is **0** at the median
and 48 at the deepest anywhere: the maps author their water flat and the load step
raises everything under it to exactly that, so the surface and the bottom are the same
plane. Which is also why effect 0x0E snaps its own y to the water height.

So a couple of seconds of sinking cannot come from the terrain or the exe — the
world's three force generators are all gravity-flavoured and a projectile gets the
plain one. `WATER_SINK_SPEED`/`WATER_SINK_SECONDS` are the remake's presentation: a
doused thing goes on down THROUGH the bed and is taken away when its two seconds are
up. It never goes off, it cannot be detonated by hand, and it does not hold the turn
open (`grenades.live()` counts only what is not doused). `e2e/002/sink.spec.ts`
measures the whole path — a pig in CAMP's pond, a grenade at its feet, the y only
growing, `FT_WATER` heard and `E_1` never.

**Water is terrain type 4** on every wet sample, which is 0.90/0.10 — the grippiest,
least bouncy row. Against a grenade's own 0.30/0.80 that is 0.27 friction, but Coulomb
friction goes with the NORMAL approach and a flat skim's is a fraction of its travel,
so a hop was losing about **two per cent**: seventeen hops, the width of a pond. So the
fifth that lifts it (`0x4A9260`, read) is PAID FOR out of the travel — the remake's
half of it, and the only reading under which this file's own sentence about the arm
("it decays by five each hop") is true. Four or five hops, each shorter, then a douse.

## The TREMOR goes in the ENGINE, and the camera just shows it

Five passes kept the scope's tremor BESIDE the aim — on the view's direction, on the
eye, on a mark drawn over the glass — and every one produced the same class of bug.
Play cut through it: "вместо того чтобы трясти прицел — ты тряс камеру?????", then
**"то что у тебя на камере было — должно было уйти в движок, а камера просто всегда
должна отражать то что в движке."**

So there is ONE number. The tremor is a STEP added into `aim.angle` every engine frame,
its other axis into the pig's TURN — which is what the exe does: the aim view's
handler feeds the analogue stick through `Pig::Aim` (0x495cb0 → 0x46A7F0) for one axis
and the turn for the other, and `[pig+0x304]` is the field the CAMERA reads, the field
the SHOT reads (0x47a2b6) and the field the dial shows. Nothing can disagree because
there is nothing to disagree with. Everything asked for falls out of it: the picture
follows the sight; nothing is bounded but the aim's own ±0x3FF; closer travels further
because the step is an angle and a magnified view is fewer degrees across; and one walk
of small steps reads as a rattle frame to frame and a drift over seconds — which is
what a resting stick IS. `AMPLITUDE` is the only knob left.

**Five shapes that are WRONG, and none is to be tried again**: a sine (floats); a
bounded rattle round the centre ("в радиусе центра"); a bounded walk with a direction
kept until the stop (two axes doing that is ONE ELLIPSE); an offset on the EYE; and a
mark that moves over the glass while the camera holds still. The last two share the
fault the first three hid: **a second number the camera and the barrel can read
differently. If the picture and the bullet can ever disagree, the design is wrong —
put it in the engine and let the camera report it.**

## MINEFIELDS are a TILE BIT, and the sound bank is what proved it

Play: "мины тут на карте должны быть — а тнт уже берётся с ящика но ничего не
делает." Both were sitting in the shipped data.

**A minefield is bit 6 of a tile's type byte** — 99 tiles of it on CAMP, 997 on
BUTE — and there is nothing to draw for one: the tile's own texture is the whole
warning, which is why the training ground can say "FOLLOW THE PATH THROUGH THE
MINEFIELD" about a patch of empty ground. A pig with its feet down on such a tile
plays `L_MINETR`, spawns the blast **at the tile's centre** (the exe builds the
position out of the tile indices and never looks at the foot), and the bit is
CLEARED — one shot per tile, for ever. Twelve frames of fuse, twenty points at the
core over a grenade's own 1024 of reach. `lib/game/mines.ts`, and
`weapons/mines.md` has every address.

**A misreading died here, and it had been load-bearing.** Bit 6 was written down
as WATER two passes ago, with 0x437a50 filed as the splash — `Sound::Play(0x28)`,
"the water HEIGHT", `WATER_SPLASH_SOUND`. Every piece of that is a mine: bit 5 is
water (`IsInWater` 0x4a6fa0 tests 5, and 0x4a7000 tests 7 for the wall, which pins
the byte end to end), 0x4A5140 is `Map::SampleHeight`, and **index 40 of
`Audio/sfxday.srl` is `L_MINETR`**. The story held together for two passes because
"a splash at a height, on a flag next to the water flag" is a plausible thing to
read. The BANK is what broke it — the file has NAMES in it, and a sound index is
worth resolving before a behaviour is built on top of one.

So the rule the engine was missing is not only "walk onto a mine": **anything
thrown sets one off too**, out of the same handler, on contact rather than at rest.
It is six lines in `lobs.ts` because `mines.tread` is the same call the foot makes.

**TNT is a lobbed projectile with no gauge**, which is the distinction the fire
button did not have: `isLobbed` was deciding both "throws an arc" and "charges on a
held key", and the record's +0x14 is what actually decides the second (1 on the
grenades, 0 on TNT). With no gauge the press writes a charge of ONE, and a
constructor speed of `50 * 1 >> 12` is nothing — **that is what "planted" means
mechanically: it goes down at the pig's own feet.** Fifty frames of arming under a
125-frame fuse is near enough six seconds, fifty points at the core, twice a
grenade's reach.

And using one does not spend the turn — it HURRIES it. The skill record's +0x18 is
400 hundredths, which raises `[game+0x516]` and takes the mode machine back to
NORMAL with the turn's deadline re-stamped (0x4945a5): four seconds, as a SET and
not a bonus, so ninety-eight seconds becomes four. The fuse outlasts it on purpose
— the clock runs out first, and the beat the turn ends through waits for the charge
rather than handing over on top of it, because a live lob is in `settling()`.

Three shapes worth keeping:

- **`blast.ts` exists because a mine wanted what a grenade had.** The burst — who
  is inside it, what each takes, the dummies spliced out of the shared array — was
  the body of `lobs.ts`, and the honest way to give a second caller it was to stop
  the grenade owning it. One blast, two callers, and the falloff stays in
  `grenade.ts` beside the exe reading behind it.
- **A layer, not a special case.** TNT gets `weaponLayer` = `charge`: fires, no aim
  view, no gauge. The four planted skills (35, 36, 37, 38) are a real family with
  two witnesses in the exe, and 35/36 answer for it already even though they have
  no row yet — so the control set is right the day laying a mine lands.
- **The mine WEAPON is the same mechanic from the other end** and is deliberately
  not built: skills 35/36 drop a projectile that, on touching the ground, writes the
  map's own bit (`Map::SetMine(col, row, 1, flavour)`, 0x4374cf) and leaves it
  there. `mines.ts` is where it would plant. What is NOT read: whether one mine
  going off sets its neighbours off, and `[game+0x534]`, the counter the mines'
  four-second override tests.

## A charge is PLACED, by its own animation — and a once-clip must play out

Play: "ТНТ ставится на землю — с анимацией." Three things were wrong under that
one sentence.

**The animation was being wiped one frame after it started.** Every weapon's
attack clip goes on through `anim.playOnce`, and the clip chain's last line —
`anim.setClip(acting, loco.clip)` — ran every frame for a pig that was neither
swinging nor mid-jump. `setClip` deliberately does NOT keep a once-clip (the walk
has to be able to interrupt an idle), so it replaced the attack clip on the very
next frame. **The swing survived only because `swings.swinging()` holds it a branch
earlier**, which is why nothing had noticed: the bayonet is the one weapon whose
animation anybody had watched. There is now a branch for "a once-clip is running,
leave the pig alone", which is also the exe's own rule — `[pig+0x2FF]` is up from
`Pig::Attack` until the animation is spent and the picker does not ask for a clip
while it is.

**The charge appears when the pig has BENT OVER, and that is data.** All four
planted skills carry attack clip 77, the archive's "Lay Mine", and the clip's own
key-frame events are in the DLL rather than the exe: `afGetKeyFrameList`,
`_d3d.dll` 0x1002c778 + clip*88, six `(phase, id, id)` triples — the same table
`melee.md` hand-read the bayonet's four strikes out of, which is what confirms the
layout. Clip 77 carries a footstep at 584, **event 65 at phase 1314** and another
footstep at 3796, and event 65's arm is three instructions whose middle one is
`Pig::Shoot`. So `PLANT_PHASE = 1314` of 4096 is where the thing is placed: a third
of the way in, by the animation, not by the press.

**And it goes down at the FEET.** `Lobs.plant` puts it at `pig.position` — the
soles — instead of the hand bone a throw comes off, which falls out of the exe
twice over: `speed * charge >> 12` of 50 and a charge of one is nothing, and the
clip's event fires with the pig bent over its own trotters.

**A planted charge must not lock the pig**, or the four seconds the turn hands back
are four seconds of standing next to it. `grenades.live()` was what said "the pig is
committed" and "the fire key is a detonator", and both of those are about a THROWN
thing: `Lobs.thrown()` is the count without the planted ones, and `live()` stays
what the end of a turn waits for. So a TNT charge cannot be set off by a second
press either — which would otherwise have been one button away from suicide.

## ONE BLOW A TURN, and an animation nobody may walk out of

Play's second pass over the charges, four reports in one line, and three of them
were the same hole: "не дожидается окончания анимации и можно идти в ней в последнюю
секунду", "можно ставить много тнт подряд — а после первого нельзя использовать
оружие", "когда таймер кончился — анимация свина не возвращается обратно в идл",
"тнт ложится в пол — а надо чтобы стояло".

- **The lay clip holds the pig to its END, not to the frame that places the
  charge.** `laying` carries two numbers now: `untilDown` (phase 1314) and
  `untilDone` (the whole clip), and `attack.busy()` is the second one. The clock does
  not run inside it either — a blow in progress stops it — so the four seconds a
  charge gives back are four seconds of RUNNING.
- **One weapon use a turn.** `struck` in `lib/game/battle.ts`, and the fire key is
  swallowed for anything but SKIP TURN once it is up — **except while something the
  pig THREW is still live.** Play caught that one within the hour: "ты сломал
  взрывание гранаты — больше нельзя нажать F чтобы подорвать по желанию." The
  hand-detonator lives inside `attack.begin`, so swallowing the press took the
  grenade's own second use with it. Setting off what is already in the air is the END
  of a blow, not a second one, and `002/grenade.spec.ts` now presses F twice so it
  cannot go quiet again. It is the same rule the turn
  ending already was, seen from the side of the two skills that do not end it: the
  charges kept the turn and so kept the trigger, which meant a pig could carpet its
  own feet in TNT.
- **The turn ending puts everyone back to IDLE.** `endTurnBeat` dresses every pig
  before `beginWalkAway`, which then puts the swimmers into their own clip on top of
  it. The beat only ever dressed the swimmers, so a pig that ran out of clock
  mid-stride kept the run cycle for the whole handover.
- **A planted charge is lifted by its OWN half-height** and not by a grenade's
  radius, and nothing pitches it: it was drawn half-buried, and it has no velocity
  to point along.
- **And the hands are EMPTY afterwards.** Play: "должны быть — а ты ещё держишь
  тнт." A charge is not a weapon a pig keeps: the round is spent as the clip runs
  (the exe does the same at 0x46975e) and the hand is emptied whether the slot ran
  down or not, which on the training ground — where every slot is unlimited — is the
  only way it ever could.

**And the once-clip rule wanted a qualifier the specs caught.** "A committed clip
plays out" on its own broke the walk cycle: a pig that lands on the run was still
getting up, which `002/walkcycle.spec.ts` failed on within the same run. The exe has
the qualifier — the animation picker asks 0x472320 for a gait and that request
zeroes the committed clip outright, so a DRIVEN pig's gait wins and a standing pig's
clip finishes (`animations/notes.md`). The branch is `anim.animating(acting) &&
loco.clip === ANIM.IDLE`, which is both halves in one line.

## A MINE IS HIDDEN, and that part is play's rule

Play: "мины скрыты — текстуры видны только тем кто рядом и то только тем у кого
есть класс специальный — и наверно ещё тем кто поставил."

**The exe has no per-viewer visibility in it at all**, and this pass chased every
reader of the mine bit to be sure: the pig's own trigger, the projectile's, the
AI's passability map, and eight copies of a tile walk that refuse a mined tile.
None is in the renderer. What the ORIGINAL shows is what the map's ART shows, and
the shipped maps disagree on purpose — CAMP paints its 99 mine tiles with four
textures no other tile uses, and BOOM's 628 sit on the same ground as everything
around them. So "hidden" is a design rule and the marker is the remake's own: the
game's own `WE_MINE` model, drawn on the ground by `three/mineArt.ts` for exactly
the mines `mines.revealed(watchers)` returns.

**Which class sees them is DERIVED and not picked.** The 128-byte class record at
0x4d02e0 carries each class's own kit as `(skill, amount)` pairs, and 35 MINE
appears in three of the twelve: 5, 6 and 7, the engineer and its two promotions. A
pig that lays mines for a living knows where one is. The other candidate is the
espionage family (8, 9, 10 — `55 CONCEAL`, `54 PICK POCKET`), and it is one line in
`mines.ts` if play says otherwise; `DETECT_RANGE` of 1024 is invented outright and
says so at the field. "Whoever placed it" is not modelled because laying a mine is
not — there is no owner to remember yet.

The eyes are the caller's: the scene asks with `game.currentPlayer.pigs`, so an
enemy engineer walking past does not light the field up for the player. A mine that
has been TRODDEN on is drawn for everybody — by then it is nobody's secret.

**Play knows more about this than the binary does, and it is written here for the
pass that does it**: "инженеры и командос с героем видят жёлто-чёрные текстуры там
где есть мины", and mines are hidden on the MINIMAP for the enemy. So the original's
reveal is a TEXTURE SWAP on the tile — the hazard stripes CAMP's four mine textures
almost certainly are — for three classes rather than the engineer family alone, and
the range applies to the GROUND and to the map view alike ("к земле тоже"), with the
enemy simply not shown them on the minimap. None of that is built: play said "но ладно это потом", and the marker model stands in meanwhile.
Still to do beside it: the EXCLAMATION MARK over a mine the moment it is trodden on.

## A PLANTED CHARGE STANDS, fuse up — and the model is what says which way

Play: "тнт лежит боком на земле — должна стоять фитилём вверх." Which way is up for
it is the MODEL'S own fact, and it was measured out of `Chars/WEAPONS.MAD` rather
than guessed: `WE_TNT` is forty vertices in two boxes — the bundle from x −64..77
(with its two end caps as flat planes of their own, AMMO002 and AMMO003) and a
thinner stub from x −148..−64 wearing AMMO001. The bundle's texture corners average
rgb 181,82,0 — orange sticks — and the stub's average **0,0,0**. A black stub out of
the end of a bundle of dynamite is the fuse, so **the fuse points along model −X**,
and the whole thing is authored lying down because a hand is what holds it.

Game space is Y-DOWN, so up is −Y and a turn of +π/2 about Z takes model −X there
(`three/grenades.ts` `STAND`). The yaw the pool hands out then only spins it about
the vertical, which is why it can stay. And the LIFT is measured FROM the pose — the
lowest corner of the model as posed — so it cannot drift from it: standing, the
bundle's deepest point is the far end (model x 77) rather than the 32 its half-height
gave it lying down.

`window.pow.debug.charges()` is how a spec sees it: the fuse's world direction and
the y of the lowest corner. Standing on its end is a fact about the MESH, and the
engine's list of lobs cannot answer for it.

## A BLAST THROWS, and a pig NOBODY drives needed somewhere to put a velocity

Play: "мины не отбрасывают — как и тнт", and then the diagnosis in the same
breath — "также мины и думаю гранаты тоже не отбрасывают — так что это общая
проблемма." Exactly right. Nothing was wrong with the blasts: this engine had ONE
locomotion state, the acting pig's, so there was nowhere for anybody else's
velocity to live. `lib/game/tumble.ts` is that somewhere, and it owns no physics —
a thrown pig is a pig in the AIR, which `updateLocomotion` has always known how to
be, down to the bounce, the landing and the get-up. The exe agrees the two are one
state: `UpdateMovement` returns at once when the pig's state is 5 (0x46b205), so a
pig in the air is not driven and the physics owns it.

**The seam is `battle.fling`**: the ACTING pig takes the impulse on the state the
battle already drives (`loco.airborne`, the same flight a jump takes) and everybody
else takes one of their own. Two states over one pig would fight over its position.

The impulse's SHAPE is the exe's, its magnitude is borrowed and its falloff is the
remake's, and `lib/game/blast.ts` says so at the field. Every knock-about in the
original is one call — `0x4a9100(speed, 0x200, bearing, 0)`, and 0x200 of 4096 is
**45° up** — at six sites, five of which use that pitch and speeds of 0x40 or 0x78.
`Pig::OnHit`'s own blast arm (0x477c22) carries **no impulse at all**: it damages,
tallies twice the damage at `[pig+0x1b8]`, raises the reeling counter at
`[pig+0x1b4]` and squeals. So the original's toss comes from the physics — the blast
effect HAS a body, a sphere of radius 35 — and that contact is not decoded. The
whole chase is in `weapons/fire.md`.

A pig in the air does not find a MINE, which is the exe's `[pig+0x382]` gate; and
the turn cannot be handed over while anybody is still up (`settling`).

## THE SECOND PASS over the throw: how hard, and through which BEATS

Play watched the first attempt and named three separate things: "сначала взрыв —
даже 2 мины — а потом толчёк", "толчёк очень мелкий", and "динамит не толкает".
Three causes, and only one of them was the blast.

**1. HOW HARD.** The magnitude was a flat 0x40 borrowed from the building's own
push, and 0x40 is **less than a punch**: the melee's knockbacks are 75 (bayonet),
100 (trotter), 125 (knife), 150 (sword), **200 (cattle prod)**, all through the
same `0x4a9100`. So it scales with the DAMAGE now — four times the points, capped
at the prod's 200 — and the two ends land on the engine's own numbers: a grenade's
thirty come to 120 = 0x78, TNT's fifty to the 200 cap, a mine's twenty to 80. The
falloff is free, because the damage already carries it (`lib/game/blast.ts`
`flingSpeed`). The four and the cap are the remake's.

**2. THE BEATS.** The acting pig's walk lives at the bottom of `battle.update`,
past three branches that return early — the beat after a blow, the beat that ends
the turn, and the turn a weapon has spent. A blast can throw the pig inside any of
them, and the flight was simply not advanced there: frozen for the length of the
beat and finished afterwards ("а потом толчёк"), or dropped outright, which is the
whole of "динамит не толкает" — TNT's six-second fuse runs out AFTER the four
seconds the turn hands back, so its blast always lands inside the end-of-turn beat.
`flyOn` advances it wherever the frame is, and `settling()` now counts the acting
pig's own flight so the beat waits for the landing.

**3. A PLACED CHARGE DOES NOT MOVE.** Play: "динамит катится по склону." It was
stepped like anything else in the air, so gravity pressed it into the hillside and
the contact carried the whole slope-parallel part on — the very rule this engine
got right for grenades. Nothing has to fall for a charge to be PUT somewhere, so
only its fuse runs now (`lib/game/lobs.ts`). The exe has a rest state for a body
and it is not decoded; this is that state for the one thing born in it.

## THE FUSE BURNS, and the throw is six times the damage

The last two off play's list, both of them numbers or art the exe does not give.

**"Динамит не горит."** It does now: a spark on the end the black stub is on, which
is the end that stands up. `three/fuse.ts` — an additive sprite that flickers on the
battle's own clock, so two machines stepping the same battle draw the same flame,
sized off the bundle and placed at model x −148 (the far end of the stub, measured
when the charge was stood up in the first place). **Nothing about it is a reading**
and the file says so at the top: the two mine rows differ only in their effect ids,
0x4c against 0x55, and those two turned out to be the mine's BLAST and not its fuse
(see below), so there is still nothing read behind the spark. `window.pow.debug.burning()`
counts them, because a sprite on a transparent quad is not something a screenshot
can be held to.

**And the throw went from four times the damage to SIX.** Play: "отбрасывание миной
всё ещё кажется слабым (может я не прав)." Not wrong — at four a mine's twenty
points came to 80 a frame, between a bayonet and a trotter. At six the three blasts
in the game land like this, all of it under the cattle prod's 200 which is the
hardest knock the exe hands out:

| blast | points at the core | speed |
| ----- | ------------------ | ----- |
| a MINE | 20 | **120 = 0x78**, the engine's own other decoded knock |
| a GRENADE | 30 | 180 |
| TNT | 50 | 300, held at the 200 cap |

## A MINE does not go off like a GRENADE — it is parameter row 14

The open list said the two mine rows' effect ids, 0x4c and 0x55, were "the likeliest
place the original's mark lives" and that their two-level dispatch had not been
untangled. It is untangled now, and it says something else.

Both ids reach the SAME arm — `byte [0x489680 + id − 1]` gives slot 51 and slot 56,
and the jump table at 0x489574 holds `0x488fb8` for both, which is three
instructions: `push 0xE; call 0x48ccc0`. So the two flavours are identical and both
read **parameter row 14**. The remake had been blowing every charge up with row 0,
which is the grenade's, and that was never read for the mine — only assumed.

**The twelve stages are pinned end to end now**, which is what made row 14 readable
at all. Every one of them is `flag = param(f) == 1`, `when = param(f+1)`,
`base = param(f+2)`, straight off the update loop at 0x48bcaa..0x48bf1b — clouds at
flags 0x00/0x0a, rings at 0x14/0x21/0x2e, bursts at 0x5b/0x66/0x71/0x80, and three
more (0x53 inline, 0x3b and 0x47 through an undecoded spawner). The check that says
the map is right rather than plausible: **run row 0 through it and `ROW_ZERO` comes
back out to the number**, frames and all.

| | a GRENADE (row 0) | a MINE (row 14) |
| - | - | - |
| fireball | TWO clouds, dark red then near-black | **one**, dim (5,2,0), rising less and falling harder |
| ring | none at all | **one**, and it SLOWS — drift −2, warm (13,10,4) |
| smoke | 14 puffs thrown OUTWARD over frames 2 and 3 | **18 thrown straight UP**, `out` 0, all on frame 1 |

A buried charge throws its smoke up and a thrown one throws it out, which is the
whole difference in one line. `MINE_EFFECT` in `lib/game/effects.ts`, and the seam
that carries it is the exe's own shape: a `Charge` names the effect id its
destructor spawns (`LOB_EFFECT_ID` 0x54, `MINE_EFFECT_ID` 0x4c), the `blasted` event
carries it, and `effectField.blast(at, effect)` picks the row. The SOUND is shared —
`0x48ccc0` plays 0x1a whatever the id — which is what the older note's "both funnel
into the same `E_1`" was seeing.

## A trodden mine wears `WE_APMIN`, and it comes off the MAP

The object name table is 466 POINTERS at 0x4d9680 with `START_OF_AMMO` at 387, so a
projectile row's id indexes it — and **rows 428 and 429, the two mines a foot sets
off, are both `WE_APMIN`**. Not the `WE_MINE` a pig carries, which is entry 20 of
`Chars/WEAPONS.MAD`; `WE_APMIN` is not in that archive at all. It is in **every
map's own .MAD**, all 61, beside the trees — along with `WE_GRE2`, `BULL1`,
`WE_BOMB` and the rest of the AMMO run. So a projectile's art loads the way a tree's
does.

Two things had to move for it. `main/assets.ts` walked the .POG for "one model per
placed record" and nothing places `WE_APMIN`, so `lib/game/ammo.ts` names the models
the ENGINE spawns and the loader takes those too; and `three/props.ts` grew
`spawn(name)`, a fresh mesh off the map's own shared geometry. `three/mineArt.ts`
now draws two lists from two models, and the split is the honest one: **the trodden
ones are the engine's art** (`WE_APMIN`, lift 44 — the model runs y −46..44 and
Y-DOWN makes the greatest y its underside, which the art agrees with: the flat plane
at 44 carries `APMIN002` and the red plunger at −46 sits on top), and **the revealed ones are the
remake's own**, still `WE_MINE` standing in until the yellow-and-black ground
texture lands.

`pow.debug.minesTripped()` counts the first kind on its own, and it earns its keep
here rather than being a nicety: if the loader ever stops picking `WE_APMIN` up, the
mine draws NOTHING and nothing else in the suite would notice.

## A BULLET IS REGISTERED BY THE BOX THAT STOPPED IT

Play: "пуля врезается в манекен и ничего не происходит — там что-то с регистрацией
попаданий", and before that the guess that turned out to be right — "я подозреваю,
твоя обрезка свиней как-то повлияла на манекены?"

It did, through a place that has nothing to do with dummies. A bullet was resolved
world-first: `obstacles.solid()` spent it, and the targets were then looked for by a
POINT test whose window was `HIT_RADIUS` — which was **`PIG_RADIUS`**.

A DUMMY is BOTH things at once: a 128 × 512 × 256 collision box and a target. So
which of the two tests fired first was pure geometry.

| | window on the target | the box's own half-depth | which fires first |
| - | - | - | - |
| `PIG_RADIUS` **170** | 170 | 128 | the TARGET — the hit lands |
| `PIG_RADIUS` **85** | 85 | 128 | the BOX — the bullet is eaten a step early |

Halving the pig was right and stays right: it answers "how near a wall may it
stand", which is what play felt as "цепляет всё невидимыми боками". What it also
did, silently, was pull a bullet's hit window inside the collider of every dummy in
the game.

**The fix is not a number.** `ObstacleField.stopper(x, y, z)` returns WHICH record
stopped the point, and `lib/game/bullets.ts` gives that record the damage if it is
something that breaks. A bullet is stopped by geometry and the geometry's owner
takes the hit — a record's own box is a better hit shape than a radius borrowed from
a pig, and the two numbers can no longer disarm each other. The point test survives
for targets with NO collider, which is what it was always for.

**Why the suite was green through all of it, which is the part worth keeping.**
`002/shoot.spec.ts` shoots the first target the map SCRIPT places — and that one has
no collider, so the point test caught it and the spec passed while the game did not.
The new pin shoots a **DUMMY** and asserts `box.halfZ > PIG_RADIUS` first, so it is
standing on the very geometry the bug lives in. It was checked by reverting the fix:
it fails with "the bullet did nothing at all", which is play's sentence.

Two general lessons, and the second is the one that cost the time:

- **A constant borrowed across concerns is a trap with no compiler behind it.**
  `HIT_RADIUS = PIG_RADIUS` read as tidy and coupled "how near a wall a pig may
  stand" to "whether a bullet hit a dummy".
- **"The suite is green" is not "it works".** Two hundred and fifty tests passed
  over a game where no gun could hit a dummy. What the suite covered was the case
  with no collider; what a player does was uncovered. When play reports something
  the suite says is fine, the suite is what is wrong.

And **I said the wrong thing twice on the way here** — that the entry animation did
not exist (it is clip 7, above), and that the pig-shrink was not the cause. The first
came from reading one arm and stopping; the second from three measurements that all
happened to test melee, which really was fine, while the report was about a bullet.
Neither was a guess presented as a guess, which is the fault.

## THE BAZOOKA — a rocket with no fuse, 2026-08-11

Play: "продектайл со своей анимацией итд + звук выстрела + урон при касании —
важно в воде не взрывается, а тонет." Skill 29 was in neither table — not a gun
(it charges) and not among the lob rows — so it could be taken in hand and did
nothing at all. The whole of it is read; `weapons/fire.md` has the derivation.

**Row +0x14 nil is the CONTACT class, and that is the finding.** The projectile
constructor branches on it (0x43200c): non-zero starts the thing in state 0, the
arming count every grenade takes; nil takes `[proj+0xA2]` — row +0x1C's low byte
— through the table at 0x432590, and the bazooka's 0 lands on **state 2**, one of
the two update arms that do nothing at all. It has no fuse and nothing counts it
down. What ends it is the landscape handler turning state 2 into state 6 the
moment it touches anything (0x437f2c), and state 6 is `[proj+0x31] = 1`, which is
the destructor, which is where the blast is.

Its row against the plain grenade's: speed **500** a frame at full charge against
300, damage **5120** — forty points, so a grunt survives on ten — over a blast
field of 2048, TNT's reach rather than a grenade's. `Lob.contact` in
`lib/game/grenade.ts` is that read, `fuseSeconds` returns Infinity for it, and
`lobs.ts` bursts on the first ground or box contact instead of bouncing.

**Water still takes it**, and not as a special case: the water test is FIRST in
the same handler and the douse sets the quiet flag the destructor reads before
anything else. One divergence is flagged at the line — the douse arm wants an
arrival under 150 or one of the bullet kinds, and kind 10 is neither, so the exe
would let a fast rocket SKIP. Play's word is flat against that and the remake
follows play: a rocket never skims.

**The report is decoded, not picked.** Every weapon's fire arm hangs off one jump
table (0x47cf8c, indexed by `skill − 6`) and each plays its own sound: skill 29's
is `Sound::Play(0x24, 100, 100)` and index 36 of `Audio/sfxday.srl` is
**`L_BAZOO`**. The rest of that column is written down in the notes and in
`audio/battle.ts` and is one line each when wanted. `fired` is emitted by
`lobs.throwOne` now as well as by the bullets, and a lob with no cue makes no
report — a grenade leaving the hand is not a gunshot.

**And the ROCKET is not the launcher.** Name-table row 398 is `WE_BAZZ`, out of
the MAP's own archive like `WE_APMIN`; what is in the hand is `bazookr`. Without
the split a fired rocket flew as a second launcher. `lib/game/ammo.ts` is the
table, and `three/grenades.ts` falls back to the map's archive for any name
`Chars/WEAPONS.MAD` has never heard of.

**Two corrections play made on sight, and both are worth keeping.**

*The rocket SKIPS.* A first pass read "важно в воде не взрывается, а тонет" as a
divergence — a rocket never skims — and play was flat: "ракеты скачат! как и
гранаты! я про потонуть когда нельзя скакать!" There is no special case. The
exe's own rule was right: fast along the surface it skips, and what cannot skip
goes down without going off.

*The red indicator is not the power gauge.* It is the **LENS in the weapon
port** — `pcpie4`, the only pie in the whole install, one 32×32 red disc
(palette index 2, rgb 205,0,0) in a brass ring. Play sent a picture of the
original's and the words for it: an ordinary weapon shows a HALF-filled circle,
and the bazooka's is "полностью закрашен — как оружие которое детонирует при
контакте". So how full it is is the weapon's CLASS, not its charge, and
`ui/battle.ts` drives it off `Lob.contact`. One image means the fraction cannot
be frames, so it is clipped; the direction, the half, and where it sits are all
eyework and all live in `LAYOUT.dial.slot.lens` for the console. **TRACED
2026-08-11** (`library/notes.md`, "THE DASHBOARD"): the exe's drawer is
`0x457FB0` and it draws the disc WHOLE, always — no fill mechanic exists —
hidden only while `[0x537F24]+0x458` is 19..26 (the grenade family). So the
half-filled look play remembers is not a fraction the PC exe computes, and the
remake's class-driven clipping stays its own reading of play's screenshot
until play weighs the new evidence.

~~Left open: the record's `+0x28`/`+0x2C`~~ — closed 2026-08-11: the attack
animation steps' repeat count and signed playback rate (`weapons/fire.md`).
## The class kits — a pig arrives armed (2026-08-20)

Mission one needed pigs to carry their class's own weapons, and the table was
already half-read: the class record at 0x4d02e0 — the same 128 bytes health
and the walk grant come out of — continues with `(skill, amount)` pairs, −1
unlimited, ended by `0,−1`. The disasm notes carried twelve rows; a
PE-section dump of the exe re-read the record whole and found **twenty-four**,
with the commando's row cut short in the notes (it goes on past the jetpack:
a cluster grenade, three medicine darts, a poison gas, a TNT). Rows 12..14
are the medic family and the hero, 15..16 continue that family — 16 is the
ACE the `AC_ME` marker names — and 17..23 have no found reader.

`lib/game/kits.ts` carries rows 0..16 and `outfit(pigClass)`, built through
the inventory's own `give`, and the `Game` constructor hands it to every pig
where `carrying: []` used to be. The old comment there — "a pig starts with
nothing, every shipped map hands out its weapons in crates" — was simply
wrong about the original. CAMP still behaves: the tutorial script clears the
acting pig at every crate placement, so the trainee's kit goes the moment the
first step places one, exactly as the exe's `Pig::ClearInventory` does.

`unit/kits.spec.ts` pins the grunt's row, the commando's un-truncated one,
the 17-row table with the grunt fallback past its end, and that a fresh
battle deals every pig its own copy.

## THE BURNING FUSE — 2026-08-21, four of play's five on one charge

Play: "пофикси фитиль динамита - там щас фигня какая-то." No detail, so the
first move was a MEASUREMENT rather than a guess — the charge driven headless,
with nothing drawing it:

- planted, hands empty, the bundle standing on the ground;
- fuse **5.88 s** (50 frames of arming + 125 of fuse + 0..7 of jitter, at the
  exe's own 1/30 rather than the walk's stretched 1/15);
- the turn clock cut to **4 s** on the plant, the blast landing about two
  seconds after it ran out, inside the beat that ends the turn;
- damage dealt, turn handed over.

So nothing about the timing was wrong, and what was wrong was everything AROUND
it. Play named the rest on the next pass and all four are built.

**It burns in SPARKS, not smoke — `[play]` over the arm.** The exe's row is not
in doubt: effect 0x1D's update lays four a frame of particle type 0x18, whose
setter (0x486f16) gives colour 0x14A5 — five of thirty-one on every channel —
in puffs of 0x10, twice a grenade's. That is dark smoke, and play remembers
sparks. What is KEPT off the exe is the shape — effect 0x1D, four a frame, hung
`FUSE_LIFT` = 0x3C above the bundle; what is play's is the three fields that
make a spark a spark: lit rather than tinted (additive), small, short-lived,
and thrown clear of the fuse instead of stacked on it. A planted charge does
not move, so without that last one all four land on top of each other.

**The scatter is a PORT, not a roll.** `lib/game` never reaches for
`Math.random` (CLAUDE.md), and a trail is drawn rather than played, so
`advanceTrail` takes an optional `jitter()` and the renderer supplies it. Left
out, nothing scatters — which is every row the exe lays along a segment.

**And they come off the FUSE, not off the sticks.** Play, on seeing them:
"искры идут из фителя а не из самого динамита." They were: the sparks were laid
at `FUSE_LIFT` — 0x3C, the exe's own offset — above the projectile's ORIGIN,
and the origin is where the bundle sits on the ground, so sixty units up is the
middle of it. The ART answers this instead. The bundle is authored lying down
and stood on its end (`STAND`), which puts the black stub at the model's
highest point, so the tip is the posed bounding box's least y and nothing has
to be measured by hand (`tipOf`, three/grenades.ts).

**Planting was silent, and the first answer to that was WRONG.** `lobs.plant`
was made to emit `fired` so the per-weapon column's own index — 35 `L_ARTIL`,
read and long unwired — could play. Play threw it out on sight: "какой ещё
файред на динамит???" Right, and it is not a taste: a charge being put on the
ground looses nothing and reports nothing, and the noise it makes is its FUSE.
Both the event and the cue are gone again; skill 37 is deliberately absent from
`BARREL_SOUND` with the reading kept beside it.

**A burning charge makes THREE noises**, which is play's list: "звук горения
фитиля + таймер + звук когда кончается таймер". None of the three is in the
binary — every one of the bank's ninety-nine names was listed looking for a
hiss and there is no fuse in it — so all three are `[CHECK — remake]` picks out
of what the bank does have: `BG_GAS` for the hiss, `S_CLOCK` for the timer over
it, `L_MINETR` for the click as it runs out.

**And the RATES are the samples' own lengths, which is the whole lesson.** A
cue is fire-and-forget with no handle to stop it, so anything repeated faster
than it lasts piles copies on top of one another and the last of them go on
sounding after the thing that started them is gone. The first pass fired
`S_CLOCK` — **1.06 s** — every 0.45, and play heard exactly that: "щас он тикает
даже после взрыва." The three rates are now 0.36 s for a 0.38-second hiss,
1.1 s for the 1.06-second clock, and one shot of the 0.23-second click at half
a second left. The lengths came out of the shipped wavs, and a doused charge
reports no fuse at all so a charge that fell in the water goes quiet.

**And the camera goes to the charge.** Play: "камера должна перемещаться на
динамит - а она остаётся на свине." It goes at the END of the turn and not the
moment the charge is laid, because those four seconds are the whole of "plant
it and run" and a camera that leaves the pig takes the running with it. From
the beat onward nobody is driving anything and the beat is already waiting for
the fuse, so what there is to watch is the thing about to go off. It is the
same aftermath camera a broken object already uses; the exe's own arm for a
burning charge has not been read, so it is `[CHECK — remake]`.


## The blast's DIRECTION — the centre-of-gravity line (2026-08-23)

Play, queued from the first AI session: "граната до сих пор как-то странно
отбрасывает — похоже ещё не очень работает взрыв", with the spec arriving
alongside the fix order: "надо хорошие тесты — чтобы свинья летала если
граната ниже центра тяжести свиньи итд итп."

**The suspect list closed on the 45°.** The speed (`flingSpeed`, six a point,
capped at the prod's 200) survived; the seam survived; what was wrong was the
DIRECTION: every blast threw its victims at the melee's fixed 45° along the
flat bearing, and a charge going off UNDER a pig — both legs of the bearing
nil — threw it 45° toward wherever it happened to face. The replacement is
one line: **the throw runs from the burst point to the body's own centre of
gravity, in all three dimensions** (`hurlVelocity`, lib/game/tumble.ts).
The exe's own blast toss is a physics CONTACT with the effect's 35-radius
sphere (weapons/fire.md, still undecoded), and a contact's impulse runs along
its normal — which is this line — so the geometry is the read's in spirit and
tagged `[CHECK — remake]` where it stands in for it. Under the trotters is
straight up; level with the chest is a flat shove; a ledge overhead slams
DOWN. The melee keeps its 45°, where `0x4a9100(speed, 0x200, …)` is read.
The `fling` seam now carries a VELOCITY and the thrower builds it, so the
two models never meet in the middle. Pinned six ways in unit/blast.spec.ts,
and the mine's own throw — straight up, down on the same spot — in
e2e/002/tumble.spec.ts.

**The machine-mission stall guard then earned its keep twice.** The new
trajectories reshuffled the endgame of the headless ESTU mission and it ran
an hour without a verdict: two grunts on a clifftop lobbing grenades at a
third 8700 units away, every turn, forever. Two real bugs under it, both the
AI's, neither the blast's:

- **The dry-run priced throws the engine cannot deliver.** `flight()` broke
  on `groundAt` — the SEABED under water — so a lob dry-ran through the bay's
  surface to its floor, and off a clifftop the first ground contact really
  was 8700 units out (the roll downhill is the engine's own). Two fixes: the
  battle now hands the brain a `groundAt` that answers the WATER SURFACE over
  water (the engine douses a lob at the waterline), and a solved landing that
  comes down ON water prices to nothing at all — no blast, no worth
  (lib/game/evaluate.ts; pinned in unit/evaluate.spec.ts).
- **The detonator was on a one-second glance.** The seat mulled
  `AI_MULL_SECONDS` between decisions while its grenade rolled, and the
  fraction of a second the roll spent inside the foe's core fell between two
  glances — the brain detonated "at rest" 2300 units past him, deterministic,
  every turn. `AI_FUSE_SECONDS = 0`: while the machine's own grenade is live
  the seat decides every frame. Watching a fuse is not thinking, and the
  pacing was always the seat's, not the brain's (docs/ai.md).

Measured after: the mission verdicts at ~271 s with five kills over thirteen
shots, 1v0 — faster and deadlier than before the pass, because a thrown
grenade now goes off beside the foe it was thrown at.
**The read arrived a session later and re-anchored the whole thing
(2026-08-23, same day).** Play reported the downward case — "взорвалась выше
и позади свина — он как стоял так и стоит — а должен был отброситься по
земле в сторону" — and asked for the source itself: "может задизасмить
полностью как это в источнике?" The hunt (weapons/fire.md in the disasm
repo) read every arm to its end and overturned the standing theory: **the PC
exe's blast throws nobody at all** *(itself overturned three days later —
the throw is the effect's own phantom sweep, `pig.md` 2026-08-26)*.
`[pig+0x1B8]` is a FATIGUE meter —
walking feeds it, panting and the tired idle drain it — and the "physics
contact toss" this file guessed at is the ordinary solver doing nothing to a
standing pig. The pigs play remembers being thrown were the PSX's, and
play's memory outranks the PC binary by standing rule. What the read gave
back instead is the FORM: the one explosion that does throw — a building
going off, 0x44050c — uses the centre-to-pig line, which is exactly the line
`hurlVelocity` already walks. Two corrections landed with it: a line
pointing INTO the ground now throws FLAT along it at full speed (the ground
answers the downward leg — play's report above), and a charge dead overhead
slams straight down. The same sweep found the gun's long-lost DAMAGE
(row+0x0C, through the Hit-in-BODY arm 0x478710) — noted in the disasm
repo for the day the bullet tables are next touched.
**And the day after, both originals answered (2026-08-24).** The PC loose
ends closed first: the blast effect turns out to own NO physics body at all
(the r=35 sphere is a dead shape-table row for it; damage arrives by a
deferred hit-mark timer, `[pig+0x1A2]`, not by contact), and a whole-image
scan found zero indirect references to any throw primitive — the PC verdict
hardened from "throws nobody" to "does not even touch" *(both since
overturned by the phantom sweep)*. Then the PSX build
itself was read — play supplied the disc, the exe turned out RNC-packed with
the game code hidden in overlays disguised as data files (psx/notes.md in
the disasm repo carries that archaeology) — and its blast arm (0x800B22C4)
is the same damage-fatigue-smoke-squeal and return: **no original ever threw
a pig from a weapon blast** *(wrong as a verdict — the PC throws through
the effect's phantom sweep, found 2026-08-26, `pig.md`; the PSX arm is
clean too and its sweep analogue is still unlooked-for)*. The pigs play remembers flying were projectile
hits, building explosions and melee, which throw identically in both
builds. So the remake's blast fling stands as play's own rule with no
original behind it — kept because the game plays better thrown about — and
its centre-to-pig line is the engine's only "explosion throws a pig" form,
the building blast's (PC 0x40, PSX 0x78, both at pitch 0x200). Comments in
blast.ts/tumble.ts and the todo entry now say so.
**The contact toss closed the argument (2026-08-24, the same hunt's
follow-up).** Play would not accept "nothing throws" — "не может быть —
взрывы откидывают свиней" — and play was right about the PICTURE while the
reads were right about the blast: the exe has a real "the explosion threw
me straight up", it just does not live on the blast. It is the CONTACT arm
for the airstrike/fire-rain sub-munitions (kinds 0x15/0x16): touch one —
resting included — and it throws 96/frame at 79 degrees along the
charge-to-pig line AND detonates the same frame, indistinguishable from
the blast doing it. Gun hits throw along the bullet's flight; a grenade's
own rigid body can still shove a pig through the ordinary solver, which
the "Pig falling cos physics is on" trap dresses as a knockdown landing on
the on-its-behind clip. The grenade family, mines and TNT are inert to
touch and their blasts move nobody — three passes, both builds. The
remake's model already matches play's three-case testimony (up from under,
onto the behind from dead above, flat roll when offset), so nothing in
code moved; the 79-degree sub-munition pitch is on record in the disasm
repo if play ever wants the under-the-trotters throw at the exe's own
angle instead of straight up.
**The flat shove could not survive the landing (2026-08-24, play's next
report).** "Граната попадает на свина на неровной поверхности — он никуда
не сдвинулся": a throw with no vertical hugs the ground, the landing test
reads only the NORMAL arrival speed — zero — and settles the flight the
same frame, discarding the whole horizontal. The fix is what both originals
do anyway: **the knock's 45° is the pitch FLOOR** — every read knock in
both builds is thrown at 0x200, nothing in the engine ever throws flat, and
the "roll along the ground" of play's memory is a 45° toss bouncing. The
centre line still wins when STEEPER (under the trotters -> vertical, play's
spec); dead overhead still slams down on the spot. hurlVelocity carries the
rule, unit/blast.spec.ts pins seven geometries including the shallow-line
floor, and the far-pig throw in e2e/002/tumble.spec.ts now asserts the 45°.
**The roll itself was still missing, and the settle was eating it
(2026-08-24, the sliding hunt).** Play, after the 45-degree floor: "всё ещё
нет движения по земле — будто трение слишком большое — катится на месте."
The bench came first (memory: measure-the-miss): the real flight over flat
ground carries 1908 units in 1.5 s — the arc was never the problem — and on
the SECOND touch the normal arrival is a crawl while 717 units a second of
horizontal remain, and the settle threw all of it away in one frame. The exe
was re-read at the exact spot and disagrees with the old reading's
assumption: the impact handler's threshold operand `di` (0x4711d8) is
`[hit+0x14]`, which the sweep fills with the full LENGTH of the relative
velocity (0x407a44 -> 0x418310, an fsqrt of all three components) — so a pig
skimming fast and FLAT keeps bouncing in the original, its slope-parallel
speed surviving every contact (the bounce arm's kick at 0x4712e0 goes
through 0x4a9260, the ADD primitive, on top of what the solver left), and
only a full magnitude under 25 a frame is zeroed. Two changes: `fly()`
settles on the full arrival speed over open ground (BLOCKED ground keeps the
normal-arrival test, deliberately — the wall slide-loop play once caught
must not come back), and `bounceOff` charges friction as a RATE
(`keep^(delta/EXE_FRAME_SECONDS)`) because our 1/60 contacts came twice as
often as the exe's solves and a roll died twice as fast. Bench after: 129
units of visible roll past the touchdown, speed fading 717 -> 357 on the
exe's own grass numbers. unit/fling.spec.ts pins four ends of it: flat
flight + roll, knocked downhill always gets away, knocked into a rising
slope still moves off the spot, and the whole burst-on-a-hillside chain
throwing the pig 45 degrees down the slope.
**The vertical window was half a pig wide (2026-08-24, ESTU).** Play, on the
first mission: "взрыв был так, что его должно было вверх по горе подвинуть —
а он на месте катился. физика сломана." The probe cleared the terrain and the
neighbours first — ESTU's pigs spawn 4500+ apart with no obstacle within 800,
and the same 45-degree uphill fling at the victim's own spot travels 1693
units through the real flight — so the horizontal died at the LAUNCH. The
steep-centre-line rule was the culprit: with the centre 100 over the soles,
any burst within ~100 of the axis threw along the line — 60..75 degrees, all
lift and no shove — and a grenade landing at the trotters is always within
that window. Both originals never throw steeper than 0x200 = 45 degrees,
anywhere. hurlVelocity is now three cases split by the body's own footprint
(PIG_RADIUS): under the body straight up, over it straight down, everything
else the full 45-degree knock along the flat bearing — which is the literal
reading of play's own spec (под свином / прям над / сдвинута).
unit/blast.spec.ts grew the boundary tests: offset-inside-the-footprint goes
vertical, just past it takes the full knock, offset-overhead still slams
down. The same session answered the OTHER report — stuck at ESTU tile 55,10
"по виду земли можно пройти" — with a read, not a change: the exe clamps the
playable world to +-0x3000 = 12288 (TryMove step 2, movement/notes.md), and
tile 55's far edge IS 12288: the outer eight tiles of every map are drawn
decoration the original refuses too.
**The freeze was never the physics — it was the PAINT (2026-08-24, the
close).** With the whole engine chain proved (probes, knockback.spec, and the
session's own telemetry: [fling] flat 1909, [fling-end] moved 1660) play asked
the right question — "может модель не перемещается за позицией?" — and that
was it, in three/battle.ts's snapshot placement: only CORPSES were placed from
the snapshot, the comment even boasting "nothing else places a pig that is not
acting". A living non-acting pig's mesh stood at its spawn while the tumbles
carried the body 1700 units — the bounce clip playing on a mesh nobody moved,
which is "он на месте катился" exactly, and why the vertical mines always
LOOKED right (no horizontal to lose) while every sideways knock read as
broken. Every fling spec had read the ENGINE, so all of them passed — the
third session paid to the same trap CLAUDE.md now counts three of. The loop
places every pig from the snapshot now (the interpolated acting placement and
the drop keep their own painters), pow.debug grew nodeAt (the DRAWN node) and
flingOther (the trigger), and e2e/002/flungmesh.spec.ts is the paint check —
run against the reintroduced bug it fails on the node that never moved, and
with the fix it watches the mesh travel 400+ in the live scene.

## 2026-08-24 — a bullet SHOVES: HitByProjectile read to its last arm

Play: "тут даже выстрелы имеют сдвиг" — and the read agreed before
anything was invented. 0x478710 ends every bullet path in
`0x4A9260(0x30, [proj+0x90], [proj+0x94], 0)`: ADD 48 units a frame along
the bullet's own pitch and bearing, a literal in the instruction stream
(the weapon row contributes only its damage; kind 0x12, the flame family,
pushes 6), then state 5 and clip 39 "Bouncing on B-Hind" unless the body
is already falling; the one gate is state 8, gone. Built as SHOT_SHOVE
(lib/game/bullets.ts) through the ordinary fling seam — bounce clip, not
the melee's flying 38 — with the gone-gate as `pig.gone`, so a fresh
corpse is thrown and an overkill's body is not. unit/bullets.spec.ts pins
magnitude, line, the corpse case and the gate. Read and not built: the MG
burst cap (edi 5, first round ×5 then ×1 to five rounds), the stagger
counter, the medic dart heal, kind 0x36. Full read appended to the disasm
repo's weapons/fire.md.
## 2026-08-25 — the round is SPENT, and it never was on the loosed branch

Play, after a mission: "оружия не отнимаются кстати когда стреляешь — 3 было
гранаты у первого моего, 3 и осталось."

The decrement existed twice and neither site was on the path a gun or a lob
takes. `strikes.ts` spends one as the swing's clip goes on — the exe's own
moment, 0x46975e — and `attack.ts` spends one where a planted charge leaves
the trotters. The branch that actually LOOSES something, the `else` that
covers every gun and every grenade, wrote nothing to `carrying` at all; the
whole inventory model was in place around it (`spend` in
lib/game/inventory.ts already guards the `UNLIMITED` sentinel and drops a slot
that hits zero), so a pig with three grenades threw three and still had three,
and the HUD counted honestly what the engine never changed.

One line, at the moment the projectile leaves: `spend` on the skill the branch
just fired with, and only when `away` says something really left — a refused
throw is not a round. **No holster there**, unlike the melee's: everything
that reaches this branch ends the turn (lib/game/spend.ts), so `endTurnBeat`
puts the weapon away a beat later, and emptying the hand at the instant of the
throw would take the DETONATOR's own fire key with it while the grenade was
still in the air.

It changes the shape of a battle rather than a number: the machine's mission-1
run went from twenty-seven shots to thirty and from ~721 s to ~1357 s, because
both squads now run out of grenades and finish with rifles.

## 2026-08-25 — the corpse's bang is a REAL blast, and a charge under the trotters follows the SLOPE

Two of play's, one settled by a read and one by geometry.

### "Взрыв свина не дамажит никого?"

No, it did not — `corpses.ts` emitted a `blasted` picture and nothing else.
The exe was read to settle it and the answer is that it damages, generously.
`0x4680E0(kind)` is the death dispatcher, reached from the state-7 arm
(`0x46fb88`) for an ordinary death and from `0x467d10` for an overkill; each
of its four arms allocates an effect and calls
`0x487AD0(x, z, id, RANGE, 1, ?, DAMAGE)`:

| death | site | id | range | damage |
| ----- | ---- | -- | ----- | ------ |
| on land | 0x4688ad | 0x56 | 0x400 | 0xA00 — **twenty points** |
| in water (tile 4) | 0x468927 | 0x5B | 0x800 | 0x500 — ten |
| in water (tile 0x0B) | 0x4689a3 | 0x42 | 0x800 | 0x500 |
| GIBBED | 0x468a5f | 0x56 | 0x800 | 0x500 |

The ID is what makes it hurt: `Effect::Init`'s shared tail (`0x489493`) gates
on `0x41 <= id <= 0x63` and only inside that window writes the damage, the
range and the phantom collision sphere; `Pig::OnHitObject`'s effect arm
(`0x4778ae` → `0x477c22`) then runs the ordinary falloff and calls
`TakeDamage(amount, 0)`. Kind **0**, so a corpse's blast can carry the next
pig past the gib threshold and blow IT apart in turn. It cannot touch the
dead — `TakeDamage` returns at once for states 6, 7 and 8 (`0x467ac9`) — which
is the same rule `burst` already had in `isDead`.

Two things stay the remake's. ~~The exe's corpse blast **throws nobody**~~
*(superseded — the corpse blast THROWS, through the effect's phantom sweep
`0x409EF0` like every blast in the band, `pig.md` "phantom sweep" /
`weapons/fire.md`; the primitive scan below was accurate and beside the
point, the sweep writes the velocity directly. Its strengths: land 3250
over range 1024, water 2600, lava-water 4000 — 2026-08-28)*: a full
scan of the two velocity primitives (`0x4A9260` ADD, seven sites; `0x4A9100`
SET, twenty) puts none of them inside `0x4680E0..0x468B70` or in the blast
arm. In this engine every blast throws — now the exe's own shape too, not
only `[play]`'s override. And the PICTURE is still the grenade's row —
0x56 reads parameter row 7 and 0x5B row 8, neither transcribed.

Built as a port: `CorpseWorld.blast` hands the charge to the same `burst`
every grenade uses, so falloff, fling, kill credit and picture are one path.
Also closed on the way: the gib arm's "what its scatterer spawns is not read"
— it spawns that blast.

The measurement, `machine-mission`: **~343 s, five kills over eighteen shots,
1v0** — against ~508 s and thirty-three shots an hour before. Corpses finishing
each other off is most of that.

### "От динамита застрял свин на склоне, а не улетел"

The log has the launch: `v 0,-3000,0 flat 0`, and a landing 185 units away.
That is the footprint case in `hurlVelocity` — a burst inside the pig's own
radius throws it straight UP — and on a hillside the same hillside catches it
coming down, which reads as stuck.

A body resting on a slope is held by that slope, so a charge under it throws
along the GROUND'S OWN NORMAL: `TerrainQuery.normal` is exact (the half-tile
is a plane), flat ground still gives (0,−1,0) so the straight-up case is
untouched, and a thirty-degree face throws the pig thirty degrees down the
hill. The normal arrives as an optional port on `BlastWorld` (`groundNormal`),
so the pure damage specs keep their flat world.

### HEALING HANDS land — the medic careers' first working skill (2026-08-26)

The ORDERLY's laying-on of hands works: skill 52 is a contact heal resolved in
`lib/game/healing.ts`, wired through `attack.begin` the way the blade is, and
the whole arm was read out of the exe the same day (0x47b894, off the fire
dispatcher's jump table). What it does, each number at its instruction:

- **The nearest pig within 1024 units and ±45° of the facing** is taken —
  the search starts its nearest-so-far at 0x100000 square units (0x47b8ca)
  and the bearing test is |diff| < 0x200 of 4096 (0x47bcfe). **No team
  filter**: an enemy in the cone is healed as happily as a friend. The exe
  skips the healer itself by identity (0x47b910); here a dead or gone body is
  skipped too — the exe's own state list (8/1/4/3, 0x47b8ec) does not name
  DEAD, and whether a corpse can be picked there is unread.
- **`min(missing, 20)` points go back** (0x47bf1f..0x47bf3a) — the one CAPPED
  heal in the game, taken against the class ceiling where the crate's
  `heal()` deliberately has none.
- **The charge goes only on a heal that LANDED**: the generic spend in
  `Pig::Attack` skips skill 52 outright (0x469751) and the arm's own debit
  sits behind the missing-health test. A press at nobody, or at a body
  already at its ceiling, is refused with the round still in the slot.
- **The turn is not spent and neither is the one-blow gate**: 52 was already
  on the keeps-the-turn list (lib/game/spend.ts) and now it also does not set
  `struck` — heal, walk on, and the rifle still answers. The pig is held for
  the length of clip 78 ("Heal") instead, the way any attack clip holds one.
- The number floats off the healed body in the crate's own heal style and the
  sigh rides the same `healed` event — nothing new was drawn.

`pow.debug.heal()` is the miss diagnosis: every candidate's distance and
degrees against 1024/45, who was taken, and an `amount` of 0 for a ceiling
refusal. `unit/healing.spec.ts` pins all of it.

Deliberately not built: the arm's own sounds (0x4F on a refused press, 0x43
and hand sparks off bones 5 and 8, effect 0xE4, on a landed one) — the press
is silent until play asks; and the status-clearing tail past 0x47bf40
(`[pig+0x3A4]`), because there are no status effects in this engine yet. The
same read settled the rest of the family for later: 17 MEDIC DART heals
min(missing, 40) in `Pig::HitByProjectile` (0x4787d6), 33 MEDICINE BALL is
projectile 425 detonating into blast effect 0x60 — 40 points in the core, the
usual falloff to a quarter, clamped to the missing health per body
(0x4778c6) — and the unnamed skill 53 is a SELF-heal of up to 50 (0x47bf48),
in no class kit.

### The point-blank pistol, and the muzzle that was never tested (2026-08-26)

Play, mission 2: "пистолет в плотную использованый както мимо стрельнул."
Proved before it was fixed, with a spec that failed on the old code
(`unit/bullets.spec.ts`, "a point-blank shot lands"): the pistol's barrel is
the hand bone plus 115 world units (`MUZZLE[6]`, z 230 model units at half
draw scale), and the hand itself rides forward in the firing pose — so fired
body to body the round is BORN inside the target's own box, sometimes at its
far wall. The update's first collision test came only after a first substep,
and a substep is HIT_RADIUS long (85), so the far 75-odd units of the body
and everything behind it were a dead zone the shot sailed clean through, to
land 'air' six thousand units on.

The fix is one sentence: **the muzzle is the flight's first point, and it is
tested** — `fire` runs the same `land` the update runs, before the shot ever
joins the flying list. With the spawn point live, the one body that must
never answer it is the shooter's own (a barrel leaned back over the shoulder
starts inside it), so the pig loop now skips `shot.owner` — a bazooka still
clips its owner through the BLAST, which is a different path and play likes
it ("даже себя задел чутка - для тупого идеально").

The rifle was the same bug at longer odds — its muzzle sits at 175 world
units, deeper still — and both are fixed by the one test.

### HEALING HANDS: the act first, the points later (2026-08-26)

Play, after using them on mission 2: "они должны звук применять - эффект
вроде даже и только потом хил проходит, а у тебя сразу хил и анимация." The
exe does everything in the one arm — sound, sparks, vtable heal, all at
`Pig::Attack` — and play overrode the ORDER: the press is now the ACT
(`healBegan` → P_HEAL, decoded at 0x47be0f, plus clip 78), and the points
land at the clip's own beat (`HEAL_PHASE`, halfway — `[deliberate]`, no
key-frame of clip 78 is read; `[play]` for the order). A refused press says
so out loud now too: `healFailed` → P_OWW at 100/100, the arm's own failure
exit (0x47c6f0). A heal cut short by the clock still lands what was paid
for — `reset` lands the pending points before it forgets.

The palm SPARKLE is now read and not built: the arm spawns effect id **0x0B**
from each palm (bones 5 and 8, reads at 0x47be5f/0x47beca) — a pure particle
effect, four batches of 13 laid in a chain along the facing, life 1000; the
earlier "0xE4" was the `operator new` size, not an id. It waits on the
renderer growing a particle chain, and the sound does not.

### The sapper LAYS MINES — skills 35/36, read end to end and built (2026-08-26)

The whole mechanic came out of the exe in one pass, and it is prettier than
a planted grenade. The lay rides TNT's own door — planted family, no gauge,
clip 77 with the charge dropped at PLANT_PHASE — but what the key-frame
drops is FURNITURE: a visible WE_APMIN object at the layer's feet. It arms
after 25 frames with the L_MINETR click (0x43699d), and then BEDS INTO THE
GROUND — becomes the tile's own mine bit (`Map::SetMine`, 0x4374cf) — only
when the bed-in walker (0x436e55) finds not one live pig within ±512 of it
on either axis, the tile dry and the bit free. **That clearance is the whole
of why a layer never trips its own mine**: while anyone stands about it is
furniture; the moment the last pig leaves it sinks, and the ordinary tread
takes over — the layer's own foot included, no side is checked anywhere.

35 against 36 is a flavour: trigger kinds 40/41, identical 20 points over a
1024 blast, effect ids 0x55/0x4c both reading parameter row 14 — so the
remake detonates both through the one MINE_EFFECT_ID, and no shipped kit
carries 36 anyway.

`[game+0x534]` fell with it — all five sites read: a saturating
mines-laid-this-turn byte, zeroed every handover. The first TWO lays a turn
are free with the clock running on; the third — or a lay with under four
seconds left — squeezes the clock to the planted four (which under four is
a small gift: the exe SETS the deadline). `minesLaid` in the battle is that
byte, and the one-blow gate now exempts a mine in hand — a budget that
counts to two could never fill under a one-lay gate.

Two B10 corrections landed on the way: the detectors are the exe's reveal
gate {4, 5, 6, 7, 14} (COMMANDO, the engineer family, HERO), and the reveal
is the exe's own 3×3 of tiles round the detector (0x4767a0) — the invented
1024-unit radius is gone. A laid-not-yet-bedded mine is drawn to EVERYBODY
(it is a visible object in the original too); a bedded one goes back to the
detectors' marker. `unit/mines.spec.ts` pins the lay, the clearance, the
one-shot tread and the refusal on an occupied tile.

Deliberately diverged / deferred: the lay REFUSES a tile that already holds
a mine (the exe drops the object and lets it lie for ever); the bed-in's
own sound (index 0x61, name unread) is silent; the AI does not price a mine
yet — plantOption still needs a row to read (docs/ai.md).

### The mine's clock is PLAY's, and so is its bed-in (2026-08-26, same day)

Play corrected the fresh build on all three counts, and play wins:

- **"мина взрывается когда ход кончается в оригинале"** — the bed-in is not
  a clearance watch, it is the TURN'S END: every laid mine becomes its tile's
  bit in `endTurnBeat`, and one bedded under somebody's feet — the layer's
  own included — goes off in that very beat (the wait already holds for the
  fuse). The ±512 clearance model read off 0x436e55 is gone.
- **"вторая мина уже не бесплатна - а остаётся 5 секунд и нельзя больше
  ничего использовать"** — the budget is one free lay; the second squeezes
  the clock to `MINE_HURRY_SECONDS` (five, play's number over the reading's
  four) and sets `struck`, closing the hand for the turn. The exe reading's
  "two free, third squeezes" stays in the spend.ts note as what was read.
- **"2 мины можно в 1 место поставить"** — the lay never refuses ground: two
  on one spot bed into ONE bit and one bang (the tile carries a bit, not a
  count), and a spent map tile is live again under a fresh mine.

The commando seeing mines play also asked for was already in — the exe's own
detector set {4, 5, 6, 7, 14}. `unit/mines.spec.ts` re-pins the whole shape.

### The SHOTGUN is a shotgun (2026-08-26)

Play: "дробовик не работает - там должно много пуль вылетать - щас одна и
наносит 3 урона." Three findings and one build:

- **Skills 12/13 are the SHOTGUN and SUPER SHOTGUN** — gtext 108/109 by
  `SKILL_LINE`, model `WE_BLUND` (a blunderbuss). The repo's "RIFLE BELL /
  SUPER RIFLE" was the icon's name (`rifbell`), not the weapon's.
- **The exe fires ONE projectile and fakes the blast of shot in the hit
  handler.** The byte map at 0x478B18 was read whole (capstone, this
  session): kinds 0x12 AND 0x13 land on `mov edi,5` — first hit
  `3 points × 5 = 15`, later hits 3, refused past five per pig. The earlier
  fire.md reading had only 0x13; both shotguns carry it.
- **The plain shotgun's shove is 6, not 48** (0x478A99, kind 0x12 alone) —
  and the remake's SHOT_SHOVE comment had mislabelled that exception "the
  flame family". The 6 now rides the weapon row (`Projectile.shove`); the
  SUPER keeps the common 0x30.

The first build wore the ×5 as five invented pellets in a fixed fan — and
play challenged the premise the same day: "ты прочитал прожектайлы? точно 1
только летит?" Right to. The fire arm itself had never been read — the
"one projectile" rested on fire.md's "every arm has the same shape" — and
reading 0x47a776 (the ONE arm both skills 12 and 13 dispatch to) to its
last instruction found a LOOP: `xor ebx,ebx … inc ebx; cmp ebx,0xA; jl` —
**TEN `new(0xD0)` + init pairs per press**. Iterations 0..8 build their
projectile with a NULL owner; the last carries the pig and lands in
`[pig+0x16C]`, the shot the camera rides. And the spread is real and
RANDOM: every iteration rolls `(rand & 0x1F) − 0x10` twice — a uniform
±16/4096 (~±1.4°) — onto the yaw and then the aim. So the exe does BOTH:
ten real pellets AND the ×5-with-cap in the hit handler, 15+3+3+3+3 = 27
point-blank, 15 for a single stray pellet.

Rebuilt as read, nothing invented left: `Projectile.pellets: 10`,
`spread: 16` (the jitter half-width, rolled per pellet per axis off the
battle's seeded stream — `BulletWorld.random`, the lockstep port), and
`burst: 5` — the multiplier-and-cap, applied per body per volley in
`bullets.land` (a refused pellet still stops and still shoves, exactly the
exe's fall-through). One press is one report and one round. The AI prices
the whole volley (`volleyDamageOf` — 27, not 3). The lesson joins the
standing one: an arm is not read until its own last instruction, and a
generalisation over 56 jump-table arms is not a reading of any one of
them. Pinned in `unit/bullets.spec.ts` ("the shotgun looses ten pellets").

And a third act, same day: play checked the arithmetic itself — "а 27
урона от дробовика это норм? … а не 5 дополнительных? 15 + 3*5?" — and was
right AGAIN. The later-hits branch had been read backwards: `cmp eax,edi;
jl 0x4788CF` at 0x478891 jumps PAST the TakeDamage while the counter is
still UNDER five, so hits 2..5 are ABSORBED — the first hit's ×5 is a
PREPAYMENT for them — and from the sixth pellet on each pays its own 3,
with no cap at all. Per target the volley deals `3 × max(5, hits)`: 15
for one stray pellet, 30 point-blank, not 27. `bullets.land` now absorbs
instead of capping (an absorbed pellet still counts, stops and shoves),
`volleyDamageOf` prices the max, and `weapons/shotgun-arm.py` in the
disasm repo asserts the branch's direction so it cannot be re-misread.
The lesson sharpened: an arm is not read until its last instruction, and
a BRANCH is not read until its TARGET is — "jl past the damage" and "jl
to the damage" are one byte apart and opposite weapons.

### The POISON GAS streams — skill 26 read and built, and the lob table was CROSSED (2026-08-27)

Continuing with the Scout meant continuing with its kit, and three of its five
items were poses with no mechanics. The gas came first, being the one that is
actually a weapon — and the read opened with a correction bigger than the
weapon.

**The skill→kind map was crossed for five rows.** The grenade family's table
in `grenade.ts` assumed the projectile kinds follow the skills in order,
24..32 for 19..27. Field +0x10 of the skill record says otherwise: 21→29,
22→31, 23→28, 24→26, 25→27, 26→28. HIGH EXPLOSIVE had been dealing 20 points
instead of its true SIXTY over half again a grenade's field; the ROLLER had
15 instead of 40 — and the 0.001/0.001 material this file had filed under
"26 sticks where it lands" is the ROLLER's, which is the punchline: near-zero
friction is WHY it rolls for ever, near-zero restitution is why it never hops
while it does. Nothing "sticks". And CONFUSION and POISON turned out to be
ONE projectile in the PC exe — both records carry id 416, same flight, same
cloud, apart only in text and icon. Whether that identity is the game or a
port accident is play's to rule; until then 23 stays a plain burst.
`weapons/gas.md` in the disasm repo carries the whole re-read table; the fix
went in as its own commit, pinned in `unit/lob.spec.ts`.

**The gas itself is a STREAM, not a bang.** The projectile update's
every-5th-frame dispatcher has kind 28 spawn effect 0x5E at the canister's own
position from frame 15 of the flight on, hissing BG_GAS as it goes — so a full
fuse lets go a couple of dozen little green clouds and a rolling canister
draws a LINE of them. The destructor is one last cloud and I_BULIT1 at half
volume: **no 0x54 blast, no push** (the row's force column is nil). A doused
canister goes quiet entirely — a gas grenade in the water is nothing at all.
Each cloud sweeps ONCE: a sphere, no line of sight (gas reaches round a
corner), first service per throw fifteen points FLAT (the falloff is only the
gate) with the Sneeze clip and the squeal, and the POISON bit for everyone it
washes over. The bit has NO timer: ten points at the start of every one of
the pig's own turns, for ever — under eleven the pig dies the moment its turn
comes round, which is the fan FAQ's own wording — and the tail of `Pig::Heal`
zeroes the status word, so ANY heal cures it. The swamp sets the same bit in
the exe, which makes the bog mechanically a cloud that never lifts (not
built). Skill 41's artillery GAS SHELL streams the same clouds off the same
row, hard-wired.

**The build rode three existing rails and invented almost nothing.** The
stream is `gas.ts` (valve times per canister, serviced masks per throw), fed
by `lobs.ts` at the one detonation seam and the update loop; the bit is
`poison.ts`, a Set beside the drowning counter's Map, drained at the handover
right before the turn card so the announced health is the turn's real one —
and a pig killed there ends the turn through the same dead-acting-pig test
that already existed. The picture needed NO renderer work at all: a puff is
an ordinary short-lived effect (`GAS_EFFECT`, thirty green blobs through the
same cloud spawner the fireball uses), so it rides the snapshot like any
blast. The cure needed no wiring either: both heal paths already emit
`healed`, and the engine's own subscription cures on it. The hiss joined the
fuse's tick as the second repeating poll (`gasHissing`), BG_GAS laid end to
end — play had identified that sample cold weeks ago ("газовая граната так
делает"). The AI prices the throw as damage plus a two-turn poison horizon
(`POISON_WORTH` — the brain's own model, the engine's poison runs until a
heal whatever the brain thinks). Pinned in `unit/gas.spec.ts` and
`unit/poison.spec.ts`; what is still open — the afflicted Scramble stance,
the green face, the other three status grenades, the swamp — is todo P2b.

### The Scout's other two: HIDE becomes a bush, PICK POCKET takes the slot (2026-08-27)

The kit's last two items, read and built in one day (`weapons/espionage.md`
in the disasm repo carries the whole read).

**HIDE (55) is a DECOY, not a fade.** `Pig::SetHidden` stops the pig being
submitted to the renderer at all — no model, no plate, no blip — and stands a
scenery object where it was: the nearest disguisable prop within 8192 out of
a fixed name list (bushes, trees, cacti, CRATE4), the crate when nothing is
near. The hidden flag's writers were swept whole: one in-play setter (the
fire arm), and the clearers are the per-turn status pass (the cover lasts
exactly one round), any damage, a blast, any fling, death, madness gas, and
the decoy's own destruction. `Team::BuildTargetList` skips a hidden pig — the
AI cannot price it — and a MELEE strike on one diverts whole to a KNOCK ON
WOOD: FT_WOOD, a sample no shipped map's ground ever plays, finally finds its
job. The enemy's espionage pigs start every battle hidden (Map::Load's own
tail sweep). Using it ends the turn, off the record's own flags.

Built on three precedents at once: the decoy rides `props.spawn` the way the
boots do (`three/decoyArt.ts`), the hidden pig travels as `PigShot.hidden`
beside `sheltered`, and the reveal wiring hangs off the engine's own bus
subscription (damaged / killed / flung). Two honest edges, both in
CLAUDE.md's list: hiding lands AT THE PRESS rather than at the end of the
gesture clip, and the decoy does not yet SOAK damage (its hit points are
unread — the manual's "extra protection" waits on that read). Restoring a
revealed non-acting pig's mesh exposed a standing renderer bug — the
visibility loop only ever wrote `false` — fixed by writing the snapshot's
word both ways.

**PICK POCKET (54) is the heal's cone with a burglar's filter.** Same 1024
and ±45°, but no team test, no dead test — an ally or a corpse is fair game —
and what crosses is a random WHOLE slot, unlimited included, never one
charge. The victim has no reaction whatsoever; the thief tiptoes through clip
79 and sniggers (P_LAUGH1-3, the exe's own roll). The verdict lands at the
END of the clip, both failure exits P_OWW. One deliberate verbatim keep: the
thief's append cap is 14 — one less than a crate's 15 — and at the cap the
loot silently vanishes while the victim still loses it. Keeps the turn, is
not a blow, and the charge goes at the press whiff or not (the heal is the
exempt one, not this).

Pinned in `unit/hide.spec.ts` and `unit/pickpocket.spec.ts`. With these two,
the SCOUT'S KIT IS WHOLE: knife, rifle, gas, hide, theft — every slot does
what the original's does.

### …and the decoy's numbers landed the same evening (2026-08-27, later)

The two edges the morning's write-up left open closed before the day ended,
both on play's prompt ("20 урона вроде должно поглощать" — close, and the
table said more). The decoy's hit points are the object-health table's own by
model — crate 40, bush 50, tree or cactus 80 — so what you hide as is what
you can take; a bullet lands on the cover first and only the hit that BREAKS
it passes its remainder to the pig. Then the gas gap: the hidden pig's body
turns out to be OUT of the physics entirely (SetHidden's body bit is the
sweep's own first-instruction skip), and the decoy's effect arm excludes the
whole status-gas band — so GAS touches nobody hidden, and a BLAST is soaked
by the cover through the same falloff every pig takes. One earlier reading
stood corrected by that: "the blast sheds the disguise before dealing" was
the belt to the decoy's braces, not the road. `weapons/espionage.md` in the
disasm repo carries all three passes; `unit/hide.spec.ts` pins the soak.

## 2026-08-28 — the espionage beats voiced, the lob tumbles, the deaths' strengths

Play's list, worked through in one day and its evening:

- **PICK POCKET says what it took.** The bar prints the stolen skill in the
  crate pickup's own "%u X%d" formats, and the two refusals print the exe's
  literal `.data` strings (0x4D16D0/0x4D16F4) — both wired in ui/battle.ts
  off `stole`/`stealFailed`. The innocent whistle is clip 79's own keyframe:
  phase 640, event 35, P_WHIST1 at 40..55 pitch 105 — the engine times it
  (`WHISTLE_PHASE`, pickpocket.ts) and the mix is decoded, not picked.
- **HIDE is a gesture now, and its sound is the exe's gag.** The disguise
  lands at the END of clip 81 (the exe's end-of-sequence shape; hiding at
  the press was `[deliberate]` and play revoked it). A first pass gave the
  press an invented P_BUSH rustle; play asked "точно нет?" and the DLL's
  keyframe table answered: the clip carries a fatigue-gated breath at phase
  1078 (silent for a fresh pig, here and in the exe — fatigue is not
  modelled) and a COIN-FLIP FART at phase 2310 (`STRAIN_PHASE`, hide.ts;
  P_FART1-3 at 50..65/100..115). The keyframe RECORD itself is decoded now
  — `anim/audio-events.md` — which also gave clip 17's draw/stow swap.
- **A thrown lob TUMBLES.** No flight animation ever existed — the only
  orientation was the rocket's nose-on-velocity, invisible on a symmetric
  grenade. The spin lives in the engine (`Lobbed.spin` + a lateral axle
  fixed at launch, stepped in lobs.ts at `TUMBLE_TURNS` = 2 turns/s,
  `[CHECK — remake]`), crosses on the snapshot, and three/grenades.ts only
  wears it; the rocket keeps its nose, a planted charge its stand.
- **The corpse blasts' own strengths, read** (they spawn direct, outside
  the weapon-row table): land 3250 over range 1024, water 2600, lava-water
  4000 over 2048 — through the same phantom sweep as every blast. In
  per-frame Δv (÷ the pig's mass 30) that is ~108/87/133 — the same order
  the remake's play-tuned 6×points lands, so the models differ in SHAPE
  (falloff to 25% at the rim, doubled vertical, damage-independence) more
  than in size. Switching to the exe's shape is play's call, still open.

### The MEDIC's level-2 kit: the dart heals, the ball bursts blue (2026-08-28)

Level 3 work opened with the second-step classes, and the MEDIC (class 12)
is the one whose two new skills — 17 MEDIC DART ×3 and 33 MEDICINE BALL ×3,
the whole of what the step adds beside +20 max health — were poses with no
mechanics: the dart fired and did nothing, the ball had a weapon row and no
throw at all. Both were already half-read; a fresh capstone pass closed the
gaps and cross-checked every layout against a value the notes had pinned.

**The DART (kind 0x24) is a rifle round that puts points ON.** Its arm in
`Pig::HitByProjectile` (0x4787D6) is `min(deficit, 0x1400)` through
`Pig::Heal` — forty points, clamped to what the body is missing, NEVER a
knock (the kind is on the no-throw list). Built as `Projectile.heal` and a
heal arm in `bullets.land` before the damage path: the `healed` event is
the whole common tail — the pink number, the sigh, and the CURE
(lib/game/poison.ts) ride it already, so a dart into a poisoned pig at its
ceiling heals zero and still takes the poison off, which is the arm's own
gate (0x4787E8) read literally. A dart into a DISGUISED pig stops in the
wood like any round. Its destructor's effect 0x3F is below the combat
window — purely visual, not built. No gauge (record +0x14 = 0), 30 frames
of life at speed 300 — a short-range gun round.

**The BALL (kind 0x25) is a grenade that heals a FIELD.** Row read whole
(VA 0x4C25F8): speed 300, arming 2 under the 150-frame fuse, material
0.5/0.8 — bouncier than a grenade — and its destructor (0x4331D1) spawns
effect **0x60** with the row's radius 2048, force 0, amount 5120. The 0x60
arm in `Pig::OnHit` (0x4778C6) is `min(deficit, falloff)` — the SAME
`blastShare` ramp every blast runs, forty at the core, a quarter at the
rim — and the id sits in the GAS group's phantom flags (Init 0x489A00): no
push, no line of sight — it heals through walls. A flying ball touches
nobody (kind 0x25 is not in the projectile pass filter); everything
happens at the burst. Built as `Lob.heals` branching the one detonation
seam into `mend` (blast.ts) — `burst`'s mirror with every destructive half
out: no fling, no dummies, no `killed`, hidden pigs skipped (the decoy
handler excludes the status band 0x5C..0x61 whole), and the ceiling gate
kept: a full-health pig is passed over UNLESS afflicted, and then the zero
heal goes through for the cure (`BlastWorld.afflicted`, wired to the
poison set). The flight wears **WE_BALL** (row 425 of the name table).

**Its picture is parameter ROW 4, decoded and validated.** The accessor
came out corrected on the way — `param(row, off) = s8[0x4D61E8 + row·143 +
off] × u8[0x4D6C88 + off]`, the scale table is BYTES, not dwords — and the
proof is that rows 0 and 14 fed through it reproduce ROW_ZERO and
MINE_EFFECT to the number. Row 4's live stages are F, K, L (as
effects/notes.md had), all on frame 1, all at step 1 — a slow blue-violet
ring and twenty gently rising blue motes living the full 100 frames, the
longest-lived stages in any row read so far, and visually the opposite of
a blast. `HEAL_EFFECT` in effects.ts, dispatched by id in effectField. The
bang is gated OFF for 0x60 in both presenters: no camera shake (the effect
carries no force) and no blast boom — the ball's own report is unread
(`[gap]`), so it opens in silence and the P_SIGH of each heal carries it.

**The brain does not throw it.** A heals row prices to NOTHING as a weapon
(`lobOption`/`lobPoints` refuse it) — priced as a bomb it would lob forty
points onto the enemy. Teaching the AI to HEAL — the ball, the dart and
the hands alike, none priced today — is a wits feature of its own, still
open (docs/ai.md).

Pinned in `unit/mend.spec.ts` (the row, the cap, the ramp, the ceiling
gate, the hidden skip, the id) and `unit/bullets.spec.ts` (the dart's cap
and clamp, no damage, no shove). With these two the MEDIC'S STEP IS WHOLE:
what class 12 adds over the ORDERLY — the health row was already in — now
all does what the original's does. Still open in the medic family: 18
TRANQUILLISER DART's status (SURGEON), skill 53's self-heal (no kit).

### The tumble lasted one day, and the fuse found its clock (2026-08-28, later)

Play threw the lob TUMBLE out on sight — "она крутится в воздухе криво…
граната по сути шар, лучше убрать" — and out it went whole: `Lobbed.spin`,
the axle, `TUMBLE_TURNS`, the snapshot fields and the renderer's wearing of
them, per the no-leftovers rule. It was `[CHECK — remake]` from birth; a
grenade flies unturned now, the rocket keeps its measured nose-on-velocity,
a planted charge its stand. The note stays in grenade.ts so nobody rebuilds
it without a fresh ruling.

### The CLUSTER scatters at last — five bomblets out of the destructor (2026-08-28)

Play, off a mission-3 crate: "кластерная граната работает как обычная." It
did — its LOBS row is the grenade's to the byte, and the whole difference
lives in the destructor nobody had read. Read whole (weapons/cluster.md in
the disasm repo): kind 25's arm spawns its own FULL 30-point blast (effect
0x46 — the grenade's row 0 picture) and then five projectiles of id 421,
kind 33, at full charge — four pitched 0x3E8 (≈88°) with yaws a quarter
turn apart, one dead vertical, spawn heights stepped 40 so none is born
inside another — and re-seats the tracked camera on the vertical one. Each
bomblet is an ordinary timed grenade of its own row: speed 250, fifteen
points over 1300, material 0.40/0.80, bursting as effect 0x47 — parameter
row 6, decoded through the validated accessor: stages I and K only, twelve
grey sparks, no fireball. Worst case on one body 30 + 5×15 = 105.

Built as `Lob.cluster` branching the detonation seam: the vertical bomblet
is pushed FIRST so `head()` rides it (the exe's own camera re-seat), the
four angled follow on a world-aligned cross (`Lobbed` keeps no yaw; the
four-way symmetry hides the difference, and the note says so), each a lob
of the `BOMBLET` pseudo-skill (0x100 — past the real table, nobody ever
holds one) wearing WE_SU_GR (row 421). `Lob.effect` carries the bomblet's
0x47 into the blast announcement. Pinned in unit/cluster.spec.ts. The AI
still prices the cluster as a plain 30-point lob — the 105 potential is a
pricing note for the day the brain learns to lead with it. The same
destructor pattern (skimmed, not built): 40 ARTILLERY CLUSTER (five of id
426), 31/32 AIRBURST (id 399, the SUPER in two waves).

Play also asked "может у нас граната меньше летит чем в оригинале?" — and
the answer split in two. The ARC is exact: speed rides 1/F and gravity
1/F², so v²/g cancels the clock — 9000 units at full charge either way,
17.6 tiles, pinned in unit/lob.spec.ts (one sub-percent difference in the
remake's favour, `/0xfff` against the exe's `>>12`). What was short was the
ROLL: `EXE_FRAME_SECONDS` was **1/30** — a leftover console figure that
contradicted the repo's own 25 Hz inference (the turn clock's hundredths,
the 250-frame crush, the 25-frame wedge) — so the 153-frame fuse burned in
5.1 s where the original gives 6.12, while the FLIGHT rides the stretched
1/15 world and takes 2.83 s of it. The rolling window after landing came
out under half the original's, which is exactly what a shorter throw looks
like. The constant is **1/25** now; every decoded frame count (the fuse,
the gauge's 52 frames, the effect stages, the gas valve, the frontend's
tick) runs 20% longer and lands on the engine's own rate. Watch one number
in play: the beat after a blow moves 0.5 → 0.6 s, and play had blessed the
half second — if it drags, the beat's own frame count is the knob, not the
clock.

### The scattered five could not be set off by hand (2026-08-29)

Play, the day after the cluster was built: "кластерная граната должна при
разлёте тоже позволять взрывать когда захочешь — а щас разлётные сами только
могут взорваться по времени." The engine was innocent — `detonateNow` cuts a
bomblet's fuse like any other lob's, and unit/cluster.spec.ts had been pinning
exactly that since the day it was written. What the spec could not see is that
the press never reached it.

The canister's own burst is what OPENS the aftermath beat, and the beat's first
act is `attack.swallow()`. The five are born inside it. `settling()` counts
them, so the beat cannot end while they fly, and every press for the next six
seconds went in the bin — the player watching five grenades bounce with a dead
fire key. The unit suite could not catch it because the hole is in `battle.ts`,
between the input and the seam it was testing.

The fix is the exemption the ONE BLOW A TURN guard forty lines below had already
made, in the same words: setting off what is already in the air is the END of
the first blow, not a second one. So the beat swallows the press only when
`grenades.thrown()` is nought. It is not a cluster rule — anything that opens a
beat with a live lob still in the air was mute the same way, a grenade thrown
onto a minefield among them.

Pinned in `e2e/002/cluster.spec.ts`, headless and driving `battle.setFiring` —
the same call the input layer makes — with the engine stepped by hand. **The
app-level version was written first and thrown away**, and that is the part
worth keeping: it has to catch the window between the canister bursting and a
six-second fuse, with a turn handover inside it, and it passed and failed on the
same tree depending on how busy the machine was. A spec that races the thing it
tests is worse than none. The headless one runs in eighty milliseconds and fails
on the old `attack.swallow()` line, which is the only proof that matters.

### The knockback spec measured a place the throw stopped going (2026-08-31)

Rewritten because it was shaky by construction: five grenades down one turn,
with the thrower standing inside its own blast, so every round was thrown from
wherever the last one had flung it. It also aimed at a dip the throw had not
reached in a long while — the grenade bursts about 285 units from the pig, not
1590 — and passed only when the drift happened to carry it into range.

Now: a battle of its own per round off the same seed, and the geometry MEASURED
— one probe round finds where the burst lands, and the victim is planted at
offsets back along the throw from there. Which rule applies is read per round
too, off the round's own burst, because a pig's body is in the collision world
and DEFLECTS the grenade: two rounds of the same throw do not burst in the same
place once something is in the way.

**It immediately found what the old geometry never exercised**: a placement
where the engine hands out a clean 45° knock of about 2700 a second and the pig
travels eight units. `docs/todo.md` B15 has the numbers and where to look; the
test carries `test.fail()` so the suite stays green and the marker has to be
deleted by whoever fixes it.

The floor it asserts is derived from the damage now rather than flat, which is
the other half of why it used to be wrong: `flingSpeed` is `6 × points`, thrown
at 45°, so the ideal range is `v²/g`, and a single number cannot serve both a
core hit and a rim one. The rounds that connect keep between 22% and 48% of the
ideal — the pig is thrown along a slope, it drags, and it stops where it lands
— so the floor is 15% of it.
