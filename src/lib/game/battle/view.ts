// What the battle answers when asked — the scene's reading of a frame, and the
// input layer's of which control set is live.

import type { Battle, BattleView } from '../battle'
import { layerSights, weaponLayer } from '../controls'
import type { BattleCore } from './core'
import { committed } from './waits'

export const viewOf = (core: BattleCore): BattleView => {
  const { game, indoors, dropIn, intent, sights, attack, state } = core
  return {
    loco: state.loco,
    aimAngle: sights.angle(),
    scoped: sights.scoped(state.holding) && !dropIn.running(),
    sighting: sights.sighting(state.holding) && !dropIn.running(),
    zoom: sights.zoom(),
    readying: state.readying,
    holding: state.holding,
    still: state.still,
    driving: intent.walk !== 0 || intent.turn !== 0,
    firing: attack.firing(),
    aftermath: state.aftermath,
    walkAway: state.walkAway === null ? null : { swimming: state.walkAway.swimming() },
    // The sergeant's beat, so the scene can hold the camera on the pig he is
    // talking about rather than snapping to the next turn's.
    sergeant: state.sarge !== null,
    ending: state.ending,
    inside: indoors.inside(game.currentPig),
    doorway: indoors.reachable(game.currentPig)
  }
}

export const situationOf = (core: BattleCore): ReturnType<Battle['situation']> => {
  const { game, grenades, dropIn, computerTurn, sights, attack, state } = core
  return {
    // Over everything: a mission that has ended has ended.
    ending: state.ending !== null,
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
      committed(core) ||
      state.spent ||
      state.aftermath !== null ||
      state.walkAway !== null ||
      state.sarge !== null ||
      state.climbing !== null ||
      state.leaving !== null ||
      state.carry !== null,
    sights: layerSights(weaponLayer(game.currentPig.holding)) && !dropIn.running(),
    // The machine is playing: the input layer reads this and drives nothing
    // (input/battleInput.ts). ESCAPE still pauses — it never reaches the
    // rules to begin with.
    computerTurn: computerTurn()
  }
}
