// The battle's controls, READ ONCE A FRAME.
//
// Play asked for this in so many words — "onchange вообще плохой способ в играх;
// можно ведь подцепить контроль к каждому кадру" — and it is a bug rather than a
// preference. A control SET can change while nothing on the keyboard moves: the
// inventory opening is the plain case, and a listener on the held set is never
// told, so the pig walks on under a menu. Every verb that could change the set
// used to call the push by hand, which was one patch per verb over the shape of
// the thing.
//
// Three things this needs, and the first attempt died on all three at once
// (five specs), so they are named here rather than rediscovered:
//
//  - **a press LATCH.** A press and its release can both land between two
//    frames, and `isDown` is false at either end — `controller.tookPress`.
//  - **a GATE on the beat at the top of a turn.** A poll runs whether the player
//    touched anything or not, so `starting` would resolve on the first frame of
//    every turn and the beat would never be seen — `wakes` in
//    `lib/game/controls.ts`.
//  - **ONE loop.** This runs in the SCENE's frame, ahead of the game's step
//    (`three/scene.ts`, `onInput`), so a press is read and acted on in the same
//    frame. The dashboard's own loop only draws.
//
// What a key MEANS is not decided here: `lib/game/controls.ts` is that table and
// it is pure. This file is the plumbing — collect what is held, ask, act.

import { DEBUG_ACTIONS, DRIVING_ACTIONS, HELD_ACTIONS, MENU_ACTIONS } from './actions'
import type { Action } from './actions'
import { controller } from './controller'
import { modeOf, readControls, verbOf, wakes } from '../../../lib/game/controls'
import type { ControlMode, Held } from '../../../lib/game/controls'
import { SKILL } from '../../../lib/game/skills'
import type { PauseVerb } from '../../../lib/game/pauseMenu'
import { choosableIn } from '../../../lib/game/indoors'
import type { Battle } from '../../../lib/game/battle'
import type { Emit } from '../../../lib/game/events'
import type { Game } from '../../../lib/game/game'
import type { SkillMenu } from '../ui/skillMenu'

export interface BattleInputHost {
  /** The BATTLE, or null between them — it is rebuilt on every map swap, so
   * this is asked for rather than held. Input drives the ENGINE and holds no
   * reference to whatever is drawing it (lib/game/battle.ts). */
  battle(): Battle | null
  game(): Game | null
  /** Where a control announces itself: opening the inventory makes a noise, and
   * which noise is the audio bank's business (lib/game/events.ts). */
  emit: Emit
  /** The skill menu, which is one of the control sets. */
  skills: SkillMenu
  /** Whether the battle is the view on screen. */
  up(): boolean
  /** Whether the game is frozen. While it is, nothing here drives the pig. */
  paused(): boolean
  /** Freeze the game, or let it go again (ui/battle.ts). */
  togglePause(): void
  /** One press against the pause menu, while it is up (ui/battle.ts). */
  pauseVerb(verb: PauseVerb): void
}

export interface BattleInput {
  /** Read the controls and act on them. Once a frame, before the game steps. */
  poll(): void
}

/**
 * The battle's own keys, while the PAUSE MENU has them: the walking pair for
 * the cursor, the turning pair for a slider, FIRE to choose.
 *
 * FIRE rather than jump because the exe's SELECT is the button that fires
 * (bit 0x20, 0x493796) and the remake split those two apart — so the menu
 * follows the meaning, not the key.
 */
const PAUSED_KEYS: readonly [Action, PauseVerb][] = [
  ['walkForward', 'up'],
  ['walkBack', 'down'],
  ['turnLeft', 'left'],
  ['turnRight', 'right'],
  ['fire', 'select']
]

export function createBattleInput(host: BattleInputHost): BattleInput {
  /**
   * One-shot presses waiting for the next poll, IN ORDER.
   *
   * A queue and not a set of "what went down", because the order is
   * load-bearing: R and then SPACE opens the inventory and takes what is under
   * the cursor, and two presses land in one frame easily. A set cannot say which
   * came first.
   */
  const pending: Action[] = []
  controller.onAction((action) => {
    // The remake's own keys are not input to the RULES and must not be queued as
    // one: `wakes` counts a queued verb, so F12 would end the beat at the top of
    // the turn it jumped into (input/actions.ts, `DEBUG_ACTIONS`).
    if (!host.up()) return
    if (DEBUG_ACTIONS.includes(action) || MENU_ACTIONS.includes(action)) return
    pending.push(action)
  })

  /** Held actions that went down since the last poll. Read once, at the top of
   * the poll, because asking CONSUMES them. */
  let pressed = new Set<Action>()
  const down = (action: Action): boolean => controller.isDown(action) || pressed.has(action)

  /** The last frame's cursor step, so the inventory moves once per PRESS rather
   * than once per frame — the same keys drive a pig and a cursor, and a cursor
   * wants edges. The pig's own axes do not: they are analogue. */
  let stepped = { x: 0, y: 0 }
  /**
   * The set that was live last time we looked. A CHANGE drops every driving key,
   * so the new set starts from nothing held and the player presses again — which
   * is what the sights already did and what opening the inventory did not.
   *
   * The verbs are left alone deliberately: `aimMode` and `fire` are what DEFINE
   * two of the sets, and releasing them would flap straight back out again.
   */
  let wasMode: ControlMode | null = null

  const blank = {
    ending: false,
    starting: false,
    locked: false,
    charging: false,
    armed: false,
    sights: false
  }

  /** The axes, by whichever test the caller wants: everything that is DOWN, or
   * only what went down this frame. */
  const heldBy = (test: (action: Action) => boolean): Held => ({
    walk: (test('walkForward') ? 1 : 0) - (test('walkBack') ? 1 : 0),
    turn: (test('turnRight') ? 1 : 0) - (test('turnLeft') ? 1 : 0),
    aim: (test('aimUp') ? 1 : 0) - (test('aimDown') ? 1 : 0),
    // G is the AIM VIEW and it is HELD — the original tests its two pad bits
    // every frame and puts the remembered camera mode back the frame they go up
    // (`weapons/fire.md`).
    sighting: test('aimMode'),
    // …and so is F, because that is what the power gauge is (lib/game/gauge.ts).
    firing: test('fire'),
    // The PRESS goes separately and always comes off the latch: an edge worked
    // out from the held state rising is a different thing and a wrong one, since
    // a set that does not read the fire key reports it up while the player holds
    // it — so leaving that set read as a fresh press.
    fired: pressed.has('fire')
  })
  const readHeld = (): Held => heldBy(down)
  /** What went down THIS frame, which is what the beat at the top of a turn ends
   * on — a key left held through the handover of a turn is not a press. */
  const freshHeld = (): Held => heldBy((action) => pressed.has(action))

  /**
   * Which set is live — and if it is the beat at the top of a turn, resolve it
   * away when there is something to resolve it WITH.
   *
   * `starting` cannot simply consume the input: a held key never produces a
   * one-shot verb, so a set that swallowed the axes would have nothing to end
   * it. Its rule is "any input starts the turn, and the same input is then read
   * again in the set that follows".
   */
  const liveMode = (sighting: boolean, woke: boolean): ControlMode => {
    const ask = (): ControlMode => {
      // `sights` is whether the aim view is REACHABLE — the scene's to answer,
      // because it is the record in the pig's hands that decides. The key alone
      // is not enough: a set change drops the driving keys, so G with nothing
      // that points used to stop the pig for no reason at all.
      const { sights, ...situation } = host.battle()?.situation() ?? blank
      return modeOf({
        ...situation,
        inventory: host.skills.open(),
        sighting: sighting && sights
      })
    }
    let mode = ask()
    if (mode === 'starting' && woke) {
      host.battle()?.beginTurn()
      mode = ask()
    }
    // The ending takes any key too — and unlike the beat above it does NOT
    // re-ask: there is no set behind it to read the press in, and the engine is
    // the one that decides whether it was early enough to ignore
    // (lib/game/endOfGame.ts).
    if (mode === 'ending' && woke) host.battle()?.leaveMission()
    if (mode !== wasMode) {
      // Two changes CARRY the keys instead of dropping them, and each cost a
      // failing spec on the way in:
      //
      //  - the FIRST look of a battle. There is no set to have come from, so the
      //    key that opened the battle's first frame is not a leftover — dropping
      //    it left a pig that never walked at all.
      //  - leaving the BEAT at the top of a turn, because that is the beat's own
      //    rule: any input ends it and the SAME input is then read in the set
      //    that follows. Dropping it would eat the very key that woke the turn,
      //    and `starting` drives nothing, so there is nothing stale to drop.
      const carries = wasMode === null || wasMode === 'starting'
      wasMode = mode
      // The LATCH goes with the keys, or a key that went down on this very
      // frame would drive the set it was not pressed in.
      if (!carries) {
        for (const action of DRIVING_ACTIONS) {
          controller.release(action)
          pressed.delete(action)
        }
      }
    }
    return mode
  }

  /**
   * **What the menu OFFERS — and inside a building it is not what the pig
   * carries.**
   *
   * Play: "в инвентаре скилы только постройки, и у бомбоубежища это только
   * пропустить ход." A shelter's own list is empty (lib/game/buildings.ts), so
   * the menu comes up with the one entry it always adds and that entry is SKIP
   * TURN — which is exactly what a pig sitting one turn out in a bomb shelter
   * should be able to reach and nothing else.
   */
  const choosable = (): { skill: number; amount: number }[] => {
    const game = host.game()
    if (!game) return []
    return choosableIn(game.currentPig.carrying, host.battle()?.view().inside ?? null)
  }

  /** What a one-shot key DOES, which is the mode's to say: SPACE is a jump in
   * the battle, SELECT in the inventory, the canopy's knife while a crate is
   * coming down, and nothing at all down the sights. */
  const runVerb = (mode: ControlMode, action: Action): void => {
    const game = host.game()
    switch (verbOf(mode, action)) {
      case 'openInventory': {
        // R opens what the pig is carrying — plus what it can always do. It
        // drives in from the right, with a noise.
        const offered = choosable()
        if (game && host.skills.toggle(offered)) {
          // What is in the FIRST cell goes with it: the training ground's script
          // reads the menu's own first entry and nothing else
          // (lib/game/tutorial.ts, `clipForMenu`).
          host.emit({ kind: 'menuOpened', first: offered[0]?.skill ?? null })
        }
        return
      }
      case 'enterBuilding':
        // Its OWN key, and never the jump's: play asked for that in as many words
        // (input/actions.ts). The engine answers it inside the step.
        host.battle()?.enterBuilding()
        return
      case 'closeInventory':
        if (game) {
          host.skills.toggle(choosable())
          // R is CANCEL, and cancelling puts the weapon away — play asked for it
          // twice, the second time in capitals. SPACE is the only thing that
          // leaves a skill in the pig's hands.
          game.currentPig.holding = null
        }
        return
      case 'choose':
        if (game) {
          // Everything the pig reaches for and HOLDS (three/battle.ts) — SKIP
          // TURN included, which is the correction play asked for: "пропуск хода
          // должен применяться на стрелять, а не на выборе". Nothing fires here.
          const skill = host.skills.chosen()
          game.currentPig.holding = skill
          host.skills.close()
          // The training ground counts this: a weapon coming out of the menu is
          // the beat the sergeant says what to do with it (lib/game/tutorial.ts).
          if (skill !== null) host.emit({ kind: 'chose', skill })
        }
        return
      case 'jump':
        host.battle()?.jump()
        return
      case 'cutChute':
        // The scene owns the drop and reads the same jump request — passing it
        // on is all this has to do.
        host.battle()?.jump()
        return
      case 'leaveMission':
        // Same shape as `beginTurn` below: `liveMode` has already offered the
        // press, because a queued verb is exactly what `wakes` counts.
        return
      case 'beginTurn':
        // Unreachable: `liveMode` has already resolved the beat away, because a
        // queued verb is exactly what `wakes` counts. Named so the switch is
        // total.
        return
      case 'holdSkipTurn':
        // The dashboard's own button, and nothing else now that Enter is gone:
        // it takes the skill in hand rather than applying it. FIRE applies it.
        if (game) game.currentPig.holding = SKILL.SKIP_TURN
        return
      default:
        return
    }
  }

  const poll = (): void => {
    const battle = host.battle()
    if (!battle || !host.up()) {
      // Nothing to act on and nothing to remember: a key pressed while the
      // battle is not up does not queue up for when it is.
      pending.length = 0
      return
    }
    // FROZEN. The poll still runs — it rides the scene's input pass, which is
    // ahead of the frame the pause stops — but the only verb that means
    // anything is the one that ends the pause. Everything else is dropped
    // rather than banked, the same way a key pressed off-screen is: a queue
    // emptied on resume would spend a turn's worth of presses at once.
    if (host.paused()) {
      // THE MENU TAKES THE PIG'S OWN KEYS. The exe reads one pad and the same
      // buttons mean the menu's rows while the pause is up; here the walking
      // pair steps the cursor, the turning pair works a slider, and FIRE
      // chooses — exactly the way the skill menu borrows them. Escape steps
      // back out.
      //
      // Everything is read on the EDGE. `tookPress` consumes the latch a held
      // key sets, so holding W walks the cursor one row and no more.
      for (const action of pending.splice(0, pending.length)) {
        if (action === 'pause') host.pauseVerb('back')
      }
      for (const [action, verb] of PAUSED_KEYS) {
        if (controller.tookPress(action)) host.pauseVerb(verb)
      }
      pressed = new Set()
      stepped = { x: 0, y: 0 }
      return
    }
    pressed = new Set(HELD_ACTIONS.filter((action) => controller.tookPress(action)))
    const queued = pending.splice(0, pending.length)
    // ESCAPE never reaches the rules. It is not a thing a pig does and it has
    // no mode: whatever the control set, whatever is in hand, it freezes the
    // game (ui/battle.ts). Taken out here rather than added to `verbOf`,
    // which is the ENGINE's table of what a control MEANS.
    const verbs = queued.filter((action) => action !== 'pause')
    if (verbs.length !== queued.length) {
      host.togglePause()
      // …and the pause is spent alone. Anything queued alongside it belongs to
      // the frame the player has just stopped.
      return
    }

    let mode = liveMode(down('aimMode'), wakes(freshHeld(), verbs.length))
    // The VERBS go first, because one of them hands over a different set — R
    // opens the inventory — and the axes belong to the set that is live after it
    // rather than to the one before. Then ask again: the change is what drops
    // the driving keys, so what follows reads them as let go.
    for (const action of verbs) runVerb(mode, action)
    if (verbs.length > 0) mode = liveMode(down('aimMode'), false)

    const intent = readControls(mode, readHeld())
    if (mode === 'inventory') {
      // The cursor steps on the EDGE, and the axes are the pig's own keys.
      if (intent.cursor.y !== 0 && stepped.y === 0) host.skills.move(0, intent.cursor.y)
      if (intent.cursor.x !== 0 && stepped.x === 0) host.skills.move(intent.cursor.x, 0)
      stepped = { ...intent.cursor }
    } else {
      stepped = { x: 0, y: 0 }
    }
    battle.setIntent(intent.walk, intent.turn)
    battle.setAim(intent.aim)
    battle.setSighting(intent.sighting)
    battle.setFiring(intent.firing, intent.fired)
  }

  return { poll }
}
