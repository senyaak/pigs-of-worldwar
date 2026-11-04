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
//
// The frame's phases each have a module under `battle/`, sharing one core
// (`battle/core.ts`) and one state (`battle/state.ts`); this file is their
// ORDER, and the battle's face to the rest of the game.

import type { Aftermath } from './aftermath'
import type { AirDrops } from './airDrop'
import type { Anim } from './anim'
import { aftermathBeat, payScriptStep } from './battle/aftermathBeat'
import { createCore } from './battle/core'
import { doorBeat } from './battle/doors'
import { dressActing, dressBystanders, startingBeat } from './battle/dress'
import { countStill, drivePig } from './battle/driving'
import { endingBeat } from './battle/ending'
import { fireButton } from './battle/firing'
import { fling } from './battle/flight'
import { focus, handOver, openingDrop } from './battle/handover'
import { advanceHands } from './battle/hands'
import { listen } from './battle/listeners'
import { machineStep } from './battle/machine'
import { sargeBeat } from './battle/sargeBeat'
import { clockBeat, spentBeat, walkAwayBeat } from './battle/turnEnd'
import { situationOf, viewOf } from './battle/view'
import { stageStill } from './battle/waits'
import type { BrainPort } from './brainPort'
import type { Bullets } from './bullets'
import type { ClipTiming } from './clips'
import type { Corpses } from './corpses'
import type { DamageNumbers } from './damage'
import type { DropIn } from './dropIn'
import type { Drowning } from './drowning'
import type { EffectField } from './effectField'
import type { EndOfGame } from './endOfGame'
import type { BattleBus, Emit } from './events'
import { chargeLanding } from './falling'
import type { Game, Pig } from './game'
import type { Heals } from './healing'
import type { Hides } from './hide'
import type { Building, Indoors } from './indoors'
import type { Lobs } from './lobs'
import { createLocomotion } from './locomotion'
import type { LocomotionState } from './locomotion'
import type { Mines } from './mines'
import type { Pockets } from './pickpocket'
import type { Poison } from './poison'
import type { Reaction } from './reaction'
import type { Random } from './random'
import type { Scenery } from './scenery'
import type { Firing } from './shot'
import type { Strikes } from './strikes'
import type { Sacrifice } from './suicide'
import type { TerrainQuery } from './terrain'
import type { Tumbles, Velocity } from './tumble'
import { weaponOf } from './weapons'

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
  /** …and the last resort the engineer and sniper careers carry
   * (lib/game/suicide.ts). */
  sacrifice: Sacrifice
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
  /** …and what a pig does about having been hurt, when the turn has played out
   * (lib/game/reaction.ts). */
  reaction: Reaction
  /** Whether this is the TRAINING ground, whose mission ends on its own
   * condition rather than on the squads (lib/game/endOfGame.ts). */
  training: boolean
  /** Whether this is the PROVING ground, whose rules are its own (lib/game/provingGround.ts). */
  proving: boolean
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
  /** WHERE the brain thinks (lib/game/brainPort.ts). Left out, one is seated
   * that thinks on the step it is asked. */
  brain?: BrainPort
  /** The seed for the brain's OWN stream — not the battle's (see the engine,
   * `BRAIN_SEED_SALT`). */
  brainSeed?: number
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
  /**
   * Whether this pig is OFF THE GROUND — for anybody but the acting one that is
   * `tumbles.has`, and for the acting one it is the flight the battle drives
   * itself. One question, one answer, because a caller that has to know which
   * kind of pig it is holding will get it wrong (lib/game/tumble.ts, `barge`).
   */
  aloft(pig: Pig): boolean
  /** Warp the acting pig — the debug surface the e2e suite drives through. */
  warp(x: number, z: number, heading: number): void
}

export function createBattle(parts: BattleParts): Battle {
  const core = createCore(parts)
  const {
    game,
    query,
    swings,
    heals,
    pockets,
    hides,
    sacrifice,
    effects,
    tumbles,
    drowning,
    onChanged,
    emit,
    computerTurn,
    intent,
    sights,
    attack,
    state
  } = core
  listen(core)

  /**
   * ONE FRAME, in order. Every phase is a module of its own under `battle/`;
   * one that answers true has the frame to itself, and nothing after it runs.
   */
  const frame = (delta: number): void => {
    // The level's opening drop, and the first turn's card the frame it lands.
    if (openingDrop(core, delta)) return
    // The mission over: the tour of the survivors (mode 2).
    if (endingBeat(core, delta)) return
    // Nobody left standing: the battle stops where it is rather than handing
    // a turn to a squad that cannot take one (lib/game/game.ts). The ending
    // above is what a battle normally reaches instead; this is what is left if
    // a squad is emptied some way that never hands a turn over.
    if (game.over) return

    // WATER, before any of the branches below: it is the tail of the exe's own
    // per-pig ground update and that runs in every mode, so a pig goes on
    // drowning through the beat at the top of a turn and through the beat after
    // a blow alike (lib/game/drowning.ts). Every pig on the map, not just the
    // one being driven — and the one being driven pays twice, except in the
    // beat at the end of a turn, which is the exe's own exemption.
    drowning.update(delta, {
      acting: game.currentPig,
      walkAway: state.walkAway !== null,
      aloft: state.loco.airborne !== null
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
    payScriptStep(core)

    // The boots' second runs down in EVERY mode, not only under the beat it
    // holds — a death long before the turn's end has spent its second by the
    // time the walk-away asks.
    state.bootsFor = Math.max(0, state.bootsFor - delta)

    // The ACTING pig's last ground contact, charged if it qualifies — a
    // flying arrival over the gate costs its flat four (lib/game/falling.ts).
    // Here, before the branches, so it runs whichever beat stepped the
    // flight: the contact sits on `loco` from last frame's fly and is
    // cleared by the charge (or by the next locomotion frame).
    chargeLanding(game.currentPig, state.loco, parts.training, emit)

    // The beat at the end of a turn (mode 13), then the sergeant's remark.
    if (walkAwayBeat(core, delta)) return
    if (sargeBeat(core, delta)) return
    // The turn clock, and a dead acting pig: either ends the turn.
    if (clockBeat(core, delta)) return

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
    if (computerTurn()) machineStep(core, acting, delta)

    // START OF TURN, then everybody not being driven is dressed.
    if (startingBeat(core, acting)) return
    dressBystanders(core, acting)
    // The beat after a blow, then a weapon that has spent the turn.
    if (aftermathBeat(core, acting, delta)) return
    if (spentBeat(core, acting)) return
    // The door of a building, then the fire button.
    if (doorBeat(core, acting)) return
    if (fireButton(core, acting)) return
    // The pig placed: walked, driven or turned at a gun; crates and mines found.
    const { turning, barrel } = drivePig(core, acting, delta)
    // Then what its hands do, which comes off the HAND bone.
    const weapon = advanceHands(core, acting, delta, turning, barrel)
    dressActing(core, acting, weapon)
    countStill(core, delta)
  }

  const update = (delta: number): void => {
    frame(delta)
    onChanged()
  }

  return {
    update,
    focus: (pig) => focus(core, pig),
    stageStill: () => stageStill(core),
    view: () => viewOf(core),
    setIntent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    jump() {
      state.jumpRequested = true
    },
    enterBuilding() {
      state.doorRequested = true
    },
    setFiring(held, pressed) {
      // **NOTHING IS FIRED FROM THE AIR.** Play: "можно во время прыжка начать
      // заряжать оружие — баг." `Pig::MayAct` refuses it outright — `[pig+0x2EC]`
      // is the pig's own mode and 5 is being airborne, the same value
      // `UpdateMovement` returns on so that a flying pig is neither walked nor
      // turned (0x467a28, 0x46b205). The whole press is dropped rather than the
      // hold alone, or a gauge already filling would loose on the way up.
      if (state.loco.airborne !== null) {
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
      state.sargeSpeaking = saying
    },
    charging: () => attack.gauge(game.currentPig.holding),
    aim: () => (weaponOf(state.holding).aims ? sights.angle() : null),
    situation: () => situationOf(core),
    beginTurn: () => game.beginTurn(),
    cutTurnBeat() {
      if (state.walkAway === null) return
      state.walkAway = null
      // The same handover the beat's own end runs, mission check and all: a spec
      // that skips the beat must not skip the ending with it.
      handOver(core)
    },
    leaveMission() {
      state.leaveRequested = true
    },
    announce: emit,
    aloft: (pig) => (pig === game.currentPig ? state.loco.airborne !== null : tumbles.has(pig)),
    fling: (pig, velocity, ejected, struck) => fling(core, pig, velocity, ejected, struck),
    warp(x, z, heading) {
      swings.reset()
      heals.reset()
      pockets.reset(game.currentPig)
      hides.reset(game.currentPig)
    sacrifice.reset()
      effects.clear()
      state.loco = createLocomotion(query, x, z, heading)
      game.moveCurrentPig(x, state.loco.y, z, heading)
    }
  }
}
