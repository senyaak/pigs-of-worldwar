// The engine, assembled: everything a battle IS, built from parsed map data
// and nothing else.
//
// The pieces were already the engine's — the terrain, the map's script, the
// projectiles, the effects, the drop-in — but the only place that knew how to
// put them together was `three/battle.ts`, which meant a battle could not be
// built without a scene graph to build it in. That is the last thing between
// this and an engine that runs in its own process with the renderer talking to
// it over a port.
//
// The scene now builds ART around an engine it is handed. What it may still
// read is on `Engine` below; what it must not do is TICK any of it — `update()`
// runs the whole frame, in the order the game needs, once.
//
// Game space (Y-down) throughout.

import { TerrainQuery } from './terrain'
import { buildWaterMask } from './watermask'
import type { TerrainArt } from './watermask'
import { isTrainingGround } from './tutorial'
import { targetsOf } from './targets'
import type { Target } from './targets'
import { createScenery } from './scenery'
import type { Scenery } from './scenery'
import { createAirDrops } from './airDrop'
import type { AirDrops } from './airDrop'
import { createAnim } from './anim'
import type { Anim } from './anim'
import { NO_DROP_IN, createDropIn } from './dropIn'
import type { DropIn } from './dropIn'
import { createStrikes } from './strikes'
import type { Strikes } from './strikes'
import { createBullets } from './bullets'
import type { Bullets } from './bullets'
import { createLobs } from './lobs'
import type { Lobs } from './lobs'
import { createEffectField } from './effectField'
import type { EffectField } from './effectField'
import { createDamageNumbers } from './damage'
import type { DamageNumbers } from './damage'
import { createBattle } from './battle'
import type { Battle } from './battle'
import { DEFAULT_SEED, seeded } from './random'
import { createBonePose } from './bonePose'
import type { BonePose } from './bonePose'
import type { ClipFrames } from './clipPose'
import type { Pose } from './pose'
import type { Bone } from '../formats/hir'
import { handling } from './events'
import type { BattleBus } from './events'
import type { ObstacleField } from './obstacles'
import type { MapObject } from '../formats/pog'
import type { TerrainBlock } from '../formats/pmg'
import type { ClipTiming } from './clips'
import { ANIM } from './locomotion'
import type { Game, Pig } from './game'

/** The map, as data. Every field of it comes out of `lib/formats`. */
export interface BattleWorld {
  game: Game
  blocks: TerrainBlock[]
  /** The ground's textures — read for their PALETTES, not to draw with: the
   * water verdict is per-texel and comes off the same art the ground shows
   * (lib/game/watermask.ts). */
  terrainArt: TerrainArt[]
  /** The map's .POG records: the crates, the boxes, the script. */
  objects: MapObject[]
  /** Every clip, with its rotations: how long one runs times a swing, and the
   * rotations POSE the pig — the muzzle, the blade and the scope's eye are all
   * points in a bone's frame (lib/game/bonePose.ts). */
  clips: ClipFrames[]
  /** The HIR chain the models bind to. Empty and nothing can be posed, which
   * is a battle whose blows all miss — see `pose` below. */
  skeleton: Bone[]
  /** Which map this is — the training ground hands out its crates on its own
   * terms (lib/game/pickups.ts). */
  map: string
  /**
   * Whether a squad has a canopy to come down under.
   *
   * A flag rather than the art itself: whether the drop-in happens is the
   * engine's business, and whether there is a model to hang is the scene's.
   */
  parachutes: boolean
}

/**
 * The map as the rules see it.
 *
 * The per-texel water verdict rides on the same art the ground draws — a pig
 * stands on the painted dry half of a shore tile and swims one step further,
 * exactly where the water shows (lib/game/watermask.ts).
 */
export function buildQuery(blocks: TerrainBlock[], art: TerrainArt[]): TerrainQuery {
  return new TerrainQuery(blocks, buildWaterMask(blocks, art))
}

export interface EngineParts {
  world: BattleWorld
  /** The stream everything is announced on, and heard on (lib/game/events.ts). */
  bus: BattleBus
  /** Called whenever the state changed this frame (a HUD refresh). */
  onChanged: () => void
  /** The map, already built — the renderer stands its art on the same ground
   * and there is no reason to walk the blocks twice. Left out, the engine
   * builds its own from `world`. */
  query?: TerrainQuery
  /**
   * What this battle rolls from (lib/game/random.ts). Two machines that agree
   * on the seed and step the same inputs get the same battle; left out, every
   * battle is the same battle, which is what a suite wants.
   */
  seed?: number
  /**
   * Where a bone is, in the world (lib/game/pose.ts).
   *
   * The engine works this out for ITSELF now — forward kinematics over the
   * skeleton and the clip each pig is wearing — and hands the same pose back
   * for the renderer to draw with (`Engine.pose`). This is here for a caller
   * that wants to answer it some other way, and for the pure specs.
   */
  pose?: Pose
}

/**
 * The simulation's quantum: how much time ONE step of the rules is.
 *
 * A step has to be fixed. Two machines stepping the same inputs by whatever
 * their monitors happened to hand them do not get the same battle, and neither
 * does one machine replaying itself — which is what lockstep and a replay both
 * need (`net play is lockstep`).
 *
 * WHY a sixtieth, when the exe's own engine frame is a thirtieth
 * (`EXE_FRAME_SECONDS`, and `FRAME_SECONDS`'s 1/15 is a unit conversion rather
 * than a rate)? Because this is the rate the remake already integrates at: the
 * scene has been handing the rules its render delta, ~1/60, since the first
 * frame it drew. Fixing the number changes nothing anybody can see, and every
 * trajectory play has looked at stays exactly where it was. Anything coarser
 * moves the picture in visible jumps and cannot land until the renderer
 * interpolates between steps — a separate piece of work, and the thing that
 * would let this drop to the engine's own frame.
 */
export const STEP_SECONDS = 1 / 60

/**
 * The most steps one call will run.
 *
 * A window that was minimised, a breakpoint, a slow load — the delta comes back
 * enormous and the rules would try to catch up all of it, which takes longer
 * than the frame it is catching up and never ends. Time past this is DROPPED:
 * the battle runs slow for an instant rather than freezing. (A networked
 * battle cannot drop steps — there the step count comes off the wire and not
 * off a clock, which is the same accumulator with a different source.)
 */
const MAX_CATCHUP = 8

/** A built battle, and the parts of it worth reading from outside. */
export interface Engine {
  /**
   * Advance by however much real time has passed — in whole STEPS, of which
   * this runs as many as the time buys. Returns how many it ran, which is 0
   * on a frame that arrived early.
   *
   * `beforeStep` is called just before each one: where a renderer takes the
   * snapshot it will interpolate FROM, so that a call which runs two steps
   * still leaves it holding the state one step back rather than two.
   */
  update(delta: number, beforeStep?: () => void): number
  /**
   * How far into the step that has NOT run yet the clock stands, 0..1.
   *
   * What a renderer drawing faster than the rules step interpolates with. It
   * is 0 whenever a step has just landed.
   */
  alpha(): number
  readonly battle: Battle
  readonly query: TerrainQuery
  readonly scenery: Scenery
  readonly obstacles: ObstacleField
  readonly anim: Anim
  /** The pose the rules measured this frame — bone turns and all, for whoever
   * is drawing (lib/game/bonePose.ts). */
  readonly pose: BonePose
  readonly targets: Target[]
  readonly shots: Bullets
  readonly grenades: Lobs
  readonly swings: Strikes
  readonly effects: EffectField
  readonly numbers: DamageNumbers
  readonly airDrops: AirDrops
  readonly dropIn: DropIn
  /** Whether this is the training ground, which several rules ask. */
  readonly training: boolean
}

export function createEngine(parts: EngineParts): Engine {
  const { world, bus, onChanged } = parts
  const { game, objects } = world
  const pigs = (): Pig[] => game.players.flatMap((player) => player.pigs)
  /** One stream, and everything that rolls draws from it (lib/game/random.ts). */
  const random = seeded(parts.seed ?? DEFAULT_SEED)

  const query = parts.query ?? buildQuery(world.blocks, world.terrainArt)
  const training = isTrainingGround(world.map)

  /** What each pig is playing, how far into it, and whether a committed clip
   * has run out. */
  const anim = createAnim(world.clips)
  /** …and where that puts its bones. The blade, the muzzle and the scope's eye
   * are the same question, asked of the engine now (lib/game/bonePose.ts). */
  const bones = createBonePose({ skeleton: world.skeleton, clips: world.clips, anim })
  const pose: Pose = parts.pose ?? bones
  /** The rings a blow throws, and the numbers that float off it. */
  const effects = createEffectField(random)
  const numbers = createDamageNumbers()

  // The engine hears its OWN announcements before anything is built that can
  // make one — a record the script is holding back is announced hidden while
  // `createScenery` is still running, and a parachute opens inside
  // `createDropIn`. A listener hung afterwards would miss both.
  bus.on(
    handling({
      // What a pig WEARS is the engine's: the renderer is told what is playing,
      // it does not decide it (lib/game/anim.ts).
      clip: ({ pig, index, once }) => (once ? anim.playOnce(pig, index) : anim.setClip(pig, index)),
      killed: ({ pig }) => anim.playOnce(pig, ANIM.DYING),
      // A crate on the ground is something to walk into again. Collision, not
      // art — the canopy coming off is the scene's half of the same event.
      crateLanded: ({ id }) => obstacles.restore(id)
    })
  )

  /**
   * The crates, the map's SCRIPT and the collision world (lib/game/scenery.ts).
   * Field 14 is an opcode and the objects are the program: most of what CAMP
   * carries is not on its ground at the start, and each of them arrives when
   * the thing it waits on has been finished off.
   */
  const scenery = createScenery(
    objects,
    training,
    () => game.currentPig,
    (id, fromY) => airDrops.send(id, fromY),
    bus.emit
  )
  const obstacles = scenery.obstacles
  /** Crates that come down under a canopy, because the script says they are
   * pickups and the placer drops those from 0xC00 up — the DESCENT is the
   * engine's, because the beat after a blow waits on it (lib/game/airDrop.ts). */
  const airDrops = createAirDrops(
    { groundOf: (id) => scenery.restingY(id), at: (id) => scenery.at(id) },
    bus.emit
  )

  /**
   * The training ground's dummies — the other thing a blow can land on, and the
   * only one that is not a pig (lib/game/targets.ts).
   *
   * ONE list, shared by the blade and the barrel. Each of them splices a dummy
   * out when it goes down, so two lists meant a dummy shot dead was still
   * standing as far as the bayonet was concerned — killable a second time, and
   * its script step run twice.
   */
  const targets = targetsOf(objects)
  /** A dummy the script has not placed yet is not a target: the exe's own
   * strike tests `[obj+0x30]`, the placed flag, before it will hit one
   * (0x476319). */
  const present = (id: number): boolean => !scenery.absent(id)

  /** What a bayonet does when the fire key goes down, blade and all. */
  const swings = createStrikes(
    { pigs, targets, present, training, pose, clips: world.clips },
    bus.emit
  )
  /** What a GUN does: the flight, the substepping and every verdict about what
   * was hit (lib/game/bullets.ts). */
  const shots = createBullets(
    { pigs, targets, present, query, obstacles, training, pose },
    bus.emit
  )
  /** …and what a GRENADE does, which is a parabola rather than a line. */
  const grenades = createLobs(
    { pigs, targets, present, query, obstacles, training, pose, random },
    bus.emit
  )

  /** The level's opening. A map whose squad has no canopy stands on its markers
   * instead, which is what `NO_DROP_IN` is. */
  const dropIn = world.parachutes ? createDropIn(pigs(), query, bus.emit, random) : NO_DROP_IN

  const battle = createBattle({
    game,
    query,
    scenery,
    anim,
    clips: world.clips,
    shots,
    grenades,
    swings,
    effects,
    numbers,
    airDrops,
    dropIn,
    onChanged,
    bus,
    random
  })

  /** One STEP of the rules: the frame's own order of events first — it reads
   * the lists below to decide what the turn is still waiting on — and then
   * everything running burns down by the same amount. */
  const step = (): void => {
    battle.update(STEP_SECONDS)
    anim.update(STEP_SECONDS)
    numbers.update(STEP_SECONDS)
    effects.update(STEP_SECONDS)
    shots.update(STEP_SECONDS)
    grenades.update(STEP_SECONDS)
    airDrops.update(STEP_SECONDS)
  }

  /** Real time that has arrived and not been stepped yet. */
  let carry = 0

  return {
    update(delta, beforeStep) {
      carry += delta
      let steps = 0
      while (carry >= STEP_SECONDS && steps < MAX_CATCHUP) {
        beforeStep?.()
        step()
        carry -= STEP_SECONDS
        steps++
      }
      // Whatever is left after the cap is time the battle will never run.
      if (carry >= STEP_SECONDS) carry = 0
      return steps
    },
    alpha: () => carry / STEP_SECONDS,
    battle,
    query,
    scenery,
    obstacles,
    anim,
    pose: bones,
    targets,
    shots,
    grenades,
    effects,
    numbers,
    airDrops,
    dropIn,
    swings,
    training
  }
}
