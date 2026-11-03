// The acting pig's own FLIGHT. Everybody else's is `tumbles`
// (lib/game/tumble.ts); the acting pig's lives on `state.loco`, so the battle
// steps it, and starts it when a blow throws the pig.

import type { Pig } from '../game'
import { updateLocomotion } from '../locomotion'
import type { Velocity } from '../tumble'
import type { BattleCore } from './core'

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
export const flyOn = (core: BattleCore, delta: number): void => {
  const { game, query, scenery, anim, tumbles, state } = core
  // …and the LANDING is part of the flight. This used to return the moment
  // `airborne` cleared — but `fly()` clears it on the very frame the pig
  // touches down, leaving `getUp` (0.44 s) with nobody to burn it: outside
  // the driving frame `ground()` was never reached, so a pig flung late in
  // a turn lay in the landing pose until the handover re-dressed it (play:
  // "остаётся в позе полёта на земле, пока ход не перейдёт к другому").
  // The null intent below is exactly what `tumble.ts` feeds everybody
  // else's get-up.
  if (state.loco.airborne === null && state.loco.getUp <= 0) return
  updateLocomotion(
    state.loco,
    query,
    { walk: 0, turn: 0, jump: false },
    delta,
    // **A PIG IS NOT A WALL IN THE AIR** — the map's objects are the whole of
    // what is in a flight's way, and another body is something to knock over
    // rather than something to stop at (lib/game/tumble.ts, `around` and
    // `BARGE_SPEED`).
    scenery.obstacles
  )
  game.moveCurrentPig(state.loco.x, state.loco.y, state.loco.z, state.loco.heading)
  // …and it BOWLS OVER whoever it runs into, the same as anybody else's
  // flight. The contact belongs to `tumble.ts` and the bookkeeping with it;
  // this pig's flight is the only one that module does not step itself, so it
  // is the only one that has to ask (lib/game/tumble.ts `barge`).
  if (state.loco.airborne !== null) tumbles.barge(game.currentPig, state.loco.heading)
  // The driving frame's own rule (further down `update`): a COMMITTED clip
  // — the landing's get-up — is started once and left to play out; worn as
  // a loop it never reads as finished, which both froze the pose and let
  // `settling()` hand the turn over on top of it.
  if (state.loco.commit) {
    if (!anim.animating(game.currentPig)) anim.playOnce(game.currentPig, state.loco.clip)
  } else if (!anim.animating(game.currentPig)) {
    anim.setClip(game.currentPig, state.loco.clip)
  }
}

/** A pig THROWN by a blow (`Battle.fling`): the acting pig's flight goes on
 * `state.loco`, anybody else's to `tumbles`. */
export const fling = (
  core: BattleCore,
  pig: Pig,
  velocity: Velocity,
  ejected = false,
  struck = false
): void => {
  const { game, tumbles, emit, state } = core
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
  state.loco.airborne = {
    vx,
    vy,
    vz,
    bouncing: true,
    pushIn: null,
    ejected,
    touched: struck,
    hurled: true
  }
  state.loco.getUp = 0
}
