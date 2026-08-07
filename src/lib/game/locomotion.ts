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
// Derivations and addresses: ../../../pigs-disasm/movement/notes.md.

import {
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
import { FALL_SPEED_FACTOR, WALK_BACK_SPEED, WALK_SPEED, step } from './movement'
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
/** How deep a swimming pig sits below the surface (game Y-down: +down) —
 * deep enough that only the head and shoulders clear the water. */
export const SWIM_SINK = 280

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
 * Not modelled: the standing hop's wind-up. The exe plays clip 8 and only
 * calls `StartFalling` when that clip runs out (0x46e8e2), so its standing
 * jump begins a few frames late; ours leaves at once.
 *
 * **The launch rides `JUMP_RISE`, and that is the remake's own.** The exe's
 * 0x30 puts the apex at 62 world units standing and 131 running, and those
 * are absolute — they know nothing about how big the body is. The model is
 * drawn at half size (`lib/game/scale.ts`) and the ground it falls back to
 * did not change with it, so the same hop became twice the pig's height.
 * Gravity here is the terrain's and is left alone, and under a fixed pull
 * the apex goes as the SQUARE of the launch — so the square root of the
 * model scale is what keeps a hop the same fraction of a pig it always was.
 * Corrected against play, not derived: the exe cannot say how high a pig
 * should jump relative to itself, only how high in units.
 */
export const JUMP_RISE = Math.sqrt(MODEL_SCALE)
export const JUMP_SPEED = fromExeSpeed(0x30) * JUMP_RISE
export const JUMP_PUSH = fromExeSpeed(0x30)
export const JUMP_PUSH_DELAY = 3 * FRAME_SECONDS
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
 * (../../../pigs-disasm/parachute/notes.md).
 */
export const ANIM = {
  RUN: 0,
  WALK_BACK: 3,
  TURN: 4,
  SWIM: 5,
  JUMP_MIDDLE: 9,
  /** Coming down off a flight and standing up — what the parachute landing
   * (0x4717d0) and the ordinary one (0x470910) both play, once. */
  LAND: 10,
  /** Trying to climb. Not a movement state: `UpdateGroundState` raises a
   * flag whenever the pig stands on terrain type 11 under the low-5-bit
   * mask (`and edx,1Fh; cmp ecx,0Bh`, exe 0x46fde1/0x470082), and the
   * animation picker (0x467ec0) answers with this clip in EVERY band —
   * standing, turning or walking. Type 11 is the grippiest ground in the
   * material table, which is exactly what you climb. */
  SCRAMBLE: 11,
  IDLE: 27,
  /** Thrown out of a wall — what `0x470c70` plays, and the only thing that
   * does. Ordinary falling is JUMP_MIDDLE; the impact handler plays BOUNCE. */
  EJECTED: 38,
  BOUNCE: 39,
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
  /** Eases toward slippery-and-bouncy while wedged (lib/game/ballistics). */
  bounciness: Bounciness
  /** Which clip this frame wants on the pig. */
  clip: number
}

/**
 * Where the feet rest at (x, z). On land, the ground. In water, the pig
 * FLOATS: the swim sink hangs off the water SURFACE (`TerrainQuery.surface`,
 * the exe's flattened render grid), not off the seabed — a dip in the
 * seabed must not drag a swimming pig down with it.
 */
export const restingY = (query: TerrainQuery, x: number, z: number): number =>
  query.isWater(x, z) ? query.surface(x, z) + SWIM_SINK : query.height(x, z)

export function createLocomotion(
  query: TerrainQuery,
  x: number,
  z: number,
  heading: number
): LocomotionState {
  return {
    x,
    z,
    y: restingY(query, x, z),
    heading,
    airborne: null,
    wedgedSeconds: 0,
    freeY: query.height(x, z),
    sidestep: 0,
    jumpReadyIn: 0,
    bounciness: FREE,
    clip: ANIM.IDLE
  }
}

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
  // nothing (`UpdateMovement` returns at once on state 5).
  if (intent.turn !== 0 && state.airborne === null) {
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
  const wedged = !query.walkable(state.x, state.z)
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
  state.clip = a.ejected ? ANIM.EJECTED : a.bouncing ? ANIM.BOUNCE : ANIM.JUMP_MIDDLE
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
  state.x = to.x
  state.z = to.z
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
  const hit = bounceOff(
    { x: a.vx, y: a.vy, z: a.vz },
    state.bounciness,
    groundMaterial(query.tileType(state.x, state.z), !query.walkable(state.x, state.z)),
    query.normal(state.x, state.z)
  )
  state.y = floor
  // A landing is binary in the original: over the threshold it bounces,
  // under it the body is STOPPED outright (`0x471350` zeroes the velocity)
  // and the pig stands up — unless it is inside a wall, and then the impact
  // handler refuses to: the stand-up is gated on `IsBlocked` saying no. A
  // pig in a wall never lands; it stays a body on a friction-0.01,
  // restitution-0.99 floor until it slides or is thrown out.
  if (-hit.y > 0 || !query.walkable(state.x, state.z)) {
    state.airborne = { ...a, vx: hit.x, vy: hit.y, vz: hit.z, bouncing: true }
  } else {
    state.airborne = null
  }
}

/** Walking, swimming, jumping off — the kinematic, pinned-to-ground state. */
function ground(
  state: LocomotionState,
  query: TerrainQuery,
  obstruction: Obstruction,
  intent: Intent,
  delta: number
): void {
  const swimming = query.isWater(state.x, state.z)
  /** The footing every reach is measured from — where the feet are NOW. */
  const footY = state.y
  // Backwards is half as fast on land and the same in water, because the
  // exe's clamp lands differently either side of it: -32 scaled by the class
  // is 26 walking, and the water cap of 16 swallows both directions.
  const speed = swimming ? SWIM_SPEED : intent.walk < 0 ? WALK_BACK_SPEED : WALK_SPEED
  const forwardX = Math.sin(state.heading)
  const forwardZ = Math.cos(state.heading)

  if (intent.jump && !swimming && state.jumpReadyIn <= 0 && query.walkable(state.x, state.z)) {
    // A jump is committed, not steered: it leaves the ground FORWARDS
    // whatever the keys say and lands where that put it. `TryJump` also
    // refuses it from inside a wall — the jump-ladder up a cliff face is
    // the original's own rule, not an invention. And it costs a cooldown.
    state.airborne = {
      // Straight up, faster the faster the pig was going — and forwards
      // only once JUMP_PUSH_DELAY is up.
      vy: jumpVelocity(intent.walk === 0 ? 0 : speed),
      vx: 0,
      vz: 0,
      bouncing: false,
      pushIn: JUMP_PUSH_DELAY
    }
    state.jumpReadyIn = JUMP_COOLDOWN_SECONDS
    state.clip = ANIM.JUMP_MIDDLE
    return
  }

  if (intent.walk !== 0) {
    // Straight ahead, as the original walks. Only the world edge and the
    // step-up envelope refuse; a big enough drop turns the step into a
    // fall; a wall is entered as far as the envelope reaches and scraped
    // along past that, while the wedge counter runs toward the throw.
    const move = step(query, state.x, state.z, state.heading, speed * delta * intent.walk)
    if (move.outcome === 'falling') {
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
    if (move.outcome === 'moved') {
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
      if (!swimming && (pressing || !query.walkable(state.x, state.z))) {
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

  // Scramble is the GROUND, not a movement state: the flag the exe raises
  // on masked type 11 makes the picker play clip 11 in every band.
  if (!swimming && query.isClimbing(state.x, state.z)) state.clip = ANIM.SCRAMBLE
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
  if (obstruction.blocks(x, z, footY, WALL_CLIMB)) return false
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
