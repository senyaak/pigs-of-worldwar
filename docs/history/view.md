# The view

The camera, the fades and the measures that judge them.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## THE PIG IS TWO NUMBERS, and a wall it hides behind FADES

**"Раздутая свинья."** Play: "очень сильно заметно что цепляет всё невидимыми
боками." The 170 read out of the exe is right and the mistake was the units — it is
a MODEL-space length, and every one of those halves in this remake (the bayonet's
460 → 230, `lib/game/melee.ts`). Halved it is **85**, and the pig as DRAWN — bone
offsets resolved, `MODEL_SCALE` applied — is **182 across the shoulders**. The exe's
own body and the visible pig are the same size, which is the check that the halving
is right.

**But one cylinder cannot be a pig**, and the tutorial is what proves it. The drawn
body is 393 nose to tail; the GAP in CAMP's first bridge is 512 and a running jump
carries 303, so nothing narrower than 104 either side can cross it — and the
tutorial's own words are JUMP THE GAP. So the two questions are two numbers:

- **`PIG_RADIUS` = 85** — how near a wall it may stand. Its SIDES.
- **`PIG_HOLD` = 196** — how far past an edge it is still held up. Its LENGTH,
  because a body is supported while any part of it is over the edge.

**A WALL THE PIG HIDES BEHIND FADES.** "Здание не просвечивает когда свинья
внутри", and then "там полупрозрачность — в exe посмотри." Both true, and the exe's
own hook is now written out in `../pigs-disasm/objects/notes.md`: the draw loop
dispatches on body type through a twelve-entry table (0x44e5e8), and the **BUILDING**
arm (0x1359, 0x44e486) calls `afForceTransparencyOff` when `[pig+0x170]` — what a
pig has ENTERED — is the building being drawn. Two things it is not: the PC
wrapper's hook is a stub (three instructions, stores its argument, nothing reads it
back), and the semi-transparency is not in the art (the PSX palette bit is set in 6
of CAMP's 191 textures, none of them the house's).

CAMP's house is not a BUILDING either — it is eighteen scenery pieces — so the
remake does the general version: `lib/game/seeThrough.ts` says which records the
segment from the eye to the pig's middle crosses (a slab test in each box's own
frame, so an oriented box needs no special case) and `three/props.ts` swaps those
meshes onto a cloned see-through material set. Every record of a model shares one
material array, which is why it clones rather than turning the shared one down.

## The judder measure is a RATE now, and both bars are back at 0.35

`002/camera-smooth.spec.ts` was scoring the second difference of the view direction
PER FRAME, which asks a frame that took 33 ms to have moved the camera as far as one
that took 16 and calls the difference judder. On a machine running other suites the
frame interval swings by that much, so the number wandered — 0.15 quiet against 0.39
busy, on a bar of 0.35 — and one of the three bars had already been let out to 0.6
to live with it.

Dividing each step by the time it was given fixes it at the root, and the time is the
app's own: `pow.debug.frame()` hands out the very delta `three/battle.ts`'s `onFrame`
was called with. The sampler's own gaps could not do it — its callback runs after the
battle's in the same frame, so those gaps carry the app's work as noise. A view moving
at a steady rate now scores zero however uneven the frames are, and the case the spec
exists for still scores about 1. Measured: 0.162 / 0.039 / 0.131 alone, and
0.156 / 0.039 / 0.077 inside a full run. All three bars are 0.35.

`002/effects.spec.ts:161` was the other one, and it was not flaky either — it was
asserting on blob 0 alone something that is true of most of a cloud and not all of
it. A sprite's in-plane speed is `((trig * sinPitch) >> 11) * out * spread >> 7` with
`trig` at most 256, so a sprite whose pitch rolls under about 2.5° has BOTH
components truncate to zero and goes straight up — about one in sixteen out of a 44°
cone. The claim belongs to the population: 80% of them spread, and the ones that do
not have nothing sideways to move along.

## THE FADE STOPS GUESSING, AND A THROWN WEAPON GETS ITS OWN CAMERA (2026-08-12)

**What fades is measured against the pig's own SILHOUETTE now, and the margin
is gone.** Play: "всё ещё становятся прозрачными вещи, которые не перекрывают
свина — то есть стоят не между ним и камерой." The cause was `SIGHT_MARGIN`:
every box in the world was grown by 256 — half a tile — before the segment test,
so a dummy at his shoulder, a coil of wire at his heel or a tree beside him
counted as being in front of him, and the three rays could not tell the
difference because they all converge on the same point and a box beside that
line crosses all three. The margin was there for a real want — a box hiding half
of him has to fade even when a ray to his middle misses it — and `silhouetteOf`
(lib/game/seeThrough.ts) is that want done honestly: nine points, three rows up
his body by three columns across it, the columns laid ACROSS the line of sight
so the outline always faces the camera. A box has to cross five of the nine and
is tested at its true size. Same majority rule as before, better question.

**And the grenade and the bazooka have a camera of their own — two of them, and
BOTH are the exe's.** Play: "для гранаты и для базуки отдельная камера — 2
режима: 1 выше, чтобы удобно целиться; 2 при нажатой кнопки из-за спины", and
then, when the first attempt hung the second on the trigger: **"я не говорил про
огонь! там есть отдельная кнопка, которая меняет вид пока держишь (у нас G)… я
сказал, когда в руки берёшь оружие — меняется камера."** Right on both counts,
and the exe has each of them:

- **TAKING IT IN HAND is a camera change, `0x493BB0`.** It runs on every write
  of `[game+0x458]` — the skill in hand — and dispatches on the skill through
  `[0x493DC4 + skill − 1]`. The thrown family (14, 19..33, 35..50, 56, 60, 61,
  63) and the five melee both ask for **mode 4**, and **a GUN asks for nothing**
  (0x493c9d jumps past the block), which is why a rifle only ever moves the view
  on the aim key. What separates the two is `0x49F6F0`, which STAMPS mode 4's own
  row: **3500** for anything thrown against **1500** for a blade — so the
  1500/2000 the shipped file carries is where the last run left it.
- **HOLDING THE VIEW KEY is mode 0x12, "TR cam"** (0x492e7a, name at 0x4d8e7c),
  and this repo had that written down WRONG as "else → the ordinary chase". Its
  handler (0x4a4620) sits **200 out and 400 up** at a nominal 1700, close in over
  his back, with a pitch the player may drive (`[cam+0x76]`, clamped to ±700 of
  4096 by a branch that names this mode alone).

So the two are the exe's own: back and raised while it is out, in over the
shoulder while the key is down. `weapons/fire.md` has both reads and the
correction. **The fire button touches neither** — it did for one commit and that
was a bug, not a feature.

**Mode 4 has no lift of its own**, which is what came of reading its branch to
the end instead of stopping at the first `add`: its arm sets a TARGET and three
springs glide the camera onto it — the distance (`0x4A0960`, which is where the
row's 3500 is really used: current separation minus the row, stepped), the pitch
(toward the SUBJECT's own, `vtable+0x44` being the orientation) and the yaw — and
not one of them carries a height. What holds the camera up is the common tail's
floor: `0x4A0B50` raises it to **ground + 768** whenever it is lower (0x4a0c12),
and **mode 0x12 is exempt by name** (0x4a0bd4), which is what lets the TR cam sit
400 over a pig rather than 768 over the terrain. So the rig's `CLEARANCE` is the
exe's 768 now — the last invented number in it — and the TR cam is the one view
allowed under it.

**And the lift is the exe's after all — COLUMN 1 OF THE MODE TABLE IS THE
CAMERA'S ELEVATION CEILING.** That column had been written down as "looks like a
zoom in 1024ths" since the rifle cam was read, and it is nothing of the kind:
`0x4A0900` is the elevation spring, it biases both angles by 0x400 — which is
LEVEL — and clamps the wanted one into `[0x100, column1]`. **A smaller column is
a higher camera**, and every shipped row reads off at once: the chase 22.5°
above level, the melee and the barrel cam 8.8°, the rifle cam and the TR cam dead
level, and the **MAP VIEW 85.6°**, which is the check — nothing but a real
overhead camera would land there.

So `0x49F6F0` was stamping the height all along, in the same nine instructions
this file already quoted for the distance: a thrown weapon gets **3500 and 692**
— 29.2° above level — and a blade **1500 and 800**, 19.7°. Further back AND
higher for a grenade, closer and lower for a knife, against the chase's 3072 at
22.5°. That is play's "выше, чтобы удобно целиться", read rather than chosen, and
`three/chase.ts` places the lob view by that ANGLE instead of by a lift of its
own. The remake's own rig turns out to be in the same world: `atan(LIFT / BACK)`
is 23.2°, within a degree of the chase's own 22.5°, and those two numbers were
picked by eye years apart.

**A CAMERA LENGTH IS OF THE WORLD AND DOES NOT RIDE `MODEL_SCALE`** — corrected
the same day, after an eyework fudge factor was offered for the distance and
play asked the right question of it: "точно нет? как движок тогда это делает?"
`MODEL_SCALE` is what a MODEL is drawn at and the exe applies it too; the map is
a tile of 512 either way, so **the exe's world and this one are the same world**
and a distance between two of its points is the exe's number outright, exactly as
`WALL_CLIMB`'s 128 is. What halves is a length taken off a MODEL — the bayonet's
460, the body's 0xAA. Two more corrections rode with it: **3500 is the
SEPARATION rather than the horizontal run** (the distance spring differences
`0x44E850`, so the elevation splits it into `3500·cos 29.2°` along the ground
and `3500·sin` up), and **the TR cam's 200 and 400 are its LOOK POINT, not its
camera** — `0x4A0B50(cam, &camera, &target)` takes the vector that handler
builds as its THIRD argument, and the camera is then put at the row's 1700 from
it at that mode's own dead-level ceiling. What this leaves standing is written
up in `docs/todo.md`: the ordinary chase is **2.7× closer than the exe's**
3072 at 22.5°, because `BACK`/`LIFT` are the remake's own eyework and halved
with the models rather than being a decoded number mis-scaled.

**THE LOB VIEW LOOKS 1536 PAST THE PIG, which is why he sits at the bottom of
the frame.** Play: "он поднимается выше и отдаляется — свин у нижней границы
экрана", against a rig that had him dead centre. It is the one thing mode 4's
thrown branch does that its blade branch does not — `0x44E620(0x600,
[cam+0x8C], &dx, &dz)` at 0x4a22f6, 1536 along the camera's own FORWARD yaw
(mode 0 springs that field toward `subjectYaw − column2`, and the chase's column
2 is zero) — **and the PC build then never reads the result**: the target is
stamped from the subject outright. A dead call on the one branch with a reason
to make it, in the build whose PSX sibling play is describing. Applied, the pig
lands 19.1° under a 29.2° axis — seven tenths of the way to the bottom edge of a
45° frame, which is where the original's own screenshot has him.

**And the CHARGE does not take the aim view away.** Play: "она отменяется когда
нажимаешь f — и вот тут должна переживать пока зарядка идёт." A filling gauge is
its own control set and it sits ABOVE the sights in `modeOf`'s priority, so
`readControls` was reporting `sighting: false` for it and the camera fell back the
instant F went down. The exe does not work that way and it is not a special case:
its aim branch is entered on the pad BIT alone (0x4928dc), `Pig::MayAct` going
false only picks a different arm of it, and the remembered camera is not restored
until the bit goes UP. So the `charging` set carries the key through — the VIEW
survives, the AXES do not, which is the exe's own `Pig::Aim` bailing on that same
`MayAct`. `three/chase.ts` carries all of it, the rig's six views are one
table there now, and `pow.debug.view()` is how a spec tells them apart — a camera
POSITION cannot say why it is where it is, and the rig eases between two views so
a reading taken on the frame the view changed is still the last one's.

One seam came with it: `Sights.sighting(holding)` is "the aim view is up at
all", beside `scoped`, which is the first-person half and answers for guns
alone. It is on the snapshot, because the camera is drawn from a snapshot and
nothing else.

## THE FLIGHT: what the camera does once the thing has LEFT (2026-08-12)

Play, watching a throw: "камера не чисто за снарядом, а в бок будто
перемещается", then "для гранат и базук она другая", then "камера следует за
ней!", then "камера там ещё будто едет по кругу вокруг". Four reports, and every
one of them was the binary being read to the wrong depth. `weapons/fire.md` has
the whole chase; the shape:

**Every weapon decides for itself.** They fire through one jump table — `eax =
skill − 6`, `jmp [eax*4 + 0x47CF8C]` (0x47a233) — and each arm tells the camera
its own thing, tails followed (the guns' is 0x47ad71, the thrown family's
0x47b853). **6 PISTOL / 11 SNIPER / 12 / 13 / 15 / 17 / 18 → mode 1**;
**19..27 GRENADES, 28 MORTAR, 29 BAZOOKA, 30..33, 39..44, 47..49 → mode 0x0B**;
34 and 50 JETPACK → mode 0x0A; 51 SUICIDE → mode 2; **7 RIFLE, 8, 9, 10, 14, 16
and the planted charges → nothing at all**. The remake asks the weapon's LAYER
rather than its number, because play's word is that a rifle tracks like a
sniper and the exe's own split is honoured nowhere else in the shot path.

**MODE 1 DOES NOT MOVE THE CAMERA.** Its handler (0x4a11e0) is thirty
instructions: decompose camera-to-subject, aim along it, return. No position, no
spring, and `0x4A0B50` is never called, so its row and the ground floor are not
read either. A gun's shot is watched from where the shot was taken, the camera
only turning. Which also explains an old empty search — `lib/game/sightline.ts`
dodges walls, the exe was found to have no line-of-sight test in its camera code
at all, and a camera that does not move has no wall to dodge.

**NOBODY IS EVER IN MODE 0x0B: `0x49F740` REWRITES IT TO 0x0D on entry**
(`cmp ebp,0Bh` … `mov ebp,0Dh`, 0x49f774..0x49f7a5). That is why 0x0B's handler
is a bare `ret` shared with modes 5, 8 and 0x0C — four empty functions folded
onto one address, unreachable. **Reading behaviour off that stub was the
mistake, twice over**: a `ret` is a missing function, exactly like mode 4's dead
1536. The rewrite also closes three loose ends — 0x0B/0x0C/0x0D share the setup
arm 0x49f912, that arm is the only writer of `[cam+0x7A]` and 0x0D's handler its
only reader, and the setter zeroes `[cam+0x78]` for every mode BUT 0x0D.

**Mode 0x0D (0x4a3a20) swings in behind the thing and then RIDES ROUND it**, in
two phases told apart by `[cam+0x5C]`. First it springs the camera's yaw toward
the subject's own facing and turns the camera ABOUT the subject until the step
is under 1.4°, then stamps the separation into `[cam+0x7A]`. After that, once a
frame: `radius = clamp(⅔ × separation, stamp, 10000)`, `[cam+0x78] -= 10` of
4096 — **0.879° a frame, one way, held within 67.5°** of the bearing it locked
at — and the camera is placed at that bearing and radius. Height is the row's
own ceiling, **column 1 = 824 → 17.6° above level**, plus the tail's 768 floor;
the row's 3000 is not read at all.

So the beat play calls the freeze is the one BEFORE the throw — `Pig::Fire`
plays the battle cry with the camera still in mode 4 — which is also why mode 4
aims 1536 down-range: the view a throw is made from is already looking at where
it will land. `chase.watch` is mode 1, `chase.pursue` is 0x0D, and `chase.ride`
stays what it was for the CRATE (mode 0, 0x4661c2). Mode 0x0A is read and NOT
built — 1024 ahead of the subject's heading, then the usual three springs — and
nothing that reaches it (34, 50 JETPACK) exists here yet.