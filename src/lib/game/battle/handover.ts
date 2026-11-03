// THE HANDOVER: one turn ending into the next pig's — or into the END OF
// GAME — and the moment every turn starts: the card going up, the acting pig
// focused, the opening drop that holds the first one off.

import { beginEndOfGame, outcomeOf } from '../endOfGame'
import type { Pig } from '../game'
import { isDead } from '../health'
import { createLocomotion } from '../locomotion'
import type { LocomotionState } from '../locomotion'
import { mountBarrel } from '../mounts'
import { sargeAtTurnStart } from '../sergeant'
import type { BattleCore } from './core'
import { watchable } from './ending'
import { standing } from './sargeBeat'

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
export const announceTurn = (core: BattleCore): void => {
  const { game, emit, computerTurn, state } = core
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
  const goad = sargeAtTurnStart(!computerTurn(), standing(core), core.random, state.sargeLines)
  if (goad) emit({ kind: 'sergeant', section: goad.section, line: goad.line })
}

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
export const handOver = (core: BattleCore): void => {
  const { game, indoors, hides, poison, emit, state } = core
  // Side 0 is OURS — the campaign's own, which `spawnTeams` orders first off
  // the map's player bit — and the verdict tells it apart from the rest the
  // way the exe's two counters do (lib/game/endOfGame.ts).
  const sidesUp = game.players.map((player) => player.pigs.some((pig) => !isDead(pig)))
  const othersUp = sidesUp.filter((up, side) => up && side > 0).length
  // The turn's weapon count starts over — from 1 or less, because 2 is what
  // the wasted-turn line writes and it must survive the handover (0x48F50C).
  if (core.training && state.weaponUses <= 1) state.weaponUses = 0
  const outcome = outcomeOf(core.training, sidesUp[0] === true, othersUp, core.targetsLeft())
  if (outcome !== 'playing') {
    // The turn that has just been played is the count the closer is picked by —
    // the exe's `[gameMode+0x40C]`, which its own `NextPlayer` has just
    // incremented (lib/game/tutorial.ts).
    state.ending = beginEndOfGame(outcome === 'won', watchable(core))
    // The spot a spent turn's camera was left on (see the aftermath block):
    // the tour owns the camera from here, and only `focus` would otherwise
    // clear it — which a battle that is over never reaches.
    state.aftermath = null
    emit({ kind: 'missionOver', won: outcome === 'won', turns: game.turn })
    return
  }
  game.endTurn()
  focus(core, game.currentPig)
  // **THE DISGUISE DROPS AT THE TOP OF THE PIG'S OWN TURN** — the same
  // per-turn pass the poison rides (0x470425 in 0x4703A0): a round of
  // cover, no more (lib/game/hide.ts).
  hides.turnStarted(game.currentPig)
  // **AND THE TENT PAYS OUT, BEFORE THE POISON DOES.** The same per-turn
  // pass again, and this is the FIRST thing in it (0x4703BD, ahead of the
  // status tick at 0x47040A): a pig that spent its turn inside a MASH tent
  // wakes at full health, a MEDIC tent gives it fifty back, and everything
  // else it might be standing in gives nothing (lib/game/buildings.ts,
  // `buildingHeal`). The order matters where both apply — a poisoned pig in
  // a MASH tent is topped up and then pays its ten.
  indoors.turnStarted(game.currentPig)
  // **THE POISON BITES AT THE TOP OF THE PIG'S OWN TURN** — the exe's
  // per-turn pass (0x4703A0, lib/game/poison.ts): ten points, before the
  // card, so the health the announcement reads is the health the turn
  // starts on. Under eleven it dies right here — and a dead acting pig is
  // already what ends a turn (the ranOut test below), which is the FAQ's
  // own wording: a poisoned pig under ten dies the moment it takes its turn.
  poison.turnStarted(game.currentPig)
  announceTurn(core)
}

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
export const footingAt = ({ query, scenery }: BattleCore, pig: Pig): LocomotionState =>
  createLocomotion(query, pig.position.x, pig.position.z, pig.heading, {
    y: pig.position.y,
    obstruction: scenery.obstacles
  })

export const focus = (core: BattleCore, pig: Pig): void => {
  const {
    game,
    indoors,
    swings,
    heals,
    pockets,
    hides,
    sacrifice,
    emit,
    computer,
    sights,
    attack,
    actuator,
    brain,
    state
  } = core
  state.loco = footingAt(core, pig)
  // A climb belongs to the pig that started it, and `settling` waits on this —
  // so a turn handed over on top of one (a pig killed mid-clip) must not leave
  // it set, or nothing ever ends again.
  state.climbing = null
  // …and so does a door half-opened: the glide belongs to the pig that started
  // it (lib/game/doorway.ts).
  state.leaving = null
  state.carry = null
  state.doorstep = null
  state.holding = pig.holding
  {
    const housing = indoors.inside(pig)
    sights.rearm(pig.holding, housing ? mountBarrel(housing.mount, housing.kind) : null)
  }
  state.readying = 0
  // A charge belongs to the pig that started it: a turn handed over mid-hold
  // must not throw for whoever comes next.
  attack.reset()
  state.aftermath = null
  state.pending = null
  state.spent = false
  state.struck = false
  state.minesLaid = 0
  sights.setHeld(false)
  swings.reset()
  heals.reset()
  pockets.reset(game.currentPig)
  hides.reset(game.currentPig)
  sacrifice.reset()
  // A turn is a fresh start for the machine too (lib/game/ai.ts) — and the
  // moment its SEAT is decided (`machineTurn` above). The hands let go of
  // whatever they were doing and still every control they hold.
  brain.reset()
  actuator.reset()
  state.cardSeconds = 0
  state.mullSeconds = 0
  state.lastOrder = null
  state.machineTurn = computer(game.players.indexOf(game.currentPlayer))
  emit({ kind: 'cameraReset' })
}

/** The level's opening drop, and the first turn's card the frame it lands. */
export const openingDrop = (core: BattleCore, delta: number): boolean => {
  const { dropIn, attack, state } = core
  // The level's opening drop stops everything else: no turn clock, no
  // walking, because the original's parachute branch does nothing else
  // either. The ONE thing it does answer is the jump key, which cuts the
  // canopies away — so `jumpRequested` is spent here rather than saved up
  // for the first frame of the turn.
  if (dropIn.update(delta, state.jumpRequested)) {
    state.jumpRequested = false
    attack.swallow()
    return true
  }
  // …and the frame it lands is the frame the FIRST turn's card goes up. Every
  // later one is announced by the handover; this one has no handover behind
  // it, and the drop is what has been holding it off.
  if (state.wasDropping) {
    state.wasDropping = false
    announceTurn(core)
  }
  return false
}
