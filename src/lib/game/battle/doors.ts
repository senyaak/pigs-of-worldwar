// THE DOOR OF A BUILDING: in, out, and the clip that carries the pig through it
// (lib/game/indoors.ts, lib/game/doorway.ts).

import { INOUT_CLIP } from '../buildings'
import { clipSeconds } from '../clips'
import { carryIn, carryOut, doorwayStart } from '../doorway'
import type { Pig } from '../game'
import { copyLocomotion, createLocomotion } from '../locomotion'
import type { BattleCore } from './core'
import { footingAt } from './handover'

/** The door key, and a climb or a leap finishing; true when the door has the frame. */
export const doorBeat = (core: BattleCore, acting: Pig): boolean => {
  const { query, scenery, indoors, anim, state } = core
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
  if (state.climbing !== null || state.leaving !== null || state.carry !== null) state.doorRequested = false
  if (state.doorRequested) {
    state.doorRequested = false
    const within = indoors.inside(acting)
    if (within) {
      // OUT: he is put back on the picture at the building's own middle and
      // rises out of it while the clip runs. `leave` hands back the footing he
      // walked in on, which is not where he is going — but it is what the
      // battle rebuilds from if the glide is cut short.
      indoors.leave(acting)
      state.loco = doorwayStart(within, footingAt(core, acting))
      state.carry = carryOut(within, state.loco, clipSeconds(core.clips[INOUT_CLIP]))
      state.leaving = { pig: acting, roof: within.box.top }
      anim.playOnce(acting, INOUT_CLIP)
      return true
    }
    // …and IN the other way round: the climb first, and he goes in when it has
    // run. `climbing` is what holds him to it — the same rule a lay clip has
    // (`attack.busy()`), and the same reason: an animation nobody may walk out
    // of. The footing he LEFT is kept whole, because that is what the door has
    // to hand back (lib/game/indoors.ts).
    const doorway = indoors.reachable(acting)
    if (doorway) {
      state.climbing = acting
      state.doorstep = copyLocomotion(state.loco)
      state.carry = carryIn(doorway, state.loco, clipSeconds(core.clips[INOUT_CLIP]))
      anim.playOnce(acting, INOUT_CLIP)
      return true
    }
  }
  // …and the climb finishing is what puts him inside. Asked before anything is
  // driven, so the frame he lands in is the frame he is gone.
  if (state.climbing === acting && !anim.animating(acting)) {
    state.climbing = null
    state.carry = null
    // …and the footing he climbed FROM goes in with him, to be handed back at
    // the door — not the one the glide ended on, which is the middle of a box.
    indoors.enter(acting, state.doorstep ?? state.loco)
    state.doorstep = null
    return true
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
  if (state.leaving?.pig === acting && !anim.animating(acting)) {
    const { roof } = state.leaving
    state.leaving = null
    state.carry = null
    state.loco = createLocomotion(query, state.loco.x, state.loco.z, state.loco.heading, {
      y: roof,
      obstruction: scenery.obstacles
    })
    // ON the roof plane, not wherever the glide's last frame left him. The two
    // clocks end a frame apart — the door block asks `anim` before the carry is
    // advanced — and a few units SHORT is the whole difference between standing
    // on the box and being inside it: `standOn` counts nothing above the feet,
    // so six units under the top is no support at all and he fell straight
    // through. Measured: the rise ended at −1562 against a top of −1568.
    state.loco.y = roof
    state.loco.airborne = { vx: 0, vy: 0, vz: 0, bouncing: false, pushIn: null }
    return true
  }
  return false
}
