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
//   turns the pig DOWNHILL and launches it. The elastic wall material only
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
import { NO_OBSTACLES } from './obstacles'
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
   * mask (`and edx,1Fh; cmp ecx,0Bh`, exe 0x46fde1/0x470082), and the
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
  /** Thrown out of a wall — what `0x470c70` plays, and the only thing that
   * does. Ordinary falling is JUMP_MIDDLE; the impact handler plays BOUNCE. */
  EJECTED: 38,
  BOUNCE: 39,
  /** Falling over dead. The exe has three (47, 48, 49 — "Dying #1..#3") and
   * picks between them in 0x47d080, which is not decoded; the remake plays
   * the first and says so (lib/game/health.ts). */
  DYING: 47,
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
  return on !== null && Math.abs(on - footing.y) < 1 ? on : null
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
    swimming: inWater(query, x, z, y)
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
  bounciness: { ...state.bounciness }
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
  state.clip = a.ejected ? ANIM.EJECTED : a.bouncing ? ANIM.BOUNCE : ANIM.JUMP_MIDDLE
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
  // and one below them is what `standOn` lands on further down. Stopping the
  // horizontal dead is the remake's own — the exe resolves it as a contact with
  // the box's own material, and that solver is not read (movement/notes.md).
  if (obstruction.blocks(to.x, to.z, state.y, 0)) {
    a.vx = 0
    a.vz = 0
  } else {
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
  const normal = query.normal(state.x, state.z)
  const hit = bounceOff(
    { x: a.vx, y: a.vy, z: a.vz },
    state.bounciness,
    groundMaterial(query.tileType(state.x, state.z), blocked),
    normal
  )
  state.y = floor
  /**
   * A landing is binary in the original, and the test is the ARRIVAL SPEED and
   * nothing else: the impact handler compares it with 25 a frame (`cmp di,19h`,
   * 0x4711d8), sends anything at or over that to the bounce at 0x471247 and
   * anything under it to `0x471350`, which zeroes the velocity.
   *
   * **Being in a WALL refuses the GETTING UP, and only that** — the stand-up is
   * what `Map::IsBlocked` gates. This used to read it as "never lands at all",
   * and play found what that costs: "соскользнул с подъема и попал в бесконечный
   * цыкл — туда сюда скользит на 1м месте", on a tile whose type byte is 0x85 —
   * a WALL over terrain type 5. Landing on one, the pig kept 99% of its
   * slope-parallel speed off `WALL_MATERIAL`, never settled, and the wedge
   * counter relaunched it every 25 frames for ever. Now it comes down, and the
   * counter throws it out downhill from a standstill, which is the exit that was
   * always meant to be there.
   */
  if (-(a.vx * normal.x + a.vy * normal.y + a.vz * normal.z) >= BOUNCE_CUTOFF) {
    state.airborne = { ...a, vx: hit.x, vy: hit.y, vz: hit.z, bouncing: true }
    return
  }
  state.airborne = null
  // …and in a wall it does not get up: the exe's stand-up is gated on
  // `IsBlocked`, so the pig lies there as a body until the wedge counter ejects
  // it (`updateLocomotion`'s own tail).
  if (blocked) return
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
  const speed = swimming ? SWIM_SPEED : intent.walk < 0 ? WALK_BACK_SPEED : WALK_SPEED
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
      state.clip = swimming ? ANIM.SWIM : intent.walk > 0 ? ANIM.RUN : ANIM.WALK_BACK
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
    state.clip = swimming ? ANIM.SWIM : intent.turn !== 0 ? ANIM.TURN : ANIM.IDLE
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
  return on !== null && Math.abs(on - state.y) < 1
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

/** `EjectFromWall`: face downhill, launch mostly upward, count from one. */
function eject(state: LocomotionState, query: TerrainQuery): void {
  // The exe's heading is the atan2 of the ground gradient (0x40c090 reads
  // the four corner heights): out means DOWN the face. Dead-flat wall tops
  // have no downhill; backwards is the least wrong direction left.
  state.heading = query.downhill(state.x, state.z) ?? state.heading + Math.PI
  const out = Math.cos(EJECT_PITCH) * EJECT_SPEED
  state.airborne = {
    vx: Math.sin(state.heading) * out,
    vz: Math.cos(state.heading) * out,
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
