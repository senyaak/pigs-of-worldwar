// EVERYTHING THE FRAME LOOKS LIKE, read back off the battle once it has run.

import { isPlanted, lobOf } from '../../../../lib/game/grenade'
import { weaponModelName } from '../../../../lib/game/weapons'
import { SCOPE_MAGNIFY } from '../chase'
import type { SceneCore } from './core'
import { drawnAt, pigShot, stanceAt } from './drawn'
import { followSubject } from './subject'

/**
 * Everything the frame LOOKS like, read back off the battle once it has run.
 *
 * Every branch the engine takes — the drop, the beat after a blow, an
 * ordinary frame — ends up watching the SAME pig, the acting one, so the
 * camera is placed once here rather than at each of the engine's own exits.
 */
export const show = (core: SceneCore, delta: number): void => {
  const {
    host,
    query,
    sounds,
    squad,
    dropInArt,
    marker,
    chase,
    engine,
    weapons,
    openFov,
    state
  } = core
  const arriving = state.now.pigs.filter((one) => one.arriving)
  // The squad coming down: each pig where its own descent has got to, and
  // the canopies heard the first frame the bank can play them.
  dropInArt.draw(arriving, (one) => drawnAt(core, `drop:${one.id}`, one))
  sounds.chuteOverhead(state.now.dropping)
  // …and a planted charge burning, which is a noise for as long as the fuse
  // lasts rather than a moment (audio/battleAudio.ts, `FUSE_TICK`).
  sounds.fuseBurning(
    // …still BURNING: a charge doused in the water has stopped counting and
    // travels as −1 (lib/game/snapshot.ts).
    state.now.lobs.filter((one) => isPlanted(one.skill) && one.fuse >= 0).map((one) => one.fuse),
    delta
  )
  // …and a GAS canister streaming: the hiss runs while one is live and a
  // doused one (fuse −1) has gone quiet (lib/game/gas.ts).
  sounds.gasHissing(
    state.now.lobs.some((one) => lobOf(one.skill)?.gas === true && one.fuse >= 0),
    delta
  )
  // …and the war beyond the map's edge, which nothing on the field causes
  // and so nothing announces (audio/ambience.ts). It stops with the world:
  // `show` runs on a delta of zero under a pause.
  sounds.ambient(delta, !state.now.over)
  const active = squad.of(state.now.acting)
  if (!active) return
  if (!state.now.dropping && !state.now.starting && !state.now.over) {
    // The acting pig stands where the locomotion state says, and the camera
    // stops holding the moment the player drives (three/chase.ts).
    chase.hold(
      state.now.loco.airborne?.bouncing === true || state.now.loco.airborne?.ejected === true,
      state.now.driving,
      delta
    )
    sounds.follow(state.now.loco, state.now.loco.swimming)
    // BETWEEN the last two steps. The rules move in fixed quanta and the
    // screen does not, so what is drawn is the pig partway from where it
    // stood to where it now stands (lib/game/engine.ts, STEP_SECONDS). The
    // pig itself is not moved by this — `place` draws (three/squad.ts).
    const at = stanceAt(core, engine.alpha())
    active.place(at.x, at.y, at.z, at.heading)
    marker.moveTo(at.x, query.height(at.x, at.z), at.z)
    // The model is not in the hand until the getting-it-out clip has run.
    for (const soldier of squad.members) {
      const reaching = soldier === active && state.now.readying > 0
      const held = pigShot(core, soldier.pig.id)?.holding ?? null
      weapons.show(soldier.mesh, reaching ? null : weaponModelName(held))
    }
  }
  // **THE MISSION IS OVER: EVERY PIG PUTS ITS WEAPON DOWN.** Play: "анимация
  // победы играется в позе вытащенного оружия — все оружия надо убрать у всех
  // свинов." The engine empties the hands (lib/game/battle.ts), but the block
  // above that takes the model off the arm does not run once the battle is in
  // its ending — so the mesh stayed where it was.
  if (state.now.ending) {
    for (const soldier of squad.members) weapons.show(soldier.mesh, null)
  }
  // …and every pig in a building — or under a DISGUISE — is gone from the
  // picture, acting or not. The other direction matters too: this loop
  // only ever CLEARED visibility, and the sole writer of true was the
  // watch, for the acting pig — so a pig that shed its disguise while not
  // acting stayed invisible for good. The snapshot's word is written both
  // ways now, with the acting pig left to the watch (the scope view hides
  // it deliberately).
  for (const soldier of squad.members) {
    const shot = pigShot(core, soldier.pig.id)
    if (!shot) continue
    if (shot.sheltered || shot.hidden) soldier.node.visible = false
    else if (soldier.pig.id !== state.now.acting) soldier.node.visible = true
  }
  // EVERY pig that is not being drawn by somebody else follows its own
  // body. This loop was corpses-only — "nothing else places a pig that is
  // not acting" — and that line WAS the bug play hunted across a whole
  // session: a blast throws a LIVING non-acting pig 1700 units in the
  // engine (the tumbles write its position every step), the bounce clip
  // plays, and the mesh stood where the squad was built — "он на месте
  // катился". The engine's word on where a body is is this snapshot, for
  // the living exactly as for the dead. Two exceptions keep their own
  // painters: the interpolated acting placement above (alpha between
  // steps), and a pig still on its parachute, which the drop draws.
  for (const one of state.now.pigs) {
    if (one.arriving) continue
    if (one.id === state.now.acting && one.health > 0) continue
    squad.of(one.id)?.place(one.x, one.y, one.z, one.heading)
  }
  // A magnified view really is magnified. Where 0x1000 of `afSetZoom` puts a
  // field of view is the library's and the library is not in the install, so
  // SCOPE_MAGNIFY is the remake's pick and three/chase.ts says so.
  const magnified = openFov / (1 + state.now.zoom * (SCOPE_MAGNIFY - 1))
  if (Math.abs(host.camera.fov - magnified) > 1e-4) {
    host.camera.fov = magnified
    host.camera.updateProjectionMatrix()
  }
  followSubject(core, active, delta)
}
