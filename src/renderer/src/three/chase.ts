// The chase camera: the one thing in the battle that works in three's Y-up
// world rather than the game's Y-down one, so the conversion lives here and
// nowhere else.

import * as THREE from 'three'
import type { Pig } from '../../../lib/game/game'
import { SWIM_SINK } from '../../../lib/game/locomotion'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { MAP_CLOSE } from '../../../lib/game/mapView'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { clearHeading } from '../../../lib/game/sightline'
import type { Blocked } from '../../../lib/game/sightline'

/** After a flight the camera stays put this long before gliding back behind
 * the pig — resuming the chase the instant of landing is a jolt. */
const CHASE_DELAY = 0.5
/** How far back and how high the rig sits, in the pig's own units. */
const BACK = 2100 * MODEL_SCALE
const LIFT = 900 * MODEL_SCALE
/** Where the gaze rests on the pig. The remake's own. */
const GAZE = 300 * MODEL_SCALE
/**
 * How far the camera keeps off the ground — **the exe's own 0x300 = 768**, and
 * the last invented number in this rig to go.
 *
 * It is in the tail every mode's handler ends with (0x4A0B50): inside the map's
 * ±15000 bounds it samples the ground under the camera and raises it to
 * `ground + 0x300` (0x4a0c12) whenever it is lower. **Mode 0x12 is exempt by
 * name** — `cmp [game+0x84],12h; je` at 0x4a0bd4, the first thing the tail does
 * — which is what lets the TR cam sit 400 over a pig rather than 768 over the
 * ground, and is why `RIG` carries a `floor` flag.
 */
const CLEARANCE = 768 * MODEL_SCALE
/**
 * The drop-in view: the camera stands IN FRONT of a pig on a canopy and looks
 * it in the face, which is what play remembers of the original's opening.
 *
 * It is the chase rig turned around — the same BACK, so the pig sits in the
 * frame exactly as it always does — and only the lift is its own: level with
 * the pig rather than over its shoulder, which is what makes it a face and
 * not a top of a head.
 */
const FACE_LIFT = 150 * MODEL_SCALE

/**
 * The MELEE view: the shoulder rig swung round and pulled in, which is what
 * the original does and the only thing it uses its camera mode 19 for.
 *
 * Both numbers are the exe's. `Pig::Fire` calls `0x49f740(0x13, 0)` on the
 * five hand-to-hand skills and nothing else ever asks for that mode
 * (`weapons/melee.md`); the mode's own handler is 0x4a4940,
 * and with the flag 0 it takes the branch at 0x4a4bb5, which puts the camera
 * at `pigYaw − 0x264` — 612 of 4096, **53.8° round from straight behind**,
 * the ordinary chase being at the pig's own yaw with no offset at all
 * (mode 0, 0x4a0ee0). The distance comes out of the per-mode table at
 * 0x4d9528, six bytes a row: **1700** against the chase's 3072, so it also
 * comes in to a little over half.
 *
 * A ratio rather than the number itself, because the rig's own distances are
 * the remake's (see `want`) — what is faithful is the SWING and the
 * PROPORTION. The mode's second column, 924 against the chase's 768, is not
 * applied: its handler never reads that column.
 *
 * **The SIDE is play's, and it is the opposite of the exe's sign.** Read
 * literally the subtraction sends the camera round to the pig's left; the
 * original swings RIGHT ("камера в другую сторону уезжает — не вправо, а
 * влево"), so the turn is added here. The magnitude is still 612 and still
 * the exe's. Which of the several places between that yaw and these pixels
 * flips it is not found — a yaw sign is exactly the sort of thing the
 * un-mirroring of the map (`parsePmg`, and the marker's own half turn in
 * `spawns.ts`) moves — so this is measured, not derived, like the tile
 * table's turn direction and the weapon's half turn before it.
 */
const MELEE_TURN = (612 / 4096) * 2 * Math.PI
const MELEE_CLOSE = 1700 / 3072

/**
 * The AIM view: the shoulder rig pulled in, and nothing else.
 *
 * The original holds camera mode **0x0E**, its debug name "rifle cam"
 * (0x4d8ea8), for as long as one of two pad bits is down, and it picks that
 * mode for weapons 6..15, 17, 18 and 64 — every gun (0x492dfa). Its row of
 * the table at 0x4d9528 is **2048** against the chase's 3072, so it comes in
 * to two thirds and stays behind the shoulder: no swing, unlike the melee's.
 * `weapons/fire.md`.
 *
 * The row's second column is 1024 here against the chase's 768, which is what
 * a zoom in 1024ths would look like — but nothing in the mode's own handler
 * (0x4a2e30) has been traced reading it, so it is NOT applied. A field of
 * view is the obvious place for it if it ever is.
 */
const RIFLE_CLOSE = 2048 / 3072

/**
 * **A WEAPON IN THE HAND CHANGES THE CAMERA, and the original does it in
 * `0x493BB0`.** Play: "я сказал, когда в руки берёшь оружие — меняется камера",
 * and they were right — this is the exe's, not the remake's.
 *
 * That function runs on every take-in-hand and put-away (its argument is which),
 * and it dispatches on the SKILL through `[0x493DC4 + skill − 1]` into the jump
 * table at 0x493DA0. Four answers, and they are the whole of it:
 *
 * - **the thrown family** — 14, 19..33 (the grenades, the BAZOOKA), 35..50, 56,
 *   60, 61, 63 — takes `0x49F6F0(1)` and then **camera mode 4** (0x493c82);
 * - the five MELEE (1..5) and 51..55 take the same mode 4 with `0x49F6F0(0)`;
 * - **a GUN — 6..13, and 15..18 — changes nothing at all** (0x493c9d jumps
 *   straight past the camera block), which is why a rifle only ever moves the
 *   view when the aim key is held;
 * - 34 and 57..59 take mode 9, remembering the mode they came from in
 *   `[game+0x51C]`.
 *
 * **`0x49F6F0` is where the distance comes from, and it STAMPS the table.** It
 * writes mode 4's own row — 0x4D9540 is `0x4d9528 + 4*6` — with **3500** for a
 * thrown weapon and **1500** for a blade (columns 1: 692 and 800), and sets
 * `[cam+0x94]`, which picks the branch mode 4's handler takes (0x4a2277): a
 * blade's zero aims the rig at the subject itself, a thrown weapon's non-zero
 * aims it **1536 PAST him** (`LOB_AHEAD`). So the shipped file's 1500/2000 is
 * whatever the last run left there, exactly as the TR cam's row is.
 *
 * Both words of that row are used below — the 3500 as a length and the 692 as an
 * elevation ceiling (`elevationOf`).
 */

/**
 * **A CAMERA LENGTH DOES NOT RIDE `MODEL_SCALE`, AND NOTHING HERE IS EYEWORK.**
 * Play, on a fudge factor being offered for the distance: "точно нет? как
 * движок тогда это делает?" — and there was nothing to invent. The halving was
 * the mistake.
 *
 * `MODEL_SCALE` is what a MODEL is drawn at (`afScaleObj`, 0x800 of 0x1000, and
 * `lib/game/scale.ts`), and the exe applies it too. It is not a change of
 * units: the map is authored in units where a tile is 512 and this remake
 * renders those untouched, so **the exe's world and this one are the same
 * world** — its pig is drawn 325 units tall and so is ours. A distance BETWEEN
 * two points of that world is therefore the exe's own number outright, exactly
 * as `WALL_CLIMB`'s 128 and `Pig::Walk`'s 52 a frame are.
 *
 * What halves is a length taken off a MODEL — the bayonet's 460, the body's
 * 0xAA — because those are model-space and the model is drawn at half. The
 * camera is not on the model.
 *
 * So `LOB_CLOSE`'s "3500 through `MODEL_SCALE`" was a world length halved, and
 * the fudge factor invented to argue with it is deleted. The exe's own reading
 * lands where play was pointing on its own.
 *
 * The same halving is still on `BACK`/`LIFT` and on the TR cam's 400, and there
 * it is NOT a decoded number being halved — `BACK` is the remake's own eyework,
 * tuned when the models were full size and halved with them so the framing
 * would not move. Worth knowing what that costs, since it is the same question
 * one step along: the exe's ordinary chase is its row's **3072 at 22.5°**,
 * where `BACK`/`LIFT` put the lens 1142 from the pig — **2.7× closer than the
 * original's**. Not touched here; it is not what was asked and it is play's
 * call, the whole feel of the game hanging off it.
 */

/**
 * **THE LOB VIEW LOOKS PAST THE PIG, AND THAT IS WHY HE SITS AT THE BOTTOM OF
 * THE FRAME.** Play: "в оригинале он поднимается выше и отдаляется — свин у
 * нижней границы экрана", against a rig that had him dead centre.
 *
 * It is the one thing mode 4's thrown branch does that its blade branch does
 * not, and the number is the exe's:
 *
 * ```
 * 4a2277  if ([cam+0x94] == 0) goto 4a2281        ; a BLADE — target = subject
 * 4a22f6  0x44E620(0x600, [cam+0x8C], &dx, &dz)   ; 1536 along the camera's YAW
 * ```
 *
 * `[cam+0x8C]` is the camera's yaw and it points FORWARD, lens to subject: the
 * chase springs it toward `[cam+0x78] − column2` (0x4a1036..0x4a104e), and
 * column 2 is the yaw offset that swings the melee cam its own 612 round, so
 * with the chase's zero there the look yaw IS the pig's heading. 1536 along it
 * is 1536 beyond him at his own height — the call answers dx and dz and nothing
 * else.
 *
 * **The PC build then drops it on the floor.** Nothing reads `[esp+18h]` or
 * `[esp+1Ch]` again on that branch; the target is stamped from the subject's own
 * x, y and z (0x4a2337, 0x4a2361, and the z through `0x4385C0`, which is the
 * same ftol of `[body+0x18]+4` the other two inline). A dead call, on the one
 * branch with a reason to make it, in the build whose PSX sibling is what play
 * is describing. So it is applied here.
 *
 * What it does to the picture is the check. The camera holds `LOB_RANGE` to the
 * LOOK POINT, so it stands 1520 behind the pig and 1706 over him: he falls
 * **19.1° under the view axis**, and the frame is 45° tall, so he sits within a
 * sixth of the bottom edge — "свин у нижней границы экрана", which is what play
 * asked for in those words. He is 2285 from the lens; aimed AT him the same rig
 * had him dead centre at 3500.
 */
const LOB_AHEAD = 1536

/**
 * **COLUMN 1 OF THE MODE TABLE IS HOW HIGH THE CAMERA MAY STAND**, and that is
 * the answer to "выше" — it is the exe's own number, not a taste.
 *
 * The column had been guessed at as "a zoom in 1024ths" since the rifle cam was
 * read. It is not: `0x4A0900` is the camera's elevation spring and the column is
 * its CEILING.
 *
 * ```
 * 4a0908  ecx = (current + 0x400) & 0xFFF     ; 0x400 is LEVEL
 * 4a090e  eax = (wanted  + 0x400) & 0xFFF
 * 4a0926  edx = [0x4D952A + mode*6]           ; column 1
 * 4a092e  if (eax > edx)     eax = edx        ; ...the ceiling
 * 4a0936  if (eax < 0x100)   eax = 0x100      ; ...and the floor
 * 4a0942  return (ecx - eax) * scale
 * ```
 *
 * So a SMALLER column is a HIGHER camera, and the shipped rows read straight
 * off: the chase's 768 is 22.5° above level, the melee's and the barrel cam's
 * 924 is 8.8°, the rifle cam and the TR cam are 1024 — dead level — and the MAP
 * VIEW's 50 is **85.6°**, which is what settles the sign and the bias beyond
 * argument.
 *
 * And `0x49F6F0` stamps THIS as well as the distance, which is the half this
 * repo missed the first time through those nine instructions: a thrown weapon
 * gets **3500 and 692**, a blade **1500 and 800**. 692 is **29.2°** against the
 * chase's 22.5° — so a grenade in the hand really is watched from further back
 * AND higher, exactly as play described it, and a blade from closer and lower.
 *
 * The check that the remake's own rig is in the same world: `atan(LIFT / BACK)`
 * is 23.2°, which is the chase's own 22.5° to within a degree. Those two numbers
 * were picked by eye years apart.
 */
const elevationOf = (ceiling: number): number => ((0x400 - ceiling) / 4096) * 2 * Math.PI

/** …and the ceiling `0x49F6F0` stamps for anything THROWN. */
const LOB_CEILING = 692

/**
 * …and it is the exe's 3500 OUTRIGHT rather than a ratio against the chase.
 *
 * Play looked at the ratio and said the original pulled back further — "она в
 * игре дальше отдалялась" — and they are right that a ratio is the weaker
 * reading: it is measured against `BACK`, which is the remake's own eyework, so
 * a proportion inherits that invention. Nor does it halve: a camera length is
 * of the WORLD, not of a model (`LOB_AHEAD`'s note above).
 *
 * **And it is the SEPARATION rather than the horizontal run**, which is the
 * other half of what play's "камера должна быть дальше" was catching. The
 * distance spring (`0x4A0960`) differences `0x44E850` — the length of camera
 * minus target — against the row and steps what is left along the bearing, so
 * 3500 is the whole hypotenuse and the elevation splits it: `3500·cos 29.2°`
 * along the ground and `3500·sin 29.2°` up. This rig places by the horizontal
 * run and hangs `lift` off it (`want`), so the conversion belongs here rather
 * than there — and `LOB_PITCH` is shared with `RIG` so the two cannot come to
 * disagree about which angle they split it by.
 */
const LOB_RANGE = 3500
const LOB_PITCH = elevationOf(LOB_CEILING)
const LOB_CLOSE = (LOB_RANGE * Math.cos(LOB_PITCH)) / BACK
/**
 * **Its arm carries no height, and it does not need one** — the ROW does.
 *
 * Mode 4's arm sets a target and three SPRINGS glide the camera onto it: the
 * distance (`0x4A0960`, which is where 3500 is really used — it takes the
 * current separation, subtracts the row, and steps the difference), the yaw
 * (0x4A0870, an angle spring that wraps by 0xFFF), and the ELEVATION
 * (`0x4A0900`), which is the one that reads the row's second column and is
 * `elevationOf` above. The `+300` this file quoted for a commit is real but
 * belongs to mode 4's OTHER branch (0x4a2246) — the one a SNAPPING camera takes,
 * `[cam+0x60]` non-zero, and `0x49f740(4, 0)` leaves that zero, so a weapon in
 * the hand never reaches it.
 *
 * The common tail then holds the whole thing off the ground (`CLEARANCE`).
 */

/**
 * …and the camera the VIEW KEY holds — the exe's mode **0x12, "TR cam"**
 * (0x4d8e7c). Play: "там есть отдельная кнопка, которая меняет вид пока
 * держишь (у нас G)", and "2 при нажатой кнопки из-за спины".
 *
 * The aim-bit branch dispatches three ways (0x492ddd onwards, in full in
 * `weapons/fire.md`): a GUN takes mode 0x0E, the pillbox's 45 and 46 take mode
 * 0x11 "barrel cam", and **everything else takes 0x12** — which on a pig
 * holding something is the grenade family and the bazooka. Nothing else in the
 * image asks for either: both pushes are in that one function.
 *
 * Its handler (0x4a4620) builds the camera at the subject plus a bearing offset
 * of **200** and **+400 straight up** (`add eax,190h` at 0x4a4740, and +y is up
 * in the exe's world), with a nominal distance of **1700** in its row. Close in
 * and over his back, which is what play calls "из-за спины".
 *
 * It is also the ONE mode the common tail lets under the ground clearance
 * (`CLEARANCE`), which is what makes 400 over the pig mean 400 over the pig.
 *
 * Two things the handler does that the remake does not. The distance is
 * DYNAMIC — when the camera would come within 768 of the ground it writes a
 * reduced figure back into its own table slot (0x4a482e writes `0x6A4 − excess`
 * to 0x4d9594, which is where the shipped 1600 comes from), where the rig here
 * clamps its own height against the terrain instead. And the placement rides a
 * camera PITCH the player may drive, `[cam+0x76]`, which this mode alone clamps
 * to ±700 of 4096 rather than the usual window (0x49f606) — there is no key
 * bound to a camera pitch here.
 */
/**
 * …and what its 200 and its 400 are is the LOOK POINT, not the camera. Read to
 * the last instruction the same day the lob view was, because play asked for
 * this one in the same breath ("и вид из-за спины тоже сразу посмотри").
 *
 * The handler ends `0x4A0B50(cam, &[esp+40h], &[esp+34h])` — the tail's second
 * argument is the camera and its third is the target, exactly as mode 4's arm
 * calls it — and the vector it has been building at `[esp+34h]` is the THIRD.
 * So `subject + 200 along the bearing, +400 up` is where the rig LOOKS, and the
 * camera is then put at the row's **1700** from it by the same distance spring
 * (`0x4A0960`, 0x4a484d).
 *
 * **Its own column 1 is 1024, which is dead LEVEL** (`elevationOf`), and the
 * elevation step at 0x4a48c4 confirms it reads that column and nothing else
 * bar the player's own pitch: `[cam+0x88] + 0x400 − column1 − [cam+0x76]`. So
 * the camera stands at the LOOK POINT's height — 400 over the pig — and 1700
 * behind him, which is what "close in over his back" comes to in numbers.
 *
 * That leaves the pig 1500 ahead of the lens and 400 below it, **14.9° under a
 * level axis** — two thirds of the way to the bottom edge of a 45° frame, the
 * same corner of the picture the lob view puts him in. The two views agree
 * without either being tuned, which is the check on both.
 *
 * Neither number halves — a camera length is of the world (`LOB_AHEAD`) — and
 * the 400 that used to ride `MODEL_SCALE` here was the same mistake `LOB_CLOSE`
 * carried.
 */
const THROW_CLOSE = 1700 / BACK
const THROW_RISE = 400
const THROW_AHEAD = 200
/** 1024, and `elevationOf` makes that 0.0°: level with what it looks at. */
const THROW_CEILING = 1024

/**
 * The SCOPE: the view down the weapon, and it is BOLTED TO THE HAND.
 *
 * The mode's own handler was read properly the second time round and it
 * settles the argument the table could not. 0x4a2e30 does not build a
 * position from the mode table's 2048 at all — it takes a fixed point in
 * BONE 5's space and turns it into a world point with the very call the
 * muzzle and the bayonet use:
 *
 * ```
 * 4a2e72  eax = [0x4d0fa4]                 ; = 14, a constant
 * 4a2e86  dx  = [eax*8 + 0x4d0ee0]         ; 44
 * 4a2e8d  ax  = [eax*8 + 0x4d0ee2]         ; 230   (y is pushed as 0... see below)
 * 4a2ec0  0x440fb0(5, x, y, z, &out)       ; the HAND
 * ```
 *
 * and row 14 of that table is **(44, 32, 230)** — the PISTOL's muzzle offset,
 * used as the camera mount for every gun. `[cam+0x60]` is 0 for this mode
 * (`0x49f740(0x0E, 0)`), which takes the short branch at 0x4a303a: no
 * smoothing, the camera is where the hand is, this frame.
 *
 * So the aim view IS first person, play was right, and the mode table's
 * distance column is simply not what this handler reads.
 *
 * **And this is where the wobble comes from.** The camera rides the hand, the
 * hand rides the chest, and the chest breathes: with the aim pose held on the
 * arm and clip 27 (IDLE, 36 frames) under it, this mount point travels about
 * 32 model units across, 26 up and 13 forward over one breath. Nothing in the
 * binary drifts the aim ANGLE — the remake looked and wrote up the negative
 * result — because it does not need to. `lib/game/wobble.ts` is what the
 * remake adds ON TOP, and says so.
 */
export const SCOPE_MOUNT = { x: 44, y: 32, z: 230 }
/**
 * How much closer a full sniper zoom brings things.
 *
 * The exe hands `afSetZoom` a number from 0 to 0x1000 (lib/game/zoom.ts) and
 * `afSetZoom` lives in a library that is NOT in the install, so what 0x1000
 * does to a field of view cannot be read. Four times is the remake's pick:
 * play calls it a sniper scope and the weapon's only other distinction is
 * three times the rifle's range.
 */
export const SCOPE_MAGNIFY = 4
/** The bone it hangs off. The same one a barrel and a blade do. */
export const SCOPE_BONE = 5

/**
 * **WHICH WEAPONS HAND THE CAMERA THEIR PROJECTILE — and "a grenade is not a
 * gun" is play's, ahead of the read.** "Ты разобрал камеру для снайперки итд.
 * а для гранат и базук она другая)". It is, and so is a rifle's.
 *
 * Every weapon fires through one jump table — `eax = skill − 6`, `ja` past
 * 0x37, `jmp [eax*4 + 0x47CF8C]` (0x47a233) — and each arm decides for itself
 * whether the camera is told anything at all. Following every arm through its
 * branches and shared tails (the guns' is 0x47ad71, the thrown family's
 * 0x47b853), there are four answers and no more:
 *
 * | | asks for | row (dist, col 1, col 2) |
 * | - | - | - |
 * | **6 PISTOL, 11 SNIPER RIFLE, 12, 13, 15, 17, 18** | **mode 1** | 3072, level, no swing — and its handler only AIMS (`watch`) |
 * | **19..27 GRENADES, 28 MORTAR, 29 BAZOOKA, 30..33, 39..44, 47..49** | **mode 0x0B** | **3000, level, no swing** (`pursue`) |
 * | 34, 50 JETPACK | mode 0x0A | 5000 at 45° above and 45° round — not built |
 * | 51 SUICIDE | mode 2 | 7500, level — not built |
 * | **7 RIFLE**, 8, 9 MACHINE GUN, 10 HEAVY M-GUN, 14, 16, 35..38, 45, 46, 52..55, 60, 61 | nothing | — |
 *
 * **NOBODY IS EVER IN MODE 0x0B — `0x49F740` REWRITES IT TO 0x0D ON ENTRY.**
 * Four instructions at the top of the setter, before anything else happens:
 *
 * ```
 * 49f774  cmp ebp,0Bh
 * 49f79b  jne short 0049F7A9h        ; anything else: carry on
 * 49f79d  mov dword ptr [esp+34h],0Dh
 * 49f7a5  mov ebp,[esp+34h]          ; ...ask for 0x0B, GET 0x0D
 * ```
 *
 * Which is why 0x0B's own handler is `0x4199C0` — one `ret`, shared with modes
 * 5, 8 and 0x0C, four empty functions folded onto one address in a region
 * (0x419xxx) nowhere near the camera code (0x4a0xxx..0x4a4xxx). It is
 * unreachable, not a behaviour. (This file called it "the camera freezes" for
 * one commit. Play: "граната — бред! камера следует за ней!" — and they were
 * right twice, because the second report named the shape as well: "камера там
 * ещё будто едет по кругу вокруг".)
 *
 * Three things line up behind the rewrite and each was a loose end before it:
 * modes 0x0B, 0x0C and 0x0D share the setup arm at 0x49f912; that arm is the
 * only writer of `[cam+0x7A]`, which **0x0D's handler alone reads**; and the
 * setter's tail zeroes `[cam+0x78]` for every mode **except 0x0D** (0x49fda0)
 * — the one field that same arm computes.
 *
 * **And a RIFLE tracks like a sniper**, which is play's too. The exe's own
 * split — the pistol and the sniper reaching the shared tail at 0x47ad71 while
 * 7 RIFLE's arm jumps straight to the common exit — is not a difference
 * anything else in the shot path honours, and it is not what the game does. So
 * the caller asks the weapon's LAYER and not its number (three/battle.ts):
 * every `gun` gets `watch` and every `lob` gets `pursue`.
 */

/**
 * **MODE 0x0D, 0x4a3a20: get behind the thing, then RIDE ROUND IT.** Play named
 * it before it was read — "камера там ещё будто едет по кругу вокруг" — and the
 * handler is exactly two phases, told apart by `[cam+0x5C]`.
 *
 * **While `[cam+0x5C]` is 0 — SWING BEHIND.** It asks the subject for its own
 * facing (`[vtable+0x44]`), springs the camera's yaw toward it (`0x4A0870` at
 * 0x4a3d0d) and turns the camera about the subject by the step (`0x44E660`).
 * Once that step falls under **0x10 of 4096 — 1.4°** — it is lined up: it
 * stamps the separation into `[cam+0x7A]` (`0x44E850`, 0x4a3d53), sets
 * `[cam+0x5C]` and the second phase begins. Until then the orbit is skipped
 * entirely, so the camera swings round to behind the flight first.
 *
 * **After that — ORBIT.** Once a frame, and this is the whole of it:
 *
 * ```
 * 4a3d65  radius = clamp(2/3 * separation, [cam+0x7A], 0x2710 = 10000)
 * 4a3d88  [cam+0x78] -= 0x0A                  ; TEN of 4096, every frame
 * 4a3d92  ...held within 0x300 of [cam+0xB6]  ; 67.5° either side of where it began
 * 4a3e04  0x44E620(radius, [cam+0x78], &dx, &dz)
 * 4a3e09  camera.x = subject.x + dx ; camera.z = subject.z + dz
 * ```
 *
 * So: **0.879° of a turn per frame**, one way, up to 67.5° from the bearing it
 * locked at — a slow ride round the grenade, which is what play was describing.
 * The radius closes to two thirds of the separation each frame and cannot go
 * under what it was at the lock, so it settles at that distance within a few
 * frames and holds it. Height is not in the orbit block at all: the elevation
 * spring after it (0x4A0030 → `0x4A0900`) holds the camera at the row's own
 * ceiling, **column 1 = 824, which is 17.6° above level**, and the common tail
 * keeps it 768 off the ground like everything but the TR cam.
 *
 * The row's distance, 3000, is not read by this handler — the radius comes off
 * the separation and the stamp instead. One thing NOT modelled: the y is also
 * clamped to `[cam+0x80]`/`[cam+0x82]`, the ±12288 the setter stamps, which is
 * the map's own vertical bounds rather than anything about a grenade.
 */
const FLIGHT_CEILING = 824
/** `sub cx,0Ah` at 0x4a3d88 — of 4096, per exe frame. */
const FLIGHT_ORBIT = ((10 / 4096) * 2 * Math.PI) / EXE_FRAME_SECONDS
/** 0x300 of 4096 either side of the bearing it locked at (0x4a3db2). */
const FLIGHT_SWING = (0x300 / 4096) * 2 * Math.PI
/** `cmp eax,10h` at 0x4a3d3a: the swing-behind is done under 1.4°. */
const FLIGHT_LOCKED = (0x10 / 4096) * 2 * Math.PI
/** `fadd st,st` then `fmul [0x4BD6D0]` — two thirds of the separation. */
const FLIGHT_CLOSE = 2 / 3
/** `cmp eax,2710h` at 0x4a3d71. */
const FLIGHT_FAR = 10000
/** What the yaw spring gets through in a frame. The family's own third
 * (0x4BD6C8, 0x4BD6D0); `0x4A0870`'s own arithmetic is not transcribed. */
const FLIGHT_TURN = 1 / 3

/** Where a pig is being drawn, and which way it faces. Not the pig itself: the
 * rig frames what is on SCREEN (three/tween.ts). */
export interface Stance {
  x: number
  y: number
  z: number
  heading: number
  /** Whether the pig is IN the water — the ENGINE's answer, not the tile's
   * (lib/game/locomotion.ts). A pig on a bridge is over water and not in it. */
  swimming: boolean
}

/** Which way the rig is pointing at the pig from. */
export type View =
  /** Over the shoulder — the ordinary battle camera. */
  | 'chase'
  /** In front, face on: what a pig under a canopy is watched from. */
  | 'face'
  /** Round to the side and close in: a hand-to-hand swing. */
  | 'melee'
  /** Straight behind and closer: sighting a gun. */
  | 'rifle'
  /** Back and raised: something THROWN is in his hands — the exe's mode 4. */
  | 'lob'
  /** Close in over his back: the view key, held, with a thrown weapon out —
   * the exe's TR cam. */
  | 'throw'
  /** Down the barrel: first person, looking where the weapon points. */
  | 'scope'
  /** Pulled right back over the field — the exe's mode 7, which the PAUSE and
   * skill 63 MAP VIEW both enter (lib/game/mapView.ts). */
  | 'map'

/**
 * Where each view stands on the one rig: how much of the chase's distance it
 * keeps, how high it sits over the point it is looking at, and where that point
 * is — `ahead` PAST the pig and `raise` ABOVE him. A negative distance is IN
 * FRONT, which is the whole of what makes the drop-in a face.
 *
 * The two exe views built from a decoded ROW carry a `pitch` instead of a
 * `lift`, because that is what their own tables carry: the height then follows
 * the distance rather than being a second number that can drift from it.
 *
 * `scope` is in here for completeness and is never read: that view is first
 * person and leaves `want` before any of this (it is bolted to the hand).
 */
const RIG: Record<
  View,
  {
    close: number
    lift: number | null
    pitch?: number
    ahead?: number
    raise?: number
    floor: boolean
  }
> = {
  chase: { close: 1, lift: LIFT, floor: true },
  face: { close: -1, lift: FACE_LIFT, floor: true },
  melee: { close: MELEE_CLOSE, lift: LIFT, floor: true },
  rifle: { close: RIFLE_CLOSE, lift: LIFT, floor: true },
  // Back, RAISED and looking PAST him — all three of mode 4's own numbers:
  // 3500 out at up to 29.2° above level, aimed 1536 beyond the pig, against
  // the chase's 3072 at 22.5° aimed AT him (`elevationOf`, `LOB_AHEAD`).
  lob: {
    close: LOB_CLOSE,
    lift: null,
    pitch: LOB_PITCH,
    ahead: LOB_AHEAD,
    floor: true
  },
  // …and the TR cam looks 200 past the pig and 400 OVER him from dead level,
  // 1700 back. It is also the one view the exe lets under the ground floor,
  // which is what makes that 400 over the pig mean 400 over the pig.
  throw: {
    close: THROW_CLOSE,
    lift: null,
    pitch: elevationOf(THROW_CEILING),
    ahead: THROW_AHEAD,
    raise: THROW_RISE,
    floor: false
  },
  scope: { close: 0, lift: 0, floor: true },
  // The SURVEY: the same shoulder rig, standing 11000 out instead of 3072 —
  // row 7 of 0x4D9528, and the only column of it whose reader is traced. The
  // pig ends up small and the field ends up in shot, which is the whole point
  // of the mode.
  map: { close: MAP_CLOSE, lift: LIFT, floor: true }
}

export interface Chase {
  /**
   * Point at a pig standing at `nodeY` (game space, the model's origin).
   * `delta` null snaps rather than glides — a new acting pig, not a frame.
   * `rise` is anything hanging ABOVE the pig that has to stay in shot.
   *
   * `at` is where the pig is being DRAWN — between the engine's last two steps
   * (three/tween.ts) — and not where the rules have it. The rig eases where it
   * stands but points straight at what it is given, so a subject read off the
   * engine's own quanta puts the whole stutter into the aim.
   */
  follow(
    at: Stance,
    nodeY: number,
    rise: number,
    delta: number | null,
    view: View,
    /** Where the weapon points, radians, positive UP. Only the scope reads
     * it (lib/game/aim.ts). */
    aim?: number,
    /** How far the sights have drifted off the pig's own facing, radians.
     * Only the scope reads it, and only the sights move — the model stands
     * where it stands (lib/game/wobble.ts). */
    yaw?: number,
    /** Where the scope's eye is: the world point the pig's HAND bone puts
     * `SCOPE_MOUNT` at, handed in because only the scene can pose a
     * skeleton. Game space, Y-down. Ignored by every other view. */
    eye?: { x: number; y: number; z: number } | null
  ): void
  /**
   * **WATCH a bullet — the camera does NOT go with it**, and only the weapons
   * in `TRACKS_ITS_SHOT` ask for even this much.
   *
   * The moment a shot leaves, the exe hands the camera the PROJECTILE as its
   * subject (`0x49ec20`, from the shot's own tail at 0x47ad99) and puts it in
   * **mode 1** (`0x49f740(1, 0)`). Mode 1's handler is `0x4a11e0` and it is
   * thirty instructions long — every one of them read:
   *
   * ```
   * 4a11e9  [cam+0x18]+4  -> the CAMERA's own position, as three shorts
   * 4a1254  [cam+0x54]    -> the SUBJECT's, the same way
   * 4a12f6  0x44E8E0(camera, subject, &yaw, &pitch)     ; decompose
   * 4a1310  [cam vtable+0x48](pitch, yaw, [cam+0x90])   ; ...and aim
   * ```
   *
   * **No position is written, no spring is stepped and the common tail
   * (`0x4A0B50`) is never called** — so the row of the table this file used to
   * quote for it, 3072/1024, is not read either, and neither is the ground
   * floor. The camera stands exactly where the last mode left it and TURNS to
   * keep the projectile in frame, like a man watching a ball. Entering the mode
   * moves nothing either: mode 1 takes the default setup arm at `0x49fcfe`
   * (byte map 0x49FE84, table 0x49FE58), which only copies the subject's
   * position into the smoothing memory at `[cam+0x64]`.
   *
   * Play saw it as a drift: "камера не чисто за снарядом, а в бок будто
   * перемещается". A camera flown along behind the flight has to swing round to
   * stay behind a thing whose heading changes every bounce — this one has
   * nothing to swing.
   *
   * It also settles an old loose end: `lib/game/sightline.ts` exists because
   * watching a grenade through a wall is no use, and the exe was searched for
   * something like it and found to have nothing. Of course it has nothing —
   * with the camera standing still there is no ride to dodge with.
   */
  watch(at: { x: number; y: number; z: number }): void
  /**
   * **PURSUE a thrown thing: swing in behind it, then ride round it.** The
   * exe's mode 0x0D, which is what asking for 0x0B gets you — the constants
   * above have the read.
   *
   * `heading` is where the thing is going: the exe asks the SUBJECT for its own
   * facing, and a projectile's is its flight. No line-of-sight swing here,
   * unlike `ride` — the sideways drift play reported was half the dodge and
   * half a rig that had no orbit in it.
   */
  pursue(at: { x: number; y: number; z: number }, heading: number, delta: number | null): void
  /**
   * Ride a CRATE down — the exe's mode 0, which is the ordinary chase rig with
   * something other than a pig in the middle of it (0x4661c2).
   *
   * `heading` is where the subject is going, so the camera sits behind it and
   * watches it fall away rather than side-on. Unlike `watch`, this one really
   * does move: mode 0's arm is the full rig, springs and tail included.
   */
  ride(at: { x: number; y: number; z: number }, heading: number, delta: number | null): void
  /**
   * The chase's own wait, once a frame: parked through involuntary flight and
   * a beat beyond it, cleared the instant the player drives.
   *
   * The camera follows what the PLAYER does and stands off what happens TO
   * the pig. Chasing a thrown pig spun the view and drove it into the wall
   * the pig had just come off; a walk-off hop or a jump is the player
   * driving, not flying.
   */
  hold(flung: boolean, driving: boolean, delta: number): void
  /** Start again on a new pig: nothing carries over. */
  reset(): void
}

export function createChase(
  camera: THREE.PerspectiveCamera,
  query: TerrainQuery,
  /**
   * What the view cannot pass, in game space. Optional, and only `ride` uses
   * it — the ordinary chase does not dodge, because a pig you are driving is
   * where you already know it is. Null keeps the old behaviour exactly.
   */
  blocked: Blocked | null = null
): Chase {
  /** Smoothed camera position (world space). */
  const at = new THREE.Vector3()
  let snapped = false
  let wait = 0
  /**
   * The orbit's own four fields, and they are mode 0x0D's: whether the camera
   * has swung in behind the flight yet (`[cam+0x5C]`), the bearing it stands at
   * (`[cam+0x78]`), the one it locked at (`[cam+0xB6]`) and how far out
   * (`[cam+0x7A]`). `chasing` is the remake's own — the exe enters the mode
   * once and knows it, where this rig is asked frame by frame.
   */
  let chasing = false
  let orbiting = false
  let bearing = 0
  let origin = 0
  let radius = 0
  /** To ±π, which is the exe's `& 0xFFF` read as a signed turn. */
  const wrapAngle = (a: number): number =>
    a - Math.PI * 2 * Math.round(a / (Math.PI * 2))

  /**
   * The height the camera frames a pig at: its node, less the sink when it
   * is afloat.
   *
   * A swimming pig hangs SWIM_SINK below the water, and the moment the
   * per-texel test concedes that a paddling pig IS swimming, it drops that
   * whole distance in ONE frame — 280 units, on a shore whose seabed sits
   * exactly at the water level, so nothing about the ground eases it. The
   * camera followed the drop and lurched. Taking the same sink back off the
   * height it frames cancels it exactly: the swap happens on the frame the
   * pig sinks, so the two moves annihilate and the view never moves at all.
   *
   * It asks the ENGINE whether the pig is swimming rather than asking the
   * water where the pig is standing. Those differ over a BRIDGE, and the
   * difference is a 280-unit lurch the moment the deck crosses the water line
   * — which is what it used to do on CAMP's first bridge.
   */
  const framedY = (at: Stance, nodeY: number): number =>
    nodeY - (at.swimming ? SWIM_SINK : 0)

  /**
   * Where the rig wants to be: behind the pig's shoulders, clamped above the
   * terrain so hills never swallow the view.
   *
   * Both heights are held against the VISIBLE surface rather than the
   * ground, so a shore whose seabed runs on under the water sheet neither
   * drags the gaze below the waterline nor sinks the camera under it — from
   * beneath, an opaque sheet is the whole view.
   *
   * Every distance rides `MODEL_SCALE`, because this is a rig around the PIG
   * and not around the map: 2100 back and 900 up framed a 651-unit pig, so a
   * 325-unit one wants half of each, and the framing of the pig itself does
   * not change at all. What changes is everything around it — the trench
   * that used to come to its shoulders now stands over it, which is the
   * whole point of the model scale. The numbers themselves are still the
   * remake's own; the original's camera table (exe 0x4d952c: a yaw offset in
   * 4096ths, a distance, a zoom in 1024ths through `afSetZoom`) is found but
   * its zoom is not yet turned into a field of view.
   */
  const want = (
    at: Stance,
    nodeY: number,
    rise: number,
    view: View,
    aim: number,
    yaw: number,
    eye: { x: number; y: number; z: number } | null
  ): { position: THREE.Vector3; target: THREE.Vector3 } => {
    if (view === 'scope' && eye) {
      // Game space is Y-DOWN and the rig is Y-up, hence the negations. WHERE
      // the camera is comes off the hand bone; where it LOOKS does not — the
      // exe builds the direction from the pig's own yaw and the aim angle
      // (0x4a310c onwards), so a breathing hand shifts the view without
      // steering it.
      const facing = at.heading + yaw
      const position = new THREE.Vector3(eye.x, -eye.y, -eye.z)
      const ahead = Math.cos(aim)
      const reach = 4096
      const target = new THREE.Vector3(
        position.x + Math.sin(facing) * reach * ahead,
        position.y + Math.sin(aim) * reach,
        position.z - Math.cos(facing) * reach * ahead
      )
      return { position, target }
    }
    const face = view === 'face'
    const waterline = -query.surface(at.x, at.z)
    // Behind the shoulders normally; ahead of the snout on the way down; round
    // to one side and close in for a swing; over him and past him for a lob.
    const stand = RIG[view]
    const from = view === 'melee' ? at.heading + MELEE_TURN : at.heading
    // WHERE THE RIG POINTS, in game space. The chase points at the pig; the two
    // views the exe builds from a row point PAST him along the same yaw and, for
    // the TR cam, OVER him as well. That offset is what drops him to the bottom
    // of the frame in both.
    const aimX = at.x + Math.sin(from) * (stand.ahead ?? 0)
    const aimZ = at.z + Math.cos(from) * (stand.ahead ?? 0)
    // Looking a pig in the face means looking at the PIG: the canopy over it
    // is out of frame on purpose, so `rise` is ignored on this side.
    const target = new THREE.Vector3(
      aimX,
      Math.max(-framedY(at, nodeY), waterline) +
        GAZE +
        (stand.raise ?? 0) +
        (face ? 0 : rise / 2),
      -aimZ
    )
    // The pull-back that fits `rise` more height at this vertical field of
    // view — half the extra height over the tangent of half the angle. The
    // rig is built round a pig, so anything three times its height (a
    // canopy) needs the frame saying so rather than being cropped off.
    const back = face ? BACK : BACK + rise / (2 * Math.tan((camera.fov * Math.PI) / 360))
    const reach = back * stand.close
    // A view with an ELEVATION is placed by angle, the way the exe's own spring
    // places it: how high it stands follows how far out it is. Both are
    // measured against what it LOOKS at rather than against the pig — for the
    // lob those are 1536 apart, and that difference is the whole framing.
    const lift = stand.pitch === undefined
      ? (stand.lift ?? 0)
      : Math.abs(reach) * Math.tan(stand.pitch)
    const behindX = aimX - Math.sin(from) * reach
    const behindZ = aimZ - Math.cos(from) * reach
    const terrainAtCamera = -query.surface(behindX, behindZ)
    const position = new THREE.Vector3(
      behindX,
      stand.floor
        ? Math.max(target.y + lift, terrainAtCamera + CLEARANCE)
        : target.y + lift,
      -behindZ
    )
    return { position, target }
  }

  return {
    follow(stance, nodeY, rise, delta, view, aim = 0, yaw = 0, eye = null) {
      chasing = false
      const { position, target } = want(stance, nodeY, rise, view, aim, yaw, eye)
      // The scope SNAPS. Easing a first-person view is motion sickness: the
      // whole point of it is that the barrel and the frame are the same thing.
      if (delta === null || !snapped || view === 'scope') {
        at.copy(position)
        snapped = true
      } else if (wait <= 0) {
        at.lerp(position, 1 - Math.exp(-6 * delta))
      }
      camera.position.copy(at)
      camera.lookAt(target)
    },
    watch(point) {
      chasing = false
      // Mode 1 in full: the position is left alone — `at` is not touched, so
      // whatever view the throw was made from is still standing there and the
      // next `follow` carries on from it — and only the aim moves.
      camera.lookAt(new THREE.Vector3(point.x, -point.y, -point.z))
    },
    pursue(point, heading, delta) {
      // Where the camera stands round the thing, and how far. `bearing` runs
      // from the SUBJECT out to the camera, which is the sense `0x44E620` is
      // called in (0x4a3e04); the flight's own heading is where the camera
      // wants to be BEHIND, hence the half turn.
      const away = Math.atan2(at.x - point.x, -at.z - point.z)
      const separation = Math.hypot(at.x - point.x, -at.z - point.z)
      // The mode is ENTERED where the camera already stands — the setup arm
      // stamps its position and its distance and moves nothing (0x49f912).
      if (!chasing) {
        chasing = true
        orbiting = false
        bearing = away
        radius = separation
      }
      if (!orbiting) {
        // Phase one: swing round to behind the flight, a third of what is left
        // each frame, and stop being told what to do the moment it is there.
        const gap = wrapAngle(heading + Math.PI - bearing)
        bearing = wrapAngle(bearing + gap * FLIGHT_TURN)
        if (Math.abs(gap) <= FLIGHT_LOCKED) {
          orbiting = true
          origin = bearing
          radius = separation
        }
      } else {
        // …and phase two rides round, one way, held inside its window.
        bearing = wrapAngle(bearing - FLIGHT_ORBIT * (delta ?? 0))
        const swung = wrapAngle(bearing - origin)
        if (Math.abs(swung) > FLIGHT_SWING) bearing = origin + Math.sign(swung) * FLIGHT_SWING
        radius = Math.min(FLIGHT_FAR, Math.max(radius, separation * FLIGHT_CLOSE))
      }
      const reach = orbiting ? radius : separation
      const position = new THREE.Vector3(
        point.x + Math.sin(bearing) * reach,
        -point.y + reach * Math.tan(elevationOf(FLIGHT_CEILING)),
        -(point.z + Math.cos(bearing) * reach)
      )
      // The common tail still holds it off the ground — mode 0x12 is the one
      // view exempt from that and this is not it.
      position.y = Math.max(position.y, -query.surface(position.x, -position.z) + CLEARANCE)
      at.copy(position)
      snapped = true
      camera.position.copy(at)
      camera.lookAt(new THREE.Vector3(point.x, -point.y, -point.z))
    },
    ride(point, heading, delta) {
      chasing = false
      // Swing round whatever is in the way. THE REMAKE'S OWN — the original
      // has no line-of-sight test anywhere in its camera code, which was
      // checked (lib/game/sightline.ts says where) — and play asked for it
      // because watching a grenade through a wall is no use.
      const seen = blocked
        ? clearHeading(point, heading, BACK, LIFT, blocked)
        : heading
      const target = new THREE.Vector3(point.x, -point.y, -point.z)
      const position = new THREE.Vector3(
        point.x - Math.sin(seen) * BACK,
        -point.y + LIFT,
        -(point.z - Math.cos(seen) * BACK)
      )
      // The ground still has a say: a bullet skimming a slope must not put the
      // camera inside it.
      const floor = -query.surface(position.x, -position.z) + CLEARANCE
      position.y = Math.max(position.y, floor)
      if (delta === null || !snapped) {
        at.copy(position)
        snapped = true
      } else {
        at.lerp(position, 1 - Math.exp(-6 * delta))
      }
      camera.position.copy(at)
      camera.lookAt(target)
    },
    hold(flung, driving, delta) {
      if (flung) wait = CHASE_DELAY
      else if (driving) wait = 0
      else wait = Math.max(0, wait - delta)
    },
    /**
     * The camera's SUBJECT has changed — a new acting pig, a flight that has
     * landed, a crate that has finished coming down. The next placement is a
     * TELEPORT, not a glide.
     *
     * Play asked for it as a question and the answer is yes: "камера должна
     * телепортироваться за спину свина, а не передвигаться с той позиции где
     * была." Easing is for following one thing about; sliding across the map from
     * whatever the camera was last looking at is just a long wrong shot. This used
     * to clear only the settle timer, so a ride ending left `snapped` set and the
     * ordinary chase lerped all the way home.
     */
    reset() {
      wait = 0
      snapped = false
      chasing = false
    }
  }
}
