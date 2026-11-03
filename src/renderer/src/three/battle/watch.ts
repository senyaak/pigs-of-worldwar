// THE CAMERA ON ONE PIG: which of the rig's views it is watched from, and
// whether its own model is drawn while it is.

import { aimRadians } from '../../../../lib/game/aim'
import { weaponLayer } from '../../../../lib/game/controls'
import { DYING_DRIFT, DYING_DRIFT_MAX } from '../chase'
import type { View } from '../chase'
import type { Soldier } from '../squad'
import type { SceneCore } from './core'
import { drawnAt, drawnStance, pigShot } from './drawn'
import { scopeEye } from './scopeEye'
import { inFlight } from './subject'

/**
 * Camera and marker onto a pig, wherever it happens to be standing — or
 * hanging: a pig still on its canopy is watched from the front, face on,
 * and one mid-swing from the side, which is the original's own camera mode
 * for a hand-to-hand attack and the only thing that uses it (three/chase).
 */
export const watch = (core: SceneCore, soldier: Soldier, delta: number | null): void => {
  const { dropInArt, chase, subject, state } = core
  const acting = soldier.pig.id === state.now.acting
  const bullet = inFlight(core)
  if (bullet && acting) {
    const at = drawnAt(core, `${state.now.bullets.length > 0 ? 'shot' : 'lob'}:${bullet.id}`, bullet)
    const thrown = weaponLayer(pigShot(core, soldier.pig.id)?.holding ?? null) === 'lob'
    if (thrown) chase.pursue(at, Math.atan2(bullet.vx, bullet.vz), delta)
    else chase.watch(at, delta)
    soldier.node.visible = true
    state.lastView = thrown ? 'pursue' : 'watch'
    return
  }
  // A DYING pig is looked in the FACE for the length of its clip — before
  // the aftermath's ride, because the engine keeps the aftermath alive
  // under a death and play wants the face, not the point ("камера на
  // свинью С ЛИЦА"). The rig is the canopy's own face view (three/chase.ts).
  if (soldier.pig.id === subject.dyingWatch) {
    // …and it BACKS AWAY while it watches — play's rule, the numbers and the
    // reasoning in three/chase.ts (`DYING_DRIFT`).
    subject.dyingFor += delta ?? 0
    chase.follow(
      drawnStance(core, soldier),
      soldier.node.position.y,
      dropInArt.riseOver(soldier.pig.id),
      delta,
      'face',
      0,
      0,
      null,
      Math.min(DYING_DRIFT_MAX, 1 + DYING_DRIFT * subject.dyingFor)
    )
    soldier.node.visible = true
    state.lastView = 'face'
    return
  }
  // A BODY A BLOW THREW is WATCHED, and the camera does not follow it —
  // it stands where it is and TURNS, the way a man watches a ball. Play,
  // 2026-08-25: "камера на свина при атаке переключается, но она меняет
  // ракурс — а на самом деле должна оставаться на месте и только
  // поворачиваться за свином." That is the exe's own mode 1 to the letter
  // (three/chase.ts, `watch`): no position is written, no spring stepped,
  // the ground floor never consulted. Following it was this repo's first
  // reading of "камера к нему прицепляется" and it was the wrong half of
  // the sentence — the camera attaches its GAZE, not its feet.
  if (subject.flungWatch !== null && soldier.pig.id === subject.flungWatch.pig) {
    chase.watch(drawnStance(core, soldier), delta)
    soldier.node.visible = true
    state.lastView = 'watch'
    return
  }
  // …and so does what the blow left behind. Mode 0 on the crate, which is
  // the ordinary chase rig with something other than a pig in it
  // (0x4661c2).
  if (state.now.aftermath && acting && !subject.sawFling) {
    chase.ride(drawnAt(core, 'aftermath', state.now.aftermath.at), soldier.pig.heading, delta)
    soldier.node.visible = true
    state.lastView = 'ride'
    return
  }
  // A THROWN weapon has a camera of its own, and two of them — BOTH the exe's
  // (three/chase.ts). Taking one in HAND is what changes the view, which is
  // 0x493BB0's own dispatch and mode 4; holding the VIEW key is the TR cam,
  // mode 0x12. **The fire button has nothing to do with either of them**, and
  // a gun changes nothing on either count — 0x493BB0 skips it outright.
  const lobbing = acting && weaponLayer(pigShot(core, soldier.pig.id)?.holding ?? null) === 'lob'
  const view: View = pigShot(core, soldier.pig.id)?.underCanopy
    ? 'face'
    : acting && state.now.swinging
      ? 'melee'
      : // The aim view, held, and only for something that shoots — the exe
        // picks mode 0x0E by WEAPON (0x492dfa) and gates it on the same test
        // the melee camera is gated on, which is false through a swing.
        acting && state.now.scoped
        ? 'scope'
        : // …and the VIEW key held over anything else is the TR cam — an
          // empty hand and a blade included, the exe's own last arm
          // (lib/game/sights.ts `sighting`).
          acting && state.now.sighting
          ? 'throw'
          : lobbing
            ? 'lob'
            : 'chase'
  if (acting) state.lastView = view
  chase.follow(
    drawnStance(core, soldier),
    soldier.node.position.y,
    dropInArt.riseOver(soldier.pig.id),
    delta,
    view,
    // The camera looks along the AIM, tremor and all — the picture FOLLOWS the
    // sight, which is what play asked for and what makes it honest.
    aimRadians(state.now.aimAngle),
    0,
    view === 'scope' ? scopeEye(core, soldier) : null
  )
  // The pig's own body is IN the way of its own eye. Hide the acting model
  // while the scope is up — every other pig stays, because those are what
  // is being aimed at.
  soldier.node.visible = view !== 'scope'
  // …**and a pig inside a SHELTER is not drawn at all**, which is the engine's
  // own word rather than a flourish: the exe clears `[pig+0x30]`, the byte its
  // draw loop gates every object on (lib/game/indoors.ts). The camera stays
  // where it is — pointed at the building he is in.
  // …and a DISGUISED one the same way — the decoy stands in for it
  // (lib/game/hide.ts).
  const shot = pigShot(core, soldier.pig.id)
  if (shot?.sheltered || shot?.hidden) soldier.node.visible = false
}
