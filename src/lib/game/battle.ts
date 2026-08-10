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

import { ANIM, createLocomotion, inWater, updateLocomotion } from './locomotion'
import type { LocomotionState } from './locomotion'
import { withPigs } from './obstacles'
import { isDead } from './health'
import { aimPhase, aimRadians, scrubsPose } from './aim'
import { weaponOf } from './weapons'
import type { Firing } from './shot'
import { advanceAftermath, beginAftermath, watchAftermath } from './aftermath'
import type { Aftermath } from './aftermath'
import { beginWalkAway } from './walkAway'
import type { WalkAway } from './walkAway'
import { endsTurn, hurryFor } from './spend'
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
import type { Bullets } from './bullets'
import type { Lobs } from './lobs'
import type { Mines } from './mines'
import type { Strikes } from './strikes'
import type { EffectField } from './effectField'
import type { DamageNumbers } from './damage'
import type { AirDrops } from './airDrop'
import type { DropIn } from './dropIn'
import type { Drowning } from './drowning'
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
  anim: Anim
  clips: ClipTiming[]
  shots: Bullets
  grenades: Lobs
  /** What is buried in the ground, and what has been trodden on
   * (lib/game/mines.ts). */
  mines: Mines
  swings: Strikes
  effects: EffectField
  numbers: DamageNumbers
  airDrops: AirDrops
  dropIn: DropIn
  /** What being in the water costs, for every pig on the map
   * (lib/game/drowning.ts). */
  drowning: Drowning
  /** Called whenever the state changed this frame (a HUD refresh). */
  onChanged: () => void
  /** The stream everything the battle does is announced on, and the one it
   * hears its own weapons on (lib/game/events.ts). */
  bus: BattleBus
  /** Every roll this battle makes — the tremor's among them (lib/game/random.ts). */
  random: Random
}

/** What the renderer reads once the frame has run. */
export interface BattleView {
  /** The acting pig's frame-by-frame state — where it is, and what it wears. */
  loco: LocomotionState
  /** Where the weapon in hand points, engine units, tremor included. */
  aimAngle: number
  /** Whether the view is down the barrel. */
  scoped: boolean
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
}

export interface Battle {
  /** One frame. */
  update(delta: number): void
  /** Take the battle to a pig: a new turn, or a warp. */
  focus(pig: Pig): void
  view(): BattleView
  /** Tank controls: walk -1|0|1 (back/stop/forward), turn -1|0|1. */
  setIntent(walk: number, turn: number): void
  jump(): void
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
  /** How full the power gauge is, 0..1 — or null when nothing in hand charges,
   * which is what the dashboard hides it on. */
  charging(): number | null
  /** Where the weapon points, or null when it holds nothing that aims. */
  aim(): number | null
  /** The three states the CONTROL SET turns on that only the battle knows
   * (lib/game/controls.ts). */
  situation(): {
    starting: boolean
    locked: boolean
    charging: boolean
    armed: boolean
    sights: boolean
  }
  /** End the beat at the top of a turn: any input does. */
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
   * Say something on the battle's own bus.
   *
   * For the things a CONTROL announces rather than the game — opening the
   * inventory is one — so input has somewhere to put them without holding the
   * bus itself (lib/game/events.ts).
   */
  announce: Emit
  /** Warp the acting pig — the debug surface the e2e suite drives through. */
  warp(x: number, z: number, heading: number): void
}

export function createBattle(parts: BattleParts): Battle {
  const { game, query, scenery, anim, shots, grenades, mines, swings, effects, numbers } = parts
  const { airDrops, dropIn, drowning, onChanged } = parts
  const emit = parts.bus.emit

  /** Every pig on the map, as bodies to walk into. */
  const everyone = (): Pig[] => game.players.flatMap((player) => player.pigs)

  const intent = { walk: 0, turn: 0 }
  let jumpRequested = false
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
    sights,
    anim,
    clips: parts.clips,
    bark: () => emit({ kind: 'bark', player: game.players.indexOf(game.currentPlayer) })
  })
  /** The beat after a kill: the clock stops, the camera stays on the spot. */
  let aftermath: Aftermath | null = null
  /** …and the beat at the END of a turn: the exe's mode 13, WALK AWAY. Nobody
   * is driving and anyone in the water is swimming out (lib/game/walkAway.ts). */
  let walkAway: WalkAway | null = null
  /** A script step owed to something that has broken, and not run until it has
   * finished breaking. One animation at a time. */
  let pending: { id: number; y: number } | null = null
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
    numbers.live() > 0 ||
    airDrops.falling() > 0

  /**
   * Finish the turn the way the exe finishes one: into the WALK AWAY beat, and
   * only out the far side of it to the next pig.
   *
   * `Game::EndTurn` (0x494430) does not advance anybody — it sets mode 13 and
   * lets that mode's own wait decide when the handover happens
   * (lib/game/walkAway.ts).
   */
  const endTurnBeat = (): void => {
    // Nobody is being driven from here on, so nobody is mid-stride. Play: "когда
    // таймер кончился — анимация свина не возвращается обратно в идл" — the walk
    // cycle the pig was wearing when the clock ran out played on through the whole
    // beat, because the beat only ever dressed the SWIMMERS. Before
    // `beginWalkAway`, which puts those back into their own clip on top of this.
    for (const pig of everyone()) if (!isDead(pig)) anim.setClip(pig, ANIM.IDLE)
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

  // The battle LISTENS to its own weapons for the two things that stop a turn.
  // A blow does not decide that a turn ends; the OBJECT breaking does, which is
  // where the exe hangs it too (0x48d750), and every weapon simply announces.
  parts.bus.on(
    handling({
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
      }
    })
  )

  const focus = (pig: Pig): void => {
    // WHERE THE PIG ALREADY IS, and not just where the ground under it is: a
    // turn that starts on a bridge starts on the DECK. The pig's own y plus the
    // objects is what settles that (lib/game/locomotion.ts `Footing`) — the
    // squad is not in it, because a pig is never something to stand on.
    loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading, {
      y: pig.position.y,
      obstruction: scenery.obstacles
    })
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
    sights.setHeld(false)
    swings.reset()
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

    // Nobody left standing: the battle stops where it is rather than handing
    // a turn to a squad that cannot take one (lib/game/game.ts).
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

    // The beat at the END of a turn: mode 13, WALK AWAY. Nobody is driving, the
    // clock does not run, and everyone still in the water makes for the nearest
    // shore (lib/game/walkAway.ts). It holds until they are all out and the
    // world has been quiet for a second.
    if (walkAway) {
      jumpRequested = false
      attack.swallow()
      // Everything that runs on its own runs on: the engine's step advances all
      // of it after this call (lib/game/engine.ts). All this beat does is watch.
      const done = walkAway.update(delta, settling())
      // The beat moves pigs itself and the one whose turn it was is one of them,
      // so the state the scene draws THAT one out of has to follow it.
      loco.x = game.currentPig.position.x
      loco.y = game.currentPig.position.y
      loco.z = game.currentPig.position.z
      loco.heading = game.currentPig.heading
      // The same careful test the driven pig uses: a deck over water is not
      // water (lib/game/locomotion.ts).
      loco.swimming = inWater(query, loco.x, loco.z, loco.y)
      if (done) {
        walkAway = null
        game.endTurn()
        focus(game.currentPig)
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
    if (!blowInProgress && (game.tick(delta) || isDead(game.currentPig))) {
      // …and the turn does not hand over on the spot. `Game::EndTurn` goes into
      // mode 13 first — the beat above, which the next step runs.
      endTurnBeat()
      onChanged()
      return
    }

    const acting = game.currentPig

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
      anim.setClip(pig, ANIM.IDLE)
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
      attack.swallow()
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
      // The shot that caused all this ends here rather than a frame late.
      attack.settled()
      // ONE THING AT A TIME. The script's next step waits for the thing that
      // triggered it to finish — play's rule for the whole game, "ждёшь конца
      // одной анимации и включаешь другую". `busy()`, not `smoke() === 0`: the
      // break effect's burst does not fire until its third frame, so counting
      // puffs said "finished" on the very frame the dummy broke.
      if (pending && !swings.running() && !anim.animating(acting) && !effects.busy()) {
        scenery.advance(pending.id, pending.y)
        pending = null
      }
      // The world, plus the three things only this wait knows about: the script
      // step it owes, the blow's own animation, and the pig playing it out. A pig
      // swimming for the shore is on the exe's list too and is not modelled —
      // nothing knocks one into the water yet.
      const held = pending !== null || swings.running() || anim.animating(acting) || settling()
      if (advanceAftermath(aftermath, delta, held)) {
        aftermath = null
        emit({ kind: 'cameraReset' })
      } else {
        // Follow the crate down; a spot with nothing coming stays the spot.
        const crate = airDrops.watching()
        if (crate) watchAftermath(aftermath, crate)
        // Standing about is only what a pig does once it has finished. Asking
        // for a clip is what CANCELS a committed one, so this line
        // unconditionally was the interruption.
        if (!swings.swinging() && !anim.animating(acting)) anim.setClip(acting, ANIM.IDLE)
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
    if (struck && acting.holding !== SKILL.SKIP_TURN && grenades.thrown() === 0) {
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
      struck = true
      if (endsTurn(acting.holding)) spent = true
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
    const walking = committed() ? 0 : intent.walk
    const turning = committed() ? 0 : intent.turn
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
    updateLocomotion(
      loco,
      query,
      { walk: walking, turn: scoping ? 0 : turning, jump: jumpRequested },
      delta,
      // The squad is in the way too: every pig but the acting one, as the body
      // its own spawn marker measured (lib/game/obstacles).
      withPigs(
        scenery.obstacles,
        everyone()
          .filter((pig) => pig !== acting)
          .map((pig) => ({ ...pig.position }))
      )
    )
    jumpRequested = false
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
    game.moveCurrentPig(loco.x, loco.y, loco.z, loco.heading)
    // Walking INTO a crate is how one is collected; there is no button.
    scenery.collect(acting)

    // …and walking onto a MINE is how one is found. Every pig, not just the one
    // being driven — the exe asks it in the per-pig ground update — and only with
    // its feet DOWN: the tile under a pig in the air is not the tile it is
    // standing on (`[pig+0x382]`, lib/game/mines.ts). The trigger is one-shot, so
    // standing on the spot is safe once it has gone off, and the noise is the
    // whole warning the player gets.
    for (const pig of everyone()) {
      if (isDead(pig)) continue
      if (pig === acting && loco.airborne !== null) continue
      if (mines.tread(pig.position.x, pig.position.z)) {
        emit({ kind: 'mineTripped', at: { ...pig.position } })
      }
    }

    // The swing, after the pig has been placed: the blade's own points come off
    // the HAND bone, so where the pig is standing has to be settled first. It
    // may put the weapon away on the way out — the last bayonet.
    swings.update(delta, acting)

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
    view: () => ({
      loco,
      aimAngle: sights.angle(),
      scoped: sights.scoped(holding) && !dropIn.running(),
      zoom: sights.zoom(),
      readying,
      holding,
      still,
      driving: intent.walk !== 0 || intent.turn !== 0,
      firing: attack.firing(),
      aftermath,
      walkAway: walkAway === null ? null : { swimming: walkAway.swimming() }
    }),
    setIntent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    jump() {
      jumpRequested = true
    },
    setFiring(held, pressed) {
      // The PRESS is what a gun and a blade answer to; the gauge wants the
      // whole hold, and the frame it ends.
      if (pressed) attack.press()
      attack.hold(held)
    },
    setAim: sights.push,
    setSighting: sights.setHeld,
    charging: () => attack.gauge(game.currentPig.holding),
    aim: () => (weaponOf(holding).aims ? sights.angle() : null),
    situation: () => ({
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
      locked: committed() || spent || aftermath !== null || walkAway !== null,
      sights: layerSights(weaponLayer(game.currentPig.holding)) && !dropIn.running()
    }),
    beginTurn: () => game.beginTurn(),
    cutTurnBeat() {
      if (walkAway === null) return
      walkAway = null
      game.endTurn()
      focus(game.currentPig)
    },
    announce: emit,
    warp(x, z, heading) {
      swings.reset()
      effects.clear()
      loco = createLocomotion(query, x, z, heading)
      game.moveCurrentPig(x, loco.y, z, heading)
    }
  }
}
