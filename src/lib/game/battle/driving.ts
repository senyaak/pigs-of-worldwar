// THE ACTING PIG PLACED: walked, turned at a gun or carried by a hull, then
// crates collected and mines found underfoot — and how long it has stood still.

import { aimRadians } from '../aim'
import { weaponLayer } from '../controls'
import { advanceCarry } from '../doorway'
import type { Pig } from '../game'
import { isDead, woundBand } from '../health'
import { updateLocomotion } from '../locomotion'
import { mountArmed, mountBarrel } from '../mounts'
import { withPigs } from '../obstacles'
import type { BattleCore } from './core'
import { driveHull } from './hull'
import { committed } from './waits'

/** The pig moved for this frame; answers the turn and the barrel the sights need. */
export const drivePig = (
  core: BattleCore,
  acting: Pig,
  delta: number
): { turning: number; barrel: readonly [number, number] | null } => {
  const {
    game,
    query,
    scenery,
    indoors,
    mines,
    tumbles,
    emit,
    everyone,
    intent,
    sights,
    attack,
    state
  } = core
  // **COMMITTED takes the whole of input, and it starts at the FIRE press.**
  // Play: "после нажатия стрелять должно отключаться полностью управление — а
  // не только прыжок, вообще всё."
  if (committed(core)) {
    state.jumpRequested = false
    sights.push(0)
  }
  // …and a pig INSIDE a building is not driven at all: not the walk, not the
  // turn, and the jump above has already been spent on the door. The exe
  // switches its body off outright (`[body+0x44] |= 1`). The FIRE key still
  // reaches it, because SKIP TURN is the whole of what a shelter offers and it
  // is used like any other skill.
  // Nobody DRIVES through a door: in, out, or already inside.
  const sheltered =
    indoors.inside(acting) !== null || state.climbing === acting || state.leaving?.pig === acting
  // **…except at a gun.** A PILLBOX puts a weapon in the hands of whoever is
  // inside it (lib/game/buildings.ts, `buildingSkills`), and the exe takes
  // that gun's heading off the PIG rather than off the building — the two
  // emplaced arms call the ordinary aim helper, where the vehicle's three
  // read the turret's own angle instead (`weapons/emplaced.md`). So a pig at
  // a pillbox's gun still turns on the spot. It still does not WALK: there is
  // nowhere to walk to.
  const housing = indoors.inside(acting)
  const emplaced = housing && mountArmed(housing.mount, housing.kind) ? housing : null
  /**
   * …and a VEHICLE is the one mount that goes somewhere. The keys drive the
   * HULL rather than the pig: the walk is the throttle and the turn is the
   * tracks, and the pig's own heading follows the hull so the gun points
   * where the tank does (lib/game/drive.ts).
   */
  const driving = housing?.mount === 'vehicle' ? housing : null
  /** How far this mount's gun elevates — half a pig's in a pillbox, and a
   * tank's turret twice that but only upwards (lib/game/mounts.ts). */
  const barrel = emplaced ? mountBarrel(emplaced.mount, emplaced.kind) : null
  const walking = committed(core) || sheltered ? 0 : intent.walk
  // A pig at a pillbox's gun turns on the spot; one in a VEHICLE does not
  // turn at all — the hull does, and the pig comes round with it.
  const turning = committed(core) || driving || (sheltered && !emplaced) ? 0 : intent.turn
  // The SIGHTS are a different control set, not a locked one. The one thing
  // the aim view does take away is the JUMP: the exe routes input through its
  // own branch while the aim bit is down (0x4928dc).
  if (sights.scoped(state.holding)) state.jumpRequested = false

  // Down the sights the turn drives the SCOPE, and the tremor's other axis
  // turns the pig — both come back out of the sights as one number, so the
  // camera, the model and the shot read it off the heading and cannot
  // disagree (lib/game/sights.ts).
  const scoping = sights.scoped(state.holding) && attack.firing() === null
  const swung = sights.turnStep({
    holding: state.holding,
    committed: committed(core),
    firing: attack.firing() !== null,
    turning,
    barrel,
    delta
  })

  state.loco.x = acting.position.x
  state.loco.z = acting.position.z
  state.loco.heading = acting.heading + aimRadians(swung)
  // The WOUND rides the drive: the stride, the run cycle and the unarmed
  // stand all key on it (lib/game/locomotion.ts, WOUND_SPEED). Written
  // every frame because a mine can move the band mid-walk.
  state.loco.wounded = woundBand(acting.health)
  state.loco.armed = state.holding !== null
  updateLocomotion(
    state.loco,
    query,
    { walk: walking, turn: scoping ? 0 : turning, jump: sheltered ? false : state.jumpRequested },
    delta,
    // The squad is in the way too: every pig but the acting one, as the body
    // its own spawn marker measured (lib/game/obstacles).
    //
    // **WALKING ONLY.** A body in the air has the map's objects in its way
    // and nothing else — another pig is something to knock over up there, not
    // something to stop at, and holding a flyer off at 2·PIG_RADIUS is what
    // makes the contact unreachable (lib/game/tumble.ts, `around`). The same
    // call serves both states, so the choice is here: this is the pig's OWN
    // jump as much as it is a knock, and the two must not behave differently.
    state.loco.airborne === null
      ? withPigs(
          scenery.obstacles,
          everyone()
            .filter((pig) => pig !== acting)
            .map((pig) => ({ ...pig.position })),
          { x: state.loco.x, y: state.loco.y, z: state.loco.z }
        )
      : scenery.obstacles
  )
  // …and in the air it BOWLS OVER whoever it lands on, its own jump included
  // (lib/game/tumble.ts `barge`).
  if (state.loco.airborne !== null) tumbles.barge(acting, state.loco.heading)
  state.jumpRequested = false
  // …and the DOOR overrules all of it. The exe adds its own step to the body's
  // position every frame the clip runs (0x46e1a1), after the movement update
  // and regardless of what the ground said, which is what carries the pig into
  // the middle and back up out of it (lib/game/doorway.ts).
  if (state.carry && !advanceCarry(state.carry, state.loco, delta)) state.carry = null
  // **IN THE WATER THE WEAPON GOES AWAY.** Play: "в воде оружие убирается пока
  // не вылезешь — у нас нет." Play's rule and NOT a reading: the holster proper
  // is `Pig::HoldWeapon(0)` (0x469090, whose refusal prints "Forced holstering
  // cos pig not in normal mode"), and none of its nine callers tests the water
  // — nor does `Pig::MayAct`, nor anything else on the weapon path, which has
  // no `IsInWater` call in it at all. So this is where play's word stands in
  // for a read that came up empty.
  //
  // It is not put BACK: swimming out leaves the pig empty-handed and choosing
  // again is the player's business, which is what "пока не вылезешь" asks for.
  // A blow already in flight is left alone — clearing the hand mid-shot would
  // strand the sequence that is holding the turn open.
  //
  // A WEAPON, and only a weapon: SKIP TURN and its neighbours go in the hands
  // the same way but are not something a pig could drop in the water, and
  // taking one away mid-swim would leave the turn unendable.
  const armed = ['melee', 'gun', 'lob', 'charge'].includes(weaponLayer(acting.holding))
  if (state.loco.swimming && armed && !committed(core)) acting.holding = null
  // A pig going THROUGH a door is not being driven and is still MOVING: the
  // clip carries it, so its position follows `loco` for the whole of the glide.
  // Only one that is actually inside stops — it is not on the map at all then.
  if (indoors.inside(acting) === null) {
    game.moveCurrentPig(state.loco.x, state.loco.y, state.loco.z, state.loco.heading)
  } else if (driving && !committed(core)) {
    driveHull(core, acting, driving, delta)
  } else if (emplaced) {
    // …and one at a gun turns where it sits: the heading follows, the
    // POSITION is the building's and stays exactly where the door put it.
    game.moveCurrentPig(
      acting.position.x,
      acting.position.y,
      acting.position.z,
      state.loco.heading
    )
  }
  // Walking INTO a crate is how one is collected; there is no button — and a
  // pig standing in a shelter is not walking into anything.
  if (!sheltered) scenery.collect(acting)

  // …and walking onto a MINE is how one is found. Every pig, not just the one
  // being driven — the exe asks it in the per-pig ground update — and only with
  // its feet DOWN: the tile under a pig in the air is not the tile it is
  // standing on (`[pig+0x382]`, lib/game/mines.ts). The trigger is one-shot, so
  // standing on the spot is safe once it has gone off, and the noise is the
  // whole warning the player gets.
  for (const pig of everyone()) {
    if (isDead(pig)) continue
    if (pig === acting && state.loco.airborne !== null) continue
    // …nor does one standing INSIDE a building, which is where the exe's own
    // `[pig+0x382]` (feet down) would say the same thing.
    if (indoors.inside(pig)) continue
    // …nor does a pig a blast has THROWN find one in mid-air: the tile under a
    // flying pig is not the tile it is standing on (lib/game/tumble.ts).
    if (tumbles.has(pig)) continue
    if (mines.tread(pig.position.x, pig.position.z)) {
      emit({ kind: 'mineTripped', at: { ...pig.position } })
    }
  }
  return { turning, barrel }
}

/** Seconds the acting pig has done nothing — what brings its name plate back. */
export const countStill = (core: BattleCore, delta: number): void => {
  const { intent, state } = core
  // How long the pig has done nothing: what brings its name plate back.
  // Being driven, being in the air or being pushed all count as moving.
  const busy =
    intent.walk !== 0 ||
    intent.turn !== 0 ||
    state.loco.airborne !== null ||
    Math.hypot(state.loco.x - state.stillAt.x, state.loco.z - state.stillAt.z) > 1 ||
    Math.abs(state.loco.heading - state.stillAt.heading) > 1e-3
  state.still = busy ? 0 : state.still + delta
  state.stillAt = { x: state.loco.x, z: state.loco.z, heading: state.loco.heading }
}
