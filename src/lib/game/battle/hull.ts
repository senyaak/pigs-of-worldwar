// A VEHICLE: the keys drive the hull and the pig rides it (lib/game/drive.ts),
// and a moving hull runs over whoever it meets (lib/game/ram.ts).

import { driveStep, hullTurn } from '../drive'
import type { Pig } from '../game'
import type { Building } from '../indoors'
import { createLocomotion } from '../locomotion'
import { ramOver, ramWasAttack } from '../ram'
import type { BattleCore } from './core'

/** One frame of the hull the acting pig is driving. */
export const driveHull = (
  core: BattleCore,
  acting: Pig,
  driving: Building,
  delta: number
): void => {
  const { game, query, scenery, indoors, tumbles, emit, everyone, intent, state } = core
  // **THE HULL IS WHAT MOVES**, and the pig is carried by it. The box in
  // the collision world moves too, or a driven tank would go on blocking
  // the tile it was parked in and pass through everything else
  // (lib/game/obstacles.ts, `moveTo`).
  const hull = {
    x: driving.box.x,
    z: driving.box.z,
    // The box's yaw is the model's, a quarter turn off the heading this
    // engine walks along — `hullTurn` is the pair of them.
    heading: driving.box.turn + Math.PI / 2
  }
  const went = driveStep(
    hull,
    {
      query,
      // Anything solid that is not the hull itself. A point test where the
      // exe has a body, which is the first pass and not the last.
      blocked: (x, z) => {
        const hit = scenery.obstacles.stopper(x, acting.position.y, z)
        return hit !== null && hit !== driving.id
      }
    },
    { walk: intent.walk, turn: intent.turn },
    delta
  )
  const turned = hullTurn(hull.heading)
  indoors.driveTo(driving, hull.x, hull.z, turned, everyone())
  scenery.obstacles.moveTo(driving.id, hull.x, hull.z, turned)
  game.moveCurrentPig(hull.x, acting.position.y, hull.z, hull.heading)
  // **Only a MOVING hull touches anybody** — the exe's own rule, and it is
  // one instruction there: the ram arm bails unless `[veh+0xC0]` is
  // non-zero (lib/game/ram.ts).
  if (went.moved) {
    const over = ramOver(
      driving.box,
      driving.kind,
      acting,
      {
        pigs: everyone,
        training: core.training,
        fling: (pig, velocity) => tumbles.fling(pig, velocity, false, true),
        friendly: (pig) => game.currentPlayer.pigs.includes(pig),
        board: (pig) =>
          indoors.board(
            pig,
            driving,
            createLocomotion(query, pig.position.x, pig.position.z, pig.heading)
          )
      },
      emit
    )
    // **RUNNING SOMEBODY OVER IS AN ATTACK.** Play: "если наехать на когото
    // — будет урон и конец хода — считается атакой." So it spends the
    // turn's one blow and ends the turn, exactly as firing a weapon does —
    // and it needs saying here because nothing else about it goes through
    // `attack.ts`: there is no skill in hand, no `used` answer, and the
    // ladder never runs. Twenty points arrive from the hull instead.
    //
    // **Picking a chum up does NOT**, and the manual is why: "the troop
    // carriers can be handy for picking up a group of your chums and
    // driving them all across the map in one go." A group, in one go — so
    // the first pickup cannot be the end of the turn. Only the knock is a
    // blow. `[play]` + `[manual]`.
    if (ramWasAttack(over)) {
      state.struck = true
      state.spent = true
    }
  }
}
