// How a turn ENDS: the beat it ends through (`endTurnBeat`, the exe's mode 13
// WALK AWAY), and the three things that start that beat — the clock running
// out or the acting pig dead, a weapon that has spent the turn, and (in
// lib/game/battle/firing.ts) SKIP TURN.

import { beginAftermath } from '../aftermath'
import type { Pig } from '../game'
import { isPlanted } from '../grenade'
import { isDead, woundBand } from '../health'
import { ANIM, inWater } from '../locomotion'
import { CLOCK_WARNING } from '../turns'
import { beginWalkAway } from '../walkAway'
import type { BattleCore } from './core'
import { flyOn } from './flight'
import { handOver } from './handover'
import { beginSarge } from './sargeBeat'
import { committed, settling } from './waits'

/**
 * Finish the turn the way the exe finishes one: into the WALK AWAY beat, and
 * only out the far side of it to the next pig.
 *
 * `Game::EndTurn` (0x494430) does not advance anybody — it sets mode 13 and
 * lets that mode's own wait decide when the handover happens
 * (lib/game/walkAway.ts).
 */
export const endTurnBeat = (core: BattleCore): void => {
  const {
    game,
    query,
    anim,
    grenades,
    mines,
    tumbles,
    drowning,
    emit,
    everyone,
    attack,
    state
  } = core
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
    if (pig === game.currentPig && state.loco.airborne !== null) continue
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
  if (burning) state.aftermath = beginAftermath({ x: burning.x, y: burning.y, z: burning.z })
  state.walkAway = beginWalkAway({
    pigs: everyone,
    query,
    soaked: drowning.soaked,
    wear: (pig, clip) => anim.setClip(pig, clip),
    emit
  })
  state.jumpRequested = false
  attack.swallow()
}

/** The WALK AWAY beat, while it runs; true while it has the frame. */
export const walkAwayBeat = (core: BattleCore, delta: number): boolean => {
  const { game, query, corpses, attack, reaction, state } = core
  // The beat at the END of a turn: mode 13, WALK AWAY. Nobody is driving, the
  // clock does not run, and everyone still in the water makes for the nearest
  // shore (lib/game/walkAway.ts). It holds until they are all out and the
  // world has been quiet for a second.
  if (state.walkAway) {
    state.jumpRequested = false
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
    const done = state.walkAway.update(
      delta,
      settling(core) || state.pending !== null || corpses.live() > 0 || state.bootsFor > 0
    )
    // A pig thrown by the charge it planted is still in the air, and the beat is
    // waiting for it (`settling`). Its flight owns its position for as long as it
    // lasts; the walk home is what the beat does with pigs on the ground.
    flyOn(core, delta)
    // The beat moves pigs itself and the one whose turn it was is one of them,
    // so the state the scene draws THAT one out of has to follow it.
    if (state.loco.airborne === null) {
      state.loco.x = game.currentPig.position.x
      state.loco.y = game.currentPig.position.y
      state.loco.z = game.currentPig.position.z
      state.loco.heading = game.currentPig.heading
    }
    // The same careful test the driven pig uses: a deck over water is not
    // water (lib/game/locomotion.ts).
    state.loco.swimming = inWater(query, state.loco.x, state.loco.z, state.loco.y)
    if (done) {
      state.walkAway = null
      // The mode machine goes on from mode 13 to the pass over who was hurt
      // (0x494570, `[game+0x518]` -> 0x497760).
      reaction.settle()
      if (!beginSarge(core)) handOver(core)
    }
    return true
  }
  return false
}

/** The turn clock; true when it, or a dead acting pig, ended the turn. */
export const clockBeat = (core: BattleCore, delta: number): boolean => {
  const { game, grenades, swings, emit, attack, state } = core
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
    state.aftermath !== null ||
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
    if (ranOut && core.training && state.weaponUses === 0) {
      state.weaponUses = 2
      emit({ kind: 'turnWasted' })
    }
    // …and the turn does not hand over on the spot. `Game::EndTurn` goes into
    // mode 13 first — the beat above, which the next step runs.
    endTurnBeat(core)
    return true
  }
  return false
}

/** A weapon that spent the turn, cashed on the quiet after it. */
export const spentBeat = (core: BattleCore, acting: Pig): boolean => {
  const { anim, state } = core
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
  if (state.spent && !committed(core) && !anim.animating(acting) && !settling(core)) {
    endTurnBeat(core)
    return true
  }
  return false
}
