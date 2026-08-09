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

import { ANIM, createLocomotion, updateLocomotion } from './locomotion'
import type { LocomotionState } from './locomotion'
import { withPigs } from './obstacles'
import { isDead } from './health'
import { aimPhase, aimRadians, scrubsPose } from './aim'
import { weaponOf } from './weapons'
import type { Firing } from './shot'
import { advanceAftermath, beginAftermath, watchAftermath } from './aftermath'
import type { Aftermath } from './aftermath'
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
import type { Strikes } from './strikes'
import type { EffectField } from './effectField'
import type { DamageNumbers } from './damage'
import type { AirDrops } from './airDrop'
import type { DropIn } from './dropIn'
import type { Point } from './pose'
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
  swings: Strikes
  effects: EffectField
  numbers: DamageNumbers
  airDrops: AirDrops
  dropIn: DropIn
  /** Called whenever the state changed this frame (a HUD refresh). */
  onChanged: () => void
  /** The stream everything the battle does is announced on, and the one it
   * hears its own weapons on (lib/game/events.ts). */
  bus: BattleBus
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
  const { game, query, scenery, anim, shots, grenades, swings, effects, numbers } = parts
  const { airDrops, dropIn, onChanged } = parts
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
  const sights = createSights()
  /** The fire button and everything one press sets going: the gauge, the fuse
   * and which weapon answers (lib/game/attack.ts). */
  const attack = createAttack({
    shots,
    grenades,
    swings,
    sights,
    anim,
    bark: () => emit({ kind: 'bark', player: game.players.indexOf(game.currentPlayer) })
  })
  /** The beat after a kill: the clock stops, the camera stays on the spot. */
  let aftermath: Aftermath | null = null
  /** A script step owed to something that has broken, and not run until it has
   * finished breaking. One animation at a time. */
  let pending: { id: number; y: number } | null = null
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
    grenades.live() > 0 ||
    shots.live().length > 0

  // The battle LISTENS to its own weapons for the two things that stop a turn.
  // A blow does not decide that a turn ends; the OBJECT breaking does, which is
  // where the exe hangs it too (0x48d750), and every weapon simply announces.
  parts.bus.on(
    handling({
      broke: ({ target }) => {
        // A different effect from the hit, and the one play remembers as smoke.
        effects.broke(target)
        scenery.remove(target.id)
        // The turn stops here and the camera stays on the spot. What comes
        // next — a crate under a canopy, most of the time — is watched from the
        // same wait (lib/game/aftermath.ts).
        aftermath = beginAftermath(target)
        // …and its own command, which is the last thing the exe's break handler
        // does (0x48d972). This is what drops the next crate in — but NOT YET:
        // the dummy has to finish coming apart before the crate starts coming
        // down, which is how the whole game is paced.
        pending = { id: target.id, y: target.y }
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
    loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading)
    holding = pig.holding
    sights.rearm(pig.holding)
    readying = 0
    // A charge belongs to the pig that started it: a turn handed over mid-hold
    // must not throw for whoever comes next.
    attack.reset()
    aftermath = null
    pending = null
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
    const blowInProgress =
      attack.busy() ||
      aftermath !== null ||
      swings.running() ||
      grenades.live() > 0
    if (!blowInProgress && (game.tick(delta) || isDead(game.currentPig))) {
      game.endTurn()
      jumpRequested = false
      attack.swallow()
      focus(game.currentPig)
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
      // Everything play named that this battle can answer for: a projectile
      // still in the air, damage still landing, a body still coming apart, a
      // crate still under its canopy. A pig swimming for the shore is on the
      // list too and is not modelled — nothing knocks one into the water yet.
      const settling =
        pending !== null ||
        swings.running() ||
        anim.animating(acting) ||
        effects.busy() ||
        shots.live().length > 0 ||
        grenades.live() > 0 ||
        numbers.live() > 0 ||
        airDrops.falling() > 0
      if (advanceAftermath(aftermath, delta, settling)) {
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

    // What the fire button set going — the whole of it, including WHICH weapon
    // answers (lib/game/attack.ts). SKIP TURN is the one answer this frame has
    // to act on itself, because ending a turn is the battle's business.
    if (attack.begin(acting, holding) === 'skip') {
      emit({ kind: 'skillUsed' })
      game.endTurn()
      focus(game.currentPig)
      onChanged()
      return
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
    game.moveCurrentPig(loco.x, loco.y, loco.z, loco.heading)
    // Walking INTO a crate is how one is collected; there is no button.
    scenery.collect(acting)

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
      aftermath
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
      armed: grenades.live() > 0,
      locked: committed() || aftermath !== null,
      sights: layerSights(weaponLayer(game.currentPig.holding)) && !dropIn.running()
    }),
    beginTurn: () => game.beginTurn(),
    announce: emit,
    warp(x, z, heading) {
      swings.reset()
      effects.clear()
      loco = createLocomotion(query, x, z, heading)
      game.moveCurrentPig(x, loco.y, z, heading)
    }
  }
}
