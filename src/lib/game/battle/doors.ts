// THE DOOR OF A BUILDING OR A VEHICLE: in, out, and the clip that carries the pig
// through it (lib/game/indoors.ts, lib/game/doorway.ts).

import { INOUT_CLIP } from '../buildings'
import { clipSeconds } from '../clips'
import {
  DOOR_FROM,
  carryIn,
  carryOut,
  clearHeight,
  doorwayStart,
  exitHeading,
  exitSpot,
  heightOnLeaving
} from '../doorway'
import type { Pig } from '../game'
import { copyLocomotion, createLocomotion } from '../locomotion'
import { withPigs } from '../obstacles'
import type { BattleCore } from './core'
import { footingAt } from './handover'

/** The door key, and a climb or a leap finishing; true when the door has the frame. */
export const doorBeat = (core: BattleCore, acting: Pig): boolean => {
  const { query, scenery, indoors, anim, everyone, state } = core
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
  // one mechanism with four arms (`lib/game/doorway.ts`): each sets a fixed
  // per-frame step and the pig's own update adds it to the body's position
  // (0x46E1A1). IN goes to the mount's own transform. OUT of a building goes
  // straight up; OUT of a vehicle goes off to one side and down to the ground.
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
      // OUT: he is put back on the picture at the mount's own middle, turned the
      // way the arm turns him, and goes from the clip's first marker — there is no
      // crouch on the way out. `leave` hands back the footing he walked in on,
      // which is not where he is going — but it is what the battle rebuilds from
      // if the glide is cut short.
      indoors.leave(acting)
      state.loco = doorwayStart(within, footingAt(core, acting))
      state.loco.heading = exitHeading(within)
      acting.heading = state.loco.heading
      // The sweep counts every body still in the world, and one inside something
      // has left it (0x47CB70, 0x47CABC).
      const way = withPigs(
        scenery.obstacles,
        everyone()
          .filter((pig) => pig !== acting && indoors.inside(pig) === null)
          .map((pig) => ({ ...pig.position }))
      )
      const { x, z } = exitSpot(within, state.loco)
      const to = { x, y: clearHeight(query.height(x, z), way, x, z), z }
      state.carry = carryOut(state.loco, to, clipSeconds(core.clips[INOUT_CLIP]))
      state.leaving = { pig: acting, mount: within.mount }
      anim.playOnce(acting, INOUT_CLIP, DOOR_FROM)
      return true
    }
    // …and IN the other way round: the climb first, and he goes in when it has
    // run. `climbing` is what holds him to it — the same rule a lay clip has
    // (`attack.busy()`), and the same reason: an animation nobody may walk out
    // of. The footing he LEFT is kept whole, because that is what the door has
    // to hand back (lib/game/indoors.ts).
    const doorway = indoors.reachable(acting)
    if (doorway) {
      // A pig already in the air has no crouch to do: both IN arms put the cursor
      // straight on the first marker for one (0x46A24A, 0x469F43).
      const inTheAir = state.loco.airborne !== null
      state.climbing = acting
      state.doorstep = copyLocomotion(state.loco)
      state.carry = carryIn(doorway, state.loco, clipSeconds(core.clips[INOUT_CLIP]), inTheAir)
      anim.playOnce(acting, INOUT_CLIP, inTheAir ? DOOR_FROM : 0)
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
  // has him (the toggle arms at the end of the clip, 0x47CB13 and 0x47C8A6).
  //
  // Not `footingAt`. That asks where he RESTS, and a pig hanging over a roof
  // rests nowhere — `standOn` finds nothing within reach above the box and the
  // fallback is the ground, so the door ended by teleporting him down through
  // the shelter. Play: "выпрыгивание не работает — проваливаюсь обратно сквозь
  // крышу." The footing is built at the height the glide left him, so the
  // step-up envelope is measured from the thing he is about to land on rather
  // than from the ground under it, and then a still velocity lets the ordinary
  // landing put him on it.
  if (state.leaving?.pig === acting && !anim.animating(acting)) {
    const { mount } = state.leaving
    state.leaving = null
    state.carry = null
    const { x, z, heading } = state.loco
    const ground = query.height(x, z)
    const y = heightOnLeaving(mount, ground, state.loco.y)
    state.loco = createLocomotion(query, x, z, heading, { y, obstruction: scenery.obstacles })
    state.loco.y = y
    if (y !== ground) state.loco.airborne = { vx: 0, vy: 0, vz: 0, bouncing: false, pushIn: null }
    return true
  }
  return false
}
