// The acting pig's frame-by-frame state machine — walking, swimming,
// jumping, falling, and being wedged in and thrown out of walls. Pure, like
// the rest of lib/game: the battle scene feeds it intents and draws what it
// says; the domain specs (e2e/002/locomotion.spec.ts) drive it directly.
//
// The shape is the original's, function by function:
//
//   walking is KINEMATIC — `TryMove` (0x478ca0) pins the pig to the ground
//   however steep, wall tile or not; only the world edge refuses and only a
//   drop hands over to the physics. A pig pressed into a wall KEEPS WALKING
//   (and climbs the face) while `UpdateGroundState` (0x46fd50) counts the
//   frames; past 25 the pig update calls `EjectFromWall` (0x46fbd0), which
//   pushes the pig DOWNHILL and up — and does NOT turn it (see `eject`). The elastic wall material only
//   ever acts on a FALLING pig — a landing where `Map::IsBlocked` says yes
//   is refused, so a body in a wall bounces until it is out or ejected.
//
// Derivations and addresses: movement/notes.md.

import {
  BOUNCE_CUTOFF,
  EJECT_PITCH,
  EJECT_SECONDS,
  FRAME_SECONDS,
  FREE,
  JUMP_COOLDOWN_SECONDS,
  bounceOff,
  easeBounciness,
  fromExeSpeed,
  groundMaterial
} from './ballistics'
import type { Bounciness } from './ballistics'
import { FALL_SPEED_FACTOR, STEP_DOWN, WALK_BACK_SPEED, WALK_SPEED, step } from './movement'
import { MODEL_SCALE } from './scale'
import { clampToWorld, fromExeY } from './terrain'
import type { TerrainQuery } from './terrain'
import { NO_OBSTACLES, STANDING_ON } from './obstacles'
import type { Obstruction } from './obstacles'

/**
 * Swimming is a CAP, not a fraction of walking: `Pig::Walk`'s water branch
 * clamps the step to 16 units a logic frame forwards (0x46ade8) and -16
 * backwards (0x46aec8) whatever the class scaled it to, so every pig swims
 * at one speed. The branch is taken on tile type 4 or 11 with `IsInWater`
 * agreeing — the same per-texel verdict the rest of the water reads.
 */
export const SWIM_SPEED = fromExeSpeed(16)
/**
 * What a WOUND does to the forward stride, by band (`woundBand`,
 * lib/game/health.ts): `Pig::Walk` scales the step it just computed —
 * over 25 points untouched, over 10 ×2/3, at or under 10 ×1/3 (0x46AD38,
 * exact fractions where the exe truncates integer thirds). FORWARD ONLY:
 * the health block is jumped over for a negative request (0x46AD21), and
 * it runs before the water and wall caps, so the swim is never slowed —
 * which the cap's own placement here reproduces, `speed` picking the swim
 * before it ever looks at the wound.
 */
export const WOUND_SPEED = [1, 2 / 3, 1 / 3] as const
/**
 * Turning, radians a second. The input handler ramps an accumulator at
 * pig+0x304 by 4 a frame up to a cap of 0x20 (0x4929de sets the step,
 * 0x492bf5 the cap) and `Pig::Turn` (0x46af30) scales it by nothing, so the
 * top rate is 32/4096 of a circle a logic frame — 84 degrees a second. The
 * ramp itself is not modelled: eight frames to reach the cap is a tenth of
 * a second, and holding a key past that is the whole of turning.
 */
export const TURN_SPEED = ((0x20 / 4096) * 2 * Math.PI) / FRAME_SECONDS
/**
 * How deep a swimming pig sits below the surface (game Y-down: +down).
 *
 * EYEWORK — nothing in the exe has been read for it — and it was set at 280
 * before the models were found to be drawn at HALF size (`MODEL_SCALE`). A pig
 * is 320 tall, so 280 put it under to the eyebrows, which is what play saw:
 * "свин начал тонуть больше чем надо". Halved with the model, it leaves the
 * top half clear — head and shoulders.
 */
export const SWIM_SINK = 140

/**
 * FALLING — and the original's pull is a terminal velocity, not a constant.
 *
 * A falling pig is a body in the engine's own physics world: `StartFalling`
 * (0x4707f0) sets the launch velocity and hands it over, and the integrator
 * (0x410de0) does `v -= v/128; a = F/m; p += v; v += a` once a logic frame.
 * The world builds three force generators (0x414f50) and `0x4aa0d0` picks by
 * type — and `Pig` is type 0x1357, which gets the SECOND: `(target - v)/32`
 * a frame towards 320 down, not the flat 10 the other bodies get.
 *
 * At rest the two agree exactly — 320/32 is 10 a frame squared either way,
 * so the first tenth of a second of every fall is the same. What the pig's
 * one adds is a cap, and the same 32-frame bleed on the HORIZONTAL, which is
 * why a pig thrown off a cliff stops travelling long before it lands.
 */
export const TERMINAL_FALL = fromExeSpeed(320)
/** The falling force's time constant, and the integrator's own drag. */
export const FALL_TAU = 32 * FRAME_SECONDS
export const DRAG_TAU = 128 * FRAME_SECONDS
/** The pull from rest, which is what a plain gravity would have been. */
export const GRAVITY = TERMINAL_FALL / FALL_TAU

/**
 * JUMPING, game Y-down: negative velocity is upward.
 *
 * `TryJump` only raises an intent bit; the launch is in the walking
 * dispatcher (0x46c199), and it is VERTICAL — pitch 0x400 of 0x1000, at
 * `|nDist|/2 + 0x30` a frame. So a standing hop leaves at 48 and a running
 * one at 74, and neither carries any forward speed out of the ground.
 *
 * Forward is a SECOND impulse: three frames into the fall the pig update
 * adds 0x30 a frame along the facing (0x46e943). That delay is what gives
 * the original's jump its shape — up first, then out.
 *
 * **The wind-up belongs to a STANDING jump only.** The dispatcher branches on
 * the walking step it was handed (0x46c220): a pig with `nDist > 0` — moving
 * FORWARD — goes straight to `StartFalling` and is in the air on that frame,
 * and everything else (still, or backing away, so `nDist <= 0`) gets clip 8
 * with a repeat count of 1 and leaves when it runs out (0x46e8e2). So a
 * run-up does not crouch; a hop from standing does. The count is LOOPS, not
 * frames: the exe only decrements it where the clip's own cursor wraps
 * (0x46e27f..0x46e2cb).
 *
 * One more gate is not decoded: bit 0x10 of the intent byte at `pig+0x318`
 * also forces the crouch, whatever the step (0x46c224).
 *
 * **`JUMP_RISE` was the remake's own, and play has taken it back out.** It
 * damped the launch by √½ on the argument that a model drawn at half size
 * against ground that did not shrink with it turned the same hop into twice the
 * pig's height. Play says the opposite — "прыжёк не долетел — может высота ниже
 * чем должна быть?" — and the measurement agrees with play: damped, the running
 * apex is 114 units against a grunt 325 tall, a third of its own height and a
 * feeble thing to look at; at the exe's own 0x30 it is 220, about two thirds,
 * and the reach goes from 303 to 430. The premise was wrong somewhere, and an
 * invented number loses to what the game looks like.
 *
 * It stays as a named 1 rather than being deleted, because the argument is
 * worth keeping next to the number: if a hop ever reads too big again, this is
 * the knob, and NOT the exe's 0x30 or the gravity underneath it.
 */
export const JUMP_RISE = 1
export const JUMP_SPEED = fromExeSpeed(0x30) * JUMP_RISE
export const JUMP_PUSH = fromExeSpeed(0x30)
export const JUMP_PUSH_DELAY = 3 * FRAME_SECONDS
/**
 * How long the wind-up holds: one pass of clip 8, which is 14 keyframes of
 * `Chars/mcap.mad`.
 *
 * Counted at the rate the clips are DRAWN at (`three/clips.ts`, a flat 25)
 * rather than at the logic rate, because the whole point of the wind-up is
 * that the pig leaves the ground on the frame the crouch finishes on screen.
 * The exe has no such split — a clip's frames are its logic frames — so this
 * is where the remake's flat playback rate shows through.
 */
export const JUMP_WINDUP_FRAMES = 14
export const JUMP_WINDUP = JUMP_WINDUP_FRAMES / 25
/**
 * How long the get-up holds after a landing: one pass of clip 10, 11 frames.
 *
 * And it is CANCELLED the moment the pig is driven, which is the other half
 * of the same rule. `Pig::Land` sets the clip and nothing guards it; the
 * animation picker (0x467ec0) simply asks for a movement clip whenever the
 * pig has speed, and the request resets the cursor outright (0x472320 zeroes
 * `pig+0x360` and `pig+0x368`). At a standstill the picker asks for nothing
 * — it returns early on a zero band — so the get-up plays out. Land running
 * and the run cycle replaces it on the very next frame.
 */
export const GET_UP_FRAMES = 11
export const GET_UP = GET_UP_FRAMES / 25
/** The launch, for a pig whose walking step this frame is `stride`. */
export const jumpVelocity = (stride: number): number =>
  -(JUMP_SPEED + (Math.abs(stride) / 2) * JUMP_RISE)
/** The eject's launch speed: the exe's 0x20 per logic frame. */
export const EJECT_SPEED = fromExeSpeed(0x20)
/**
 * How much higher than its last free footing a pig can be carried into
 * blocked ground: the step-up's whole allowance (exe 0x4bd33c = 128, probed
 * downward in 32s from y + 128). A wall lower than this is walked over; a
 * wall face is entered THIS far and no further, whatever its slope — a wall
 * is not a ladder, and holding the key only scrapes and scrabbles.
 */
export const WALL_CLIMB = fromExeY(128)
/** The sidestep's scrape along a wall: 8 units a logic frame (0x4790d9). */
export const SIDESTEP_SPEED = fromExeSpeed(8)

/**
 * MCAP clip indices — and WHICH the exe plays where, taken from every call
 * site of its play function (0x471ef0) rather than from the names:
 * `StartFalling` (0x4707f0) plays 9, the eject path (0x470c70) plays 38, and
 * the impact handler (0x470d10) plays 39.
 *
 * The call sites are the whole authority here, and PARACHUTE is what shows
 * why: the exe's own debug name table calls clip 58 "Parachuting" and the
 * exe parachutes with 82. Run the skeleton forward and 82 is the
 * hands-above-the-shoulders hang while 58 ranks 92nd of 93 for it — the name
 * table simply stops before the clips the code reaches
 * (parachute/notes.md).
 */
export const ANIM = {
  RUN: 0,
  /**
   * The HURT run cycles — clips 1 and 2, picked by ABSOLUTE health at
   * 0x46C4A5 in `Pig::UpdateMovement`: over 25 points clip 0, over 10 clip
   * 1 ("Run cycle (wounded)"), at or under 10 clip 2 ("more wounded"). The
   * same bands scale the stride (`WOUND_SPEED`).
   */
  RUN_WOUNDED: 1,
  RUN_HURT: 2,
  WALK_BACK: 3,
  TURN: 4,
  SWIM: 5,
  /** The jump's wind-up, played ONCE before the pig leaves the ground —
   * the exe launches on the frame it runs out (0x46c254 sets it, 0x46e8e2
   * calls `StartFalling`). 14 frames. */
  JUMP_START: 8,
  /** Falling, and what a cut parachute wears too (exe 0x4678f0). */
  JUMP_MIDDLE: 9,
  /** Getting up off a landing, played ONCE — what BOTH the ordinary landing
   * (0x470944) and the parachute's (0x4717f5) ask for, each with a repeat
   * count of 1. 11 frames. */
  LAND: 10,
  /** Trying to climb. Not a movement state: `UpdateGroundState` raises a
   * flag whenever the pig stands on terrain type 11 under the low-5-bit
   * mask (`and edx,1Fh; cmp ecx,0Bh`, exe 0x46fde4/0x470082), and the
   * animation picker (0x467ec0) answers with this clip in EVERY band —
   * standing, turning or walking. Type 11 is the grippiest ground in the
   * material table, which is exactly what you climb. */
  SCRAMBLE: 11,
  IDLE: 27,
  /** Standing there working out what to do — clip **46** of the fifty-nine the exe
   * names ("Thinking"). What a pig wears with SKIP TURN in hand: play named it when
   * the skill got a use, and there is no doze or sleep clip in the table for it to
   * have been instead — the menu's ICON is called `sleep`, which is where the
   * memory of one came from. */
  THINKING: 46,
  /**
   * **The victory dances — three real ones.** The name table's 41/42/43 are
   * "Celebration #1..#3" (44 "Salute" beside them), they sit BELOW the
   * tail's +24 drift, and the skeleton reads them as upright in-place clips
   * of ~30 frames each — everything a cheer should be. No call site in the
   * exe ever plays them; the remake spends them on the END OF GAME tour,
   * one per pig as the camera arrives (lib/game/battle.ts). `[deliberate]`
   * — dead art put to the use its name declares. 46 stays THINKING.
   */
  CELEBRATIONS: [41, 42, 43] as const,
  /** Thrown out of a wall — what `0x470c70` plays, and the only thing that
   * does. Ordinary falling is JUMP_MIDDLE; the impact handler plays BOUNCE. */
  EJECTED: 38,
  BOUNCE: 39,
  /**
   * What a body KILLED BUT NOT YET DYING wears — the exe's state 6: "DEAD,
   * corpse still in the world", whose arm (0x46f4ef) writes no position,
   * rides the physics body, and dresses it in clip 0x1D while it still
   * slides (`weapons/fire.md`, the `[pig+0x2EC]` read). The name table calls
   * 29 "Very Wounded", and it sits below the tail's +24 drift, so for once
   * the name is the clip. The dying clip proper starts only when the world
   * has settled (lib/game/corpses.ts).
   */
  WOUNDED: 29,
  /**
   * Falling over dead — SEVENTEEN of them, rolled per death
   * (lib/game/corpses.ts).
   *
   * The exe's own pick is READ now (2026-08-23, disassembled at the state
   * 6 → 7 edge): `[pig+0x36C] = rand() % 0x11 + 0x39` at 0x46f86a — a
   * random one of clips 0x39..0x49, 57 through 73. The three the name
   * table calls "Dying #1..#3" (47..49 plus the tail's +24 drift = 71..73,
   * confirmed by the skeleton survey: each starts standing and ends flat)
   * are only the TAIL of the range; the fourteen before them are unnamed
   * in the table and unsurveyed here — the exe's word is what puts them
   * in. NOT 47/48/49 raw: forward kinematics says those never leave a
   * standing pose.
   */
  DEATHS: [57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73] as const,
  /** Going under — 74: "Drowning" is named 50, and 50 + the same +24 drift
   * is 74, the ONE clip in the archive that starts lying down and carries
   * the root 648 units straight DOWN over ~2.8 s. The measurement and the
   * name agree from both ends. Play rules a death in the water wears it and
   * bursts at the bottom (lib/game/corpses.ts). */
  DROWNING: 74,
  /**
   * **WELL DONE, and BAD LUCK** — what a pig wears while the sergeant makes his
   * end-of-turn remark about it (lib/game/sergeant.ts).
   *
   * `Pig::React(15)` and `React(16)`, cases 0xF and 0x10 of the table at
   * 0x47281C, and both are ANIMATION ONLY — neither says a word, which is the
   * other half of the sergeant's line being the sergeant's. Each tosses a coin
   * for one of two clips (`call rand ; test al,1`, 0x472789 and its twin):
   * **30 or 54** on the good news, **31 or 33** on the bad.
   *
   * WHAT each of the four is, is the name table's business and the name table
   * has been wrong before, so they are named for the moment rather than for
   * the pose.
   */
  CHEERED: [30, 54] as const,
  SLUMPED: [31, 33] as const,
  /** Hanging under a canopy — the level's opening drop (lib/game/parachute). */
  PARACHUTE: 82
} as const

export interface Airborne {
  vx: number
  vy: number
  vz: number
  /** Riding out an impact rather than jumping. */
  bouncing: boolean
  /** Seconds until the jump's forward impulse, or null when there is none
   * left to spend. Only a jump sets it; a fall off a ledge keeps its walking
   * speed instead and an eject was already launched outward. */
  pushIn: number | null
  /** Thrown out of a wall — wears the EJECTED clip until it lands. */
  ejected?: boolean
  /**
   * Whether this flight has already HIT something. It is what tells the two
   * impact clips apart: 38 is the body FLYING (the exe puts a struck pig
   * through 0x470c70 and that arm asks for it, 0x470cf5) and 39 is "Bouncing
   * on B-Hind", which the IMPACT handler plays (0x478AC4) — so a pig is
   * flying until the ground says otherwise and bouncing after.
   *
   * Play, 2026-08-25: "в полёте нет анимации полёта — как стояли, так и
   * летят." The bounce clip was worn for the whole arc, launch included, and
   * a body rolling on its behind through the air reads as no animation at
   * all.
   */
  touched?: boolean
  /**
   * Seconds this flight has been in the air — `fly` accumulates it. Past
   * `FLY_AFTER_SECONDS` a plain fall has become FLYING, which is the exe's
   * own conversion (0x46e95d: 25 airborne frames turn `+0x1fd` into
   * `+0x21c`, the yelp, clip 38) — and only a FLYING body is hurt by the
   * ground (lib/game/falling.ts).
   */
  aloft?: number
  /**
   * Born from a THROW — a blast's, a melee's, a bullet's knockdown — so
   * FLYING from its first frame: every fling path in the exe enters through
   * 0x470c70, which is the flying state's own door. A jump or a step-off
   * leaves it unset and stays harmless until the 25 frames are up.
   */
  hurled?: boolean
}

export interface Intent {
  /** -1 back, 0 stop, 1 forward. */
  walk: number
  /** -1 left, 0 stop, 1 right. */
  turn: number
  jump: boolean
}

export interface LocomotionState {
  x: number
  z: number
  /** The FEET's game-space height: the ground when settled (plus the swim
   * sink in water), integrated freely while airborne. */
  y: number
  heading: number
  airborne: Airborne | null
  /** How long the pig has stood in blocked ground (`Map::IsBlocked` at its
   * own feet) — the original's framesInWall, in seconds. */
  wedgedSeconds: number
  /** Ground height of the last footing on UNBLOCKED ground — what the
   * step-up allowance is measured from. */
  freeY: number
  /** Which side the last sidestep took (the original's m_cLastSideStepMove),
   * so a pig scraping a wall does not dither. 0 = no preference. */
  sidestep: number
  /** Seconds before the pig may jump again (exe: 15 frames of recharge). */
  jumpReadyIn: number
  /**
   * Seconds left of the jump's wind-up, or 0 when there is none. A pig in
   * the crouch is committed: it neither walks nor turns, and it leaves the
   * ground on the frame this runs out — which is what the exe does, calling
   * `StartFalling` when the clip's repeat count is spent (0x46e8e2).
   */
  windUp: number
  /** The walking step the wind-up was entered on: the launch is faster the
   * faster the pig was going, and by then it is no longer moving. */
  windUpStride: number
  /** Seconds left of the landing's get-up. Driving cancels it outright. */
  getUp: number
  /**
   * Whether `clip` is an EVENT rather than a state — the wind-up or the
   * get-up — so a renderer plays it through once instead of looping it.
   * Everything else here is a state the pig is in for as long as it is in it.
   */
  commit: boolean
  /** Eases toward slippery-and-bouncy while wedged (lib/game/ballistics). */
  bounciness: Bounciness
  /** Which clip this frame wants on the pig. */
  clip: number
  /**
   * Whether the pig is IN the water, which is not the same question as whether
   * there is water under it: a pig on a bridge is over the ditch and not in it.
   *
   * It lives here because two other domains were asking the LANDSCAPE instead
   * and both got it wrong at the edge of CAMP's bridge — the sound played a
   * splash the moment the deck crossed the water line, and the camera dropped
   * its subject by SWIM_SINK and lurched. One number, and the picture and the
   * bank read the same one.
   */
  swimming: boolean
  /**
   * The wound band — 0 sound, 1 hobbled, 2 crippled (`woundBand`,
   * lib/game/health.ts) — WRITTEN BY THE DRIVER each frame, because this
   * state knows no pig. It scales the forward stride (`WOUND_SPEED`), picks
   * the hurt run cycles, and at 2 stands an UNARMED pig in the wounded
   * stance. All read out of the exe 2026-08-24 (0x46AD38 / 0x46C4A5 /
   * 0x472040 test 8).
   */
  wounded: 0 | 1 | 2
  /**
   * Whether a weapon is DRAWN — the idle picker's test 3 precedes its
   * health test 8, so an armed pig stands its ordinary stand at any health.
   * Written by the driver beside `wounded`.
   */
  armed: boolean
  /**
   * The GROUND CONTACT this frame made, or null — the full arrival speed
   * (the exe's `[hit+0x14]`, the length of the relative velocity) and
   * whether the body was FLYING when it hit. `fly` writes one per non-water
   * contact, `updateLocomotion` clears it at the top of every frame, and
   * whoever owns the PIG turns it into damage (lib/game/falling.ts): this
   * state knows no pig, the same split as `wounded`.
   */
  impact: { speed: number; flying: boolean } | null
}

/**
 * Where the feet rest at (x, z). On land, the ground. In water, the pig
 * FLOATS: the swim sink hangs off the water SURFACE (`TerrainQuery.surface`,
 * the exe's flattened render grid), not off the seabed — a dip in the
 * seabed must not drag a swimming pig down with it.
 */
export const restingY = (query: TerrainQuery, x: number, z: number): number =>
  query.isWater(x, z) ? query.surface(x, z) + SWIM_SINK : query.height(x, z)

/**
 * Whether a pig with its FEET here is in the water — asked of a pig that is not
 * being driven, and every bit as careful as `swimming` above.
 *
 * There is water under CAMP's bridge and under every one of ISLAND's spans, and
 * a pig on the deck is not in it. The driven pig settles that by asking the
 * obstacles (`standing`); anything else has only its own position, and that is
 * enough: a swimming pig's feet are AT the waterline by `restingY`, and a deck
 * holds them above it (game space is Y-DOWN, so above is a smaller y).
 *
 * Play found the missing half of this the hard way — "кончился ход, я провалился
 * на мосту в текстуры", which is what happens when the end-of-turn beat decides a
 * pig standing on a bridge needs swimming to shore (lib/game/walkAway.ts).
 */
export const inWater = (query: TerrainQuery, x: number, z: number, footY: number): boolean =>
  query.isWater(x, z) && footY >= query.surface(x, z)

/**
 * What a pig is ALREADY standing on, for the state that is about to be built
 * around it: where its feet are, and the world to ask about them.
 *
 * Optional because most of what builds a locomotion state has no such
 * knowledge — a warp names a spot and nothing else — and the answer without it
 * is the landscape's, which is what it always was.
 */
export interface Footing {
  /** The feet, game Y-DOWN — the pig's own current height. */
  y: number
  obstruction: Obstruction
}

/**
 * Where the feet rest when the pig is ALREADY somewhere: the surface it is
 * standing on where that is an object, and `restingY` otherwise.
 *
 * `standOn` with no reach answers about tops at or below the feet, so the one
 * that comes back LEVEL with them is what is holding the pig up — the same test
 * `standing` makes once a frame. Anything else (a deck far below, an object the
 * pig is falling past) is not what it is on, and the landscape answers.
 */
const footingY = (
  query: TerrainQuery,
  x: number,
  z: number,
  footing: Footing | undefined
): number | null => {
  if (!footing) return null
  const on = footing.obstruction.standOn(x, z, footing.y, 0)
  return on !== null && Math.abs(on - footing.y) < STANDING_ON ? on : null
}

export function createLocomotion(
  query: TerrainQuery,
  x: number,
  z: number,
  heading: number,
  footing?: Footing
): LocomotionState {
  // **A TURN STARTING ON A BRIDGE used to begin by falling off it.** This state
  // is built fresh for every turn (lib/game/battle.ts `focus`), and it asked the
  // LANDSCAPE where the pig's feet were — which under CAMP's deck is the ditch
  // floor 650 units down. The beat at the top of the turn hid it, because the
  // scene draws the pig out of its own position while "press any key" is up and
  // out of THIS while the turn is played; the first frame the player drove, the
  // pig was written back to the ground under the bridge. Play: "если начинаю ход
  // на мосту — нажимаю любую кнопку и он проваливается."
  //
  // The frame-by-frame walk had the rule already (`ground` measures its step-up
  // from the feet and finds the deck within the envelope); it was only ever the
  // FIRST frame that had nothing to measure from.
  const on = footingY(query, x, z, footing)
  const y = on ?? restingY(query, x, z)
  return {
    x,
    z,
    y,
    heading,
    airborne: null,
    wedgedSeconds: 0,
    // Standing on something is open footing, and its top is where the feet are
    // — the step-up allowance is measured from there and not from the ground
    // under the deck, which is the same rule `ground` applies at its tail.
    freeY: on ?? query.height(x, z),
    sidestep: 0,
    jumpReadyIn: 0,
    windUp: 0,
    windUpStride: 0,
    getUp: 0,
    commit: false,
    bounciness: FREE,
    clip: ANIM.IDLE,
    // …and a pig on a deck over water is not in the water, on the frame the
    // turn starts as much as on any other (`inWater`, and the whole of the bug
    // above is this question asked in a second place).
    swimming: inWater(query, x, z, y),
    wounded: 0,
    armed: false,
    impact: null
  }
}

/**
 * A state that can be put back later, with nothing shared with the original.
 *
 * There is one thing in the game that has to remember a footing rather than
 * work one out again — a pig going into a building (lib/game/indoors.ts).
 * Rebuilding one is not the same answer as keeping one: `createLocomotion`
 * runs `standOn` from the y it is handed, and a pig that walked in from
 * anything RAISED gets whatever that spot resolves to now. Measured on CAMP's
 * shelter: from the ground the rebuild gives the ground back, but from the
 * box's own top it gives the box top back — so the answer depends on a number
 * the door has, and it should use the one it has.
 *
 * The two nested pieces are copied too, or the stored footing would follow
 * whatever the live one did next.
 */
export const copyLocomotion = (state: LocomotionState): LocomotionState => ({
  ...state,
  airborne: state.airborne ? { ...state.airborne } : null,
  bounciness: { ...state.bounciness },
  impact: state.impact ? { ...state.impact } : null
})

/**
 * One frame. Mutates `state`; `delta` is the frame's seconds.
 *
 * `obstruction` is everything that is not the landscape — the map's objects
 * and the other pigs. It defaults to nothing in the way, which is what the
 * domain specs about terrain want and what a map whose objects failed to
 * load falls back to.
 */
export function updateLocomotion(
  state: LocomotionState,
  query: TerrainQuery,
  intent: Intent,
  delta: number,
  obstruction: Obstruction = NO_OBSTACLES
): void {
  // Last frame's contact has been read by now or never will be
  // (lib/game/falling.ts runs off it each frame).
  state.impact = null
  // Turning on the spot works in every grounded state; the air steers
  // nothing (`UpdateMovement` returns at once on state 5), and neither does
  // a pig already crouched to jump.
  if (intent.turn !== 0 && state.airborne === null && state.windUp <= 0) {
    state.heading += intent.turn * TURN_SPEED * delta
  }

  if (state.airborne) {
    fly(state, query, obstruction, delta)
  } else {
    ground(state, query, obstruction, intent, delta)
  }

  state.jumpReadyIn = Math.max(0, state.jumpReadyIn - delta)

  // Wedged is about where the pig IS — the original asks `Map::IsBlocked`
  // once a frame at its own feet — and nothing else. Nothing refuses the
  // step in the first place, so there is no shoving to detect.
  //
  // Except that a pig on a WALKWAY is not in the ground it happens to be
  // over. CAMP's second bridge crosses tiles the map flags as wall — the
  // plateau's own edge — so a pig standing on the deck was wedged from the
  // moment it got there, and the counter threw it off after 25 frames. What
  // it is standing on decides (lib/game/obstacles.ts).
  const wedged = !query.walkable(state.x, state.z) && !standing(state, obstruction)
  if (!wedged) state.wedgedSeconds = 0
  else {
    state.wedgedSeconds += delta
    if (state.wedgedSeconds >= EJECT_SECONDS) eject(state, query)
  }
  state.bounciness = easeBounciness(state.bounciness, wedged, state.airborne === null, delta)
}

/**
 * How long a plain fall stays harmless: the exe's conversion counter — 25
 * airborne frames (`cmp [esi+0x20c],0x19` at 0x46e95d) and the fall becomes
 * FLYING, yelp, clip 38, damage-eligible. Frames at the engine's own rate,
 * like every frame count (CLAUDE.md).
 */
export const FLY_AFTER_SECONDS = 25 * FRAME_SECONDS

/** Momentum carries; gravity does the rest. */
function fly(
  state: LocomotionState,
  query: TerrainQuery,
  obstruction: Obstruction,
  delta: number
): void {
  const a = state.airborne as Airborne
  // Nothing in the air is in the water, whatever is under it.
  state.swimming = false
  a.aloft = (a.aloft ?? 0) + delta
  // Whether this body is in the exe's FLYING state — the one the ground can
  // hurt (lib/game/falling.ts): thrown, ejected, or a plain fall past the
  // exe's 25-frame conversion (0x46e95d).
  const flying = a.hurled === true || a.ejected === true || a.aloft > FLY_AFTER_SECONDS
  // FLYING until it has hit something, BOUNCING after (`Airborne.touched`);
  // an eject flies the whole way, which is what it was already doing — and a
  // long plain fall wears the same clip 38 from the conversion on, which is
  // the exe's own dressing for it (0x470cf5).
  state.clip =
    a.ejected || (flying && !a.touched) || (a.bouncing && !a.touched)
      ? ANIM.EJECTED
      : a.bouncing
        ? ANIM.BOUNCE
        : ANIM.JUMP_MIDDLE
  // Flight clips cycle; only the landing below commits to one.
  state.commit = false
  // The jump's forward half, three frames in.
  if (a.pushIn !== null) {
    a.pushIn -= delta
    // Half a step of slack: the delay is a whole number of frames, and
    // subtracting one of them three times does not land on zero.
    if (a.pushIn < delta / 2) {
      a.vx += Math.sin(state.heading) * JUMP_PUSH
      a.vz += Math.cos(state.heading) * JUMP_PUSH
      a.pushIn = null
    }
  }
  const to = clampToWorld(state.x + a.vx * delta, state.z + a.vz * delta)
  // A body in the air is STILL A BODY. The exe's own sweep (0x406AD0) has two
  // callers: the walking dispatch (0x478e73, whose result word of 1 — "only the
  // landscape was hit" — is the successful step) and the physics library's own
  // integration of a live body (0x40a0dd, the same `[body+0x4C]` proxy, which
  // then walks the hit list it comes back with). The pig is a live body for the
  // whole flight — its movement update is skipped outright in state 5
  // (0x46b205) — so an object's box stops a JUMP the way it stops a step, and
  // this engine, whose obstacles were only ever consulted while walking, flew
  // straight through the training ground's dummies and its barbed wire.
  //
  // No step-up reach in the air: a box whose top is above the feet is a wall,
  // and one below them is what `standOn` lands on further down.
  //
  // **THE STEP IS REFUSED, NOT PAID FOR — the speed survives a contact.** This
  // used to zero the horizontal outright, and that is one arm of the exe's fork
  // applied to every contact in the game. A non-landscape hit goes through the
  // SAME impact handler a landing does — 0x470d10, whose two callers are
  // 0x4772bb for the landscape and 0x4777e2 for an object — and the handler
  // forks on the arrival speed alone (`cmp di,19h`, 0x4711d8, `di` being
  // `[hit+0x14]`, the LENGTH of the relative velocity): at or over 25 a frame it
  // bounces, and the bounce's kick rides the ADD primitive (0x4712e0), so
  // whatever the solver left survives the contact; only UNDER 25 does 0x471350
  // build zero vectors and kill the velocity. The `Map::IsBlocked` re-test on
  // that fork is the landscape arm's alone.
  //
  // No knock in this game is that slow. `BOUNCE_CUTOFF` is 375 a second and the
  // weakest fling a blast hands out — nine points at a grenade's rim — is 810,
  // so the dead stop fired on every one of them. What it cost is what play
  // reported and this engine could not reproduce for a long time: a pig thrown
  // at a mate 185 away crossed the two-radius boundary on its FIRST substep —
  // 32 units of the 1909 at a sixtieth, against the 15 it had to spare — lost
  // the throw for good, because nothing ever writes a horizontal back, and went
  // straight up and down on the spot. "Он на месте катился" (docs/todo.md B15).
  //
  // So the body presses on: blocked, it does not move this frame and it keeps
  // what it was given, which is re-tested next frame — and a 45° knock RIDES
  // OVER the body it was thrown at: a pig is 320 tall, and a throw of 1900 up
  // clears that in a sixth of a second.
  //
  // The under-cutoff arm is deliberately NOT built. It would have to kill the
  // whole velocity, vertical included — 0x4a9ee0 builds zero vectors — which in
  // the air is a body hanging on the side of a crate until gravity refills it,
  // and nothing that slow ever gets thrown at one. Neither is what an object's
  // own surface would throw BACK: the pig body class's contact methods
  // (0x411c90/0x412070/0x411620) are named in movement/notes.md and unread — so
  // a body meeting a box simply STALLS against it, with no slide along the face
  // and no bounce off it, until it clears the thing or comes down beside it.
  if (!obstruction.blocks(to.x, to.z, state.y, 0)) {
    state.x = to.x
    state.z = to.z
  }
  // Towards the terminal velocity rather than away from rest, with the
  // integrator's own drag on top — and the horizontal bleeds by the same
  // two, because the force's target has no sideways component.
  a.vy += ((TERMINAL_FALL - a.vy) / FALL_TAU - a.vy / DRAG_TAU) * delta
  const bleed = Math.max(0, 1 - delta * (1 / FALL_TAU + 1 / DRAG_TAU))
  a.vx *= bleed
  a.vz *= bleed
  const y = state.y + a.vy * delta
  // A roof to land on: the highest object top still BELOW the falling pig.
  // `standOn`'s reach is what makes it that — nothing above the feet counts.
  const ground = restingY(query, state.x, state.z)
  const roof = obstruction.standOn(state.x, state.z, state.y, 0)
  const floor = roof !== null && roof < ground ? roof : ground
  if (!(a.vy > 0 && y >= floor)) {
    state.y = y
    return
  }
  // Landing: the solver's impulse against the surface actually hit — the
  // normal part reflects and damps, the part along the slope carries whole,
  // so a hillside landing keeps its speed and goes on down. Wedged pigs come
  // down bouncier than free ones, which is what makes coming off a wall read
  // as a bounce and not a step.
  const blocked = !query.walkable(state.x, state.z)
  // Into the WATER there is no bounce and no getting up: the floor the fall
  // met is the waterline (`restingY`), and a body that has splashed down is
  // swimming from its first frame — play, mission 2: "когда свина сбрасывают
  // в воду - он сначала стоит долю секунды - затем плывёт; позу сразу в
  // плаванье надо", and again 2026-08-26: "когда свин падает в воду - он
  // должен в воде сразу включать анимацию плавания. щас ждётся
  // секунду-две." The wait was the bounce loop below: the arrival test is
  // the FULL speed, the reflection off the BOTTOM's slope (`query.normal`
  // reads the bed, not the sheet) keeps feeding it horizontal, and a
  // blast-thrown pig skimmed the waterline in BOUNCE for 1–1.5 s before the
  // settle ever reached the swim. Water is not a surface to skip off — the
  // splash ends the flight where it happens. A roof under the feet is not
  // water, whatever the tile says — that is the bridge rule (`inWater`
  // above) — and BLOCKED ground keeps its wall arm whole.
  if (!blocked && (roof === null || roof >= ground) && query.isWater(state.x, state.z)) {
    state.y = floor
    state.airborne = null
    state.swimming = true
    state.getUp = 0
    state.clip = ANIM.SWIM
    state.commit = false
    return
  }
  const normal = query.normal(state.x, state.z)
  const hit = bounceOff(
    { x: a.vx, y: a.vy, z: a.vz },
    state.bounciness,
    groundMaterial(query.tileType(state.x, state.z), blocked),
    normal,
    delta
  )
  state.y = floor
  // THE CONTACT, recorded for whoever owns the pig: the full arrival speed —
  // the exe's `[hit+0x14]` is the length of the relative velocity — and
  // whether the body was FLYING when it hit. Every non-water ground contact
  // makes one, the bounce arm's included: the exe charges a hard bounce per
  // contact (lib/game/falling.ts). Water made none above, which is the exe's
  // own skip at the damage call site.
  state.impact = { speed: Math.hypot(a.vx, a.vy, a.vz), flying }
  /**
   * A landing is binary in the original, and the test is the ARRIVAL SPEED —
   * the FULL magnitude, not its vertical part. The impact handler compares
   * `di` with 25 a frame (`cmp di,19h`, 0x4711d8), sends anything at or over
   * that to the bounce at 0x471247 and anything under it to `0x471350`, which
   * zeroes the velocity — and `di` is `[hit+0x14]`, which the sweep fills with
   * the LENGTH of the relative velocity (0x407a44 → 0x418310, an fsqrt of all
   * three components; read 2026-08-24). So a pig skimming the ground fast and
   * flat keeps bouncing — the solver leaves its slope-parallel speed and the
   * bounce arm only ADDS its upward kick (`0x4a9260` at 0x471305, the add
   * primitive, not the set) — and that chain of low skips IS the roll along
   * the ground play remembers ("ещё и по земле откатывает"). Settling on the
   * NORMAL arrival alone was the bug that ate it: the first touch of a 45°
   * toss reflects the vertical away, the next frame's normal arrival is a
   * crawl, and the settle discarded 700+ units a second of horizontal in one
   * frame — "катится на месте".
   *
   * **Being in a WALL refuses the GETTING UP, and only that** — the stand-up is
   * what `Map::IsBlocked` gates. This used to read it as "never lands at all",
   * and play found what that costs: "соскользнул с подъема и попал в бесконечный
   * цыкл — туда сюда скользит на 1м месте", on a tile whose type byte is 0x85 —
   * a WALL over terrain type 5. Landing on one, the pig kept 99% of its
   * slope-parallel speed off `WALL_MATERIAL`, never settled, and the wedge
   * counter relaunched it every 25 frames for ever. So BLOCKED ground keeps the
   * old normal-arrival test and comes down from a slide — the remake's own
   * guard, kept deliberately against the exe's reading — and the touch-down
   * itself throws the pig out downhill (below), which is the exe's own
   * immediate arm: `IsBlocked && speed < 0x32 → EjectFromWall` on the landing
   * frame (0x471041), so nothing ever comes to rest on a wall.
   */
  const arrival = blocked
    ? -(a.vx * normal.x + a.vy * normal.y + a.vz * normal.z)
    : Math.hypot(a.vx, a.vy, a.vz)
  if (arrival >= BOUNCE_CUTOFF) {
    state.airborne = { ...a, vx: hit.x, vy: hit.y, vz: hit.z, bouncing: true, touched: true }
    return
  }
  state.airborne = null
  // …and in a WALL it does not stay: the exe's impact handler tests
  // `IsBlocked && speed < 0x32` BEFORE anything else and calls
  // `Pig::EjectFromWall` on the landing frame (0x471041..0x47104D) — a
  // blocked tile is never rested on, the body is thrown out downhill at
  // once. Waiting for the wedge counter instead was the hang play saw
  // ("свин висит на склоне"): a knocked-back pig that is not the acting
  // one settles here with `getUp` at 0, `tumble.ts` drops its flight
  // record that same frame, and the counter in `updateLocomotion`'s tail
  // never runs for it again.
  if (blocked) {
    eject(state, query)
    return
  }
  // Down for good, so the pig gets up: clip 10, which is what the landing
  // handler asks for (0x470944) whatever the fall was. It runs down in
  // `ground` and any input throws it away, so a pig that lands running
  // never shows it.
  state.getUp = GET_UP
  state.clip = ANIM.LAND
  state.commit = true
}

/** Walking, swimming, jumping off — the kinematic, pinned-to-ground state. */
function ground(
  state: LocomotionState,
  query: TerrainQuery,
  obstruction: Obstruction,
  intent: Intent,
  delta: number
): void {
  // The wind-up owns the pig: crouched, going nowhere, and leaving the
  // ground on the frame the crouch is done. Everything below is skipped.
  if (state.windUp > 0) {
    state.windUp -= delta
    state.clip = ANIM.JUMP_START
    state.commit = true
    if (state.windUp > 0) return
    state.windUp = 0
    state.commit = false
    state.airborne = {
      // Straight up, faster the faster the pig was going — and forwards
      // only once JUMP_PUSH_DELAY is up.
      vy: jumpVelocity(state.windUpStride),
      vx: 0,
      vz: 0,
      bouncing: false,
      pushIn: JUMP_PUSH_DELAY
    }
    state.jumpReadyIn = JUMP_COOLDOWN_SECONDS
    state.clip = ANIM.JUMP_MIDDLE
    return
  }

  // The get-up runs down while the pig is left alone and is thrown away the
  // moment it is driven — the picker's clip request simply overwrites the
  // landing's (0x472320), and at a standstill there is no request to make.
  if (state.getUp > 0) {
    state.getUp =
      intent.walk !== 0 || intent.turn !== 0 ? 0 : Math.max(0, state.getUp - delta)
  }
  state.commit = state.getUp > 0

  /** The footing every reach is measured from — where the feet are NOW. */
  const footY = state.y
  /** …and whether that footing is a WALKWAY rather than the ground, which is
   * what stops the tiles under a bridge counting against the pig. */
  const onWalkway = standing(state, obstruction)
  // A pig on a bridge is not in the water it crosses. ISLAND's spans are all
  // over water, and without this the pig swims along the deck — the swim clip,
  // the 16-a-frame cap and the waterline for a resting height, forty feet up.
  const swimming = !onWalkway && query.isWater(state.x, state.z)
  state.swimming = swimming
  // Backwards is half as fast on land and the same in water, because the
  // exe's clamp lands differently either side of it: -32 scaled by the class
  // is 26 walking, and the water cap of 16 swallows both directions.
  // Forward alone carries the wound (`WOUND_SPEED` — backwards and the swim
  // are the exe's own exemptions).
  const speed = swimming
    ? SWIM_SPEED
    : intent.walk < 0
      ? WALK_BACK_SPEED
      : WALK_SPEED * WOUND_SPEED[state.wounded]
  const forwardX = Math.sin(state.heading)
  const forwardZ = Math.cos(state.heading)

  if (intent.jump && !swimming && state.jumpReadyIn <= 0 && (onWalkway || query.walkable(state.x, state.z))) {
    // A jump is committed, not steered: it leaves the ground FORWARDS
    // whatever the keys say and lands where that put it. `TryJump` also
    // refuses it from inside a wall — the jump-ladder up a cliff face is
    // the original's own rule, not an invention. And it costs a cooldown.
    //
    // A pig with forward speed leaves on THIS frame; anything else — standing
    // or backing away — crouches through clip 8 first and launches when it
    // runs out (the branch at 0x46c220). The stride is taken now either way,
    // because after a crouch the pig is no longer moving.
    state.windUpStride = intent.walk === 0 ? 0 : speed
    if (intent.walk > 0) {
      state.airborne = {
        vy: jumpVelocity(state.windUpStride),
        vx: 0,
        vz: 0,
        bouncing: false,
        pushIn: JUMP_PUSH_DELAY
      }
      state.jumpReadyIn = JUMP_COOLDOWN_SECONDS
      state.clip = ANIM.JUMP_MIDDLE
      state.commit = false
      return
    }
    state.windUp = JUMP_WINDUP
    state.clip = ANIM.JUMP_START
    state.commit = true
    return
  }

  if (intent.walk !== 0) {
    // Straight ahead, as the original walks. Only the world edge and the
    // step-up envelope refuse; a big enough drop turns the step into a
    // fall; a wall is entered as far as the envelope reaches and scraped
    // along past that, while the wedge counter runs toward the throw.
    // A walkway is what the landscape's own look-ahead cannot see, both ways
    // round — `step`'s `supported` handles the drop that is not there, and the
    // branch below the one that is.
    const holds = (x: number, z: number): boolean =>
      obstruction.standOn(x, z, footY, WALL_CLIMB) !== null
    const move = step(query, state.x, state.z, state.heading, speed * delta * intent.walk, holds)
    // …and walking OFF a walkway is a fall the landscape cannot see either:
    // over the far end of CAMP's bridge the ground below reads level all the
    // way, so the pig snapped 650 units down into the water without ever
    // leaving its feet.
    let outcome = move.outcome
    if (
      onWalkway &&
      outcome === 'moved' &&
      !holds(move.x, move.z) &&
      restingY(query, move.x, move.z) - footY > STEP_DOWN
    ) {
      outcome = 'falling'
    }
    if (outcome === 'falling') {
      state.x = move.x
      state.z = move.z
      state.airborne = {
        vy: 0,
        vx: forwardX * intent.walk * speed * FALL_SPEED_FACTOR,
        vz: forwardZ * intent.walk * speed * FALL_SPEED_FACTOR,
        bouncing: false,
        pushIn: null
      }
      state.clip = ANIM.JUMP_MIDDLE
      return
    }
    if (outcome === 'moved') {
      let pressing = false
      if (inReach(state, query, obstruction, footY, move.x, move.z)) {
        state.x = move.x
        state.z = move.z
        state.sidestep = 0
      } else {
        sidestep(state, query, obstruction, footY, speed * delta * intent.walk, delta)
        pressing = true
      }
      state.clip = swimming
        ? ANIM.SWIM
        : intent.walk > 0
          ? // A hurt pig runs a hurt cycle — clips 1 and 2 by the same bands
            // that slowed the stride (0x46C4A5).
            [ANIM.RUN, ANIM.RUN_WOUNDED, ANIM.RUN_HURT][state.wounded]
          : ANIM.WALK_BACK
      // The wall scrabble. The exe has NO clip of its own here — its wedge
      // branch (0x46fe83) only counts frames and eases the material, and
      // nothing but the eject (0x470c70) changes the animation — but a pig
      // pushing at a wall visibly scrabbles in play, and Scramble is the
      // clip that reads as it. A deliberate remake choice, not a
      // transcription: refused by the envelope, or driving into blocked
      // ground, the pig wears it.
      if (!swimming && (pressing || (!query.walkable(state.x, state.z) && !onWalkway))) {
        state.clip = ANIM.SCRAMBLE
      }
    }
  } else {
    // A CRIPPLED pig stands in the wounded stance — the idle picker's test 8
    // (0x472040, health at or under ten points) — unless a weapon is drawn:
    // test 3 precedes it, so an armed pig stands its ordinary stand at any
    // health.
    const stand = state.wounded === 2 && !state.armed ? ANIM.WOUNDED : ANIM.IDLE
    state.clip = swimming ? ANIM.SWIM : intent.turn !== 0 ? ANIM.TURN : stand
  }
  // The ground, or an object's top where one is close enough under the pig
  // to be stepped onto — the same envelope that decides whether the object
  // was a step or a wall in the first place.
  state.y = restingY(query, state.x, state.z)
  const on = obstruction.standOn(state.x, state.z, footY, WALL_CLIMB)
  if (on !== null && on < state.y) state.y = on
  // The step-up allowance is measured from the last footing on OPEN ground;
  // inside a wall the reference stays frozen, which is what caps the climb.
  if (query.walkable(state.x, state.z)) state.freeY = query.height(state.x, state.z)
  // Standing on something is open footing too, and its top is where the feet
  // ARE. Without this a pig that has walked up a ramp measures its next step
  // from the ground a thousand units below and is refused at the top of it —
  // which is exactly where CAMP's bridge lands, on the plateau's wall-flagged
  // edge.
  if (on !== null && on <= state.y) state.freeY = on

  // Scramble is the GROUND, not a movement state: the flag the exe raises
  // on masked type 11 makes the picker play clip 11 in every band — and the
  // ground is not what a pig on a walkway is on.
  if (!swimming && !onWalkway && query.isClimbing(state.x, state.z)) state.clip = ANIM.SCRAMBLE

  // The get-up outlasts whatever standing about would have picked — and it
  // only ever gets this far because nothing is driving the pig, which is the
  // one case where the original's picker asks for no clip at all.
  if (state.getUp > 0) state.clip = ANIM.LAND
}

/**
 * Whether an OBJECT is what the pig's feet are on, rather than the ground.
 *
 * `standOn` with no reach answers about tops at or below the feet and takes
 * the highest, so the one that comes back level with them is the surface the
 * pig is standing on.
 */
function standing(state: LocomotionState, obstruction: Obstruction): boolean {
  const on = obstruction.standOn(state.x, state.z, state.y, 0)
  return on !== null && Math.abs(on - state.y) < STANDING_ON
}

/**
 * May a walking step END here? Open ground always may — nothing about its
 * height refuses (`TryMove`'s landscape hit is the successful walk). Blocked
 * ground may only within the step-up envelope: no higher than WALL_CLIMB
 * above the last free footing. That is the wall refusing to be a ladder.
 *
 * An OBJECT is the other half of the same dispatch, and the reading that
 * terrain never refuses is the reading that objects do. It gets the same
 * envelope measured from the pig's own feet: a low box is a step onto, a
 * tall one is a wall, and a raised one is walked under.
 */
function inReach(
  state: LocomotionState,
  query: TerrainQuery,
  obstruction: Obstruction,
  footY: number,
  x: number,
  z: number
): boolean {
  // The envelope is measured from where the step ENDS, not from where the pig
  // is standing now — but never from lower than its own feet, or a pig on a
  // walkway would be measured against the ditch under it. Walking UP a bank
  // toward something level with the crest, the two differ by the slope times
  // the pig's own radius, and on CAMP's first bridge that was 65 units against
  // an envelope of 64: the abutment at the end of the bank read as a wall by
  // ONE unit and the pig stopped dead in front of it.
  const from = Math.min(footY, query.height(x, z))
  if (obstruction.blocks(x, z, from, WALL_CLIMB)) return false
  if (query.walkable(x, z)) return true
  // Game space is Y-down: higher ground is a SMALLER height value.
  return state.freeY - query.height(x, z) <= WALL_CLIMB
}

/**
 * The refused step's consolation, straight from `TryMove` step 5 (0x4790d9):
 * probe both right angles at twice the step, scrape 8 units a frame along
 * whichever is clear, and remember the side so the pig does not dither.
 */
function sidestep(
  state: LocomotionState,
  query: TerrainQuery,
  obstruction: Obstruction,
  footY: number,
  dist: number,
  delta: number
): void {
  const sides = state.sidestep !== 0 ? [state.sidestep, -state.sidestep] : [1, -1]
  for (const side of sides) {
    const angle = state.heading + (side * Math.PI) / 2
    const reach = 2 * Math.abs(dist)
    const probeX = state.x + Math.sin(angle) * reach
    const probeZ = state.z + Math.cos(angle) * reach
    if (!inReach(state, query, obstruction, footY, probeX, probeZ)) continue
    const scrape = SIDESTEP_SPEED * delta
    const to = clampToWorld(state.x + Math.sin(angle) * scrape, state.z + Math.cos(angle) * scrape)
    state.x = to.x
    state.z = to.z
    state.sidestep = side
    return
  }
}

/**
 * `EjectFromWall` (0x46fbd0): pushed OUT and UP, and **the pig is not turned**.
 *
 * Read to its last instruction after play stood on CAMP 18,12 — a wall tile
 * whose floor is 128 BELOW the open ground beside it — and reported "прыгает по
 * полу будто соскальзывает, но на месте". Both halves of that were this
 * function's, and both were the remake's own invention:
 *
 * - **it wrote the HEADING.** The exe takes the same gradient bearing
 *   (`0x40c090` off the pig's own x/z, then an inline `fpatan`) and spends it on
 *   an IMPULSE — `0x4A9100(0x20, 0, bearing, 0)` — and never touches the pig's
 *   facing anywhere in the arm or in `0x470c70` beyond it. Turning him round
 *   meant that with W held he walked straight back into the wall, was thrown
 *   again 25 frames later, and ping-ponged. (This is also the last unexamined
 *   suspect for "летящая свинья крутится вокруг своей оси", which is why the
 *   half-turn was written down as a candidate.)
 * - **there are TWO impulses, not one pitched one.** The level push above, then
 *   `0x4A9260(0x20, 0x3B6, 0, 0)`, which is 0x3B6 = **83.5°**, all but straight
 *   up. Collapsing them into a single 0x20 at 83.5° kept the vertical (31.8) and
 *   threw the horizontal away (3.6) — so the pig went UP and came down where it
 *   started, which is the hop play was looking at.
 *
 * The second call's own horizontal is along bearing ZERO rather than the
 * gradient; three and a half units at a fixed world angle is noise, so it is
 * folded into `out` here. And where the exe's gradient is a flat zero its
 * `fpatan` gives bearing 0; the remake has no vector at all there
 * (`downhill` → null) and backwards is the least wrong thing left — it is only
 * a velocity now, so nothing spins.
 */
function eject(state: LocomotionState, query: TerrainQuery): void {
  const bearing = query.downhill(state.x, state.z) ?? state.heading + Math.PI
  const out = EJECT_SPEED + Math.cos(EJECT_PITCH) * EJECT_SPEED
  state.airborne = {
    vx: Math.sin(bearing) * out,
    vz: Math.cos(bearing) * out,
    vy: -Math.sin(EJECT_PITCH) * EJECT_SPEED,
    bouncing: true,
    pushIn: null,
    ejected: true
  }
  state.clip = ANIM.EJECTED
  // The exe sets framesInWall back to 1, not 0 — the clock keeps running
  // while the pig is still inside.
  state.wedgedSeconds = FRAME_SECONDS
}
