// The battle itself: the order of events in one frame.
//
// Everything that decides what happens — the turn clock, the drop-in, the beat
// after a blow, the fire button, the gauge, the shot's fuse, the walk, the aim,
// the tremor and the zoom — and nothing that shows it. This was the body of
// `three/battle.ts`, which meant the game could not be stepped without a scene
// graph to step it in.
//
// The renderer's half is now a READER: once the frame has run it asks `view()`
// where the pig is, what it is aiming along, how far the sniper has zoomed and
// what the camera should be looking at, and draws that. Only four things cannot
// be read back and so are announced (`BattlePresenter`).
//
// Game space (Y-down) throughout.

import { ANIM, copyLocomotion, createLocomotion, inWater, updateLocomotion } from './locomotion'
import { createWaterMemo, flood, route } from './pathfind'
import type { RouteAsk } from './pathfind'
import { advanceCarry, carryIn, carryOut, doorwayStart } from './doorway'
import type { Carry } from './doorway'
import type { LocomotionState } from './locomotion'
import { withPigs } from './obstacles'
import { isDead, maxHealthFor, woundBand } from './health'
import { aimPhase, aimRadians, scrubsPose } from './aim'
import { weaponOf } from './weapons'
import type { Firing } from './shot'
import { advanceAftermath, beginAftermath, watchAftermath } from './aftermath'
import type { Aftermath } from './aftermath'
import { AI_FUSE_SECONDS, AI_MULL_SECONDS, AI_START_SECONDS } from './ai'
import { CLOCK_WARNING } from './turns'
import { createActuator } from './actuator'
import type { Order } from './orders'
import { createGruntBrain } from './grunt'
import { beginWalkAway } from './walkAway'
import {
  SARGE_FLOOR,
  SARGE_WON,
  noTally,
  sargeAfterTurn,
  sargeAtTurnStart,
  sargeOnPoint,
  winOrLose
} from './sergeant'
import type { WalkAway } from './walkAway'
import { advanceEndOfGame, beginEndOfGame, outcomeOf } from './endOfGame'
import type { EndOfGame } from './endOfGame'
import { MINE_HURRY_SECONDS, endsTurn, hurryFor } from './spend'
import { blastRange, isPlanted, lobOf } from './grenade'
import { createSights } from './sights'
import { createAttack } from './attack'
import { SKILL } from './skills'
import { layerSights, weaponLayer } from './controls'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import type { Game, Pig } from './game'
import type { TerrainQuery } from './terrain'
import type { Anim } from './anim'
import type { Scenery } from './scenery'
import type { Building, Indoors } from './indoors'
import { INOUT_CLIP } from './buildings'
import type { Bullets } from './bullets'
import type { Lobs } from './lobs'
import { isMine } from './mines'
import type { Mines } from './mines'
import type { Tumbles, Velocity } from './tumble'
import type { Strikes } from './strikes'
import type { Heals } from './healing'
import type { EffectField } from './effectField'
import type { DamageNumbers } from './damage'
import type { AirDrops } from './airDrop'
import type { DropIn } from './dropIn'
import type { Corpses } from './corpses'
import { drowns } from './drowning'
import type { Drowning } from './drowning'
import { chargeLanding } from './falling'
import type { Hides } from './hide'
import type { Pockets } from './pickpocket'
import type { Poison } from './poison'
import type { Point } from './pose'
import type { Random } from './random'
import { handling } from './events'
import type { BattleBus, Emit } from './events'

/** Everything the battle drives. Each of these is the engine's too; they are
 * passed in because the scene builds them alongside the art that shows them. */
export interface BattleParts {
  game: Game
  query: TerrainQuery
  scenery: Scenery
  /** The BUILDINGS on the map and who is standing in one (lib/game/indoors.ts). */
  indoors: Indoors
  anim: Anim
  clips: ClipTiming[]
  shots: Bullets
  grenades: Lobs
  /** What is buried in the ground, and what has been trodden on
   * (lib/game/mines.ts). */
  mines: Mines
  swings: Strikes
  /** The healing hands, when a pig of the medic careers holds them
   * (lib/game/healing.ts). */
  heals: Heals
  /** …and the espionage careers' theft (lib/game/pickpocket.ts). */
  pockets: Pockets
  /** …and their disguise (lib/game/hide.ts). */
  hides: Hides
  /** Pigs a blast has THROWN — every pig but the one being driven
   * (lib/game/tumble.ts). */
  tumbles: Tumbles
  /** The deaths still playing out — the dying clip, the sink, the corpse
   * blast (lib/game/corpses.ts). On the exe's own wait list: `0x47D800`, no
   * pig is still busy, and a body coming apart is busy. */
  corpses: Corpses
  effects: EffectField
  numbers: DamageNumbers
  airDrops: AirDrops
  dropIn: DropIn
  /** What being in the water costs, for every pig on the map
   * (lib/game/drowning.ts). */
  drowning: Drowning
  /** …and what the gas's bit costs the acting pig at the top of its own turn
   * (lib/game/poison.ts). */
  poison: Poison
  /** Whether this is the TRAINING ground, whose mission ends on its own
   * condition rather than on the squads (lib/game/endOfGame.ts). */
  training: boolean
  /** …and that condition: how many of the map's mission targets are still
   * standing. Every dummy the map carries, placed or not. */
  targetsLeft: () => number
  /** Called whenever the state changed this frame (a HUD refresh). */
  onChanged: () => void
  /** The stream everything the battle does is announced on, and the one it
   * hears its own weapons on (lib/game/events.ts). */
  bus: BattleBus
  /** Every roll this battle makes — the tremor's among them (lib/game/random.ts). */
  random: Random
  /**
   * Which sides the MACHINE plays (lib/game/ai.ts). Input never drives their
   * pigs and the battle answers their turns itself. Absent means nobody's —
   * a battle assembled without it is the hotseat every pure spec drives.
   */
  computer?: (side: number) => boolean
  /** …and how well it thinks here, 0..1 — the campaign ramp's dial
   * (lib/game/wits.ts). Absent is 0: the dumbest machine there is. */
  wits?: number
}

/** What the renderer reads once the frame has run. */
export interface BattleView {
  /** The acting pig's frame-by-frame state — where it is, and what it wears. */
  loco: LocomotionState
  /** Where the weapon in hand points, engine units, tremor included. */
  aimAngle: number
  /** Whether the view is down the barrel. */
  scoped: boolean
  /** Whether the aim view is up at all — a THROWN weapon gets one too, and it
   * is a camera of its own (lib/game/sights.ts, three/chase.ts). */
  sighting: boolean
  /** How far the sniper has zoomed in, 0..1. */
  zoom: number
  /** Seconds left of the getting-it-out clip — the model is not in the hand
   * until it has run (`[pig+0x2fd]`, exe 0x4702c3). */
  readying: number
  /** What the acting pig has chosen, as of this frame. */
  holding: number | null
  /** Seconds the acting pig has stood still: the name plates come back with
   * it. */
  still: number
  /** Whether the player is driving — what the camera stops holding for. */
  driving: boolean
  /** The shot in progress, or null. */
  firing: Firing | null
  /** The beat after a blow, and the spot it is watching. */
  aftermath: Aftermath | null
  /** The beat at the END of a turn, and how many pigs it is still waiting to
   * see out of the water (lib/game/walkAway.ts). Null when a turn is being
   * played. */
  walkAway: { swimming: number } | null
  /** The SERGEANT is making his end-of-turn remark, and the camera belongs to
   * the pig that earned it (lib/game/sergeant.ts). */
  sergeant: boolean
  /** The MISSION being over, and which pig the tour is on — the exe's mode 2
   * (lib/game/endOfGame.ts). Null for as long as there is a game to play. */
  ending: EndOfGame | null
  /** The building the acting pig is standing in, or null. A pig inside one is
   * NOT DRAWN — the exe's own rule (lib/game/indoors.ts). */
  inside: Building | null
  /** …and the one it could jump into from where it stands, which is what a
   * prompt would be drawn off. Null while it is already in one. */
  doorway: Building | null
}

export interface Battle {
  /** One frame. */
  update(delta: number): void
  /** Take the battle to a pig: a new turn, or a warp. */
  focus(pig: Pig): void
  view(): BattleView
  /** Whether the stage is STILL — nothing in flight, nobody swimming for the
   * shore — the gate a death waits behind before it plays out
   * (lib/game/corpses.ts). */
  stageStill(): boolean
  /** Tank controls: walk -1|0|1 (back/stop/forward), turn -1|0|1. */
  setIntent(walk: number, turn: number): void
  jump(): void
  /** Go INTO the building in reach, or come back out of the one the pig is in
   * (lib/game/indoors.ts). Its own key, not the jump's — play asked for that in
   * as many words. Does nothing when there is nothing to go into. */
  enterBuilding(): void
  /**
   * Whether the fire button is DOWN, and whether it went down THIS frame.
   *
   * Held, because the power gauge is what being held means. Everything else
   * goes off on the press — and the press arrives as its own flag rather than
   * being worked out from `held` rising, because a control set that does not
   * read the fire key reports it up while the player is holding it
   * (lib/game/controls.ts).
   */
  setFiring(held: boolean, pressed: boolean): void
  /** Point the weapon in hand: -1 down, 0 nothing, +1 up. */
  setAim(direction: number): void
  /** Whether the aim view is HELD. */
  setSighting(held: boolean): void
  /**
   * Whether the acting pig is still saying its firing LINE.
   *
   * Play: "надо ждать пока свинья договорит фразу — только потом стрелять."
   * Polled once a frame from where the voice lives, because the engine has no
   * sound — and it is the only reading the rules take from the presentation
   * layer at all. What that costs is written up in `lib/game/shot.ts`.
   */
  setSpeaking(saying: boolean): void
  /**
   * …and whether the SERGEANT is, which is what the beat between the walk away
   * and the handover holds on (lib/game/sergeant.ts). The same road and the
   * same reason as the one above.
   */
  setSargeSpeaking(saying: boolean): void
  /** How full the power gauge is, 0..1 — or null when nothing in hand charges,
   * which is what the dashboard hides it on. */
  charging(): number | null
  /** Where the weapon points, or null when it holds nothing that aims. */
  aim(): number | null
  /** The three states the CONTROL SET turns on that only the battle knows
   * (lib/game/controls.ts). */
  situation(): {
    ending: boolean
    /** The opening drop is still in the air, and answers only the chute cut. */
    dropping: boolean
    starting: boolean
    locked: boolean
    charging: boolean
    armed: boolean
    sights: boolean
    /** The machine is playing this turn: input must drive nothing
     * (lib/game/ai.ts). */
    computerTurn: boolean
  }
  /**
   * End the beat at the top of a turn: any input does — and it only OFFERS the
   * press, the way `leaveMission` does. Nothing happens for the beat's first
   * second (`TURN_START_FLOOR_SECONDS`, lib/game/game.ts): the card has to be
   * on screen long enough to read.
   */
  beginTurn(): void
  /**
   * End the beat at the END of a turn now, handing over on the spot.
   *
   * The debug path a spec takes so it does not pay a second a turn for a beat it
   * is not testing — the same reason `beginTurn` exists, and there is no player
   * input for it: a turn ending is not something the player can hurry
   * (lib/game/walkAway.ts). Nothing when no beat is running.
   */
  cutTurnBeat(): void
  /**
   * Any key, once the mission is over: put the battle away.
   *
   * The engine decides whether it counts — nothing does for the first three
   * seconds of the ending (lib/game/endOfGame.ts) — so this only ever OFFERS the
   * press, exactly as `beginTurn` offers one to the beat at the top of a turn.
   */
  leaveMission(): void
  /**
   * Say something on the battle's own bus.
   *
   * For the things a CONTROL announces rather than the game — opening the
   * inventory is one — so input has somewhere to put them without holding the
   * bus itself (lib/game/events.ts).
   */
  announce: Emit
  /**
   * Throw a pig — WHICH pig decides where the velocity goes.
   *
   * The acting one takes it on the locomotion state the battle is already driving,
   * which is the very same flight a jump gets; everybody else takes one of their
   * own (lib/game/tumble.ts). Two states over one pig would fight over its
   * position, and this is the seam that keeps there being one.
   */
  fling(pig: Pig, velocity: Velocity, ejected?: boolean, struck?: boolean): void
  /** Warp the acting pig — the debug surface the e2e suite drives through. */
  warp(x: number, z: number, heading: number): void
}

export function createBattle(parts: BattleParts): Battle {
  const { game, query, scenery, indoors, anim, shots, grenades, mines, swings, heals, pockets, hides, effects, numbers } = parts
  const { tumbles, corpses, airDrops, dropIn, drowning, poison, onChanged } = parts
  const emit = parts.bus.emit

  /** Which sides the machine plays, and the brain that plays them — the
   * GRUNT: nearest foe, close to range, do not shoot through a friend, fire
   * (lib/game/grunt.ts; the seat's shape is lib/game/ai.ts). */
  const computer = parts.computer ?? (() => false)
  const brain = createGruntBrain()
  /** …LATCHED at the turn's start (`focus`), not re-asked every frame: whose
   * hands a turn is in is decided when it is handed over, so a mid-turn flip
   * of the predicate (`pow.hotseat`) waits for the next turn. Play's call. */
  let machineTurn = computer(game.players.indexOf(game.currentPlayer))
  const computerTurn = (): boolean => machineTurn

  /** Every pig on the map, as bodies to walk into. */
  const everyone = (): Pig[] => game.players.flatMap((player) => player.pigs)

  const intent = { walk: 0, turn: 0 }
  let jumpRequested = false
  /** The DOOR key, latched the same way the jump is: it is answered inside the
   * step rather than wherever the input happened to be read (lib/game/indoors.ts). */
  let doorRequested = false
  /** The pig part-way through the getting-IN clip, or null. It is not inside yet
   * — the clip has to run first (`INOUT_CLIP`, lib/game/buildings.ts) — and until
   * it has, nothing drives it and the turn cannot end. */
  let climbing: Pig | null = null
  /** What the acting pig had chosen last frame — a change is what brings a
   * weapon out. */
  let holding: number | null = null
  /** Where the weapon points, the tremor that rides it and the sniper's zoom —
   * one thing, because they only ever move together (lib/game/sights.ts). */
  const sights = createSights(parts.random)
  /** The fire button and everything one press sets going: the gauge, the fuse
   * and which weapon answers (lib/game/attack.ts). */
  const attack = createAttack({
    shots,
    grenades,
    swings,
    heals,
    pockets,
    hides,
    mines,
    sights,
    anim,
    clips: parts.clips,
    bark: () =>
      emit({
        kind: 'bark',
        player: game.players.indexOf(game.currentPlayer),
        voice: game.currentPig.voice
      })
  })
  /**
   * The FIRE button's one write, shared by the player's verb (`setFiring`)
   * and the machine's rig below so both take the same refusal.
   *
   * **NOTHING IS FIRED FROM THE AIR.** Play: "можно во время прыжка начать
   * заряжать оружие — баг." `Pig::MayAct` refuses it outright — `[pig+0x2EC]`
   * is the pig's own mode and 5 is being airborne, the same value
   * `UpdateMovement` returns on so that a flying pig is neither walked nor
   * turned (0x467a28, 0x46b205). The whole press is dropped rather than the
   * hold alone, or a gauge already filling would loose on the way up.
   */
  const applyFiring = (held: boolean, pressed: boolean): void => {
    if (loco.airborne !== null) {
      attack.swallow()
      attack.hold(false)
      return
    }
    // The PRESS is what a gun and a blade answer to; the gauge wants the
    // whole hold, and the frame it ends.
    if (pressed) attack.press()
    attack.hold(held)
  }
  /**
   * Whether a pig HERE would be IN the water — the tile's word, overruled by
   * a DECK it could stand on. The path grid already walks bridges
   * (lib/game/pathgrid.ts asks `standOn` before the water probes), and the
   * machine's price list and hands must not veto what its own legs can do:
   * a foe mid-bridge had every melee mark round it discarded as "wet" and
   * the last pig passed its turn on the spot (play, 2026-08-28). The reach
   * is unbounded because the question is "is there ANYTHING standable
   * here", not "can these feet climb to it" — the flood prices the climb.
   */
  const swimAt = (x: number, z: number): boolean => {
    if (!query.isWater(x, z)) return false
    return (
      scenery.obstacles.standOn(x, z, query.surface(x, z), Number.POSITIVE_INFINITY) === null
    )
  }
  /** The machine's HANDS (lib/game/actuator.ts): a brain's order becomes the
   * same inputs the player's keys write, and nothing else — every read on
   * this rig is something the screen shows anyway. */
  const actuator = createActuator({
    at: () => ({
      x: game.currentPig.position.x,
      z: game.currentPig.position.z,
      heading: game.currentPig.heading
    }),
    wet: swimAt,
    swims: () => !drowns(game.currentPig.pigClass),
    aim: () => sights.angle(),
    gauge: () => attack.gauge(game.currentPig.holding),
    intent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    aimStep: sights.push,
    fire: applyFiring,
    hold(skill) {
      game.currentPig.holding = skill
    }
  })
  /** The seat's two pacing clocks (lib/game/ai.ts): how long the GET READY
   * card has hung, and how long the hands have been free since the last
   * order — both reset at every handover. */
  let cardSeconds = 0
  let mullSeconds = 0
  /** What the hands last took — a finished WALK chains straight into the
   * next corner of the route, no mull: the pause between thoughts is
   * theatre, the pause between strides of ONE plan was a stutter (play:
   * "ходил рывками"). */
  let lastOrder: Order['kind'] | null = null
  /** Whether the opening drop was still running LAST step. The FIRST turn's
   * card goes up the frame this falls (`announceTurn`); every later one goes
   * up in `handOver`. */
  let wasDropping = true
  /** The beat after a kill: the clock stops, the camera stays on the spot. */
  let aftermath: Aftermath | null = null
  /** The battle's one water memo for the machine's routes — water never
   * changes inside a battle (lib/game/pathfind.ts, `WaterMemo`). */
  const waterMemo = createWaterMemo()
  /** …and the beat at the END of a turn: the exe's mode 13, WALK AWAY. Nobody
   * is driving and anyone in the water is swimming out (lib/game/walkAway.ts). */
  let walkAway: WalkAway | null = null
  /** …and the one past that: the MISSION being over, the exe's mode 2
   * (lib/game/endOfGame.ts). Once this is set nothing ever clears it — a battle
   * that has ended has ended, and what happens next is whoever is presenting it
   * putting it away. */
  let ending: EndOfGame | null = null
  /** Whether the ending has already asked to be put away, so it asks once. */
  let ended = false
  /** Who the ending's tour has already cheered — one celebration per pig,
   * fired the frame the camera arrives (the mode-2 block). */
  const cheeredPigs = new Set<number>()
  /** A key pressed during the ending, latched for the step the way the jump is. */
  let leaveRequested = false
  /** A script step owed to something that has broken, and not run until it has
   * finished breaking. One animation at a time. */
  let pending: { id: number; y: number } | null = null
  /** The pig on its way back OUT of a building, playing the same clip going in
   * uses — it rises out of the middle while it runs (lib/game/doorway.ts) — and
   * the ROOF it is rising to, which is what it has to be given as a footing when
   * the door lets go. */
  let leaving: { pig: Pig; roof: number } | null = null
  /** …and what the door is adding to its position this frame, either way. */
  let carry: Carry | null = null
  /** The footing a pig going IN is leaving behind, kept whole for the door to
   * hand back — the glide's own end is the middle of a box and is not it. */
  let doorstep: LocomotionState | null = null

  /**
   * Pay it, once everything the break set going has stopped.
   *
   * ONE THING AT A TIME. The script's next step waits for the thing that
   * triggered it to finish — play's rule for the whole game, "ждёшь конца одной
   * анимации и включаешь другую". `effects.busy()`, not `smoke() === 0`: the
   * break effect's burst does not fire until its third frame, so counting puffs
   * said "finished" on the very frame the dummy broke.
   */
  const payScriptStep = (): void => {
    if (!pending) return
    if (swings.running() || anim.animating(game.currentPig) || effects.busy()) return
    scenery.advance(pending.id, pending.y)
    pending = null
  }
  /** Whether the weapon in hand has been USED, and so the turn is over as soon
   * as the world it disturbed goes quiet (lib/game/spend.ts). */
  let spent = false
  /**
   * …and whether a weapon has been used AT ALL this turn.
   *
   * **ONE BLOW A TURN.** Play, of the charges: "можно ставить много тнт подряд — а
   * после первого нельзя использовать оружие." It is the same rule the turn ending
   * is, seen from the side of the two skills that do NOT end it (lib/game/spend.ts):
   * a pig gets one use, and a planted charge spends it without handing the turn
   * over — the four seconds it gives back are for RUNNING, not for a second
   * charge. SKIP TURN is not a weapon and is never refused.
   */
  let struck = false
  /** Mines laid THIS TURN — the exe's saturating byte at `[game+0x534]`,
   * zeroed every handover (0x48f539): the budget the mine branch below
   * spends. */
  let minesLaid = 0
  /**
   * How many weapons have been used this turn — the exe's `[gameMode+0x334]`,
   * and the whole of what the training ground's "you did nothing" line hangs on
   * (lib/game/tutorial.ts, `WASTED_TURN_LINE`).
   *
   * Three sites, all of them the exe's: the fire dispatcher increments it
   * (0x493E7A), the handover zeroes it but only from 1 or less (0x48F50C), and
   * the line itself writes **2** — which is the one value the reset refuses, so
   * it is said once a level.
   *
   * The exe also drops the line while the sergeant is still talking
   * (`0x43BB10`), and that half is NOT here: the engine has no speech, and the
   * clock running out is a moment nobody is being spoken to anyway. The listener
   * keeps its own guard (`ui/battle.ts`); what diverges is only that the exe
   * would let a dropped line come round on a later turn.
   */
  let weaponUses = 0
  /** Seconds left of the getting-it-out clip. */
  let readying = 0
  /** Seconds the acting pig has stood still, and where it stood. */
  let still = 0
  let stillAt = { x: 0, z: 0, heading: 0 }
  /** The acting pig's frame-by-frame state. Reset whenever the acting pig
   * changes or is warped. */
  let loco: LocomotionState = createLocomotion(query, 0, 0, 0)

  /**
   * Whether the pig has COMMITTED to a blow, and so cannot be driven at all.
   *
   * Everything from the frame the FIRE button goes down to the frame the last
   * thing it threw has gone: the gauge charging, the fuse and the flight, the
   * swing itself, and anything still in the air. The exe's walk refuses from
   * the moment the button goes down until the clip is spent (0x46afd5 tests
   * both the pending flag and the animation one), and `Pig::MayAct` is false
   * through the whole of a shot (lib/game/shot.ts).
   *
   * **`sighting` is deliberately NOT in here**, and it was for one commit.
   * Going down the sights does not take control away — it hands over a
   * DIFFERENT control set, which is the exe's own branch at 0x4928dc. Play
   * named the distinction: "там должен включаться другой контрол сет;
   * выключаться должно когда выстрел нажал, не прицел."
   */
  const committed = (): boolean =>
    attack.busy() ||
    swings.running() ||
    // …and the laying-on of hands, for the length of its own clip — the same
    // hold `[pig+0x2FF]` puts on any attack animation (lib/game/healing.ts).
    heals.running() ||
    // …and the tiptoe, for its clip's own length (lib/game/pickpocket.ts).
    pockets.running() ||
    // …and the disguise's gesture, whose end is where the pig vanishes
    // (lib/game/hide.ts).
    hides.running() ||
    // THROWN, not planted: a charge lying at the pig's feet is exactly what it
    // has to be able to run away from (lib/game/lobs.ts `thrown`).
    grenades.thrown() > 0 ||
    shots.live().length > 0

  /**
   * Whether the WORLD is still doing something — what every one of the exe's
   * waits is waiting for (`0x415420`'s fifteen QUIET frames, lib/game/aftermath.ts).
   *
   * Play named the set: a projectile still in the air, damage still landing, a
   * body still coming apart, a crate still under its canopy. Whatever the battle
   * can answer for goes in here, and all three waits — the beat after a blow, the
   * beat at the end of a turn, and the turn a weapon has SPENT — ask the same
   * question, which is why it is one function and not three copies of a list.
   */
  const settling = (): boolean =>
    effects.busy() ||
    shots.live().length > 0 ||
    grenades.live() > 0 ||
    // A mine that has been trodden on and has not gone off yet: four tenths of a
    // second, and nothing may hand the turn over inside it (lib/game/mines.ts).
    mines.live() > 0 ||
    // …and a pig still in the AIR, which is what a blast leaves behind
    // (lib/game/tumble.ts). Play watched what leaving it out costs: "динамит
    // не толкает", because TNT's six-second fuse runs out inside the beat
    // that ends the turn, and a beat that does not wait for the flight hands
    // the turn on before the pig has moved a unit.
    tumbles.live() > 0 ||
    // …the ACTING pig's own flight included — it lives on `loco`, not in
    // `tumbles` (see `fling`), and a beat that could not see it ended with
    // the pig still in the air, so the sergeant and the END OF GAME both
    // began under a flying pig. Play: "матч кончается только после всех
    // анимаций — стейт машина поломана похоже".
    loco.airborne !== null ||
    // …and its GET-UP: the landing is the flight's last act (`flyOn`), and a
    // beat that could not see it cut the rise short at the handover.
    loco.getUp > 0 ||
    // …and a DEATH whose dying is actually PLAYING — the clip, the sink, the
    // boots (lib/game/corpses.ts). The exe's list asks the same (`0x47D800`,
    // no pig still busy), and it is what keeps the camera on a kill until the
    // body has finished coming apart. A RIDING corpse is deliberately NOT in
    // it: it is motionless, and counting it here held the turn's wind-down —
    // the aftermath beat, the spent turn, the WALK AWAY — hostage to a death
    // that was itself waiting for the wind-down to finish. That circle is
    // exactly why the dying used to start at the blow: the wind-down could
    // only run AFTER the death, so the death could not wait for it.
    corpses.playing() > 0 ||
    loco.airborne !== null ||
    // …and a pig part-way through climbing INTO a building: the clip runs 17
    // frames and the turn must not be handed over on top of it
    // (lib/game/buildings.ts, `INOUT_CLIP`).
    climbing !== null ||
    numbers.live() > 0 ||
    airDrops.falling() > 0

  /**
   * Whether the STAGE IS STILL — nothing left in flight, nobody swimming for
   * the shore — which is the moment a death may start PLAYING OUT
   * (lib/game/corpses.ts). Play named the beat and the exe's turn-mode table
   * agrees with the order: "сначала идёт урон, потом когда все остановились,
   * выплыли из воды — тогда только идёт анимация умирания" — mode 13 WALK
   * AWAY, mode 14 WAITING FOR ALL OBJECTS TO STOP MOVING, and only then 16
   * WATCHING DYING PIG (0x4d72b0; the state-6 arm at 0x46f4ef rides the
   * physics body until then).
   *
   * NOT `settling`: that list waits on the deaths that are PLAYING
   * (`corpses.playing()`), and a death that waited on it would deadlock the
   * beat. This is the same list LESS the deaths and the PICTURES — the smoke
   * and the floating numbers are not motion, and the exe's own hold is
   * `0x47D800`, a walk over the PIGS. The blow's own theatre — the swing,
   * the firing clip, the crate a broken thing still owes — IS in it, since
   * play's second report: with none of it counted a plain shot's stage read
   * still in the step of the hit. On top of the stillness the corpse then
   * waits out DEATH_QUIET (lib/game/corpses.ts) — the "потом секунда".
   */
  const stageStill = (): boolean =>
    shots.live().length === 0 &&
    grenades.live() === 0 &&
    mines.live() === 0 &&
    tumbles.live() === 0 &&
    loco.airborne === null &&
    climbing === null &&
    airDrops.falling() === 0 &&
    // …nor while the blow's own theatre is still on — the swing's arc, the
    // firing clip on the acting pig, a crate still owed to a broken thing.
    // Play's second report said why these belong here: a plain shot mid-turn
    // had NOTHING in the list above by the time the damage landed, so the
    // stage read still in the very step of the hit ("умирание происходит
    // сразу же после попадания").
    !swings.running() &&
    !anim.animating(game.currentPig) &&
    pending === null &&
    (walkAway === null || walkAway.swimming() === 0)

  /**
   * The acting pig's own FLIGHT, advanced wherever the frame happens to be.
   *
   * Its walk lives at the bottom of `update`, past three branches that return
   * early — the beat after a blow, the beat that ends the turn, and the turn a
   * weapon has spent — and a blast can throw the pig inside any of them. Play saw
   * both halves of that: "сначала взрыв… а потом толчёк" (the flight frozen for
   * the length of the beat, then finished afterwards) and "динамит не толкает" (a
   * charge whose fuse runs out during the end-of-turn beat, where the flight was
   * dropped outright).
   *
   * Nothing is DRIVEN here — no walk, no turn, no jump — which is the same rule
   * `tumble` follows for everybody else and the exe's own (0x46b205).
   */
  const flyOn = (delta: number): void => {
    // …and the LANDING is part of the flight. This used to return the moment
    // `airborne` cleared — but `fly()` clears it on the very frame the pig
    // touches down, leaving `getUp` (0.44 s) with nobody to burn it: outside
    // the driving frame `ground()` was never reached, so a pig flung late in
    // a turn lay in the landing pose until the handover re-dressed it (play:
    // "остаётся в позе полёта на земле, пока ход не перейдёт к другому").
    // The null intent below is exactly what `tumble.ts` feeds everybody
    // else's get-up.
    if (loco.airborne === null && loco.getUp <= 0) return
    updateLocomotion(
      loco,
      query,
      { walk: 0, turn: 0, jump: false },
      delta,
      withPigs(
        scenery.obstacles,
        everyone()
          .filter((pig) => pig !== game.currentPig && !isDead(pig))
          .map((pig) => ({ ...pig.position })),
        // …minus any body it is already inside: a flight that starts in an
        // overlap has no way out of one (lib/game/obstacles.ts).
        { x: loco.x, y: loco.y, z: loco.z }
      )
    )
    game.moveCurrentPig(loco.x, loco.y, loco.z, loco.heading)
    // The driving frame's own rule (further down `update`): a COMMITTED clip
    // — the landing's get-up — is started once and left to play out; worn as
    // a loop it never reads as finished, which both froze the pose and let
    // `settling()` hand the turn over on top of it.
    if (loco.commit) {
      if (!anim.animating(game.currentPig)) anim.playOnce(game.currentPig, loco.clip)
    } else if (!anim.animating(game.currentPig)) {
      anim.setClip(game.currentPig, loco.clip)
    }
  }

  /**
   * Finish the turn the way the exe finishes one: into the WALK AWAY beat, and
   * only out the far side of it to the next pig.
   *
   * `Game::EndTurn` (0x494430) does not advance anybody — it sets mode 13 and
   * lets that mode's own wait decide when the handover happens
   * (lib/game/walkAway.ts).
   */
  const endTurnBeat = (): void => {
    // **THE LAID MINES BECOME THE GROUND.** Play's rule ("мина взрывается
    // когда ход кончается в оригинале"): the sapper's furniture beds into
    // the tile bits now — and one bedded under somebody's feet goes off in
    // this very beat, whose wait already holds for the fuse (`settling`
    // counts `mines.live`). Before the holster, so the bang is part of the
    // turn it was laid in.
    mines.bedAll()
    // **THE WEAPON GOES AWAY WITH THE TURN.** Play's report: "оружие не
    // убирается после выстрела — винтовка (и граната) остаётся в руке до
    // следующего хода." The exe's holster proper is `Pig::HoldWeapon(0)`
    // (0x469090); WHERE its after-the-shot call sits has not been read, so
    // the moment is the turn's own end — the shot and its whole beat are
    // over by here, and nobody walks away still shouldering a rifle. The
    // event is the sound's (S_UNHOLS, audio/battle.ts).
    if (game.currentPig.holding !== null && !isDead(game.currentPig)) {
      game.currentPig.holding = null
      // …and the AIMING ARMS come down with it: the overlay is written by the
      // driving frame (see `holdingUp` below), which this beat never reaches,
      // so left alone the pig walked into the next turn still sighting.
      anim.overlay(game.currentPig, -1, 0)
      emit({ kind: 'holstered', pig: game.currentPig.id })
    }
    // Nobody is being driven from here on, so nobody is mid-stride. Play: "когда
    // таймер кончился — анимация свина не возвращается обратно в идл" — the walk
    // cycle the pig was wearing when the clock ran out played on through the whole
    // beat, because the beat only ever dressed the SWIMMERS. Before
    // `beginWalkAway`, which puts those back into their own clip on top of this.
    for (const pig of everyone()) {
      // A pig a blast threw is not standing about: its flight is still running and
      // the beat waits for it (`settling`).
      if (isDead(pig) || tumbles.has(pig)) continue
      if (pig === game.currentPig && loco.airborne !== null) continue
      // The wounded stand for the crippled here too — the hand was emptied
      // at the top of this beat, so the armed exemption cannot apply.
      // …and a body IN THE WATER wears the swim, never a stand: a blast put
      // it there mid-turn and nothing dresses it again until the shore beat
      // (play: "позу сразу в плаванье надо").
      anim.setClip(
        pig,
        inWater(query, pig.position.x, pig.position.z, pig.position.y)
          ? ANIM.SWIM
          : woundBand(pig.health) === 2
            ? ANIM.WOUNDED
            : ANIM.IDLE
      )
    }
    // **AND THE CAMERA GOES TO THE CHARGE.** Play: "камера должна перемещаться
    // на динамит - а она остаётся на свине." It goes at the END of the turn and
    // not the moment the charge is laid, because those four seconds are the
    // whole of "plant it and run" (lib/game/spend.ts) and a camera that leaves
    // the pig takes the running with it. From here nobody is driving anything,
    // the beat is already waiting for the fuse (`settling`), and what there is
    // to watch is the thing that is about to go off.
    //
    // `[CHECK — remake]`: the exe's own camera arm for a burning charge has not
    // been read. This is the aftermath camera a broken object already uses.
    const burning = grenades.all().find((one) => isPlanted(one.skill) && !one.doused)
    if (burning) aftermath = beginAftermath({ x: burning.x, y: burning.y, z: burning.z })
    walkAway = beginWalkAway({
      pigs: everyone,
      query,
      soaked: drowning.soaked,
      wear: (pig, clip) => anim.setClip(pig, clip),
      emit
    })
    jumpRequested = false
    attack.swallow()
  }

  /**
   * Who the ending's camera may look at: alive, and not shut inside a building —
   * the exe skips exactly those two (`[pig+0x2EC]` of 1 or 8, 0x490F46), and a
   * pig in a shelter is not drawn at all (lib/game/indoors.ts).
   */
  const watchable = (): number[] =>
    everyone()
      .filter((pig) => !isDead(pig) && !indoors.inside(pig))
      .map((pig) => pig.id)

  /**
   * **THE HANDOVER, and the one place a mission can END.**
   *
   * `Game::NextTurn` (0x48F490) asks 0x4966A0 for the state of the game before it
   * advances anybody, and on anything but "carry on" it goes to mode 2 instead of
   * to the next pig (lib/game/endOfGame.ts). Play: "убить последний манекен — не
   * заканчивает миссию… очевидно что заканчивает миссию."
   *
   * Asking it HERE rather than the moment the last dummy falls is the original's
   * own timing and it is what gives the blow room: the dummy comes apart, its
   * crate lands, the beat at the end of the turn runs, and only then does anyone
   * notice there is nothing left to knock down.
   */
  /**
   * **THE CARD GOES UP** — the exe's mode 4 entry (0x4911e0), run once a turn,
   * and the moment two different noises hang off (audio/battleSound.ts).
   *
   * Not a poll on `game.starting`: the beat can be cut before any step reads
   * it — a spec's own door does exactly that (`cutTurnStart`) — and a turn
   * whose card was never seen would go by in silence. So it is announced where
   * the turn actually STARTS, and there are two such places: the handover, and
   * the frame the opening drop lands.
   */
  const announceTurn = (): void => {
    emit({
      kind: 'turnBegan',
      player: game.players.indexOf(game.currentPlayer),
      // The exe splits on whose CONTROLLER the pig has (`cmp eax,2` at
      // 0x4724e5), and this is that split: whoever is not on the keyboard.
      computer: computerTurn(),
      health: game.currentPig.health,
      voice: game.currentPig.voice
    })
    // …and the SERGEANT's own remark on the top of a turn (0x497F80): the goad
    // when the enemy is behind, the challenge when they are ahead, one turn in
    // four. It holds nothing up — unlike the end-of-turn remark there is no
    // state 13 here, the line simply plays over the card.
    //
    // **Only over OUR turn.** `[play]` — he is the player's sergeant, and the
    // exe's own moment (the top of the enemy's) had him talking to the machine.
    // The words turn over with the moment, in lib/game/sergeant.ts.
    const goad = sargeAtTurnStart(!computerTurn(), standing(), parts.random, sargeLines)
    if (goad) emit({ kind: 'sergeant', section: goad.section, line: goad.line })
  }

  /**
   * The acting side's WIN OR LOSE value — its total health against every other
   * side's (lib/game/sergeant.ts, 0x498620). Both of the sergeant's moments
   * turn on it, and it is the ACTING side's in each: the exe takes
   * `[turn+0x4fc]`'s own total and compares that one to the rest.
   */
  const standing = (): number => {
    const health = game.players.map((player) =>
      player.pigs.reduce((sum, pig) => sum + Math.max(0, pig.health), 0)
    )
    const mine = game.players.indexOf(game.currentPlayer)
    return winOrLose(health[mine] ?? 0, health.filter((_, side) => side !== mine))
  }

  /**
   * Open the sergeant's beat, or answer false for a turn he sits out.
   *
   * **The remark is gated on the SCORE as well as on the kill** and that is the
   * arm, not a taste (0x4983CD): well done for killing only while your side
   * leads on total health, bad luck for losing one only while it trails. A kill
   * from behind is met with silence.
   *
   * The tally is cleared here rather than at the handover because the exe
   * clears it at the START of a turn (0x48FD92) — same moment, and doing it
   * here keeps the two reads of it, this one and the clear, side by side.
   */
  const beginSarge = (): boolean => {
    const said = sargeAfterTurn(tally, standing(), sargeLines)
    tally = noTally()
    if (!said) return false
    // **He speaks to the PLAYER and to nobody else** — `[play]`, the same rule
    // that moved the turn-start goad. This remark reads the ACTING side's own
    // tally, so on the machine's turn it congratulated the enemy for killing
    // one of ours. The tally above is still cleared, because that happens at
    // every turn's start whoever took it (0x48FD92).
    if (computerTurn()) return false
    sarge = { floor: SARGE_FLOOR }
    // The camera comes off the blow and back to the pig that made it — which is
    // what `focus` would do at the handover anyway, only the remark happens
    // first and wants to be watched.
    aftermath = null
    const acting = game.currentPig
    const cheer = said.section === SARGE_WON ? ANIM.CHEERED : ANIM.SLUMPED
    anim.playOnce(acting, cheer[parts.random() < 0.5 ? 0 : 1])
    emit({ kind: 'sergeant', section: said.section, line: said.line })
    return true
  }

  const handOver = (): void => {
    // Side 0 is OURS — the campaign's own, which `spawnTeams` orders first off
    // the map's player bit — and the verdict tells it apart from the rest the
    // way the exe's two counters do (lib/game/endOfGame.ts).
    const sidesUp = game.players.map((player) => player.pigs.some((pig) => !isDead(pig)))
    const othersUp = sidesUp.filter((up, side) => up && side > 0).length
    // The turn's weapon count starts over — from 1 or less, because 2 is what
    // the wasted-turn line writes and it must survive the handover (0x48F50C).
    if (parts.training && weaponUses <= 1) weaponUses = 0
    const outcome = outcomeOf(parts.training, sidesUp[0] === true, othersUp, parts.targetsLeft())
    if (outcome !== 'playing') {
      // The turn that has just been played is the count the closer is picked by —
      // the exe's `[gameMode+0x40C]`, which its own `NextPlayer` has just
      // incremented (lib/game/tutorial.ts).
      ending = beginEndOfGame(outcome === 'won', watchable())
      // The spot a spent turn's camera was left on (see the aftermath block):
      // the tour owns the camera from here, and only `focus` would otherwise
      // clear it — which a battle that is over never reaches.
      aftermath = null
      emit({ kind: 'missionOver', won: outcome === 'won', turns: game.turn })
      return
    }
    game.endTurn()
    focus(game.currentPig)
    // **THE DISGUISE DROPS AT THE TOP OF THE PIG'S OWN TURN** — the same
    // per-turn pass the poison rides (0x470425 in 0x4703A0): a round of
    // cover, no more (lib/game/hide.ts).
    hides.turnStarted(game.currentPig)
    // **THE POISON BITES AT THE TOP OF THE PIG'S OWN TURN** — the exe's
    // per-turn pass (0x4703A0, lib/game/poison.ts): ten points, before the
    // card, so the health the announcement reads is the health the turn
    // starts on. Under eleven it dies right here — and a dead acting pig is
    // already what ends a turn (the ranOut test below), which is the FAQ's
    // own wording: a poisoned pig under ten dies the moment it takes its turn.
    poison.turnStarted(game.currentPig)
    announceTurn()
  }

  // The battle LISTENS to its own weapons for the two things that stop a turn.
  // A blow does not decide that a turn ends; the OBJECT breaking does, which is
  // where the exe hangs it too (0x48d750), and every weapon simply announces.
  /**
   * WHAT THIS TURN DID, by side — the exe's `[0x537F14]` and `[0x537F18]`,
   * which six separate death sites all step and which are cleared at the START
   * of every turn (0x48FD92). It is what the sergeant's end-of-turn remark is
   * decided by (lib/game/sergeant.ts).
   *
   * A pig that kills its OWN counts for both, because the exe steps the second
   * tally unconditionally after comparing the sides.
   */
  let tally = noTally()
  /** The sergeant's own rotation, one counter a section — the exe steps its
   * byte after the call and wraps past eight (0x498402), so the lines come
   * round in order rather than at random. */
  const sargeLines = new Map<number, number>()
  /**
   * The beat the sergeant's remark holds, between the WALK AWAY and the
   * handover — the exe's state 13 (0x4978CD), which it stays in until the wav
   * is done (0x491192) with a floor of 125 ms under it (0x490CBD).
   *
   * The camera is on the ACTING pig for it: `0x49EC20` takes the current
   * squad's own pig as its subject, which is the one that took the shot, and
   * `0x49F740(3, 1)` is a mode of its own — not the turn's 4.
   */
  let sarge: { floor: number } | null = null
  /** Whether the SERGEANT is still talking — the scene's poll, the same road
   * the firing bark's takes (contracts/sound.ts). */
  let sargeSpeaking = false
  /** Seconds the BOOTS still hold the end-of-turn beat — set by `remains`,
   * play's own second (see the handler below). */
  let bootsFor = 0
  const BOOTS_SECONDS = 1

  parts.bus.on(
    handling({
      killed: ({ pig }) => {
        const dead = everyone().find((one) => one.id === pig)
        if (!dead) return
        if (game.currentPlayer.pigs.includes(dead)) tally.losses++
        else tally.kills++
      },
      // **A BLOW ON THE ACTING PIG ENDS ITS TURN — the mine's answer.**
      // Play asked whether treading on one closes the turn ("вроде в оригинале
      // да"), and the tread path does not: it makes a projectile and clears the
      // tile, and no handover is anywhere in it. The rule is one level down, in
      // `Pig::TakeDamage` itself — 0x467c56 reads the routine's second argument
      // a second time and, when it is **0** and the pig being hurt is the one
      // being played, calls `Game::EndTurn` (0x494430). Every weapon path passes
      // 0; a status tick, a hard landing and a drowning pass something else,
      // which is what `blow` on the event carries (lib/game/events.ts). So the
      // mine ends the turn through the BLAST it sets off, not through the foot
      // that found it — and so does a pig's own grenade at its own trotters.
      //
      // Health does not come into it: the arm sits above the death checks and
      // one point is enough. It is a `spent` like a weapon's, cashed on the
      // quiet below, so the blast plays out and the pig is thrown before the
      // turn goes. One half of the exe's arm is NOT modelled and is written up
      // rather than guessed at: on the TRAINING GROUND the floor at one point
      // hands the turn on whatever the cause was (0x467c76).
      damaged: ({ pig, blow }) => {
        if (blow && pig !== undefined && pig === game.currentPig.id) spent = true
      },
      // THE BOOTS GET THEIR SECOND. The walk-away beat holds while a corpse
      // is playing out and could end the very frame the boots land — which
      // yanked the camera to the shooter for the sergeant's praise with the
      // boots barely on the ground. Play: "после смерти - ещё секунду видны
      // сапоги - а не сразу возвращается к стрелявшему." `[play]` — the exe's
      // own pacing here is not read.
      remains: () => {
        bootsFor = BOOTS_SECONDS
      },
      // A promotion point off the ground is worth a word from him — the one
      // category whose lines name a drop point (lib/game/sergeant.ts).
      promotionPoint: () => {
        const said = sargeOnPoint(sargeLines)
        emit({ kind: 'sergeant', section: said.section, line: said.line })
      },
      broke: ({ target, at }) => {
        // A different effect from the hit, and the one play remembers as smoke.
        effects.broke(at)
        scenery.remove(target)
        // The turn stops here and the camera stays on the spot. What comes
        // next — a crate under a canopy, most of the time — is watched from the
        // same wait (lib/game/aftermath.ts).
        aftermath = beginAftermath(at)
        // …and its own command, which is the last thing the exe's break handler
        // does (0x48d972). This is what drops the next crate in — but NOT YET:
        // the dummy has to finish coming apart before the crate starts coming
        // down, which is how the whole game is paced.
        pending = { id: target, y: at.y }
      },
      // Stay on the spot for the beat the blow's own wait gives it, which is
      // what makes the burst visible at all: the camera leaves the grenade the
      // frame it stops existing.
      blasted: ({ at }) => {
        if (!aftermath) aftermath = beginAftermath(at)
      },
      // …and a BULLET earns the same beat wherever it ended — a body, the
      // ground, a box. The exe's wait runs after every weapon use, not only
      // the ones that break something (`turns/aftermath.md`); without this a
      // rifle shot snapped straight back to the shooter, and play named it:
      // "выстрел должен держать камеру после попадания".
      shotLanded: ({ at }) => {
        if (!aftermath) aftermath = beginAftermath(at)
      },
      // **WATCHING DYING PIG — the exe's mode 16.** The dying clip starting
      // (lib/game/corpses.ts, the state 6 → 7 edge) is the frame the exe's
      // 0x497760 re-points the camera at whoever was hurt, and the beat to
      // show it in already exists: `settling()` counts the corpses, so the
      // aftermath cannot end under the death — it was just aimed at where
      // the SHOT landed instead of where the body lies. Re-point it, or
      // begin one for a death no blow announced (a drowning). The body may
      // go on moving — the sink — so the per-frame mirror below
      // (`corpses.watching()`, beside the crate's) keeps following it.
      dying: ({ pig }) => {
        const body = everyone().find((one) => one.id === pig)?.position
        if (!body) return
        if (aftermath) watchAftermath(aftermath, body)
        else aftermath = beginAftermath(body)
      }
    })
  )

  /**
   * A fresh locomotion state for wherever this pig ACTUALLY is.
   *
   * WHERE THE PIG ALREADY IS, and not just where the ground under it is: a turn
   * that starts on a bridge starts on the DECK. The pig's own y plus the objects
   * is what settles that (lib/game/locomotion.ts `Footing`) — the squad is not in
   * it, because a pig is never something to stand on.
   *
   * Two things need it now: a turn beginning, and a pig stepping back out of a
   * shelter onto the spot it jumped from.
   */
  const footingAt = (pig: Pig): LocomotionState =>
    createLocomotion(query, pig.position.x, pig.position.z, pig.heading, {
      y: pig.position.y,
      obstruction: scenery.obstacles
    })

  const focus = (pig: Pig): void => {
    loco = footingAt(pig)
    // A climb belongs to the pig that started it, and `settling` waits on this —
    // so a turn handed over on top of one (a pig killed mid-clip) must not leave
    // it set, or nothing ever ends again.
    climbing = null
    // …and so does a door half-opened: the glide belongs to the pig that started
    // it (lib/game/doorway.ts).
    leaving = null
    carry = null
    doorstep = null
    holding = pig.holding
    sights.rearm(pig.holding)
    readying = 0
    // A charge belongs to the pig that started it: a turn handed over mid-hold
    // must not throw for whoever comes next.
    attack.reset()
    aftermath = null
    pending = null
    spent = false
    struck = false
    minesLaid = 0
    sights.setHeld(false)
    swings.reset()
    heals.reset()
    pockets.reset(game.currentPig)
    hides.reset(game.currentPig)
    // A turn is a fresh start for the machine too (lib/game/ai.ts) — and the
    // moment its SEAT is decided (`machineTurn` above). The hands let go of
    // whatever they were doing and still every control they hold.
    brain.reset()
    actuator.reset()
    cardSeconds = 0
    mullSeconds = 0
    lastOrder = null
    machineTurn = computer(game.players.indexOf(game.currentPlayer))
    emit({ kind: 'cameraReset' })
  }

  const update = (delta: number): void => {
    // The level's opening drop stops everything else: no turn clock, no
    // walking, because the original's parachute branch does nothing else
    // either. The ONE thing it does answer is the jump key, which cuts the
    // canopies away — so `jumpRequested` is spent here rather than saved up
    // for the first frame of the turn.
    if (dropIn.update(delta, jumpRequested)) {
      jumpRequested = false
      attack.swallow()
      onChanged()
      return
    }
    // …and the frame it lands is the frame the FIRST turn's card goes up. Every
    // later one is announced by the handover; this one has no handover behind
    // it, and the drop is what has been holding it off.
    if (wasDropping) {
      wasDropping = false
      announceTurn()
    }

    // **THE MISSION IS OVER**, and this beat is the last thing the battle does:
    // the exe's mode 2, END OF GAME (lib/game/endOfGame.ts). The clock does not
    // run, nothing is driven, and the camera walks the survivors one every two
    // seconds until a key — or twenty — puts the battle away.
    if (ending) {
      jumpRequested = false
      doorRequested = false
      attack.swallow()
      // The LAST death's blast may have thrown the acting pig — the flight
      // owns its position for as long as it lasts, tour or no tour. Everyone
      // else's air is `tumbles`, which the engine steps regardless; the
      // acting pig's lives on `loco` and only `flyOn` moves it. Without this
      // the velocity was written and never read: the pig that killed the
      // last enemy point-blank stood still through its own knockback (play,
      // 2026-08-28).
      flyOn(delta)
      // **THE HANDS ARE EMPTY AND THE TOUR CHEERS.** Play, in two rounds:
      // first "при выигрыше остаётся оружие в руках свина, он не танцует" —
      // then "должно идти по свинам и каждого показывать как он радуется".
      // The exe's mode 2 arm plays no clip and touches no weapon (0x490E7E
      // is a camera, a countdown and the way out), so the staging is the
      // remake's own: the pig the camera ARRIVES at plays one of the three
      // real celebration clips ONCE (41..43, lib/game/locomotion.ts —
      // rotated so neighbours differ), everyone else stands easy, and a
      // loss stands everyone easy throughout.
      for (const pig of everyone()) {
        if (isDead(pig) || indoors.inside(pig)) continue
        // A pig still IN THE AIR is not re-dressed — the same guard the
        // other two whole-squad dressing loops carry. The flight clip is
        // announced ONCE, at launch (lib/game/tumble.ts emits on change),
        // so one IDLE stamp here held for the whole arc and the thrown pig
        // flew in its standing pose (play: "летел в режиме стояния будто").
        if (tumbles.has(pig)) continue
        if (pig === game.currentPig && loco.airborne !== null) continue
        pig.holding = null
        // …and the AIMING POSE goes with the weapon. Play: "анимация победы
        // играется в позе вытащенного оружия — все оружия надо убрать у всех
        // свинов." The pose is the second animation channel (lib/game/anim.ts),
        // so putting the dance on the first one leaves the arms where the rifle
        // was until this clears it.
        anim.overlay(pig, -1, 0)
        if (ending.won && pig.id === ending.watching && !cheeredPigs.has(pig.id)) {
          cheeredPigs.add(pig.id)
          anim.playOnce(pig, ANIM.CELEBRATIONS[cheeredPigs.size % ANIM.CELEBRATIONS.length])
        } else if (!anim.animating(pig)) {
          // A cheer plays OUT — setClip every frame would wipe it (the
          // idle loop's own rule, further down).
          anim.setClip(pig, ANIM.IDLE)
        }
      }
      holding = null
      const leave = leaveRequested
      leaveRequested = false
      // Everything still running runs on: the engine steps it after this call,
      // which is what lets the last crate finish coming down behind the tour.
      if (advanceEndOfGame(ending, delta, watchable(), leave) && !ended) {
        ended = true
        emit({ kind: 'missionEnded' })
      }
      onChanged()
      return
    }

    // Nobody left standing: the battle stops where it is rather than handing
    // a turn to a squad that cannot take one (lib/game/game.ts). The ending
    // above is what a battle normally reaches instead; this is what is left if
    // a squad is emptied some way that never hands a turn over.
    if (game.over) {
      onChanged()
      return
    }

    // WATER, before any of the branches below: it is the tail of the exe's own
    // per-pig ground update and that runs in every mode, so a pig goes on
    // drowning through the beat at the top of a turn and through the beat after
    // a blow alike (lib/game/drowning.ts). Every pig on the map, not just the
    // one being driven — and the one being driven pays twice, except in the
    // beat at the end of a turn, which is the exe's own exemption.
    drowning.update(delta, {
      acting: game.currentPig,
      walkAway: walkAway !== null,
      aloft: loco.airborne !== null
    })

    // **THE SCRIPT STEP IS OWED BY THE BATTLE, not by the beat that happened to
    // be running.** It used to be paid inside the `aftermath` branch alone, and
    // that is where the training ground stopped dead: TNT's fuse outlasts the
    // four seconds planting hands back, so the DOOR breaks inside the beat at the
    // END of the turn — which returns three branches above this one and never
    // reaches it — and then `focus` cleared the debt on the handover. Play:
    // "когда взрываю дверь — должна базука падать - щас нет." The crate the whole
    // rest of the tutorial waits on was being dropped on the floor.
    //
    // The exe owes no wait at all — `Object::RunScript` is the last thing the
    // break handler does (0x48d972). The wait is the remake's own pacing, so it
    // stays; what it must not do is depend on which mode the game is in.
    payScriptStep()

    // The boots' second runs down in EVERY mode, not only under the beat it
    // holds — a death long before the turn's end has spent its second by the
    // time the walk-away asks.
    bootsFor = Math.max(0, bootsFor - delta)

    // The ACTING pig's last ground contact, charged if it qualifies — a
    // flying arrival over the gate costs its flat four (lib/game/falling.ts).
    // Here, before the branches, so it runs whichever beat stepped the
    // flight: the contact sits on `loco` from last frame's fly and is
    // cleared by the charge (or by the next locomotion frame).
    chargeLanding(game.currentPig, loco, parts.training, emit)

    // The beat at the END of a turn: mode 13, WALK AWAY. Nobody is driving, the
    // clock does not run, and everyone still in the water makes for the nearest
    // shore (lib/game/walkAway.ts). It holds until they are all out and the
    // world has been quiet for a second.
    if (walkAway) {
      jumpRequested = false
      attack.swallow()
      // Everything that runs on its own runs on: the engine's step advances all
      // of it after this call (lib/game/engine.ts). All this beat does is watch.
      // …and it holds for an unpaid script step too, so the turn cannot be handed
      // over on top of one. `focus` clears the debt, which is right for a warp and
      // fatal here.
      // A corpse holds this beat WHOLE — riding or playing — where `settling`
      // deliberately counts only the playing ones. The riding corpse must not
      // block the beat from STARTING (that was the deadlock, see `settling`),
      // but once the beat runs it may not END under one either: the corpse's
      // own DEATH_QUIET and this beat's quiet are the same second counted
      // from the same stillness, and a beat that could finish first would
      // hand the turn over in the very step the dying was due to start.
      // …and the BOOTS hold it one second past the corpse (`remains` above):
      // the beat must not end — and the sergeant must not take the camera —
      // in the very frame they landed.
      const done = walkAway.update(
        delta,
        settling() || pending !== null || corpses.live() > 0 || bootsFor > 0
      )
      // A pig thrown by the charge it planted is still in the air, and the beat is
      // waiting for it (`settling`). Its flight owns its position for as long as it
      // lasts; the walk home is what the beat does with pigs on the ground.
      flyOn(delta)
      // The beat moves pigs itself and the one whose turn it was is one of them,
      // so the state the scene draws THAT one out of has to follow it.
      if (loco.airborne === null) {
        loco.x = game.currentPig.position.x
        loco.y = game.currentPig.position.y
        loco.z = game.currentPig.position.z
        loco.heading = game.currentPig.heading
      }
      // The same careful test the driven pig uses: a deck over water is not
      // water (lib/game/locomotion.ts).
      loco.swimming = inWater(query, loco.x, loco.z, loco.y)
      if (done) {
        walkAway = null
        if (!beginSarge()) handOver()
      }
      onChanged()
      return
    }

    // **THE SERGEANT'S REMARK.** The turn is over, nobody is driving, and the
    // camera is back on the pig that took the shot while he says his piece.
    if (sarge) {
      jumpRequested = false
      attack.swallow()
      // A pig the last blow threw is still in the air — its flight owns its
      // position for as long as it lasts, remark or no remark (the same
      // rule the walk-away beat holds above).
      flyOn(delta)
      sarge.floor = Math.max(0, sarge.floor - delta)
      if (sarge.floor <= 0 && !sargeSpeaking) {
        sarge = null
        handOver()
      }
      onChanged()
      return
    }

    // The turn clock runs regardless of what anyone does — except that it does
    // not start at once: `tick` burns the beat at the top of the turn first. A
    // pig that FELL this turn ends it the same way the clock does — the exe
    // hands the turn on from inside the damage itself (0x467d4f).
    //
    // The clock stops for the whole of a blow: from the moment the button goes
    // down, through the swing or the flight, and on through the beat that shows
    // what it did. Play's rule, and `Pig::MayAct` agrees. …and it starts at the
    // CHARGE, not at the throw: "при начинании зарядки броска таймер
    // останавливается — так как это уже атака началась."
    // A PLANTED charge is not in it: the four seconds the turn hands back are
    // seconds the CLOCK has to spend, or the pig would stand next to the thing
    // for ever (lib/game/spend.ts).
    const blowInProgress =
      attack.busy() ||
      aftermath !== null ||
      swings.running() ||
      grenades.thrown() > 0
    const wasLeft = game.timeLeft
    const ranOut = !blowInProgress && game.tick(delta)
    // **THE CLOCK STARTING TO RUN OUT** — S_CLOCK is what the ear placed it
    // as, and nothing had ever asked for it (docs/todo.md P2). Announced on
    // the CROSSING, once a turn: the clock only runs down, and a turn that
    // begins already inside the window (a hurried one, lib/game/spend.ts)
    // still gets it, because the beat at the top holds the clock above the
    // mark until it starts.
    if (wasLeft > CLOCK_WARNING && game.timeLeft <= CLOCK_WARNING && game.timeLeft > 0) {
      emit({ kind: 'clockLow', secondsLeft: game.timeLeft })
    }
    if (!blowInProgress && (ranOut || isDead(game.currentPig))) {
      // **THE TURN NOBODY DID ANYTHING WITH.** The exe says a line about it, in
      // this exact block and on this exact condition (0x4900A2): the clock ran
      // out — not a pig dying, not a turn spent — and the weapon count is still
      // at nought. Writing 2 is what makes it once a level.
      if (ranOut && parts.training && weaponUses === 0) {
        weaponUses = 2
        emit({ kind: 'turnWasted' })
      }
      // …and the turn does not hand over on the spot. `Game::EndTurn` goes into
      // mode 13 first — the beat above, which the next step runs.
      endTurnBeat()
      onChanged()
      return
    }

    const acting = game.currentPig

    // **THE COMPUTER'S TURN.** The machine plays this side, so nothing the
    // player holds is read past here — input is muted at the source too
    // (input/battleInput.ts). The brain is asked what it wants only while
    // the hands are FREE — think when idle, so an order is thought about
    // once, not sixty times a second — and the actuator then works the order
    // into the same inputs the player's keys write. **NO RETURN**: the
    // driving code below carries those inputs out exactly as it would a
    // player's, so every clamp and speed holds, the pass is SKIP TURN fired
    // like any skill (`attack.begin` answers 'skip' and the one road through
    // `endTurnBeat` stays one road), and the THINKING pose is the ordinary
    // skill-in-hand rule further down. If the brain ever stalls, the clock
    // above still runs the turn out.
    if (computerTurn()) {
      if (game.starting) {
        // The card is read out by the SEAT, not decided by the brain —
        // pacing is theatre (lib/game/ai.ts). `beginTurn` only OFFERS the
        // press, same as a player's key.
        if ((cardSeconds += delta) >= AI_START_SECONDS) game.beginTurn()
      } else if (!actuator.idle()) {
        actuator.step(delta)
        mullSeconds = 0
      } else if (spent && grenades.thrown() === 0) {
        // **THE WEAPON HAS SPENT THE TURN: the seat is DONE.** Without this
        // the mull ran on through the blow's own beat and the brain started
        // a plan it could never finish — telemetry caught NOBBY, throw
        // detonated, deciding `turnTo` a second later and spinning on the
        // spot until the handover ("крутился на месте"). The one exception
        // is a THROWN grenade still live: the fire key is the detonator and
        // the decision to press it is still owed.
        mullSeconds = 0
      } else if (
        (mullSeconds += delta) >=
        (grenades.thrown() > 0
          ? AI_FUSE_SECONDS
          : // A route is ONE plan: a walk that ended well chains into the
            // next corner with no mull at all (see `lastOrder`).
            lastOrder === 'walkTo' && actuator.outcome() === 'done'
            ? 0
            : AI_MULL_SECONDS)
      ) {
        // Hands free and the mulling beat spent: one decision, and the
        // hands take it up the same step. The world handed over is the
        // brain's whole view — read-only copies, nothing live (docs/ai.md).
        const AI_LOG = typeof process !== 'undefined' && process.env?.AI_LOG === '1'
        const actingSide = game.players.indexOf(game.currentPlayer)
        const seen = (
          pig: Pig
        ): { x: number; y: number; z: number; health: number; id: number; name: string } => ({
          x: pig.position.x,
          y: pig.position.y,
          z: pig.position.z,
          health: pig.health,
          // WHICH pig — what a turn's plan is held on (lib/game/plan.ts):
          // a plan about a SPOT quietly transfers to whoever walks onto it.
          id: pig.id,
          // For the telemetry line alone — the brain never reads a name
          // (lib/game/ai.ts, `Seen`).
          name: pig.name
        })
        // How the LAST order ended, read once: the brain's cue and the
        // telemetry's story must be the same reading.
        const previous = actuator.outcome()
        const refusal = actuator.refusal()
        /** Where the acting pig stands, feet and all — the start of every
         * route and of the turn's one flood. */
        const here = (): { x: number; z: number; y: number } => ({
          x: acting.position.x,
          z: acting.position.z,
          y: acting.position.y
        })
        /**
         * What the searches ask of the world (lib/game/pathgrid.ts): the
         * props are both the walls and the WALKWAYS — a bridge deck is
         * stood on the way the walk stands on it — and `swims` is the pig's
         * CLASS (lib/game/drowning.ts), so a swimmer's route may cross
         * water, priced at the swim's own slowness, where a grunt's never
         * does.
         *
         * **THE SQUAD IS IN IT.** Play watched what leaving it out costs:
         * "он не обходит свина, а толкается в него". Only OUR OWN pigs,
         * though — a foe is what the walk is aimed AT, and a body you mean
         * to reach cannot be a wall — and the actuator's `blocked` still
         * guards the difference between the plan and the ground truth.
         */
        const ground = (): RouteAsk => ({
          ground: query,
          obstruction: scenery.obstacles,
          swims: !drowns(acting.pigClass),
          // The battle's one water memo: the probes that made the turn's
          // first decision a 130 ms hitch run once a cell per BATTLE now
          // (lib/game/pathgrid.ts, WaterMemo).
          water: waterMemo,
          bodies: game.currentPlayer.pigs
            .filter((pig) => pig !== acting && !isDead(pig))
            .map((pig) => ({ x: pig.position.x, z: pig.position.z }))
        })
        const decided = brain.decide({
            timeLeft: game.timeLeft,
            // …and how long a whole turn is here, so the price list can cost
            // a walk in TURNS rather than in an opinion (evaluate.ts).
            turnSeconds: game.turnSeconds,
            wits: parts.wits ?? 0,
            // The battle's one stream: the brain's misjudgment rolls from
            // it, so lockstep stays lockstep (lib/game/grunt.ts, MISJUDGE).
            roll: parts.random,
            previous,
            acting: {
              x: acting.position.x,
              y: acting.position.y,
              z: acting.position.z,
              heading: acting.heading,
              aim: sights.angle(),
              health: acting.health,
              maxHealth: maxHealthFor(acting.pigClass),
              holding: acting.holding,
              carrying: acting.carrying.map((slot) => ({ ...slot }))
            },
            foes: game.players.flatMap((player, side) =>
              side === actingSide
                ? []
                : // A DISGUISED pig is not on the list at all — the exe's
                  // `Team::BuildTargetList` skips the hidden flag before
                  // anything is priced (lib/game/hide.ts).
                  player.pigs.filter((pig) => !isDead(pig) && !pig.hidden).map(seen)
            ),
            friends: game.currentPlayer.pigs
              .filter((pig) => pig !== acting && !isDead(pig))
              .map(seen),
            // The route round the world (lib/game/pathfind.ts): the props
            // are both the walls and the WALKWAYS — a bridge deck is stood
            // on the way the walk stands on it. The squad is not in the
            // plan: pigs move between the plan and the walk, and the
            // actuator's `blocked` guards that difference. `swims` is the
            // pig's CLASS (lib/game/drowning.ts): a swimmer's route may
            // cross water — priced at the swim's own slowness, so only
            // when crossing is QUICKER than walking round — a grunt's
            // never does.
            route: (to) => route(ground(), here(), to),
            // …and THE GROUND FLOODED ONCE (lib/game/pathfind.ts): the
            // turn's plan asks a ring of firing marks round every target
            // what the legs pay to reach it, and one flood answers all of
            // them (lib/game/plan.ts). Fifteen A* searches a turn is what
            // the `[perf]` frames were.
            reach: (budget) => flood(ground(), here(), budget),
            // What a dry-run throw lands against: over water that is the
            // SURFACE, not the seabed under it — the engine douses a lob at
            // the waterline (lib/game/grenade.ts), and a dry run that flew
            // on to the basin floor once priced an 8700-unit "arc" off a
            // clifftop and threw grenades into the bay every turn for a
            // simulated hour (the machine-mission stall guard caught it).
            groundAt: (x, z) => (query.isWater(x, z) ? query.surface(x, z) : query.height(x, z)),
            wet: swimAt,
            swimming: loco.swimming,
            swims: !drowns(acting.pigClass),
            // The machine's own live grenade: the newest lob while any
            // THROWN one is live — planted charges are not it, and must
            // never be detonated from beside (lib/game/lobs.ts).
            thrown: (() => {
              if (grenades.thrown() === 0) return null
              const head = grenades.head()
              return head === null
                ? null
                : {
                    x: head.x,
                    z: head.z,
                    resting: head.resting,
                    // How fast it still moves: the brain's own "it is down"
                    // bar (lib/game/grunt.ts, SETTLED) — the draw flag's bar
                    // is so low a missed throw rolled until its fuse blew it
                    // (telemetry, GINGER 2026-08-24).
                    speed: Math.hypot(head.vx, head.vy, head.vz),
                    age: head.age,
                    // The blast's outer edge — what the dumbest detonation
                    // window is as wide as (lib/game/grunt.ts).
                    rim: blastRange(lobOf(head.skill) ?? lobOf(SKILL.GRENADE)!)
                  }
            })(),
            // …and a PLANTED one: live but not thrown — the newest lob is it,
            // because planting is the only other way a lob gets made.
            planted: (() => {
              if (grenades.live() <= grenades.thrown()) return null
              const head = grenades.head()
              return head === null ? null : { x: head.x, z: head.z }
            })(),
            crates: scenery
              .remaining()
              .filter((one) => one.kind === 'crate')
              .map((one) => ({ x: one.x, z: one.z, skill: one.skill, amount: one.amount }))
          })
        // THE DECISION, ANNOUNCED — telemetry first, the same road `flung`
        // took (lib/game/events.ts): the session log is what a "he's acting
        // stupid" report gets settled against. Nothing in the engine listens.
        emit({
          kind: 'aiDecided',
          pig: acting.id,
          name: acting.name,
          at: { ...acting.position },
          heading: acting.heading,
          health: acting.health,
          previous,
          refusal,
          order: decided,
          thought: brain.explain?.() ?? null
        })
        if (AI_LOG) {
          console.log(
            `[ai] ${acting.name} @${Math.round(acting.position.x)},${Math.round(acting.position.z)} y=${Math.round(acting.position.y)} h=${acting.heading.toFixed(2)} hp=${acting.health} prev=${previous}${refusal ? `(${refusal})` : ''} -> ${JSON.stringify(decided)}`
          )
        }
        actuator.take(decided)
        lastOrder = decided.kind
        // …and the mull starts OVER: without this an instant order (watch,
        // hold) left the counter full and the brain re-decided every frame —
        // 904 decisions in a 185-second battle, measured before the reset.
        mullSeconds = 0
        actuator.step(delta)
      }
    }

    // "START OF TURN - press any key to continue": the pig stands, and nothing
    // here ends the beat. ENDING it belongs to the input layer, and to one
    // place in it: `starting` is a control SET whose whole rule is that any
    // press ends the turn's beat and is then read again in the set that
    // follows (input/battleInput.ts, which polls ahead of this every frame).
    if (game.starting) {
      anim.setClip(acting, ANIM.IDLE)
      anim.overlay(acting, -1, 0)
      onChanged()
      return
    }
    for (const pig of everyone()) {
      if (pig === acting) continue
      // A body that has fallen stays fallen: its dying clip was played once
      // and clamped, and standing it back up is exactly what this loop would
      // otherwise do every frame.
      if (isDead(pig)) continue
      // …and neither does a pig IN THE AIR stand. Play: "отбрасывание не
      // запускает анимацию полёта. падение не запускает анимацию подьёма после
      // полёта" — both were this line: `tumble` puts the bounce clip on and then
      // this loop took it straight back off, once a frame, for the whole flight
      // and through the get-up as well (lib/game/tumble.ts).
      if (tumbles.has(pig)) continue
      // A CRIPPLED bystander stands in the wounded stance — the idle
      // picker's own health test (0x472040 test 8, ≤ 10 points), and nobody
      // but the acting pig has a weapon drawn to override it.
      // A bystander IN THE WATER swims instead of standing on it: a blast
      // threw it there this turn, and this loop used to stamp the stand back
      // on every frame until the end-of-turn beat (play: "он сначала стоит
      // долю секунды - затем плывёт").
      anim.setClip(
        pig,
        inWater(query, pig.position.x, pig.position.z, pig.position.y)
          ? ANIM.SWIM
          : woundBand(pig.health) === 2
            ? ANIM.WOUNDED
            : ANIM.IDLE
      )
      // Only the pig being driven holds its weapon up; the rest stand.
      anim.overlay(pig, -1, 0)
    }

    // …but nothing is answered at all while the blow is being shown. The jump
    // key is the exception, and it is the same exception the level's opening
    // drop makes: it cuts the canopy and brings the crate down now.
    if (aftermath) {
      if (jumpRequested) {
        airDrops.cut()
        emit({ kind: 'canopiesCut' })
      }
      jumpRequested = false
      // **AND SO IS THE HAND-DETONATOR, for the same reason the ONE BLOW A TURN
      // guard makes room for it below: setting off what is already in the air is
      // the end of the first blow rather than a second one.** Play, of the
      // cluster: "разлётные сами только могут взорваться по времени." The five
      // bomblets are born INSIDE this beat — the canister's own burst is what
      // opens it — and `settling()` counts them, so the wait cannot end while
      // they fly and this line ate every press until the last fuse had run out
      // on its own. The gate is `thrown()`, not the beat: a press with nothing
      // live is still swallowed, which is what the beat is for.
      // `e2e/002/cluster.spec.ts` fails on the old line.
      if (grenades.thrown() > 0) attack.begin(acting, holding)
      else attack.swallow()
      // The world keeps going — the crate has to reach the ground for the wait
      // to end, and the smoke off the thing that broke is what is being
      // watched.
      effects.update(delta)
      shots.update(delta)
      grenades.update(delta)
      airDrops.update(delta)
      numbers.update(delta)
      // …AND THE BLOW ITSELF. The wait used to freeze the pig and put IDLE on
      // it on the very frame the blow connected, which cut off the animation it
      // was gating everything else on: a bayonet strikes on frames 11-14 of a
      // 36-frame clip. The pig plays out what it was doing INSIDE the wait —
      // that is what the wait is for.
      swings.update(delta, acting)
      // …and if the blow THREW it, the flight is one of the things it plays out.
      // Frozen here, a pig hung in the air for the length of the beat and only
      // then moved, which is what play watched: "сначала взрыв… а потом толчёк."
      flyOn(delta)
      // The shot that caused all this ends here rather than a frame late.
      attack.settled()
      // …and the step it owes, now that everything it was waiting on has had
      // this frame (`payScriptStep` is also called before the branches, for the
      // beats that never get here).
      payScriptStep()
      // The world, plus the three things only this wait knows about: the script
      // step it owes, the blow's own animation, and the pig playing it out. A pig
      // swimming for the shore is on the exe's list too and is not modelled —
      // nothing knocks one into the water yet.
      const held = pending !== null || swings.running() || anim.animating(acting) || settling()
      if (advanceAftermath(aftermath, delta, held)) {
        // **THE CAMERA NEVER GOES BACK TO THE SHOOTER.** The exe's wait exits
        // straight into WALK AWAY (0x495316 → 0x494570), and play remembers no
        // return: "возврата к свинье в оригинале вообще нет". So when the
        // weapon SPENT the turn, the spot stays the camera's through the beat
        // at the end of it — the aftermath is left standing for the view and
        // the next pig's `focus` is what clears it. Only a blow that did NOT
        // end the turn (a mine trodden mid-walk, a training break) hands the
        // camera back, because the same pig is about to be driven again.
        if (!spent) {
          aftermath = null
          emit({ kind: 'cameraReset' })
        }
      } else {
        // Follow the crate down; a spot with nothing coming stays the spot.
        const crate = airDrops.watching()
        if (crate) watchAftermath(aftermath, crate)
        // …and a body through its death: a wet one SINKS while its clip
        // plays, and mode 16 watches the pig, not the spot it was on.
        const body = corpses.watching()
        if (body) watchAftermath(aftermath, body)
        // Standing about is only what a pig does once it has finished. Asking
        // for a clip is what CANCELS a committed one, so this line
        // unconditionally was the interruption.
        // …unless it is in the AIR, where the flight owns what it wears.
        if (!swings.swinging() && !anim.animating(acting) && loco.airborne === null) {
          // …and the ACTING pig knocked into the water inside this very wait
          // swims through it: stamping IDLE stood it on the surface for the
          // whole beat (the landing set `loco.swimming`, lib/game/locomotion.ts).
          anim.setClip(acting, loco.swimming ? ANIM.SWIM : ANIM.IDLE)
        }
        onChanged()
        return
      }
    }

    // **AND USING A WEAPON HAS ENDED THE TURN.** Play: "использование оружия
    // заканчивает ход — у нас нет."
    //
    // Not on the press — on the QUIET after it. The exe reaches mode 13 through
    // the same wait the beat after a blow is (0x495316 -> 0x494570 -> WALK AWAY),
    // so the bullet flies, the swing plays out, the dummy comes apart and the
    // crate lands first; this sits below the aftermath block because that beat is
    // part of the wait rather than something that happens after it.
    //
    // `anim.animating` is the pig's own half of it — the exe asks the same thing
    // (`0x47D800`, no pig still busy) — so a bayonet's 36-frame swing is finished
    // before the turn is taken away.
    if (spent && !committed() && !anim.animating(acting) && !settling()) {
      endTurnBeat()
      onChanged()
      return
    }

    // **THE DOOR OF A BUILDING, on its own key.**
    //
    // Play: "бомбоубежище не работает — нельзя залезть внутрь", then "свин должен
    // запрыгивать внутрь", and then the correction that matters here — "я не
    // говорил по пробелу; сделай отдельную кнопку, пробел уже прыжок." So the
    // door is `enterBuilding` and the jump key is untouched by any of it: a pig
    // standing against a shelter can still hop.
    //
    // It is answered before the walk, because a pig INSIDE is not driven at all —
    // it is not drawn, its whole turn is standing there, and the two things it
    // can do are skip the turn and come back out.
    // **AND THE CLIP CARRIES HIM.** Play: "свин прыгает на месте — должен прыгать
    // в центр строения и выпрыгивать из центра строения наверх." Read, and it is
    // one mechanism in two directions (`lib/game/doorway.ts`): the arm sets a
    // fixed per-frame step at `[pig+0x210..0x214]` and the pig's own update adds
    // it to the body's position every frame (0x46e1a1). Going IN, all three axes
    // step from where he stands to the building's own transform (0x46a032,
    // 0x46a08c, 0x46a0e4). Coming OUT, **x and z are written as zero**
    // (0x46a150, 0x46a15e) and only the vertical is stepped — so he leaves
    // through the top and nowhere else.
    // **ONE DOOR AT A TIME.** Play: "запрыгивание и выпрыгивание из бункера не
    // блокирует ввод — можно спамить." A clip that carries the pig is an
    // animation nobody may walk out of, the same rule the lay clip has
    // (`attack.busy()`): while a climb or a leap is running, the key does
    // nothing at all.
    if (climbing !== null || leaving !== null || carry !== null) doorRequested = false
    if (doorRequested) {
      doorRequested = false
      const within = indoors.inside(acting)
      if (within) {
        // OUT: he is put back on the picture at the building's own middle and
        // rises out of it while the clip runs. `leave` hands back the footing he
        // walked in on, which is not where he is going — but it is what the
        // battle rebuilds from if the glide is cut short.
        indoors.leave(acting)
        loco = doorwayStart(within, footingAt(acting))
        carry = carryOut(within, loco, clipSeconds(parts.clips[INOUT_CLIP]))
        leaving = { pig: acting, roof: within.box.top }
        anim.playOnce(acting, INOUT_CLIP)
        onChanged()
        return
      }
      // …and IN the other way round: the climb first, and he goes in when it has
      // run. `climbing` is what holds him to it — the same rule a lay clip has
      // (`attack.busy()`), and the same reason: an animation nobody may walk out
      // of. The footing he LEFT is kept whole, because that is what the door has
      // to hand back (lib/game/indoors.ts).
      const doorway = indoors.reachable(acting)
      if (doorway) {
        climbing = acting
        doorstep = copyLocomotion(loco)
        carry = carryIn(doorway, loco, clipSeconds(parts.clips[INOUT_CLIP]))
        anim.playOnce(acting, INOUT_CLIP)
        onChanged()
        return
      }
    }
    // …and the climb finishing is what puts him inside. Asked before anything is
    // driven, so the frame he lands in is the frame he is gone.
    if (climbing === acting && !anim.animating(acting)) {
      climbing = null
      carry = null
      // …and the footing he climbed FROM goes in with him, to be handed back at
      // the door — not the one the glide ended on, which is the middle of a box.
      indoors.enter(acting, doorstep ?? loco)
      doorstep = null
      onChanged()
      return
    }
    // …and the leap OUT finishing hands him back to the world FALLING, which is
    // what the exe leaves behind: it stops stepping the position and the physics
    // has him.
    //
    // Not `footingAt`. That asks where he RESTS, and a pig hanging over a roof
    // rests nowhere — `standOn` finds nothing within reach above the box and the
    // fallback is the ground, so the door ended by teleporting him down through
    // the shelter. Play: "выпрыгивание не работает — проваливаюсь обратно сквозь
    // крышу." The footing is built at the ROOF, so the step-up envelope is
    // measured from the thing he is about to land on rather than from the ground
    // 352 below it, and then a still velocity lets the ordinary landing put him
    // on it.
    if (leaving?.pig === acting && !anim.animating(acting)) {
      const { roof } = leaving
      leaving = null
      carry = null
      loco = createLocomotion(query, loco.x, loco.z, loco.heading, {
        y: roof,
        obstruction: scenery.obstacles
      })
      // ON the roof plane, not wherever the glide's last frame left him. The two
      // clocks end a frame apart — the door block asks `anim` before the carry is
      // advanced — and a few units SHORT is the whole difference between standing
      // on the box and being inside it: `standOn` counts nothing above the feet,
      // so six units under the top is no support at all and he fell straight
      // through. Measured: the rise ended at −1562 against a top of −1568.
      loco.y = roof
      loco.airborne = { vx: 0, vy: 0, vz: 0, bouncing: false, pushIn: null }
      onChanged()
      return
    }
    // ONE BLOW A TURN: a pig that has already used a weapon answers the fire key
    // with nothing at all. Everything that ENDS the turn takes care of itself —
    // the beat is running by then and swallows the press anyway — so this is here
    // for the charges, which keep the turn and must not be planted twice.
    //
    // **Except while something it THREW is still live.** Play: "ты сломал взрывание
    // гранаты — больше нельзя нажать F чтобы подорвать по желанию." Right: the
    // hand-detonator lives inside `attack.begin`, so swallowing the press took the
    // grenade's own second use with it. Setting off what is already in the air is
    // not a second blow — it is the end of the first one.
    // …and neither is a HEAL: the hands are not a blow (they never set `struck`
    // below), and a pig that HAS struck — a charge planted, say — may still lay
    // them on inside the same turn. A MINE needs no exemption: the FIRST lay
    // does not set `struck` at all, and the SECOND sets it deliberately —
    // that is the "нельзя больше ничего использовать" half of its budget.
    if (
      struck &&
      acting.holding !== SKILL.SKIP_TURN &&
      acting.holding !== SKILL.HEALING_HANDS &&
      // A pocket picked is not a blow either — the exe's record keeps the
      // turn whole (lib/game/pickpocket.ts).
      acting.holding !== SKILL.PICK_POCKET &&
      grenades.thrown() === 0
    ) {
      attack.swallow()
    }

    // What the fire button set going — the whole of it, including WHICH weapon
    // answers (lib/game/attack.ts). SKIP TURN is the one answer this frame has
    // to act on itself, because ending a turn is the battle's business.
    const answered = attack.begin(acting, holding)
    if (answered === 'skip') {
      emit({ kind: 'skillUsed' })
      // Through the same beat the clock running out goes through: a skipped turn
      // is still a turn ending.
      endTurnBeat()
      onChanged()
      return
    }
    // …and a weapon that WENT OFF spends the turn, unless it is one of the
    // thirteen that do not — the planted explosives and the skills that are not
    // blows (lib/game/spend.ts). Asked of the PIG rather than of the cached
    // `holding`, which is only synced further down the frame and is a frame stale
    // here.
    if (answered === 'used') {
      // HEALING HANDS is the one use that is not a BLOW: the turn is not spent
      // (lib/game/spend.ts), and it does not take the turn's one strike either —
      // heal, walk on, and the rifle still answers. What it cannot do twice is
      // covered by its own bookkeeping: the charge only goes on a heal that
      // LANDED (lib/game/healing.ts). A MINE spends no strike either — its
      // budget below closes the hand itself, on the second lay.
      if (
        acting.holding !== SKILL.HEALING_HANDS &&
        acting.holding !== SKILL.PICK_POCKET &&
        !isMine(acting.holding)
      )
        struck = true
      // The exe counts it here too — this is the arm its own fire dispatcher
      // increments `[gameMode+0x334]` from (0x493E7A).
      weaponUses++
      if (endsTurn(acting.holding)) spent = true
      // A MINE has a BUDGET instead of a bill, and the numbers are PLAY's
      // (lib/game/spend.ts): the FIRST lay of a turn is free and the clock
      // runs on; the SECOND squeezes the clock to five seconds and closes
      // the hand — `struck` from here, so nothing else is used this turn
      // ("вторая мина уже не бесплатна - остаётся 5 секунд и нельзя больше
      // ничего использовать").
      else if (isMine(acting.holding)) {
        minesLaid++
        if (minesLaid >= 2) {
          game.hurryTurn(MINE_HURRY_SECONDS)
          struck = true
        }
      }
      // A PLANTED charge keeps the turn and takes the clock down to four seconds
      // instead: enough to get clear of the thing, and not enough to do anything
      // else with. TNT's own fuse is nearer six, so it goes off in the beat the
      // turn ends through (lib/game/walkAway.ts waits for it).
      else if (hurryFor(acting.holding) > 0) game.hurryTurn(hurryFor(acting.holding))
    }

    // **COMMITTED takes the whole of input, and it starts at the FIRE press.**
    // Play: "после нажатия стрелять должно отключаться полностью управление — а
    // не только прыжок, вообще всё."
    if (committed()) {
      jumpRequested = false
      sights.push(0)
    }
    // …and a pig INSIDE a building is not driven at all: not the walk, not the
    // turn, and the jump above has already been spent on the door. The exe
    // switches its body off outright (`[body+0x44] |= 1`). The FIRE key still
    // reaches it, because SKIP TURN is the whole of what a shelter offers and it
    // is used like any other skill.
    // Nobody DRIVES through a door: in, out, or already inside.
    const sheltered =
      indoors.inside(acting) !== null || climbing === acting || leaving?.pig === acting
    const walking = committed() || sheltered ? 0 : intent.walk
    const turning = committed() || sheltered ? 0 : intent.turn
    // The SIGHTS are a different control set, not a locked one. The one thing
    // the aim view does take away is the JUMP: the exe routes input through its
    // own branch while the aim bit is down (0x4928dc).
    if (sights.scoped(holding)) jumpRequested = false

    // Down the sights the turn drives the SCOPE, and the tremor's other axis
    // turns the pig — both come back out of the sights as one number, so the
    // camera, the model and the shot read it off the heading and cannot
    // disagree (lib/game/sights.ts).
    const scoping = sights.scoped(holding) && attack.firing() === null
    const swung = sights.turnStep({
      holding,
      committed: committed(),
      firing: attack.firing() !== null,
      turning,
      delta
    })

    loco.x = acting.position.x
    loco.z = acting.position.z
    loco.heading = acting.heading + aimRadians(swung)
    // The WOUND rides the drive: the stride, the run cycle and the unarmed
    // stand all key on it (lib/game/locomotion.ts, WOUND_SPEED). Written
    // every frame because a mine can move the band mid-walk.
    loco.wounded = woundBand(acting.health)
    loco.armed = holding !== null
    updateLocomotion(
      loco,
      query,
      { walk: walking, turn: scoping ? 0 : turning, jump: sheltered ? false : jumpRequested },
      delta,
      // The squad is in the way too: every pig but the acting one, as the body
      // its own spawn marker measured (lib/game/obstacles).
      withPigs(
        scenery.obstacles,
        everyone()
          .filter((pig) => pig !== acting)
          .map((pig) => ({ ...pig.position })),
        { x: loco.x, y: loco.y, z: loco.z }
      )
    )
    jumpRequested = false
    // …and the DOOR overrules all of it. The exe adds its own step to the body's
    // position every frame the clip runs (0x46e1a1), after the movement update
    // and regardless of what the ground said, which is what carries the pig into
    // the middle and back up out of it (lib/game/doorway.ts).
    if (carry && !advanceCarry(carry, loco, delta)) carry = null
    // **IN THE WATER THE WEAPON GOES AWAY.** Play: "в воде оружие убирается пока
    // не вылезешь — у нас нет." Play's rule and NOT a reading: the holster proper
    // is `Pig::HoldWeapon(0)` (0x469090, whose refusal prints "Forced holstering
    // cos pig not in normal mode"), and none of its nine callers tests the water
    // — nor does `Pig::MayAct`, nor anything else on the weapon path, which has
    // no `IsInWater` call in it at all. So this is where play's word stands in
    // for a read that came up empty.
    //
    // It is not put BACK: swimming out leaves the pig empty-handed and choosing
    // again is the player's business, which is what "пока не вылезешь" asks for.
    // A blow already in flight is left alone — clearing the hand mid-shot would
    // strand the sequence that is holding the turn open.
    //
    // A WEAPON, and only a weapon: SKIP TURN and its neighbours go in the hands
    // the same way but are not something a pig could drop in the water, and
    // taking one away mid-swim would leave the turn unendable.
    const armed = ['melee', 'gun', 'lob', 'charge'].includes(weaponLayer(acting.holding))
    if (loco.swimming && armed && !committed()) acting.holding = null
    // A pig going THROUGH a door is not being driven and is still MOVING: the
    // clip carries it, so its position follows `loco` for the whole of the glide.
    // Only one that is actually inside stops — it is not on the map at all then.
    if (indoors.inside(acting) === null) {
      game.moveCurrentPig(loco.x, loco.y, loco.z, loco.heading)
    }
    // Walking INTO a crate is how one is collected; there is no button — and a
    // pig standing in a shelter is not walking into anything.
    if (!sheltered) scenery.collect(acting)

    // …and walking onto a MINE is how one is found. Every pig, not just the one
    // being driven — the exe asks it in the per-pig ground update — and only with
    // its feet DOWN: the tile under a pig in the air is not the tile it is
    // standing on (`[pig+0x382]`, lib/game/mines.ts). The trigger is one-shot, so
    // standing on the spot is safe once it has gone off, and the noise is the
    // whole warning the player gets.
    for (const pig of everyone()) {
      if (isDead(pig)) continue
      if (pig === acting && loco.airborne !== null) continue
      // …nor does one standing INSIDE a building, which is where the exe's own
      // `[pig+0x382]` (feet down) would say the same thing.
      if (indoors.inside(pig)) continue
      // …nor does a pig a blast has THROWN find one in mid-air: the tile under a
      // flying pig is not the tile it is standing on (lib/game/tumble.ts).
      if (tumbles.has(pig)) continue
      if (mines.tread(pig.position.x, pig.position.z)) {
        emit({ kind: 'mineTripped', at: { ...pig.position } })
      }
    }

    // The swing, after the pig has been placed: the blade's own points come off
    // the HAND bone, so where the pig is standing has to be settled first. It
    // may put the weapon away on the way out — the last bayonet.
    swings.update(delta, acting)
    // …and the heal's clip running out, which may put the hands away the same
    // way (lib/game/healing.ts).
    heals.update(delta, acting)
    // …and the tiptoe's, whose end is where the steal lands
    // (lib/game/pickpocket.ts).
    pockets.update(delta, acting)
    // …and the disguise's, whose end is where the pig becomes the bush
    // (lib/game/hide.ts).
    hides.update(delta, acting)

    // The gauge and the fuse, after the pig has been placed for the same reason
    // a swing is: the muzzle comes off the HAND bone (lib/game/attack.ts).
    attack.update(delta, acting, holding)
    // …and the sequence is over when there is nothing left in the air. The
    // camera comes back off the bullet by TELEPORTING behind the pig rather
    // than flying home from wherever it ended up.
    if (attack.settled()) emit({ kind: 'cameraReset' })

    // The weapon in hand, and where it points. Choosing one out of the menu is
    // what starts it: the exe plays the getting-it-out clip and only puts the
    // model in the hand once that has run (`Pig::ReadyWeapon` 0x469090).
    const weapon = weaponOf(acting.holding)
    if (acting.holding !== holding) {
      holding = acting.holding
      // A weapon comes up pointing where its own record says: a rifle level, a
      // grenade already lobbing at 45°.
      sights.rearm(holding)
      readying = weapon.readyClip > 0 ? clipSeconds(parts.clips[weapon.readyClip]) : 0
      if (readying > 0) anim.playOnce(acting, weapon.readyClip)
    }
    readying = Math.max(0, readying - delta)

    // The aim, the tremor and the zoom, at the END of the frame — so a shot
    // fired above left along the angle the player last saw (lib/game/sights.ts).
    sights.advance({
      holding,
      committed: committed(),
      firing: attack.firing() !== null,
      turning,
      delta
    })

    // A committed clip — the jump's crouch, a landing's get-up — is started
    // once and left to play out; anything else is simply worn. Getting a weapon
    // out is a commitment of the same kind, and holds the pig until it is done.
    if (readying > 0) {
      // The getting-it-out clip has the pig to itself.
    } else if (swings.swinging()) {
      // …and so does the swing. `Pig::Attack` puts its clip on the PRIMARY
      // channel and clears the weapon one (0x46971a).
    } else if (loco.commit) {
      if (!anim.animating(acting)) anim.playOnce(acting, loco.clip)
    } else if (anim.animating(acting) && loco.clip === ANIM.IDLE) {
      // **A ONCE-CLIP PLAYS OUT — while the pig is STANDING.** Play, of the charge
      // going down: "ТНТ ставится на землю — с анимацией", and there was none:
      // `setClip` below replaces a committed clip the very next frame, so every
      // weapon's attack clip was being wiped one frame after `playOnce` started it.
      // The swing was the only survivor, because `swings.swinging()` holds it a
      // branch earlier — which is why nothing had noticed.
      //
      // And the STANDING half is the exe's own rule rather than a hedge: the
      // animation picker (0x467ec0) reads the speed band and asks 0x472320 for a
      // gait, and that request zeroes the committed clip outright — so a pig that
      // lands on the run does not get up, and a pig left alone does
      // (`animations/notes.md`). A driven pig's gait wins; nothing else does.
    } else if (holding === SKILL.SKIP_TURN && loco.clip === ANIM.IDLE) {
      // A pig with SKIP TURN in hand stands there THINKING about it — clip 46,
      // which play named. It replaces the IDLE only.
      anim.setClip(acting, ANIM.THINKING)
    } else {
      anim.setClip(acting, loco.clip)
    }

    // And over the top of it, the arms: the weapon's aiming clip held at the
    // frame its angle points at. A SECOND channel, not a replacement.
    const holdingUp =
      readying === 0 && !swings.swinging() && loco.airborne === null && scrubsPose(holding)
    anim.overlay(acting, holdingUp ? weapon.aimClip : -1, aimPhase(sights.angle()))

    // How long the pig has done nothing: what brings its name plate back.
    // Being driven, being in the air or being pushed all count as moving.
    const busy =
      intent.walk !== 0 ||
      intent.turn !== 0 ||
      loco.airborne !== null ||
      Math.hypot(loco.x - stillAt.x, loco.z - stillAt.z) > 1 ||
      Math.abs(loco.heading - stillAt.heading) > 1e-3
    still = busy ? 0 : still + delta
    stillAt = { x: loco.x, z: loco.z, heading: loco.heading }

    onChanged()
  }

  return {
    update,
    focus,
    stageStill,
    view: () => ({
      loco,
      aimAngle: sights.angle(),
      scoped: sights.scoped(holding) && !dropIn.running(),
      sighting: sights.sighting(holding) && !dropIn.running(),
      zoom: sights.zoom(),
      readying,
      holding,
      still,
      driving: intent.walk !== 0 || intent.turn !== 0,
      firing: attack.firing(),
      aftermath,
      walkAway: walkAway === null ? null : { swimming: walkAway.swimming() },
      // The sergeant's beat, so the scene can hold the camera on the pig he is
      // talking about rather than snapping to the next turn's.
      sergeant: sarge !== null,
      ending,
      inside: indoors.inside(game.currentPig),
      doorway: indoors.reachable(game.currentPig)
    }),
    setIntent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    jump() {
      jumpRequested = true
    },
    enterBuilding() {
      doorRequested = true
    },
    setFiring(held, pressed) {
      // **NOTHING IS FIRED FROM THE AIR.** Play: "можно во время прыжка начать
      // заряжать оружие — баг." `Pig::MayAct` refuses it outright — `[pig+0x2EC]`
      // is the pig's own mode and 5 is being airborne, the same value
      // `UpdateMovement` returns on so that a flying pig is neither walked nor
      // turned (0x467a28, 0x46b205). The whole press is dropped rather than the
      // hold alone, or a gauge already filling would loose on the way up.
      if (loco.airborne !== null) {
        attack.swallow()
        attack.hold(false)
        return
      }
      // The PRESS is what a gun and a blade answer to; the gauge wants the
      // whole hold, and the frame it ends.
      if (pressed) attack.press()
      attack.hold(held)
    },
    setAim: sights.push,
    setSighting: sights.setHeld,
    setSpeaking: attack.setSpeaking,
    setSargeSpeaking(saying) {
      sargeSpeaking = saying
    },
    charging: () => attack.gauge(game.currentPig.holding),
    aim: () => (weaponOf(holding).aims ? sights.angle() : null),
    situation: () => ({
      // Over everything: a mission that has ended has ended.
      ending: ending !== null,
      // …and under that, the opening DROP, which answers one key and no other
      // (lib/game/controls.ts). It is above `starting` because the beat's own
      // clock does not run while the squad is in the air.
      dropping: dropIn.running(),
      starting: game.starting,
      // A gauge filling is its OWN control set rather than a hole in the lock,
      // which is what it was for a commit and what play corrected.
      charging: attack.charging(),
      // Something is still LIVE, and a second press of fire sets it off where
      // it lies — "пока граната летит, не могу взорвать её."
      armed: grenades.thrown() > 0,
      // …and the beat at the END of a turn takes control away too: mode 13 is
      // not a mode anybody drives in (lib/game/walkAway.ts). So does a turn a
      // weapon has SPENT: the blow is over, the handover has not happened yet,
      // and those few frames are not a last chance to walk (lib/game/spend.ts).
      // …and so does a DOOR: the clip carries the pig through it and nothing may
      // be driven, chosen or fired while it runs. Play found the hole by spamming
      // the key — "запрыгивание и выпрыгивание не блокирует ввод".
      locked:
        committed() ||
        spent ||
        aftermath !== null ||
        walkAway !== null ||
        sarge !== null ||
        climbing !== null ||
        leaving !== null ||
        carry !== null,
      sights: layerSights(weaponLayer(game.currentPig.holding)) && !dropIn.running(),
      // The machine is playing: the input layer reads this and drives nothing
      // (input/battleInput.ts). ESCAPE still pauses — it never reaches the
      // rules to begin with.
      computerTurn: computerTurn()
    }),
    beginTurn: () => game.beginTurn(),
    cutTurnBeat() {
      if (walkAway === null) return
      walkAway = null
      // The same handover the beat's own end runs, mission check and all: a spec
      // that skips the beat must not skip the ending with it.
      handOver()
    },
    leaveMission() {
      leaveRequested = true
    },
    announce: emit,
    fling(pig, velocity, ejected = false, struck = false) {
      emit({
        kind: 'flung',
        pig: pig.id,
        at: { x: pig.position.x, y: pig.position.y, z: pig.position.z },
        vx: velocity.vx,
        vy: velocity.vy,
        vz: velocity.vz
      })
      if (pig !== game.currentPig) {
        tumbles.fling(pig, velocity, ejected, struck)
        return
      }
      // The acting pig's flight is `loco`'s, and `bouncing` is what tells the
      // clip chain it was thrown rather than jumped (lib/game/locomotion.ts);
      // `struck` starts it already touched, the bullet's own knockdown clip.
      const { vx, vy, vz } = velocity
      // `hurled` — a thrown body is FLYING and the ground can hurt it on
      // arrival, the acting pig no less than anyone (lib/game/falling.ts).
      loco.airborne = {
        vx,
        vy,
        vz,
        bouncing: true,
        pushIn: null,
        ejected,
        touched: struck,
        hurled: true
      }
      loco.getUp = 0
    },
    warp(x, z, heading) {
      swings.reset()
      heals.reset()
      pockets.reset(game.currentPig)
      hides.reset(game.currentPig)
      effects.clear()
      loco = createLocomotion(query, x, z, heading)
      game.moveCurrentPig(x, loco.y, z, heading)
    }
  }
}
