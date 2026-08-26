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
import { missionTargetIds } from './endOfGame'
import { createScenery } from './scenery'
import type { Scenery } from './scenery'
import { createAirDrops } from './airDrop'
import type { AirDrops } from './airDrop'
import { createAnim } from './anim'
import type { Anim } from './anim'
import { createFootsteps } from './footsteps'
import { NO_DROP_IN, createDropIn } from './dropIn'
import type { DropIn } from './dropIn'
import { createStrikes } from './strikes'
import type { Strikes } from './strikes'
import { createHealing } from './healing'
import type { Heals } from './healing'
import { createBullets } from './bullets'
import type { Bullets } from './bullets'
import { createLobs } from './lobs'
import type { Lobs } from './lobs'
import { createMines } from './mines'
import type { Mines } from './mines'
import { createTumbles } from './tumble'
import type { Tumbles, Velocity } from './tumble'
import { createCorpses } from './corpses'
import { burst } from './blast'
import { createEffectField } from './effectField'
import type { EffectField } from './effectField'
import { createDamageNumbers } from './damage'
import { createDrowning } from './drowning'
import type { DamageNumbers } from './damage'
import { createIndoors } from './indoors'
import { createBattle } from './battle'
import type { Battle } from './battle'
import { witsFor } from './wits'
import { DEFAULT_SEED, seeded } from './random'
import { createBonePose } from './bonePose'
import type { BonePose } from './bonePose'
import type { BattleSnapshot, DescentShot, FlightShot, PigShot } from './snapshot'
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
  /**
   * Which sides the MACHINE plays (lib/game/ai.ts, lib/game/battle.ts). The
   * app hands in "everyone but side 0"; left out, nobody's — a battle
   * assembled without it is the hotseat the pure specs drive.
   */
  computer?: (side: number) => boolean
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
  /**
   * The whole battle as DATA, as of the last step that ran
   * (lib/game/snapshot.ts).
   *
   * What a renderer draws. Nothing on it is a live object, so it crosses a port
   * unchanged — which is the difference between hosting this engine somewhere
   * else and rewriting it.
   */
  snapshot(): BattleSnapshot
  readonly battle: Battle
  readonly query: TerrainQuery
  readonly scenery: Scenery
  readonly obstacles: ObstacleField
  readonly anim: Anim
  /** The pose the rules measured this frame — bone turns and all, for whoever
   * is drawing (lib/game/bonePose.ts). */
  readonly pose: BonePose
  readonly targets: Target[]
  /** How many of the map's MISSION targets are still standing — the dummies and
   * the shooting targets alone, and every one the map carries whether the script
   * has placed it or not (lib/game/endOfGame.ts). */
  targetsLeft(): number
  readonly shots: Bullets
  readonly grenades: Lobs
  /** The minefields, and what has been trodden on (lib/game/mines.ts). */
  readonly mines: Mines
  /** Pigs still in the air because something blew up under them
   * (lib/game/tumble.ts). */
  readonly tumbles: Tumbles
  readonly swings: Strikes
  /** The healing hands (lib/game/healing.ts). */
  readonly heals: Heals
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
  /** The bus carries ids, not pigs (lib/game/events.ts) — this is the engine's
   * own way back. Nothing outside it needs one. */
  const pigOf = (id: number): Pig | undefined => pigs().find((pig) => pig.id === id)
  /** One stream, and everything that rolls draws from it (lib/game/random.ts). */
  const random = seeded(parts.seed ?? DEFAULT_SEED)

  const query = parts.query ?? buildQuery(world.blocks, world.terrainArt)
  const training = isTrainingGround(world.map)

  /** What each pig is playing, how far into it, and whether a committed clip
   * has run out. */
  const anim = createAnim(world.clips)
  // NOBODY stands in the bind pose. A pig with no clip at all is drawn as the
  // HIR's T-pose, and until something happened to it nothing ever gave it one
  // — the enemy squad stood like that through the whole opening drop. Everyone
  // starts standing about; the drop-in re-dresses its arrivals the moment it
  // lifts them (lib/game/dropIn.ts).
  for (const one of pigs()) anim.setClip(one, ANIM.IDLE)
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
      clip: ({ pig, index, once }) => {
        const one = pigOf(pig)
        if (!one) return
        if (once) anim.playOnce(one, index)
        else anim.setClip(one, index)
      },
      // A death PLAYS OUT — the dying clip, the corpse blast, the boots — and
      // all of it is the corpse list's business (lib/game/corpses.ts). Built
      // further down (it waits on the tumbles); nothing can be killed while
      // the engine is still assembling.
      killed: ({ pig, gibbed }) => {
        const one = pigOf(pig)
        if (one) corpses.claim(one, gibbed === true)
      },
      // A crate on the ground is something to walk into again. Collision, not
      // art — the canopy coming off is the scene's half of the same event.
      crateLanded: ({ id, at }) => {
        obstacles.restore(id)
        // A crate arriving kicks something up. Play named it — "там ещё эффект
        // от падения" — and this is the remake's own: nothing has been read that
        // spawns an effect for a placed object. It takes row 0's SMOKE and not
        // its fire, because a crate landing raises dust — and play saw what
        // happened when it got the whole row ("коробка когда падает — искрит").
        effects.dust(at)
      },
      // The effect field and the floating damage are the ENGINE's — the beat
      // after a blow waits on both (lib/game/effectField.ts, damage.ts) — so
      // they are started here and not by whoever happens to be drawing.
      // The floating number prints over PIGS and BUILDING pieces only —
      // play: "дамаг земли показывает урон — надо показывать урон только
      // по свинам и строениям и машинам куда можно залезть." A bush, a
      // fir or a bridge takes its points in silence; a vehicle joins the
      // `structure` flag the day one is enterable. `[play]`
      damaged: ({ at, amount, pig, structure }) => {
        if (pig !== undefined || structure) numbers.show(at, amount)
      },
      // A heal shows the same number a hit does — one spawner, one style
      // argument apart (lib/game/scenery.ts).
      healed: ({ at, amount }) => numbers.show(at, amount, 'heal'),
      struck: ({ skill, at }) => effects.hit(skill, at),
      blasted: ({ at, effect }) => effects.blast(at, effect),
      // The splash is drawn on the WATER LINE however deep it gets, because
      // effect 0x0E snaps its own y there (0x488c19).
      skimmed: ({ at }) => effects.splash(at),
      doused: ({ at }) => effects.splash(at)
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
  /** …and what the hooves do on the way: a footstep is a key-frame event on the
   * clip, so the cursor above is most of what it needs (lib/game/footsteps.ts).
   * The rest is the collision world, because a hoof on a BRIDGE is not on the
   * tile under it (lib/game/underfoot.ts) — which is why this is built here,
   * after the scenery, rather than beside the clips. */
  const footsteps = createFootsteps(
    { pigs, anim, clips: world.clips, query, obstruction: obstacles },
    bus.emit
  )
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
  /**
   * …and which of them the MISSION is measured by — the dummies and the
   * shooting targets, not the trees and not the house (lib/game/endOfGame.ts).
   *
   * Taken off the map ONCE, every record it carries, including the ones its
   * script is still holding back: the exe's own test never looks at the placed
   * flag, which is the only reason a mission cannot end on its first frame.
   * What is left is whichever of them are still in the shared target list, which
   * the blade and the barrel splice as they go.
   */
  const missionIds = missionTargetIds(objects)
  const targetsLeft = (): number =>
    targets.reduce((left, one) => left + (missionIds.has(one.id) ? 1 : 0), 0)
  /** A dummy the script has not placed yet is not a target: the exe's own
   * strike tests `[obj+0x30]`, the placed flag, before it will hit one
   * (0x476319). */
  const present = (id: number): boolean => !scenery.absent(id)

  /** What a bayonet does when the fire key goes down, blade and all. */
  const swings = createStrikes(
    {
      pigs,
      targets,
      present,
      training,
      pose,
      clips: world.clips,
      // A swing throws what it hits, through the same seam the blast's toss
      // takes. `fling` is declared below and only ever called inside a step,
      // by which time `battle` exists.
      fling: (pig, velocity, ejected) => fling(pig, velocity, ejected)
    },
    bus.emit
  )
  /** What the HEALING HANDS do when the fire key goes down: the cone, the
   * nearest body in it and the points back on (lib/game/healing.ts). */
  const heals = createHealing({ pigs, clips: world.clips }, bus.emit)
  /** What a GUN does: the flight, the substepping and every verdict about what
   * was hit (lib/game/bullets.ts). */
  const shots = createBullets(
    {
      pigs,
      targets,
      present,
      query,
      obstacles,
      training,
      pose,
      // A bullet shoves the body it hits (SHOT_SHOVE, lib/game/bullets.ts),
      // through the same seam every other throw takes.
      fling: (pig, velocity) => fling(pig, velocity)
    },
    bus.emit
  )
  /**
   * Pigs a blast has THROWN (lib/game/tumble.ts) — and the seam that decides
   * whose state a throw lands on.
   *
   * The acting pig has one already and the battle drives it, so its impulse goes
   * there; `battle` is built further down and `fling` is only ever called from
   * inside a step, by which time it exists.
   */
  const tumbles = createTumbles({ query, pigs, obstacles }, bus.emit)
  // What a blast under a pig's trotters throws ALONG — the slope's own up
  // rather than the sky's (lib/game/tumble.ts, `hurlVelocity`).
  const groundNormal = (x: number, z: number): { x: number; y: number; z: number } =>
    query.normal(x, z)
  const fling = (pig: Pig, velocity: Velocity, ejected?: boolean): void =>
    battle.fling(pig, velocity, ejected)
  /** What becomes of a body once it is killed: the dying clip, the corpse
   * blast, the boots (lib/game/corpses.ts). After the tumbles, because a body
   * a blast threw finishes its flight before it finishes its death. */
  const corpses = createCorpses(
    {
      anim,
      query,
      tumbling: (pig) => tumbles.has(pig),
      // The battle is built below and only stepped after it exists, so the
      // late binding is safe; the answer is its `stageStill` — the walk-away's
      // swimmers included — which is what the dying clip waits behind.
      cleared: () => battle.stageStill(),
      roll: random,
      sideOf: (pig) => game.players.findIndex((player) => player.pigs.includes(pig)),
      // The corpse's bang is a REAL blast — the exe's own damage and range
      // (lib/game/corpses.ts carries the read). It goes through the same
      // `burst` a grenade does, so the falloff, the fling and the picture
      // are one path; nobody is credited with the kill, because the exe
      // credits nobody either.
      blast: (at, charge) =>
        burst(at, charge, { pigs, targets, present, training, fling, groundNormal }, bus.emit)
    },
    bus.emit
  )
  /** What is already buried in the ground: the map's MINEFIELDS, which are a bit
   * in a tile rather than anything anybody put there (lib/game/mines.ts). Before
   * the grenades, because a thrown thing sets one off the same way a foot does. */
  const mines = createMines(
    { pigs, targets, present, query, training, random, fling, groundNormal },
    bus.emit
  )
  /** …and what a GRENADE does, which is a parabola rather than a line. */
  const grenades = createLobs(
    { pigs, targets, present, query, obstacles, training, pose, random, mines, fling, groundNormal },
    bus.emit
  )

  /** The level's opening. A map whose squad has no canopy stands on its markers
   * instead, which is what `NO_DROP_IN` is. */
  const dropIn = world.parachutes ? createDropIn(pigs(), query, bus.emit, random) : NO_DROP_IN

  /** What the water costs whoever stands in it (lib/game/drowning.ts). Its own
   * domain because it is nobody's turn in particular: the exe runs it over the
   * whole pig list, every frame, in every mode. */
  const drowning = createDrowning({ pigs, query, training }, bus.emit)

  /** The BUILDINGS on the map and who is standing in one — a shelter a pig can
   * jump into (lib/game/indoors.ts). */
  const indoors = createIndoors(world.objects, bus.emit)

  const battle = createBattle({
    game,
    query,
    scenery,
    indoors,
    anim,
    clips: world.clips,
    shots,
    grenades,
    mines,
    swings,
    heals,
    tumbles,
    corpses,
    effects,
    numbers,
    airDrops,
    dropIn,
    drowning,
    training,
    /** What ENDS the mission (lib/game/endOfGame.ts). */
    targetsLeft,
    onChanged,
    bus,
    random,
    computer: parts.computer,
    // How well the machine thinks HERE: the campaign ramp's own dial
    // (lib/game/wits.ts).
    wits: witsFor(world.map)
  })

  /** One STEP of the rules: the frame's own order of events first — it reads
   * the lists below to decide what the turn is still waiting on — and then
   * everything running burns down by the same amount. */
  const step = (): void => {
    battle.update(STEP_SECONDS)
    anim.update(STEP_SECONDS)
    // Straight after the clips, because it reads their cursors: the hooves
    // that landed during the step just taken (lib/game/footsteps.ts).
    footsteps.update()
    numbers.update(STEP_SECONDS)
    effects.update(STEP_SECONDS)
    shots.update(STEP_SECONDS)
    grenades.update(STEP_SECONDS)
    mines.update(STEP_SECONDS)
    // …and every pig a blast threw, which is a flight of its own for each of them
    // (lib/game/tumble.ts). After the mines, because a mine going off this step is
    // what launched them.
    tumbles.update(STEP_SECONDS)
    // The deaths playing out — after the tumbles, so a thrown corpse lands
    // before it goes off (lib/game/corpses.ts).
    corpses.update(STEP_SECONDS)
    airDrops.update(STEP_SECONDS)
  }

  /** Real time that has arrived and not been stepped yet. */
  let carry = 0
  /** How many steps have run. The number a lockstep peer agrees on. */
  let stepped = 0

  const flightOf = (one: {
    id: number
    skill: number
    x: number
    y: number
    z: number
    vx: number
    vy: number
    vz: number
    fuse?: number
    doused?: boolean
  }): FlightShot => ({
    id: one.id,
    skill: one.skill,
    // A bullet has no fuse, a rocket's is infinite, and a DOUSED one has
    // stopped — nothing steps it but the sink (lib/game/lobs.ts). All three
    // travel as −1, so nothing downstream has to know which it was
    // (lib/game/snapshot.ts).
    fuse:
      one.fuse !== undefined && Number.isFinite(one.fuse) && one.doused !== true ? one.fuse : -1,
    x: one.x,
    y: one.y,
    z: one.z,
    vx: one.vx,
    vy: one.vy,
    vz: one.vz
  })

  const pigShotOf = (pig: Pig): PigShot => {
    const worn = anim.wornBy(pig)
    const over = anim.overlayOf(pig)
    return {
      id: pig.id,
      name: pig.name,
      health: pig.health,
      x: pig.position.x,
      y: pig.position.y,
      z: pig.position.z,
      heading: pig.heading,
      holding: pig.holding,
      clip: worn.index,
      clipOnce: worn.once,
      clipElapsed: worn.elapsed,
      overlay: over.index,
      overlayPhase: over.phase,
      underCanopy: dropIn.underCanopy(pig),
      sheltered: indoors.inside(pig) !== null,
      arriving: dropIn.live().some((one) => one.pig === pig)
    }
  }

  return {
    update(delta, beforeStep) {
      carry += delta
      let steps = 0
      while (carry >= STEP_SECONDS && steps < MAX_CATCHUP) {
        beforeStep?.()
        step()
        stepped++
        carry -= STEP_SECONDS
        steps++
      }
      // Whatever is left after the cap is time the battle will never run.
      if (carry >= STEP_SECONDS) carry = 0
      return steps
    },
    alpha: () => carry / STEP_SECONDS,
    snapshot() {
      const view = battle.view()
      return {
        step: stepped,
        turn: game.turn,
        player: game.currentPlayer.name,
        timeLeft: game.timeLeft,
        starting: game.starting,
        over: game.over,
        acting: game.currentPig.id,
        pigs: pigs().map(pigShotOf),
        loco: view.loco,
        aimAngle: view.aimAngle,
        scoped: view.scoped,
        sighting: view.sighting,
        zoom: view.zoom,
        readying: view.readying,
        still: view.still,
        driving: view.driving,
        firing: view.firing,
        aftermath: view.aftermath,
        // A copy, like everything else here: the ending is a live object in the
        // battle and a snapshot is data (lib/game/endOfGame.ts).
        ending: view.ending === null ? null : { ...view.ending },
        swinging: swings.running(),
        dropping: dropIn.running(),
        bullets: shots.live().map(flightOf),
        lobs: grenades.all().map(flightOf),
        crates: airDrops.live().map((one): DescentShot => ({ id: one.id, y: one.drop.y })),
        effects: [...effects.all()],
        numbers: [...numbers.all()]
      }
    },
    battle,
    query,
    scenery,
    obstacles,
    anim,
    pose: bones,
    targets,
    targetsLeft,
    shots,
    grenades,
    mines,
    tumbles,
    effects,
    numbers,
    airDrops,
    dropIn,
    swings,
    heals,
    training
  }
}
